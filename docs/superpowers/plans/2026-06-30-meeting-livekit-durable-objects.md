# Meeting v2 — LiveKit + Durable Object Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the Jitsi `/meeting` with real-time text chat (Cloudflare Durable Objects + WebSocket) and LiveKit video, in the existing React SPA + `server.ts` Worker.

**Architecture:** Backend pure modules + a `ChatRoom` Durable Object under `Church/meeting/`, wired into `Church/server.ts` (routes + DO re-export) with LiveKit JWTs hand-signed via Web Crypto. Frontend React components under `Church/components/meeting/` plus `Church/services/{meetingSocket,livekitService}.ts`, using `livekit-client`. Shared room whitelist in `Church/constants/meetingRooms.ts`.

**Tech Stack:** React 19, TypeScript, Vite, Cloudflare Workers + Durable Objects (SQLite class), WebSocket, LiveKit (`livekit-client` + hand-signed HS256 token), Vitest (node env).

**Conventions:** Commit as the author only — NO `Co-Authored-By` trailer. Tests run in node env; add `meeting/**/*.test.ts` to the vitest include. All new backend logic that can be pure is extracted into pure modules and unit-tested. Use the `(cd Church && ...)` subshell form for commands (Git Bash at repo root).

**Key repo facts:**
- Worker entry `Church/server.ts` = `const worker: ExportedHandler<Env> = { async fetch(request, env) {...} }; export default worker;`. Response helpers already exist: `json(data, status=200)`, `badRequest(msg)`, `unauthorized(msg)`, `notFound(msg)` (near line 304). The `/api/...` if-chain starts ~line 3732; SPA asset fallback is the last thing in `fetch`.
- `Env` is a `type Env = {...}` at the top of `server.ts`.
- React root uses `<React.StrictMode>` — effects run twice in dev; all connect/subscribe logic must be idempotent and clean up on unmount.
- `.dev.vars` (gitignored) already holds `CHAT_PASSWORD`, `ALLOWED_ORIGIN`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. `wrangler.toml` is gitignored; `wrangler.example.toml` is the tracked template.
- The Jitsi version is preserved at tag `meeting-jitsi-v1`.

---

## Task 1: Rewrite the rooms model (shared whitelist)

**Files:**
- Modify: `Church/vitest.config.ts`
- Rewrite: `Church/constants/meetingRooms.ts`
- Rewrite: `Church/constants/meetingRooms.test.ts`

- [ ] **Step 1: Add the meeting test glob**

In `Church/vitest.config.ts`, add `'meeting/**/*.test.ts'` to the `include` array (keep the existing entries). Final array:
```ts
    include: [
      'sync/**/*.test.ts',
      'live/**/*.test.ts',
      'constants/**/*.test.ts',
      'components/**/*.test.ts',
      'meeting/**/*.test.ts',
    ],
```

- [ ] **Step 2: Replace the test**

Overwrite `Church/constants/meetingRooms.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { MEETING_ROOMS, MEETING_ROOM_IDS, findMeetingRoom, livekitRoomName } from './meetingRooms';

describe('MEETING_ROOMS', () => {
  it('defines the five rooms with unique ids', () => {
    expect(MEETING_ROOM_IDS).toEqual(['lobby', 'bible-study-1', 'bible-study-2', 'bible-study-3', 'prayer']);
    expect(new Set(MEETING_ROOM_IDS).size).toBe(5);
  });
  it('marks only lobby as no-video', () => {
    expect(findMeetingRoom('lobby')?.hasVideo).toBe(false);
    for (const id of ['bible-study-1', 'bible-study-2', 'bible-study-3', 'prayer']) {
      expect(findMeetingRoom(id)?.hasVideo).toBe(true);
    }
  });
});

describe('findMeetingRoom', () => {
  it('resolves known ids and rejects the rest', () => {
    expect(findMeetingRoom('prayer')?.name).toBe('医治祷告');
    expect(findMeetingRoom('nope')).toBeUndefined();
    expect(findMeetingRoom('')).toBeUndefined();
    expect(findMeetingRoom(null)).toBeUndefined();
    expect(findMeetingRoom(undefined)).toBeUndefined();
  });
});

describe('livekitRoomName', () => {
  it('prefixes the room id', () => {
    expect(livekitRoomName('bible-study-1')).toBe('bolccop-bible-study-1');
    expect(livekitRoomName('prayer')).toBe('bolccop-prayer');
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

Run: `(cd Church && npx vitest run constants/meetingRooms.test.ts)` — FAIL (exports changed / removed).

- [ ] **Step 4: Rewrite the implementation**

Overwrite `Church/constants/meetingRooms.ts`:
```ts
export type MeetingRoomType = 'chat' | 'bible' | 'prayer';

export interface MeetingRoom {
  /** Whitelist key, route/selection id, and LiveKit room suffix. */
  id: string;
  /** Display name (zh). */
  name: string;
  type: MeetingRoomType;
  hasVideo: boolean;
}

export const MEETING_ROOMS: readonly MeetingRoom[] = [
  { id: 'lobby',         name: '大厅',         type: 'chat',   hasVideo: false },
  { id: 'bible-study-1', name: '联合小组查经', type: 'bible',  hasVideo: true  },
  { id: 'bible-study-2', name: '弟兄小组查经', type: 'bible',  hasVideo: true  },
  { id: 'bible-study-3', name: '姐妹小组查经', type: 'bible',  hasVideo: true  },
  { id: 'prayer',        name: '医治祷告',     type: 'prayer', hasVideo: true  },
] as const;

export const MEETING_ROOM_IDS: readonly string[] = MEETING_ROOMS.map((r) => r.id);

export function findMeetingRoom(id: string | null | undefined): MeetingRoom | undefined {
  if (!id) return undefined;
  return MEETING_ROOMS.find((r) => r.id === id);
}

export function livekitRoomName(id: string): string {
  return `bolccop-${id}`;
}
```

- [ ] **Step 5: Run test, expect PASS**

Run: `(cd Church && npx vitest run constants/meetingRooms.test.ts)` — PASS.

- [ ] **Step 6: Commit**
```bash
git add Church/vitest.config.ts Church/constants/meetingRooms.ts Church/constants/meetingRooms.test.ts
git commit -m "feat(meeting): rewrite rooms model for chat/video v2"
```

---

## Task 2: Chat protocol pure helpers + types

**Files:**
- Create: `Church/meeting/chatProtocol.ts`
- Test: `Church/meeting/chatProtocol.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Church/meeting/chatProtocol.test.ts`. Note: `'\n'` is a real newline and `''` is a BEL control char at runtime — the assertions verify newlines survive and control chars are stripped:
```ts
import { describe, it, expect } from 'vitest';
import { sanitizeText, sanitizeName, trimHistory, MAX_TEXT, MAX_HISTORY, type ChatMessage } from './chatProtocol';

describe('sanitizeText', () => {
  it('trims, caps at MAX_TEXT, keeps newlines, strips control chars', () => {
    expect(sanitizeText('  hi  ')).toBe('hi');
    expect(sanitizeText('a\nb')).toBe('a\nb');        // newline preserved
    expect(sanitizeText('a\u0007b')).toBe('ab');      // BEL control char stripped
    expect(sanitizeText('x'.repeat(MAX_TEXT + 50))?.length).toBe(MAX_TEXT);
  });
  it('returns null for empty / non-string', () => {
    expect(sanitizeText('   ')).toBeNull();
    expect(sanitizeText('')).toBeNull();
    expect(sanitizeText(42 as unknown)).toBeNull();
  });
});

describe('sanitizeName', () => {
  it('trims, collapses whitespace, caps at 30', () => {
    expect(sanitizeName('  An   dy ')).toBe('An dy');
    expect(sanitizeName('y'.repeat(40))?.length).toBe(30);
  });
  it('returns null for empty / non-string', () => {
    expect(sanitizeName('  ')).toBeNull();
    expect(sanitizeName(null as unknown)).toBeNull();
  });
});

describe('trimHistory', () => {
  it('keeps only the last MAX_HISTORY messages', () => {
    const make = (i: number): ChatMessage => ({ type: 'message', id: String(i), userId: 'u', name: 'n', text: 't', createdAt: i });
    const arr = Array.from({ length: MAX_HISTORY + 10 }, (_, i) => make(i));
    const trimmed = trimHistory(arr);
    expect(trimmed.length).toBe(MAX_HISTORY);
    expect(trimmed[0].id).toBe('10');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `(cd Church && npx vitest run meeting/chatProtocol.test.ts)` — FAIL (module missing).

- [ ] **Step 3: Implement**

Create `Church/meeting/chatProtocol.ts`. IMPORTANT: type the control-char regex with the exact unicode escapes shown (it keeps `\t`, `\n`, `\r` and strips the other C0 controls) — do not paste literal control characters:
```ts
// Message protocol shared by the ChatRoom Durable Object and the frontend.
// Pure + isomorphic (no server APIs) so both sides import the same source.

export const MAX_TEXT = 1000;
export const MAX_NAME = 30;
export const MAX_HISTORY = 100;

export interface ChatMessage {
  type: 'message';
  id: string;
  userId: string;
  name: string;
  text: string;
  createdAt: number;
}
export interface SystemMessage {
  type: 'system';
  text: string;
  createdAt: number;
}
export interface PresenceMessage {
  type: 'presence';
  users: { id: string; name: string }[];
}
export interface WelcomeMessage {
  type: 'welcome';
  roomId: string;
  userId: string;
  messages: ChatMessage[];
}
export type ServerMessage = ChatMessage | SystemMessage | PresenceMessage | WelcomeMessage;

export interface ClientMessage {
  type: 'message';
  text: string;
}

// Strip C0 control chars but keep tab, LF, CR.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export function sanitizeText(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(CONTROL_CHARS, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_TEXT);
}

export function sanitizeName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_NAME);
}

export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.length > MAX_HISTORY ? messages.slice(messages.length - MAX_HISTORY) : messages;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `(cd Church && npx vitest run meeting/chatProtocol.test.ts)` — PASS.

- [ ] **Step 5: Commit**
```bash
git add Church/meeting/chatProtocol.ts Church/meeting/chatProtocol.test.ts
git commit -m "feat(meeting): chat message protocol + sanitizers"
```

---

## Task 3: LiveKit token signer (Web Crypto HS256)

**Files:**
- Create: `Church/meeting/livekitToken.ts`
- Test: `Church/meeting/livekitToken.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Church/meeting/livekitToken.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createLiveKitToken } from './livekitToken';

function decodeSegment(seg: string): any {
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(Buffer.from(pad, 'base64').toString('utf8'));
}

describe('createLiveKitToken', () => {
  it('produces a signed JWT with the LiveKit video grant', async () => {
    const token = await createLiveKitToken({
      apiKey: 'devkey', apiSecret: 'devsecret',
      identity: 'user-1', name: 'Andy', roomName: 'bolccop-prayer', ttlSeconds: 3600,
    });
    const [h, p, s] = token.split('.');
    expect(h && p && s).toBeTruthy();
    expect(decodeSegment(h)).toEqual({ alg: 'HS256', typ: 'JWT' });
    const payload = decodeSegment(p);
    expect(payload.iss).toBe('devkey');
    expect(payload.sub).toBe('user-1');
    expect(payload.name).toBe('Andy');
    expect(payload.video).toMatchObject({ room: 'bolccop-prayer', roomJoin: true, canPublish: true, canSubscribe: true });
    expect(payload.exp).toBeGreaterThan(payload.nbf);
  });

  it('signs with HMAC-SHA256 verifiable by the secret', async () => {
    const token = await createLiveKitToken({
      apiKey: 'k', apiSecret: 'topsecret', identity: 'i', name: 'n', roomName: 'r',
    });
    const [h, p, s] = token.split('.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('topsecret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigB64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const sigPad = sigB64 + '='.repeat((4 - (sigB64.length % 4)) % 4);
    const sig = Uint8Array.from(Buffer.from(sigPad, 'base64'));
    const ok = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `(cd Church && npx vitest run meeting/livekitToken.test.ts)` — FAIL (module missing).

- [ ] **Step 3: Implement**

Create `Church/meeting/livekitToken.ts`:
```ts
// Hand-signed LiveKit access token (JWT HS256) using Web Crypto — runs on the
// Cloudflare Workers runtime with no external SDK. Node 18+ (vitest) also has
// globalThis.crypto.subtle, so the same code is testable.

function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface LiveKitTokenParams {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name: string;
  roomName: string;
  ttlSeconds?: number;
}

export async function createLiveKitToken(p: LiveKitTokenParams): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = p.ttlSeconds ?? 6 * 60 * 60; // 6h
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: p.apiKey,
    sub: p.identity,
    name: p.name,
    nbf: now,
    iat: now,
    exp: now + ttl,
    video: {
      room: p.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(p.apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `(cd Church && npx vitest run meeting/livekitToken.test.ts)` — PASS.

- [ ] **Step 5: Commit**
```bash
git add Church/meeting/livekitToken.ts Church/meeting/livekitToken.test.ts
git commit -m "feat(meeting): hand-signed LiveKit HS256 token"
```

---

## Task 4: Request validators

**Files:**
- Create: `Church/meeting/meetingValidation.ts`
- Test: `Church/meeting/meetingValidation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Church/meeting/meetingValidation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateAuth, validateJoin, validateVideo } from './meetingValidation';

const PW = '110550';

describe('validateAuth', () => {
  it('accepts a good name + password', () => {
    expect(validateAuth({ name: 'Andy', password: PW }, PW)).toEqual({ ok: true, name: 'Andy' });
  });
  it('rejects bad password and empty name', () => {
    expect(validateAuth({ name: 'Andy', password: 'x' }, PW).ok).toBe(false);
    expect(validateAuth({ name: '   ', password: PW }, PW).ok).toBe(false);
    expect(validateAuth({ name: 'Andy', password: PW }, undefined).ok).toBe(false);
  });
});

describe('validateJoin', () => {
  it('accepts a known room with good credentials', () => {
    const r = validateJoin({ roomId: 'lobby', name: 'Andy', password: PW }, PW);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.room.id).toBe('lobby'); expect(r.name).toBe('Andy'); }
  });
  it('rejects unknown room / bad password / empty name', () => {
    expect(validateJoin({ roomId: 'nope', name: 'A', password: PW }, PW).ok).toBe(false);
    expect(validateJoin({ roomId: 'lobby', name: 'A', password: 'x' }, PW).ok).toBe(false);
    expect(validateJoin({ roomId: 'lobby', name: '', password: PW }, PW).ok).toBe(false);
  });
});

describe('validateVideo', () => {
  it('accepts a video room', () => {
    expect(validateVideo({ roomId: 'prayer', name: 'A', password: PW }, PW).ok).toBe(true);
  });
  it('rejects the lobby (no video) with status 403', () => {
    const r = validateVideo({ roomId: 'lobby', name: 'A', password: PW }, PW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `(cd Church && npx vitest run meeting/meetingValidation.test.ts)` — FAIL.

- [ ] **Step 3: Implement**

Create `Church/meeting/meetingValidation.ts`:
```ts
import { findMeetingRoom, type MeetingRoom } from '../constants/meetingRooms';
import { sanitizeName } from './chatProtocol';

type Fail = { ok: false; status: number; error: string };
type AuthOk = { ok: true; name: string };
type RoomOk = { ok: true; room: MeetingRoom; name: string };

interface Creds { name?: string | null; password?: string | null; }
interface RoomCreds extends Creds { roomId?: string | null; }

function checkName(name?: string | null): string | Fail {
  const clean = sanitizeName(name);
  if (!clean) return { ok: false, status: 400, error: 'Name required' };
  return clean;
}
function checkPassword(password: string | null | undefined, chatPassword: string | undefined): Fail | null {
  if (!chatPassword || password !== chatPassword) return { ok: false, status: 401, error: 'Invalid password' };
  return null;
}

export function validateAuth(creds: Creds, chatPassword: string | undefined): AuthOk | Fail {
  const name = checkName(creds.name);
  if (typeof name !== 'string') return name;
  const pw = checkPassword(creds.password, chatPassword);
  if (pw) return pw;
  return { ok: true, name };
}

export function validateJoin(creds: RoomCreds, chatPassword: string | undefined): RoomOk | Fail {
  const room = findMeetingRoom(creds.roomId);
  if (!room) return { ok: false, status: 400, error: 'Unknown room' };
  const name = checkName(creds.name);
  if (typeof name !== 'string') return name;
  const pw = checkPassword(creds.password, chatPassword);
  if (pw) return pw;
  return { ok: true, room, name };
}

export function validateVideo(creds: RoomCreds, chatPassword: string | undefined): RoomOk | Fail {
  const joined = validateJoin(creds, chatPassword);
  if (!joined.ok) return joined;
  if (!joined.room.hasVideo) return { ok: false, status: 403, error: 'Room has no video' };
  return joined;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `(cd Church && npx vitest run meeting/meetingValidation.test.ts)` — PASS.

- [ ] **Step 5: Commit**
```bash
git add Church/meeting/meetingValidation.ts Church/meeting/meetingValidation.test.ts
git commit -m "feat(meeting): request validators for auth/join/video"
```

---

## Task 5: ChatRoom Durable Object

**Files:**
- Create: `Church/meeting/chatRoom.ts`

No unit test (runtime DO behavior is verified by manual smoke test; its logic is already covered by `chatProtocol` tests). Type-check gate only.

- [ ] **Step 1: Implement**

Create `Church/meeting/chatRoom.ts`:
```ts
/// <reference types="@cloudflare/workers-types" />
import {
  sanitizeText,
  trimHistory,
  type ChatMessage,
  type ServerMessage,
} from './chatProtocol';

interface Session { id: string; name: string; }

/**
 * One instance per room (addressed via idFromName(roomId)). Password and roomId
 * are validated by the Worker before the socket is forwarded here, so the DO
 * trusts the connection. History is kept in memory (last 100); persistence /
 * hibernation is future work.
 */
export class ChatRoom {
  private sessions = new Map<WebSocket, Session>();
  private messages: ChatMessage[] = [];

  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId') || 'lobby';
    const id = url.searchParams.get('uid') || crypto.randomUUID();
    const name = url.searchParams.get('name') || 'Guest';

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.sessions.set(server, { id, name });

    this.sendTo(server, { type: 'welcome', roomId, userId: id, messages: this.messages });
    this.broadcast({ type: 'system', text: `${name} 加入了房间`, createdAt: Date.now() });
    this.broadcastPresence();

    server.addEventListener('message', (event: MessageEvent) => {
      let parsed: unknown;
      try { parsed = JSON.parse(typeof event.data === 'string' ? event.data : ''); } catch { return; }
      if (!parsed || (parsed as { type?: string }).type !== 'message') return;
      const text = sanitizeText((parsed as { text?: unknown }).text);
      if (!text) return;
      const msg: ChatMessage = { type: 'message', id: crypto.randomUUID(), userId: id, name, text, createdAt: Date.now() };
      this.messages.push(msg);
      this.messages = trimHistory(this.messages);
      this.broadcast(msg);
    });

    const cleanup = () => {
      if (!this.sessions.has(server)) return;
      this.sessions.delete(server);
      this.broadcast({ type: 'system', text: `${name} 离开了房间`, createdAt: Date.now() });
      this.broadcastPresence();
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  private sendTo(ws: WebSocket, message: ServerMessage): void {
    try { ws.send(JSON.stringify(message)); } catch { this.sessions.delete(ws); }
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.sessions.keys()) {
      try { ws.send(payload); } catch { this.sessions.delete(ws); }
    }
  }

  private broadcastPresence(): void {
    const users = [...this.sessions.values()].map((s) => ({ id: s.id, name: s.name }));
    this.broadcast({ type: 'presence', users });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `(cd Church && npx tsc --noEmit)` — no errors referencing `chatRoom.ts`. (Pre-existing `SermonManager.tsx` errors are known/unrelated.)

- [ ] **Step 3: Commit**
```bash
git add Church/meeting/chatRoom.ts
git commit -m "feat(meeting): ChatRoom durable object (websocket chat)"
```

---

## Task 6: Meeting API handler + wire into server.ts + wrangler

**Files:**
- Create: `Church/meeting/meetingApi.ts`
- Modify: `Church/server.ts` (Env type, route dispatch, DO re-export)
- Modify: `Church/wrangler.toml` and `Church/wrangler.example.toml`

- [ ] **Step 1: Create the API handler**

Create `Church/meeting/meetingApi.ts`:
```ts
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
    return jsonCors(env, { rooms: MEETING_ROOMS });
  }

  if (path === '/api/meeting/verify' && request.method === 'POST') {
    const body = await request.json().catch(() => ({})) as { name?: string; password?: string };
    const v = validateAuth({ name: body.name, password: body.password }, env.CHAT_PASSWORD);
    if (!v.ok) return jsonCors(env, { error: v.error }, v.status);
    return jsonCors(env, { ok: true });
  }

  if (path === '/api/meeting/livekit-token' && request.method === 'POST') {
    const body = await request.json().catch(() => ({})) as { roomId?: string; name?: string; password?: string };
    const v = validateVideo({ roomId: body.roomId, name: body.name, password: body.password }, env.CHAT_PASSWORD);
    if (!v.ok) return jsonCors(env, { error: v.error }, v.status);
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
    if (!v.ok) return jsonCors(env, { error: v.error }, v.status);

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
```

- [ ] **Step 2: Extend the `Env` type in `server.ts`**

Add these fields to the `type Env = { ... }` block:
```ts
  CHAT_ROOM: DurableObjectNamespace;
  CHAT_PASSWORD?: string;
  ALLOWED_ORIGIN?: string;
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
```

- [ ] **Step 3: Import + re-export the DO and add the route**

Near the top imports of `server.ts`, add:
```ts
import { ChatRoom } from './meeting/chatRoom';
import { handleMeeting } from './meeting/meetingApi';
```
At the very top of the `fetch(request, env)` body — immediately after `const url = new URL(request.url);` — add:
```ts
    const meetingResponse = await handleMeeting(request, env, url);
    if (meetingResponse) return meetingResponse;
```
At the bottom of the file, next to `export default worker;`, add the DO class re-export (Wrangler resolves `class_name` from the entry module's exports):
```ts
export { ChatRoom };
```

- [ ] **Step 4: Add the DO binding + migration to `wrangler.toml`**

Append to `Church/wrangler.toml`:
```toml
[[durable_objects.bindings]]
name = "CHAT_ROOM"
class_name = "ChatRoom"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["ChatRoom"]
```
Make the same addition to the tracked template `Church/wrangler.example.toml`, and in that template document the required secrets as a comment (do NOT put real secret values anywhere):
```toml
# Meeting v2 secrets (set via `wrangler secret put` in prod, .dev.vars locally):
#   CHAT_PASSWORD, ALLOWED_ORIGIN, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
```

- [ ] **Step 5: Type-check**

Run: `(cd Church && npx tsc --noEmit)` — no NEW errors (SermonManager pre-existing errors excepted). Confirm `DurableObjectNamespace` / `DurableObjectState` resolve (they come from `@cloudflare/workers-types`, already referenced at the top of `server.ts`).

- [ ] **Step 6: Commit**
```bash
git add Church/meeting/meetingApi.ts Church/server.ts Church/wrangler.toml Church/wrangler.example.toml
git commit -m "feat(meeting): wire meeting API + ChatRoom DO into worker"
```

---

## Task 7: Trim meetingAuth to name helpers

**Files:**
- Modify: `Church/components/meeting/meetingAuth.ts`
- Modify: `Church/components/meeting/meetingAuth.test.ts`

The client no longer holds the password (server validates it). Keep only the name helpers + the name storage key.

- [ ] **Step 1: Rewrite the test**

Overwrite `Church/components/meeting/meetingAuth.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeDisplayName, isValidDisplayName, MEETING_NAME_KEY } from './meetingAuth';

describe('normalizeDisplayName', () => {
  it('trims, collapses inner whitespace, caps length at 30', () => {
    expect(normalizeDisplayName('  John   Doe ')).toBe('John Doe');
    expect(normalizeDisplayName('x'.repeat(40)).length).toBe(30);
  });
});
describe('isValidDisplayName', () => {
  it('requires a non-whitespace character', () => {
    expect(isValidDisplayName('Mary')).toBe(true);
    expect(isValidDisplayName('   ')).toBe(false);
  });
});
describe('MEETING_NAME_KEY', () => {
  it('is the stable storage key', () => {
    expect(MEETING_NAME_KEY).toBe('bolccop-meeting-name');
  });
});
```

- [ ] **Step 2: Run test** (may still pass — this is a safety net). Run: `(cd Church && npx vitest run components/meeting/meetingAuth.test.ts)`.

- [ ] **Step 3: Rewrite the module**

Overwrite `Church/components/meeting/meetingAuth.ts`:
```ts
/** Display-name helpers for the meeting entry form. The room password is
 *  validated server-side (CHAT_PASSWORD), so no password logic lives here. */
export const MEETING_NAME_KEY = 'bolccop-meeting-name';

const MAX_NAME_LENGTH = 30;

export function normalizeDisplayName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

export function isValidDisplayName(input: string): boolean {
  return normalizeDisplayName(input).length > 0;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `(cd Church && npx vitest run components/meeting/meetingAuth.test.ts)` — PASS.

- [ ] **Step 5: Commit**
```bash
git add Church/components/meeting/meetingAuth.ts Church/components/meeting/meetingAuth.test.ts
git commit -m "refactor(meeting): trim client auth to name helpers"
```

---

## Task 8: Delete Jitsi components

**Files:**
- Delete: `Church/components/meeting/MeetingGate.tsx`
- Delete: `Church/components/meeting/MeetingCard.tsx`
- Delete: `Church/components/meeting/JoinNameModal.tsx`
- Delete: `Church/components/meeting/MeetingRoom.tsx`

- [ ] **Step 1: Remove the files**
```bash
git rm Church/components/meeting/MeetingGate.tsx Church/components/meeting/MeetingCard.tsx Church/components/meeting/JoinNameModal.tsx Church/components/meeting/MeetingRoom.tsx
```

- [ ] **Step 2: Confirm no lingering Jitsi references**

Run: `(cd Church && grep -rn "MeetingGate\|MeetingCard\|JoinNameModal\|meet.jit.si\|external_api\|JitsiMeetExternalAPI" . --include=*.ts --include=*.tsx | grep -v node_modules | grep -v dist)`
Expected: no output. (`MeetingPage.tsx` is rewritten in Task 12; if the only remaining hits are inside `MeetingPage.tsx`, note them — they are resolved there.)

- [ ] **Step 3: Commit**
```bash
git commit -m "chore(meeting): remove Jitsi components"
```

---

## Task 9: Frontend services (socket + LiveKit) + dependency

**Files:**
- Modify: `Church/package.json` (add `livekit-client`)
- Create: `Church/services/meetingSocket.ts`
- Create: `Church/services/livekitService.ts`

- [ ] **Step 1: Add the dependency**

Run: `(cd Church && npm install livekit-client@^2)`
Verify `livekit-client` appears under `dependencies` in `Church/package.json`.

- [ ] **Step 2: Create the chat socket wrapper**

Create `Church/services/meetingSocket.ts`:
```ts
import type { ServerMessage } from '../meeting/chatProtocol';

export interface MeetingSocketHandlers {
  onMessage: (message: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: (info: { authFailed: boolean }) => void;
  onError?: (error: unknown) => void;
}

export interface MeetingSocketParams {
  roomId: string;
  name: string;
  password: string;
}

/**
 * Thin WebSocket wrapper for the meeting chat. Idempotent close so React
 * StrictMode double-mount / unmount is safe.
 */
export class MeetingSocket {
  private ws: WebSocket | null = null;
  private opened = false;
  private closed = false;

  constructor(private handlers: MeetingSocketHandlers) {}

  connect(params: MeetingSocketParams): void {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = new URL(`${proto}://${window.location.host}/api/meeting/ws`);
    url.searchParams.set('roomId', params.roomId);
    url.searchParams.set('name', params.name);
    url.searchParams.set('password', params.password);

    const ws = new WebSocket(url.toString());
    this.ws = ws;

    ws.addEventListener('open', () => { this.opened = true; this.handlers.onOpen?.(); });
    ws.addEventListener('message', (event) => {
      try { this.handlers.onMessage(JSON.parse(event.data as string) as ServerMessage); } catch { /* ignore */ }
    });
    ws.addEventListener('error', (event) => this.handlers.onError?.(event));
    ws.addEventListener('close', () => {
      if (this.closed) return;
      this.closed = true;
      // Closing before it ever opened almost always means the Worker rejected
      // the credentials/room (it returns a 4xx instead of upgrading).
      this.handlers.onClose?.({ authFailed: !this.opened });
    });
  }

  send(text: string): void {
    if (this.ws && this.opened && !this.closed) {
      this.ws.send(JSON.stringify({ type: 'message', text }));
    }
  }

  close(): void {
    this.closed = true;
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }
}
```

- [ ] **Step 3: Create the LiveKit wrapper**

Create `Church/services/livekitService.ts`:
```ts
import { Room, RoomEvent, Track, type RemoteParticipant, type LocalParticipant, type Participant } from 'livekit-client';

export interface LiveKitHandlers {
  onParticipantsChanged: (participants: Participant[]) => void;
  onError?: (error: unknown) => void;
}

export interface LiveKitConnectParams {
  roomId: string;
  name: string;
  password: string;
}

/** Wraps a single LiveKit Room connection and the local track toggles. */
export class LiveKitService {
  private room: Room | null = null;
  constructor(private handlers: LiveKitHandlers) {}

  get localParticipant(): LocalParticipant | undefined {
    return this.room?.localParticipant;
  }

  private emit(): void {
    if (!this.room) return;
    const remote: RemoteParticipant[] = [...this.room.remoteParticipants.values()];
    this.handlers.onParticipantsChanged([this.room.localParticipant, ...remote]);
  }

  async connect(params: LiveKitConnectParams): Promise<void> {
    const res = await fetch('/api/meeting/livekit-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const info = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(info.error || `Token request failed (${res.status})`);
    }
    const { url, token } = await res.json() as { url: string; token: string };

    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;
    room
      .on(RoomEvent.ParticipantConnected, () => this.emit())
      .on(RoomEvent.ParticipantDisconnected, () => this.emit())
      .on(RoomEvent.TrackSubscribed, () => this.emit())
      .on(RoomEvent.TrackUnsubscribed, () => this.emit())
      .on(RoomEvent.LocalTrackPublished, () => this.emit())
      .on(RoomEvent.LocalTrackUnpublished, () => this.emit())
      .on(RoomEvent.Disconnected, () => this.emit());

    await room.connect(url, token);
    await room.localParticipant.setCameraEnabled(true).catch(() => undefined);
    await room.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
    this.emit();
  }

  async toggleMic(): Promise<boolean> {
    const p = this.room?.localParticipant;
    if (!p) return false;
    const enabled = !p.isMicrophoneEnabled;
    await p.setMicrophoneEnabled(enabled);
    this.emit();
    return enabled;
  }

  async toggleCamera(): Promise<boolean> {
    const p = this.room?.localParticipant;
    if (!p) return false;
    const enabled = !p.isCameraEnabled;
    await p.setCameraEnabled(enabled);
    this.emit();
    return enabled;
  }

  async toggleScreenShare(): Promise<boolean> {
    const p = this.room?.localParticipant;
    if (!p) return false;
    const enabled = !p.isScreenShareEnabled;
    await p.setScreenShareEnabled(enabled);
    this.emit();
    return enabled;
  }

  disconnect(): void {
    try { this.room?.disconnect(); } catch { /* ignore */ }
    this.room = null;
  }

  /** Attach a participant's first video track to an element; returns cleanup. */
  static attachVideo(participant: Participant, el: HTMLVideoElement): () => void {
    const pub = [...participant.videoTrackPublications.values()].find((p) => p.track && p.source === Track.Source.Camera)
      || [...participant.videoTrackPublications.values()].find((p) => p.track);
    const track = pub?.track;
    if (track) track.attach(el);
    return () => { try { track?.detach(el); } catch { /* ignore */ } };
  }
}
```

- [ ] **Step 4: Type-check**

Run: `(cd Church && npx tsc --noEmit)` — no NEW errors in the two service files. (If `livekit-client`'s installed v2 minor exposes slightly different type names, adjust the imports to the real exported names rather than inventing — check `node_modules/livekit-client` typings; `Room`, `RoomEvent`, `Track`, `Participant`, `RemoteParticipant`, `LocalParticipant` are stable public exports.)

- [ ] **Step 5: Commit**
```bash
git add Church/package.json Church/package-lock.json Church/services/meetingSocket.ts Church/services/livekitService.ts
git commit -m "feat(meeting): chat socket + LiveKit client services"
```

---

## Task 10: React UI — presentational components

**Files:**
- Create: `Church/components/meeting/RoomList.tsx`
- Create: `Church/components/meeting/MessageList.tsx`
- Create: `Church/components/meeting/MemberList.tsx`
- Create: `Church/components/meeting/ChatInput.tsx`

- [ ] **Step 1: RoomList**

Create `Church/components/meeting/RoomList.tsx`:
```tsx
import React from 'react';
import { Video } from 'lucide-react';
import type { MeetingRoom } from '../../constants/meetingRooms';

interface RoomListProps {
  rooms: readonly MeetingRoom[];
  activeId: string | null;
  onSelect: (room: MeetingRoom) => void;
}

export const RoomList: React.FC<RoomListProps> = ({ rooms, activeId, onSelect }) => (
  <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
    {rooms.map((room) => {
      const active = room.id === activeId;
      return (
        <button
          key={room.id}
          type="button"
          onClick={() => onSelect(room)}
          className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-4 py-2.5 text-left text-sm font-semibold transition-colors md:w-full ${
            active ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          <span className="truncate">{room.name}</span>
          {room.hasVideo && <Video size={16} className={active ? 'text-white' : 'text-gray-400'} />}
        </button>
      );
    })}
  </div>
);

export default RoomList;
```

- [ ] **Step 2: MessageList**

Create `Church/components/meeting/MessageList.tsx`:
```tsx
import React, { useEffect, useRef } from 'react';
import type { ChatMessage, SystemMessage } from '../../meeting/chatProtocol';

export type DisplayMessage = ChatMessage | SystemMessage;

interface MessageListProps {
  messages: DisplayMessage[];
  ownUserId: string | null;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, ownUserId }) => {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-4">
      {messages.map((m, i) => {
        if (m.type === 'system') {
          return (
            <div key={`sys-${i}-${m.createdAt}`} className="text-center text-xs text-gray-400">
              {m.text}
            </div>
          );
        }
        const own = m.userId === ownUserId;
        return (
          <div key={m.id} className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
            {!own && <span className="mb-0.5 text-xs font-semibold text-gray-500">{m.name}</span>}
            <div className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
              own ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
            }`}>
              {m.text}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
};

export default MessageList;
```

- [ ] **Step 3: MemberList**

Create `Church/components/meeting/MemberList.tsx`:
```tsx
import React from 'react';
import { useLocalization } from '../../hooks/useLocalization';

interface MemberListProps {
  users: { id: string; name: string }[];
}

export const MemberList: React.FC<MemberListProps> = ({ users }) => {
  const { t } = useLocalization();
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3 text-sm font-bold text-gray-700">
        {t('meeting.members')} ({users.length})
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700">
            <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
            <span className="truncate">{u.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MemberList;
```

- [ ] **Step 4: ChatInput**

Create `Church/components/meeting/ChatInput.tsx`:
```tsx
import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';

interface ChatInputProps {
  disabled?: boolean;
  onSend: (text: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ disabled, onSend }) => {
  const { t } = useLocalization();
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed.slice(0, 1000));
    setText('');
  };

  return (
    <div className="flex items-center gap-2 border-t border-gray-200 bg-white p-3">
      <input
        type="text"
        value={text}
        maxLength={1000}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder={t('meeting.inputPlaceholder')}
        className="flex-1 rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !text.trim()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        aria-label={t('meeting.send')}
      >
        <Send size={18} />
      </button>
    </div>
  );
};

export default ChatInput;
```

- [ ] **Step 5: Type-check + commit**

Run: `(cd Church && npx tsc --noEmit)` — no NEW errors. (The `meeting.*` translation keys are added in Task 12; `t()` returns the key string if missing, so tsc is unaffected.)
```bash
git add Church/components/meeting/RoomList.tsx Church/components/meeting/MessageList.tsx Church/components/meeting/MemberList.tsx Church/components/meeting/ChatInput.tsx
git commit -m "feat(meeting): chat UI presentational components"
```

---

## Task 11: VideoPanel

**Files:**
- Create: `Church/components/meeting/VideoPanel.tsx`

- [ ] **Step 1: Implement**

Create `Church/components/meeting/VideoPanel.tsx`:
```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video as VideoIcon, VideoOff, ScreenShare, PhoneOff } from 'lucide-react';
import type { Participant } from 'livekit-client';
import { LiveKitService } from '../../services/livekitService';
import { useLocalization } from '../../hooks/useLocalization';
import type { MeetingRoom } from '../../constants/meetingRooms';

interface VideoPanelProps {
  room: MeetingRoom;
  name: string;
  password: string;
}

const ParticipantTile: React.FC<{ participant: Participant }> = ({ participant }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return LiveKitService.attachVideo(participant, ref.current);
  }, [participant]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
      <video ref={ref} autoPlay playsInline muted={participant.isLocal} className="h-full w-full object-cover" />
      <span className="absolute bottom-1 left-2 text-xs font-semibold text-white drop-shadow">
        {participant.name || participant.identity}
      </span>
    </div>
  );
};

export const VideoPanel: React.FC<VideoPanelProps> = ({ room, name, password }) => {
  const { t } = useLocalization();
  const serviceRef = useRef<LiveKitService | null>(null);
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => () => { serviceRef.current?.disconnect(); serviceRef.current = null; }, []);

  if (!room.hasVideo) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500">
        {t('meeting.lobbyChatOnly')}
      </div>
    );
  }

  const join = async () => {
    setConnecting(true);
    setError('');
    const service = new LiveKitService({
      onParticipantsChanged: (p) => setParticipants([...p]),
      onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    });
    serviceRef.current = service;
    try {
      await service.connect({ roomId: room.id, name, password });
      setJoined(true);
      setMicOn(service.localParticipant?.isMicrophoneEnabled ?? true);
      setCamOn(service.localParticipant?.isCameraEnabled ?? true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      service.disconnect();
      serviceRef.current = null;
    } finally {
      setConnecting(false);
    }
  };

  const leave = () => {
    serviceRef.current?.disconnect();
    serviceRef.current = null;
    setJoined(false);
    setParticipants([]);
  };

  if (!joined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg bg-gray-900 p-6 text-center">
        <p className="text-sm text-gray-300">{room.name}</p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="button"
          onClick={join}
          disabled={connecting}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
        >
          <VideoIcon size={18} />
          {connecting ? t('meeting.videoConnecting') : t('meeting.joinVideo')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-lg bg-gray-900 p-3">
      <div className="grid flex-1 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {participants.map((p) => <ParticipantTile key={p.sid || p.identity} participant={p} />)}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={async () => setMicOn(await serviceRef.current!.toggleMic())}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-700 text-white hover:bg-gray-600" aria-label="mic">
          {micOn ? <Mic size={18} /> : <MicOff size={18} className="text-red-400" />}
        </button>
        <button type="button" onClick={async () => setCamOn(await serviceRef.current!.toggleCamera())}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-700 text-white hover:bg-gray-600" aria-label="camera">
          {camOn ? <VideoIcon size={18} /> : <VideoOff size={18} className="text-red-400" />}
        </button>
        <button type="button" onClick={() => serviceRef.current?.toggleScreenShare()}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-700 text-white hover:bg-gray-600" aria-label="screen share">
          <ScreenShare size={18} />
        </button>
        <button type="button" onClick={leave}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700" aria-label="leave">
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
};

export default VideoPanel;
```

- [ ] **Step 2: Type-check + commit**

Run: `(cd Church && npx tsc --noEmit)` — no NEW errors. (Verify `Participant` exposes `sid`/`identity`/`name`/`isLocal`/`videoTrackPublications` in the installed livekit-client; these are stable. Adjust only if the installed typings differ.)
```bash
git add Church/components/meeting/VideoPanel.tsx
git commit -m "feat(meeting): LiveKit video panel"
```

---

## Task 12: MeetingPage orchestrator + translations + route cleanup

**Files:**
- Rewrite: `Church/components/meeting/MeetingPage.tsx`
- Modify: `Church/constants/translations.ts` (replace the `meeting` block)
- Modify: `Church/App.tsx` (drop the `/meeting/{seg}` branch)

- [ ] **Step 1: Replace the `meeting` translations block**

In `Church/constants/translations.ts`, replace the entire existing `meeting: { ... }` block (added during the Jitsi work) with:
```ts
  meeting: {
    pageTitle: { en: 'BOLCCOP Online Gathering', zh: 'BOLCCOP 在线聚会' },
    authName: { en: 'Your name', zh: '您的名字' },
    authPassword: { en: 'Room password', zh: '房间密码' },
    authEnter: { en: 'Continue', zh: '下一步' },
    authError: { en: 'Wrong password. Please try again.', zh: '密码错误，请重试。' },
    nameRequired: { en: 'Please enter your name.', zh: '请输入您的名字。' },
    pickRoom: { en: 'Choose a room', zh: '选择房间' },
    changeRoom: { en: 'Rooms', zh: '房间' },
    members: { en: 'Online', zh: '在线成员' },
    inputPlaceholder: { en: 'Type a message…', zh: '输入消息…' },
    send: { en: 'Send', zh: '发送' },
    joinVideo: { en: 'Join video', zh: '加入视频' },
    videoConnecting: { en: 'Connecting…', zh: '连接中…' },
    lobbyChatOnly: { en: 'The lobby is text chat only.', zh: '大厅仅支持文字聊天。' },
    leave: { en: 'Leave', zh: '离开' },
    disconnected: { en: 'Disconnected. Return to entry.', zh: '连接已断开，请重新进入。' },
    back: { en: 'Back', zh: '返回' },
  },
```
Leave the `footer.meeting` key as-is (still used).

- [ ] **Step 2: Drop the `/meeting/{seg}` route branch**

In `Church/App.tsx`, the meeting routes currently are:
```tsx
    if (route === '/meeting' || route === '/meeting/') {
      return <MeetingPage />;
    }
    if (route.startsWith('/meeting/')) {
      const segment = (route.split('/')[2] || '').split('?')[0];
      return <MeetingPage roomKey={segment} />;
    }
```
Replace BOTH branches with a single one (room selection is now in-app):
```tsx
    if (route === '/meeting' || route === '/meeting/' || route.startsWith('/meeting/')) {
      return <MeetingPage />;
    }
```
(`MeetingPage` no longer takes a `roomKey` prop.) Leave the `isHomePage` line's `!route.startsWith('/meeting')` exclusion untouched.

- [ ] **Step 3: Rewrite MeetingPage**

Overwrite `Church/components/meeting/MeetingPage.tsx`:
```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalization } from '../../hooks/useLocalization';
import { MEETING_ROOMS, type MeetingRoom } from '../../constants/meetingRooms';
import { isValidDisplayName, normalizeDisplayName, MEETING_NAME_KEY } from './meetingAuth';
import { MeetingSocket } from '../../services/meetingSocket';
import type { ServerMessage } from '../../meeting/chatProtocol';
import { RoomList } from './RoomList';
import { MessageList, type DisplayMessage } from './MessageList';
import { MemberList } from './MemberList';
import { ChatInput } from './ChatInput';
import { VideoPanel } from './VideoPanel';

type Stage = 'auth' | 'pick' | 'room';

const readName = (): string => {
  try { return localStorage.getItem(MEETING_NAME_KEY) || ''; } catch { return ''; }
};

export const MeetingPage: React.FC = () => {
  const { t } = useLocalization();
  const [stage, setStage] = useState<Stage>('auth');
  const [name, setName] = useState(readName);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [room, setRoom] = useState<MeetingRoom | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [ownUserId, setOwnUserId] = useState<string | null>(null);
  const socketRef = useRef<MeetingSocket | null>(null);

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  useEffect(() => () => closeSocket(), [closeSocket]);

  // Screen 1: verify name + password with the server.
  const submitAuth = async () => {
    if (!isValidDisplayName(name)) { setAuthError(t('meeting.nameRequired')); return; }
    setVerifying(true);
    setAuthError('');
    try {
      const res = await fetch('/api/meeting/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizeDisplayName(name), password }),
      });
      if (!res.ok) { setAuthError(t('meeting.authError')); return; }
      try { localStorage.setItem(MEETING_NAME_KEY, normalizeDisplayName(name)); } catch { /* ignore */ }
      setStage('pick');
    } catch {
      setAuthError(t('meeting.authError'));
    } finally {
      setVerifying(false);
    }
  };

  // Screen 2 → room: open the chat socket.
  const enterRoom = useCallback((target: MeetingRoom) => {
    closeSocket();
    setMessages([]);
    setMembers([]);
    setOwnUserId(null);
    setRoom(target);
    setStage('room');

    const socket = new MeetingSocket({
      onMessage: (msg: ServerMessage) => {
        if (msg.type === 'welcome') {
          setOwnUserId(msg.userId);
          setMessages(msg.messages);
        } else if (msg.type === 'message' || msg.type === 'system') {
          setMessages((prev) => [...prev, msg]);
        } else if (msg.type === 'presence') {
          setMembers(msg.users);
        }
      },
      onClose: ({ authFailed }) => {
        if (authFailed) { setStage('auth'); setAuthError(t('meeting.authError')); }
      },
    });
    socket.connect({ roomId: target.id, name: normalizeDisplayName(name), password });
    socketRef.current = socket;
  }, [closeSocket, name, password, t]);

  const leaveRoom = () => { closeSocket(); setRoom(null); setStage('pick'); };
  const send = (text: string) => socketRef.current?.send(text);

  // ── Screen 1: auth ──
  if (stage === 'auth') {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
          <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">{t('meeting.pageTitle')}</h1>
          <input
            type="text" value={name} maxLength={30}
            onChange={(e) => { setName(e.target.value); setAuthError(''); }}
            placeholder={t('meeting.authName')}
            className="mb-3 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <input
            type="password" value={password}
            onChange={(e) => { setPassword(e.target.value); setAuthError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void submitAuth(); }}
            placeholder={t('meeting.authPassword')}
            className="mb-3 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          {authError && <div className="mb-3 text-sm font-medium text-red-600">{authError}</div>}
          <button
            type="button" onClick={() => void submitAuth()} disabled={verifying}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {t('meeting.authEnter')}
          </button>
        </div>
      </div>
    );
  }

  // ── Screen 2: room picker ──
  if (stage === 'pick') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h2 className="mb-6 text-center text-xl font-bold text-gray-900">{t('meeting.pickRoom')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {MEETING_ROOMS.map((r) => (
            <button
              key={r.id} type="button" onClick={() => enterRoom(r)}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm hover:shadow-md"
            >
              <span className="font-bold text-gray-900">{r.name}</span>
              {r.hasVideo && <span className="text-xs font-semibold text-green-600">● 视频</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Connected room ──
  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl flex-col gap-3 p-3 md:flex-row">
      <aside className="md:w-48 md:shrink-0">
        <button type="button" onClick={leaveRoom} className="mb-2 text-sm font-semibold text-blue-600 hover:underline">
          ← {t('meeting.changeRoom')}
        </button>
        <RoomList rooms={MEETING_ROOMS} activeId={room?.id ?? null} onSelect={enterRoom} />
      </aside>

      <section className="flex min-h-0 flex-1 flex-col gap-3">
        {room && <div className="h-56 shrink-0 md:h-72"><VideoPanel room={room} name={normalizeDisplayName(name)} password={password} /></div>}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
          <MessageList messages={messages} ownUserId={ownUserId} />
          <ChatInput onSend={send} />
        </div>
      </section>

      <aside className="rounded-lg border border-gray-200 bg-white md:w-56 md:shrink-0">
        <MemberList users={members} />
      </aside>
    </div>
  );
};

export default MeetingPage;
```

- [ ] **Step 4: Type-check + build**

Run: `(cd Church && npx tsc --noEmit)` — no NEW errors.
Run: `(cd Church && npx vite build)` — build succeeds.

- [ ] **Step 5: Commit**
```bash
git add Church/components/meeting/MeetingPage.tsx Church/constants/translations.ts Church/App.tsx
git commit -m "feat(meeting): two-screen meeting page (chat + video)"
```

---

## Task 13: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Tests**

Run: `(cd Church && npm test)` — all suites pass, including `constants/meetingRooms.test.ts`, `meeting/chatProtocol.test.ts`, `meeting/livekitToken.test.ts`, `meeting/meetingValidation.test.ts`, `components/meeting/meetingAuth.test.ts`.

- [ ] **Step 2: Type-check + build**

Run: `(cd Church && npx tsc --noEmit)` — only pre-existing `SermonManager.tsx` errors.
Run: `(cd Church && npm run build)` — succeeds.

- [ ] **Step 3: No Jitsi remnants**

Run: `(cd Church && grep -rn "jitsi\|meet.jit.si\|external_api\|JitsiMeetExternalAPI\|MeetingGate\|JoinNameModal" . --include=*.ts --include=*.tsx | grep -v node_modules | grep -v dist)` — no output.

- [ ] **Step 4: Manual smoke test (requires the Worker with bindings + secrets)**

Chat needs the Durable Object binding and video needs the LiveKit secrets, so run the full Worker locally (not just `vite dev`):
```
(cd Church && npm run build && npx wrangler dev)
```
Then in a browser at the wrangler dev URL:
- Visit `/meeting` → Screen 1. Wrong password → "密码错误". Correct name + `110550` → Screen 2 (room picker).
- Pick **大厅** → chat view; VideoPanel shows the lobby text-only note (no join button). Send a message; open a second tab, join lobby, confirm messages + presence broadcast both ways and the "加入了/离开了房间" system lines.
- Pick **医治祷告** → "加入视频" button; click → browser asks camera/mic; local tile shows; a second tab joining the same room sees the remote tile. Toggle mic/camera/screen-share/leave.
- Switch rooms via the left list; confirm the socket reconnects to the new room and video from the previous room is torn down.
- Mobile viewport: room selector on top, video, chat, members reachable.

- [ ] **Step 5: Commit any smoke-test fixes**
```bash
git add -A
git commit -m "fix(meeting): smoke-test adjustments"
```
(Skip if nothing needed.)

---

## Self-Review Notes

- **Spec coverage:** rooms model + whitelist (Task 1); DO chat with presence/history/sanitize (Tasks 2, 5); LiveKit token hand-signed (Task 3); validators incl. lobby-no-token (Task 4); `/api/meeting/{health,rooms,verify,ws,livekit-token}` + DO wiring + wrangler DO binding/migration + Env + CORS (Task 6); two-screen entry using the verify endpoint (Tasks 6, 12); StrictMode-safe services (Task 9); all UI incl. VideoPanel + lobby text-only (Tasks 10, 11); Jitsi fully removed (Tasks 7, 8, 12); node-env unit tests (Tasks 1–4, 7); manual smoke for runtime/LiveKit (Task 13). Secrets via `.dev.vars` / `wrangler secret` (already stored; documented in Task 6).
- **Type consistency:** `ServerMessage`/`ChatMessage`/`SystemMessage`/`PresenceMessage`/`WelcomeMessage` defined once in `chatProtocol.ts`, consumed by the DO, `meetingSocket`, `MessageList`, and `MeetingPage`. `MeetingRoom` (`{id,name,type,hasVideo}`) consistent across `meetingRooms.ts`, validators, `RoomList`, `VideoPanel`, `MeetingPage`. `MeetingEnv` mirrors the `server.ts` `Env` additions. `validateAuth/validateJoin/validateVideo` signatures match their `meetingApi.ts` call sites.
- **Placeholder scan:** none — every code step contains complete code; every command step has an exact command + expected result.
- **Testing posture:** DO runtime, WebSocket, and LiveKit are verified via manual smoke (no jsdom/testing-library in repo); all extractable logic is pure-unit-tested, matching the `live/` and `sync/` convention.
