import React, { useEffect, useState } from 'react';
import { BIBLE_BOOKS, findBibleBook, localizeBookName } from '../../../constants/bibleBooks';
import { useLocalization } from '../../../hooks/useLocalization';
import { BibleService } from '../../../services/bibleService';
import type { ScriptureItem } from '../../../meeting/agenda/types';

type Range = Pick<ScriptureItem, 'bookId' | 'chapter' | 'fromVerse' | 'toVerse'>;

const select = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none';

/** 書卷 ▾ 第 N 章 ▾ 起 ▾ 至 迄 ▾, with the verses previewed as they are chosen. */
export const ScripturePicker: React.FC<{ value: Range; onChange: (next: Range) => void }> = ({ value, onChange }) => {
  const { language, t } = useLocalization();
  const [verses, setVerses] = useState<string[]>([]);
  const book = findBibleBook(value.bookId) ?? BIBLE_BOOKS[0];

  useEffect(() => {
    let cancelled = false;
    BibleService.loadChapter(value.bookId, value.chapter)
      .then((text) => { if (!cancelled) setVerses(text); })
      .catch(() => { if (!cancelled) setVerses([]); });
    return () => { cancelled = true; };
  }, [value.bookId, value.chapter]);

  // A chapter change can leave the range past its end; pull it back in.
  useEffect(() => {
    if (!verses.length) return;
    const from = Math.min(value.fromVerse, verses.length);
    const to = Math.min(Math.max(value.toVerse, from), verses.length);
    if (from !== value.fromVerse || to !== value.toVerse) onChange({ ...value, fromVerse: from, toVerse: to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verses]);

  const numbers = (from: number) => Array.from({ length: Math.max(verses.length - from + 1, 0) }, (_, i) => from + i);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={t('meeting.agendaBook')} className={select} value={value.bookId}
          onChange={(e) => onChange({ bookId: Number(e.target.value), chapter: 1, fromVerse: 1, toVerse: 1 })}>
          {BIBLE_BOOKS.map((b) => <option key={b.id} value={b.id}>{localizeBookName(b, language)}</option>)}
        </select>
        <select className={select} value={value.chapter}
          onChange={(e) => onChange({ ...value, chapter: Number(e.target.value), fromVerse: 1, toVerse: 1 })}>
          {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{t('meeting.agendaChapter').replace('{n}', String(n))}</option>
          ))}
        </select>
        <select className={select} value={value.fromVerse}
          onChange={(e) => { const from = Number(e.target.value); onChange({ ...value, fromVerse: from, toVerse: Math.max(from, value.toVerse) }); }}>
          {numbers(1).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="text-sm text-gray-500">{t('meeting.agendaVerseTo')}</span>
        <select className={select} value={value.toVerse}
          onChange={(e) => onChange({ ...value, toVerse: Number(e.target.value) })}>
          {numbers(value.fromVerse).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {verses.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg border-l-4 border-blue-300 bg-white px-3 py-2 text-sm leading-relaxed text-gray-700">
          {verses.slice(value.fromVerse - 1, value.toVerse).map((text, i) => (
            <p key={i}><sup className="mr-1 font-semibold text-blue-600">{value.fromVerse + i}</sup>{text}</p>
          ))}
        </div>
      )}
    </div>
  );
};
