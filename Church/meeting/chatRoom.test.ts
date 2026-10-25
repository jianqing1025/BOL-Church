import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatRoom } from './chatRoom';
import { handleMeeting, type MeetingEnv } from './meetingApi';

class Socket extends EventTarget {
  sent: any[] = [];
  accept() {}
  send(data: string) { this.sent.push(JSON.parse(data)); }
  // Intentionally delayed close events reproduce a half-open connection.
  close = vi.fn();
  receive(data: object) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(data) })); }
  presence() { return this.sent.filter(m => m.type === 'presence').at(-1).users; }
}
let sockets: Socket[];
beforeEach(() => {
  vi.useFakeTimers();
  sockets = [];
  vi.stubGlobal('WebSocketPair', class {
    0 = new Socket();
    1 = new Socket();
    constructor() { sockets.push(this[1]); }
  });
  const NativeResponse = Response;
  vi.stubGlobal('Response', class extends NativeResponse {
    constructor(body: BodyInit | null, init: ResponseInit) {
      super(body, init?.status === 101 ? { status: 200 } : init);
    }
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function room() { return new ChatRoom({} as DurableObjectState, {}); }
async function join(r: ChatRoom, id: string, heartbeat = true) {
  await r.fetch(new Request(`https://room/ws?uid=${id}&name=Same&heartbeat=${heartbeat ? 1 : 0}`, { headers: { Upgrade: 'websocket' } }));
  return sockets.at(-1)!;
}
it('replaces a session and ignores old messages and late close events', async () => {
  const r = room();
  const old = await join(r, 'one');
  const current = await join(r, 'one');
  expect(old.close).toHaveBeenCalledWith(1000, 'session replaced');
  expect(current.presence()).toHaveLength(1);
  old.receive({ type: 'message', text: 'stale' });
  old.dispatchEvent(new Event('close'));
  expect(current.sent.some(m => m.text === 'stale')).toBe(false);
  const other = await join(r, 'two');
  expect(other.presence()).toHaveLength(2);
  expect(other.presence().map((u: any) => u.id)).toEqual(['one', 'two']);
});
it('expires silent sessions, preserves heartbeats and stops its timer when empty', async () => {
  const r = room();
  const silent = await join(r, 'silent');
  const active = await join(r, 'active');
  for (let i = 0; i < 5; i++) {
    vi.advanceTimersByTime(25_000);
    active.receive({ type: 'ping' });
  }
  expect(silent.close).toHaveBeenCalledWith(4000, 'heartbeat timeout');
  expect(active.presence().map((u: any) => u.id)).toEqual(['active']);
  expect(active.sent.at(-1)).toEqual({ type: 'pong' });
  active.dispatchEvent(new Event('close'));
  expect(vi.getTimerCount()).toBe(0);
});
it('does not expire older clients that have not opted into heartbeats', async () => {
  const ws = await join(room(), 'legacy', false);
  vi.advanceTimersByTime(180_000);
  expect(ws.close).not.toHaveBeenCalled();
});
it('forwards stable session IDs only after validation and supports older clients', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  const env = { CHAT_PASSWORD: 'test', CHAT_ROOM: { idFromName: (s: string) => s, get: () => ({ fetch }) } } as unknown as MeetingEnv;
  const id = crypto.randomUUID();
  const request = async (session: string) => {
    const url = new URL(`https://church/api/meeting/ws?roomId=bible-study-1&name=Same&password=test${session}`);
    return handleMeeting(new Request(url, { headers: { Upgrade: 'websocket' } }), env, url);
  };
  await request(`&sessionId=${id}`);
  const firstUid = new URL(fetch.mock.calls[0][0].url).searchParams.get('uid');
  expect(firstUid).not.toBe(id);
  expect(new URL(fetch.mock.calls[0][0].url).searchParams.has('sessionId')).toBe(false);
  await request(`&sessionId=${id}`);
  expect(new URL(fetch.mock.calls[1][0].url).searchParams.get('uid')).toBe(firstUid);
  expect(new URL(fetch.mock.calls[0][0].url).searchParams.has('password')).toBe(false);
  expect((await request('&sessionId=invalid'))?.status).toBe(400);
  expect(fetch).toHaveBeenCalledTimes(2);
  await request('');
  expect(new URL(fetch.mock.calls[2][0].url).searchParams.get('heartbeat')).toBe('0');
});

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial));
  let alarm: number | null = null;
  return {
    data,
    get alarm() { return alarm; },
    get: async (key: string) => data.get(key),
    put: async (key: string, value: unknown) => { data.set(key, value); },
    delete: async (key: string) => data.delete(key),
    getAlarm: async () => alarm,
    setAlarm: async (at: number) => { alarm = at; },
  };
}
const SELF = { LIVEKIT_URL_SELF: 'wss://live.example.org', LIVEKIT_API_KEY_SELF: 'k', LIVEKIT_API_SECRET_SELF: 's' };

it('starts watching for ghosts once a video token is issued for the room', async () => {
  const storage = memoryStorage();
  const r = new ChatRoom({ storage } as unknown as DurableObjectState, SELF);
  await r.fetch(new Request('https://room/livekit-project', { method: 'POST', body: JSON.stringify({ proposed: 'self', day: 1, roomId: 'prayer' }) }));
  expect(storage.data.get('roomId')).toBe('prayer');
  expect(storage.alarm).not.toBeNull();
});

it('removes a video participant long missing from the chat room and keeps the one who is here', async () => {
  const now = Date.now();
  const storage = memoryStorage({
    roomId: 'prayer',
    livekitProject: { project: 'self', day: 1, lastIssuedAt: now },
    ghostAbsentSince: { 'Gone-1': now - 6 * 60_000 },
  });
  const calls: { method: string; body: any }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const method = url.split('/').pop()!;
    calls.push({ method, body: JSON.parse(String(init.body)) });
    if (method === 'ListParticipants') {
      return Response.json({ participants: [
        { identity: 'Here-1', joined_at: '1', attributes: { uid: 'here' } },
        { identity: 'Gone-1', joined_at: '1', attributes: { uid: 'gone' } },
      ] });
    }
    return Response.json({});
  }));
  const r = new ChatRoom({ storage } as unknown as DurableObjectState, SELF);
  await join(r, 'here');
  await r.alarm();
  expect(calls.filter(c => c.method === 'RemoveParticipant').map(c => c.body)).toEqual([{ room: 'bolccop-prayer', identity: 'Gone-1' }]);
  expect(storage.alarm).not.toBeNull();
});

it('stops checking once the room’s video is empty', async () => {
  const storage = memoryStorage({ roomId: 'prayer', livekitProject: { project: 'self', day: 1, lastIssuedAt: Date.now() } });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ participants: [] })));
  await new ChatRoom({ storage } as unknown as DurableObjectState, SELF).alarm();
  expect(storage.alarm).toBeNull();
});
