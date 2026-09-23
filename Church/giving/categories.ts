/** 奉獻用途分類。存在 settings 表的 `giving.categories`，此處為 fallback 與解析邏輯。 */

export const DEFAULT_CATEGORIES = ['什一', '感恩', '建堂', '宣教', '愛心'] as const;

/** settings 表中存放分類清單的 key */
export const CATEGORIES_SETTING_KEY = 'giving.categories';

/**
 * 解析 settings.value_json。任何異常都回退到預設 ——
 * 奉獻頁沒有分類就無法運作，寧可用預設也不能讓頁面掛掉。
 */
export function parseCategories(raw: string | null | undefined): string[] {
  if (!raw) return [...DEFAULT_CATEGORIES];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
  if (!Array.isArray(parsed)) return [...DEFAULT_CATEGORIES];
  const cleaned = parsed
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0);
  return cleaned.length > 0 ? cleaned : [...DEFAULT_CATEGORIES];
}

export function isValidCategory(value: string, categories: readonly string[]): boolean {
  return value.length > 0 && categories.includes(value);
}
