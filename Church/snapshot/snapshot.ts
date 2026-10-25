import { encodeCursor } from './cursor';

// v2：網站快照多了 recent（首頁、直播頁要的最新幾筆），舊的 v1 值沒有這欄，直接換 key 讓它失效。
export const SITE_KEY = 'site:v2';
export const CATALOGUE_KEY = 'catalogue:v1';
// 完整清單：只有講道頁、搜尋、詳情頁與後台才下載，一般首頁訪客不碰。
export const SERMONS_KEY = 'sermons:v1';
export const MANNA_KEY = 'manna:v1';

export type SermonKind = 'sermon' | 'daily-manna';

/** 講道／每日天言在快照裡的樣子（就是 API 回給前端的 Sermon，這裡只列會用到的欄位）。 */
export type ListEntry = {
  id: string;
  date: string;
  title: { en: string; zh: string };
  youtubeId: string | null;
  type: SermonKind;
  hidden?: boolean;
  category?: string | null;
  [field: string]: unknown;
};

export type SermonLists = { sermons: ListEntry[]; dailyManna: ListEntry[] };

export type RecentLists = { sermons: ListEntry[]; dailyManna: ListEntry[]; liveBroadcasts: ListEntry[] };

/** 網站快照中不從講道清單推導的部分：內容、圖片、公告（未到期的）。 */
export type SiteBase = { content: unknown; images: Record<string, string>; announcements: unknown[] };

export type SiteSnapshot = SiteBase & {
  stats: { sermonCount: number; mannaCount: number };
  recent: RecentLists;
  /** 重建時間，同時是前端下載完整清單時的版本號：一變就重新下載。 */
  builtAt: string;
  /** 建這份快照的程式版本。文字（content）以程式裡的翻譯為底，部署新版本後要重建才看得到。 */
  codeVersion?: string;
};

export type CatalogueEntry = {
  id: string;
  type: SermonKind;
  titleEn: string;
  titleZh: string;
  date: string;
  youtubeId: string | null;
  hidden: boolean;
};

// 以介面注入，讓這個模組能在純 node 的 vitest 環境下測試，不需要 D1 或 KV。
export type SnapshotDeps = {
  kv: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
  buildSiteBase: () => Promise<SiteBase>;
  /** 一種的完整清單，最新在前。昂貴查詢只在這裡。 */
  buildList: (kind: SermonKind) => Promise<ListEntry[]>;
  now: () => string;
  /** 目前部署的程式版本；快照是別的版本建的就當作過期。 */
  codeVersion?: string;
};

export const RECENT_SERMONS = 8;
export const RECENT_MANNA = 8;
export const RECENT_LIVE_BROADCASTS = 12;

const newestFirst = (a: ListEntry, b: ListEntry) =>
  b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

/** 首頁與直播頁要的最新幾筆；隱藏的條目不公開。 */
export function pickRecent(lists: SermonLists): RecentLists {
  const visible = (items: ListEntry[]) => items.filter(item => !item.hidden).sort(newestFirst);
  const sermons = visible(lists.sermons);
  return {
    sermons: sermons.slice(0, RECENT_SERMONS),
    dailyManna: visible(lists.dailyManna).slice(0, RECENT_MANNA),
    liveBroadcasts: sermons.filter(item => item.category === 'live-broadcast').slice(0, RECENT_LIVE_BROADCASTS),
  };
}

export function toCatalogue(lists: SermonLists): CatalogueEntry[] {
  const toEntry = (item: ListEntry): CatalogueEntry => ({
    id: item.id,
    type: item.type,
    titleEn: item.title.en,
    titleZh: item.title.zh,
    date: item.date,
    youtubeId: item.youtubeId,
    hidden: Boolean(item.hidden),
  });
  return [...lists.sermons.map(toEntry), ...lists.dailyManna.map(toEntry)];
}

function composeSite(siteBase: SiteBase, lists: SermonLists, builtAt: string, codeVersion?: string): SiteSnapshot {
  return {
    ...siteBase,
    stats: { sermonCount: lists.sermons.length, mannaCount: lists.dailyManna.length },
    recent: pickRecent(lists),
    builtAt,
    ...(codeVersion ? { codeVersion } : {}),
  };
}

async function readOrBuild<T>(
  deps: SnapshotDeps,
  key: string,
  build: () => Promise<T>,
  isCurrent: (cached: T) => boolean = () => true,
): Promise<T> {
  try {
    const raw = await deps.kv.get(key);
    if (raw) {
      const cached = JSON.parse(raw) as T;
      if (isCurrent(cached)) return cached;
    }
  } catch {
    // KV 故障或值壞掉：退回重建，成本回到改造前而已，絕不讓整站掛掉。
  }
  const built = await build();
  try {
    await deps.kv.put(key, JSON.stringify(built));
  } catch (err) {
    // 寫不回去不影響這次回應，下次 miss 會再試。但要留痕跡：
    // KV 長期寫入失敗會讓每個請求都重建，比改造前還貴。
    console.error('snapshot kv.put failed', key, err);
  }
  return built;
}

export async function readSermonList(deps: SnapshotDeps, kind: SermonKind): Promise<ListEntry[]> {
  return readOrBuild(deps, kind === 'sermon' ? SERMONS_KEY : MANNA_KEY, () => deps.buildList(kind));
}

async function readLists(deps: SnapshotDeps): Promise<SermonLists> {
  const [sermons, dailyManna] = await Promise.all([readSermonList(deps, 'sermon'), readSermonList(deps, 'daily-manna')]);
  return { sermons, dailyManna };
}

export async function readSiteSnapshot(deps: SnapshotDeps): Promise<SiteSnapshot> {
  return readOrBuild(deps, SITE_KEY, async () => {
    const [siteBase, lists] = await Promise.all([deps.buildSiteBase(), readLists(deps)]);
    return composeSite(siteBase, lists, deps.now(), deps.codeVersion);
  }, (cached) => !deps.codeVersion || cached.codeVersion === deps.codeVersion);
}

export async function readCatalogue(deps: SnapshotDeps): Promise<CatalogueEntry[]> {
  return readOrBuild(deps, CATALOGUE_KEY, async () => toCatalogue(await readLists(deps)));
}

/**
 * 要重建哪一部分。完整清單一份就是幾千列 D1，只改了首頁文字就不必重讀講道與每日天言。
 *  - site：只重建網站快照，兩份清單沿用 KV
 *  - sermon / daily-manna：只重讀那一張表
 *  - all：兩張表都重讀
 */
export type RebuildScope = 'site' | 'sermon' | 'daily-manna' | 'all';

/** 兩次寫入的範圍合起來要重建哪些。 */
export function mergeScopes(a: RebuildScope, b: RebuildScope): RebuildScope {
  if (a === b) return a;
  if (a === 'site') return b;
  if (b === 'site') return a;
  return 'all';
}

/** a 的重建是否已涵蓋 b。 */
export function scopeCovers(a: RebuildScope, b: RebuildScope): boolean {
  return mergeScopes(a, b) === a;
}

const rebuildsList = (scope: RebuildScope, kind: SermonKind) => scope === 'all' || scope === kind;

// 每張表最多查一次，各份 key 都由同一份資料推導，彼此一致。
// 併發呼叫是冪等的，重複寫入無害，所以不加鎖。
export async function rebuildSnapshots(deps: SnapshotDeps, scope: RebuildScope = 'all'): Promise<void> {
  const builtAt = deps.now();
  const freshSermons = rebuildsList(scope, 'sermon');
  const freshManna = rebuildsList(scope, 'daily-manna');
  const [siteBase, sermons, dailyManna] = await Promise.all([
    deps.buildSiteBase(),
    freshSermons ? deps.buildList('sermon') : readSermonList(deps, 'sermon'),
    freshManna ? deps.buildList('daily-manna') : readSermonList(deps, 'daily-manna'),
  ]);
  const lists = { sermons, dailyManna };
  const writes: Promise<void>[] = [];
  if (freshSermons) writes.push(deps.kv.put(SERMONS_KEY, JSON.stringify(sermons)));
  if (freshManna) {
    writes.push(deps.kv.put(MANNA_KEY, JSON.stringify(dailyManna)));
    writes.push(deps.kv.put(MANNA_INDEX_KEY, JSON.stringify(buildMannaIndex(dailyManna, builtAt))));
  }
  if (freshSermons || freshManna) writes.push(deps.kv.put(CATALOGUE_KEY, JSON.stringify(toCatalogue(lists))));
  await Promise.all(writes);
  // 網站快照最後寫：它的 builtAt 是前端下載清單的版本號，清單必須先就位。
  await deps.kv.put(SITE_KEY, JSON.stringify(composeSite(siteBase, lists, builtAt, deps.codeVersion)));
}

// ── 每日天言分頁 ──────────────────────────────────────────────────────────
// 公開的每日天言頁一頁 50 筆，只向 D1 要那 50 筆。頁碼要能直接跳（第 30 頁），
// 用 OFFSET 會把前面 1,450 筆都讀一遍，所以重建時順手記下每一頁第一筆的位置（游標），
// 查詢就從那裡往下取 50 筆。索引由完整清單推導，不另外查 D1。

export const MANNA_INDEX_KEY = 'manna-index:v1';
export const MANNA_PAGE_SIZE = 50;

export type MannaPageIndex = {
  /** 建這份索引的時間；等於當時網站快照的 builtAt，前端用它當快取版本。 */
  version: string;
  total: number;
  /** 每一頁第一筆的游標（encodeCursor 的格式）。 */
  pages: string[];
  /** 年份由新到舊，各自分頁。 */
  years: Array<{ year: string; count: number; pages: string[] }>;
};

// 必須跟 SQL 的 ORDER BY date DESC, id DESC 完全一致（逐位元比較），否則頁界會錯位。
// localeCompare 依語系排序，對 id 裡的大小寫、連字號不一定跟 SQLite 相同。
const sqlNewestFirst = (a: ListEntry, b: ListEntry) => {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
};

const pageStarts = (items: ListEntry[], pageSize: number) => {
  const starts: string[] = [];
  for (let i = 0; i < items.length; i += pageSize) starts.push(encodeCursor(items[i]));
  return starts;
};

export function buildMannaIndex(list: ListEntry[], version: string, pageSize = MANNA_PAGE_SIZE): MannaPageIndex {
  const visible = list.filter(item => !item.hidden).sort(sqlNewestFirst);
  const byYear = new Map<string, ListEntry[]>();
  for (const item of visible) {
    const year = item.date.slice(0, 4);
    if (!/^\d{4}$/.test(year)) continue;
    const bucket = byYear.get(year);
    if (bucket) bucket.push(item);
    else byYear.set(year, [item]);
  }
  return {
    version,
    total: visible.length,
    pages: pageStarts(visible, pageSize),
    years: [...byYear.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([year, items]) => ({ year, count: items.length, pages: pageStarts(items, pageSize) })),
  };
}

/** 索引不在 KV 時由 KV 裡的完整清單推導（仍然不碰 D1，除非清單也不在）。 */
export async function readMannaIndex(deps: SnapshotDeps): Promise<MannaPageIndex> {
  return readOrBuild(deps, MANNA_INDEX_KEY, async () => buildMannaIndex(await readSermonList(deps, 'daily-manna'), deps.now()));
}
