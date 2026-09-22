// 集中在 router 出口判斷，而不是散在 20 幾個寫入點各加一行呼叫。
// 這樣日後新增寫入路由會自動涵蓋，不必記得補。
const SNAPSHOT_ROUTES = [
  '/api/content',
  '/api/images',
  '/api/sermons',
  '/api/daily-manna',
  '/api/admin/sermons',
];

export function shouldRebuildSnapshot(method: string, pathname: string, status: number): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  if (status >= 400) return false;
  return SNAPSHOT_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));
}
