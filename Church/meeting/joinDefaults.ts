/**
 * How a room is entered: with the camera and microphone open, or quietly.
 *
 * Nothing here is remembered between visits. What matters is the room you are
 * walking into right now, not what you chose for a different one last week.
 */

/**
 * The head count at which a room stops being "the first few of us" and starts
 * being a study already in progress.
 */
export const CROWDED_ROOM_SIZE = 3;

export interface JoinMedia {
  camOn: boolean;
  micOn: boolean;
}

/**
 * What the two boxes should be ticked to for a room of this size.
 *
 * Arriving into a discussion with a live microphone puts your kitchen in the
 * middle of it, so past a few people the default is to come in quietly — the
 * boxes are still there to tick, and everything can be turned on inside.
 *
 * An unknown count is treated as an empty room: the room list polls every ten
 * seconds, and a card that has not heard back yet must not silence somebody
 * for no reason.
 */
export function defaultJoinMedia(activeCount: number | undefined): JoinMedia {
  const quiet = (activeCount ?? 0) >= CROWDED_ROOM_SIZE;
  return { camOn: !quiet, micOn: !quiet };
}
