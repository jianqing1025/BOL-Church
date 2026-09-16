import type { Language } from '../types';

export type Testament = 'old' | 'new';

export interface BibleBook {
  /** 1–66, matching the file name under public/bible (01.json … 66.json). */
  id: number;
  /** 和合本 book name. */
  zh: string;
  en: string;
  chapters: number;
  testament: Testament;
}

/**
 * The 66 books of the 和合本 (Chinese Union Version, 1919), in canonical order.
 * Chapter counts are verified against the imported text by bibleBooks.test.ts —
 * they drive the chapter grid, so a wrong count shows a chapter that 404s.
 */
export const BIBLE_BOOKS: readonly BibleBook[] = [
  { id: 1, zh: '創世記', en: 'Genesis', chapters: 50, testament: 'old' },
  { id: 2, zh: '出埃及記', en: 'Exodus', chapters: 40, testament: 'old' },
  { id: 3, zh: '利未記', en: 'Leviticus', chapters: 27, testament: 'old' },
  { id: 4, zh: '民數記', en: 'Numbers', chapters: 36, testament: 'old' },
  { id: 5, zh: '申命記', en: 'Deuteronomy', chapters: 34, testament: 'old' },
  { id: 6, zh: '約書亞記', en: 'Joshua', chapters: 24, testament: 'old' },
  { id: 7, zh: '士師記', en: 'Judges', chapters: 21, testament: 'old' },
  { id: 8, zh: '路得記', en: 'Ruth', chapters: 4, testament: 'old' },
  { id: 9, zh: '撒母耳記上', en: '1 Samuel', chapters: 31, testament: 'old' },
  { id: 10, zh: '撒母耳記下', en: '2 Samuel', chapters: 24, testament: 'old' },
  { id: 11, zh: '列王紀上', en: '1 Kings', chapters: 22, testament: 'old' },
  { id: 12, zh: '列王紀下', en: '2 Kings', chapters: 25, testament: 'old' },
  { id: 13, zh: '歷代志上', en: '1 Chronicles', chapters: 29, testament: 'old' },
  { id: 14, zh: '歷代志下', en: '2 Chronicles', chapters: 36, testament: 'old' },
  { id: 15, zh: '以斯拉記', en: 'Ezra', chapters: 10, testament: 'old' },
  { id: 16, zh: '尼希米記', en: 'Nehemiah', chapters: 13, testament: 'old' },
  { id: 17, zh: '以斯帖記', en: 'Esther', chapters: 10, testament: 'old' },
  { id: 18, zh: '約伯記', en: 'Job', chapters: 42, testament: 'old' },
  { id: 19, zh: '詩篇', en: 'Psalms', chapters: 150, testament: 'old' },
  { id: 20, zh: '箴言', en: 'Proverbs', chapters: 31, testament: 'old' },
  { id: 21, zh: '傳道書', en: 'Ecclesiastes', chapters: 12, testament: 'old' },
  { id: 22, zh: '雅歌', en: 'Song of Songs', chapters: 8, testament: 'old' },
  { id: 23, zh: '以賽亞書', en: 'Isaiah', chapters: 66, testament: 'old' },
  { id: 24, zh: '耶利米書', en: 'Jeremiah', chapters: 52, testament: 'old' },
  { id: 25, zh: '耶利米哀歌', en: 'Lamentations', chapters: 5, testament: 'old' },
  { id: 26, zh: '以西結書', en: 'Ezekiel', chapters: 48, testament: 'old' },
  { id: 27, zh: '但以理書', en: 'Daniel', chapters: 12, testament: 'old' },
  { id: 28, zh: '何西阿書', en: 'Hosea', chapters: 14, testament: 'old' },
  { id: 29, zh: '約珥書', en: 'Joel', chapters: 3, testament: 'old' },
  { id: 30, zh: '阿摩司書', en: 'Amos', chapters: 9, testament: 'old' },
  { id: 31, zh: '俄巴底亞書', en: 'Obadiah', chapters: 1, testament: 'old' },
  { id: 32, zh: '約拿書', en: 'Jonah', chapters: 4, testament: 'old' },
  { id: 33, zh: '彌迦書', en: 'Micah', chapters: 7, testament: 'old' },
  { id: 34, zh: '那鴻書', en: 'Nahum', chapters: 3, testament: 'old' },
  { id: 35, zh: '哈巴谷書', en: 'Habakkuk', chapters: 3, testament: 'old' },
  { id: 36, zh: '西番雅書', en: 'Zephaniah', chapters: 3, testament: 'old' },
  { id: 37, zh: '哈該書', en: 'Haggai', chapters: 2, testament: 'old' },
  { id: 38, zh: '撒迦利亞書', en: 'Zechariah', chapters: 14, testament: 'old' },
  { id: 39, zh: '瑪拉基書', en: 'Malachi', chapters: 4, testament: 'old' },
  { id: 40, zh: '馬太福音', en: 'Matthew', chapters: 28, testament: 'new' },
  { id: 41, zh: '馬可福音', en: 'Mark', chapters: 16, testament: 'new' },
  { id: 42, zh: '路加福音', en: 'Luke', chapters: 24, testament: 'new' },
  { id: 43, zh: '約翰福音', en: 'John', chapters: 21, testament: 'new' },
  { id: 44, zh: '使徒行傳', en: 'Acts', chapters: 28, testament: 'new' },
  { id: 45, zh: '羅馬書', en: 'Romans', chapters: 16, testament: 'new' },
  { id: 46, zh: '哥林多前書', en: '1 Corinthians', chapters: 16, testament: 'new' },
  { id: 47, zh: '哥林多後書', en: '2 Corinthians', chapters: 13, testament: 'new' },
  { id: 48, zh: '加拉太書', en: 'Galatians', chapters: 6, testament: 'new' },
  { id: 49, zh: '以弗所書', en: 'Ephesians', chapters: 6, testament: 'new' },
  { id: 50, zh: '腓立比書', en: 'Philippians', chapters: 4, testament: 'new' },
  { id: 51, zh: '歌羅西書', en: 'Colossians', chapters: 4, testament: 'new' },
  { id: 52, zh: '帖撒羅尼迦前書', en: '1 Thessalonians', chapters: 5, testament: 'new' },
  { id: 53, zh: '帖撒羅尼迦後書', en: '2 Thessalonians', chapters: 3, testament: 'new' },
  { id: 54, zh: '提摩太前書', en: '1 Timothy', chapters: 6, testament: 'new' },
  { id: 55, zh: '提摩太後書', en: '2 Timothy', chapters: 4, testament: 'new' },
  { id: 56, zh: '提多書', en: 'Titus', chapters: 3, testament: 'new' },
  { id: 57, zh: '腓利門書', en: 'Philemon', chapters: 1, testament: 'new' },
  { id: 58, zh: '希伯來書', en: 'Hebrews', chapters: 13, testament: 'new' },
  { id: 59, zh: '雅各書', en: 'James', chapters: 5, testament: 'new' },
  { id: 60, zh: '彼得前書', en: '1 Peter', chapters: 5, testament: 'new' },
  { id: 61, zh: '彼得後書', en: '2 Peter', chapters: 3, testament: 'new' },
  { id: 62, zh: '約翰一書', en: '1 John', chapters: 5, testament: 'new' },
  { id: 63, zh: '約翰二書', en: '2 John', chapters: 1, testament: 'new' },
  { id: 64, zh: '約翰三書', en: '3 John', chapters: 1, testament: 'new' },
  { id: 65, zh: '猶大書', en: 'Jude', chapters: 1, testament: 'new' },
  { id: 66, zh: '啟示錄', en: 'Revelation', chapters: 22, testament: 'new' },
] as const;

export function findBibleBook(id: number | null | undefined): BibleBook | undefined {
  if (!id) return undefined;
  return BIBLE_BOOKS.find((b) => b.id === id);
}

export function localizeBookName(book: BibleBook, language: Language): string {
  return language === 'zh' ? book.zh : book.en;
}

/** Books of one testament, in canonical order. */
export function booksOfTestament(testament: Testament): BibleBook[] {
  return BIBLE_BOOKS.filter((b) => b.testament === testament);
}
