import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2, Minimize2, Minus, Plus, List, ArrowDownToLine } from 'lucide-react';
import { BIBLE_BOOKS, booksOfTestament, findBibleBook, localizeBookName, type BibleBook, type Testament } from '../../constants/bibleBooks';
import { useLocalization } from '../../hooks/useLocalization';
import type { BibleScrollPosition, BibleView } from '../../hooks/useBibleSync';
import { useTimedNotice } from '../../hooks/useTimedNotice';
import {
  BibleService,
  BIBLE_FONT_STEPS,
  loadReadingState,
  saveReadingState,
  stepChapter,
} from '../../services/bibleService';

interface BiblePanelProps {
  /** Which screen the room is on: contents, chapter grid, or the text. */
  view: BibleView;
  bookId: number;
  chapter: number;
  /** Whether this participant's navigation and scrolling reach the whole room. */
  canLead: boolean;
  /** Where the leader is reading, so this panel can follow along. */
  hostScroll: BibleScrollPosition | null;
  onReportScroll: (verse: number) => void;
  expanded: boolean;
  onShowContents: () => void;
  onSelectBook: (bookId: number) => void;
  onSelectChapter: (bookId: number, chapter: number) => void;
  onToggleExpanded: () => void;
  onClose: () => void;
}

const gridButton =
  'flex items-center justify-center rounded-lg bg-gray-800 px-2 py-2.5 text-center text-sm text-gray-100 transition-colors hover:bg-blue-600 active:bg-blue-700';

/**
 * 和合本 reader for the meeting rooms: table of contents → chapter → text.
 *
 * Which passage is shown arrives as props, because it belongs to the whole
 * room. Anyone may still page around their own panel; when a host is leading,
 * their next move pulls this reader back to the group. Text size and
 * full-screen are always private — they are about eyesight, not the passage.
 */
export const BiblePanel: React.FC<BiblePanelProps> = ({
  view, bookId, chapter, canLead, hostScroll, onReportScroll,
  expanded, onShowContents, onSelectBook, onSelectChapter, onToggleExpanded, onClose,
}) => {
  const { language, t } = useLocalization();
  // Who is leading is worth saying once; leaving it there just takes a line
  // away from the text for the rest of the study.
  const showLeadNotice = useTimedNotice(!canLead);
  const initial = useMemo(loadReadingState, []);
  const [fontStep, setFontStep] = useState(initial.fontStep);
  const [testament, setTestament] = useState<Testament>(() => findBibleBook(initial.bookId)?.testament ?? 'old');
  const [verses, setVerses] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Scrolls we perform ourselves, which must not count as the reader opting out. */
  const selfScrollUntil = useRef(0);
  const lastSentVerse = useRef(0);
  const [following, setFollowing] = useState(true);

  const book = findBibleBook(bookId) ?? BIBLE_BOOKS[0];

  useEffect(() => { saveReadingState({ bookId, chapter, fontStep }); }, [bookId, chapter, fontStep]);

  // Follow the room into whichever testament the current book belongs to, so
  // the contents open on the right tab after the group jumps across the Bible.
  useEffect(() => { setTestament(book.testament); }, [book.testament]);

  // Load the passage whenever it changes. `cancelled` keeps a slow load for an
  // abandoned chapter from overwriting the one the room has moved on to.
  useEffect(() => {
    let cancelled = false;
    setVerses(null);
    setError('');
    BibleService.loadChapter(bookId, chapter)
      .then((text) => { if (!cancelled) setVerses(text); })
      .catch(() => { if (!cancelled) setError(t('bible.loadError')); });
    return () => { cancelled = true; };
  }, [bookId, chapter, t]);

  /** The verse sitting at the top of the visible area, or 0 if none is. */
  const topVisibleVerse = useCallback((): number => {
    const el = scrollRef.current;
    if (!el) return 0;
    const top = el.getBoundingClientRect().top;
    for (const node of el.querySelectorAll<HTMLElement>('[data-verse]')) {
      // 4px of slack so a verse scrolled to only a hairline still counts as past.
      if (node.getBoundingClientRect().bottom > top + 4) return Number(node.dataset.verse) || 0;
    }
    return 0;
  }, []);

  const scrollToVerse = useCallback((verse: number) => {
    const el = scrollRef.current;
    const node = el?.querySelector<HTMLElement>(`[data-verse="${verse}"]`);
    if (!el || !node) return;
    selfScrollUntil.current = Date.now() + 400;
    el.scrollTop += node.getBoundingClientRect().top - el.getBoundingClientRect().top;
  }, []);

  // A leader reports where they are; everyone else watches for opting out of
  // following. One shared listener, coalesced to one report per frame.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || view !== 'text') return;
    let frame = 0;

    const onScroll = () => {
      if (Date.now() < selfScrollUntil.current) return;
      if (!canLead) { setFollowing(false); return; }
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const verse = topVisibleVerse();
        if (verse && verse !== lastSentVerse.current) {
          lastSentVerse.current = verse;
          onReportScroll(verse);
        }
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [view, canLead, topVisibleVerse, onReportScroll]);

  // A new passage puts everyone back at the top and back in step.
  useEffect(() => {
    setFollowing(true);
    lastSentVerse.current = 0;
    selfScrollUntil.current = Date.now() + 400;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [bookId, chapter]);

  // Follow the leader, once the verses for this passage are actually rendered.
  const hostSeq = hostScroll?.seq;
  useEffect(() => {
    if (canLead || !following || !verses || !hostScroll) return;
    if (hostScroll.bookId !== bookId || hostScroll.chapter !== chapter) return;
    scrollToVerse(hostScroll.verse);
    // hostSeq is the trigger so the leader stopping on one verse still re-syncs
    // a reader who has just chosen to follow again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostSeq, following, verses]);

  const resumeFollowing = () => {
    setFollowing(true);
    if (hostScroll && hostScroll.bookId === bookId && hostScroll.chapter === chapter) {
      scrollToVerse(hostScroll.verse);
    }
  };

  const pickBook = (next: BibleBook) => {
    // A one-chapter book has nothing to choose — take the room straight to it.
    if (next.chapters === 1) onSelectChapter(next.id, 1);
    else onSelectBook(next.id);
  };

  const go = (delta: 1 | -1) => {
    const next = stepChapter(bookId, chapter, delta);
    if (next) onSelectChapter(next.bookId, next.chapter);
  };

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
          // A quarter of the width on a computer, but never narrower than it
          // used to be: on a 1280px laptop a quarter would be less than the
          // fixed width it replaced, and the passage would read worse, not
          // better. On a phone it stays a sheet over the bottom of the screen.
          : `fixed inset-x-0 bottom-0 z-20 flex h-[60vh] flex-col overflow-hidden rounded-t-2xl border-t border-white/10 bg-gray-900 shadow-2xl
             sm:static sm:z-auto sm:h-auto sm:w-1/4 sm:min-w-[24rem] sm:shrink-0 sm:rounded-none sm:border-l sm:border-t-0 sm:shadow-none`
      }
    >
      {/* Header: contents / title / text size / expand / close */}
      <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2 py-2.5">
        {view !== 'books' ? (
          <button
            type="button"
            onClick={onShowContents}
            aria-label={t('bible.contents')}
            className="flex h-8 shrink-0 items-center rounded-md px-1.5 text-gray-300 hover:bg-white/10 hover:text-white"
          >
            {view === 'text' ? <List size={17} /> : <ChevronLeft size={18} />}
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

      {/* A host is choosing the passage for everyone. Said once, then out of
          the way — it is a fact about the room, not a warning. */}
      {!canLead && showLeadNotice && (
        <p className="shrink-0 border-b border-white/10 bg-blue-950/40 px-4 py-1.5 text-center text-xs text-blue-200">
          {t('bible.followingHost')}
        </p>
      )}

      {/* Body */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
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
                onClick={() => onSelectChapter(book.id, n)}
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
                  <li key={i} data-verse={i + 1} className="flex gap-2">
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

      {/* Drifted away from the leader: one tap to rejoin them. */}
      {view === 'text' && !canLead && !following && hostScroll
        && hostScroll.bookId === bookId && hostScroll.chapter === chapter && (
        <button
          type="button"
          onClick={resumeFollowing}
          className="flex shrink-0 items-center justify-center gap-1.5 border-t border-white/10 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
        >
          <ArrowDownToLine size={15} />
          {t('bible.backToHost')}
        </button>
      )}

      {/* Chapter paging, only while reading and only for whoever leads */}
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
