import { findBibleBook, localizeBookName } from '../../constants/bibleBooks';
import { findMeetingRoom, localizeMeetingRoomText, MEETING_ROOMS } from '../../constants/meetingRooms';
import type { Language } from '../../types';
import type { Agenda, AgendaItem, ScriptureItem } from './types';

export const newId = (): string => crypto.randomUUID();

/** 'YYYY-MM-DD' in the device's own time zone — the date a host means. */
export function localDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function dayDistance(a: string, b: string): number {
  const day = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / 86_400_000;
  return day(b) - day(a);
}

export function newAgenda(now: Date, title: string): Agenda {
  return { id: newId(), title, date: localDateString(now), note: '', items: [], updatedAt: now.getTime() };
}

/** Latest meeting first; among the same date, the latest edit. */
export function sortAgendas(list: readonly Agenda[]): Agenda[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
}

/** The agenda for the meeting nearest today — upcoming wins a tie. */
export function nearestAgenda(list: readonly Agenda[], today: string): Agenda | null {
  let best: Agenda | null = null;
  let bestKey = Infinity;
  for (const agenda of list) {
    const distance = dayDistance(today, agenda.date);
    // Doubling and subtracting one for the future breaks ties toward it.
    const key = Math.abs(distance) * 2 - (distance > 0 ? 1 : 0);
    if (key < bestKey) { best = agenda; bestKey = key; }
  }
  return best;
}

export function referencedFileIds(list: readonly Agenda[]): Set<string> {
  const ids = new Set<string>();
  for (const agenda of list) {
    for (const item of agenda.items) {
      if ((item.kind === 'image' || item.kind === 'localVideo') && item.fileId) ids.add(item.fileId);
    }
  }
  return ids;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** A copy for another week: new ids throughout, the same stored files. */
export function duplicateAgenda(source: Agenda, now: Date, suffix: string): Agenda {
  return {
    ...source,
    id: newId(),
    title: `${source.title}${suffix}`,
    items: source.items.map((item) => ({ ...item, id: newId() })),
    updatedAt: now.getTime(),
  };
}

/** The host's own template made from an agenda: its own ids, the same stored files. */
export function saveAsTemplate(source: Agenda, now: Date): Agenda {
  return { ...duplicateAgenda(source, now, ''), template: true };
}

/** A fresh agenda from a template, dated today. */
export function fromTemplate(template: Agenda, now: Date): Agenda {
  const { template: _template, ...copy } = duplicateAgenda(template, now, '');
  return { ...copy, date: localDateString(now) };
}

/**
 * The corner of every slide: the church, then the room the agenda was made for
 * (「信望愛靈糧堂 · 禱告會」). Copies made from a room template before the room
 * was recorded are known by their note, which the template sets to the room's name.
 */
export function slideFooter(agenda: Agenda | null, church: string, language: Language): string {
  if (!agenda) return church;
  const note = agenda.note.trim();
  const room = findMeetingRoom(agenda.roomId) ?? MEETING_ROOMS.find((r) => note === r.name.zh || note === r.name.en);
  return room ? `${church} · ${localizeMeetingRoomText(room.name, language)}` : church;
}

export function scriptureLabel(item: ScriptureItem, language: Language): string {
  const book = findBibleBook(item.bookId);
  const name = book ? localizeBookName(book, language) : String(item.bookId);
  const range = item.toVerse > item.fromVerse ? `${item.fromVerse}–${item.toVerse}` : String(item.fromVerse);
  return `${name} ${item.chapter}:${range}`;
}

export interface ItemFallbacks { text: string; image: string; youtube: string; localVideo: string }

/** What a list row calls an item. */
export function itemLabel(item: AgendaItem, language: Language, fallbacks: ItemFallbacks): string {
  if (item.kind === 'scripture') return scriptureLabel(item, language);
  if (item.kind === 'text') {
    const firstLine = item.body.split('\n').map((line) => line.trim()).find(Boolean);
    return item.title.trim() || firstLine?.slice(0, 40) || fallbacks.text;
  }
  return item.title.trim() || fallbacks[item.kind];
}

/**
 * A passage as a slide: its reference on top, then each verse on its own
 * line led by its number. `verses` is the whole chapter (index 0 = verse 1).
 */
export function scriptureSlide(item: ScriptureItem, verses: readonly string[], language: Language): { title: string; body: string } {
  const lines: string[] = [];
  for (let n = item.fromVerse; n <= Math.min(item.toVerse, verses.length); n++) lines.push(`${n}　${verses[n - 1]}`);
  return { title: scriptureLabel(item, language), body: lines.join('\n') };
}

/** A title cut to `max` characters, with "..." when anything was cut. Counts characters, not UTF-16 units. */
export function shortTitle(title: string, max = 20): string {
  const chars = Array.from(title.trim());
  return chars.length > max ? `${chars.slice(0, max).join('')}...` : chars.join('');
}

/** The next date (today included) that falls on `weekday` (0 = Sunday). */
export function nextWeekday(now: Date, weekday: number): Date {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  next.setDate(next.getDate() + ((weekday - next.getDay() + 7) % 7));
  return next;
}

/** The item before or after `currentId`; with nothing current, "next" is the first. */
export function neighbourItem(items: readonly AgendaItem[], currentId: string | null, delta: 1 | -1): AgendaItem | null {
  if (currentId === null) return delta === 1 ? items[0] ?? null : null;
  const index = items.findIndex((item) => item.id === currentId);
  if (index < 0) return null;
  return items[index + delta] ?? null;
}
