import { describe, expect, it } from 'vitest';
import { parseReference, parseReferences } from './reference';

describe('parseReference', () => {
  it('reads short names, full names, simplified characters and English', () => {
    expect(parseReference('約3:16-18')).toEqual({ bookId: 43, chapter: 3, fromVerse: 16, toVerse: 18 });
    expect(parseReference('约翰福音 3:16')).toEqual({ bookId: 43, chapter: 3, fromVerse: 16, toVerse: 16 });
    expect(parseReference('John 3:16')).toEqual({ bookId: 43, chapter: 3, fromVerse: 16, toVerse: 16 });
    expect(parseReference('1 John 1:9')).toEqual({ bookId: 62, chapter: 1, fromVerse: 9, toVerse: 9 });
    expect(parseReference('約一1:9')).toEqual({ bookId: 62, chapter: 1, fromVerse: 9, toVerse: 9 });
    expect(parseReference('林前13:4～7')).toEqual({ bookId: 46, chapter: 13, fromVerse: 4, toVerse: 7 });
    expect(parseReference('羅馬書第8章28節')).toEqual({ bookId: 45, chapter: 8, fromVerse: 28, toVerse: 28 });
  });

  it('takes a bare chapter as the whole chapter', () => {
    expect(parseReference('詩23')).toEqual({ bookId: 19, chapter: 23, fromVerse: 1, toVerse: 999 });
  });

  it('refuses what it cannot read', () => {
    expect(parseReference('hello')).toBeNull();
    expect(parseReference('創51:1')).toBeNull();
  });
});

describe('parseReferences', () => {
  it('splits several and lets a bare chapter:verse borrow the book before it', () => {
    expect(parseReferences('約3:16；羅8:28, 8:31-32')).toEqual([
      { bookId: 43, chapter: 3, fromVerse: 16, toVerse: 16 },
      { bookId: 45, chapter: 8, fromVerse: 28, toVerse: 28 },
      { bookId: 45, chapter: 8, fromVerse: 31, toVerse: 32 },
    ]);
  });
});
