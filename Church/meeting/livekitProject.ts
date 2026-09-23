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
 * The three servers by name. Choosing is done in terms of these rather than the
 * settings themselves so a room can write down which one it is on: a key is a
 * short string worth storing, a project is three secrets that must not be.
 */
export type LiveKitProjectKey = 'self' | 'a' | 'b';

const PROJECT_KEYS: readonly LiveKitProjectKey[] = ['self', 'a', 'b'];

export function isLiveKitProjectKey(value: unknown): value is LiveKitProjectKey {
  return typeof value === 'string' && (PROJECT_KEYS as readonly string[]).includes(value);
}

/** The settings behind a name, or null when that server is not configured. */
export function projectByKey(env: LiveKitProjectEnv, key: LiveKitProjectKey | null): LiveKitProject | null {
  if (key === 'self') return project(env.LIVEKIT_URL_SELF, env.LIVEKIT_API_KEY_SELF, env.LIVEKIT_API_SECRET_SELF);
  if (key === 'a') return project(env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  if (key === 'b') return project(env.LIVEKIT_URL_B, env.LIVEKIT_API_KEY_B, env.LIVEKIT_API_SECRET_B);
  return null;
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
 * The name of the server to issue this meeting's token against, or null when
 * none is configured.
 *
 * The church's own machine is the default: it has no minute allowance to run
 * out. The two cloud projects are what catches the meeting when that machine
 * is unreachable, and among themselves they still alternate by date exactly as
 * before — that rule is untouched.
 *
 * This is only a *proposal*. It depends on a live health probe, so two people
 * joining the same meeting can get different answers from it; stickyProject()
 * is what turns the proposal into the one server the whole room uses.
 */
export function selectLiveKitProjectKey(
  env: LiveKitProjectEnv,
  now: Date,
  options: SelectOptions = {},
): LiveKitProjectKey | null {
  const { selfHealthy = false, timeZone = MEETING_TIME_ZONE } = options;
  const has = (key: LiveKitProjectKey): boolean => projectByKey(env, key) !== null;
  const firstConfigured = (...keys: LiveKitProjectKey[]): LiveKitProjectKey | null => keys.find(has) ?? null;

  // An override that names an unconfigured server falls through to whatever is
  // available: a meeting on the wrong server beats no meeting at all.
  switch ((env.LIVEKIT_ACTIVE ?? '').trim().toLowerCase()) {
    case 'self': return firstConfigured('self', 'a', 'b');
    case 'a': return firstConfigured('a', 'b', 'self');
    case 'b': return firstConfigured('b', 'a', 'self');
    default: break;
  }

  // Own machine first, but only while it is actually answering. Handing out a
  // token for a server that is down would let people into a room nobody can
  // reach, with no hint as to why.
  if (has('self') && selfHealthy) return 'self';

  // Fallen back to the cloud: the original date rotation, unchanged.
  if (!has('a')) return firstConfigured('b', 'self');
  if (!has('b')) return firstConfigured('a', 'self');
  return meetingDayNumber(now, timeZone) % 2 === 0 ? 'a' : 'b';
}

/** The settings for selectLiveKitProjectKey's answer. */
export function selectLiveKitProject(
  env: LiveKitProjectEnv,
  now: Date,
  options: SelectOptions = {},
): LiveKitProject | null {
  return projectByKey(env, selectLiveKitProjectKey(env, now, options));
}

/** What a room has written down about which server it is using. */
export interface StickyProject {
  project: LiveKitProjectKey;
  /** The meeting day the choice was made on (see meetingDayNumber). */
  day: number;
  /** When a token was last issued for this room, so a finished meeting expires. */
  lastIssuedAt: number;
}

export interface StickyProjectInput {
  stored: StickyProject | null;
  proposed: LiveKitProjectKey;
  day: number;
  now: number;
  /** People currently connected to the room's chat socket. */
  activeCount: number;
}

/**
 * How long a room stays bound to its server after the last person has gone.
 *
 * A Worker deploy restarts the Durable Object, and its session count is zero
 * for the second or so everyone takes to reconnect — long enough to look like
 * an empty room. This window is what stops that moment from re-deciding the
 * server underneath a meeting that is still going.
 */
export const REDECIDE_IDLE_MS = 30 * 60 * 1000;

/**
 * The server a room must use — the decision that makes the proposal stick.
 *
 * Everyone in one meeting has to be on one server: two people handed different
 * projects sit in identically named but entirely separate rooms, seeing and
 * hearing nobody, with no error to explain it. The proposal alone cannot give
 * that, because it reads a live health probe that can answer differently for
 * two people joining a minute apart. So the room's first answer is written
 * down and every later join is given the same one.
 *
 * It is let go of only when nothing can be split: a new meeting day, or a room
 * that has been empty and quiet long enough that the meeting is over. That is
 * also what lets a room come back to the church's own server once it recovers.
 */
export function stickyProject({ stored, proposed, day, now, activeCount }: StickyProjectInput): LiveKitProjectKey {
  if (!stored || stored.day !== day) return proposed;
  if (stored.project === proposed) return stored.project;
  const meetingUnderWay = activeCount > 0 || now - stored.lastIssuedAt < REDECIDE_IDLE_MS;
  return meetingUnderWay ? stored.project : proposed;
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
