import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { Language } from '../types';
import { BIBLE_BOOKS, booksOfTestament, findBibleBook, localizeBookName } from './bibleBooks';

const bibleDir = path.resolve(__dirname, '../public/bible');

const readBook = (id: number): Record<string, string[]> =>
  JSON.parse(readFileSync(path.join(bibleDir, `${String(id).padStart(2, '0')}.json`), 'utf8'));

describe('BIBLE_BOOKS', () => {
  it('lists all 66 books once, in canonical order', () => {
    expect(BIBLE_BOOKS).toHaveLength(66);
    expect(BIBLE_BOOKS.map((b) => b.id)).toEqual(Array.from({ length: 66 }, (_, i) => i + 1));
    expect(new Set(BIBLE_BOOKS.map((b) => b.zh)).size).toBe(66);
    expect(new Set(BIBLE_BOOKS.map((b) => b.en)).size).toBe(66);
  });

  it('splits into 39 Old Testament and 27 New Testament books', () => {
    expect(booksOfTestament('old')).toHaveLength(39);
    expect(booksOfTestament('new')).toHaveLength(27);
    expect(booksOfTestament('new')[0].zh).toBe('馬太福音');
  });

  it('declares the chapter count the imported text actually has', () => {
    for (const book of BIBLE_BOOKS) {
      const chapters = readBook(book.id);
      expect(Object.keys(chapters), `${book.zh} chapter count`).toHaveLength(book.chapters);
      // Chapters are keyed 1..n with no gaps, so the reader's grid never 404s.
      for (let n = 1; n <= book.chapters; n += 1) {
        expect(chapters[String(n)], `${book.zh} ${n}`).toBeTruthy();
      }
    }
  });
});

describe('imported 和合本 text', () => {
  it('keeps Traditional characters and strips the per-character padding', () => {
    expect(readBook(1)['1'][0]).toBe('起初，　神創造天地。');
    expect(readBook(43)['3'][15]).toContain('神愛世人');
  });

  it('leaves no ASCII spaces or markup behind', () => {
    for (const book of BIBLE_BOOKS) {
      for (const verses of Object.values(readBook(book.id))) {
        for (const verse of verses) {
          expect(verse, `${book.zh}`).not.toMatch(/[ <>]/);
          expect(verse.length, `${book.zh}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('book lookup', () => {
  it('resolves known ids and rejects the rest', () => {
    expect(findBibleBook(19)?.zh).toBe('詩篇');
    expect(findBibleBook(0)).toBeUndefined();
    expect(findBibleBook(67)).toBeUndefined();
    expect(findBibleBook(null)).toBeUndefined();
    expect(findBibleBook(undefined)).toBeUndefined();
  });

  it('localizes book names', () => {
    const john = findBibleBook(43)!;
    expect(localizeBookName(john, Language.ZH)).toBe('約翰福音');
    expect(localizeBookName(john, Language.EN)).toBe('John');
  });
});
