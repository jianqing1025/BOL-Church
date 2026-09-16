import { useCallback, useMemo, useState } from 'react';
import type { BibleMessage } from '../meeting/chatProtocol';
import { loadReadingState } from '../services/bibleService';

export type BibleView = 'books' | 'chapters' | 'text';

/** Where the leader is reading, with a sequence so a repeat still registers. */
export interface BibleScrollPosition {
  bookId: number;
  chapter: number;
  verse: number;
  seq: number;
}

export interface BibleSync {
  open: boolean;
  view: BibleView;
  bookId: number;
  chapter: number;
  /** The leader's position in the chapter, or null before they have moved. */
  hostScroll: BibleScrollPosition | null;
  /** Full-screen reading — shared with the room, unlike text size. */
  expanded: boolean;
  toggleExpanded: () => void;
  /** Whether this participant's navigation reaches the rest of the room. */
  canLead: boolean;
  /** Report where this leader is reading, so the room can follow. */
  reportScroll: (verse: number) => void;
  /** Open at the table of contents for the whole room, or close it for yourself. */
  toggle: () => void;
  close: () => void;
  showContents: () => void;
  selectBook: (bookId: number) => void;
  selectChapter: (bookId: number, chapter: number) => void;
  /** Apply an update that arrived from the room. */
  apply: (message: BibleMessage) => void;
}

/**
 * The room's shared place in the Bible.
 *
 * Whoever leads (a host, or anyone when the room has no host) moves everyone:
 * their navigation is broadcast and applied by every client. Anyone else may
 * still turn pages in their own panel — it simply does not reach the others,
 * and the next passage the leader calls pulls them back to the group. Closing
 * the panel is likewise private, though the room's next move reopens it.
 *
 * Full-screen reading travels with the room — when the leader enlarges the
 * text everyone gets it enlarged — while text size stays personal, because one
 * is about what the group is looking at and the other is about eyesight.
 */
export function useBibleSync(send: (message: BibleMessage) => void, canLead: boolean): BibleSync {
  const initial = useMemo(loadReadingState, []);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<BibleView>('books');
  const [bookId, setBookId] = useState(initial.bookId);
  const [chapter, setChapter] = useState(initial.chapter);
  const [hostScroll, setHostScroll] = useState<BibleScrollPosition | null>(null);
  const [expanded, setExpanded] = useState(false);

  const apply = useCallback((message: BibleMessage) => {
    // A scroll only moves readers who already have the Bible open — it should
    // not pop the panel up in front of someone who closed it.
    if (message.action === 'scroll') {
      setHostScroll((prev) => ({
        bookId: message.bookId,
        chapter: message.chapter,
        verse: message.verse,
        seq: (prev?.seq ?? 0) + 1,
      }));
      return;
    }
    // Enlarging does not by itself open the Bible for someone who closed it.
    if (message.action === 'expand') {
      setExpanded(message.expanded);
      return;
    }
    setOpen(true);
    if (message.action === 'contents') {
      setView('books');
      return;
    }
    setBookId(message.bookId);
    if (message.action === 'book') {
      setView('chapters');
      return;
    }
    setChapter(message.chapter);
    setView('text');
  }, []);

  // Applied locally as well as sent: the reader should not wait on a round
  // trip, and re-applying the echo is a no-op. A member who may not lead still
  // navigates their own panel; the message just never leaves.
  const lead = useCallback((message: BibleMessage) => {
    apply(message);
    if (canLead) send(message);
  }, [apply, send, canLead]);

  const showContents = useCallback(() => lead({ type: 'bible', action: 'contents' }), [lead]);
  const selectBook = useCallback((id: number) => lead({ type: 'bible', action: 'book', bookId: id }), [lead]);
  const selectChapter = useCallback(
    (id: number, next: number) => lead({ type: 'bible', action: 'passage', bookId: id, chapter: next }),
    [lead],
  );

  // Sent, never applied locally: the leader is already looking at this spot,
  // and echoing it back into their own panel would fight their scrolling.
  const reportScroll = useCallback((verse: number) => {
    if (!canLead) return;
    send({ type: 'bible', action: 'scroll', bookId, chapter, verse });
  }, [canLead, send, bookId, chapter]);

  const toggleExpanded = useCallback(
    () => lead({ type: 'bible', action: 'expand', expanded: !expanded }),
    [lead, expanded],
  );

  const close = useCallback(() => {
    setOpen(false);
    // Leaving full screen behind would reopen the Bible covering everything.
    setExpanded(false);
  }, []);
  const toggle = useCallback(() => {
    // Opening starts the room at the table of contents; closing is private.
    // showContents opens the panel as a side effect of applying its own message.
    if (open) setOpen(false);
    else showContents();
  }, [open, showContents]);

  return {
    open, view, bookId, chapter, hostScroll, canLead, reportScroll,
    expanded, toggleExpanded,
    toggle, close, showContents, selectBook, selectChapter, apply,
  };
}
