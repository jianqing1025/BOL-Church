# Meeting Room Full-Screen Redesign (MeetingPro style)

**Date:** 2026-07-01
**Status:** Approved (design)
**Area:** `Church/components/meeting/`

## Goal

Redesign the `/meeting` experience to match the "MeetingPro" dark video-conference
mockup. Entering `/meeting` renders full-screen with **no church site Header or
Footer**. All three stages (auth -> room picker -> in-room) adopt the dark theme.
The in-room view uses an active-speaker + thumbnail-strip layout with a dark
bottom control bar and collapsible chat / member side panels.

Only features backed by real functionality are built. No AI assistant, no
recording, no screen-share annotation placeholder buttons.

## Non-goals

- No new backend. Reuse existing `/api/meeting/verify`, `MeetingSocket`
  (chat/presence), and `LiveKitService` (video) unchanged.
- No AI subtitles / minutes / summary / Q&A.
- No recording, no screen-share annotation toolbar, no device-settings dialog.
- No changes to room definitions (`constants/meetingRooms.ts`) or auth logic.

## User decisions (captured during brainstorming)

1. **Scope:** redesign all three stages (auth, picker, in-room) to the dark theme.
2. **Extra features:** only real, backend-backed features -- omit non-functional buttons.
3. **Video layout:** active speaker (large) + right-side thumbnail strip with `+N` overflow.
4. **Leaving a meeting:** returns to the room picker (stays within `/meeting`).
5. **Video join:** auto-connect to LiveKit on entering a video-enabled room.

## Architecture

### Full-screen routing (`Church/App.tsx`)

When `route` starts with `/meeting`, render `<MeetingPage />` on its own --
bypassing the `Header` / `main` / `Footer` shell -- inside a full-viewport
(`h-screen` / `100vh`) dark container. All other routes keep the existing shell.

The existing `isHomePage` computation already excludes `/meeting`; we add an
early branch (similar to the existing `/admin` branch) that returns
`<MeetingPage />` + `<ChurchDialogHost />` without the church chrome.

### Component structure

```
MeetingPage (state machine: auth | pick | room)   [restyled dark]
|-- AuthCard          (dark)   -- reuses submitAuth / verify API
|-- RoomPicker        (dark)   -- reuses enterRoom
`-- MeetingRoomView   (new)    -- owns useLiveKit + panel toggles
    |-- MeetingTopBar          -- room name, elapsed timer, participant count,
    |                             connection dot, "<- leave to picker"
    |-- VideoStage             -- active speaker + thumbnail strip (+N overflow)
    |                             OR full-width chat for chat-only rooms
    |-- ChatDrawer   (toggle)  -- wraps MessageList + ChatInput (dark)
    |-- MemberDrawer (toggle)  -- wraps MemberList (dark)
    `-- ControlBar             -- mic . camera . screen-share . chat . members . leave
```

`MeetingPage` keeps ownership of: stage, name/password, chat socket
(`MeetingSocket`), messages, members, ownUserId -- exactly as today. It passes
chat/member data + `send` + `leaveRoom` down to `MeetingRoomView`.

### `useLiveKit` hook (new -- extracted from `VideoPanel`)

Move `VideoPanel`'s LiveKit React state into a reusable hook so the shared
control bar can drive it:

```ts
useLiveKit(room, name, password) => {
  participants: Participant[];
  connecting: boolean;
  joined: boolean;
  error: string;
  micOn: boolean;
  camOn: boolean;
  join(): Promise<void>;
  leave(): void;
  toggleMic(): Promise<void>;
  toggleCamera(): Promise<void>;
  toggleScreenShare(): Promise<void>;
}
```

Behavior:
- On mount for a `hasVideo` room, `MeetingRoomView` calls `join()` automatically.
- If `join()` fails (e.g. permissions denied), `error` is set and the stage
  shows a fallback "join video" button that calls `join()` again -- nothing crashes.
- Cleanup disconnects the service on unmount / room change (preserve the current
  `key={room.id}` remount so video tears down on room switch).

`VideoPanel.tsx` is either deleted or reduced to a thin consumer; its logic now
lives in `useLiveKit` + `VideoStage`. `LiveKitService` itself is unchanged.

### VideoStage

- Large tile = `participants[0]`; strip = the rest. Reuse a single
  `ParticipantTile` (video element + name label) for both the large tile and the
  thumbnails.
- Thumbnail strip: vertical on desktop (right of stage), horizontal on mobile
  (below stage). Overflow beyond N tiles collapses into a `+N` chip.
- Chat-only room (`!room.hasVideo`): VideoStage is replaced by a full-height
  chat column (MessageList + ChatInput), no video controls in the bar.

### ControlBar

Circular dark buttons, active/danger states from the mockup's design system:
- mic (toggle) -- `useLiveKit.toggleMic`
- camera (toggle) -- `useLiveKit.toggleCamera`
- screen share -- `useLiveKit.toggleScreenShare`
- chat -- toggles ChatDrawer
- members -- toggles MemberDrawer
- leave (red) -- `leaveRoom()` -> back to picker

Video toggles are hidden/disabled for chat-only rooms.

### Panels (drawers)

Chat and Member panels are right-side drawers, mutually independent, toggled from
the control bar. On desktop they overlay/push within the stage area; on mobile
they slide over full-width. Default state: both closed, stage full-bleed, matching
mockup screen 2.

## Theme / design tokens

From the mockup's design system:
- Background: near-black / dark slate (`#0b0f1a`-`#111827` range).
- Surfaces: elevated dark gray panels with subtle borders.
- Primary: MeetingPro blue (`#3B5BFF`-ish) for primary buttons / active room.
- Accent states: green (mic-on / online), red (leave / mic-off), amber.
- Rounded-2xl cards, soft shadows, white/gray text hierarchy.

Tokens applied via Tailwind utility classes inline (consistent with the existing
codebase style -- no separate token module).

## Data flow (unchanged plumbing)

- Auth: `submitAuth` -> `POST /api/meeting/verify` -> stage `pick`.
- Enter room: `enterRoom` opens `MeetingSocket`; welcome/message/system/presence
  events update `messages` / `members` / `ownUserId` as today.
- Video: `useLiveKit` connects `LiveKitService` with `{ roomId, name, password }`.
- Leave: `leaveRoom` closes socket, resets to picker; `MeetingRoomView` unmount
  disconnects LiveKit.

## Error handling

- Auth failure -> inline error on the dark card (existing copy keys).
- Socket auth failure -> back to auth stage with error (existing behavior).
- LiveKit connect failure -> error text + retry "join video" button in VideoStage;
  chat still works because chat is a separate socket.
- Chat-only rooms never attempt video.

## Testing

- Existing unit tests (`meetingValidation`, `livekitToken`, `meetingAuth`,
  `chatProtocol`, `meetingRooms`) must stay green -- no backend changes.
- Add light component coverage where practical:
  - `useLiveKit` auto-join calls `LiveKitService.connect` once; toggles proxy to
    the service; unmount disconnects.
  - `MeetingRoomView` renders control bar; leave button calls `leaveRoom`;
    chat/member toggles show/hide drawers; chat-only room hides video controls.
  - Full-screen routing: `/meeting` route does not render Header/Footer.
- Manual: run the app, verify `/meeting` is full-screen (no church header/footer),
  auth -> picker -> room dark styling, video auto-joins, mic/cam/screenshare work,
  chat + members drawers toggle, leave returns to picker.

## Rollout / risk

- Isolated to the `/meeting` route; rest of the church site untouched.
- Main risk is the LiveKit state lift (VideoPanel -> useLiveKit). Mitigation:
  keep `LiveKitService` untouched and preserve the `key={room.id}` remount.
- Reversible: routing branch and component swap can be reverted independently.
