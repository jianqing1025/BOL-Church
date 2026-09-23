import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeetingSocket } from './meetingSocket';

class FakeSocket extends EventTarget {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  send = vi.fn();
  constructor(public url: string) { super(); FakeSocket.instances.push(this); }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  close(code = 1000) {
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event('close'), { code }));
  }
  receive(message: object) {
    this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(message) }));
  }
}

const params = { roomId: 'bible-study-1', name: 'Host', password: 'test', isHost: true };
const contents = { type: 'bible', action: 'contents' } as const;
const passage = { type: 'bible', action: 'passage', bookId: 19, chapter: 23 } as const;

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('window', { location: { protocol: 'https:', host: 'church.test' } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Bible synchronization transport', () => {
  it('delivers an opening made before the connection is ready', () => {
    const socket = new MeetingSocket({ onMessage: vi.fn() });
    socket.connect(params);
    socket.sendBible(contents);
    const ws = FakeSocket.instances[0];
    expect(ws.send).not.toHaveBeenCalled();
    ws.open();
    expect(ws.send).toHaveBeenCalledExactlyOnceWith(JSON.stringify(contents));
  });

  it('keeps the latest navigation and does not let scrolling replace it', () => {
    const socket = new MeetingSocket({ onMessage: vi.fn() });
    socket.connect(params);
    socket.sendBible(contents);
    socket.sendBible(passage);
    socket.sendBible({ ...passage, action: 'scroll', verse: 3 });
    FakeSocket.instances[0].open();
    expect(FakeSocket.instances[0].send).toHaveBeenCalledExactlyOnceWith(JSON.stringify(passage));
  });

  it('reconnects members after interruption and receives the room position', () => {
    const onMessage = vi.fn();
    const onClose = vi.fn();
    const socket = new MeetingSocket({ onMessage, onClose });
    socket.connect({ ...params, isHost: false });
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].close(1006);
    vi.advanceTimersByTime(1000);
    const retry = FakeSocket.instances[1];
    expect(new URL(retry.url).searchParams.get('host')).toBe('0');
    retry.open();
    retry.receive(passage);
    expect(onMessage).toHaveBeenCalledWith(passage);
    expect(onClose).toHaveBeenCalledWith({ authFailed: false });
  });

  it('retries failed reconnects and sends navigation made while disconnected', () => {
    const socket = new MeetingSocket({ onMessage: vi.fn() });
    socket.connect(params);
    FakeSocket.instances[0].open();
    FakeSocket.instances[0].close(1006);
    socket.sendBible(contents);
    vi.advanceTimersByTime(1000);
    FakeSocket.instances[1].close(1006);
    vi.advanceTimersByTime(2000);
    FakeSocket.instances[2].open();
    expect(FakeSocket.instances[2].send).toHaveBeenCalledWith(JSON.stringify(contents));
  });

  it('does not reconnect after an initial rejection or removal by the host', () => {
    const onClose = vi.fn();
    const socket = new MeetingSocket({ onMessage: vi.fn(), onClose });
    socket.connect(params);
    FakeSocket.instances[0].close(1006);
    expect(onClose).toHaveBeenCalledWith({ authFailed: true });
    const member = new MeetingSocket({ onMessage: vi.fn() });
    member.connect(params);
    FakeSocket.instances[1].open();
    FakeSocket.instances[1].close(1000);
    vi.runAllTimers();
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('cancels reconnection and ignores stale messages after leaving', () => {
    const onMessage = vi.fn();
    const socket = new MeetingSocket({ onMessage });
    socket.connect(params);
    const ws = FakeSocket.instances[0];
    ws.open();
    ws.close(1006);
    socket.close();
    ws.receive(contents);
    vi.runAllTimers();
    expect(FakeSocket.instances).toHaveLength(1);
    expect(onMessage).not.toHaveBeenCalled();
  });
});
