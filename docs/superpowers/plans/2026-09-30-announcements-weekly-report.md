# 公告欄與同工週報 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開的公告欄（Hero 上的浮動小卡 + `/announcements`）與以密碼存取的每週同工週報（`/weekly`），皆在 `/admin` 編輯。

**Architecture:** 公告存 D1、隨網站快照（KV）送給訪客，前端依教會時區過濾到期；週報存 D1、附件存 R2 `weekly/`，所有週報端點以 HMAC 通行證 cookie 在伺服器驗證。純邏輯（日期、過濾、通行證、附件檢查）放 `bulletin/` 以 vitest 測試。

**Tech Stack:** Cloudflare Workers（`Church/server.ts`）、D1、KV、R2、React 19 + Tailwind、vitest（node）。

Spec: `docs/superpowers/specs/2026-09-30-announcements-weekly-report-design.md`

---

## 檔案結構

| 檔案 | 責任 |
| --- | --- |
| `Church/bulletin/announcements.ts` (+test) | 教會時區的今天、公告過濾排序、預設顯示到、小卡是否該出現 |
| `Church/bulletin/weekly.ts` (+test) | 週日換算、通行證簽發/驗證、附件類型與大小檢查 |
| `Church/migrations/0020_announcements_weekly.sql` | 兩張表 + 初始週報密碼雜湊 |
| `Church/snapshot/snapshot.ts` (+test) | 網站快照帶上 `announcements` |
| `Church/snapshot/rebuildTrigger.ts` (+test) | 公告寫入觸發重建 |
| `Church/server.ts` | 公告與週報 API、bootstrap 帶公告 |
| `Church/data.ts`、`Church/api.ts` | 型別與 API client |
| `Church/services/siteCache.ts` (+test) | 裝置快取加入公告 |
| `Church/context/AdminContext.tsx` | `announcements` 狀態 |
| `Church/components/AnnouncementCard.tsx` | Hero 浮動小卡 |
| `Church/components/AnnouncementsPage.tsx` | `/announcements` |
| `Church/components/WeeklyReportPage.tsx` | `/weekly` |
| `Church/components/AnnouncementManager.tsx` | 後台公告 |
| `Church/components/WeeklyReportManager.tsx` | 後台週報與密碼 |
| `Church/components/Hero.tsx`、`Header.tsx`、`Footer.tsx`、`App.tsx`、`AdminDashboard.tsx` | 接線 |
| `Church/constants/translations.ts` | 文字 |
| `Church/vitest.config.ts` | include `bulletin/**/*.test.ts` |

---

### Task 1: 公告純邏輯

**Files:** Create `Church/bulletin/announcements.ts`, `Church/bulletin/announcements.test.ts`; Modify `Church/vitest.config.ts`（include 加 `'bulletin/**/*.test.ts'`）

- [ ] **Step 1: 寫測試**

```ts
import { describe, expect, it } from 'vitest';
import { currentAnnouncements, defaultShowUntil, shouldShowCard, todayInChurch, type Announcement } from './announcements';

const a = (id: string, showUntil: string, eventDate: string | null = null): Announcement => ({
  id, title: id, bodyHtml: '', eventDate, showUntil, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
});

describe('todayInChurch', () => {
  it('以 America/Los_Angeles 計算今天', () => {
    // 2026-10-01 05:00 UTC = 9/30 22:00 PDT
    expect(todayInChurch(new Date('2026-10-01T05:00:00Z'))).toBe('2026-09-30');
  });
});

describe('currentAnnouncements', () => {
  it('過濾掉顯示到早於今天的，當天仍顯示', () => {
    const list = currentAnnouncements([a('old', '2026-09-29'), a('today', '2026-09-30')], '2026-09-30');
    expect(list.map(x => x.id)).toEqual(['today']);
  });
  it('依活動日期（沒有則顯示到）由近到遠', () => {
    const list = currentAnnouncements([a('b', '2026-10-20', '2026-10-12'), a('c', '2026-10-05'), a('d', '2026-11-01', '2026-10-01')], '2026-09-30');
    expect(list.map(x => x.id)).toEqual(['d', 'c', 'b']);
  });
});

describe('defaultShowUntil', () => {
  it('有活動日期就用活動日期，否則今天起 14 天', () => {
    expect(defaultShowUntil('2026-10-12', '2026-09-30')).toBe('2026-10-12');
    expect(defaultShowUntil(null, '2026-09-30')).toBe('2026-10-14');
  });
});

describe('shouldShowCard', () => {
  it('沒關過就顯示；關過的同一批不顯示；有新公告再顯示；只少了不會再顯示', () => {
    expect(shouldShowCard(['x'], null)).toBe(true);
    expect(shouldShowCard(['x', 'y'], ['x', 'y'])).toBe(false);
    expect(shouldShowCard(['x', 'y', 'z'], ['x', 'y'])).toBe(true);
    expect(shouldShowCard(['x'], ['x', 'y'])).toBe(false);
    expect(shouldShowCard([], null)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗** — `npx vitest run bulletin` → FAIL（模組不存在）

- [ ] **Step 3: 實作**

```ts
export type Announcement = {
  id: string; title: string; bodyHtml: string;
  eventDate: string | null; showUntil: string; createdAt: string; updatedAt: string;
};

export const CHURCH_TIME_ZONE = 'America/Los_Angeles';

export function todayInChurch(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CHURCH_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const sortKey = (item: Announcement) => item.eventDate ?? item.showUntil;

export function currentAnnouncements(list: Announcement[], today: string): Announcement[] {
  return list
    .filter(item => item.showUntil >= today)
    .sort((x, y) => sortKey(x).localeCompare(sortKey(y)) || x.createdAt.localeCompare(y.createdAt));
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function defaultShowUntil(eventDate: string | null, today: string): string {
  return eventDate || addDays(today, 14);
}

/** 關閉後只有出現新的公告才再顯示。 */
export function shouldShowCard(currentIds: string[], dismissedIds: string[] | null): boolean {
  if (currentIds.length === 0) return false;
  if (!dismissedIds) return true;
  return currentIds.some(id => !dismissedIds.includes(id));
}
```

- [ ] **Step 4: 跑測試確認通過** — `npx vitest run bulletin` → PASS
- [ ] **Step 5: Commit** — `git add Church/bulletin Church/vitest.config.ts && git commit -m "feat(church): 公告過濾與小卡顯示規則"`

### Task 2: 週報純邏輯

**Files:** Create `Church/bulletin/weekly.ts`, `Church/bulletin/weekly.test.ts`

- [ ] **Step 1: 寫測試**

```ts
import { describe, expect, it } from 'vitest';
import { attachmentProblem, issueAccessToken, sundayOf, verifyAccessToken, MAX_ATTACHMENT_BYTES } from './weekly';

describe('sundayOf', () => {
  it('回傳當週（週日起）的週日', () => {
    expect(sundayOf('2026-09-30')).toBe('2026-09-27'); // 週三
    expect(sundayOf('2026-09-27')).toBe('2026-09-27'); // 週日本身
    expect(sundayOf('2026-10-03')).toBe('2026-09-27'); // 週六
  });
});

describe('access token', () => {
  const now = new Date('2026-09-30T00:00:00Z');
  it('簽發後可驗證', async () => {
    const token = await issueAccessToken('secret-a', now);
    expect(await verifyAccessToken('secret-a', token, now)).toBe(true);
  });
  it('過期失效', async () => {
    const token = await issueAccessToken('secret-a', now, 30);
    expect(await verifyAccessToken('secret-a', token, new Date('2026-11-01T00:00:00Z'))).toBe(false);
  });
  it('換了金鑰（改密碼）就失效', async () => {
    const token = await issueAccessToken('secret-a', now);
    expect(await verifyAccessToken('secret-b', token, now)).toBe(false);
  });
  it('竄改或格式錯誤都失效', async () => {
    const token = await issueAccessToken('secret-a', now);
    const [exp, sig] = token.split('.');
    expect(await verifyAccessToken('secret-a', `${Number(exp) + 1000}.${sig}`, now)).toBe(false);
    expect(await verifyAccessToken('secret-a', 'garbage', now)).toBe(false);
    expect(await verifyAccessToken('secret-a', '', now)).toBe(false);
  });
});

describe('attachmentProblem', () => {
  it('允許 PDF、Word、圖片，拒絕其他與超過 20 MB', () => {
    expect(attachmentProblem('a.pdf', 'application/pdf', 1000)).toBeNull();
    expect(attachmentProblem('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1000)).toBeNull();
    expect(attachmentProblem('a.doc', 'application/msword', 1000)).toBeNull();
    expect(attachmentProblem('a.jpg', 'image/jpeg', 1000)).toBeNull();
    expect(attachmentProblem('a.exe', 'application/octet-stream', 1000)).toBe('type');
    expect(attachmentProblem('a.pdf', 'application/pdf', MAX_ATTACHMENT_BYTES + 1)).toBe('size');
  });
});
```

- [ ] **Step 2: 確認失敗**
- [ ] **Step 3: 實作**

```ts
export const ACCESS_TTL_DAYS = 30;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function sundayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

const b64url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

/** `<到期毫秒>.<HMAC>`；金鑰是密碼雜湊，改密碼即讓舊通行證全部失效。 */
export async function issueAccessToken(secret: string, now = new Date(), ttlDays = ACCESS_TTL_DAYS): Promise<string> {
  const exp = String(now.getTime() + ttlDays * 86_400_000);
  return `${exp}.${await sign(secret, exp)}`;
}

export async function verifyAccessToken(secret: string, token: string | null | undefined, now = new Date()): Promise<boolean> {
  const [exp, sig, extra] = String(token || '').split('.');
  if (!exp || !sig || extra !== undefined || !/^\d+$/.test(exp)) return false;
  if (Number(exp) <= now.getTime()) return false;
  return (await sign(secret, exp)) === sig;
}

const ALLOWED = [/\.pdf$/i, /\.docx?$/i, /\.(png|jpe?g|gif|webp|heic)$/i];

export function attachmentProblem(name: string, type: string, size: number): 'type' | 'size' | null {
  const okType = ALLOWED.some(re => re.test(name)) || type === 'application/pdf' || type.startsWith('image/');
  if (!okType) return 'type';
  if (size > MAX_ATTACHMENT_BYTES) return 'size';
  return null;
}
```

- [ ] **Step 4: 確認通過** — `npx vitest run bulletin`
- [ ] **Step 5: Commit** — `git commit -m "feat(church): 週報週次、通行證與附件檢查"`

### Task 3: Migration

**Files:** Create `Church/migrations/0020_announcements_weekly.sql`

- [ ] 內容：`announcements`、`weekly_reports`（`week_of` UNIQUE）兩張表（皆 `IF NOT EXISTS`），並以 `INSERT OR IGNORE INTO settings (key, value_json, updated_at)` 寫入 `weeklyPassword = {"salt": <16 bytes hex>, "hash": base64(sha256("<salt>:110550"))}`。salt/hash 以 Python 預先算好寫入檔案，程式碼中不出現明文密碼。
- [ ] 套用方式：**不可**執行 `wrangler d1 migrations apply --remote`（會一併套用尚未決定的 `0018_donations_stripe.sql`）。以 `wrangler d1 execute bol-church --remote --file migrations/0020_announcements_weekly.sql` 單獨執行（Dev 與正式站共用同一個 D1，僅新增表，無破壞性）。
- [ ] Commit。

### Task 4: 快照帶公告

**Files:** Modify `Church/snapshot/snapshot.ts`, `snapshot.test.ts`, `rebuildTrigger.ts`, `rebuildTrigger.test.ts`

- [ ] `SiteBase` 加 `announcements: unknown[]`；server 的 `buildSiteBase` 查 `SELECT * FROM announcements WHERE show_until >= ? ORDER BY show_until`（? = 教會時區今天減 1 天），map 成 `Announcement`。
- [ ] 測試：`rebuildSnapshots` 後 `site:v2` 含 `announcements`（fake `buildSiteBase` 回傳一則）。
- [ ] `SNAPSHOT_ROUTES` 加 `'/api/admin/announcements'`；測試 `POST /api/admin/announcements` → true、`GET` → false。
- [ ] bootstrap payload 加 `announcements: snapshot.announcements ?? []`（舊快照沒有此欄位時為空）。
- [ ] Commit。

### Task 5: 公告 API（server.ts）

- `GET /api/admin/announcements`（`requireUser(..., 'contributor')`）→ 全部（含過期），`show_until DESC`。
- `POST /api/admin/announcements` body `{ title, bodyHtml, eventDate, showUntil }`：驗證 title 非空、日期格式 `YYYY-MM-DD`、`showUntil` 必填 → 201 回新公告。
- `PUT /api/admin/announcements/:id`、`DELETE /api/admin/announcements/:id`。
- 路由放在 `/api/admin/` 的其他路由附近；寫入成功由 router 出口的 `shouldRebuildSnapshot` 自動重建快照。
- [ ] Commit。

### Task 6: 週報 API（server.ts）

- `weeklySecret(env)`：讀 setting `weeklyPassword`（`{salt, hash}`），回傳 `hash`；沒有設定時回 null（週報關閉，unlock 一律失敗）。
- `hasWeeklyAccess(request, env)`：admin session（`getCurrentUser`）或 `weekly_access` cookie 通過 `verifyAccessToken(secret, cookie)`。
- `POST /api/weekly/unlock {password}`：
  - 限速：KV key `weekly-unlock:<cf-connecting-ip>:<當前分鐘>`，值為次數，`expirationTtl: 120`；≥ 5 回 429。
  - 比對 `sha256(salt:password) === hash` → `Set-Cookie: weekly_access=<token>; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`，回 `{ ok: true }`；錯誤回 401 `{ ok: false }` 並累加次數。
- `POST /api/weekly/lock`：`Set-Cookie: weekly_access=; Max-Age=0; ...`。
- `GET /api/weekly`：無權限 401；回 `{ items: [{ id, weekOf, title }] }`（`week_of DESC`）。
- `GET /api/weekly/:id`：回 `{ id, weekOf, title, bodyHtml, attachments }`。
- `GET /api/weekly/files/<encodeURIComponent(key)>`：key 必須以 `weekly/` 開頭；從 `MEDIA_BUCKET` 串流，`Content-Disposition` 依類型 inline（PDF、圖片）或 attachment（Word）。
- 所有週報回應 `Cache-Control: private, no-store`。
- 後台（`requireUser contributor`）：
  - `POST /api/admin/weekly {weekOf,title,bodyHtml,attachments}`：`weekOf` 先經 `sundayOf`；同週已存在回 409 `{ id }`。
  - `PUT /api/admin/weekly/:id`：更新；被移除的附件 key 從 R2 刪除。
  - `DELETE /api/admin/weekly/:id`：刪列與全部附件。
  - `POST /api/admin/weekly/upload`（multipart `file`）：`attachmentProblem` 檢查（type → 400「檔案類型不支援」、size → 413「檔案超過 20 MB」），存 `weekly/<uuid>-<sanitizeFileName(name)>`，回 `{ key, name, size, type }`。
  - `PUT /api/admin/weekly-password {password}`：`requireUser owner`；長度 ≥ 4；以 `hashPassword` 存 `{salt, hash}`。
- [ ] 本機 wrangler 驗證：未 unlock 時 `/api/weekly`、`/api/weekly/:id`、`/api/weekly/files/...` 皆 401；錯誤密碼 401、第 6 次 429；正確密碼後可讀。
- [ ] Commit。

### Task 7: 前端型別、API、Context、裝置快取

- `data.ts`：`Announcement`、`WeeklyAttachment {key,name,size,type}`、`WeeklyReportSummary {id,weekOf,title}`、`WeeklyReport`；`SiteBootstrap.announcements?: Announcement[]`。
- `api.ts`：`adminAnnouncements`、`createAnnouncement`、`updateAnnouncement`、`deleteAnnouncement`、`weeklyUnlock`、`weeklyLock`、`weeklyList`、`weeklyGet`、`adminCreateWeekly`、`adminUpdateWeekly`、`adminDeleteWeekly`、`adminUploadWeekly(file)`、`adminSetWeeklyPassword`；`weeklyFileUrl(key)` 回 `/api/weekly/files/${encodeURIComponent(key)}`。
- `siteCache.ts`：`CachedSite` 加 `announcements`（測試同步更新：存取後欄位存在）。
- `AdminContext`：`announcements` state（初值取快取），`applyBootstrap` 設定，存快取。
- [ ] 測試通過、tsc 通過、Commit。

### Task 8: Hero 浮動小卡

**Files:** Create `components/AnnouncementCard.tsx`; Modify `components/Hero.tsx`

- 由 `useAdmin().announcements` → `currentAnnouncements(list, todayInChurch())`。
- 關閉：localStorage `bolccop.announcements.dismissed` 存目前 id 陣列；`shouldShowCard` 決定顯示。
- 桌面（`md:`）：`absolute right-6 top-1/2 -translate-y-1/2 z-20 w-80`，半透明深色（`bg-black/55 backdrop-blur ring-1 ring-white/15`），標題列「最新公告」+ ×，最多 3 行（日期徽章 + 標題 `truncate`），點行到 `/announcements#id`，最下「查看全部 →」。
- 手機：`absolute inset-x-4 bottom-4 z-20`，一行：最近一則日期＋標題、「另有 N 則」、×；點整條到 `/announcements`。
- 日期徽章格式：`M/D 週X`（語言 EN 時 `Oct 12 Sun`）。
- Hero 內 `<AnnouncementCard />` 放在內容 div 之後。
- [ ] Playwright：桌面卡片在右側且不與 `h1` 重疊；手機橫條在下緣且不與按鈕重疊；× 後重整仍隱藏。
- [ ] Commit。

### Task 9: `/announcements` 頁面與選單

**Files:** Create `components/AnnouncementsPage.tsx`; Modify `App.tsx`（路由；`isHomePage` 排除 `/announcements`、`/weekly`）、`Header.tsx`（「聯絡我們」子選單加 `/announcements`）

- `PageHeader` + 清單（日期徽章、標題、`renderRichText(toDisplayHtml(bodyHtml))`），空時「目前沒有新公告」；`location.hash` 對應的一則 `scrollIntoView` 並加 `ring-2 ring-blue-400` 2 秒。
- [ ] Commit。

### Task 10: `/weekly` 頁面與頁尾連結

**Files:** Create `components/WeeklyReportPage.tsx`; Modify `App.tsx`、`Footer.tsx`

- 掛載時插入 `<meta name="robots" content="noindex">`，卸載時移除。
- 先呼叫 `weeklyList()`：401 → 密碼畫面；成功 → 清單＋預設開啟第一筆。
- 密碼畫面：輸入框＋「進入」；401「密碼不正確」、429「嘗試次數過多，請稍後再試」。
- 解鎖畫面：`md:grid md:grid-cols-[16rem_1fr]`；左清單「YYYY/M/D 週 · 標題」；右內容與附件（檔名、`(x.x MB)`、下載連結 `weeklyFileUrl`）；「鎖定」→ `weeklyLock()` 後回密碼畫面。
- 頁尾在社群圖示下方加小字連結「同工週報」→ `/weekly`。
- [ ] Commit。

### Task 11: 後台

**Files:** Create `components/AnnouncementManager.tsx`、`components/WeeklyReportManager.tsx`; Modify `components/AdminDashboard.tsx`（`Section` 加 `'announcements' | 'weekly'`、`sectionLabelKeys`、`primarySections` 插在 `'livestream'` 之後、`switch` 各 render 對應元件）

- `AnnouncementManager`：`adminAnnouncements()` 載入；分「顯示中 / 已過期」；新增／編輯表單（標題、活動日期、顯示到〔預設 `defaultShowUntil`〕、`RichTextEditor` 內容）；複製（清空日期與 id）；刪除（`churchConfirm`）。存檔後重新載入清單並 `refreshBootstrap()`。
- `WeeklyReportManager`：清單＋「新增本週週報」（`sundayOf(todayInChurch())`；409 時開啟既有）；表單：週次（`type="date"`，儲存時換成週日）、標題、內容、附件（上傳多檔、刪除、上移下移）；owner 顯示「週報密碼」卡（新密碼 ×2）。
- [ ] Commit。

### Task 12: 文字、驗證、部署 Dev

- `translations.ts`：`announcements.*`（nav、title、subtitle、latest、viewAll、more、empty、close）、`weekly.*`（nav、title、password、enter、wrong、tooMany、lock、empty、attachments、week）、`admin.announcements`、`admin.weekly` 等，中文一律繁體。
- [ ] `npx tsc --noEmit -p .`、`npx vitest run` 全過。
- [ ] 本機 wrangler（schema + 測試資料）+ Playwright：公告小卡（桌面/手機/關閉）、`/announcements`、`/weekly` 鎖定與解鎖、後台新增公告與週報（含附件上傳下載）。
- [ ] `wrangler d1 execute bol-church --remote --file migrations/0020_announcements_weekly.sql`
- [ ] `npm run deploy:dev`。Dev 與正式站共用 D1，而正式站快照每 4 小時由 cron 重建——在 Dev 上建立的測試公告會出現在正式站首頁。所以 Dev 上**只做唯讀檢查**（頁面載入、空狀態、週報鎖定與密碼解鎖），新增／編輯／上傳一律只在本機驗證。
- [ ] Commit。
