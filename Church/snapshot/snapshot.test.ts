import { describe, it, expect, vi } from 'vitest';
import { readSiteSnapshot, rebuildSnapshots, type SiteSnapshot, type SnapshotDeps } from './snapshot';

const sample: SiteSnapshot = {
  content: { hero: 'hi' },
  images: { 'hero.image1': '/a.jpg' },
  stats: { sermonCount: 1202, mannaCount: 3198 },
  builtAt: '2026-09-22T18:00:00.000Z',
};

function deps(overrides: Partial<SnapshotDeps> = {}): SnapshotDeps {
  return {
    kv: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) },
    buildSite: vi.fn().mockResolvedValue(sample),
    buildCatalogue: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('readSiteSnapshot', () => {
  it('KV 命中就直接回傳，完全不碰 D1', async () => {
    const d = deps({ kv: { get: vi.fn().mockResolvedValue(JSON.stringify(sample)), put: vi.fn() } });
    expect(await readSiteSnapshot(d)).toEqual(sample);
    expect(d.buildSite).not.toHaveBeenCalled();
  });

  it('KV miss 時重建並寫回', async () => {
    const d = deps();
    expect(await readSiteSnapshot(d)).toEqual(sample);
    expect(d.buildSite).toHaveBeenCalledOnce();
    expect(d.kv.put).toHaveBeenCalledWith('site:v1', JSON.stringify(sample));
  });

  it('KV 讀取丟例外時仍然回傳可用資料（KV 故障不能拖垮整站）', async () => {
    const d = deps({ kv: { get: vi.fn().mockRejectedValue(new Error('KV down')), put: vi.fn() } });
    expect(await readSiteSnapshot(d)).toEqual(sample);
  });

  it('KV 存的是壞 JSON 時當成 miss 處理', async () => {
    const d = deps({ kv: { get: vi.fn().mockResolvedValue('{壞掉的'), put: vi.fn() } });
    expect(await readSiteSnapshot(d)).toEqual(sample);
    expect(d.buildSite).toHaveBeenCalledOnce();
  });

  it('寫回 KV 失敗不影響這次的回應', async () => {
    const d = deps({ kv: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockRejectedValue(new Error('quota')) } });
    await expect(readSiteSnapshot(d)).resolves.toEqual(sample);
  });
});

describe('rebuildSnapshots', () => {
  it('兩份 key 都會重建', async () => {
    const d = deps();
    await rebuildSnapshots(d);
    expect(d.kv.put).toHaveBeenCalledWith('site:v1', expect.any(String));
    expect(d.kv.put).toHaveBeenCalledWith('catalogue:v1', expect.any(String));
  });
});
