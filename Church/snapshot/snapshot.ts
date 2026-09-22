export const SITE_KEY = 'site:v1';
export const CATALOGUE_KEY = 'catalogue:v1';

export type SiteSnapshot = {
  content: unknown;
  images: Record<string, string>;
  stats: { sermonCount: number; mannaCount: number };
  builtAt: string;
};

export type CatalogueEntry = {
  id: string;
  type: 'sermon' | 'daily-manna';
  titleEn: string;
  titleZh: string;
  date: string;
  youtubeId: string | null;
};

// 以介面注入，讓這個模組能在純 node 的 vitest 環境下測試，不需要 D1 或 KV。
export type SnapshotDeps = {
  kv: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
  buildSite: () => Promise<SiteSnapshot>;
  buildCatalogue: () => Promise<CatalogueEntry[]>;
};

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
  } catch {
    // 寫不回去不影響這次回應，下次 miss 會再試。
  }
  return built;
}

export async function readSiteSnapshot(deps: SnapshotDeps): Promise<SiteSnapshot> {
  return readOrBuild(deps, SITE_KEY, deps.buildSite);
}

export async function readCatalogue(deps: SnapshotDeps): Promise<CatalogueEntry[]> {
  return readOrBuild(deps, CATALOGUE_KEY, deps.buildCatalogue);
}

// 併發呼叫是冪等的，重複寫入無害，所以不加鎖。
export async function rebuildSnapshots(deps: SnapshotDeps): Promise<void> {
  const [site, catalogue] = await Promise.all([deps.buildSite(), deps.buildCatalogue()]);
  await Promise.all([
    deps.kv.put(SITE_KEY, JSON.stringify(site)),
    deps.kv.put(CATALOGUE_KEY, JSON.stringify(catalogue)),
  ]);
}
