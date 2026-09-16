// Message protocol shared by the ChatRoom Durable Object and the frontend.
// Pure + isomorphic (no server APIs) so both sides import the same source.

import { BIBLE_BOOKS } from '../constants/bibleBooks';

export const MAX_TEXT = 1000;
export const MAX_NAME = 30;
export const MAX_HISTORY = 100;

export interface ChatMessage {
  type: 'message';
  id: string;
  userId: string;
  name: string;
  text: string;
  createdAt: number;
}
export type SystemMessage = {
  type: 'system';
  event: 'joined' | 'left';
  name: string;
  createdAt: number;
} | {
  /** Backward compatibility for clients connected during a Worker rollout. */
  type: 'system';
  text: string;
  createdAt: number;
};
/**
 * Shared Bible navigation. Opening or turning to a passage moves everyone in
 * the room together, so a group studies the same page without reading chapter
 * numbers out loud. Text size and full-screen stay private to each reader.
 */
export type BibleMessage =
  | { type: 'bible'; action: 'contents' }
  | { type: 'bible'; action: 'book'; bookId: number }
  | { type: 'bible'; action: 'passage'; bookId: number; chapter: number }
  /**
   * Where the leader is reading within a chapter, as the verse at the top of
   * their panel — not a pixel offset, which would land somewhere else on a
   * reader using a different text size or panel width. Carries the passage so
   * a message that arrives after the room has moved on is ignored.
   */
  | { type: 'bible'; action: 'scroll'; bookId: number; chapter: number; verse: number };

/**
 * A host's commands over the other participants. Hosts are self-declared on the
 * room card — there is no separate credential — so this is a courtesy role for
 * a group that knows each other, not a security boundary. The Durable Object
 * still checks that the sender really is a host before relaying.
 */
export type HostMessage =
  | { type: 'host'; action: 'mute'; targetUserId: string }
  | { type: 'host'; action: 'remove'; targetUserId: string }
  /** Host takes the shared-picture slot: whoever else is sharing stops. */
  | { type: 'host'; action: 'claimShare' };

export interface PresenceUser {
  id: string;
  name: string;
  isHost?: boolean;
}

export interface PresenceMessage {
  type: 'presence';
  users: PresenceUser[];
}
export interface WelcomeMessage {
  type: 'welcome';
  roomId: string;
  userId: string;
  messages: ChatMessage[];
}
export type ServerMessage = ChatMessage | SystemMessage | PresenceMessage | WelcomeMessage | BibleMessage | HostMessage;

export type ClientMessage =
  | { type: 'message'; text: string }
  | BibleMessage
  | HostMessage;

/**
 * Validates a Bible navigation message from a client. The Durable Object
 * rebroadcasts to the whole room, so a bad book or chapter would push everyone
 * to a page that does not exist — it is rejected here rather than trusted.
 */
export function sanitizeBibleMessage(input: unknown): BibleMessage | null {
  if (!input || typeof input !== 'object') return null;
  const msg = input as { type?: unknown; action?: unknown; bookId?: unknown; chapter?: unknown };
  if (msg.type !== 'bible') return null;
  if (msg.action === 'contents') return { type: 'bible', action: 'contents' };

  const book = BIBLE_BOOKS.find((b) => b.id === msg.bookId);
  if (!book) return null;
  if (msg.action === 'book') return { type: 'bible', action: 'book', bookId: book.id };

  if (msg.action === 'passage' || msg.action === 'scroll') {
    const chapter = msg.chapter;
    if (typeof chapter !== 'number' || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) return null;
    if (msg.action === 'passage') return { type: 'bible', action: 'passage', bookId: book.id, chapter };

    // Verse counts are not part of the book table, so this is a sanity bound:
    // the longest chapter in the Bible (詩篇 119) has 176 verses.
    const verse = (msg as { verse?: unknown }).verse;
    if (typeof verse !== 'number' || !Number.isInteger(verse) || verse < 1 || verse > 200) return null;
    return { type: 'bible', action: 'scroll', bookId: book.id, chapter, verse };
  }
  return null;
}

/**
 * Validates a host command from a client. Whether the sender is actually a host
 * is checked separately by the Durable Object — this only checks the shape.
 */
export function sanitizeHostMessage(input: unknown): HostMessage | null {
  if (!input || typeof input !== 'object') return null;
  const msg = input as { type?: unknown; action?: unknown; targetUserId?: unknown };
  if (msg.type !== 'host') return null;
  if (msg.action === 'claimShare') return { type: 'host', action: 'claimShare' };
  if (msg.action !== 'mute' && msg.action !== 'remove') return null;
  const target = msg.targetUserId;
  if (typeof target !== 'string' || !target || target.length > 100) return null;
  return { type: 'host', action: msg.action, targetUserId: target };
}

// Strip C0 control chars but keep tab, LF, CR.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export function sanitizeText(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(CONTROL_CHARS, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_TEXT);
}

export function sanitizeName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_NAME);
}

export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.length > MAX_HISTORY ? messages.slice(messages.length - MAX_HISTORY) : messages;
}
