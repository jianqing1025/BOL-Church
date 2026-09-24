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
