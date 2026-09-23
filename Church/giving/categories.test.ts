import { describe, it, expect } from 'vitest';
import { DEFAULT_CATEGORIES, parseCategories, isValidCategory } from './categories';

describe('DEFAULT_CATEGORIES', () => {
  it('包含教會指定的五類，且為繁體中文', () => {
    expect(DEFAULT_CATEGORIES).toEqual(['什一', '感恩', '建堂', '宣教', '愛心']);
  });
});

describe('parseCategories', () => {
  it('解析 settings 存的 JSON 字串', () => {
    expect(parseCategories('["什一","建堂"]')).toEqual(['什一', '建堂']);
  });

  it('null 時回退到預設', () => {
    expect(parseCategories(null)).toEqual(DEFAULT_CATEGORIES);
  });

  it('壞掉的 JSON 回退到預設，不丟例外', () => {
    expect(parseCategories('{not json')).toEqual(DEFAULT_CATEGORIES);
  });

  it('空陣列回退到預設（沒有分類的奉獻頁無法運作）', () => {
    expect(parseCategories('[]')).toEqual(DEFAULT_CATEGORIES);
  });

  it('過濾掉非字串與空白項目', () => {
    expect(parseCategories('["什一", 123, "", "  ", "建堂"]')).toEqual(['什一', '建堂']);
  });

  it('null 回傳複本，非共用常數', () => {
    expect(parseCategories(null)).not.toBe(DEFAULT_CATEGORIES);
  });

  it('null 時回傳複本——變更結果不影響下次呼叫', () => {
    const first = parseCategories(null);
    first.push('污染標記');
    const second = parseCategories(null);
    expect(second).not.toContain('污染標記');
    expect(second).toEqual(DEFAULT_CATEGORIES);
  });

  it('壞掉 JSON 時回傳複本——變更結果不影響下次呼叫', () => {
    const first = parseCategories('{invalid');
    first.push('污染標記');
    const second = parseCategories('{invalid');
    expect(second).not.toContain('污染標記');
    expect(second).toEqual(DEFAULT_CATEGORIES);
  });

  it('空陣列時回傳複本——變更結果不影響下次呼叫', () => {
    const first = parseCategories('[]');
    first.push('污染標記');
    const second = parseCategories('[]');
    expect(second).not.toContain('污染標記');
    expect(second).toEqual(DEFAULT_CATEGORIES);
  });
});

describe('isValidCategory', () => {
  it('清單內的分類通過', () => {
    expect(isValidCategory('什一', DEFAULT_CATEGORIES)).toBe(true);
  });

  it('清單外的分類被拒', () => {
    expect(isValidCategory('賭金', DEFAULT_CATEGORIES)).toBe(false);
  });

  it('空值被拒', () => {
    expect(isValidCategory('', DEFAULT_CATEGORIES)).toBe(false);
  });
});
