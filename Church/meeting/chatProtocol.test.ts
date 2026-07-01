import { describe, it, expect } from 'vitest';
import { sanitizeText, sanitizeName, trimHistory, MAX_TEXT, MAX_HISTORY, type ChatMessage } from './chatProtocol';

describe('sanitizeText', () => {
  it('trims, caps at MAX_TEXT, keeps newlines, strips control chars', () => {
    expect(sanitizeText('  hi  ')).toBe('hi');
    expect(sanitizeText('a\nb')).toBe('a\nb');        // newline preserved
    expect(sanitizeText('a\u0007b')).toBe('ab');      // BEL control char stripped
    expect(sanitizeText('x'.repeat(MAX_TEXT + 50))?.length).toBe(MAX_TEXT);
  });
  it('returns null for empty / non-string', () => {
    expect(sanitizeText('   ')).toBeNull();
    expect(sanitizeText('')).toBeNull();
    expect(sanitizeText(42 as unknown)).toBeNull();
  });
});

describe('sanitizeName', () => {
  it('trims, collapses whitespace, caps at 30', () => {
    expect(sanitizeName('  An   dy ')).toBe('An dy');
    expect(sanitizeName('y'.repeat(40))?.length).toBe(30);
  });
  it('returns null for empty / non-string', () => {
    expect(sanitizeName('  ')).toBeNull();
    expect(sanitizeName(null as unknown)).toBeNull();
  });
});

describe('trimHistory', () => {
  it('keeps only the last MAX_HISTORY messages', () => {
    const make = (i: number): ChatMessage => ({ type: 'message', id: String(i), userId: 'u', name: 'n', text: 't', createdAt: i });
    const arr = Array.from({ length: MAX_HISTORY + 10 }, (_, i) => make(i));
    const trimmed = trimHistory(arr);
    expect(trimmed.length).toBe(MAX_HISTORY);
    expect(trimmed[0].id).toBe('10');
  });
});
