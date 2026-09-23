import type { Participant } from 'livekit-client';

/**
 * Who is hosting, written where the video tiles can read it.
 *
 * The room knows its host through presence — a Durable Object session keyed by
 * a uuid — while the tiles are made of LiveKit participants keyed by their own
 * identity. The two id spaces share nothing but a display name, so a badge
 * matched up by name would land on the wrong 王姊妹. Marking the participant
 * itself is the same answer raised hands needed, for the same reason.
 *
 * This is a label, not a permission: what a host may actually do is still
 * decided where it was before.
 */
export const HOST_ATTRIBUTE = 'host';

/** The exact marker, since attributes are free-form strings anyone can set. */
const HOST_MARKER = '1';

export function isHostParticipant(participant: Participant): boolean {
  return participant.attributes?.[HOST_ATTRIBUTE] === HOST_MARKER;
}

/**
 * The presence id of the person behind a video tile.
 *
 * The member list is built from presence — a Durable Object session keyed by a
 * uuid — and a microphone belongs to a LiveKit participant keyed by its own
 * identity. Carrying the presence id on the participant is what lets the list
 * say whether someone is muted, and lets a host's command find the right tile.
 */
export const USER_ID_ATTRIBUTE = 'uid';

export function participantUserId(participant: Participant): string | null {
  const id = participant.attributes?.[USER_ID_ATTRIBUTE];
  return typeof id === 'string' && id !== '' ? id : null;
}

/**
 * Who in the room has their microphone on, by presence id.
 *
 * Absent from the map means unknown rather than muted: a participant whose
 * attributes have not arrived yet should not be drawn as silenced.
 */
export function microphoneStates(participants: Participant[]): Map<string, boolean> {
  const states = new Map<string, boolean>();
  for (const participant of participants) {
    const id = participantUserId(participant);
    if (id) states.set(id, participant.isMicrophoneEnabled);
  }
  return states;
}
