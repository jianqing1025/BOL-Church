import type { RebuildScope } from './snapshot';

// 集中在 router 出口判斷，而不是散在 20 幾個寫入點各加一行呼叫。
// 這樣日後新增寫入路由會自動涵蓋，不必記得補。
//
// 回傳要重建哪一部分：完整清單一份就是幾千列 D1，改首頁文字不必重讀講道與每日天言。
//  - site：只有文字、圖片、公告，清單沿用 KV 裡的
//  - sermon / daily-manna：只重讀那一張表
//  - all：會同時動到兩張表（搬移、YouTube 同步、補元數據）
//
// 直播相關的路由不在這裡：探測與歸檔改動講道時，會在改動點就地重建（見 tryArchiveAndNotify、
// runProbeIfDue）。公開的「刷新直播」按鈕任何訪客都能按，以前每按一次就整份重建。
const ROUTE_SCOPES: Array<[route: string, scope: RebuildScope]> = [
  ['/api/content', 'site'],
  ['/api/images', 'site'],
  ['/api/admin/announcements', 'site'],
  ['/api/sermons', 'sermon'],
  ['/api/admin/sermons', 'sermon'],
  ['/api/daily-manna', 'daily-manna'],
  ['/api/admin/daily-manna', 'daily-manna'],
];

// 這幾條會同時動到兩張表，必須排在上面的前綴之前判斷。
const ALL_PATTERNS = [
  /^\/api\/admin\/(sermons|daily-manna)\/[^/]+\/move$/,
  /^\/api\/admin\/sermons\/sync-youtube$/,
  /^\/api\/admin\/sermons\/backfill-metadata$/,
  // 頻道設定的增刪改不動清單，只有實際同步才會
  /^\/api\/admin\/sync-channels\/[^/]+\/sync$/,
];

export function snapshotRebuildScope(method: string, pathname: string, status: number): RebuildScope | null {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  if (status >= 400) return null;
  if (ALL_PATTERNS.some(pattern => pattern.test(pathname))) return 'all';
  const match = ROUTE_SCOPES.find(([route]) => pathname === route || pathname.startsWith(`${route}/`));
  return match ? match[1] : null;
}

export function shouldRebuildSnapshot(method: string, pathname: string, status: number): boolean {
  return snapshotRebuildScope(method, pathname, status) !== null;
}
