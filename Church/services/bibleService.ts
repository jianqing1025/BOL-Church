import { findBibleBook } from '../constants/bibleBooks';

/** One book: chapter number (as a string key) -> verses, 1-based in order. */
export type BibleBookText = Record<string, string[]>;

const bookPath = (id: number): string => `/bible/${String(id).padStart(2, '0')}.json`;

/**
 * Loads 和合本 chapters from the static files shipped with the site.
 *
 * Books are cached after the first read and in-flight loads are shared, so
 * paging back and forth through a chapter during a meeting costs one fetch per
 * book, not one per chapter.
 */
export class BibleService {
  private static books = new Map<number, BibleBookText>();
  private static pending = new Map<number, Promise<BibleBookText>>();

  static async loadBook(bookId: number): Promise<BibleBookText> {
    const cached = this.books.get(bookId);
    if (cached) return cached;

    const inFlight = this.pending.get(bookId);
    if (inFlight) return inFlight;

    const request = (async () => {
      const response = await fetch(bookPath(bookId));
      if (!response.ok) throw new Error(`Bible book ${bookId} unavailable (${response.status})`);
      const text = (await response.json()) as BibleBookText;
      this.books.set(bookId, text);
      return text;
    })();

    this.pending.set(bookId, request);
    try {
      return await request;
    } finally {
      this.pending.delete(bookId);
    }
  }

  static async loadChapter(bookId: number, chapter: number): Promise<string[]> {
    const book = findBibleBook(bookId);
    if (!book) throw new Error(`Unknown book id ${bookId}`);
    if (chapter < 1 || chapter > book.chapters) throw new Error(`${book.en} has no chapter ${chapter}`);
    const text = await this.loadBook(bookId);
    const verses = text[String(chapter)];
    if (!verses) throw new Error(`${book.en} ${chapter} missing from the imported text`);
    return verses;
  }

  /** Test seam — drops the cache so a suite can re-exercise loading. */
  static reset(): void {
    this.books.clear();
    this.pending.clear();
  }
}

/**
 * The chapter after / before the given one, rolling over book boundaries so
 * 「下一章」 walks the whole Bible from 創世記 1 to 啟示錄 22.
 * Returns null at either end.
 */
export function stepChapter(bookId: number, chapter: number, delta: 1 | -1): { bookId: number; chapter: number } | null {
  const book = findBibleBook(bookId);
  if (!book) return null;

  const next = chapter + delta;
  if (next >= 1 && next <= book.chapters) return { bookId, chapter: next };

  const neighbour = findBibleBook(bookId + delta);
  if (!neighbour) return null;
  return { bookId: neighbour.id, chapter: delta === 1 ? 1 : neighbour.chapters };
}

/** Reader text sizes, smallest first. Index 1 is the default. */
export const BIBLE_FONT_STEPS = [0.95, 1.1, 1.3, 1.55, 1.85, 2.2] as const;

/**
 * Where the text starts: large enough to read across a room without anyone
 * reaching for the plus button, with one step further for eyes that need it.
 */
export const DEFAULT_FONT_STEP = 4;

/**
 * Two steps down on a phone.
 *
 * There the passage is a sheet over the bottom of the screen, not the quarter
 * of a window it gets on a computer — the size that reads well in a column
 * leaves barely a line and a half in a sheet.
 */
export const NARROW_DEFAULT_FONT_STEP = 2;

export function defaultFontStep(narrow: boolean): number {
  return narrow ? NARROW_DEFAULT_FONT_STEP : DEFAULT_FONT_STEP;
}

/**
 * Bumped when a stored value stops meaning what it used to.
 *
 * The size is written on every render, so by now everyone has the old default
 * on disk — changing that default would otherwise reach nobody. On an older
 * entry the passage is kept and only the size is reconsidered.
 */
export const READING_STATE_VERSION = 2;

export interface BibleReadingState {
  bookId: number;
  chapter: number;
  /** Index into BIBLE_FONT_STEPS. */
  fontStep: number;
}

export const DEFAULT_READING_STATE: BibleReadingState = { bookId: 1, chapter: 1, fontStep: DEFAULT_FONT_STEP };

const STORAGE_KEY = 'bolccop.bible.reading';

const clampStep = (step: unknown): number => {
  const n = Math.round(Number(step));
  if (!Number.isFinite(n)) return DEFAULT_FONT_STEP;
  return Math.min(Math.max(n, 0), BIBLE_FONT_STEPS.length - 1);
};

/**
 * Where the reader was last left, so re-opening the Bible during a meeting
 * returns to the passage instead of the table of contents. Anything stored that
 * no longer makes sense (a bad chapter, a hand-edited value, a cleared
 * localStorage) falls back to 創世記 1 rather than throwing.
 */
export function loadReadingState(narrow = false): BibleReadingState {
  const fallback = defaultFontStep(narrow);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_READING_STATE, fontStep: fallback };
    const parsed = JSON.parse(raw) as Partial<BibleReadingState> & { v?: number };
    const fontStep = parsed.v === READING_STATE_VERSION ? clampStep(parsed.fontStep) : fallback;
    const book = findBibleBook(Number(parsed.bookId));
    const chapter = Number(parsed.chapter);
    if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) {
      return { ...DEFAULT_READING_STATE, fontStep };
    }
    return { bookId: book.id, chapter, fontStep };
  } catch {
    return { ...DEFAULT_READING_STATE, fontStep: fallback };
  }
}

export function saveReadingState(state: BibleReadingState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, v: READING_STATE_VERSION }));
  } catch {
    /* private browsing / storage disabled — reading still works, it just won't resume */
  }
}
