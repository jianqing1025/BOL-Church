// D1 免費方案的每日讀取額度用盡時，原始訊息是一長串英文技術細節加上文件連結，
// 直接丟到畫面上使用者看不懂。其餘錯誤照原樣傳出，方便排查。
export function friendlyMessage(caught: unknown): string {
  const raw = caught instanceof Error ? caught.message : '';
  if (raw.includes('daily row read limit')) return 'Database read limit reached. Resets daily.';
  return raw || 'Unexpected server error';
}
