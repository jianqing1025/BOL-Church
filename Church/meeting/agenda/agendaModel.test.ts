import { describe, expect, it } from 'vitest';
import {
  dayDistance, duplicateAgenda, itemLabel, localDateString, moveItem, nearestAgenda, neighbourItem,
  newAgenda, referencedFileIds, scriptureLabel, sortAgendas,
} from './agendaModel';
import type { Agenda, AgendaItem } from './types';
import { Language } from '../../types';

const agenda = (id: string, date: string, items: AgendaItem[] = [], updatedAt = 0): Agenda =>
  ({ id, title: id, date, note: '', items, updatedAt });
const text = (id: string, title = '', body = ''): AgendaItem => ({ id, kind: 'text', title, body });
const image = (id: string, fileId: string): AgendaItem => ({ id, kind: 'image', title: 'p', fileId });

describe('dates', () => {
  it('formats the local date and measures whole days', () => {
    expect(localDateString(new Date(2026, 8, 4, 23, 30))).toBe('2026-09-04');
    expect(dayDistance('2026-09-30', '2026-10-07')).toBe(7);
  });
});

describe('newAgenda', () => {
  it('starts empty, dated today', () => {
    const a = newAgenda(new Date(2026, 9, 7), '新的聚會內容');
    expect(a).toMatchObject({ title: '新的聚會內容', date: '2026-10-07', note: '', items: [] });
    expect(a.id).toMatch(/[0-9a-f-]{36}/);
  });
});

describe('sortAgendas', () => {
  it('puts the latest meeting first, then the latest edit', () => {
    const sorted = sortAgendas([agenda('a', '2026-09-23'), agenda('b', '2026-10-07', [], 1), agenda('c', '2026-10-07', [], 2)]);
    expect(sorted.map((a) => a.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('nearestAgenda', () => {
  it('picks the one dated closest to today, preferring the upcoming on a tie', () => {
    const list = [agenda('past', '2026-09-30'), agenda('next', '2026-10-04'), agenda('far', '2026-12-01')];
    expect(nearestAgenda(list, '2026-10-02')?.id).toBe('next');
    expect(nearestAgenda([], '2026-10-02')).toBeNull();
  });
});

describe('referencedFileIds', () => {
  it('collects the files every agenda still uses', () => {
    const ids = referencedFileIds([
      agenda('a', '2026-01-01', [image('1', 'f1'), text('2')]),
      agenda('b', '2026-01-02', [{ id: '3', kind: 'localVideo', title: 'v', fileId: 'f2', fileName: 'v.mp4', size: 1 }]),
    ]);
    expect([...ids].sort()).toEqual(['f1', 'f2']);
  });
});

describe('moveItem', () => {
  it('moves one entry and leaves the input alone', () => {
    const items = ['a', 'b', 'c', 'd'];
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(items, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('duplicateAgenda', () => {
  it('copies with fresh ids but shares the files', () => {
    const source = agenda('a', '2026-09-30', [image('1', 'f1')]);
    const copy = duplicateAgenda(source, new Date(2026, 9, 7), '（副本）');
    expect(copy.id).not.toBe('a');
    expect(copy.title).toBe('a（副本）');
    expect(copy.items[0].id).not.toBe('1');
    expect(copy.items[0]).toMatchObject({ kind: 'image', fileId: 'f1' });
  });
});

describe('labels', () => {
  it('names a verse range the way a reader says it', () => {
    const one = { id: 's', kind: 'scripture' as const, bookId: 43, chapter: 3, fromVerse: 16, toVerse: 16 };
    expect(scriptureLabel(one, Language.ZH)).toBe('約翰福音 3:16');
    expect(scriptureLabel({ ...one, toVerse: 17 }, Language.ZH)).toBe('約翰福音 3:16–17');
  });

  it('falls back to the first line of a text, then to the kind', () => {
    const fallbacks = { text: '文字', image: '圖片', youtube: 'YouTube', localVideo: '影片' };
    expect(itemLabel(text('1', '開場'), Language.ZH, fallbacks)).toBe('開場');
    expect(itemLabel(text('1', '', '\n  本週代禱事項\n第二行'), Language.ZH, fallbacks)).toBe('本週代禱事項');
    expect(itemLabel(text('1'), Language.ZH, fallbacks)).toBe('文字');
  });
});

describe('neighbourItem', () => {
  const items = [text('a'), text('b'), text('c')];
  it('steps through the list and stops at either end', () => {
    expect(neighbourItem(items, 'b', 1)?.id).toBe('c');
    expect(neighbourItem(items, 'b', -1)?.id).toBe('a');
    expect(neighbourItem(items, 'c', 1)).toBeNull();
    expect(neighbourItem(items, 'a', -1)).toBeNull();
  });
  it('starts from the first item when nothing is being shared', () => {
    expect(neighbourItem(items, null, 1)?.id).toBe('a');
    expect(neighbourItem(items, null, -1)).toBeNull();
  });
});
