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
