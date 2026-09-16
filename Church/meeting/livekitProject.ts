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

export interface SelectOptions {
  /**
   * Whether the church's own server answered just now. Passed in rather than
   * measured here so every rule below stays a pure function of its inputs.
   */
  selfHealthy?: boolean;
  timeZone?: string;
}

/**
 * The server to issue this meeting's token against, or null when none is
 * configured.
 *
 * The church's own machine is the default: it has no minute allowance to run
 * out. The two cloud projects are what catches the meeting when that machine
 * is unreachable, and among themselves they still alternate by date exactly as
 * before — that rule is untouched.
 */
export function selectLiveKitProject(
  env: LiveKitProjectEnv,
  now: Date,
  options: SelectOptions = {},
): LiveKitProject | null {
  const { selfHealthy = false, timeZone = MEETING_TIME_ZONE } = options;
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

  // Own machine first, but only while it is actually answering. Handing out a
  // token for a server that is down would let people into a room nobody can
  // reach, with no hint as to why.
  if (self && selfHealthy) return self;

  // Fallen back to the cloud: the original date rotation, unchanged.
  if (!a) return b ?? self;
  if (!b) return a ?? self;
  return meetingDayNumber(now, timeZone) % 2 === 0 ? a : b;
}

/**
 * Whether the self-hosted server is answering.
 *
 * Retried once: a single dropped packet must not push a meeting onto the cloud
 * while everyone already in it is on the church's own machine — that would
 * split the room in two with no visible error.
 */
export async function checkSelfHostedHealth(
  env: LiveKitProjectEnv,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 1500,
): Promise<boolean> {
  const url = env.LIVEKIT_URL_SELF;
  if (!url || !env.LIVEKIT_API_KEY_SELF || !env.LIVEKIT_API_SECRET_SELF) return false;
  const probe = url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(probe, { signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) return true;
    } catch {
      // Unreachable or too slow — try once more, then give up to the cloud.
    }
  }
  return false;
}
