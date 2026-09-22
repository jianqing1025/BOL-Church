export type Cursor = { date: string; id: string };

// date 是 YYYY-MM-DD，不含底線；id 可能含底線。
// 所以以「第一個底線」為界：左邊是 date，右邊全部是 id。
export function encodeCursor(entry: Cursor): string {
  return `${entry.date}_${entry.id}`;
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  const separator = raw.indexOf('_');
  if (separator <= 0 || separator === raw.length - 1) return null;
  return { date: raw.slice(0, separator), id: raw.slice(separator + 1) };
}
