// 分頁頁碼序列（業界標準：邊界 + 當前頁附近 + 省略符）
//
// 規則：
//   - totalPages ≤ 7 → 全部展開
//   - 否則合併：{1, 2} ∪ {totalPages-1, totalPages} ∪ {current-2…current+2}
//   - 不連續處插入 'gap'（…）
//   - 槽位約 9-11 個，永遠保留邊界，重心圍繞當前頁
//
// 例 (total=74)：
//   current=1  → 1 2 3 … 73 74
//   current=5  → 1 2 3 4 5 6 7 … 73 74
//   current=37 → 1 2 … 35 36 37 38 39 … 73 74
//   current=70 → 1 2 … 68 69 70 71 72 73 74
//   current=74 → 1 2 … 72 73 74
export function buildPaginationNumbers(totalPages: number, currentPage: number): (number | 'gap')[] {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const set = new Set<number>();
  const add = (n: number) => { if (n >= 1 && n <= totalPages) set.add(n); };

  // 邊界各 2 頁
  add(1); add(2);
  add(totalPages - 1); add(totalPages);
  // 當前頁 ± 2
  for (let i = currentPage - 2; i <= currentPage + 2; i++) add(i);

  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('gap');
    out.push(sorted[i]);
  }
  return out;
}
