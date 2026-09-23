/**
 * What goes in the control bar's "⋯ More" menu.
 *
 * The bar itself is a fixed single row — microphone, camera, hand, Bible,
 * video, more, hang up — so that it never wraps onto a second line on a phone.
 * Everything else lives in here, and which of those apply depends on the room
 * and on who is looking, which is the bit worth testing on its own.
 */
export type OverflowKey = 'screenShare' | 'chat' | 'members' | 'view' | 'lowerAllHands' | 'muteAll';

export interface OverflowInput {
  hasVideo: boolean;
  /** False while someone is sharing a screen: the stage has no layout to swap. */
  showViewToggle: boolean;
  isHost: boolean;
  raisedHands: number;
}

export function overflowKeys({ hasVideo, showViewToggle, isHost, raisedHands }: OverflowInput): OverflowKey[] {
  const keys: OverflowKey[] = [];
  if (hasVideo) keys.push('screenShare', 'chat');
  keys.push('members');
  if (showViewToggle) keys.push('view');
  // Nothing to lower, nothing to offer — a host should not face a dead item.
  if (isHost && raisedHands > 0) keys.push('lowerAllHands');
  // No microphones in a room without video, so nothing to quieten.
  if (isHost && hasVideo) keys.push('muteAll');
  return keys;
}
