import { describe, it, expect } from 'vitest';
import { shouldRebuildSnapshot } from './rebuildTrigger';

describe('shouldRebuildSnapshot', () => {
  it('內容管理的寫入要重建', () => {
    expect(shouldRebuildSnapshot('PUT', '/api/content', 200)).toBe(true);
    expect(shouldRebuildSnapshot('PUT', '/api/images', 200)).toBe(true);
    expect(shouldRebuildSnapshot('POST', '/api/images/upload', 200)).toBe(true);
    expect(shouldRebuildSnapshot('POST', '/api/sermons', 201)).toBe(true);
    expect(shouldRebuildSnapshot('PUT', '/api/sermons/abc', 200)).toBe(true);
    expect(shouldRebuildSnapshot('DELETE', '/api/daily-manna/abc', 200)).toBe(true);
    expect(shouldRebuildSnapshot('POST', '/api/admin/sermons/sync-youtube', 200)).toBe(true);
    expect(shouldRebuildSnapshot('POST', '/api/admin/daily-manna/abc/move', 200)).toBe(true);
    expect(shouldRebuildSnapshot('PATCH', '/api/admin/daily-manna/abc/visibility', 200)).toBe(true);
    expect(shouldRebuildSnapshot('POST', '/api/admin/sync-channels/abc/sync', 200)).toBe(true);
    expect(shouldRebuildSnapshot('POST', '/api/admin/live-stream/probe', 200)).toBe(true);
    expect(shouldRebuildSnapshot('POST', '/api/live/refresh', 200)).toBe(true);
  });

  it('讀取不重建', () => {
    expect(shouldRebuildSnapshot('GET', '/api/sermons', 200)).toBe(false);
    expect(shouldRebuildSnapshot('GET', '/api/content', 200)).toBe(false);
    expect(shouldRebuildSnapshot('HEAD', '/api/sermons', 200)).toBe(false);
    expect(shouldRebuildSnapshot('OPTIONS', '/api/sermons', 204)).toBe(false);
  });

  it('失敗的寫入不重建，否則等於白花一次成本', () => {
    expect(shouldRebuildSnapshot('PUT', '/api/content', 403)).toBe(false);
    expect(shouldRebuildSnapshot('POST', '/api/sermons', 500)).toBe(false);
  });

  it('與快照無關的寫入不重建', () => {
    expect(shouldRebuildSnapshot('POST', '/api/prayer-requests', 200)).toBe(false);
    expect(shouldRebuildSnapshot('POST', '/api/live/chat', 200)).toBe(false);
    expect(shouldRebuildSnapshot('POST', '/api/auth/login', 200)).toBe(false);
    expect(shouldRebuildSnapshot('POST', '/api/live/join', 200)).toBe(false);
  });

  it('不會被前綴相近的路徑誤觸', () => {
    expect(shouldRebuildSnapshot('POST', '/api/contentious', 200)).toBe(false);
  });
});
