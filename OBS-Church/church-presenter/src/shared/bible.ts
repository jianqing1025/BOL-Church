import { BIBLE_BOOKS, findBibleBook, type BibleBook } from '@church/constants/bibleBooks';
import type { BibleVersion } from './model';

/**
 * Two Bibles ship beside the pages, one file per book (01.json … 66.json):
 * 和合本 from the church website (./bible) and the King James Version (./bible-en).
 * One fetch per book, then cached.
 */

export { BIBLE_BOOKS, findBibleBook, type BibleBook };

type BookText = Record<string, string[]>;
const books = new Map<string, Promise<BookText>>();

const folder = (version: BibleVersion) => (version === 'kjv' ? 'bible-en' : 'bible');

function loadBook(bookId: number, version: BibleVersion): Promise<BookText> {
  const key = `${version}:${bookId}`;
  let book = books.get(key);
  if (!book) {
    book = fetch(new URL(`./${folder(version)}/${String(bookId).padStart(2, '0')}.json`, document.baseURI)).then((res) => {
      if (!res.ok) throw new Error(`Bible book ${bookId} (${version}) failed to load (${res.status})`);
      return res.json() as Promise<BookText>;
    });
    book.catch(() => books.delete(key));
    books.set(key, book);
  }
  return book;
}

export async function loadChapter(bookId: number, chapter: number, version: BibleVersion = 'cuv'): Promise<string[]> {
  const text = await loadBook(bookId, version);
  const verses = text[String(chapter)];
  if (!verses) throw new Error(`${bookName(bookId, version)} ${chapter}: chapter not found`);
  return verses;
}

/** The book's name in the version's language: 「約翰福音」 or "John". */
export function bookName(bookId: number, version: BibleVersion = 'cuv'): string {
  const book = findBibleBook(bookId);
  if (!book) return String(bookId);
  return version === 'kjv' ? book.en : book.zh;
}

/** 「約翰福音 3:16–17」 or "John 3:16–17". */
export function scriptureLabel(bookId: number, chapter: number, from: number, to: number, version: BibleVersion = 'cuv'): string {
  return `${bookName(bookId, version)} ${chapter}:${to > from ? `${from}–${to}` : from}`;
}

/** Each verse as its own paragraph, led by its number: 「16　神愛世人…」. */
export function verseParagraphs(verses: readonly string[], from: number, to: number, version: BibleVersion = 'cuv'): string[] {
  const gap = version === 'kjv' ? ' ' : '　';
  const out: string[] = [];
  for (let n = from; n <= Math.min(to, verses.length); n++) out.push(`${n}${gap}${verses[n - 1]}`);
  return out;
}
