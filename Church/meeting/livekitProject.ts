/**
 * Which LiveKit project a meeting runs on.
 *
 * Two LiveKit projects are two separate servers, and a room exists on only one
 * of them. If two people in the same meeting were handed different projects
 * they would sit in identically named but entirely separate rooms, seeing and
 * hearing nobody — with no error to explain it. So the choice must depend on
 * nothing that can differ between participants: not request order, not which
 * Worker instance served them, not their own clock. It depends only on the
 * meeting's date, computed on the server.
 *
 * Alternating by date works because the meetings are weekly: seven days apart
 * flips an even/odd date every time, so consecutive Tuesdays land on different
 * projects and the load is shared between them.
 */

export interface LiveKitProject {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export interface LiveKitProjectEnv {
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
  LIVEKIT_URL_B?: string;
  LIVEKIT_API_KEY_B?: string;
  LIVEKIT_API_SECRET_B?: string;
  /** Self-hosted LiveKit on the church's own VPS — no minute allowance at all. */
  LIVEKIT_URL_SELF?: string;
  LIVEKIT_API_KEY_SELF?: string;
  LIVEKIT_API_SECRET_SELF?: string;
  /**
   * Manual override: 'self', 'a' or 'b' pins every meeting to that server and
   * stops the date rotation. Anything else (normally unset) rotates as usual.
   *
   * Flip it between meetings, not during one: a meeting already under way is
   * on a server this setting no longer names, and anyone joining afterwards
   * would land somewhere the others are not.
   */
  LIVEKIT_ACTIVE?: string;
}

/** The church's local time — the date that decides the project is the local one. */
export const MEETING_TIME_ZONE = 'America/Los_Angeles';

/**
 * Days turn over at 4am local, not midnight.
 *
 * An evening meeting must not change project underneath itself: whoever joined
 * before midnight would be stranded on the old project, alone. Nothing meets at
 * 4am, so moving the boundary there removes the only moment the switch could
 * split a room.
 */
export const DAY_BOUNDARY_HOUR = 4;

const MS_PER_DAY = 86_400_000;

/** A project counts only when all three settings are present — never mix halves. */
function project(url?: string, apiKey?: string, apiSecret?: string): LiveKitProject | null {
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

/**
 * The meeting day as a whole number of days, in church-local time with the 4am
 * boundary applied. Consecutive days differ by exactly one.
 */
export function meetingDayNumber(now: Date, timeZone: string = MEETING_TIME_ZONE): number {
  const shifted = new Date(now.getTime() - DAY_BOUNDARY_HOUR * 60 * 60 * 1000);
  // en-CA renders as YYYY-MM-DD, which parses back without locale surprises.
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted);
  const [year, month, day] = local.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/**
 * The project to issue this meeting's token against, or null when none is
 * configured. With only one project set up, that one is always used — so a
 * deployment that has not been given a second set of keys keeps working.
 */
export function selectLiveKitProject(env: LiveKitProjectEnv, now: Date, timeZone: string = MEETING_TIME_ZONE): LiveKitProject | null {
  const a = project(env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  const b = project(env.LIVEKIT_URL_B, env.LIVEKIT_API_KEY_B, env.LIVEKIT_API_SECRET_B);
  const self = project(env.LIVEKIT_URL_SELF, env.LIVEKIT_API_KEY_SELF, env.LIVEKIT_API_SECRET_SELF);

  // An override that names an unconfigured server falls through to whatever is
  // available: a meeting on the wrong server beats no meeting at all.
  switch ((env.LIVEKIT_ACTIVE ?? '').trim().toLowerCase()) {
    case 'self': return self ?? a ?? b;
    case 'a': return a ?? b ?? self;
    case 'b': return b ?? a ?? self;
    default: break;
  }

  // No override: rotate between the two cloud projects by date.
  if (!a) return b ?? self;
  if (!b) return a;
  return meetingDayNumber(now, timeZone) % 2 === 0 ? a : b;
}
