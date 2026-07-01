# Church Co-worker Meeting Rooms (`/meeting`) — Design

**Date:** 2026-06-30
**Status:** Approved for planning

## Purpose

Give church co-workers (同工) a place to hold online Bible study and prayer
video meetings, embedded directly in the church site at
`https://www.bolccop.org/meeting`. The page lists the church's ministries as
cards; each card has a **Join / 加入** button that opens a Jitsi Meet video room
for that ministry after a shared-password gate and a display-name prompt.

## Constraints & key decisions

- **Jitsi backend: public `meet.jit.si` via the IFrame API.** Cloudflare Workers
  cannot host the Jitsi video bridge, so we embed Jitsi through its
  `external_api.js` IFrame API pointed at the free public server. No new
  infrastructure.
- **Rooms mirror the 6 existing ministries** — Kids, Men, Women, Joint, Alpha,
  Prayer — reusing the labels already defined under `eventsPage.nav*` in
  `constants/translations.ts` so site terminology stays consistent.
- **Page-level password gate (`110550`), remembered per browser.** Entered once
  on `/meeting`; unlock is stored in `localStorage`, mirroring the existing
  PhotoGate pattern. After unlocking, joining a room only asks for a name.
- **Password check is client-side.** The constant `110550` is compared in the
  browser. This keeps the whole feature pure-frontend (no server changes). The
  password lives in the JS bundle — acceptable for a soft, shared co-worker
  gate. (If stronger secrecy is ever needed, add a server endpoint like
  `api.unlockPhotos` — out of scope here.)
- **Full-page room at `/meeting/{ministry}`.** Joining navigates to a dedicated
  route that renders the Jitsi call full-bleed with a back button. Clean,
  shareable URLs; browser-back works; consistent with how `/live` is a
  standalone route.
- **Not in the main header nav.** `/meeting` stays semi-private for co-workers,
  reachable via the direct link and a discreet Footer link.

## User flow

1. Visit `/meeting`. If this browser is not unlocked → **MeetingGate** (enter
   `110550`). On success, `localStorage['bolccop-meeting-unlocked'] = '1'` and
   the grid is shown.
2. **Card grid**: the 6 ministry cards, each with a right-aligned green **Join /
   加入** button.
3. Click **Join** → **JoinNameModal**, pre-filled from
   `localStorage['bolccop-meeting-name']`. Enter a non-empty name → save it →
   navigate to `/meeting/{ministry}`.
4. **MeetingRoom** loads `https://meet.jit.si/external_api.js` (once) and mounts
   `JitsiMeetExternalAPI` with the room's Jitsi room name and the saved display
   name. Renders full-bleed with a **← Back** button that returns to `/meeting`.
5. Deep-link / shared `/meeting/prayer`:
   - Not unlocked → show the gate first.
   - Unlocked but no saved name → show JoinNameModal before starting the call.
   - Invalid ministry slug → redirect to `/meeting`.

## Architecture & components

Path-based routing in `App.tsx` already matches on `window.location.pathname`.
Add:

```
if (route === '/meeting' || route === '/meeting/')      → <MeetingPage />
if (route.startsWith('/meeting/'))                        → <MeetingPage roomKey={segment} />
```

`MeetingPage` reads the `{ministry}` segment itself (like `EventsPage`) and
validates it against the known room keys.

### New files

- **`constants/meetingRooms.ts`** — the source of truth for rooms:
  ```ts
  export interface MeetingRoom {
    key: MinistrySubPage;      // 'kids' | 'men' | ... reuse existing union
    jitsiRoom: string;         // unguessable public room name, e.g. 'bolccop-prayer-7fk2q9'
    titleKey: string;          // reuse 'eventsPage.navPrayer' etc.
    descKey: string;           // new 'meeting.<key>Desc'
  }
  export const MEETING_ROOMS: MeetingRoom[];
  export const MEETING_ROOM_KEYS: MinistrySubPage[];
  export function findMeetingRoom(key: string): MeetingRoom | undefined;
  ```
  Jitsi room names carry a fixed random token per room so rooms on the shared
  public server are not casually discoverable.

- **`components/meeting/MeetingGate.tsx`** — password card, visually mirroring
  `components/photos/PhotoGate.tsx` (blurred hero background + floating card).
  Exports `MEETING_UNLOCK_KEY = 'bolccop-meeting-unlocked'`. Compares input to
  the `110550` constant client-side; on match sets the unlock key and calls
  `onUnlocked()`.

- **`components/meeting/MeetingCard.tsx`** — one ministry: title (`t(titleKey)`),
  short description (`t(descKey)`), and a right-aligned **Join / 加入** button.
  `onJoin(room)` callback.

- **`components/meeting/JoinNameModal.tsx`** — name entry modal, same idiom as
  `components/LiveJoinModal.tsx`. Requires a non-empty trimmed name; persists to
  `localStorage['bolccop-meeting-name']`; `onJoin(name)` callback. Shows the
  target room's title.

- **`components/meeting/MeetingRoom.tsx`** — the embedded call.
  - Loads `external_api.js` once via a shared loader promise (guards against
    duplicate `<script>` and StrictMode double-mount).
  - `new JitsiMeetExternalAPI('meet.jit.si', { roomName, parentNode, userInfo: { displayName }, configOverwrite, interfaceConfigOverwrite })`.
  - `configOverwrite`: `{ prejoinPageEnabled: false }` (name already collected);
    `interfaceConfigOverwrite`: trim to essentials.
  - Cleanup: `api.dispose()` on unmount.
  - Full-bleed container with a **← Back** button (`navigateTo('/meeting')`).
  - Script-load failure → error panel with a retry and an "Open in new tab"
    link to `https://meet.jit.si/{jitsiRoom}`.

- **`components/meeting/MeetingPage.tsx`** — orchestrator:
  - Props: `{ roomKey?: string }`.
  - Gate state from `localStorage` (like `PhotosPage`'s `unlocked`).
  - If locked → `<MeetingGate />`.
  - If `roomKey` valid and a saved name exists → `<MeetingRoom />`.
  - If `roomKey` valid but no name → `<JoinNameModal />` (submit → save name →
    render room).
  - If `roomKey` invalid → redirect to `/meeting`.
  - Otherwise → `<PageHeader />` + card grid of `MEETING_ROOMS.map(MeetingCard)`.
    Join navigates to `/meeting/{key}`.

### Modified files

- **`App.tsx`** — import `MeetingPage`; add the `/meeting` and `/meeting/{seg}`
  route branches; include `/meeting` in the `isHomePage` exclusion list so the
  header renders in the non-transparent style.
- **`constants/translations.ts`** — add a `meeting` block (en/zh): page title &
  subtitle, gate title/placeholder/error/enter, join button, name modal
  title/placeholder/button, back label, and `*Desc` for each ministry.
- **`components/Footer.tsx`** — add a discreet `/meeting` link (co-worker area).

## Data flow

```
MeetingPage (reads unlock + name from localStorage, roomKey from route)
  ├─ locked ─────────────► MeetingGate ──(110550)──► setUnlocked + localStorage
  ├─ grid  ──(Join)──────► navigateTo('/meeting/{key}')
  ├─ room, no name ──────► JoinNameModal ──(name)──► save name + localStorage
  └─ room, name ready ───► MeetingRoom
                              └─ JitsiMeetExternalAPI('meet.jit.si',
                                   { roomName: room.jitsiRoom, displayName: name })
```

No server state; no D1/R2. Everything is client-side + the external Jitsi
iframe.

## Error handling

- **Jitsi script load failure** → error panel: retry button + "Open in new tab"
  fallback link to the direct `meet.jit.si/{jitsiRoom}` URL.
- **Invalid ministry slug** → `navigateTo('/meeting', replace=true)`.
- **Empty name** in JoinNameModal → inline validation message; submit blocked.
- **Camera/mic permissions** → handled by Jitsi's own UI inside the iframe.
- **StrictMode / remount** → shared script-loader promise + `api.dispose()`
  cleanup prevent duplicate embeds.

## Testing

- **MeetingGate**: rejects a wrong password (error shown, not unlocked); accepts
  `110550` (calls `onUnlocked`, sets `localStorage`).
- **JoinNameModal**: empty/whitespace name blocks submit with a message; valid
  name calls `onJoin(trimmed)` and persists it.
- **Room routing** (`findMeetingRoom` / route matcher): the 6 known slugs
  resolve; unknown slugs return undefined (→ redirect path).
- **MeetingRoom**: with a mocked global `JitsiMeetExternalAPI`, mounting calls
  the constructor with the expected `roomName` and `displayName`, and unmounting
  calls `dispose()`.

## Out of scope

- Self-hosted / JaaS Jitsi backends.
- Server-side password verification.
- Per-room individual passwords, scheduling, participant persistence, chat
  history, recordings.
- Header nav entry (Footer link only).
