# YouTube Live Stream Integration — Design

**Date:** 2026-05-21
**Project:** Church (`bolccop.org`)
**Page:** `/sermons/live-stream`
**Status:** Approved (pending spec review)

## Background

The church already has a YouTube channel and an operator manually starts the live broadcast from YouTube Studio every Sunday. The site's `/sermons/live-stream` tab currently renders only static editable text ([SermonsPage.tsx:355-368](../../../Church/components/SermonsPage.tsx#L355-L368)). We want the page to auto-embed the live player when the channel goes live on Sunday, and fall back to a "next service" banner plus the latest sermon replay when offline.

## Non-Goals

- **No OAuth.** We are not using the YouTube Live Streaming API to *create* broadcasts. The church starts broadcasts manually in YouTube Studio. We only need a read-only API Key.
- **No RTMP / encoder integration.** The encoding pipeline (OBS / hardware) stays with the church's existing setup.
- **No live chat embed.** Phase 1 is video player only.
- **No multi-channel support.** One channel ID per deploy.

## Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│ Admin (AdminDashboard → new "Live Stream" tab)             │
│   PUT /api/admin/live-stream/config  → D1 live_stream_config│
└────────────────────────────────────────────────────────────┘
                          │
┌────────────────────────────────────────────────────────────┐
│ Worker scheduled() — cron "*/5 17-22 * * SUN" (UTC)        │
│   Reads config, calls YouTube search.list                  │
│   Writes D1 live_stream_state (is_live, video_id, ...)     │
└────────────────────────────────────────────────────────────┘
                          │
┌────────────────────────────────────────────────────────────┐
│ Public GET /api/live-stream                                 │
│   Reads D1 cache only (no YouTube call). Returns           │
│   { status, videoId, startedAt, nextService, latestSermon }│
└────────────────────────────────────────────────────────────┘
                          │
┌────────────────────────────────────────────────────────────┐
│ /sermons/live-stream                                        │
│   Polls /api/live-stream every 30s                         │
│   live    → embed YouTube IFrame Player (autoplay)         │
│   offline → "next service" banner + latest sermon replay   │
└────────────────────────────────────────────────────────────┘
```

**Key invariants:**
- The public page never calls the YouTube API directly. API Key is never sent to the browser.
- All YouTube API calls are concentrated in the scheduled Worker (controlled quota usage).
- The cron expression is fixed (UTC SUN 17:00–22:00 every 5 min). Worker code applies the configured timezone + service time at runtime to decide whether to actually probe.

## Data Model

New migration `Church/migrations/0005_add_live_stream.sql`:

```sql
CREATE TABLE live_stream_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  channel_id TEXT,
  api_key TEXT,
  service_day INTEGER NOT NULL DEFAULT 0,         -- 0=Sun,1=Mon,...
  service_start_local TEXT NOT NULL DEFAULT '10:00',
  service_duration_minutes INTEGER NOT NULL DEFAULT 90,
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  manual_video_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE live_stream_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_live INTEGER NOT NULL DEFAULT 0,
  video_id TEXT,
  started_at INTEGER,
  checked_at INTEGER NOT NULL,
  last_error TEXT
);

-- Seed single rows so updates can use UPDATE not UPSERT
INSERT INTO live_stream_config (id, updated_at) VALUES (1, 0);
INSERT INTO live_stream_state  (id, checked_at) VALUES (1, 0);
```

`api_key` is stored as plain text. The key is scoped to the YouTube Data API v3 (read-only) and HTTP-referrer-restricted to the church domains in Google Cloud Console. Exposure risk is low; encryption would add complexity without meaningful protection.

## Admin UI

New tab in `AdminDashboard` between `sermons` and `manna`. Translation key: `admin.livestream` ("直播" / "Live Stream").

**Form** (Tailwind, matches existing admin form style):

| Field | Type | Notes |
|---|---|---|
| `enabled` | checkbox | "启用自动直播" |
| `channel_id` | text | placeholder "UCxxxxxxxxxxxxxxxxxxxxxx" |
| `api_key` | password | server returns masked `AIza••••XYZ`; submit unchanged → server keeps old value |
| `service_day` | select | Sun–Sat, default Sun |
| `service_start_local` | time | HH:MM 24h |
| `service_duration_minutes` | number | default 90 |
| `timezone` | select | IANA names; default `America/Los_Angeles` |
| `manual_video_id` | text | optional; if set, page treats stream as permanently live |

**Buttons:**
- `[立即测试连接]` → POST `/api/admin/live-stream/test` with submitted channel_id + api_key → server calls `channels.list?part=snippet&id=X` → returns channel name to confirm key works
- `[保存]` → PUT `/api/admin/live-stream/config`

**Status panel** (below the form):

```
● 直播中     video: dQw4w9WgXcQ
开始于:      2026-06-08 10:02 PT
最后检查:    2026-06-08 10:15 PT (3 分钟前)
下次检查:    2026-06-08 10:20 PT
                              [立即重新检查]
```

`[立即重新检查]` → POST `/api/admin/live-stream/probe` → forces one detection run, returns updated state.

## Public Page

Replace [SermonsPage.tsx:355-368](../../../Church/components/SermonsPage.tsx#L355-L368) with new `LiveStreamSection` component. Polls `/api/live-stream` every 30s via `useEffect` + `setInterval`.

**Live state:**

```
🔴 现场直播中   ·   于 10:02 AM PT 开始
┌────────────────────────────────────────────────┐
│  <iframe src="youtube.com/embed/{id}?autoplay=1│
│           &mute=1" allow="autoplay; ..." />    │
└────────────────────────────────────────────────┘
```

`mute=1` is required by browsers for autoplay to actually work without user interaction.

**Offline state:**

```
下次主日崇拜  ·  2026-06-08 (周日) 10:00 AM PT
              距离开始还有 1 天 21 小时

您也可以观看上一场录播：
┌────────────────────────────────────────────────┐
│  <iframe src="youtube.com/embed/{latestId}"    │
│           (no autoplay) />                     │
└────────────────────────────────────────────────┘
```

The "latest sermon" is read from the existing `sermons` D1 table (`SELECT * FROM sermons WHERE entry_type='sermon' ORDER BY date DESC LIMIT 1`). No YouTube API call.

**Styling:**
- Outer container: `prose prose-lg max-w-none` (existing pattern)
- Player wrapper: `aspect-video w-full rounded-lg overflow-hidden shadow-lg`
- Banner: same Tailwind palette as existing `PageHeader` / sermon cards (gray-900 / red-600 for live dot)

## Server Endpoints

All in `Church/server.ts`. Endpoint sketches (Worker syntax, abbreviated):

| Path | Method | Auth | Response |
|---|---|---|---|
| `/api/live-stream` | GET | public | `{ status: 'live' \| 'offline', videoId?, startedAt?, nextService: ISO, latestSermon: { id, title, videoId } \| null }` |
| `/api/admin/live-stream/config` | GET | admin | full config, `api_key` masked to last 4 chars |
| `/api/admin/live-stream/config` | PUT | admin | `{ ok: true }`; api_key sentinel `__unchanged__` → preserve |
| `/api/admin/live-stream/test` | POST | admin | `{ ok: boolean, channelName?: string, error?: string }` |
| `/api/admin/live-stream/probe` | POST | admin | runs detection synchronously; returns updated state |

**Admin auth** reuses the existing `requireAdmin(request, env)` pattern already in use for other admin endpoints.

## Cron / Scheduled Trigger

`wrangler.toml` addition:

```toml
[triggers]
crons = ["*/5 17-22 * * SUN"]
```

Range UTC SUN 17:00–22:00 covers PT SUN 9:00–14:00 year-round (handles both PST and PDT).

**`scheduled(event, env, ctx)` handler:**

```typescript
async function scheduled(event, env, ctx) {
  const config = await getConfig(env.DB);
  if (!config.enabled) return;
  if (config.manual_video_id) return;          // manual override skips probing
  if (!config.channel_id || !config.api_key) return;

  if (!withinServiceWindow(config, new Date())) return;

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=id` +
      `&channelId=${config.channel_id}` +
      `&eventType=live&type=video&maxResults=1` +
      `&key=${config.api_key}`
    );
    const json = await res.json();
    const videoId = json.items?.[0]?.id?.videoId ?? null;
    await updateState(env.DB, {
      is_live: videoId ? 1 : 0,
      video_id: videoId,
      started_at: videoId ? Date.now() : null,
      checked_at: Date.now(),
      last_error: null,
    });
  } catch (err) {
    await updateState(env.DB, { checked_at: Date.now(), last_error: String(err) });
  }
}
```

`withinServiceWindow` uses `Intl.DateTimeFormat` with `timeZone: config.timezone` to project the current UTC time into local; checks day-of-week and minute offset from `service_start_local`, allowing a `[-30, duration + 30]` minute window.

**Quota accounting:**
- `search.list` costs **100 units** per call.
- Window: PT SUN 9:30–12:30 (sample), every 5 min = 36 probes/week.
- Weekly cost: 36 × 100 = **3,600 units/week** ≈ 514/day average.
- Daily quota: 10,000 default. Comfortable margin.
- `channels.list` (admin test connection) costs 1 unit, negligible.

## Manual Override

If `manual_video_id` is set in config:
- Cron skips probing (saves quota)
- `live_stream_state.is_live` is ignored at API layer
- Public API returns `{ status: 'live', videoId: manual_video_id, startedAt: null }`

Use cases: joint services with another church's channel, special weekday broadcasts, contingency when API quota is exhausted.

## Rollout

Deploy target: **`church-dev` worker** (separate from prod `bol-church`), routed at Cloudflare to `dev.bolccop.org`.

```
Step 1.  Apply migration 0005 to dev D1
Step 2.  wrangler deploy --env dev  (or whichever env config church-dev uses)
Step 3.  Open dev.bolccop.org/admin/livestream
         - enter channel_id + api_key
         - click [立即测试连接] → confirm channel name returned
         - click [立即重新检查] → confirm state row updates
Step 4.  Open dev.bolccop.org/sermons/live-stream
         - offline: verify "next service" banner + latest sermon embed
         - set manual_video_id to a known live stream URL → verify live state
Step 5.  Sunday 10am: live verification on dev
Step 6.  Promote: apply migration + deploy to www.bolccop.org
```

`wrangler.toml` may need an `[env.dev]` block to target `church-dev` if it's not already configured. This is verified during step 2.

## Open Questions

None — design is closed. Build-time decisions:

- TypeScript interface for `LiveStreamConfig` / `LiveStreamState` lives in `Church/types.ts`.
- Translation keys (`admin.livestream`, `sermonsPage.liveBadge`, `sermonsPage.nextServiceLabel`, etc.) added to `constants/translations.ts` (`en` + `zh`).
- Polling interval (30s) is a constant in the public component; can be tuned post-launch.
