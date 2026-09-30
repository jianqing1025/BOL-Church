/**
 * 網站內容的裝置快取：上次成功載入的公開內容（文字、圖片、最新講道）存在瀏覽器，
 * 再次造訪時先用它畫出真實內容，背景再向伺服器更新，不必等網路。
 *
 * 只存公開欄位——登入者的留言、代禱、帳號資料一律不落地。
 */
export const SITE_CACHE_KEY = 'bolccop.site.v1';

export type CachedSite = {
  content: unknown;
  images: Record<string, string>;
  stats: unknown;
  recent: unknown;
  announcements: unknown[];
  version: string | null;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export function loadSiteCache(storage: StorageLike | null = defaultStorage()): CachedSite | null {
  try {
    const raw = storage?.getItem(SITE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.content || !parsed.images || !parsed.recent) return null;
    return {
      content: parsed.content,
      images: parsed.images,
      stats: parsed.stats ?? null,
      recent: parsed.recent,
      announcements: Array.isArray(parsed.announcements) ? parsed.announcements : [],
      version: typeof parsed.version === 'string' ? parsed.version : null,
    };
  } catch {
    return null;
  }
}

export function saveSiteCache(site: CachedSite, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(SITE_CACHE_KEY, JSON.stringify({
      content: site.content,
      images: site.images,
      stats: site.stats,
      recent: site.recent,
      announcements: site.announcements,
      version: site.version,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    // 無痕模式或額度已滿：只是下次不能秒開，不影響這次。
  }
}

/** 失敗時等一下再試，重試用完仍失敗就丟出最後的錯誤。 */
export async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 1500): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
