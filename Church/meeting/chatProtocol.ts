// Message protocol shared by the ChatRoom Durable Object and the frontend.
// Pure + isomorphic (no server APIs) so both sides import the same source.

import { BIBLE_BOOKS } from '../constants/bibleBooks';
import { isReactionEmoji, type Reactions } from './reactions';

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
  /** Emoji given to this message, by user id. Absent until somebody reacts. */
  reactions?: Reactions;
}

/**
 * Pressing an emoji on a message.
 *
 * A client sends this without `users` — it is a request to toggle. The room
 * object works out who now holds that emoji and broadcasts the same shape with
 * `users` filled in, which is the new state rather than a request. Taking the
 * client's word for `users` would let anyone invent a unanimous amen, so the
 * sanitizer drops it.
 */
export interface RoomReaction {
  type: 'reaction';
  messageId: string;
  emoji: string;
  users?: string[];
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
  /**
   * The leader puts the Bible away and the room closes with them. Opening was
   * always shared; without this, closing was not, and members were left on a
   * passage the group had finished with.
   */
  | { type: 'bible'; action: 'close' }
  | { type: 'bible'; action: 'book'; bookId: number }
  | { type: 'bible'; action: 'passage'; bookId: number; chapter: number }
  /**
   * Where the leader is reading within a chapter, as the verse at the top of
   * their panel — not a pixel offset, which would land somewhere else on a
   * reader using a different text size or panel width. Carries the passage so
   * a message that arrives after the room has moved on is ignored.
   */
  | { type: 'bible'; action: 'scroll'; bookId: number; chapter: number; verse: number }
  /** Full-screen reading, shared so the group sees the same thing enlarged. */
  | { type: 'bible'; action: 'expand'; expanded: boolean };

/**
 * A host's commands over the other participants. Hosts are self-declared on the
 * room card — there is no separate credential — so this is a courtesy role for
 * a group that knows each other, not a security boundary. The Durable Object
 * still checks that the sender really is a host before relaying.
 */
export type HostMessage =
  | { type: 'host'; action: 'mute'; targetUserId: string }
  /**
   * Switching someone's microphone back on for them. Carried out by their own
   * client, like every other host command — nothing here reaches into another
   * person's device.
   */
  | { type: 'host'; action: 'unmute'; targetUserId: string }
  /** Quiet please: everyone but the host mutes. */
  | { type: 'host'; action: 'muteAll' }
  | { type: 'host'; action: 'remove'; targetUserId: string }
  /** Host takes the shared-picture slot: whoever else is sharing stops. */
  | { type: 'host'; action: 'claimShare' }
  /**
   * Host closes the meeting and everyone leaves with them. Without this a
   * member who wanders off leaves a tab connected, holding a video session
   * open long after the study has finished.
   */
  | { type: 'host'; action: 'endMeeting' };

/**
 * A video the whole room is watching on YouTube.
 *
 * The picture never travels through LiveKit: every participant embeds their
 * own player and follows the leader's position, because a cross-origin iframe
 * cannot be captured and republished the way a local file can. So these
 * messages are the only thing holding the room together on one frame.
 */
export type RoomVideoMessage =
  /**
   * `leaderId` is stamped on by the room object, never sent by the client:
   * whoever opened the video is the one whose position the rest follow, and
   * taking a client's word for that would let anyone drag the room to
   * wherever they happen to be.
   */
  | { type: 'video'; action: 'open'; videoId: string; startSeconds?: number; leaderId?: string }
  | { type: 'video'; action: 'close' }
  | { type: 'video'; action: 'state'; playing: boolean; seconds: number };

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
export type ServerMessage = ChatMessage | SystemMessage | PresenceMessage | WelcomeMessage | BibleMessage | HostMessage | RoomVideoMessage | RoomReaction;

export type ClientMessage =
  | { type: 'message'; text: string }
  | BibleMessage
  | HostMessage
  | RoomVideoMessage
  | RoomReaction;

/**
 * Validates a Bible navigation message from a client. The Durable Object
 * rebroadcasts to the whole room, so a bad book or chapter would push everyone
 * to a page that does not exist — it is rejected here rather than trusted.
 */
export function sanitizeBibleMessage(input: unknown): BibleMessage | null {
  if (!input || typeof input !== 'object') return null;
  const msg = input as { type?: unknown; action?: unknown; bookId?: unknown; chapter?: unknown; expanded?: unknown };
  if (msg.type !== 'bible') return null;
  if (msg.action === 'contents') return { type: 'bible', action: 'contents' };
  if (msg.action === 'close') return { type: 'bible', action: 'close' };
  if (msg.action === 'expand') return { type: 'bible', action: 'expand', expanded: msg.expanded === true };

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

/** A YouTube video id is always eleven of these characters. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Nothing anyone watches together runs past a day. */
const MAX_VIDEO_SECONDS = 86400;

function videoSeconds(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_VIDEO_SECONDS) return null;
  return value;
}

/**
 * Validates a room video message from a client.
 *
 * The Durable Object rebroadcasts this to everyone, so an unchecked id would
 * put a stranger's page in front of the whole room. Whether the sender is
 * allowed to lead is checked separately, as it is for Bible navigation.
 */
export function sanitizeRoomVideoMessage(input: unknown): RoomVideoMessage | null {
  if (!input || typeof input !== 'object') return null;
  const msg = input as { type?: unknown; action?: unknown; videoId?: unknown; startSeconds?: unknown; playing?: unknown; seconds?: unknown };
  if (msg.type !== 'video') return null;

  if (msg.action === 'close') return { type: 'video', action: 'close' };

  if (msg.action === 'open') {
    if (typeof msg.videoId !== 'string' || !VIDEO_ID.test(msg.videoId)) return null;
    if (msg.startSeconds === undefined) return { type: 'video', action: 'open', videoId: msg.videoId };
    const start = videoSeconds(msg.startSeconds);
    if (start === null) return null;
    return { type: 'video', action: 'open', videoId: msg.videoId, startSeconds: start };
  }

  if (msg.action === 'state') {
    if (typeof msg.playing !== 'boolean') return null;
    const seconds = videoSeconds(msg.seconds);
    if (seconds === null) return null;
    return { type: 'video', action: 'state', playing: msg.playing, seconds };
  }

  return null;
}

/** Ids are uuids; this is a sanity bound, not a format check. */
const MAX_ID_LENGTH = 100;

/**
 * Validates a reaction from a client.
 *
 * Only the emoji and which message it lands on come from outside. Who holds it
 * is decided by the room object from what it already has.
 */
export function sanitizeRoomReaction(input: unknown): RoomReaction | null {
  if (!input || typeof input !== 'object') return null;
  const msg = input as { type?: unknown; messageId?: unknown; emoji?: unknown };
  if (msg.type !== 'reaction') return null;
  if (!isReactionEmoji(msg.emoji)) return null;
  const messageId = msg.messageId;
  if (typeof messageId !== 'string' || !messageId || messageId.length > MAX_ID_LENGTH) return null;
  return { type: 'reaction', messageId, emoji: msg.emoji };
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
  if (msg.action === 'endMeeting') return { type: 'host', action: 'endMeeting' };
  if (msg.action === 'muteAll') return { type: 'host', action: 'muteAll' };
  if (msg.action !== 'mute' && msg.action !== 'unmute' && msg.action !== 'remove') return null;
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
