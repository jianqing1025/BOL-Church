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

function composeSite(siteBase: SiteBase, lists: SermonLists, builtAt: string): SiteSnapshot {
  return {
    ...siteBase,
    stats: { sermonCount: lists.sermons.length, mannaCount: lists.dailyManna.length },
    recent: pickRecent(lists),
    builtAt,
  };
}

async function readOrBuild<T>(
  deps: SnapshotDeps,
  key: string,
  build: () => Promise<T>,
): Promise<T> {
  try {
    const raw = await deps.kv.get(key);
    if (raw) return JSON.parse(raw) as T;
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
    return composeSite(siteBase, lists, deps.now());
  });
}

export async function readCatalogue(deps: SnapshotDeps): Promise<CatalogueEntry[]> {
  return readOrBuild(deps, CATALOGUE_KEY, async () => toCatalogue(await readLists(deps)));
}

// 每張表只查一次，四份 key 都由同一份資料推導，彼此一致。
// 併發呼叫是冪等的，重複寫入無害，所以不加鎖。
export async function rebuildSnapshots(deps: SnapshotDeps): Promise<void> {
  const [siteBase, sermons, dailyManna] = await Promise.all([
    deps.buildSiteBase(),
    deps.buildList('sermon'),
    deps.buildList('daily-manna'),
  ]);
  const lists = { sermons, dailyManna };
  await Promise.all([
    deps.kv.put(SERMONS_KEY, JSON.stringify(sermons)),
    deps.kv.put(MANNA_KEY, JSON.stringify(dailyManna)),
    deps.kv.put(CATALOGUE_KEY, JSON.stringify(toCatalogue(lists))),
  ]);
  // 網站快照最後寫：它的 builtAt 是前端下載清單的版本號，清單必須先就位。
  await deps.kv.put(SITE_KEY, JSON.stringify(composeSite(siteBase, lists, deps.now())));
}
