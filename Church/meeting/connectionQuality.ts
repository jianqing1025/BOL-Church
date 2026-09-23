import { ConnectionQuality, type Participant } from 'livekit-client';
import { participantUserId } from './participantFlags';

/**
 * Whose connection is the problem.
 *
 * "The sound keeps breaking up" is the hardest report to act on, because the
 * three causes — the speaker's upload, one listener's download, and the server
 * — look identical from the inside and are fixed in completely different
 * places. The server reports a quality score for every participant, so the
 * room can simply say which of them is struggling, and the question answers
 * itself: one person marked, or everybody at once.
 */
export type ConnectionTrouble = 'poor' | 'lost';

/**
 * The trouble a participant is in, or null when there is none worth drawing.
 *
 * Deliberately silent about healthy connections. A signal meter on every tile
 * in a room that is working is decoration, and decoration is what people learn
 * to stop seeing — including on the day it turns red.
 */
export function connectionTrouble(participant: Participant): ConnectionTrouble | null {
  switch (participant.connectionQuality) {
    case ConnectionQuality.Poor: return 'poor';
    case ConnectionQuality.Lost: return 'lost';
    default: return null;
  }
}

export interface TroubledParticipant {
  identity: string;
  name: string;
  trouble: ConnectionTrouble;
}

/** Everyone currently in difficulty, for a summary of the room. */
export function troubledParticipants(participants: Participant[]): TroubledParticipant[] {
  const troubled: TroubledParticipant[] = [];
  for (const participant of participants) {
    const trouble = connectionTrouble(participant);
    if (trouble) troubled.push({ identity: participant.identity, name: participant.name || participant.identity, trouble });
  }
  return troubled;
}

/**
 * Trouble keyed by presence id, so the member list can show it.
 *
 * That list is built from the chat room's uuids while a connection belongs to
 * a LiveKit participant; the `uid` attribute is what joins the two. Someone
 * whose id has not arrived yet is left out rather than guessed at.
 */
export function troubleByUserId(participants: Participant[]): Map<string, ConnectionTrouble> {
  const troubles = new Map<string, ConnectionTrouble>();
  for (const participant of participants) {
    const trouble = connectionTrouble(participant);
    const userId = participantUserId(participant);
    if (trouble && userId) troubles.set(userId, trouble);
  }
  return troubles;
}
