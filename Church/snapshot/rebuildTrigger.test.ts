import { describe, it, expect } from 'vitest';
import { shouldRebuildSnapshot, snapshotRebuildScope } from './rebuildTrigger';

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
    expect(shouldRebuildSnapshot('POST', '/api/admin/announcements', 201)).toBe(true);
    expect(shouldRebuildSnapshot('DELETE', '/api/admin/announcements/abc', 200)).toBe(true);
    expect(shouldRebuildSnapshot('GET', '/api/admin/announcements', 200)).toBe(false);
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

  it('直播的探測與刷新不從路由重建：改動講道時在改動點就地重建', () => {
    // 公開按鈕，任何訪客都能按；以前每按一次就整份重建
    expect(shouldRebuildSnapshot('POST', '/api/live/refresh', 200)).toBe(false);
    expect(shouldRebuildSnapshot('POST', '/api/admin/live-stream/probe', 200)).toBe(false);
    expect(shouldRebuildSnapshot('PUT', '/api/admin/live-stream/config', 200)).toBe(false);
  });

  it('頻道設定的增刪改不動清單，只有實際同步才重建', () => {
    expect(shouldRebuildSnapshot('POST', '/api/admin/sync-channels', 200)).toBe(false);
    expect(shouldRebuildSnapshot('PUT', '/api/admin/sync-channels/abc', 200)).toBe(false);
    expect(shouldRebuildSnapshot('DELETE', '/api/admin/sync-channels/abc', 200)).toBe(false);
    expect(shouldRebuildSnapshot('POST', '/api/admin/sync-channels/abc/test', 200)).toBe(false);
  });

  it('不會被前綴相近的路徑誤觸', () => {
    expect(shouldRebuildSnapshot('POST', '/api/contentious', 200)).toBe(false);
  });
});

describe('snapshotRebuildScope', () => {
  it('文字、圖片、公告只重建網站快照，清單沿用', () => {
    expect(snapshotRebuildScope('PUT', '/api/content', 200)).toBe('site');
    expect(snapshotRebuildScope('POST', '/api/images/upload', 200)).toBe('site');
    expect(snapshotRebuildScope('DELETE', '/api/admin/announcements/abc', 200)).toBe('site');
  });

  it('只動一張表的寫入只重讀那張表', () => {
    expect(snapshotRebuildScope('PUT', '/api/sermons/abc', 200)).toBe('sermon');
    expect(snapshotRebuildScope('PATCH', '/api/admin/sermons/abc/visibility', 200)).toBe('sermon');
    expect(snapshotRebuildScope('POST', '/api/daily-manna', 201)).toBe('daily-manna');
    expect(snapshotRebuildScope('PATCH', '/api/admin/daily-manna/abc/visibility', 200)).toBe('daily-manna');
  });

  it('跨兩張表的寫入重建全部', () => {
    expect(snapshotRebuildScope('POST', '/api/admin/sermons/abc/move', 200)).toBe('all');
    expect(snapshotRebuildScope('POST', '/api/admin/daily-manna/abc/move', 200)).toBe('all');
    expect(snapshotRebuildScope('POST', '/api/admin/sermons/sync-youtube', 200)).toBe('all');
    expect(snapshotRebuildScope('POST', '/api/admin/sermons/backfill-metadata', 200)).toBe('all');
    expect(snapshotRebuildScope('POST', '/api/admin/sync-channels/abc/sync', 200)).toBe('all');
  });
});
