/// <reference types="@cloudflare/workers-types" />
import { MEETING_ROOMS, livekitRoomName } from '../constants/meetingRooms';
import { validateAuth, validateJoin, validateVideo } from './meetingValidation';
import { createLiveKitToken } from './livekitToken';

export interface MeetingEnv {
  CHAT_ROOM: DurableObjectNamespace;
  CHAT_PASSWORD?: string;
  ALLOWED_ORIGIN?: string;
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
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
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      return jsonCors(env, { error: 'Video is not configured' }, 503);
    }
    const roomName = livekitRoomName(v.room.id);
    const identity = `${v.name}-${crypto.randomUUID().slice(0, 8)}`;
    const token = await createLiveKitToken({
      apiKey: env.LIVEKIT_API_KEY,
      apiSecret: env.LIVEKIT_API_SECRET,
      identity,
      name: v.name,
      roomName,
    });
    return jsonCors(env, { url: env.LIVEKIT_URL, token, roomName });
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
    doUrl.searchParams.set('uid', crypto.randomUUID());
    doUrl.searchParams.delete('password'); // never forward the password
    return stub.fetch(new Request(doUrl.toString(), request));
  }

  return jsonCors(env, { error: 'Not found' }, 404);
}
