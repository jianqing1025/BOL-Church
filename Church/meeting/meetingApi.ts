/// <reference types="@cloudflare/workers-types" />
import { MEETING_ROOMS, livekitRoomName } from '../constants/meetingRooms';
import { validateAuth, validateJoin, validateVideo } from './meetingValidation';
import { createLiveKitToken } from './livekitToken';
import {
  checkSelfHostedHealth,
  isLiveKitProjectKey,
  meetingDayNumber,
  projectByKey,
  selectLiveKitProjectKey,
  type LiveKitProjectEnv,
  type LiveKitProjectKey,
} from './livekitProject';

export interface MeetingEnv extends LiveKitProjectEnv {
  CHAT_ROOM: DurableObjectNamespace;
  CHAT_PASSWORD?: string;
  ALLOWED_ORIGIN?: string;
}

function corsHeaders(env: MeetingEnv): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function jsonCors(env: MeetingEnv, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

async function readActiveCount(env: MeetingEnv, roomId: string): Promise<number> {
  const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(roomId));
  const res = await stub.fetch('https://meeting-room.local/status');
  if (!res.ok) return 0;
  const body = await res.json().catch(() => ({})) as { activeCount?: unknown };
  return typeof body.activeCount === 'number' ? body.activeCount : 0;
}

/**
 * Asks the room which LiveKit server it is on, so every join lands on the same
 * one. A failure here falls back to the proposal: a meeting that might be split
 * beats no meeting at all.
 */
async function roomLiveKitProject(
  env: MeetingEnv,
  roomId: string,
  proposed: LiveKitProjectKey,
  day: number,
): Promise<LiveKitProjectKey> {
  try {
    const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(roomId));
    const res = await stub.fetch('https://meeting-room.local/livekit-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposed, day }),
    });
    if (!res.ok) return proposed;
    const body = await res.json().catch(() => ({})) as { project?: unknown };
    return isLiveKitProjectKey(body.project) ? body.project : proposed;
  } catch {
    return proposed;
  }
}

/** Handles every /api/meeting/* request. Returns null if the path is not ours. */
export async function handleMeeting(request: Request, env: MeetingEnv, url: URL): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith('/api/meeting/')) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }

  if (path === '/api/meeting/health' && request.method === 'GET') {
    return jsonCors(env, { ok: true });
  }

  if (path === '/api/meeting/rooms' && request.method === 'GET') {
    const rooms = await Promise.all(
      MEETING_ROOMS.map(async (room) => ({
        ...room,
        activeCount: await readActiveCount(env, room.id),
      })),
    );
    return jsonCors(env, { rooms });
  }

  if (path === '/api/meeting/verify' && request.method === 'POST') {
    const body = await request.json().catch(() => ({})) as { name?: string; password?: string };
    const v = validateAuth({ name: body.name, password: body.password }, env.CHAT_PASSWORD);
    if (v.ok === false) return jsonCors(env, { error: v.error }, v.status);
    return jsonCors(env, { ok: true });
  }

  if (path === '/api/meeting/livekit-token' && request.method === 'POST') {
    const body = await request.json().catch(() => ({})) as { roomId?: string; name?: string; password?: string };
    const v = validateVideo({ roomId: body.roomId, name: body.name, password: body.password }, env.CHAT_PASSWORD);
    if (v.ok === false) return jsonCors(env, { error: v.error }, v.status);
    // The church's own server is preferred; the cloud projects catch the
    // meeting when it is unreachable, alternating by date between themselves.
    // That choice is only a proposal: it reads a live health probe, so two
    // people joining a minute apart can get different answers. The room itself
    // settles it, so everyone in one meeting lands on the same server — see
    // livekitProject.ts for why that has to hold.
    const now = new Date();
    const selfHealthy = await checkSelfHostedHealth(env);
    const proposed = selectLiveKitProjectKey(env, now, { selfHealthy });
    if (!proposed) {
      return jsonCors(env, { error: 'Video is not configured' }, 503);
    }
    const chosen = await roomLiveKitProject(env, v.room.id, proposed, meetingDayNumber(now));
    const project = projectByKey(env, chosen) ?? projectByKey(env, proposed);
    if (!project) {
      return jsonCors(env, { error: 'Video is not configured' }, 503);
    }
    const roomName = livekitRoomName(v.room.id);
    const identity = `${v.name}-${crypto.randomUUID().slice(0, 8)}`;
    const token = await createLiveKitToken({
      apiKey: project.apiKey,
      apiSecret: project.apiSecret,
      identity,
      name: v.name,
      roomName,
    });
    return jsonCors(env, { url: project.url, token, roomName });
  }

  if (path === '/api/meeting/ws' && request.method === 'GET') {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return jsonCors(env, { error: 'Expected websocket upgrade' }, 400);
    }
    const v = validateJoin(
      { roomId: url.searchParams.get('roomId'), name: url.searchParams.get('name'), password: url.searchParams.get('password') },
      env.CHAT_PASSWORD,
    );
    if (v.ok === false) return jsonCors(env, { error: v.error }, v.status);

    const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(v.room.id));
    const doUrl = new URL(request.url);
    doUrl.searchParams.set('roomId', v.room.id);
    doUrl.searchParams.set('name', v.name);
    const sessionId = url.searchParams.get('sessionId');
    // A random per-visit token, never a display name or account identifier.
    if (sessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return jsonCors(env, { error: 'Invalid session ID' }, 400);
    }
    // Do not expose the reconnect token in presence: another room member
    // must not be able to copy a visible user ID and replace that connection.
    const digest = sessionId ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${v.room.id}:${sessionId}`)) : null;
    const uid = digest ? Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') : crypto.randomUUID();
    doUrl.searchParams.set('uid', uid);
    doUrl.searchParams.delete('sessionId');
    doUrl.searchParams.set('heartbeat', sessionId ? '1' : '0');
    // Host is self-declared on the room card; normalize it to a strict flag.
    doUrl.searchParams.set('host', url.searchParams.get('host') === '1' ? '1' : '0');
    doUrl.searchParams.delete('password'); // never forward the password
    return stub.fetch(new Request(doUrl.toString(), request));
  }

  return jsonCors(env, { error: 'Not found' }, 404);
}
