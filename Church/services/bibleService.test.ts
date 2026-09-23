import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BibleService,
  stepChapter,
  loadReadingState,
  saveReadingState,
  DEFAULT_READING_STATE,
  BIBLE_FONT_STEPS,
  DEFAULT_FONT_STEP,
  NARROW_DEFAULT_FONT_STEP,
  READING_STATE_VERSION,
  defaultFontStep,
} from './bibleService';

const book = (chapters: Record<string, string[]>) => ({
  ok: true,
  json: async () => chapters,
});

describe('BibleService.loadChapter', () => {
  beforeEach(() => BibleService.reset());
  afterEach(() => vi.unstubAllGlobals());

  it('returns the verses of the requested chapter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => book({ '1': ['起初，　神創造天地。'] })));
    await expect(BibleService.loadChapter(1, 1)).resolves.toEqual(['起初，　神創造天地。']);
  });

  it('fetches each book only once, however many chapters are read', async () => {
    const fetchMock = vi.fn(async () => book({ '1': ['a'], '2': ['b'], '3': ['c'] }));
    vi.stubGlobal('fetch', fetchMock);

    await BibleService.loadChapter(43, 1);
    await BibleService.loadChapter(43, 2);
    await BibleService.loadChapter(43, 3);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/bible/43.json');
  });

  it('shares one request between concurrent readers of the same book', async () => {
    const fetchMock = vi.fn(async () => book({ '1': ['a'], '2': ['b'] }));
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([BibleService.loadChapter(1, 1), BibleService.loadChapter(1, 2)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects chapters the book does not have, without fetching', async () => {
    const fetchMock = vi.fn(async () => book({ '1': ['a'] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(BibleService.loadChapter(65, 2)).rejects.toThrow(/no chapter 2/);
    await expect(BibleService.loadChapter(1, 0)).rejects.toThrow(/no chapter 0/);
    await expect(BibleService.loadChapter(99, 1)).rejects.toThrow(/Unknown book/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a failed download and does not cache it', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce(book({ '1': ['a'] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(BibleService.loadChapter(1, 1)).rejects.toThrow(/unavailable \(404\)/);
    await expect(BibleService.loadChapter(1, 1)).resolves.toEqual(['a']);
  });
});

describe('stepChapter', () => {
  it('moves within a book', () => {
    expect(stepChapter(1, 1, 1)).toEqual({ bookId: 1, chapter: 2 });
    expect(stepChapter(1, 2, -1)).toEqual({ bookId: 1, chapter: 1 });
  });

  it('rolls over into the next and previous book', () => {
    // 創世記 50 -> 出埃及記 1
    expect(stepChapter(1, 50, 1)).toEqual({ bookId: 2, chapter: 1 });
    // 馬太福音 1 -> 瑪拉基書 4 (the last chapter of the previous book)
    expect(stepChapter(40, 1, -1)).toEqual({ bookId: 39, chapter: 4 });
  });

  it('stops at both ends of the Bible', () => {
    expect(stepChapter(1, 1, -1)).toBeNull();
    expect(stepChapter(66, 22, 1)).toBeNull();
  });

  it('rejects an unknown book', () => {
    expect(stepChapter(0, 1, 1)).toBeNull();
    expect(stepChapter(67, 1, 1)).toBeNull();
  });
});

describe('reading position', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips where the reader left off', () => {
    saveReadingState({ bookId: 19, chapter: 23, fontStep: 3 });
    expect(loadReadingState()).toEqual({ bookId: 19, chapter: 23, fontStep: 3 });
  });

  it('starts at 創世記 1 when nothing is stored', () => {
    expect(loadReadingState()).toEqual(DEFAULT_READING_STATE);
  });

  it('falls back when the stored chapter does not exist', () => {
    // 猶大書 has one chapter; a stored chapter 9 must not render an empty page.
    store.set('bolccop.bible.reading', JSON.stringify({ bookId: 65, chapter: 9, fontStep: 2, v: READING_STATE_VERSION }));
    expect(loadReadingState()).toEqual({ ...DEFAULT_READING_STATE, fontStep: 2 });
  });

  it('keeps the passage but re-reads the size when the stored shape is older', () => {
    // The size is written on every render, so everyone already has the old
    // default on disk. Without this, changing that default would reach nobody.
    store.set('bolccop.bible.reading', JSON.stringify({ bookId: 19, chapter: 23, fontStep: 1 }));
    expect(loadReadingState()).toEqual({ bookId: 19, chapter: 23, fontStep: DEFAULT_FONT_STEP });
  });

  it('falls back on an unknown book and on corrupt JSON', () => {
    store.set('bolccop.bible.reading', JSON.stringify({ bookId: 99, chapter: 1 }));
    expect(loadReadingState()).toEqual(DEFAULT_READING_STATE);
    store.set('bolccop.bible.reading', 'not json');
    expect(loadReadingState()).toEqual(DEFAULT_READING_STATE);
  });

  it('clamps the text size into the available steps', () => {
    const stored = (fontStep: unknown) =>
      JSON.stringify({ bookId: 1, chapter: 1, fontStep, v: READING_STATE_VERSION });
    store.set('bolccop.bible.reading', stored(99));
    expect(loadReadingState().fontStep).toBe(BIBLE_FONT_STEPS.length - 1);
    store.set('bolccop.bible.reading', stored(-5));
    expect(loadReadingState().fontStep).toBe(0);
    store.set('bolccop.bible.reading', stored('big'));
    expect(loadReadingState().fontStep).toBe(DEFAULT_READING_STATE.fontStep);
  });

  it('starts two steps smaller on a phone, where the passage is a sheet not a column', () => {
    expect(defaultFontStep(true)).toBe(DEFAULT_FONT_STEP - 2);
    expect(defaultFontStep(false)).toBe(DEFAULT_FONT_STEP);
  });

  it('uses the narrow default for a phone reader with nothing stored', () => {
    expect(loadReadingState(true).fontStep).toBe(NARROW_DEFAULT_FONT_STEP);
  });

  it('uses the narrow default when the stored shape is older', () => {
    store.set('bolccop.bible.reading', JSON.stringify({ bookId: 19, chapter: 23, fontStep: 1 }));
    expect(loadReadingState(true)).toEqual({ bookId: 19, chapter: 23, fontStep: NARROW_DEFAULT_FONT_STEP });
  });

  it('keeps a size the reader chose themselves, whatever the screen', () => {
    store.set('bolccop.bible.reading', JSON.stringify({ bookId: 19, chapter: 23, fontStep: 5, v: READING_STATE_VERSION }));
    expect(loadReadingState(true).fontStep).toBe(5);
  });

  it('survives storage being unavailable', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('denied'); },
        setItem: () => { throw new Error('denied'); },
      },
    });
    expect(() => saveReadingState({ bookId: 1, chapter: 1, fontStep: 1 })).not.toThrow();
    expect(loadReadingState()).toEqual(DEFAULT_READING_STATE);
  });
});
