import type { Participant } from 'livekit-client';

/**
 * Raised hands live on the LiveKit participant, not on the chat room.
 *
 * The room has two sets of identities that do not know about each other: a
 * LiveKit participant (`name-8hex`, what the video tiles are made of) and a
 * presence user (a uuid from the ChatRoom Durable Object, what the member list
 * is made of). Only the display name overlaps, so routing hands through the
 * chat socket would mean matching people up by name — and two people called
 * 王姊妹 would share a hand. Keeping the state on the participant puts it where
 * the tiles already are.
 *
 * Being a participant attribute also makes it state rather than an event:
 * someone joining late sees the hands that are already up, a dropped socket
 * recovers them, and leaving the room takes them away.
 */
export const HAND_ATTRIBUTE = 'hand';

/**
 * When this participant raised their hand, or null if it is down.
 *
 * Lowering sets the attribute to an empty string rather than removing it —
 * setAttributes merges, so there is no way to delete a key. Attributes are
 * free-form strings any participant can set, so anything that is not a
 * positive number counts as no hand at all.
 */
export function handRaisedAt(participant: Participant): number | null {
  const raw = participant.attributes?.[HAND_ATTRIBUTE];
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const at = Number(raw);
  if (!Number.isFinite(at) || at <= 0) return null;
  return at;
}

/**
 * The room with raised hands moved to the front, earliest first.
 *
 * This is what makes a hand visible without anyone turning a page: a phone
 * fits six tiles, so whoever raises a hand is put where those six are. The
 * order among everyone else is left exactly as it was, and a room with no
 * hands up gets its own list back unchanged — the same reference, so the
 * stage does not re-render for nothing.
 */
export function orderByRaisedHand(participants: Participant[]): Participant[] {
  const raised: { participant: Participant; at: number }[] = [];
  const rest: Participant[] = [];
  for (const participant of participants) {
    const at = handRaisedAt(participant);
    if (at === null) rest.push(participant);
    else raised.push({ participant, at });
  }
  if (raised.length === 0) return participants;
  // Array.prototype.sort is stable, so two hands raised in the same
  // millisecond keep the order they arrived in.
  raised.sort((a, b) => a.at - b.at);
  return [...raised.map((r) => r.participant), ...rest];
}

/** Queue position (1, 2, 3 …) for every raised hand, by participant identity. */
export function handOrders(participants: Participant[]): Map<string, number> {
  const orders = new Map<string, number>();
  let position = 0;
  for (const participant of orderByRaisedHand(participants)) {
    if (handRaisedAt(participant) === null) break;
    position += 1;
    orders.set(participant.identity, position);
  }
  return orders;
}

/** How many hands are up right now. */
export function raisedHandCount(participants: Participant[]): number {
  return participants.reduce((total, p) => total + (handRaisedAt(p) === null ? 0 : 1), 0);
}
