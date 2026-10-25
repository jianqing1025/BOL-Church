import type { LiveKitProject } from './livekitProject';
import { signLiveKitJwt } from './livekitToken';

/**
 * Clears video participants nobody is behind any more.
 *
 * A participant is really in a meeting when it is in both of the meeting's two
 * connections: the LiveKit video and the chat room, which hears from every
 * client twice a minute. LiveKit can lose track of a phone that drops in the
 * middle of resuming its connection — on 2026-10-07 the church's server kept
 * such a phone "active" for fifteen hours, a tile with no one behind it. The
 * chat room had let it go within two minutes. So the chat room is the judge:
 * a video participant missing from it for the grace period below is removed.
 *
 * Each participant publishes its chat id as the `uid` attribute, which is how
 * the two are matched.
 */

/** Long enough to ride out a chat reconnect or a deploy; short enough to matter. */
export const GHOST_GRACE_MS = 5 * 60_000;
/** How often a room with anyone in its video is checked. */
export const GHOST_CHECK_INTERVAL_MS = 60_000;

export interface LiveParticipant {
  identity: string;
  /** Chat-room id published by the client; null until it has published one. */
  uid: string | null;
  joinedAt: number;
}

export function selectGhosts(
  participants: readonly LiveParticipant[],
  presentIds: ReadonlySet<string>,
  absentSince: Readonly<Record<string, number>>,
  now: number,
  graceMs: number,
): { ghosts: string[]; absentSince: Record<string, number> } {
  const ghosts: string[] = [];
  const next: Record<string, number> = {};
  for (const p of participants) {
    if (p.uid && presentIds.has(p.uid)) continue;
    // One that never said who it is has been unaccounted for since it joined.
    const since = absentSince[p.identity] ?? (p.uid ? now : p.joinedAt);
    next[p.identity] = since;
    if (now - since >= graceMs) ghosts.push(p.identity);
  }
  return { ghosts, absentSince: next };
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

async function roomService(project: LiveKitProject, method: string, roomName: string, body: object, fetchImpl: FetchLike): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signLiveKitJwt(project.apiSecret, {
    iss: project.apiKey, nbf: now - 10, exp: now + 300,
    video: { room: roomName, roomAdmin: true },
  });
  const base = project.url.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
  return fetchImpl(`${base}/twirp/livekit.RoomService/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function listLiveKitParticipants(project: LiveKitProject, roomName: string, fetchImpl: FetchLike = fetch): Promise<LiveParticipant[]> {
  const res = await roomService(project, 'ListParticipants', roomName, { room: roomName }, fetchImpl);
  // A room LiveKit has already closed has nobody in it.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`ListParticipants failed (${res.status})`);
  const body = await res.json() as { participants?: { identity?: string; joined_at?: string | number; attributes?: Record<string, string> }[] };
  return (body.participants ?? [])
    .filter((p) => typeof p.identity === 'string')
    .map((p) => ({ identity: p.identity!, uid: p.attributes?.uid || null, joinedAt: Number(p.joined_at ?? 0) * 1000 }));
}

export async function removeLiveKitParticipant(project: LiveKitProject, roomName: string, identity: string, fetchImpl: FetchLike = fetch): Promise<void> {
  const res = await roomService(project, 'RemoveParticipant', roomName, { room: roomName, identity }, fetchImpl);
  if (!res.ok && res.status !== 404) throw new Error(`RemoveParticipant failed (${res.status})`);
}
