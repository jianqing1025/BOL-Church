import { describe, it, expect, vi } from 'vitest';
import {
  pickRecent,
  readCatalogue,
  readSermonList,
  readSiteSnapshot,
  rebuildSnapshots,
  toCatalogue,
  buildMannaIndex,
  readMannaIndex,
  mergeScopes,
  scopeCovers,
  MANNA_PAGE_SIZE,
  type ListEntry,
  type SiteBase,
  type SnapshotDeps,
} from './snapshot';

const base: SiteBase = {
  content: { hero: 'hi' },
  images: { 'hero.image1': '/a.jpg' },
  announcements: [{ id: 'a1', title: '秋季退修會', showUntil: '2026-10-12' }],
};

const entry = (id: string, date: string, extra: Partial<ListEntry> = {}): ListEntry => ({
  id,
  date,
  title: { en: `T${id}`, zh: `標${id}` },
  youtubeId: `yt${id}`,
  type: 'sermon',
  hidden: false,
  ...extra,
});

const sermons = [entry('s1', '2026-09-20'), entry('s2', '2026-09-27', { category: 'live-broadcast' })];
const manna = [entry('m1', '2026-09-28', { type: 'daily-manna' })];

function deps(overrides: Partial<SnapshotDeps> = {}): SnapshotDeps {
  return {
    kv: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) },
    buildSiteBase: vi.fn().mockResolvedValue(base),
    buildList: vi.fn(async (kind: 'sermon' | 'daily-manna') => (kind === 'sermon' ? sermons : manna)),
    now: () => '2026-09-28T20:00:00.000Z',
    ...overrides,
  };
}

/** A KV backed by a Map, so reads see earlier writes. */
function memoryKv(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
  };
}

describe('pickRecent', () => {
  const many = Array.from({ length: 20 }, (_, i) => entry(`s${i}`, `2026-01-${String(i + 1).padStart(2, '0')}`));

  it('最新在前，各取固定筆數', () => {
    const recent = pickRecent({ sermons: many, dailyManna: many });
    expect(recent.sermons).toHaveLength(8);
    expect(recent.sermons[0].id).toBe('s19');
    expect(recent.dailyManna).toHaveLength(8);
  });

  it('隱藏的條目不會出現在公開的最新清單', () => {
    const recent = pickRecent({ sermons: [entry('a', '2026-09-01', { hidden: true }), entry('b', '2026-08-01')], dailyManna: [] });
    expect(recent.sermons.map(s => s.id)).toEqual(['b']);
  });

  it('同一天的條目以 id 決定先後，結果穩定', () => {
    const recent = pickRecent({ sermons: [entry('a', '2026-09-01'), entry('b', '2026-09-01')], dailyManna: [] });
    expect(recent.sermons.map(s => s.id)).toEqual(['b', 'a']);
  });

  it('歷史直播只取 live-broadcast 分類，最多 12 筆', () => {
    const lives = Array.from({ length: 15 }, (_, i) => entry(`l${i}`, `2026-02-${String(i + 1).padStart(2, '0')}`, { category: 'live-broadcast' }));
    const recent = pickRecent({ sermons: [...lives, entry('x', '2026-03-01')], dailyManna: [] });
    expect(recent.liveBroadcasts).toHaveLength(12);
    expect(recent.liveBroadcasts.every(s => s.category === 'live-broadcast')).toBe(true);
  });
});

describe('toCatalogue', () => {
  it('把兩份清單轉成搜尋目錄的扁平欄位', () => {
    expect(toCatalogue({ sermons: [sermons[0]], dailyManna: manna })).toEqual([
      { id: 's1', type: 'sermon', titleEn: 'Ts1', titleZh: '標s1', date: '2026-09-20', youtubeId: 'yts1', hidden: false },
      { id: 'm1', type: 'daily-manna', titleEn: 'Tm1', titleZh: '標m1', date: '2026-09-28', youtubeId: 'ytm1', hidden: false },
    ]);
  });
});

describe('readSiteSnapshot', () => {
  it('KV 命中就直接回傳，完全不碰 D1', async () => {
    const cached = { ...base, stats: { sermonCount: 2, mannaCount: 1 }, recent: pickRecent({ sermons, dailyManna: manna }), builtAt: 'x' };
    const d = deps({ kv: memoryKv({ 'site:v2': JSON.stringify(cached) }) });
    expect(await readSiteSnapshot(d)).toEqual(cached);
    expect(d.buildSiteBase).not.toHaveBeenCalled();
    expect(d.buildList).not.toHaveBeenCalled();
  });

  it('KV miss 時重建：統計與最新清單由完整清單算出，並寫回', async () => {
    const kv = memoryKv();
    const d = deps({ kv });
    const site = await readSiteSnapshot(d);
    expect(site.stats).toEqual({ sermonCount: 2, mannaCount: 1 });
    expect(site.recent.sermons.map(s => s.id)).toEqual(['s2', 's1']);
    expect(site.recent.liveBroadcasts.map(s => s.id)).toEqual(['s2']);
    expect(site.builtAt).toBe('2026-09-28T20:00:00.000Z');
    expect(kv.store.has('site:v2')).toBe(true);
  });

  it('重建網站快照時沿用 KV 裡已有的完整清單，不重查 D1', async () => {
    const d = deps({ kv: memoryKv({ 'sermons:v1': JSON.stringify(sermons), 'manna:v1': JSON.stringify(manna) }) });
    await readSiteSnapshot(d);
    expect(d.buildList).not.toHaveBeenCalled();
  });

  it('KV 讀取丟例外時仍然回傳可用資料（KV 故障不能拖垮整站）', async () => {
    const d = deps({ kv: { get: vi.fn().mockRejectedValue(new Error('KV down')), put: vi.fn() } });
    expect((await readSiteSnapshot(d)).content).toEqual(base.content);
  });

  it('KV 存的是壞 JSON 時當成 miss 處理', async () => {
    const d = deps({ kv: memoryKv({ 'site:v2': '{壞掉的' }) });
    expect((await readSiteSnapshot(d)).content).toEqual(base.content);
    expect(d.buildSiteBase).toHaveBeenCalledOnce();
  });

  it('寫回 KV 失敗不影響這次的回應', async () => {
    const d = deps({ kv: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockRejectedValue(new Error('quota')) } });
    await expect(readSiteSnapshot(d)).resolves.toMatchObject({ content: base.content });
  });
});

describe('readSermonList', () => {
  it('KV 命中就直接回傳', async () => {
    const d = deps({ kv: memoryKv({ 'manna:v1': JSON.stringify(manna) }) });
    expect(await readSermonList(d, 'daily-manna')).toEqual(manna);
    expect(d.buildList).not.toHaveBeenCalled();
  });

  it('KV miss 時只查需要的那一種', async () => {
    const d = deps();
    expect(await readSermonList(d, 'sermon')).toEqual(sermons);
    expect(d.buildList).toHaveBeenCalledTimes(1);
    expect(d.buildList).toHaveBeenCalledWith('sermon');
  });
});

describe('readCatalogue', () => {
  it('KV miss 時由完整清單推導，不另外查 D1', async () => {
    const d = deps({ kv: memoryKv({ 'sermons:v1': JSON.stringify(sermons), 'manna:v1': JSON.stringify(manna) }) });
    expect(await readCatalogue(d)).toHaveLength(3);
    expect(d.buildList).not.toHaveBeenCalled();
  });
});

describe('rebuildSnapshots', () => {
  it('所有 key 都會重建，每張表只查一次', async () => {
    const kv = memoryKv();
    const d = deps({ kv });
    await rebuildSnapshots(d);
    expect([...kv.store.keys()].sort()).toEqual(['catalogue:v1', 'manna-index:v1', 'manna:v1', 'sermons:v1', 'site:v2']);
    expect(d.buildList).toHaveBeenCalledTimes(2);
    expect(d.buildSiteBase).toHaveBeenCalledOnce();
  });

  it('網站快照帶上公告', async () => {
    const kv = memoryKv();
    await rebuildSnapshots(deps({ kv }));
    expect(JSON.parse(kv.store.get('site:v2')!).announcements).toEqual(base.announcements);
  });

  it('重建後網站快照的版本號跟著變，前端才會重新下載清單', async () => {
    let clock = 0;
    const kv = memoryKv();
    const d = deps({ kv, now: () => `t${++clock}` });
    await rebuildSnapshots(d);
    const first = JSON.parse(kv.store.get('site:v2')!).builtAt;
    await rebuildSnapshots(d);
    expect(JSON.parse(kv.store.get('site:v2')!).builtAt).not.toBe(first);
  });
});

describe('網站快照與程式版本', () => {
  it('部署了新版本，舊版本建的快照就重建一次，讓程式裡改的文字生效', async () => {
    const kv = memoryKv({ 'site:v2': JSON.stringify({ ...base, content: { weekly: '同工週報' }, codeVersion: '2.2.92', builtAt: 'old' }) });
    const d = deps({ kv, codeVersion: '2.2.93', buildSiteBase: vi.fn().mockResolvedValue({ ...base, content: { weekly: '週報' } }) });
    const site = await readSiteSnapshot(d);
    expect(site.content).toEqual({ weekly: '週報' });
    expect(site.codeVersion).toBe('2.2.93');
    expect(JSON.parse(kv.store.get('site:v2')!).codeVersion).toBe('2.2.93');
  });

  it('同一版本的快照照常直接用，不重建', async () => {
    const kv = memoryKv({ 'site:v2': JSON.stringify({ ...base, codeVersion: '2.2.93', builtAt: 'cached' }) });
    const d = deps({ kv, codeVersion: '2.2.93' });
    expect((await readSiteSnapshot(d)).builtAt).toBe('cached');
    expect(d.buildSiteBase).not.toHaveBeenCalled();
  });

  it('後台寫入觸發的重建也記下版本', async () => {
    const kv = memoryKv();
    await rebuildSnapshots(deps({ kv, codeVersion: '2.2.93' }));
    expect(JSON.parse(kv.store.get('site:v2')!).codeVersion).toBe('2.2.93');
  });
});

describe('rebuildSnapshots 的範圍', () => {
  const cached = () => memoryKv({ 'sermons:v1': JSON.stringify(sermons), 'manna:v1': JSON.stringify(manna) });

  it('site：只改了文字、圖片或公告，兩份清單沿用 KV，不查 D1', async () => {
    const kv = cached();
    const d = deps({ kv });
    await rebuildSnapshots(d, 'site');
    expect(d.buildList).not.toHaveBeenCalled();
    expect(d.buildSiteBase).toHaveBeenCalledOnce();
    expect(kv.put.mock.calls.map(([key]) => key)).toEqual(['site:v2']);
    expect(JSON.parse(kv.store.get('site:v2')!).stats).toEqual({ sermonCount: 2, mannaCount: 1 });
  });

  it('sermon：只重讀講道，每日天言沿用 KV', async () => {
    const kv = cached();
    const d = deps({ kv });
    await rebuildSnapshots(d, 'sermon');
    expect(d.buildList).toHaveBeenCalledTimes(1);
    expect(d.buildList).toHaveBeenCalledWith('sermon');
    expect(kv.put.mock.calls.map(([key]) => key).sort()).toEqual(['catalogue:v1', 'sermons:v1', 'site:v2']);
  });

  it('daily-manna：只重讀每日天言，並且更新分頁索引', async () => {
    const kv = cached();
    const d = deps({ kv });
    await rebuildSnapshots(d, 'daily-manna');
    expect(d.buildList).toHaveBeenCalledTimes(1);
    expect(d.buildList).toHaveBeenCalledWith('daily-manna');
    expect(kv.put.mock.calls.map(([key]) => key).sort()).toEqual(['catalogue:v1', 'manna-index:v1', 'manna:v1', 'site:v2']);
  });

  it('KV 裡沒有要沿用的清單時，照樣從 D1 補上', async () => {
    const kv = memoryKv();
    const d = deps({ kv });
    await rebuildSnapshots(d, 'site');
    expect(d.buildList).toHaveBeenCalledTimes(2);
    expect(kv.store.has('site:v2')).toBe(true);
  });

  it('分頁索引的版本就是這次網站快照的 builtAt，前端拿它當快取版本', async () => {
    const kv = memoryKv();
    await rebuildSnapshots(deps({ kv, now: () => 'T1' }), 'all');
    expect(JSON.parse(kv.store.get('manna-index:v1')!).version).toBe('T1');
    expect(JSON.parse(kv.store.get('site:v2')!).builtAt).toBe('T1');
  });
});

describe('mergeScopes / scopeCovers', () => {
  it('site 被任何範圍涵蓋；兩張不同的表合起來是 all', () => {
    expect(mergeScopes('site', 'sermon')).toBe('sermon');
    expect(mergeScopes('daily-manna', 'site')).toBe('daily-manna');
    expect(mergeScopes('sermon', 'daily-manna')).toBe('all');
    expect(mergeScopes('sermon', 'sermon')).toBe('sermon');
    expect(mergeScopes('all', 'site')).toBe('all');
  });

  it('涵蓋：重建 a 是否已包含 b 要的', () => {
    expect(scopeCovers('all', 'daily-manna')).toBe(true);
    expect(scopeCovers('sermon', 'site')).toBe(true);
    expect(scopeCovers('sermon', 'daily-manna')).toBe(false);
    expect(scopeCovers('site', 'sermon')).toBe(false);
  });
});

describe('buildMannaIndex', () => {
  const m = (id: string, date: string, extra: Partial<ListEntry> = {}) => entry(id, date, { type: 'daily-manna', ...extra });

  it('每一頁記下第一筆的游標，最新在前，隱藏的不算', () => {
    const list = Array.from({ length: 120 }, (_, i) => m(`m${String(i).padStart(3, '0')}`, `2026-0${1 + Math.floor(i / 40)}-${String(1 + (i % 28)).padStart(2, '0')}`));
    list.push(m('hidden', '2027-01-01', { hidden: true }));
    const index = buildMannaIndex(list, 'v1');
    expect(index.total).toBe(120);
    expect(index.pages).toHaveLength(Math.ceil(120 / MANNA_PAGE_SIZE));
    expect(index.pages[0].startsWith('2026-03-')).toBe(true);
    expect(index.pages.some(cursor => cursor.includes('hidden'))).toBe(false);
  });

  it('年份由新到舊，各自分頁與計數', () => {
    const list = [
      ...Array.from({ length: 60 }, (_, i) => m(`a${i}`, '2025-05-05')),
      ...Array.from({ length: 3 }, (_, i) => m(`b${i}`, '2026-01-01')),
    ];
    const index = buildMannaIndex(list, 'v1');
    expect(index.years.map(y => [y.year, y.count, y.pages.length])).toEqual([['2026', 3, 1], ['2025', 60, 2]]);
  });

  it('同一天以 id 逐位元由大到小排，跟 SQL 的 ORDER BY date DESC, id DESC 一致', () => {
    // localeCompare 會把 'a' 排在 'B' 前面；SQLite 逐位元比較時 'B'(0x42) < 'a'(0x61)
    const index = buildMannaIndex([m('B', '2026-01-01'), m('a', '2026-01-01')], 'v1', 1);
    expect(index.pages).toEqual(['2026-01-01_a', '2026-01-01_B']);
  });

  it('沒有任何可見條目時是空的索引', () => {
    const index = buildMannaIndex([m('x', '2026-01-01', { hidden: true })], 'v1');
    expect(index).toEqual({ version: 'v1', total: 0, pages: [], years: [] });
  });
});

describe('readMannaIndex', () => {
  it('KV 沒有索引時由 KV 裡的完整清單推導，不查 D1', async () => {
    const kv = memoryKv({ 'manna:v1': JSON.stringify(manna) });
    const d = deps({ kv });
    const index = await readMannaIndex(d);
    expect(index.total).toBe(1);
    expect(d.buildList).not.toHaveBeenCalled();
    expect(kv.store.has('manna-index:v1')).toBe(true);
  });
});
