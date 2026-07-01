# Church Co-worker Meeting Rooms (`/meeting`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/meeting` page that lists the 6 church ministries as cards, each with a Join button that opens a Jitsi Meet video room (public meet.jit.si) behind a shared `110550` password gate and a display-name prompt.

**Architecture:** Pure-frontend feature in the existing React SPA. Path-based routing in `App.tsx` renders a `MeetingPage` orchestrator. A client-side password gate (remembered in `localStorage`) unlocks a card grid; joining navigates to `/meeting/{ministry}`, which embeds Jitsi via its `external_api.js` IFrame API. Pure logic (room lookup, password/name validation) lives in small helper modules that are unit-tested in the node vitest environment, matching the codebase's existing test posture. React components are kept thin and are not component-tested (the repo has no jsdom/testing-library setup).

**Tech Stack:** React 19, TypeScript, Tailwind (CDN), lucide-react icons, Vitest (node env), Jitsi Meet IFrame API.

---

## File Structure

**Create:**
- `Church/constants/meetingRooms.ts` — the 6 rooms + lookup helpers (source of truth).
- `Church/constants/meetingRooms.test.ts` — unit tests for the lookup helpers.
- `Church/components/meeting/meetingAuth.ts` — password/name constants + pure validation helpers + localStorage keys.
- `Church/components/meeting/meetingAuth.test.ts` — unit tests for the validation helpers.
- `Church/components/meeting/MeetingGate.tsx` — `110550` password card.
- `Church/components/meeting/MeetingCard.tsx` — one ministry row with a Join button.
- `Church/components/meeting/JoinNameModal.tsx` — display-name entry modal.
- `Church/components/meeting/MeetingRoom.tsx` — Jitsi IFrame embed + back button + load-failure fallback.
- `Church/components/meeting/MeetingPage.tsx` — orchestrator (gate → grid → name modal → room).

**Modify:**
- `Church/vitest.config.ts` — include the new test globs.
- `Church/constants/translations.ts` — add the `meeting` block and `footer.meeting`.
- `Church/App.tsx` — add `/meeting` and `/meeting/{seg}` routes; extend `isHomePage` exclusion.
- `Church/components/Footer.tsx` — add a discreet `/meeting` link.

---

## Task 1: Room constants + lookup helpers

**Files:**
- Modify: `Church/vitest.config.ts`
- Create: `Church/constants/meetingRooms.ts`
- Test: `Church/constants/meetingRooms.test.ts`

- [ ] **Step 1: Extend the vitest include globs**

Replace the `include` array in `Church/vitest.config.ts` so the new tests are picked up:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'sync/**/*.test.ts',
      'live/**/*.test.ts',
      'constants/**/*.test.ts',
      'components/**/*.test.ts',
    ],
    environment: 'node',
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `Church/constants/meetingRooms.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MEETING_ROOMS, MEETING_ROOM_KEYS, findMeetingRoom } from './meetingRooms';

describe('MEETING_ROOMS', () => {
  it('defines the six ministry rooms', () => {
    expect(MEETING_ROOM_KEYS).toEqual(['kids', 'men', 'women', 'joint', 'alpha', 'prayer']);
  });
  it('gives every room a unique, non-empty jitsi room name', () => {
    const names = MEETING_ROOMS.map(r => r.jitsiRoom);
    expect(names.every(n => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('findMeetingRoom', () => {
  it('resolves each known ministry slug', () => {
    expect(findMeetingRoom('prayer')?.key).toBe('prayer');
    expect(findMeetingRoom('kids')?.titleKey).toBe('eventsPage.navKids');
  });
  it('returns undefined for unknown or empty slugs', () => {
    expect(findMeetingRoom('nope')).toBeUndefined();
    expect(findMeetingRoom('')).toBeUndefined();
    expect(findMeetingRoom(null)).toBeUndefined();
    expect(findMeetingRoom(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd Church && npx vitest run constants/meetingRooms.test.ts`
Expected: FAIL — cannot find module `./meetingRooms`.

- [ ] **Step 4: Create the implementation**

Create `Church/constants/meetingRooms.ts`:

```ts
import type { MinistrySubPage } from '../types';

export interface MeetingRoom {
  /** Ministry slug — also the /meeting/{key} route segment. */
  key: MinistrySubPage;
  /** meet.jit.si room name. Carries a fixed random token so the public room
   *  is not casually guessable; changing the token effectively resets it. */
  jitsiRoom: string;
  /** Existing translation key reused for the display title. */
  titleKey: string;
  /** New translation key for the card's short description. */
  descKey: string;
}

export const MEETING_ROOMS: readonly MeetingRoom[] = [
  { key: 'kids',   jitsiRoom: 'BolccopKids-4f7a2c',   titleKey: 'eventsPage.navKids',   descKey: 'meeting.kidsDesc' },
  { key: 'men',    jitsiRoom: 'BolccopMen-9b1e6d',    titleKey: 'eventsPage.navMen',    descKey: 'meeting.menDesc' },
  { key: 'women',  jitsiRoom: 'BolccopWomen-2a8c5f',  titleKey: 'eventsPage.navWomen',  descKey: 'meeting.womenDesc' },
  { key: 'joint',  jitsiRoom: 'BolccopJoint-7d3f19',  titleKey: 'eventsPage.navJoint',  descKey: 'meeting.jointDesc' },
  { key: 'alpha',  jitsiRoom: 'BolccopAlpha-1c6b40',  titleKey: 'eventsPage.navAlpha',  descKey: 'meeting.alphaDesc' },
  { key: 'prayer', jitsiRoom: 'BolccopPrayer-8e5a72', titleKey: 'eventsPage.navPrayer', descKey: 'meeting.prayerDesc' },
] as const;

export const MEETING_ROOM_KEYS: readonly MinistrySubPage[] = MEETING_ROOMS.map(r => r.key);

export function findMeetingRoom(key: string | null | undefined): MeetingRoom | undefined {
  if (!key) return undefined;
  return MEETING_ROOMS.find(r => r.key === key);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd Church && npx vitest run constants/meetingRooms.test.ts`
Expected: PASS (2 + 2 assertions green).

- [ ] **Step 6: Commit**

```bash
git add Church/vitest.config.ts Church/constants/meetingRooms.ts Church/constants/meetingRooms.test.ts
git commit -m "feat(meeting): room constants and lookup helpers"
```

---

## Task 2: Auth + validation helpers

**Files:**
- Create: `Church/components/meeting/meetingAuth.ts`
- Test: `Church/components/meeting/meetingAuth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Church/components/meeting/meetingAuth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  MEETING_PASSWORD,
  checkMeetingPassword,
  normalizeDisplayName,
  isValidDisplayName,
} from './meetingAuth';

describe('checkMeetingPassword', () => {
  it('accepts the exact code, ignoring surrounding whitespace', () => {
    expect(checkMeetingPassword(MEETING_PASSWORD)).toBe(true);
    expect(checkMeetingPassword('  110550  ')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(checkMeetingPassword('110551')).toBe(false);
    expect(checkMeetingPassword('')).toBe(false);
  });
});

describe('normalizeDisplayName', () => {
  it('trims, collapses inner whitespace, and caps length at 30', () => {
    expect(normalizeDisplayName('  John   Doe ')).toBe('John Doe');
    expect(normalizeDisplayName('x'.repeat(40)).length).toBe(30);
  });
});

describe('isValidDisplayName', () => {
  it('requires at least one non-whitespace character', () => {
    expect(isValidDisplayName('Mary')).toBe(true);
    expect(isValidDisplayName('   ')).toBe(false);
    expect(isValidDisplayName('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd Church && npx vitest run components/meeting/meetingAuth.test.ts`
Expected: FAIL — cannot find module `./meetingAuth`.

- [ ] **Step 3: Create the implementation**

Create `Church/components/meeting/meetingAuth.ts`:

```ts
/** Shared soft-gate code for the co-worker meeting rooms. This is a low-security
 *  gate meant to be shared among co-workers, so the value lives client-side. */
export const MEETING_PASSWORD = '110550';

/** localStorage keys — mirror the PhotoGate unlock pattern. */
export const MEETING_UNLOCK_KEY = 'bolccop-meeting-unlocked';
export const MEETING_NAME_KEY = 'bolccop-meeting-name';

const MAX_NAME_LENGTH = 30;

export function checkMeetingPassword(input: string): boolean {
  return input.trim() === MEETING_PASSWORD;
}

export function normalizeDisplayName(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
}

export function isValidDisplayName(input: string): boolean {
  return normalizeDisplayName(input).length > 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd Church && npx vitest run components/meeting/meetingAuth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Church/components/meeting/meetingAuth.ts Church/components/meeting/meetingAuth.test.ts
git commit -m "feat(meeting): password and display-name helpers"
```

---

## Task 3: Translations

**Files:**
- Modify: `Church/constants/translations.ts`

No test (translations are static data). This task must precede the UI tasks so all `t()` keys resolve.

- [ ] **Step 1: Add the `meeting` block**

In `Church/constants/translations.ts`, add a new top-level `meeting` object (place it after the `eventsPage` block, before the closing `}` of `translations`). Match the existing `{ en, zh }` shape:

```ts
  meeting: {
    pageTitle: { en: 'Co-worker Meetings', zh: '同工會議' },
    pageSubtitle: { en: 'Online Bible study & prayer rooms', zh: '線上查經與禱告聊天室' },
    join: { en: 'Join', zh: '加入' },

    gateTitle: { en: 'Co-worker Meeting Access', zh: '同工會議進入' },
    gateNotice: { en: 'Enter the access code to join the meeting rooms.', zh: '請輸入通行碼以進入會議室。' },
    gatePlaceholder: { en: 'Access code', zh: '通行碼' },
    gateEnter: { en: 'Enter', zh: '進入' },
    gateError: { en: 'Incorrect access code. Please try again.', zh: '通行碼錯誤，請再試一次。' },

    nameTitle: { en: 'Enter your name', zh: '輸入您的名字' },
    nameSubtitle: { en: 'Joining: {room}', zh: '正在加入：{room}' },
    namePlaceholder: { en: 'Your name', zh: '您的名字' },
    nameJoin: { en: 'Join Meeting', zh: '加入會議' },
    nameCancel: { en: 'Cancel', zh: '取消' },
    nameRequired: { en: 'Please enter your name.', zh: '請輸入您的名字。' },

    back: { en: 'Back', zh: '返回' },
    loadError: { en: 'Could not load the meeting. Check your connection and try again.', zh: '無法載入會議，請檢查網路後重試。' },
    retry: { en: 'Retry', zh: '重試' },
    openNewTab: { en: 'Open in new tab', zh: '在新分頁開啟' },

    kidsDesc:   { en: 'Children Sunday school co-workers', zh: '兒童主日學同工' },
    menDesc:    { en: 'Brothers small group', zh: '弟兄小組' },
    womenDesc:  { en: 'Sisters small group', zh: '姐妹小組' },
    jointDesc:  { en: 'Joint fellowship group', zh: '聯合小組' },
    alphaDesc:  { en: 'Alpha course discussion', zh: 'Alpha 課程討論' },
    prayerDesc: { en: 'Prayer meeting room', zh: '禱告會' },
  },
```

- [ ] **Step 2: Add the footer link label**

Find the existing `footer:` block in the same file (it defines `copyright` and `classicSite`) and add:

```ts
    meeting: { en: 'Co-worker Meetings', zh: '同工會議' },
```

- [ ] **Step 3: Type-check**

Run: `cd Church && npx tsc --noEmit`
Expected: no new errors from `translations.ts`.

- [ ] **Step 4: Commit**

```bash
git add Church/constants/translations.ts
git commit -m "feat(meeting): translations for meeting page, gate, and rooms"
```

---

## Task 4: MeetingGate component

**Files:**
- Create: `Church/components/meeting/MeetingGate.tsx`

Visual parity with `Church/components/photos/PhotoGate.tsx` (blurred hero background + floating card), but the password check is the client-side `checkMeetingPassword` — no server call.

- [ ] **Step 1: Create the component**

Create `Church/components/meeting/MeetingGate.tsx`:

```tsx
import React, { useState } from 'react';
import { useLocalization } from '../../hooks/useLocalization';
import { checkMeetingPassword, MEETING_UNLOCK_KEY } from './meetingAuth';

/**
 * Soft access gate for the co-worker meeting rooms. Renders inside the normal
 * page layout: a blurred Hero image fills the content area with a floating
 * password card on top. Mirrors the photo album's PhotoGate visual style.
 */
export const MeetingGate: React.FC<{ heroUrl?: string; onUnlocked: () => void }> = ({ heroUrl, onUnlocked }) => {
  const { t } = useLocalization();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password.trim()) return;
    if (checkMeetingPassword(password)) {
      try { localStorage.setItem(MEETING_UNLOCK_KEY, '1'); } catch { /* ignore */ }
      onUnlocked();
    } else {
      setError(t('meeting.gateError'));
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-24">
      <div
        className="absolute inset-0 scale-110 bg-cover bg-center blur-xl"
        style={heroUrl ? { backgroundImage: `url("${heroUrl}")` } : { backgroundColor: '#1f2937' }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-black/55" aria-hidden />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-2xl backdrop-blur-sm">
        <h1 className="text-center text-2xl font-bold leading-snug text-gray-900">{t('meeting.gateTitle')}</h1>
        <p className="mt-4 text-center text-sm leading-relaxed text-gray-600">{t('meeting.gateNotice')}</p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder={t('meeting.gatePlaceholder')}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            autoFocus
          />
          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={!password.trim()}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {t('meeting.gateEnter')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MeetingGate;
```

- [ ] **Step 2: Type-check**

Run: `cd Church && npx tsc --noEmit`
Expected: no errors referencing `MeetingGate.tsx`.

- [ ] **Step 3: Commit**

```bash
git add Church/components/meeting/MeetingGate.tsx
git commit -m "feat(meeting): password gate component"
```

---

## Task 5: MeetingCard component

**Files:**
- Create: `Church/components/meeting/MeetingCard.tsx`

A ministry row with the title/description on the left and a green Join button on the right — matching the reference image's per-channel Join.

- [ ] **Step 1: Create the component**

Create `Church/components/meeting/MeetingCard.tsx`:

```tsx
import React from 'react';
import { Video } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';

export const MeetingCard: React.FC<{ title: string; description: string; onJoin: () => void }> = ({ title, description, onJoin }) => {
  const { t } = useLocalization();
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="min-w-0">
        <h3 className="truncate text-lg font-bold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>
      <button
        type="button"
        onClick={onJoin}
        className="flex shrink-0 items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
      >
        <Video size={16} />
        {t('meeting.join')}
      </button>
    </div>
  );
};

export default MeetingCard;
```

- [ ] **Step 2: Type-check**

Run: `cd Church && npx tsc --noEmit`
Expected: no errors referencing `MeetingCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add Church/components/meeting/MeetingCard.tsx
git commit -m "feat(meeting): ministry card with join button"
```

---

## Task 6: JoinNameModal component

**Files:**
- Create: `Church/components/meeting/JoinNameModal.tsx`

Same idiom as `Church/components/LiveJoinModal.tsx`. Requires a non-empty name; returns the normalized name via `onJoin`.

- [ ] **Step 1: Create the component**

Create `Church/components/meeting/JoinNameModal.tsx`:

```tsx
import React, { useState } from 'react';
import { useLocalization } from '../../hooks/useLocalization';
import { isValidDisplayName, normalizeDisplayName } from './meetingAuth';

interface JoinNameModalProps {
  roomTitle: string;
  initialName?: string;
  onJoin: (name: string) => void;
  onClose: () => void;
}

export const JoinNameModal: React.FC<JoinNameModalProps> = ({ roomTitle, initialName = '', onJoin, onClose }) => {
  const { t } = useLocalization();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');

  const submit = () => {
    if (!isValidDisplayName(name)) {
      setError(t('meeting.nameRequired'));
      return;
    }
    onJoin(normalizeDisplayName(name));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-xl font-bold text-gray-900">{t('meeting.nameTitle')}</h2>
        <p className="mb-5 text-sm text-gray-600">{t('meeting.nameSubtitle').replace('{room}', roomTitle)}</p>
        <input
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          maxLength={30}
          placeholder={t('meeting.namePlaceholder')}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          autoFocus
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('meeting.nameCancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('meeting.nameJoin')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JoinNameModal;
```

- [ ] **Step 2: Type-check**

Run: `cd Church && npx tsc --noEmit`
Expected: no errors referencing `JoinNameModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add Church/components/meeting/JoinNameModal.tsx
git commit -m "feat(meeting): display-name join modal"
```

---

## Task 7: MeetingRoom component (Jitsi embed)

**Files:**
- Create: `Church/components/meeting/MeetingRoom.tsx`

Loads `meet.jit.si/external_api.js` once, mounts the call full-bleed, disposes on unmount, and shows a fallback if the script fails.

- [ ] **Step 1: Create the component**

Create `Church/components/meeting/MeetingRoom.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import { navigateTo } from '../../utils/routes';
import type { MeetingRoom as MeetingRoomConfig } from '../../constants/meetingRooms';

const JITSI_DOMAIN = 'meet.jit.si';
const JITSI_SCRIPT_SRC = `https://${JITSI_DOMAIN}/external_api.js`;

type JitsiApi = { dispose: () => void };
type JitsiApiCtor = new (domain: string, options: Record<string, unknown>) => JitsiApi;

declare global {
  interface Window { JitsiMeetExternalAPI?: JitsiApiCtor }
}

// Shared loader so the script is injected once even across remounts / StrictMode.
let scriptPromise: Promise<void> | null = null;
function loadJitsiScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.JitsiMeetExternalAPI) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = JITSI_SCRIPT_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => { scriptPromise = null; reject(new Error('jitsi-script-failed')); };
    document.body.appendChild(el);
  });
  return scriptPromise;
}

interface MeetingRoomProps {
  room: MeetingRoomConfig;
  displayName: string;
  title: string;
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({ room, displayName, title }) => {
  const { t } = useLocalization();
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadJitsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return;
        apiRef.current = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName: room.jitsiRoom,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          userInfo: { displayName },
          configOverwrite: { prejoinPageEnabled: false },
          interfaceConfigOverwrite: { MOBILE_APP_PROMO: false },
        });
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => {
      cancelled = true;
      try { apiRef.current?.dispose(); } catch { /* ignore */ }
      apiRef.current = null;
    };
  }, [room.jitsiRoom, displayName, retryKey]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      <div className="flex h-14 shrink-0 items-center gap-3 bg-gray-950 px-4 text-white">
        <button
          type="button"
          onClick={() => navigateTo('/meeting')}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-gray-200 hover:bg-white/10"
        >
          <ArrowLeft size={18} />
          {t('meeting.back')}
        </button>
        <span className="truncate text-sm font-bold">{title}</span>
      </div>

      {failed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-white">
          <p className="max-w-sm text-sm text-gray-300">{t('meeting.loadError')}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setFailed(false); setRetryKey((k) => k + 1); }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-700"
            >
              {t('meeting.retry')}
            </button>
            <a
              href={`https://${JITSI_DOMAIN}/${room.jitsiRoom}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              {t('meeting.openNewTab')}
            </a>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="flex-1" />
      )}
    </div>
  );
};

export default MeetingRoom;
```

- [ ] **Step 2: Type-check**

Run: `cd Church && npx tsc --noEmit`
Expected: no errors referencing `MeetingRoom.tsx`.

- [ ] **Step 3: Commit**

```bash
git add Church/components/meeting/MeetingRoom.tsx
git commit -m "feat(meeting): jitsi meeting room embed"
```

---

## Task 8: MeetingPage orchestrator

**Files:**
- Create: `Church/components/meeting/MeetingPage.tsx`

Ties gate → grid → name modal → room together, reading unlock state and saved name from `localStorage` and the ministry slug from props.

- [ ] **Step 1: Create the component**

Create `Church/components/meeting/MeetingPage.tsx`:

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import PageHeader from '../PageHeader';
import { useLocalization } from '../../hooks/useLocalization';
import { useAdmin } from '../../hooks/useAdmin';
import { buildMediaSlots } from '../../media';
import { navigateTo } from '../../utils/routes';
import { MEETING_ROOMS, findMeetingRoom } from '../../constants/meetingRooms';
import { MEETING_UNLOCK_KEY, MEETING_NAME_KEY } from './meetingAuth';
import { MeetingGate } from './MeetingGate';
import { MeetingCard } from './MeetingCard';
import { JoinNameModal } from './JoinNameModal';
import { MeetingRoom } from './MeetingRoom';

const readStored = (key: string): string => {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
};

export const MeetingPage: React.FC<{ roomKey?: string }> = ({ roomKey }) => {
  const { t } = useLocalization();
  const { images } = useAdmin();
  const [unlocked, setUnlocked] = useState<boolean>(() => readStored(MEETING_UNLOCK_KEY) === '1');
  const [name, setName] = useState<string>(() => readStored(MEETING_NAME_KEY));

  const room = findMeetingRoom(roomKey);
  const heroUrl = useMemo(() => {
    const slot = buildMediaSlots('hero', images)[0];
    return slot ? (images[slot.key] || slot.placeholder) : '';
  }, [images]);

  // Unknown ministry slug → return to the grid.
  useEffect(() => {
    if (roomKey && !room) navigateTo('/meeting', true);
  }, [roomKey, room]);

  if (!unlocked) {
    return <MeetingGate heroUrl={heroUrl} onUnlocked={() => setUnlocked(true)} />;
  }

  if (room) {
    if (!name) {
      return (
        <JoinNameModal
          roomTitle={t(room.titleKey)}
          onJoin={(n) => {
            try { localStorage.setItem(MEETING_NAME_KEY, n); } catch { /* ignore */ }
            setName(n);
          }}
          onClose={() => navigateTo('/meeting')}
        />
      );
    }
    return <MeetingRoom room={room} displayName={name} title={t(room.titleKey)} />;
  }

  return (
    <div>
      <PageHeader title={t('meeting.pageTitle')} subtitle={t('meeting.pageSubtitle')} />
      <div className="container mx-auto max-w-4xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {MEETING_ROOMS.map((r) => (
            <MeetingCard
              key={r.key}
              title={t(r.titleKey)}
              description={t(r.descKey)}
              onJoin={() => navigateTo(`/meeting/${r.key}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default MeetingPage;
```

- [ ] **Step 2: Type-check**

Run: `cd Church && npx tsc --noEmit`
Expected: no errors referencing `MeetingPage.tsx`.

- [ ] **Step 3: Commit**

```bash
git add Church/components/meeting/MeetingPage.tsx
git commit -m "feat(meeting): meeting page orchestrator"
```

---

## Task 9: Wire routes in App.tsx

**Files:**
- Modify: `Church/App.tsx`

- [ ] **Step 1: Import MeetingPage**

Add with the other page imports near the top of `Church/App.tsx` (after the `PhotosPage` import on line 20):

```tsx
import MeetingPage from './components/meeting/MeetingPage';
```

- [ ] **Step 2: Add the route branches**

Inside `renderPage()`, add before the final `return <HomePage />;` (which is currently line 147):

```tsx
    if (route === '/meeting' || route === '/meeting/') {
      return <MeetingPage />;
    }
    if (route.startsWith('/meeting/')) {
      const segment = (route.split('/')[2] || '').split('?')[0];
      return <MeetingPage roomKey={segment} />;
    }
```

- [ ] **Step 3: Exclude /meeting from the homepage header style**

Update the `isHomePage` computation (currently line 151) to also exclude `/meeting`:

```tsx
  const isHomePage = !route.startsWith('/sermons') && !route.startsWith('/about') && !route.startsWith('/events') && !route.startsWith('/giving') && !route.startsWith('/contact') && !route.startsWith('/prayer-request') && !route.startsWith('/meeting') && !isPhotosPage;
```

- [ ] **Step 4: Type-check**

Run: `cd Church && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add Church/App.tsx
git commit -m "feat(meeting): route /meeting and /meeting/{ministry}"
```

---

## Task 10: Footer link

**Files:**
- Modify: `Church/components/Footer.tsx`

- [ ] **Step 1: Add a discreet meeting link**

In `Church/components/Footer.tsx`, add a link row just after the closing `</p>` of the copyright paragraph (inside the centered container):

```tsx
                <p className="mt-3 text-xs">
                    <a
                        href="/meeting"
                        className="text-gray-400 underline-offset-4 transition-colors hover:text-white hover:underline"
                    >
                        {t('footer.meeting')}
                    </a>
                </p>
```

- [ ] **Step 2: Type-check**

Run: `cd Church && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add Church/components/Footer.tsx
git commit -m "feat(meeting): footer link to co-worker meetings"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd Church && npm test`
Expected: all suites pass, including `constants/meetingRooms.test.ts` and `components/meeting/meetingAuth.test.ts`.

- [ ] **Step 2: Type-check the whole project**

Run: `cd Church && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `cd Church && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Manual smoke test**

Run: `cd Church && npm run dev`, then in a browser:
- Visit `/meeting` → the password gate appears.
- Enter a wrong code → error message; enter `110550` → the 6 ministry cards appear.
- Reload `/meeting` → no gate (unlock remembered).
- Click **Join** on a ministry → name modal → enter a name → the Jitsi call loads full-screen with your name; camera/mic prompts come from Jitsi.
- Click **← Back** → returns to the card grid.
- Reload the room URL directly (e.g. `/meeting/prayer`) → goes straight into the call (name remembered).
- Visit `/meeting/bogus` → redirects to `/meeting`.
- Footer shows the **Co-worker Meetings** link; toggle site language → all meeting labels switch EN/ZH.

- [ ] **Step 5: Final commit (if any manual fixes were needed)**

```bash
git add -A
git commit -m "test(meeting): verification fixes"
```

---

## Self-Review Notes

- **Spec coverage:** public meet.jit.si embed (Task 7), 6-ministry rooms reusing `eventsPage.nav*` (Tasks 1, 3), page-level `110550` gate remembered in localStorage (Tasks 2, 4, 8), client-side password check (Task 2), full-page room at `/meeting/{ministry}` with back button (Tasks 7, 9), name prompt with persistence (Tasks 6, 8), invalid-slug redirect (Task 8), script-load fallback (Task 7), Footer link / no header nav (Task 10), tests for the four pure behaviors + room lookup (Tasks 1–2). All spec requirements map to a task.
- **Type consistency:** `MeetingRoom` config interface (`key`, `jitsiRoom`, `titleKey`, `descKey`) is used identically in `meetingRooms.ts`, `MeetingPage.tsx`, and `MeetingRoom.tsx`. Helper names (`checkMeetingPassword`, `normalizeDisplayName`, `isValidDisplayName`, `findMeetingRoom`) and localStorage keys (`MEETING_UNLOCK_KEY`, `MEETING_NAME_KEY`) match across their definition and call sites.
- **Testing posture:** component tests are intentionally omitted (no jsdom/testing-library in the repo); logic is extracted into `meetingRooms.ts` / `meetingAuth.ts` and unit-tested in the node env, consistent with `live/liveStats.test.ts`.
