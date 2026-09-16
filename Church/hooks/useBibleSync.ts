import { useCallback, useMemo, useState } from 'react';
import type { BibleMessage } from '../meeting/chatProtocol';
import { loadReadingState } from '../services/bibleService';

export type BibleView = 'books' | 'chapters' | 'text';

export interface BibleSync {
  open: boolean;
  view: BibleView;
  bookId: number;
  chapter: number;
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
 */
export function useBibleSync(send: (message: BibleMessage) => void, canLead: boolean): BibleSync {
  const initial = useMemo(loadReadingState, []);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<BibleView>('books');
  const [bookId, setBookId] = useState(initial.bookId);
  const [chapter, setChapter] = useState(initial.chapter);

  const apply = useCallback((message: BibleMessage) => {
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

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => {
    // Opening starts the room at the table of contents; closing is private.
    // showContents opens the panel as a side effect of applying its own message.
    if (open) setOpen(false);
    else showContents();
  }, [open, showContents]);

  return { open, view, bookId, chapter, toggle, close, showContents, selectBook, selectChapter, apply };
}
