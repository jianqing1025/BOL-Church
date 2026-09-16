import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2, Minimize2, Minus, Plus, List } from 'lucide-react';
import { BIBLE_BOOKS, booksOfTestament, findBibleBook, localizeBookName, type BibleBook, type Testament } from '../../constants/bibleBooks';
import { useLocalization } from '../../hooks/useLocalization';
import {
  BibleService,
  BIBLE_FONT_STEPS,
  loadReadingState,
  saveReadingState,
  stepChapter,
} from '../../services/bibleService';

type View = 'books' | 'chapters' | 'text';

interface BiblePanelProps {
  expanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
}

const gridButton =
  'flex items-center justify-center rounded-lg bg-gray-800 px-2 py-2.5 text-center text-sm text-gray-100 transition-colors hover:bg-blue-600 active:bg-blue-700';

/**
 * 和合本 reader for the meeting rooms: table of contents → chapter → text.
 *
 * Reading is private to each participant — nothing here is published to the
 * room — and the last passage and text size are remembered across sessions so
 * re-opening the Bible mid-meeting lands back on the page being studied.
 */
export const BiblePanel: React.FC<BiblePanelProps> = ({ expanded, onToggleExpanded, onClose }) => {
  const { language, t } = useLocalization();
  const initial = useMemo(loadReadingState, []);
  const [bookId, setBookId] = useState(initial.bookId);
  const [chapter, setChapter] = useState(initial.chapter);
  const [fontStep, setFontStep] = useState(initial.fontStep);
  const [view, setView] = useState<View>('text');
  const [testament, setTestament] = useState<Testament>(() => findBibleBook(initial.bookId)?.testament ?? 'old');
  const [verses, setVerses] = useState<string[] | null>(null);
  const [error, setError] = useState('');

  const book = findBibleBook(bookId) ?? BIBLE_BOOKS[0];

  useEffect(() => { saveReadingState({ bookId, chapter, fontStep }); }, [bookId, chapter, fontStep]);

  // Load the passage whenever it changes. `cancelled` keeps a slow load for an
  // abandoned chapter from overwriting the one the reader has moved on to.
  useEffect(() => {
    let cancelled = false;
    setVerses(null);
    setError('');
    BibleService.loadChapter(bookId, chapter)
      .then((text) => { if (!cancelled) setVerses(text); })
      .catch(() => { if (!cancelled) setError(t('bible.loadError')); });
    return () => { cancelled = true; };
  }, [bookId, chapter, t]);

  const openChapter = useCallback((next: number) => {
    setChapter(next);
    setView('text');
  }, []);

  const go = useCallback((delta: 1 | -1) => {
    const next = stepChapter(bookId, chapter, delta);
    if (!next) return;
    setBookId(next.bookId);
    setChapter(next.chapter);
  }, [bookId, chapter]);

  const pickBook = useCallback((next: BibleBook) => {
    setBookId(next.id);
    // A one-chapter book has nothing to choose — go straight to the text.
    if (next.chapters === 1) { openChapter(1); return; }
    setView('chapters');
  }, [openChapter]);

  const scale = BIBLE_FONT_STEPS[fontStep];
  const heading = view === 'books'
    ? t('bible.contents')
    : view === 'chapters'
      ? localizeBookName(book, language)
      : `${localizeBookName(book, language)} ${chapter}`;

  return (
    <div
      className={
        expanded
          ? 'fixed inset-0 z-30 flex flex-col bg-gray-900'
          : `fixed inset-x-0 bottom-0 z-20 flex h-[60vh] flex-col overflow-hidden rounded-t-2xl border-t border-white/10 bg-gray-900 shadow-2xl
             sm:static sm:z-auto sm:h-auto sm:w-96 sm:shrink-0 sm:rounded-none sm:border-l sm:border-t-0 sm:shadow-none`
      }
    >
      {/* Header: contents / title / text size / expand / close */}
      <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2 py-2.5">
        {view === 'text' ? (
          <button
            type="button"
            onClick={() => setView('books')}
            aria-label={t('bible.contents')}
            className="flex h-8 shrink-0 items-center rounded-md px-1.5 text-gray-300 hover:bg-white/10 hover:text-white"
          >
            <List size={17} />
          </button>
        ) : view === 'chapters' ? (
          <button
            type="button"
            onClick={() => setView('books')}
            aria-label={t('bible.contents')}
            className="flex h-8 shrink-0 items-center rounded-md px-1.5 text-gray-300 hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft size={18} />
          </button>
        ) : (
          <span className="w-2" />
        )}

        <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-100">{heading}</span>

        {view === 'text' && (
          <>
            <button
              type="button"
              onClick={() => setFontStep((s) => Math.max(0, s - 1))}
              disabled={fontStep === 0}
              aria-label={t('bible.textSmaller')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              onClick={() => setFontStep((s) => Math.min(BIBLE_FONT_STEPS.length - 1, s + 1))}
              disabled={fontStep === BIBLE_FONT_STEPS.length - 1}
              aria-label={t('bible.textLarger')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Plus size={16} />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-label={expanded ? t('bible.collapse') : t('bible.expand')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-white/10 hover:text-white"
        >
          {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('meeting.close')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'books' && (
          <div className="p-3">
            <div className="mb-3 flex rounded-lg bg-gray-800 p-1">
              {(['old', 'new'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setTestament(side)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                    testament === side ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  {t(side === 'old' ? 'bible.oldTestament' : 'bible.newTestament')}
                </button>
              ))}
            </div>
            <div className={`grid gap-1.5 ${expanded ? 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-8' : 'grid-cols-2 sm:grid-cols-3'}`}>
              {booksOfTestament(testament).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => pickBook(b)}
                  className={`${gridButton} ${b.id === bookId ? 'ring-2 ring-blue-500' : ''}`}
                >
                  <span className="truncate">{localizeBookName(b, language)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {view === 'chapters' && (
          <div className={`grid gap-1.5 p-3 ${expanded ? 'grid-cols-8 sm:grid-cols-12' : 'grid-cols-5 sm:grid-cols-6'}`}>
            {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => openChapter(n)}
                className={`${gridButton} tabular-nums ${n === chapter ? 'ring-2 ring-blue-500' : ''}`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {view === 'text' && (
          <div className={`px-4 py-4 ${expanded ? 'mx-auto max-w-3xl' : ''}`}>
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!error && !verses && <p className="text-sm text-gray-400">{t('bible.loading')}</p>}
            {verses && (
              <ol className="space-y-3 text-gray-100" style={{ fontSize: `${scale}rem`, lineHeight: 1.9 }}>
                {verses.map((verse, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      className="shrink-0 select-none pt-1 font-semibold tabular-nums text-blue-400"
                      style={{ fontSize: `${scale * 0.62}rem` }}
                    >
                      {i + 1}
                    </span>
                    <span>{verse}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* Chapter paging, only while reading */}
      {view === 'text' && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={!stepChapter(bookId, chapter, -1)}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={16} />
            {t('bible.previousChapter')}
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={!stepChapter(bookId, chapter, 1)}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
          >
            {t('bible.nextChapter')}
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default BiblePanel;
