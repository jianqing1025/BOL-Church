import { useEffect, useState } from 'react';
import { BIBLE_BOOKS, findBibleBook, loadChapter } from '../shared/bible';
import { t } from '../shared/i18n';
import type { BibleVersion } from '../shared/model';
import type { Reference } from '../shared/reference';

export interface ScriptureChoice extends Reference { version: BibleVersion }

/** Bible ▾ Book ▾ Chapter ▾ From ▾ to ▾, with the verses previewed as they are chosen (as in bolccop meeting). */
export function ScripturePicker({ value, onChange }: { value: ScriptureChoice; onChange: (next: ScriptureChoice) => void }) {
  const [verses, setVerses] = useState<string[]>([]);
  const book = findBibleBook(value.bookId) ?? BIBLE_BOOKS[0];
  /* 中文和合本: Chinese book names; King James: English — whatever the interface language. */
  const chinese = value.version !== 'kjv';
  const bookLabel = (b: (typeof BIBLE_BOOKS)[number]) => (chinese ? b.zh : b.en);

  useEffect(() => {
    let cancelled = false;
    loadChapter(value.bookId, value.chapter, value.version)
      .then((text) => { if (!cancelled) setVerses(text); })
      .catch(() => { if (!cancelled) setVerses([]); });
    return () => { cancelled = true; };
  }, [value.bookId, value.chapter, value.version]);

  // A chapter change (or "Whole chapter") can leave the range past its end; pull it back in.
  useEffect(() => {
    if (!verses.length) return;
    const from = Math.min(value.fromVerse, verses.length);
    const to = Math.min(Math.max(value.toVerse, from), verses.length);
    if (from !== value.fromVerse || to !== value.toVerse) onChange({ ...value, fromVerse: from, toVerse: to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verses, value.fromVerse, value.toVerse]);

  const numbers = (from: number) => Array.from({ length: Math.max(verses.length - from + 1, 0) }, (_, i) => from + i);

  return (
    <div className="scripture-picker">
      <div className="row">
        <select aria-label={t('editor.version')} value={value.version}
          onChange={(e) => onChange({ ...value, version: e.target.value as BibleVersion })}>
          <option value="cuv">{t('version.cuv')}</option>
          <option value="kjv">{t('version.kjv')}</option>
        </select>
      </div>
      <div className="row">
        <select aria-label={t('picker.book')} value={value.bookId}
          onChange={(e) => onChange({ ...value, bookId: Number(e.target.value), chapter: 1, fromVerse: 1, toVerse: 1 })}>
          <optgroup label={chinese ? '舊約' : 'Old Testament'}>
            {BIBLE_BOOKS.filter((b) => b.testament === 'old').map((b) => <option key={b.id} value={b.id}>{bookLabel(b)}</option>)}
          </optgroup>
          <optgroup label={chinese ? '新約' : 'New Testament'}>
            {BIBLE_BOOKS.filter((b) => b.testament === 'new').map((b) => <option key={b.id} value={b.id}>{bookLabel(b)}</option>)}
          </optgroup>
        </select>
        <select aria-label={t('picker.chapter')} value={value.chapter}
          onChange={(e) => onChange({ ...value, chapter: Number(e.target.value), fromVerse: 1, toVerse: 1 })}>
          {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{chinese ? `第 ${n} 章` : `Chapter ${n}`}</option>)}
        </select>
        <select aria-label={t('picker.from')} value={value.fromVerse}
          onChange={(e) => { const from = Number(e.target.value); onChange({ ...value, fromVerse: from, toVerse: Math.max(from, value.toVerse) }); }}>
          {numbers(1).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span className="muted">{t('picker.to')}</span>
        <select aria-label={t('picker.toVerse')} value={value.toVerse} onChange={(e) => onChange({ ...value, toVerse: Number(e.target.value) })}>
          {numbers(value.fromVerse).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button type="button" className="chip" onClick={() => onChange({ ...value, fromVerse: 1, toVerse: verses.length || 999 })}>{t('editor.wholeChapter')}</button>
      </div>
      {verses.length > 0 && (
        <div className="verse-preview">
          {verses.slice(value.fromVerse - 1, value.toVerse).map((text, i) => (
            <p key={i}><sup>{value.fromVerse + i}</sup>{text}</p>
          ))}
        </div>
      )}
    </div>
  );
}
