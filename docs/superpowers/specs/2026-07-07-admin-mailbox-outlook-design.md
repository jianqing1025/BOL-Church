# Admin Mailbox (Outlook-style) — Inbox & Prayer Requests

**Date:** 2026-07-07
**Status:** Approved (design)
**Area:** `Church/` (admin UI + Worker API + D1)

## Goal

Turn the admin **收件箱 (contact inbox)** and **代祷请求 (prayer requests)** from flat
lists into an Outlook-style two-pane experience: a message list on the left, the
full body on the right, with the ability to **reply by email**. Replies are sent
via Resend from **`Lingling <Lingling@bolccop.org>`** with **reply-to
`bolccop@gmail.com`**, and each reply is saved so the reading pane shows a
conversation thread. Also capture and display the **sender's location**
(country / region / city) from Cloudflare geo.

## Decisions (captured in brainstorming)

1. **Replies:** send via Resend **and** persist each reply; reading pane shows the
   original message + reply thread.
2. **Location detail:** country + region + city (Cloudflare geo, no raw IP).
3. **Layout:** two independent Outlook two-pane views (separate 收件箱 and 代祷请求
   tabs), not a merged inbox.
4. **From:** `Lingling <Lingling@bolccop.org>`; **reply-to:** `bolccop@gmail.com`.

## Non-goals

- No inbound email ingestion (recipient replies go to `bolccop@gmail.com`, handled in Gmail).
- No rich-text/HTML composer — plain-text reply body (rendered as safe HTML on send).
- No attachments.
- No change to the public contact / prayer-request forms beyond what location capture requires (none — capture is server-side from `request.cf`).

## Existing state

- Tables `messages` and `prayer_requests`: `id, date, first_name, last_name, email, phone, message, read|status`.
- `POST /api/messages`, `POST /api/prayer-requests` create rows; `PATCH …/read`, `PATCH …/prayed`, `DELETE …` exist (contributor+).
- Admin loads `messages` / `prayerRequests` in the session payload; `AdminContext` holds them + actions (`markMessageRead`, `deleteMessage`, `markPrayerPrayed`, `deletePrayerRequest`); `AdminDashboard` renders flat lists.
- Resend already wired: `env.RESEND_API_KEY`, `POST https://api.resend.com/emails` with `{ from, to, reply_to, subject, html }`. Domain `bolccop.org` verified (Finance uses `finance@bolccop.org`).

## Architecture

### 1. D1 schema & location capture

- Add `country TEXT, region TEXT, city TEXT` to `messages` and `prayer_requests`.
  Delivered as a migration file **and** an idempotent `ALTER TABLE … ADD COLUMN`
  guard in an `ensureMailboxSchema(env)` (try/catch per column, matching
  `ensureLiveStatsSchema`).
- New table:
  ```sql
  CREATE TABLE IF NOT EXISTS mailbox_replies (
    id TEXT PRIMARY KEY,
    parent_type TEXT NOT NULL,   -- 'message' | 'prayer'
    parent_id TEXT NOT NULL,
    body TEXT NOT NULL,
    to_email TEXT NOT NULL,
    sent_by TEXT,                -- admin display name
    status TEXT NOT NULL,        -- 'sent' | 'failed'
    error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mailbox_replies_parent ON mailbox_replies (parent_type, parent_id);
  ```
- `extractGeo(cf)` — pure helper returning `{ country, region, city }` from
  `request.cf` (`country`, `region` ?? `regionCode`, `city`), each null when
  absent. Called in the two POST handlers; stored on insert. Best-effort (cf is
  undefined in local dev → all null).
- `mapMessage` / `mapPrayerRequest` include `country/region/city`.

### 2. Reply + thread endpoints (Worker)

Shared helper `sendResendEmail(env, { from, to, replyTo, subject, html })`
refactored out of the existing inline Resend calls and reused by the archive /
sync notifications too.

- `POST /api/messages/:id/reply` and `POST /api/prayer-requests/:id/reply`
  (contributor+): body `{ body: string }`.
  - Load parent → recipient email + name. If no email → 400.
  - `buildReplyEmail(kind, parent, body)` (pure) → `{ subject, html }`.
    - inbox subject `Re: 您寄給信望愛靈糧堂的訊息`; prayer subject `回覆您的代禱請求`.
    - html = escaped reply body (newlines → `<br>`) + a quoted block of the original.
  - Send via `sendResendEmail` with from `Lingling <Lingling@bolccop.org>`,
    `replyTo: 'bolccop@gmail.com'`.
  - Insert `mailbox_replies` row: `status='sent'` on success, `'failed'` + `error`
    on failure (still 200 with the failed reply so the UI can show + retry).
  - Inbox: also set `messages.read = 1`. Prayer `status` unchanged.
  - Returns `{ reply, parent }`.
- `GET /api/messages/:id/replies` and `GET /api/prayer-requests/:id/replies`
  (contributor+): returns `{ replies: MailboxReply[] }` ordered `created_at ASC`.
  Loaded on demand when an item is opened (keeps the session payload lean).

### 3. Frontend — `<Mailbox>` (Outlook two-pane), reused by both tabs

`components/admin/Mailbox.tsx`, props:
```ts
{
  kind: 'inbox' | 'prayer';
  items: (Message | PrayerRequest)[];
  onOpen: (id) => void;              // marks inbox read on open
  onDelete: (id) => Promise<void>;
  onReply: (id, body) => Promise<MailboxReply>;
  loadReplies: (id) => Promise<MailboxReply[]>;
  onMarkPrayed?: (id) => Promise<void>;  // prayer only
}
```
- **Left pane:** scrollable list — sender name, message snippet, date, unread dot
  (inbox `!read`, prayer `status==='new'`). Selected row highlighted.
- **Right (reading) pane:** header (sender name, email, phone, **location**
  `city, region, country`, date) → full message → reply thread (each reply with
  timestamp, sender name, sent/failed badge) → reply composer (textarea + Send;
  disabled while sending; failure shows inline error). Actions: delete; prayer
  also mark-prayed.
- **Responsive:** ≥ md two-pane; < md shows the list, tap opens reading pane with
  a back button (single-column).
- Rendered by `AdminDashboard` for the inbox and prayer tabs, replacing the flat
  lists. Empty-state preserved.

### 4. Data / API layer

- `api.ts`: `replyToMessage(id, body)`, `replyToPrayer(id, body)`,
  `getMessageReplies(id)`, `getPrayerReplies(id)`.
- `AdminContext`: expose the four actions; update local `messages` state on reply
  (mark read). `messages` / `prayerRequests` now carry `country/region/city`.
- `types.ts` / `data.ts`: extend `Message` & `PrayerRequest` with
  `country/region/city`; add `MailboxReply` type.

### 5. Config / constants

- `MAILBOX_FROM = 'Lingling <Lingling@bolccop.org>'`,
  `MAILBOX_REPLY_TO = 'bolccop@gmail.com'`.
- Reuses `env.RESEND_API_KEY`. No new secret. Any `@bolccop.org` sender is valid
  on the verified domain.

## Error handling

- Missing `RESEND_API_KEY` or Resend failure → reply persisted `status='failed'`
  with error; UI surfaces it and allows resending. Never throws to the client.
- No sender email on the parent → 400 with a clear message.
- Cloudflare geo absent (local dev) → location fields null; UI shows "—".
- All reply / replies endpoints require contributor+.

## Testing

- **Pure unit tests** (vitest, node env — the only reliably testable layer):
  - `extractGeo(cf)`: maps fields, handles missing cf / partial fields.
  - `buildReplyEmail(kind, parent, body)`: correct subject per kind; escapes HTML
    in the body; includes quoted original.
- Existing suites stay green; no changes to pure live/meeting logic.
- The Worker endpoints and React panes aren't unit-tested (no D1 / jsdom harness)
  — verified via `tsc`, build, and manual admin testing after deploy.

## Rollout / risk

- Additive: new columns/table (idempotent ensure + migration), new endpoints, new
  component. Public forms and existing admin actions unchanged.
- Main risk is the Resend send path (auth/domain). Mitigation: reuse the proven
  Finance/Church send pattern; failures are captured, not fatal.
- Reversible: the two tabs can fall back to the old lists; endpoints are new.
