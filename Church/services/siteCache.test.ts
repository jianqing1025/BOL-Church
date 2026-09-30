import { describe, expect, it, vi } from 'vitest';
import { loadSiteCache, saveSiteCache, SITE_CACHE_KEY, withRetry, type CachedSite } from './siteCache';

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
  };
}

const site: CachedSite = {
  content: { header: { logo: { en: 'BOL', zh: '信望愛' } } },
  images: { 'hero.image1': '/a.jpg' },
  stats: { sermonCount: 2, mannaCount: 1 },
  recent: { sermons: [], dailyManna: [], liveBroadcasts: [] },
  announcements: [{ id: 'a1' }],
  version: 'v1',
};

describe('site cache', () => {
  it('存了再讀得回來', () => {
    const storage = memoryStorage();
    saveSiteCache(site, storage);
    expect(loadSiteCache(storage)).toEqual(site);
  });

  it('只存公開欄位：登入者的留言、代禱、帳號不會留在裝置上', () => {
    const storage = memoryStorage();
    saveSiteCache({ ...site, messages: [{ id: 'm' }], prayerRequests: [{ id: 'p' }], currentUser: { id: 'u' }, users: [{ id: 'u' }] } as never, storage);
    const saved = JSON.parse(storage.store.get(SITE_CACHE_KEY)!);
    expect(Object.keys(saved).sort()).toEqual(['announcements', 'content', 'images', 'recent', 'savedAt', 'stats', 'version']);
  });

  it('沒有快取、內容壞掉或缺欄位時回傳 null', () => {
    expect(loadSiteCache(memoryStorage())).toBeNull();
    expect(loadSiteCache(memoryStorage({ [SITE_CACHE_KEY]: '{壞' }))).toBeNull();
    expect(loadSiteCache(memoryStorage({ [SITE_CACHE_KEY]: JSON.stringify({ content: {} }) }))).toBeNull();
  });

  it('儲存空間不能用時（無痕、額度滿）不會丟例外', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    expect(() => saveSiteCache(site, broken)).not.toThrow();
    expect(loadSiteCache(broken)).toBeNull();
  });
});

describe('withRetry', () => {
  it('第一次失敗會再試一次', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce('ok');
    await expect(withRetry(fn, 1, 0)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('重試用完仍失敗就把錯誤丟出去', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'));
    await expect(withRetry(fn, 1, 0)).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
