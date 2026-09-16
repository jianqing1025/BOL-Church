import { describe, it, expect } from 'vitest';
import {
  sanitizeText,
  sanitizeName,
  sanitizeBibleMessage,
  sanitizeHostMessage,
  trimHistory,
  MAX_TEXT,
  MAX_HISTORY,
  type ChatMessage,
} from './chatProtocol';

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

describe('sanitizeBibleMessage', () => {
  it('accepts the three navigation actions', () => {
    expect(sanitizeBibleMessage({ type: 'bible', action: 'contents' }))
      .toEqual({ type: 'bible', action: 'contents' });
    expect(sanitizeBibleMessage({ type: 'bible', action: 'book', bookId: 19 }))
      .toEqual({ type: 'bible', action: 'book', bookId: 19 });
    expect(sanitizeBibleMessage({ type: 'bible', action: 'passage', bookId: 19, chapter: 23 }))
      .toEqual({ type: 'bible', action: 'passage', bookId: 19, chapter: 23 });
  });

  it('accepts a scroll position and keeps the passage it belongs to', () => {
    expect(sanitizeBibleMessage({ type: 'bible', action: 'scroll', bookId: 19, chapter: 119, verse: 176 }))
      .toEqual({ type: 'bible', action: 'scroll', bookId: 19, chapter: 119, verse: 176 });
  });

  it('rejects an unusable scroll verse', () => {
    const scroll = (verse: unknown) => sanitizeBibleMessage({ type: 'bible', action: 'scroll', bookId: 1, chapter: 1, verse });
    expect(scroll(0)).toBeNull();
    expect(scroll(-3)).toBeNull();
    expect(scroll(2.5)).toBeNull();
    expect(scroll('7')).toBeNull();
    expect(scroll(undefined)).toBeNull();
    expect(scroll(9999)).toBeNull();
  });

  it('rejects a scroll into a chapter the book does not have', () => {
    expect(sanitizeBibleMessage({ type: 'bible', action: 'scroll', bookId: 65, chapter: 2, verse: 1 })).toBeNull();
  });

  it('drops extra fields rather than relaying them to the room', () => {
    expect(sanitizeBibleMessage({ type: 'bible', action: 'contents', evil: '<script>' }))
      .toEqual({ type: 'bible', action: 'contents' });
  });

  it('rejects a chapter the book does not have', () => {
    // 猶大書 (65) has a single chapter; relaying chapter 2 would send the whole
    // room to a page that does not exist.
    expect(sanitizeBibleMessage({ type: 'bible', action: 'passage', bookId: 65, chapter: 2 })).toBeNull();
    expect(sanitizeBibleMessage({ type: 'bible', action: 'passage', bookId: 1, chapter: 0 })).toBeNull();
    expect(sanitizeBibleMessage({ type: 'bible', action: 'passage', bookId: 1, chapter: 1.5 })).toBeNull();
    expect(sanitizeBibleMessage({ type: 'bible', action: 'passage', bookId: 1, chapter: '3' })).toBeNull();
  });

  it('rejects unknown books, actions and shapes', () => {
    expect(sanitizeBibleMessage({ type: 'bible', action: 'book', bookId: 67 })).toBeNull();
    expect(sanitizeBibleMessage({ type: 'bible', action: 'book', bookId: 0 })).toBeNull();
    expect(sanitizeBibleMessage({ type: 'bible', action: 'jump', bookId: 1 })).toBeNull();
    expect(sanitizeBibleMessage({ type: 'message', text: 'hi' })).toBeNull();
    expect(sanitizeBibleMessage(null)).toBeNull();
    expect(sanitizeBibleMessage('bible')).toBeNull();
  });
});

describe('sanitizeHostMessage', () => {
  it('accepts the host commands', () => {
    expect(sanitizeHostMessage({ type: 'host', action: 'claimShare' }))
      .toEqual({ type: 'host', action: 'claimShare' });
    expect(sanitizeHostMessage({ type: 'host', action: 'mute', targetUserId: 'u1' }))
      .toEqual({ type: 'host', action: 'mute', targetUserId: 'u1' });
    expect(sanitizeHostMessage({ type: 'host', action: 'remove', targetUserId: 'u1' }))
      .toEqual({ type: 'host', action: 'remove', targetUserId: 'u1' });
  });

  it('requires a usable target for the targeted commands', () => {
    expect(sanitizeHostMessage({ type: 'host', action: 'mute' })).toBeNull();
    expect(sanitizeHostMessage({ type: 'host', action: 'mute', targetUserId: '' })).toBeNull();
    expect(sanitizeHostMessage({ type: 'host', action: 'remove', targetUserId: 42 })).toBeNull();
    expect(sanitizeHostMessage({ type: 'host', action: 'remove', targetUserId: 'x'.repeat(101) })).toBeNull();
  });

  it('rejects unknown actions and shapes', () => {
    expect(sanitizeHostMessage({ type: 'host', action: 'shutdown', targetUserId: 'u1' })).toBeNull();
    expect(sanitizeHostMessage({ type: 'bible', action: 'contents' })).toBeNull();
    expect(sanitizeHostMessage(undefined)).toBeNull();
  });
});
