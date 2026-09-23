/**
 * Reading a YouTube link, and keeping a room's players together.
 *
 * A YouTube player is a cross-origin iframe: its picture and sound cannot be
 * captured, so a room cannot watch one the way it watches a local video file
 * (captured from a <video> element and published as a screen share). Instead
 * every participant embeds their own player and the leader's position is
 * broadcast for the rest to follow. The video never travels through LiveKit,
 * which is also why it costs the church nothing in server minutes.
 */

/** A YouTube video id is always eleven of these characters. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Where an id hides in the links people paste. */
const LINK_PATTERNS = [
  /[?&]v=([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/,
  /youtu\.be\/([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/,
  /\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/,
];

/**
 * The video a link points at, or null if it does not point at one.
 *
 * Deliberately strict about the host: a `watch?v=` on somebody else's domain
 * is not a YouTube video, and embedding it would load a stranger's page into
 * everyone's meeting.
 */
export function parseYouTubeVideoId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text) return null;
  if (VIDEO_ID.test(text)) return text;
  // youtu.be and youtube.com both match; anything else is not ours to embed.
  if (!/(^|\/\/|\.)youtu\.?be/i.test(text)) return null;
  for (const pattern of LINK_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * The timestamp a share link carries, in seconds.
 *
 * YouTube writes these two ways — `t=90`, and `t=1h2m3s` from the "share at
 * current time" box — and someone sending the room to a particular point in a
 * sermon will paste whichever they were given.
 */
export function parseYouTubeStart(input: unknown): number | undefined {
  if (typeof input !== 'string') return undefined;
  const match = input.match(/[?&](?:t|start)=([^&#\s]+)/);
  if (!match) return undefined;
  const raw = match[1];
  if (/^\d+s?$/.test(raw)) return Number.parseInt(raw, 10);
  const parts = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!parts || !parts.slice(1).some(Boolean)) return undefined;
  const [, h, m, s] = parts;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

export interface PlaybackState {
  playing: boolean;
  seconds: number;
}

export interface FollowDecision {
  /** Where to jump to, or null to stay put. */
  seekTo: number | null;
  /** Whether to start or stop playing, or null to leave it alone. */
  setPlaying: boolean | null;
}

/**
 * How far a follower may drift before it is worth jumping.
 *
 * The leader sends its position every three seconds, so without a tolerance
 * every follower's picture would twitch on every heartbeat. Two seconds is
 * below what anyone notices in a sermon and comfortably above the WebSocket
 * latency the position arrives with.
 */
export const DRIFT_TOLERANCE_SECONDS = 2;

/**
 * What a follower should do about the leader's position.
 *
 * Deliberately compares plain seconds rather than wall-clock timestamps:
 * clocks differ between devices, and a skewed clock would turn into a seek
 * error that repeats on every heartbeat. The message's travel time is a few
 * hundred milliseconds — far inside the tolerance — so it needs no correction.
 */
export function followRoomVideo(local: PlaybackState, leader: PlaybackState): FollowDecision {
  const drift = Math.abs(local.seconds - leader.seconds);
  return {
    seekTo: drift > DRIFT_TOLERANCE_SECONDS ? leader.seconds : null,
    setPlaying: local.playing === leader.playing ? null : leader.playing,
  };
}

/**
 * Whether this browser lets a page set the volume of media it plays.
 *
 * iOS does not: "the audio level is always under the user's physical control.
 * The volume property is not settable in JavaScript" — reading it always gives
 * 1 and writing is ignored. Offering a slider there would be a control that
 * visibly moves and does nothing, which is worse than not offering one, so the
 * iPhone gets a mute toggle and an honest note instead.
 */
export function canSetMediaVolume(userAgent: string): boolean {
  return !/iPad|iPhone|iPod/i.test(userAgent);
}
