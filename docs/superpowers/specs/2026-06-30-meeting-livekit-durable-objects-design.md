# Meeting v2 — LiveKit Video + Durable Object Chat (`/meeting`) — Design

**Date:** 2026-06-30
**Status:** Approved for planning
**Supersedes:** the Jitsi-based `/meeting` (tagged `meeting-jitsi-v1`), which is fully removed.

## Purpose

Replace the Jitsi embed with a self-owned online-gathering page for BOLCCOP at
`https://www.bolccop.org/meeting`: real-time **text chat** backed by Cloudflare
Durable Objects + WebSocket, and **video conferencing** backed by LiveKit Cloud.
No Jitsi code, iframe, SDK, or `meet.jit.si` references remain.

## Adaptation of the source spec to this repo

The originating prompt assumed a Vue app with a standalone `src/worker.ts`. This
repo is different; the design adapts as follows (these are firm):

- **Frontend is React 19 + TypeScript**, not Vue. All components are `.tsx`
  (same component breakdown as the prompt, React idioms).
- **The Worker is the single existing `Church/server.ts`** (`export default { fetch }`
  with an `/api/...` if-chain). New `/api/meeting/*` routes are added there; the
  `ChatRoom` Durable Object class is re-exported from `server.ts` so Wrangler can
  bind it. No separate worker/project.
- **Wrangler config extends the existing `Church/wrangler.toml`** (`name = "bol-church"`,
  `main = "server.ts"`, existing D1 + R2). We add the DO binding + `[[migrations]]`
  only. The tracked template `wrangler.example.toml` is updated to match.
  (`wrangler.toml` itself is gitignored in this repo.)
- **LiveKit token is hand-signed in the Worker with Web Crypto (HS256)** — no
  `livekit-server-sdk` dependency (keeps the Worker bundle clean and fully
  Workers-runtime compatible). Frontend uses the `livekit-client` package.
- **Secrets** live in `.dev.vars` (local, gitignored) and as Wrangler secrets in
  production: `CHAT_PASSWORD`, `ALLOWED_ORIGIN`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
  `LIVEKIT_API_SECRET`.

## Rooms (single source of truth)

`Church/constants/meetingRooms.ts` is rewritten to:

```ts
export type MeetingRoomType = 'chat' | 'bible' | 'prayer';
export interface MeetingRoom {
  id: string;         // whitelist key + LiveKit room suffix
  name: string;       // display (zh)
  type: MeetingRoomType;
  hasVideo: boolean;
}
export const MEETING_ROOMS: readonly MeetingRoom[] = [
  { id: 'lobby',         name: '大厅',        type: 'chat',   hasVideo: false },
  { id: 'bible-study-1', name: '联合小组查经', type: 'bible',  hasVideo: true  },
  { id: 'bible-study-2', name: '弟兄小组查经', type: 'bible',  hasVideo: true  },
  { id: 'bible-study-3', name: '姐妹小组查经', type: 'bible',  hasVideo: true  },
  { id: 'prayer',        name: '医治祷告',    type: 'prayer', hasVideo: true  },
];
export const MEETING_ROOM_IDS = MEETING_ROOMS.map(r => r.id);
export function findMeetingRoom(id: string | null | undefined): MeetingRoom | undefined;
export function livekitRoomName(id: string): string; // `bolccop-${id}`
```

This module is imported by both the frontend and `server.ts` (shared whitelist).

## Backend

### Env additions (`server.ts` `Env` type)
```ts
CHAT_ROOM: DurableObjectNamespace;
CHAT_PASSWORD?: string;
ALLOWED_ORIGIN?: string;
LIVEKIT_URL?: string;
LIVEKIT_API_KEY?: string;
LIVEKIT_API_SECRET?: string;
```

### Routes (added to the `fetch` if-chain, delegating to `meeting/meetingApi.ts`)

- `GET /api/meeting/health` → `{ ok: true }`.
- `GET /api/meeting/rooms` → `MEETING_ROOMS` as JSON.
- `POST /api/meeting/verify` → body `{ name, password }`. Validates `name`
  non-empty ≤30 and `password === CHAT_PASSWORD`. Returns `{ ok: true }` (200) or
  401. Backs the two-screen entry flow so the password is confirmed on screen 1
  before the room picker is shown. Never echoes the password.
- `GET /api/meeting/ws` → **WebSocket upgrade only**. Query: `roomId`, `name`,
  `password`. Worker validates: method GET + `Upgrade: websocket`; `roomId` in
  whitelist; `name` non-empty ≤30 (sanitized); `password === CHAT_PASSWORD`. On
  failure returns 400/401/403 (never a socket). On success, forwards to the DO
  stub `env.CHAT_ROOM.get(idFromName(roomId))`, passing the sanitized `name` and
  a generated `userId` via headers.
- `POST /api/meeting/livekit-token` → body `{ roomId, name, password }`. Validates:
  `roomId` exists, `room.hasVideo === true` (lobby rejected), `name` non-empty ≤30,
  `password === CHAT_PASSWORD`. Returns `{ url: LIVEKIT_URL, token, roomName: livekitRoomName(roomId) }`.

**CORS:** `/api/meeting/*` responses set `Access-Control-Allow-Origin` to
`ALLOWED_ORIGIN` (falling back to same-origin). Same-origin in production means
this is mostly a no-op, but honored for the token/rooms endpoints.

### `meeting/livekitToken.ts` (pure, testable)
`createLiveKitToken({ apiKey, apiSecret, identity, name, roomName, ttlSeconds })`
builds a LiveKit JWT: header `{alg:'HS256',typ:'JWT'}`, payload
`{ iss: apiKey, sub: identity, name, nbf, exp, video: { room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true } }`,
signed HS256 via `crypto.subtle`. Base64url encode. No external deps.

### `meeting/chatRoom.ts` — the Durable Object
`export class ChatRoom` (re-exported from `server.ts`). Responsibilities:
- Accept the forwarded WebSocket (`new WebSocketPair()`, `server.accept()`).
- Track sessions in a `Map<WebSocket, { id: string; name: string }>`.
- Keep the **last 100** messages in memory (`ChatMessage[]`).
- On connect: read `userId`/`name` from headers; send `welcome`
  `{ type:'welcome', roomId, userId, messages }`; broadcast `system`
  `"{name} 加入了房间"`; broadcast `presence`.
- On client `{ type:'message', text }`: sanitize (`text` trimmed, ≤1000 chars,
  control chars stripped); ignore if empty; build
  `{ type:'message', id, userId, name, text, createdAt }`; push to history (trim
  to 100); broadcast to all.
- On close/error: remove session; broadcast `system` `"{name} 离开了房间"` +
  `presence`.
- Pure helpers extracted to `meeting/chatProtocol.ts` (`sanitizeText`,
  `sanitizeName`, `trimHistory`, message/presence builders) for unit testing in
  the node env. Password/roomId are already validated by the Worker before the
  socket reaches the DO — the DO trusts the connection. `webSocketMessage`/
  standard `addEventListener('message')` is used; hibernation is noted as future
  work.

### Message protocol (server → client)
`welcome` · `message` · `system` · `presence` — exact shapes from the source
prompt (see prompt); `presence.users` = `[{ id, name }]`.

## Frontend (React, `Church/components/meeting/` + `Church/services/`)

- **`services/meetingSocket.ts`** — `MeetingSocket` class wrapping the WebSocket:
  `connect({ roomId, name, password })` (builds the `wss?://…/api/meeting/ws` URL
  from `window.location`), typed `onMessage`/`onClose`/`onError` callbacks,
  `send(text)`, `close()`. Surfaces auth failure (socket closed before open) as an
  error callback.
- **`services/livekitService.ts`** — wraps `livekit-client`:
  `connect({ roomId, name, password })` (fetches token via
  `POST /api/meeting/livekit-token`, then `Room.connect(url, token)`),
  `disconnect()`, `toggleMic()`, `toggleCamera()`, `toggleScreenShare()`, and
  track/participant event subscriptions exposed via callbacks.
- **`components/meeting/MeetingPage.tsx`** — orchestrator with a **two-screen
  entry flow**:
  - **Screen 1 — Auth:** name + password. On submit, `POST /api/meeting/verify`;
    on 200 advance to screen 2, on 401 show an inline password error. Name
    persists to `localStorage['bolccop-meeting-name']`.
  - **Screen 2 — Room picker:** the room cards/list; selecting a room enters it.
  - **Connected view:** opens the chat socket for the chosen room and renders the
    layout. Room switching closes + reopens the socket and leaves any active video.
    An unexpected auth failure on connect returns to Screen 1 with an error.
- **`RoomList.tsx`** — room picker (desktop left rail / mobile top selector),
  shows a video badge when `hasVideo`.
- **`MessageList.tsx`** — chat + system messages, auto-scroll.
- **`MemberList.tsx`** — online users from `presence` (collapsible on mobile).
- **`ChatInput.tsx`** — text box (≤1000), Enter to send.
- **`VideoPanel.tsx`** — for `hasVideo` rooms: a "加入视频会议" button; once joined,
  local + remote video grid with mic / camera / screen-share / leave controls.
  For `lobby`: shows "大厅仅支持文字聊天" and no video button.

### Layout
- **Desktop:** left room list · center-top video (or room blurb if not joined) ·
  center-bottom chat · right member list · bottom input.
- **Mobile:** top room selector · video · chat · collapsible members.

### Routing
`App.tsx` keeps `/meeting` → `<MeetingPage />`. The `/meeting/{seg}` branch is
removed (room selection is in-app); an unknown path just shows the entry form.

## Removals (Jitsi)

Delete: `MeetingGate.tsx`, `MeetingCard.tsx`, `JoinNameModal.tsx`, `MeetingRoom.tsx`
(all the Jitsi versions). Rewrite `meetingRooms.ts` (new model) and `MeetingPage.tsx`.
Trim `meetingAuth.ts` to just name helpers (`normalizeDisplayName`,
`isValidDisplayName`, `MEETING_NAME_KEY`); drop the client password constant/unlock
key (password is now server-validated). Remove the Jitsi-era `meeting.*`
translation keys that no longer apply and add the v2 keys. No `meet.jit.si` /
`external_api.js` references remain anywhere.

## Dependencies

- **Add:** `livekit-client` (frontend).
- **No server SDK** (JWT hand-signed).
- Existing `lucide-react` used for control icons.

## Error handling

- WS: wrong password / bad room → Worker returns 4xx, socket never opens →
  frontend shows the entry-form error. Unexpected socket close → "disconnected,
  reconnect" affordance.
- LiveKit: token 4xx or `Room.connect` failure → inline error in VideoPanel with
  retry; lobby never requests a token.
- DO: malformed client frames ignored; oversized text truncated to 1000.

## Testing (node env, matching existing posture)

- `meeting/chatProtocol.test.ts` — `sanitizeText` (trim, 1000 cap, control-char
  strip, empty→null), `sanitizeName` (trim, 30 cap, empty invalid), `trimHistory`
  (keeps last 100), message/presence builder shapes.
- `meeting/livekitToken.test.ts` — token has 3 segments; header decodes to
  `{alg:'HS256',typ:'JWT'}`; payload has `iss`, `sub`, `video.room`,
  `video.roomJoin===true`, `exp>nbf`; signature verifies against the secret with
  `crypto.subtle`.
- `constants/meetingRooms.test.ts` — 5 rooms, ids unique, `lobby.hasVideo===false`,
  the four others `true`, `findMeetingRoom` whitelist behavior, `livekitRoomName`.
- Worker validation helper (`meeting/meetingApi.ts` pure validators) — roomId
  whitelist, name/password checks, lobby-rejects-token.

Component/DO runtime and LiveKit are verified by manual smoke test (no jsdom in repo).

## Out of scope

- Persisting chat history beyond the in-memory last-100 (DO storage / hibernation
  is future work).
- Per-user roles/moderation, recording, breakout rooms, message editing.
- Auth beyond the shared `CHAT_PASSWORD`.

## Production notes

- Set secrets: `wrangler secret put CHAT_PASSWORD` (and `LIVEKIT_URL`,
  `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `ALLOWED_ORIGIN`).
- First deploy runs the DO migration (`new_sqlite_classes = ["ChatRoom"]`).
