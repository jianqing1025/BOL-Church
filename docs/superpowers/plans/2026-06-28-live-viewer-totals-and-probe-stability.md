# Live Viewer Totals, Probe Stability & History Stats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live online count cumulative (website unique sessions + YouTube peak), stop transient `search.list` empties from falsely ending the stream and resetting `started_at`, and show online/views stats on history-broadcast cards.

**Architecture:** Append-only `live_session_seen` table gives website cumulative-unique (PK dedups a browser); YouTube peak is a new `live_stream_state.youtube_peak` column updated to the running max each probe. Probe confirms stream-end via `videos.list` `actualEndTime` instead of trusting an empty search. Archive snapshots `(websiteUnique + youtubePeak)` into a new `sermons.live_online_total`; `views` reuses existing `view_count`.

**Tech Stack:** Cloudflare Workers + D1 (SQLite), React 19 + Vite, TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-06-28-live-viewer-totals-and-probe-stability-design.md`.

---

## File Structure

- **Create** `Church/live/liveStats.ts` — pure helpers (`nextPeak`, `computeTotalOnline`, `decideStreamEnd`). Testable without D1.
- **Create** `Church/live/liveStats.test.ts` — vitest for the pure helpers.
- **Create** `Church/migrations/0013_live_viewer_totals.sql` — new table + columns.
- **Modify** `Church/server.ts` — schema ensure, state row type/IO, seen helpers, joinViewer, probe logic, public state, archive snapshot, mapSermon.
- **Modify** `Church/types.ts` — `LiveStreamPublicState` new fields.
- **Modify** `Church/data.ts` — `Sermon.liveOnlineTotal`.
- **Modify** `Church/constants/translations.ts` — `liveChat.countLabelTotal`.
- **Modify** `Church/components/LiveStreamSection.tsx` — counts bar, toggle bar, history cards.

All commands run from `Church/` unless noted. Commit after each task.

---

### Task 1: Pure live-stats helpers (TDD)

**Files:**
- Create: `Church/live/liveStats.ts`
- Test: `Church/live/liveStats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Church/live/liveStats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextPeak, computeTotalOnline, decideStreamEnd } from './liveStats';

describe('nextPeak', () => {
  it('returns current when no prior peak', () => {
    expect(nextPeak(null, 5)).toBe(5);
    expect(nextPeak(undefined, 0)).toBe(0);
  });
  it('keeps prior peak when current is null', () => {
    expect(nextPeak(7, null)).toBe(7);
  });
  it('takes the max', () => {
    expect(nextPeak(7, 3)).toBe(7);
    expect(nextPeak(3, 7)).toBe(7);
  });
  it('returns null when both missing', () => {
    expect(nextPeak(null, null)).toBeNull();
  });
});

describe('computeTotalOnline', () => {
  it('adds website total and youtube peak', () => {
    expect(computeTotalOnline(128, 177)).toBe(305);
  });
  it('treats missing youtube peak as 0', () => {
    expect(computeTotalOnline(128, null)).toBe(128);
    expect(computeTotalOnline(0, undefined)).toBe(0);
  });
});

describe('decideStreamEnd', () => {
  it('is live when search returns a video', () => {
    expect(decideStreamEnd({ searchVideoId: 'X', prevVideoId: 'X', prevIsLive: true, actualEndTime: null })).toBe('live');
  });
  it('is transient-miss when search empty but no actualEndTime', () => {
    expect(decideStreamEnd({ searchVideoId: null, prevVideoId: 'X', prevIsLive: true, actualEndTime: null })).toBe('transient-miss');
  });
  it('is ended when search empty and actualEndTime present', () => {
    expect(decideStreamEnd({ searchVideoId: null, prevVideoId: 'X', prevIsLive: true, actualEndTime: '2026-06-28T18:00:00Z' })).toBe('ended');
  });
  it('is ended when nothing was live', () => {
    expect(decideStreamEnd({ searchVideoId: null, prevVideoId: null, prevIsLive: false, actualEndTime: null })).toBe('ended');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run live/liveStats.test.ts`
Expected: FAIL — cannot find module `./liveStats`.

- [ ] **Step 3: Write the implementation**

Create `Church/live/liveStats.ts`:

```ts
// 纯函数,不依赖 Worker / D1,可单元测试。直播在线统计与结束判定辅助。

export function nextPeak(prev: number | null | undefined, current: number | null | undefined): number | null {
  const p = prev ?? null;
  const c = current ?? null;
  if (p == null) return c;
  if (c == null) return p;
  return Math.max(p, c);
}

export function computeTotalOnline(websiteTotal: number, youtubePeak: number | null | undefined): number {
  return websiteTotal + (youtubePeak ?? 0);
}

export type StreamEndDecision = 'live' | 'ended' | 'transient-miss';

// search.list 间歇性返回空。仅当上次在直播、本次搜索为空、且 liveStreamingDetails
// 无 actualEndTime 时,判为瞬时漏检(保持直播);有 actualEndTime 才算真结束。
export function decideStreamEnd(params: {
  searchVideoId: string | null;
  prevVideoId: string | null;
  prevIsLive: boolean;
  actualEndTime: string | null;
}): StreamEndDecision {
  if (params.searchVideoId) return 'live';
  if (params.prevIsLive && params.prevVideoId) {
    return params.actualEndTime ? 'ended' : 'transient-miss';
  }
  return 'ended';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run live/liveStats.test.ts`
Expected: PASS (12 assertions across 3 suites).

- [ ] **Step 5: Commit**

```bash
git add Church/live/liveStats.ts Church/live/liveStats.test.ts
git commit -m "feat(church): pure live-stats helpers (peak, total, end-decision)"
```

---

### Task 2: Migration 0013 (schema)

**Files:**
- Create: `Church/migrations/0013_live_viewer_totals.sql`

- [ ] **Step 1: Write the migration**

Create `Church/migrations/0013_live_viewer_totals.sql`:

```sql
-- 0013: 直播在线累计统计
--  - live_session_seen: 每场直播的 join 去重日志,用于"网站累计唯一人数"(主键对同一浏览器去重)
--  - live_stream_state.youtube_peak: 当前直播的 YouTube 并发峰值
--  - sermons.live_online_total: 归档当时的总在线人数快照(网站累计 + YouTube 峰值)

CREATE TABLE IF NOT EXISTS live_session_seen (
  video_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (video_id, session_id)
);

ALTER TABLE live_stream_state ADD COLUMN youtube_peak INTEGER;

ALTER TABLE sermons ADD COLUMN live_online_total INTEGER;
```

- [ ] **Step 2: Verify SQL against a real SQLite engine**

Create a throwaway check in the scratchpad and run it:

Run:
```bash
node --no-warnings --input-type=module -e '
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE live_stream_state (id INTEGER PRIMARY KEY, is_live INTEGER, video_id TEXT, started_at INTEGER, checked_at INTEGER, last_error TEXT, youtube_viewers INTEGER);`);
db.exec(`CREATE TABLE sermons (id TEXT PRIMARY KEY, youtube_id TEXT, view_count INTEGER);`);
db.exec(`CREATE TABLE IF NOT EXISTS live_session_seen (video_id TEXT NOT NULL, session_id TEXT NOT NULL, joined_at INTEGER NOT NULL, PRIMARY KEY (video_id, session_id));`);
db.exec(`ALTER TABLE live_stream_state ADD COLUMN youtube_peak INTEGER;`);
db.exec(`ALTER TABLE sermons ADD COLUMN live_online_total INTEGER;`);
db.prepare("INSERT OR IGNORE INTO live_session_seen VALUES (?,?,?)").run("V","s1",1);
db.prepare("INSERT OR IGNORE INTO live_session_seen VALUES (?,?,?)").run("V","s1",2);
db.prepare("INSERT OR IGNORE INTO live_session_seen VALUES (?,?,?)").run("V","s2",3);
const c = db.prepare("SELECT COUNT(*) AS c FROM live_session_seen WHERE video_id=?").get("V");
console.log("unique sessions for V:", c.c, "(expect 2)");
'
```
Expected: `unique sessions for V: 2 (expect 2)` — confirms PK dedups same session, and the ALTERs apply.

- [ ] **Step 3: Commit**

```bash
git add Church/migrations/0013_live_viewer_totals.sql
git commit -m "feat(church): migration 0013 — live_session_seen + youtube_peak + live_online_total"
```

---

### Task 3: Server schema plumbing (ensure, state row, mapSermon)

**Files:**
- Modify: `Church/server.ts`

- [ ] **Step 1: Add `ensureLiveStatsSchema` helper**

In `Church/server.ts`, immediately after `ensureMetadataColumns` (ends at line ~67), add:

```ts
async function ensureLiveStatsSchema(env: Env): Promise<void> {
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS live_session_seen (
        video_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (video_id, session_id)
      )`
    ).run();
  } catch { /* ignore */ }
  try { await env.DB.prepare('ALTER TABLE live_stream_state ADD COLUMN youtube_peak INTEGER').run(); } catch { /* already exists */ }
  try { await env.DB.prepare('ALTER TABLE sermons ADD COLUMN live_online_total INTEGER').run(); } catch { /* already exists */ }
}
```

- [ ] **Step 2: Extend `SermonRow` and `mapSermon`**

In `SermonRow` (ends ~line 53), add after `view_count?: number | null;`:

```ts
  live_online_total?: number | null;
```

In `mapSermon` return object (after `viewCount: row.view_count ?? null,` at ~line 447), add:

```ts
    liveOnlineTotal: row.live_online_total ?? null,
```

- [ ] **Step 3: Extend `LiveStreamStateRow`, `getLiveStreamStateRow`, `updateLiveStreamState`**

In `LiveStreamStateRow` (ends ~line 1786), add after `youtube_viewers?: number | null;`:

```ts
  youtube_peak?: number | null;
```

In `getLiveStreamStateRow`'s fallback return (~line 1827), change it to include the column:

```ts
  return { id: 1, is_live: 0, video_id: null, started_at: null, checked_at: 0, last_error: null, youtube_peak: null };
```

In `updateLiveStreamState` (~line 1959): add `youtube_peak` to the patch type and to the SQL. Replace the function body's prepare/bind so the SET clause and binds include `youtube_peak`:

```ts
async function updateLiveStreamState(
  env: Env,
  patch: Partial<{ is_live: number; video_id: string | null; started_at: number | null; checked_at: number; last_error: string | null; youtube_viewers: number | null; youtube_peak: number | null }>
): Promise<void> {
  const current = await getLiveStreamStateRow(env);
  const next = { ...current, ...patch };
  await env.DB
    .prepare(
      `UPDATE live_stream_state
       SET is_live = ?, video_id = ?, started_at = ?, checked_at = ?, last_error = ?, youtube_viewers = ?, youtube_peak = ?
       WHERE id = 1`
    )
    .bind(next.is_live, next.video_id, next.started_at, next.checked_at, next.last_error, (next as any).youtube_viewers ?? null, (next as any).youtube_peak ?? null)
    .run();
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep server.ts`
Expected: no `server.ts` lines (empty output).

- [ ] **Step 5: Commit**

```bash
git add Church/server.ts
git commit -m "feat(church): schema plumbing for youtube_peak + live_online_total"
```

---

### Task 4: Session-seen recording + count + joinViewer

**Files:**
- Modify: `Church/server.ts`

- [ ] **Step 1: Add seen helpers**

In `Church/server.ts`, immediately after `countViewersOnline` (ends ~line 2712), add:

```ts
async function recordSessionSeen(env: Env, videoId: string, sessionId: string): Promise<void> {
  try {
    await env.DB
      .prepare('INSERT OR IGNORE INTO live_session_seen (video_id, session_id, joined_at) VALUES (?, ?, ?)')
      .bind(videoId, sessionId, Date.now())
      .run();
  } catch { /* table may be missing pre-migration */ }
}

async function countWebsiteUnique(env: Env, videoId: string): Promise<number> {
  try {
    const row = await env.DB
      .prepare('SELECT COUNT(*) AS c FROM live_session_seen WHERE video_id = ?')
      .bind(videoId)
      .first<{ c: number }>();
    return Number(row?.c || 0);
  } catch {
    return 0;
  }
}
```

- [ ] **Step 2: Record seen on join**

In `joinViewer` (~line 2628), right after `const now = Date.now();` (first line of the function body), add:

```ts
  await recordSessionSeen(env, params.videoId, params.sessionId);
```

- [ ] **Step 3: Ensure schema in the join handler**

In `handleLiveJoin` (~line 3272), right after `await ensureLiveChatTables(env);`, add:

```ts
    await ensureLiveStatsSchema(env);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep server.ts`
Expected: empty output.

- [ ] **Step 5: Commit**

```bash
git add Church/server.ts
git commit -m "feat(church): record unique sessions per live (live_session_seen)"
```

---

### Task 5: YouTube liveStreamingDetails fetch + probe peak + #2 end-confirmation

**Files:**
- Modify: `Church/server.ts`

- [ ] **Step 1: Add `fetchLiveStreamingDetails` and remove the old concurrent-only fetch**

In `Church/server.ts`, replace the whole `fetchYouTubeConcurrentViewers` function (~lines 2714-2730) with:

```ts
async function fetchLiveStreamingDetails(
  apiKey: string | null,
  videoId: string
): Promise<{ concurrentViewers: number | null; actualEndTime: string | null }> {
  if (!apiKey) return { concurrentViewers: null, actualEndTime: null };
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'liveStreamingDetails');
    url.searchParams.set('id', videoId);
    url.searchParams.set('key', apiKey);
    const response = await fetch(url.toString());
    if (!response.ok) return { concurrentViewers: null, actualEndTime: null };
    const data = await response.json<{
      items?: Array<{ liveStreamingDetails?: { concurrentViewers?: string; actualEndTime?: string } }>;
    }>();
    const d = data.items?.[0]?.liveStreamingDetails;
    const n = d?.concurrentViewers != null ? Number(d.concurrentViewers) : NaN;
    return {
      concurrentViewers: Number.isFinite(n) ? n : null,
      actualEndTime: d?.actualEndTime ?? null,
    };
  } catch {
    return { concurrentViewers: null, actualEndTime: null };
  }
}
```

- [ ] **Step 2: Add the import for the pure helper**

At the top of `Church/server.ts`, find the existing import from `./sync/classifier` and add a new import line beneath the imports block:

```ts
import { nextPeak } from './live/liveStats';
```

(If there is no existing import section, add this after the file's first `import`/type-only lines. Verify with `grep -n "^import" Church/server.ts`.)

- [ ] **Step 3: Replace the probe core in `runProbeIfDue`**

In `runProbeIfDue`, replace the block from `const result = await probeYouTubeLive(config);` through the end of the `else if (!result.videoId) { ... }` viewer-clear block (current lines ~2041-2075, i.e. everything up to but NOT including `// 順手清理過期 viewer / 老舊 chat` / `await cleanupLiveData(env);`) with:

```ts
  const result = await probeYouTubeLive(config);
  const prev = await getLiveStreamStateRow(env);

  // #2 修复:search.list 间歇性返回空。上次在直播、本次为空时,用 liveStreamingDetails
  // 的 actualEndTime 确认是否真结束;未结束则视为瞬时漏检,保留 is_live / started_at / video_id。
  if (!result.videoId && prev.is_live === 1 && prev.video_id) {
    const details = await fetchLiveStreamingDetails(config.api_key, prev.video_id);
    if (!details.actualEndTime) {
      const peak = nextPeak((prev as any).youtube_peak ?? null, details.concurrentViewers);
      await updateLiveStreamState(env, {
        checked_at: Date.now(),
        last_error: result.error,
        youtube_viewers: details.concurrentViewers,
        youtube_peak: peak,
      });
      await cleanupLiveData(env);
      return getLiveStreamStateRow(env);
    }
  }

  // 邊沿檢測:justEnded 已经过上面的 actualEndTime 确认
  const justEnded = prev.is_live === 1 && prev.video_id && !result.videoId;
  const pendingArchive = !prev.is_live && prev.video_id && !result.videoId;
  const videoIdToArchive = justEnded || pendingArchive ? prev.video_id : null;

  const newVideoId = result.videoId ?? videoIdToArchive ?? null;
  const isNewVideo = !!result.videoId && prev.video_id !== result.videoId;
  const startedAt = result.videoId
    ? (prev.video_id === result.videoId && prev.started_at ? prev.started_at : Date.now())
    : null;
  await updateLiveStreamState(env, {
    is_live: result.videoId ? 1 : 0,
    video_id: newVideoId,
    started_at: startedAt,
    checked_at: Date.now(),
    last_error: result.error,
    ...(isNewVideo ? { youtube_peak: 0 } : {}),
  });

  if (videoIdToArchive) {
    await tryArchiveAndNotify(env, config, videoIdToArchive);
  }

  // 直播中:拉并发,更新峰值(新视频从 0 起算)
  if (result.videoId && config.api_key) {
    try {
      const details = await fetchLiveStreamingDetails(config.api_key, result.videoId);
      const basePeak = isNewVideo ? 0 : ((prev as any).youtube_peak ?? null);
      const peak = nextPeak(basePeak, details.concurrentViewers);
      await updateLiveStreamState(env, { youtube_viewers: details.concurrentViewers, youtube_peak: peak });
    } catch { /* ignore */ }
  } else if (!result.videoId) {
    try { await updateLiveStreamState(env, { youtube_viewers: null }); } catch { /* ignore */ }
  }
```

Leave the subsequent `await cleanupLiveData(env);` and `return getLiveStreamStateRow(env);` lines intact.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep server.ts`
Expected: empty output.

- [ ] **Step 5: Commit**

```bash
git add Church/server.ts
git commit -m "fix(church): confirm stream-end via actualEndTime, preserve started_at, track YT peak"
```

---

### Task 6: Public state — expose websiteTotal / youtubePeak / totalOnline

**Files:**
- Modify: `Church/server.ts`

- [ ] **Step 1: Add the import for `computeTotalOnline`**

Update the live helper import added in Task 5 to:

```ts
import { nextPeak, computeTotalOnline } from './live/liveStats';
```

- [ ] **Step 2: Compute and expose new fields in `buildPublicLiveStreamState`**

In `buildPublicLiveStreamState` (~line 2751), add `websiteTotal` alongside the existing viewer vars. Replace:

```ts
  let viewersOnline = 0;
  let viewerList: Array<{ displayName: string; isAdmin: boolean; isGuest: boolean; guestNumber: number | null }> = [];
  if (activeVideoId) {
    try {
      viewersOnline = await countViewersOnline(env, activeVideoId);
      viewerList = await getViewerList(env, activeVideoId);
    } catch { /* tables may be missing */ }
  }
  const youtubeViewers = (state as any).youtube_viewers != null ? Number((state as any).youtube_viewers) : null;

  const baseExtras = { viewersOnline, youtubeViewers, viewerList };
```

with:

```ts
  let viewersOnline = 0;
  let websiteTotal = 0;
  let viewerList: Array<{ displayName: string; isAdmin: boolean; isGuest: boolean; guestNumber: number | null }> = [];
  if (activeVideoId) {
    try {
      viewersOnline = await countViewersOnline(env, activeVideoId);
      viewerList = await getViewerList(env, activeVideoId);
      websiteTotal = await countWebsiteUnique(env, activeVideoId);
    } catch { /* tables may be missing */ }
  }
  const youtubeViewers = (state as any).youtube_viewers != null ? Number((state as any).youtube_viewers) : null;
  const youtubePeak = (state as any).youtube_peak != null ? Number((state as any).youtube_peak) : null;
  const totalOnline = computeTotalOnline(websiteTotal, youtubePeak);

  const baseExtras = { viewersOnline, youtubeViewers, viewerList, websiteTotal, youtubePeak, totalOnline };
```

- [ ] **Step 3: Add the fields to the degraded fallback**

In `handleLiveStreamPublic`'s catch block (~line 2818), inside the fallback object, after `viewerList: [],` add:

```ts
      websiteTotal: 0,
      youtubePeak: null,
      totalOnline: 0,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep server.ts`
Expected: empty output.

- [ ] **Step 5: Commit**

```bash
git add Church/server.ts
git commit -m "feat(church): public live state exposes websiteTotal/youtubePeak/totalOnline"
```

---

### Task 7: Archive snapshot (#3) + seen cleanup

**Files:**
- Modify: `Church/server.ts`

> Context: `tryArchiveAndNotify` already (from the earlier dedup fix) does `INSERT OR IGNORE` + an "claim existing row as live-broadcast" branch. This task layers the online/views snapshot onto both branches and deletes the seen rows afterward.

- [ ] **Step 1: Compute snapshot values at the top of `tryArchiveAndNotify`**

In `tryArchiveAndNotify` (~line 2113), right after the opening `try {`, add (before the `const exists = ...` lookup):

```ts
    await ensureLiveStatsSchema(env);
    const stateForSnapshot = await getLiveStreamStateRow(env);
    const websiteUnique = await countWebsiteUnique(env, videoId);
    const onlineTotal = websiteUnique + Number((stateForSnapshot as any).youtube_peak ?? 0);
    let archivedViewCount: number | null = null;
    let archivedDuration: number | null = null;
    if (config.api_key) {
      const vm = (await fetchVideoMetadata(config.api_key, [videoId])).get(videoId);
      if (vm) { archivedViewCount = vm.viewCount; archivedDuration = vm.durationSeconds; }
    }
```

- [ ] **Step 2: Set snapshot on the "claim existing row" branch**

Find the existing branch `if (exists) { ... }`. Replace its body (the category-claim + manual_video_id + clear-state block) with one that also writes `live_online_total` and `view_count`:

```ts
    if (exists) {
      const sets: string[] = ['live_online_total = ?'];
      const binds: unknown[] = [onlineTotal];
      if (exists.category !== 'live-broadcast') {
        await ensureCategoryColumn(env);
        sets.push("category = 'live-broadcast'");
      }
      if (archivedViewCount != null) { sets.push('view_count = ?'); binds.push(archivedViewCount); }
      sets.push('updated_at = ?'); binds.push(new Date().toISOString());
      binds.push(exists.id);
      await env.DB.prepare(`UPDATE sermons SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      try {
        await env.DB.prepare('UPDATE live_stream_config SET manual_video_id = ?, updated_at = ? WHERE id = 1')
          .bind(videoId, Date.now()).run();
      } catch { /* ignore */ }
      await updateLiveStreamState(env, { is_live: 0, video_id: null, started_at: null, checked_at: Date.now(), last_error: null });
      await env.DB.prepare('DELETE FROM live_session_seen WHERE video_id = ?').bind(videoId).run();
      return;
    }
```

- [ ] **Step 3: Include snapshot columns in the fresh INSERT**

Find the `INSERT OR IGNORE INTO sermons (...)` in this function. Replace that prepared statement + its `.bind(...)` with the version that includes `duration_seconds, view_count, live_online_total`:

```ts
    const insertRes = await env.DB
      .prepare(
        `INSERT OR IGNORE INTO sermons (id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, type, category, duration_seconds, view_count, live_online_total, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sermon', 'live-broadcast', ?, ?, ?, ?, ?)`
      )
      .bind(sermonId, titleEn, titleZh, speakerEn, speakerZh, today, '', '', '', '', videoId, imageUrl, archivedDuration, archivedViewCount, onlineTotal, nowIso, nowIso)
      .run();
    const didInsert = (insertRes.meta?.changes ?? 0) > 0;
    if (!didInsert) {
      await env.DB.prepare("UPDATE sermons SET category = 'live-broadcast', live_online_total = ?, updated_at = ? WHERE youtube_id = ? AND category <> 'live-broadcast'")
        .bind(onlineTotal, nowIso, videoId).run();
    }
```

(Replaces the prior `INSERT OR IGNORE` + `didInsert` + claim-update block from the dedup fix.)

- [ ] **Step 4: Delete seen rows after a successful fresh archive**

Immediately after the `await sendLiveStreamArchiveNotification(...)` call (guarded by `if (didInsert)`) and before the closing `} catch (err) {`, add:

```ts
    await env.DB.prepare('DELETE FROM live_session_seen WHERE video_id = ?').bind(videoId).run();
```

- [ ] **Step 5: Clean stale seen rows in `cleanupLiveData`**

In `cleanupLiveData` (~line 2732), after the `DELETE FROM live_chat_messages WHERE created_at < ?` try-block, add:

```ts
  try {
    await env.DB.prepare('DELETE FROM live_session_seen WHERE joined_at < ?').bind(chatCutoff).run();
  } catch { /* table may not exist yet */ }
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep server.ts`
Expected: empty output.

- [ ] **Step 7: Commit**

```bash
git add Church/server.ts
git commit -m "feat(church): snapshot online total + views into archived live broadcast"
```

---

### Task 8: Frontend types

**Files:**
- Modify: `Church/types.ts`
- Modify: `Church/data.ts`

- [ ] **Step 1: Extend `LiveStreamPublicState`**

In `Church/types.ts`, inside `interface LiveStreamPublicState` (after `viewerList: LiveStreamViewer[];`, ~line 60), add:

```ts
  websiteTotal: number;
  youtubePeak: number | null;
  totalOnline: number;
```

- [ ] **Step 2: Extend `Sermon`**

In `Church/data.ts`, inside `interface Sermon` (after `viewCount?: number | null;`, ~line 18), add:

```ts
  liveOnlineTotal?: number | null;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "types.ts|data.ts"`
Expected: empty output.

- [ ] **Step 4: Commit**

```bash
git add Church/types.ts Church/data.ts
git commit -m "feat(church): client types for online totals + liveOnlineTotal"
```

---

### Task 9: i18n key

**Files:**
- Modify: `Church/constants/translations.ts`

- [ ] **Step 1: Add `countLabelTotal`**

In `Church/constants/translations.ts`, in the `liveChat` block right after `countLabelSite: { en: 'On-site', zh: '網站在線' },` (~line 198), add:

```ts
    countLabelTotal: { en: 'Total online', zh: '總在線' },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep translations.ts`
Expected: empty output.

- [ ] **Step 3: Commit**

```bash
git add Church/constants/translations.ts
git commit -m "feat(church): add liveChat.countLabelTotal i18n key"
```

---

### Task 10: UI — counts bar + chat toggle (#1)

**Files:**
- Modify: `Church/components/LiveStreamSection.tsx`

- [ ] **Step 1: Counts bar cell 1 → website cumulative**

In `LiveStreamSection.tsx` counts bar (~line 284), change:

```tsx
                <span className="text-gray-900">{state.viewersOnline}</span>
```
to:
```tsx
                <span className="text-gray-900">{state.websiteTotal}</span>
```

- [ ] **Step 2: Counts bar cell 2 → YouTube peak**

At ~line 289, change:

```tsx
                <span className="text-gray-900">{state.youtubeViewers ?? '—'}</span>
```
to:
```tsx
                <span className="text-gray-900">{state.youtubePeak ?? '—'}</span>
```

- [ ] **Step 3: Chat toggle bar right side → total online**

At ~line 300, change:

```tsx
              <span className="text-gray-400">{state.viewersOnline} {t('liveChat.onlineCountSuffix')}</span>
```
to:
```tsx
              <span className="text-gray-400">{t('liveChat.countLabelTotal')} {state.totalOnline}</span>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep LiveStreamSection.tsx`
Expected: empty output.

- [ ] **Step 5: Commit**

```bash
git add Church/components/LiveStreamSection.tsx
git commit -m "feat(church): counts bar shows website-cumulative, YT peak, total online"
```

---

### Task 11: UI — history broadcast cards (#3)

**Files:**
- Modify: `Church/components/LiveStreamSection.tsx`

- [ ] **Step 1: Add online + views stats to each card**

In `renderPastBroadcasts`, inside the card body `<div className="p-2.5">` (~line 232-235), after the date line:

```tsx
                <div className="p-2.5">
                  <div className="line-clamp-2 text-sm font-semibold text-gray-900">{title}</div>
                  {dateStr && <div className="mt-1 text-xs text-gray-500">{dateStr}</div>}
                </div>
```

replace with:

```tsx
                <div className="p-2.5">
                  <div className="line-clamp-2 text-sm font-semibold text-gray-900">{title}</div>
                  {dateStr && <div className="mt-1 text-xs text-gray-500">{dateStr}</div>}
                  {(typeof sermon.liveOnlineTotal === 'number' || typeof sermon.viewCount === 'number') && (
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-500 tabular-nums">
                      {typeof sermon.liveOnlineTotal === 'number' && (
                        <span title={t('liveChat.countLabelTotal')}>👥 {sermon.liveOnlineTotal}</span>
                      )}
                      {typeof sermon.viewCount === 'number' && <span>▶ {sermon.viewCount}</span>}
                    </div>
                  )}
                </div>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep LiveStreamSection.tsx`
Expected: empty output.

- [ ] **Step 3: Commit**

```bash
git add Church/components/LiveStreamSection.tsx
git commit -m "feat(church): show online + views on history broadcast cards"
```

---

### Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS — existing classifier tests (5) + new `liveStats` tests all green.

- [ ] **Step 2: Full typecheck (no new errors)**

Run: `npx tsc --noEmit`
Expected: the only errors are the pre-existing `SermonManager.tsx` ones present before this work (lines ~517-536). No new errors in any file this plan touched (`server.ts`, `types.ts`, `data.ts`, `translations.ts`, `LiveStreamSection.tsx`, `live/liveStats.ts`).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Apply migration locally and smoke-check schema**

Run: `npm run d1:migrate:local`
Expected: migration `0013_live_viewer_totals.sql` applies without error.

---

## Deployment note (manual, after merge)

Run the D1 migration on the target environment:

```bash
cd Church && npm run d1:migrate:remote
```

This adds `live_session_seen`, `live_stream_state.youtube_peak`, and `sermons.live_online_total`. Existing archived broadcasts will show no online/views until re-archived or metadata-refreshed; that is expected.

---

## Self-Review

**Spec coverage:**
- #1 cumulative website unique → Tasks 2,4 (seen table + count) + Task 6 (expose) + Task 10 (cell 1). ✓
- #1 YouTube peak → Task 3 (column), Task 5 (running max), Task 6 (expose), Task 10 (cell 2). ✓
- #1 total = website + peak → Task 1 (`computeTotalOnline`), Task 6, Task 10 (toggle bar). ✓
- #2 transient-empty no longer ends stream / preserves started_at → Task 1 (`decideStreamEnd` logic mirrored), Task 5 (probe rewrite). ✓
- #3 online snapshot → Task 2 (column), Task 7 (archive), Task 8/11 (type + card). ✓
- #3 views import → reuses existing `view_count`; Task 7 fills it at archive, Task 11 displays it. ✓

**Placeholder scan:** No TBD/TODO; every code step has concrete code; every run step has a command + expected output. ✓

**Type consistency:**
- `nextPeak`/`computeTotalOnline`/`decideStreamEnd` signatures identical between Task 1 definition and Task 5/6 usage. ✓
- New fields named consistently everywhere: `youtube_peak` (DB/row/patch), `youtubePeak` (client/public state), `websiteTotal`, `totalOnline`, `live_online_total` (DB) ↔ `liveOnlineTotal` (mapSermon/Sermon). ✓
- `fetchLiveStreamingDetails` returns `{ concurrentViewers, actualEndTime }`, used consistently in Task 5. Old `fetchYouTubeConcurrentViewers` fully removed (only caller was `runProbeIfDue`, replaced in same task). ✓
