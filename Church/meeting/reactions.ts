/**
 * Reacting to a message with an emoji, shared by both chats.
 *
 * The meeting's chat runs over a WebSocket and the Sunday stream's over HTTP
 * polling, but what a reaction *is* is the same in both, so the rules live
 * here once: which emoji exist, what pressing one does, and what to draw.
 */

/**
 * The five on offer.
 *
 * Teams also has an angry face. A Bible study and a prayer meeting have
 * essentially no use for one, and an anger button that is always within reach
 * is a liability in that room rather than a feature. 🙏 — amen — is the one
 * this congregation will reach for most.
 */
export const REACTION_EMOJI = ['👍', '🙏', '❤️', '😊', '😮'] as const;

export type ReactionEmoji = typeof REACTION_EMOJI[number];

/** Who has given each emoji, by user id. */
export type Reactions = Record<string, string[]>;

export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return typeof value === 'string' && (REACTION_EMOJI as readonly string[]).includes(value);
}

/**
 * Pressing an emoji: gives it, or takes it back if you had already given it.
 *
 * Returns a new object — the caller's copy is left alone, so React state and
 * the room object's history are never mutated underneath anyone. An emoji
 * nobody is left holding is removed rather than kept as an empty list, which
 * would otherwise draw as a pill reading zero.
 */
export function toggleReaction(current: Reactions, emoji: string, userId: string): Reactions {
  const next: Reactions = { ...current };
  const holders = next[emoji] ?? [];
  const remaining = holders.filter((id) => id !== userId);

  if (remaining.length === holders.length) next[emoji] = [...holders, userId];
  else if (remaining.length === 0) delete next[emoji];
  else next[emoji] = remaining;

  return next;
}

export interface ReactionPill {
  emoji: string;
  count: number;
  /** Whether the person looking gave this one, so it can be marked. */
  mine: boolean;
}

/**
 * The pills to draw under a message, in the order the picker offers them.
 *
 * Fixed order rather than order of arrival: a row of pills that rearranges
 * itself as people press things is hard to aim at, and aiming at them is how
 * you take a reaction back.
 */
export function reactionSummary(reactions: Reactions | undefined, ownUserId: string | null): ReactionPill[] {
  if (!reactions) return [];
  const pills: ReactionPill[] = [];
  for (const emoji of REACTION_EMOJI) {
    const holders = reactions[emoji];
    if (!holders || holders.length === 0) continue;
    pills.push({ emoji, count: holders.length, mine: ownUserId !== null && holders.includes(ownUserId) });
  }
  return pills;
}

/** The shape a chat list entry needs for a reaction to land on it. */
interface Reactable {
  type: string;
  id?: string;
  reactions?: Reactions;
}

/**
 * Applies the room's new holder list to the message it names.
 *
 * The broadcast carries the whole list rather than "one more" or "one fewer",
 * so a client that missed a message still ends up agreeing with the room. An
 * id that is not in the list — older than the history the room keeps — leaves
 * everything untouched, and the same array comes back so nothing re-renders.
 */
export function applyReactionToMessages<T extends Reactable>(
  messages: T[],
  // Takes the broadcast as it arrives, `type` and all, so callers need not
  // pick it apart first.
  reaction: { type?: string; messageId: string; emoji: string; users?: string[] },
): T[] {
  const index = messages.findIndex((m) => m.type === 'message' && m.id === reaction.messageId);
  if (index === -1) return messages;

  const holders = reaction.users ?? [];
  const current = messages[index].reactions ?? {};
  const next: Reactions = { ...current };
  if (holders.length === 0) delete next[reaction.emoji];
  else next[reaction.emoji] = holders;

  const updated = [...messages];
  updated[index] = { ...messages[index], reactions: next };
  return updated;
}
