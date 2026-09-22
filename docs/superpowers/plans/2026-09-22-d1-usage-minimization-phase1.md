# D1 用量最小化 階段一（後端）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `bol-church` 的每日 D1 讀取從約 509 萬列降到 10 萬以下，且不動前端。

**Architecture:** 公開內容（`site_content`、`images`、統計數字、搜尋目錄）預先建成快照存進 Workers KV，讀取路徑不再查 D1；講道與靈修改用 keyset 分頁 API 供階段二使用；快照重建集中在 router 一處攔截，不散落在 20 幾個寫入點。

**Tech Stack:** Cloudflare Workers、D1、Workers KV、TypeScript、vitest、wrangler 4

**設計依據:** [`docs/superpowers/specs/2026-09-22-d1-usage-minimization-design.md`](../specs/2026-09-22-d1-usage-minimization-design.md)

---

## 與 spec 的一處刻意偏離

spec 說「任何寫入四張表的路徑都必須呼叫 `rebuildSnapshots`，實作時逐一補上」。實際盤點後有 20 幾個寫入點（`Church/server.ts` 的 1281、1311、2717、2813、3879、3928、3947、3962、4375、4392、4421、4440、4475、4511、4539、4557、4587…）。逐一補等於建立一條「以後新增寫入點要記得加」的規則，遲早會漏。

改為在 router 出口集中攔截：任何成功的非 GET 請求，只要路徑屬於內容管理路由，就在 `ctx.waitUntil` 裡觸發重建。加上 cron 一處，總共兩個地方，且新增寫入點自動涵蓋。

滿足 spec 的意圖（寫入後重建），實作更耐用。

## 路由順序風險（務必遵守）

`Church/server.ts:4544` 的 `if (url.pathname.startsWith('/api/sermons/'))` **沒有檢查 method**，會吃掉所有 `/api/sermons/*`。因此：

- `/api/sermons/catalogue` 的判斷必須寫在 4544 那一行**之前**
- `/api/sermons/:id` 的 GET 判斷也必須寫在它**之前**

同理 `/api/daily-manna/` 在 4499。

## 檔案結構

| 檔案 | 職責 |
| --- | --- |
| `Church/snapshot/cursor.ts` | 游標編解碼。純函式，不依賴 D1/KV |
| `Church/snapshot/pagination.ts` | keyset 查詢組裝與分頁切片。純函式 |
| `Church/snapshot/snapshot.ts` | 快照讀寫與重建。依賴以介面注入，可在 node 環境測試 |
| `Church/snapshot/rebuildTrigger.ts` | 判斷一個請求是否該觸發重建。純函式 |
| `Church/snapshot/*.test.ts` | 以上四者的測試 |
| `Church/server.ts` | 路由、catch-all、快照與 D1 的接線 |
| `Church/migrations/0017_keyset_and_meta_indexes.sql` | 索引 |
| `Church/wrangler.toml` | KV binding、observability |
| `Church/vitest.config.ts` | 加入 `snapshot/**/*.test.ts` |

---

### Task 1: 例外安全網（catch-all + 友善訊息 + observability）

目前 `Church/server.ts:4240` 的 `fetch` **完全沒有 try/catch**，任何例外都變成 Cloudflare 1101 整頁錯誤。這是 9/22 事故中使用者看到的畫面。先補這層，後面每一個 Task 出錯時才看得到原因。

本 Task 同時把路由主體抽成 `route()` 函式，Task 8 需要這個出口來掛重建。

**Files:**
- Modify: `Church/server.ts:4239-4241`（`worker` 宣告與 `fetch` 開頭）與 `Church/server.ts:4841` 附近（`fetch` 結尾）
- Modify: `Church/wrangler.toml`
- Create: `Church/snapshot/friendlyMessage.ts`
- Test: `Church/snapshot/friendlyMessage.test.ts`

- [ ] **Step 1: 寫失敗的測試**

Create `Church/snapshot/friendlyMessage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { friendlyMessage } from './friendlyMessage';

const QUOTA = "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue. See https://developers.cloudflare.com/d1/platform/limits/ for more details.";

describe('friendlyMessage', () => {
  it('把 D1 每日額度錯誤換成看得懂的一句話', () => {
    expect(friendlyMessage(new Error(QUOTA))).toBe('Database read limit reached. Resets daily.');
  });
  it('其餘 D1 錯誤原樣傳出，排查才有線索', () => {
    expect(friendlyMessage(new Error('D1_ERROR: no such table: sermons')))
      .toBe('D1_ERROR: no such table: sermons');
  });
  it('一般錯誤原樣傳出', () => {
    expect(friendlyMessage(new Error('Forbidden'))).toBe('Forbidden');
  });
  it('丟出非 Error 時給一個安全的預設值', () => {
    expect(friendlyMessage('boom')).toBe('Unexpected server error');
    expect(friendlyMessage(null)).toBe('Unexpected server error');
  });
});
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `cd Church && npx vitest run snapshot/friendlyMessage.test.ts`
Expected: FAIL — `Failed to resolve import "./friendlyMessage"`

- [ ] **Step 3: 讓 vitest 看得到新目錄**

Modify `Church/vitest.config.ts`，在 `include` 陣列加入一行：

```ts
      'snapshot/**/*.test.ts',
```

- [ ] **Step 4: 寫最小實作**

Create `Church/snapshot/friendlyMessage.ts`:

```ts
// D1 免費方案的每日讀取額度用盡時，原始訊息是一長串英文技術細節加上文件連結，
// 直接丟到畫面上使用者看不懂。其餘錯誤照原樣傳出，方便排查。
export function friendlyMessage(caught: unknown): string {
  const raw = caught instanceof Error ? caught.message : '';
  if (raw.includes('daily row read limit')) return 'Database read limit reached. Resets daily.';
  return raw || 'Unexpected server error';
}
```

- [ ] **Step 5: 執行測試，確認通過**

Run: `cd Church && npx vitest run snapshot/friendlyMessage.test.ts`
Expected: PASS，4 tests

- [ ] **Step 6: 把路由主體抽成 `route()`**

`const worker` 的宣告就在 `fetch` 正上方（第 4239 行），所以這是一次「把 worker 宣告往後搬」的重構，不是新增第二個 worker。

把第 4239–4241 這三行：

```ts
const worker: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
```

替換為這一行（`url` 改由參數傳入，原本那行 `const url = ...` 一併消失）：

```ts
async function route(request: Request, env: Env, url: URL): Promise<Response> {
```

接著找到 `fetch` 的結尾（原第 4841 行附近）：

```ts
    return assetResponse;
  },

  async scheduled(event, env, ctx): Promise<void> {
```

替換為：

```ts
    return assetResponse;
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    try {
      return await route(request, env, url);
    } catch (caught) {
      return json({ error: friendlyMessage(caught) }, 500);
    }
  },

  async scheduled(event, env, ctx): Promise<void> {
```

`route()` 的函式主體原本是物件方法，縮排會多兩格。tsc 不在意，要不要重新縮排隨意，但**不要在這個 Task 順手做**，否則 diff 會大到看不出真正的改動。

在 `Church/server.ts` 檔案頂端的 import 區加入：

```ts
import { friendlyMessage } from './snapshot/friendlyMessage';
```

- [ ] **Step 7: 確認型別正確**

Run: `cd Church && npx tsc --noEmit`
Expected: 沒有輸出（乾淨）

若報 `Cannot redeclare block-scoped variable 'worker'`，表示第 4239 行的舊宣告沒刪乾淨。

- [ ] **Step 8: 開啟 observability**

Modify `Church/wrangler.toml`，在 `compatibility_date` 那一行之後加入：

```toml
# 開啟 Workers Logs，例外發生時才有堆疊可查。
[observability]
enabled = true
```

- [ ] **Step 9: Commit**

```bash
git add Church/server.ts Church/wrangler.toml Church/vitest.config.ts Church/snapshot/friendlyMessage.ts Church/snapshot/friendlyMessage.test.ts
git commit -m "fix(church): 補上 fetch catch-all 與 D1 額度友善訊息，開啟 observability"
```

---

### Task 2: KV namespace 與 binding

**Files:**
- Modify: `Church/wrangler.toml`（本機，gitignore 不進版控）
- Modify: `Church/wrangler.example.toml`（追蹤中的範本）
- Modify: `Church/server.ts`（`Env` 型別，第 30 行附近）

- [ ] **Step 1: 建立 KV namespace（已知卡住，見下）**

```bash
cd Church
npx wrangler kv namespace create SNAPSHOT
npx wrangler kv namespace create SNAPSHOT --preview
```

Expected: 各印出一段可貼進 `wrangler.toml` 的設定，含 `id` 與 `preview_id`。

**⚠️ 目前這一步缺憑證，已查證過：**

| 憑證 | 狀況 |
| --- | --- |
| `Finance/.dev.vars` 的 token | 有 D1 與 analytics 權限，**沒有 KV 權限**（回 `10000 Authentication error`） |
| `Church/.dev.vars` | 根本沒有 `CLOUDFLARE_API_TOKEN` |
| wrangler OAuth session | 有 `workers_kv (write)`，但綁在**個人帳號** `be3d95c2f0211bfc68b26e41ef1a3366`，不是 worker 部署的教會帳號 `953bb353d5d63c4249b8fec0b83d805d` |

用 OAuth 建會建到錯的帳號，那個 namespace worker 綁不到。

解法擇一（需要人操作）：
1. 在 Cloudflare 後台的教會帳號底下手動建立名為 `SNAPSHOT` 的 KV namespace，把 id 抄回來
2. 產一個對教會帳號有 `Workers KV Storage:Edit` 權限的 API token，設成 `CLOUDFLARE_API_TOKEN` 後重跑上面的指令

**在拿到真實 id 之前，本 Task 其餘步驟照常進行，`wrangler.toml` 先填佔位字串。** `wrangler dev --local` 的 KV 是模擬的，不會去驗證 id 是否真實存在，所以 Task 3–10 的本機驗證完全不受影響。真實 id 在 Task 11 部署前補上即可。

- [ ] **Step 2: 寫進 wrangler.toml 與範本**

**注意：`Church/wrangler.toml` 被 gitignore（見 `Church/.gitignore:19`），它含有真實的 account_id / zone_id，永遠不要 `git add -f` 它。** repo 追蹤的是 `Church/wrangler.example.toml` 這個佔位範本，設定變更要同步過去才會留在版本控制裡。

先改真實檔案 `Church/wrangler.toml`，在 `[[r2_buckets]]` 區塊之後加入。若 Step 1 尚未拿到真實 id，就照下面原樣填佔位字串，並在 Task 11 部署前換掉：

```toml
[[kv_namespaces]]
binding = "SNAPSHOT"
id = "PLACEHOLDER_REPLACE_BEFORE_DEPLOY"
preview_id = "PLACEHOLDER_REPLACE_BEFORE_DEPLOY"
```

再改範本 `Church/wrangler.example.toml`，同一個位置加入佔位版本：

```toml
[[kv_namespaces]]
binding = "SNAPSHOT"
id = "your-snapshot-kv-namespace-id"
preview_id = "your-snapshot-kv-preview-id"
```

範本裡其他既有的落差（缺第三條 cron `"0 * * * *"`、缺部分 vars）是先前就存在的，**不要順手修**，不屬於這個 Task。

- [ ] **Step 3: 加進 Env 型別**

Modify `Church/server.ts`，在 `type Env = {` 區塊內 `PHOTOS_DB: D1Database;` 之後加入：

```ts
  /** 公開內容快照；讀取路徑不查 D1 全靠它 */
  SNAPSHOT: KVNamespace;
```

- [ ] **Step 4: 確認型別正確**

Run: `cd Church && npx tsc --noEmit`
Expected: 沒有輸出

- [ ] **Step 5: Commit**

```bash
git add Church/wrangler.example.toml Church/server.ts
git commit -m "feat(church): 新增 SNAPSHOT KV binding"
```

`Church/wrangler.toml` 不在 `git add` 清單內，因為它被 gitignore。改動只存在於本機，這是刻意的。

---

### Task 3: 索引 migration

**Files:**
- Create: `Church/migrations/0017_keyset_and_meta_indexes.sql`

- [ ] **Step 1: 寫 migration**

Create `Church/migrations/0017_keyset_and_meta_indexes.sql`:

```sql
-- keyset 分頁：date 會重複（同一天多堂），游標必須是 (date, id)，索引也要跟著複合。
-- 既有的 idx_sermons_date 只有 date，WHERE type = ? 仍會多掃。
CREATE INDEX IF NOT EXISTS idx_sermons_type_date_id ON sermons(type, date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_daily_manna_date_id ON daily_manna(date DESC, id DESC);

-- 每小時的 refreshOldestMetadata 用 ORDER BY meta_refreshed_at ASC LIMIT 100，
-- 目前沒有索引，等於每小時把兩張表全掃一遍（4,400 列）。
CREATE INDEX IF NOT EXISTS idx_sermons_meta_refreshed ON sermons(meta_refreshed_at);
CREATE INDEX IF NOT EXISTS idx_daily_manna_meta_refreshed ON daily_manna(meta_refreshed_at);
```

- [ ] **Step 2: 套用到本機**

Run: `cd Church && npx wrangler d1 migrations apply bol-church --local`
Expected: `🌀 Executing on local database` 並列出 `0017_keyset_and_meta_indexes.sql` 成功

- [ ] **Step 3: Commit**

```bash
git add Church/migrations/0017_keyset_and_meta_indexes.sql
git commit -m "perf(church): 加上 keyset 分頁與 meta_refreshed_at 索引"
```

遠端套用留到 Task 11，與部署一起做。

---

### Task 4: 游標編解碼

**Files:**
- Create: `Church/snapshot/cursor.ts`
- Test: `Church/snapshot/cursor.test.ts`

- [ ] **Step 1: 寫失敗的測試**

Create `Church/snapshot/cursor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from './cursor';

describe('cursor', () => {
  it('往返後值不變', () => {
    const cursor = { date: '2026-09-20', id: 'abc123' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('id 含底線也能正確還原（只切第一個底線）', () => {
    const cursor = { date: '2026-09-20', id: 'a_b_c' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('壞格式回傳 null 而不是丟例外', () => {
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('沒有底線')).toBeNull();
    expect(decodeCursor('_只有id')).toBeNull();
    expect(decodeCursor('只有date_')).toBeNull();
  });
});
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `cd Church && npx vitest run snapshot/cursor.test.ts`
Expected: FAIL — `Failed to resolve import "./cursor"`

- [ ] **Step 3: 寫最小實作**

Create `Church/snapshot/cursor.ts`:

```ts
export type Cursor = { date: string; id: string };

// date 是 YYYY-MM-DD，不含底線；id 可能含底線。
// 所以以「第一個底線」為界：左邊是 date，右邊全部是 id。
export function encodeCursor(entry: Cursor): string {
  return `${entry.date}_${entry.id}`;
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  const separator = raw.indexOf('_');
  if (separator <= 0 || separator === raw.length - 1) return null;
  return { date: raw.slice(0, separator), id: raw.slice(separator + 1) };
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `cd Church && npx vitest run snapshot/cursor.test.ts`
Expected: PASS，3 tests

- [ ] **Step 5: Commit**

```bash
git add Church/snapshot/cursor.ts Church/snapshot/cursor.test.ts
git commit -m "feat(church): 新增 keyset 游標編解碼"
```

---

### Task 5: keyset 查詢組裝與分頁切片

**Files:**
- Create: `Church/snapshot/pagination.ts`
- Test: `Church/snapshot/pagination.test.ts`

- [ ] **Step 1: 寫失敗的測試**

Create `Church/snapshot/pagination.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildKeysetQuery, slicePage, normalizeLimit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './pagination';
import { decodeCursor } from './cursor';

describe('normalizeLimit', () => {
  it('沒給或給爛值時用預設', () => {
    expect(normalizeLimit(null)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizeLimit('abc')).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizeLimit('0')).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizeLimit('-5')).toBe(DEFAULT_PAGE_SIZE);
  });
  it('夾在上限內，避免有人要一次拿 10000 筆', () => {
    expect(normalizeLimit('10')).toBe(10);
    expect(normalizeLimit('9999')).toBe(MAX_PAGE_SIZE);
  });
});

describe('buildKeysetQuery', () => {
  it('sermon 查 sermons 並帶 type 條件', () => {
    const q = buildKeysetQuery('sermon', null, 20);
    expect(q.sql).toContain('FROM sermons');
    expect(q.sql).toContain('type = ?');
    expect(q.binds).toEqual(['sermon', 21]); // limit + 1，多拿一筆判斷還有沒有下一頁
  });

  it('daily-manna 查 daily_manna 且沒有 type 條件', () => {
    const q = buildKeysetQuery('daily-manna', null, 20);
    expect(q.sql).toContain('FROM daily_manna');
    expect(q.sql).not.toContain('type = ?');
    expect(q.binds).toEqual([21]);
  });

  it('有游標時用 (date, id) 複合比較，不是只比 date', () => {
    const q = buildKeysetQuery('sermon', { date: '2026-09-20', id: 'x1' }, 20);
    expect(q.sql).toContain('date < ? OR (date = ? AND id < ?)');
    expect(q.binds).toEqual(['sermon', '2026-09-20', '2026-09-20', 'x1', 21]);
  });

  it('永遠以 date DESC, id DESC 排序，否則游標語意不成立', () => {
    expect(buildKeysetQuery('sermon', null, 20).sql).toContain('ORDER BY date DESC, id DESC');
  });
});

describe('slicePage', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ date: '2026-09-20', id: `id${i}` }));

  it('拿到的筆數沒超過 limit 時代表是最後一頁', () => {
    const page = slicePage(rows(3), 20);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('多拿到的那一筆要丟掉，並用最後一筆產生游標', () => {
    const page = slicePage(rows(21), 20);
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toBe('2026-09-20_id19');
  });
});

describe('翻頁完整性（同一天多筆是最容易出錯的情況）', () => {
  // 全部同一天，只靠 date 當游標一定會漏資料或無限迴圈。
  const all = Array.from({ length: 25 }, (_, i) => ({
    date: '2026-09-20',
    id: `id${String(24 - i).padStart(2, '0')}`, // 已依 date DESC, id DESC 排好
  }));

  // 模擬 SQL 的 WHERE 語意，驗證游標協定本身是對的
  const query = (cursorRaw: string | null, limit: number) => {
    const cursor = decodeCursor(cursorRaw);
    const filtered = cursor
      ? all.filter(r => r.date < cursor.date || (r.date === cursor.date && r.id < cursor.id))
      : all;
    return slicePage(filtered.slice(0, limit + 1), limit);
  };

  it('翻完所有頁，不重複也不遺漏', () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page: ReturnType<typeof query> = query(cursor, 10);
      seen.push(...page.items.map(r => r.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen).toEqual(all.map(r => r.id));
  });
});
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `cd Church && npx vitest run snapshot/pagination.test.ts`
Expected: FAIL — `Failed to resolve import "./pagination"`

- [ ] **Step 3: 寫最小實作**

Create `Church/snapshot/pagination.ts`:

```ts
import { encodeCursor, type Cursor } from './cursor';

export type SermonKind = 'sermon' | 'daily-manna';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export function normalizeLimit(raw: string | null | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(value), MAX_PAGE_SIZE);
}

// 多拿一筆，就能判斷「還有沒有下一頁」而不必再發一次 COUNT。
export function buildKeysetQuery(
  kind: SermonKind,
  cursor: Cursor | null,
  limit: number,
): { sql: string; binds: unknown[] } {
  const table = kind === 'sermon' ? 'sermons' : 'daily_manna';
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (kind === 'sermon') {
    conditions.push('type = ?');
    binds.push('sermon');
  }
  if (cursor) {
    conditions.push('(date < ? OR (date = ? AND id < ?))');
    binds.push(cursor.date, cursor.date, cursor.id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} ` : '';
  binds.push(limit + 1);
  return {
    sql: `SELECT * FROM ${table} ${where}ORDER BY date DESC, id DESC LIMIT ?`,
    binds,
  };
}

export function slicePage<T extends Cursor>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  return { items, nextCursor: encodeCursor(items[items.length - 1]) };
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `cd Church && npx vitest run snapshot/pagination.test.ts`
Expected: PASS，9 tests

- [ ] **Step 5: Commit**

```bash
git add Church/snapshot/pagination.ts Church/snapshot/pagination.test.ts
git commit -m "feat(church): 新增 keyset 分頁查詢組裝與切片"
```

---

### Task 6: 快照模組

**Files:**
- Create: `Church/snapshot/snapshot.ts`
- Test: `Church/snapshot/snapshot.test.ts`

- [ ] **Step 1: 寫失敗的測試**

Create `Church/snapshot/snapshot.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { readSiteSnapshot, rebuildSnapshots, type SiteSnapshot, type SnapshotDeps } from './snapshot';

const sample: SiteSnapshot = {
  content: { hero: 'hi' },
  images: { 'hero.image1': '/a.jpg' },
  stats: { sermonCount: 1202, mannaCount: 3198 },
  builtAt: '2026-09-22T18:00:00.000Z',
};

function deps(overrides: Partial<SnapshotDeps> = {}): SnapshotDeps {
  return {
    kv: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) },
    buildSite: vi.fn().mockResolvedValue(sample),
    buildCatalogue: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('readSiteSnapshot', () => {
  it('KV 命中就直接回傳，完全不碰 D1', async () => {
    const d = deps({ kv: { get: vi.fn().mockResolvedValue(JSON.stringify(sample)), put: vi.fn() } });
    expect(await readSiteSnapshot(d)).toEqual(sample);
    expect(d.buildSite).not.toHaveBeenCalled();
  });

  it('KV miss 時重建並寫回', async () => {
    const d = deps();
    expect(await readSiteSnapshot(d)).toEqual(sample);
    expect(d.buildSite).toHaveBeenCalledOnce();
    expect(d.kv.put).toHaveBeenCalledWith('site:v1', JSON.stringify(sample));
  });

  it('KV 讀取丟例外時仍然回傳可用資料（KV 故障不能拖垮整站）', async () => {
    const d = deps({ kv: { get: vi.fn().mockRejectedValue(new Error('KV down')), put: vi.fn() } });
    expect(await readSiteSnapshot(d)).toEqual(sample);
  });

  it('KV 存的是壞 JSON 時當成 miss 處理', async () => {
    const d = deps({ kv: { get: vi.fn().mockResolvedValue('{壞掉的'), put: vi.fn() } });
    expect(await readSiteSnapshot(d)).toEqual(sample);
    expect(d.buildSite).toHaveBeenCalledOnce();
  });

  it('寫回 KV 失敗不影響這次的回應', async () => {
    const d = deps({ kv: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockRejectedValue(new Error('quota')) } });
    await expect(readSiteSnapshot(d)).resolves.toEqual(sample);
  });
});

describe('rebuildSnapshots', () => {
  it('兩份 key 都會重建', async () => {
    const d = deps();
    await rebuildSnapshots(d);
    expect(d.kv.put).toHaveBeenCalledWith('site:v1', expect.any(String));
    expect(d.kv.put).toHaveBeenCalledWith('catalogue:v1', expect.any(String));
  });
});
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `cd Church && npx vitest run snapshot/snapshot.test.ts`
Expected: FAIL — `Failed to resolve import "./snapshot"`

- [ ] **Step 3: 寫最小實作**

Create `Church/snapshot/snapshot.ts`:

```ts
export const SITE_KEY = 'site:v1';
export const CATALOGUE_KEY = 'catalogue:v1';

export type SiteSnapshot = {
  content: unknown;
  images: Record<string, string>;
  stats: { sermonCount: number; mannaCount: number };
  builtAt: string;
};

export type CatalogueEntry = {
  id: string;
  type: 'sermon' | 'daily-manna';
  titleEn: string;
  titleZh: string;
  date: string;
  youtubeId: string | null;
};

// 以介面注入，讓這個模組能在純 node 的 vitest 環境下測試，不需要 D1 或 KV。
export type SnapshotDeps = {
  kv: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
  buildSite: () => Promise<SiteSnapshot>;
  buildCatalogue: () => Promise<CatalogueEntry[]>;
};

async function readOrBuild<T>(
  deps: SnapshotDeps,
  key: string,
  build: () => Promise<T>,
): Promise<T> {
  try {
    const raw = await deps.kv.get(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // KV 故障或值壞掉：退回重建，成本回到改造前而已，絕不讓整站掛掉。
  }
  const built = await build();
  try {
    await deps.kv.put(key, JSON.stringify(built));
  } catch {
    // 寫不回去不影響這次回應，下次 miss 會再試。
  }
  return built;
}

export async function readSiteSnapshot(deps: SnapshotDeps): Promise<SiteSnapshot> {
  return readOrBuild(deps, SITE_KEY, deps.buildSite);
}

export async function readCatalogue(deps: SnapshotDeps): Promise<CatalogueEntry[]> {
  return readOrBuild(deps, CATALOGUE_KEY, deps.buildCatalogue);
}

// 併發呼叫是冪等的，重複寫入無害，所以不加鎖。
export async function rebuildSnapshots(deps: SnapshotDeps): Promise<void> {
  const [site, catalogue] = await Promise.all([deps.buildSite(), deps.buildCatalogue()]);
  await Promise.all([
    deps.kv.put(SITE_KEY, JSON.stringify(site)),
    deps.kv.put(CATALOGUE_KEY, JSON.stringify(catalogue)),
  ]);
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `cd Church && npx vitest run snapshot/snapshot.test.ts`
Expected: PASS，6 tests

- [ ] **Step 5: Commit**

```bash
git add Church/snapshot/snapshot.ts Church/snapshot/snapshot.test.ts
git commit -m "feat(church): 新增內容快照模組"
```

---

### Task 7: 重建觸發判斷

**Files:**
- Create: `Church/snapshot/rebuildTrigger.ts`
- Test: `Church/snapshot/rebuildTrigger.test.ts`

- [ ] **Step 1: 寫失敗的測試**

Create `Church/snapshot/rebuildTrigger.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldRebuildSnapshot } from './rebuildTrigger';

describe('shouldRebuildSnapshot', () => {
  it('內容管理的寫入要重建', () => {
    expect(shouldRebuildSnapshot('PUT', '/api/content', 200)).toBe(true);
    expect(shouldRebuildSnapshot('PUT', '/api/images', 200)).toBe(true);
    expect(shouldRebuildSnapshot('POST', '/api/images/upload', 200)).toBe(true);
    expect(shouldRebuildSnapshot('POST', '/api/sermons', 201)).toBe(true);
    expect(shouldRebuildSnapshot('PUT', '/api/sermons/abc', 200)).toBe(true);
    expect(shouldRebuildSnapshot('DELETE', '/api/daily-manna/abc', 200)).toBe(true);
    expect(shouldRebuildSnapshot('POST', '/api/admin/sermons/sync-youtube', 200)).toBe(true);
    expect(shouldRebuildSnapshot('POST', '/api/admin/daily-manna/abc/move', 200)).toBe(true);
    expect(shouldRebuildSnapshot('PATCH', '/api/admin/daily-manna/abc/visibility', 200)).toBe(true);
  });

  it('讀取不重建', () => {
    expect(shouldRebuildSnapshot('GET', '/api/sermons', 200)).toBe(false);
    expect(shouldRebuildSnapshot('GET', '/api/content', 200)).toBe(false);
    expect(shouldRebuildSnapshot('HEAD', '/api/sermons', 200)).toBe(false);
    expect(shouldRebuildSnapshot('OPTIONS', '/api/sermons', 204)).toBe(false);
  });

  it('失敗的寫入不重建，否則等於白花一次成本', () => {
    expect(shouldRebuildSnapshot('PUT', '/api/content', 403)).toBe(false);
    expect(shouldRebuildSnapshot('POST', '/api/sermons', 500)).toBe(false);
  });

  it('與快照無關的寫入不重建', () => {
    expect(shouldRebuildSnapshot('POST', '/api/prayer-requests', 200)).toBe(false);
    expect(shouldRebuildSnapshot('POST', '/api/live/chat', 200)).toBe(false);
    expect(shouldRebuildSnapshot('POST', '/api/auth/login', 200)).toBe(false);
  });

  it('不會被前綴相近的路徑誤觸', () => {
    expect(shouldRebuildSnapshot('POST', '/api/contentious', 200)).toBe(false);
  });
});
```

- [ ] **Step 2: 執行測試，確認它失敗**

Run: `cd Church && npx vitest run snapshot/rebuildTrigger.test.ts`
Expected: FAIL — `Failed to resolve import "./rebuildTrigger"`

- [ ] **Step 3: 寫最小實作**

Create `Church/snapshot/rebuildTrigger.ts`:

```ts
// 集中在 router 出口判斷，而不是散在 20 幾個寫入點各加一行呼叫。
// 這樣日後新增寫入路由會自動涵蓋，不必記得補。
const SNAPSHOT_ROUTES = [
  '/api/content',
  '/api/images',
  '/api/sermons',
  '/api/daily-manna',
  '/api/admin/sermons',
  '/api/admin/daily-manna',
];

export function shouldRebuildSnapshot(method: string, pathname: string, status: number): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  if (status >= 400) return false;
  return SNAPSHOT_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `cd Church && npx vitest run snapshot/rebuildTrigger.test.ts`
Expected: PASS，5 tests

- [ ] **Step 5: Commit**

```bash
git add Church/snapshot/rebuildTrigger.ts Church/snapshot/rebuildTrigger.test.ts
git commit -m "feat(church): 新增快照重建觸發判斷"
```

---

### Task 7 執行時發現的兩件事（已處理）

實作 Task 7 時做了完整的路由盤點，發現原本的 `SNAPSHOT_ROUTES` 有一個真實缺口：

1. **缺口（已修）**：`POST /api/admin/daily-manna/:id/move`（server.ts:4801）與 `PATCH /api/admin/daily-manna/:id/visibility`（4805）都會寫 `sermons` / `daily_manna`，但 `/api/admin/daily-manna` 不在清單裡。`handleMoveDailyManna` 會把一筆資料在兩張表之間搬移，同時改變搜尋目錄與 `stats` 計數 —— 漏掉的話快照會一直舊到四小時後的 cron 才修正，正是「我明明存了卻沒變」。已加入該前綴。

2. **浪費（不修）**：`POST /api/admin/sermons/:id/move` 帶 `live-override` 時只寫 `live_stream_config`，不碰那四張表，卻會觸發一次重建。一次浪費約 4,900 列、頻率極低；要避免就得讓這個純函式去讀請求內容、跟 handler 內部邏輯耦合，代價比浪費本身更高。維持現狀。

---

### Task 8: 接線 — 快照與 D1 的橋接、router 觸發、cron 觸發

**Files:**
- Modify: `Church/server.ts`

- [ ] **Step 1: 加入 import 與橋接函式**

在 `Church/server.ts` 頂端 import 區加入：

```ts
import {
  readSiteSnapshot,
  readCatalogue,
  rebuildSnapshots,
  type SiteSnapshot,
  type CatalogueEntry,
  type SnapshotDeps,
} from './snapshot/snapshot';
import { shouldRebuildSnapshot } from './snapshot/rebuildTrigger';
```

在 `handleBootstrap` 函式（第 1336 行附近）**之前**加入橋接：

```ts
// 把 Env 轉成 snapshot 模組要的介面。昂貴查詢只集中在這裡。
function snapshotDeps(env: Env): SnapshotDeps {
  return {
    kv: {
      get: key => env.SNAPSHOT.get(key),
      put: (key, value) => env.SNAPSHOT.put(key, value),
    },
    buildSite: async () => {
      const [content, images, sermonCount, mannaCount] = await Promise.all([
        getSiteContent(env),
        getSetting<Record<string, string>>(env, 'images', {}),
        env.DB.prepare('SELECT COUNT(*) AS count FROM sermons').first<{ count: number }>(),
        env.DB.prepare('SELECT COUNT(*) AS count FROM daily_manna').first<{ count: number }>(),
      ]);
      return {
        content,
        images,
        stats: {
          sermonCount: Number(sermonCount?.count || 0),
          mannaCount: Number(mannaCount?.count || 0),
        },
        builtAt: new Date().toISOString(),
      } satisfies SiteSnapshot;
    },
    buildCatalogue: async () => {
      const [sermons, manna] = await Promise.all([
        env.DB.prepare(
          "SELECT id, title_en, title_zh, date, youtube_id FROM sermons WHERE type = 'sermon' ORDER BY date DESC, id DESC",
        ).all<{ id: string; title_en: string; title_zh: string; date: string; youtube_id: string | null }>(),
        env.DB.prepare(
          'SELECT id, title_en, title_zh, date, youtube_id FROM daily_manna ORDER BY date DESC, id DESC',
        ).all<{ id: string; title_en: string; title_zh: string; date: string; youtube_id: string | null }>(),
      ]);
      const toEntry = (type: CatalogueEntry['type']) => (row: {
        id: string; title_en: string; title_zh: string; date: string; youtube_id: string | null;
      }): CatalogueEntry => ({
        id: row.id,
        type,
        titleEn: row.title_en,
        titleZh: row.title_zh,
        date: row.date,
        youtubeId: row.youtube_id,
      });
      return [
        ...(sermons.results ?? []).map(toEntry('sermon')),
        ...(manna.results ?? []).map(toEntry('daily-manna')),
      ];
    },
  };
}
```

- [ ] **Step 2: 在 router 出口掛上重建**

把 Task 1 建立的 `fetch` 改成：

```ts
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    try {
      const response = await route(request, env, url);
      if (shouldRebuildSnapshot(request.method, url.pathname, response.status)) {
        // 重建失敗不能影響這次寫入的回應 —— 資料已經進 D1 了，
        // 下一次讀取 miss 時會自行重建。
        ctx.waitUntil(rebuildSnapshots(snapshotDeps(env)).catch(() => undefined));
      }
      return response;
    } catch (caught) {
      return json({ error: friendlyMessage(caught) }, 500);
    }
  },
```

- [ ] **Step 3: 在 cron 掛上重建**

在 `scheduled`（第 4845 行附近）的 `'0 */4 * * *'` 分支裡，`sendUploadsSyncNotification` 之後加入一行：

```ts
            await rebuildSnapshots(snapshotDeps(env)).catch(() => undefined);
```

`'0 * * * *'`（每小時的 `refreshOldestMetadata`）**刻意不加**。它只改 `duration_seconds` 與 `view_count`，不值得每小時付一次重建成本，交給四小時這班順便帶走。

- [ ] **Step 4: 確認型別與測試**

Run: `cd Church && npx tsc --noEmit && npx vitest run`
Expected: tsc 無輸出；vitest 全部通過

- [ ] **Step 5: Commit**

```bash
git add Church/server.ts
git commit -m "feat(church): 接上快照建置與重建觸發"
```

---

### Task 9: `/api/bootstrap` 改讀快照

這是省下最多列數的一步：每次請求從 4,946 列降到 0 列。

**Files:**
- Modify: `Church/server.ts:1336`（`handleBootstrap`）

- [ ] **Step 1: 改寫 handleBootstrap**

把 `handleBootstrap` 整個函式（第 1336 行起，到 `return json(payload);` 與其後的 `}` 為止）替換為：

```ts
async function handleBootstrap(request: Request, env: Env): Promise<Response> {
  // ensureSeedData 已移出熱路徑：它是初始化邏輯，卻讓每次頁面載入多付
  // COUNT(*) FROM site_content(546) + COUNT(*) FROM sermons(1202) = 1,748 列，
  // 還會對 sermons 發一次注定失敗的 ALTER TABLE。改由 cron 與 migration 負責。
  const [snapshot, currentUser] = await Promise.all([
    readSiteSnapshot(snapshotDeps(env)),
    getCurrentUser(request, env),
  ]);

  const [sermonsResult, dailyMannaResult] = await Promise.all([
    env.DB.prepare("SELECT * FROM sermons WHERE type = 'sermon' ORDER BY date DESC").all<SermonRow>(),
    env.DB.prepare('SELECT * FROM daily_manna ORDER BY date DESC').all<DailyMannaRow>(),
  ]);

  const payload: Record<string, unknown> = {
    content: snapshot.content,
    images: snapshot.images,
    stats: snapshot.stats,
    sermons: (sermonsResult.results ?? []).map(mapSermon),
    dailyManna: (dailyMannaResult.results ?? []).map(mapDailyManna),
    messages: [],
    prayerRequests: [],
    donations: [],
    currentUser,
  };

  if (currentUser) {
    const [messagesResult, prayerResult, donationsResult, usersResult] = await Promise.all([
      env.DB.prepare('SELECT * FROM messages ORDER BY date DESC').all<MessageRow>(),
      env.DB.prepare('SELECT * FROM prayer_requests ORDER BY date DESC').all<PrayerRequestRow>(),
      env.DB.prepare('SELECT * FROM donations ORDER BY date DESC').all<DonationRow>(),
      currentUser.role === 'owner'
        ? env.DB.prepare('SELECT * FROM users ORDER BY created_at ASC').all<UserRow>()
        : Promise.resolve({ results: [] as UserRow[] }),
    ]);
    payload.messages = (messagesResult.results ?? []).map(mapMessage);
    payload.prayerRequests = (prayerResult.results ?? []).map(mapPrayerRequest);
    payload.donations = (donationsResult.results ?? []).map(mapDonation);
    payload.users = (usersResult.results ?? []).map(mapUser);
  }

  return json(payload);
}
```

**注意：`sermons` 與 `dailyManna` 仍照舊回傳。** 階段一不動前端，所以這兩個欄位必須保留；它們會在階段二前端切換完成後才移除。本階段省下的是 `content`、`images` 與 `ensureSeedData` 那 2,294 列。

- [ ] **Step 2: 補上 ensureSeedData 的新呼叫點**

`ensureSeedData` 現在沒有任何呼叫者了。在 `scheduled` 的 `'0 */4 * * *'` 分支最前面加入：

```ts
      ctx.waitUntil(ensureSeedData(env).catch(() => undefined));
```

- [ ] **Step 3: 確認 ensureCategoryColumn 的欄位已有 migration 保證**

Run: `cd Church && grep -rn "ADD COLUMN category" migrations/`
Expected: 命中 `0009_add_sermon_category.sql`

若沒有命中，**停下來回報**，不要移除 `ensureCategoryColumn`。

- [ ] **Step 4: 確認型別與測試**

Run: `cd Church && npx tsc --noEmit && npx vitest run`
Expected: tsc 無輸出；vitest 全部通過

- [ ] **Step 5: 本機驗證**

```bash
cd Church
npx wrangler dev --port 8797 --local
```

另開一個視窗：

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:8797/api/bootstrap
```

Expected: `200 application/json; charset=utf-8`

- [ ] **Step 6: Commit**

```bash
git add Church/server.ts
git commit -m "perf(church): bootstrap 的 content/images 改讀快照，ensureSeedData 移出熱路徑"
```

---

### Task 10: 分頁、目錄、詳情三個端點

**Files:**
- Modify: `Church/server.ts`

- [ ] **Step 1: 加入 import**

在 `Church/server.ts` 頂端 import 區加入：

```ts
import { decodeCursor } from './snapshot/cursor';
import { buildKeysetQuery, normalizeLimit, slicePage, type SermonKind } from './snapshot/pagination';
```

- [ ] **Step 2: 寫三個 handler**

在 `handleBootstrap` 之後加入：

```ts
function parseKind(raw: string | null): SermonKind {
  return raw === 'daily-manna' ? 'daily-manna' : 'sermon';
}

async function handleSermonPage(env: Env, url: URL): Promise<Response> {
  const kind = parseKind(url.searchParams.get('type'));
  // 游標壞掉就當作沒有游標回第一頁，不要回 500。
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const limit = normalizeLimit(url.searchParams.get('limit'));
  const { sql, binds } = buildKeysetQuery(kind, cursor, limit);

  const result = await env.DB.prepare(sql).bind(...binds).all<SermonRow & DailyMannaRow>();
  const page = slicePage(result.results ?? [], limit);
  const map = kind === 'sermon' ? mapSermon : mapDailyManna;

  return json({ items: page.items.map(row => map(row as never)), nextCursor: page.nextCursor });
}

async function handleSermonCatalogue(env: Env): Promise<Response> {
  const entries = await readCatalogue(snapshotDeps(env));
  return new Response(JSON.stringify(entries), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 瀏覽器端快取 5 分鐘：搜尋目錄不常變，也不必每次開搜尋都重新下載。
      'Cache-Control': 'public, max-age=300',
    },
  });
}

async function handleSermonById(env: Env, url: URL, id: string): Promise<Response> {
  const kind = parseKind(url.searchParams.get('type'));
  const table = kind === 'sermon' ? 'sermons' : 'daily_manna';
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!row) return notFound('Sermon not found');
  const map = kind === 'sermon' ? mapSermon : mapDailyManna;
  return json(map(row as never));
}
```

- [ ] **Step 3: 註冊路由（順序至關重要）**

在 `route()` 中找到這一行（原第 4430 行）：

```ts
    if (url.pathname === '/api/sermons' && request.method === 'POST') {
```

在它的**正上方**插入：

```ts
    // 以下三條必須排在 `/api/sermons/` 的 startsWith 判斷之前 ——
    // 那一條沒有檢查 method，會把 GET /api/sermons/catalogue 一起吃掉。
    if (url.pathname === '/api/sermons/catalogue' && request.method === 'GET') {
      return handleSermonCatalogue(env);
    }

    if (url.pathname === '/api/sermons' && request.method === 'GET') {
      return handleSermonPage(env, url);
    }

    if (url.pathname.startsWith('/api/sermons/') && request.method === 'GET') {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      if (!id) return badRequest('Missing sermon id');
      return handleSermonById(env, url, id);
    }
```

- [ ] **Step 4: 確認型別與測試**

Run: `cd Church && npx tsc --noEmit && npx vitest run`
Expected: tsc 無輸出；vitest 全部通過

- [ ] **Step 5: 本機驗證三個端點**

```bash
cd Church
npx wrangler d1 migrations apply bol-church --local
npx wrangler dev --port 8797 --local
```

另開一個視窗：

```bash
curl -s "http://127.0.0.1:8797/api/sermons?type=sermon&limit=3"
curl -s "http://127.0.0.1:8797/api/sermons/catalogue" | head -c 200
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8797/api/sermons/does-not-exist"
```

Expected:
- 第一條回 `{"items":[...],"nextCursor":"..."}`，`items` 至多 3 筆
- 第二條回一個 JSON 陣列
- 第三條回 `404`

**本機資料庫若是空的**，`items` 會是 `[]`、`nextCursor` 為 `null`，這也是正確結果；真實資料的驗證留到 Task 11。

- [ ] **Step 6: Commit**

```bash
git add Church/server.ts
git commit -m "feat(church): 新增講道分頁、搜尋目錄與單筆詳情端點"
```

---

### Task 11: 部署到 dev 並驗證

**Files:** 無（只有部署與驗證）

- [ ] **Step 0: 補上真實的 KV namespace id**

Task 2 若是用佔位字串帶過的，現在必須換成真實 id，否則部署會失敗。

```bash
cd Church && grep -n "PLACEHOLDER_REPLACE_BEFORE_DEPLOY" wrangler.toml
```

若有命中，先依 Task 2 Step 1 的兩個解法之一取得真實 id 再繼續。**不要用 wrangler 的 OAuth session 建**，它在個人帳號底下。

- [ ] **Step 1: 全套測試與建置**

```bash
cd Church
npx vitest run
npm run build
```

Expected: 測試全過；建置成功

- [ ] **Step 2: 套用遠端 migration**

```bash
cd Church
export CLOUDFLARE_ACCOUNT_ID=953bb353d5d63c4249b8fec0b83d805d
export CLOUDFLARE_API_TOKEN=<有 D1 與 KV 權限的 token>
npx wrangler d1 migrations apply bol-church --remote
```

Expected: `0017_keyset_and_meta_indexes.sql` 套用成功

若回 `code: 7500 exceeded D1's free tier daily row read limit`，表示當日額度仍未重置。等 UTC 00:00 之後再執行，或先升級方案。

- [ ] **Step 3: 部署到 dev**

```bash
cd Church
npx wrangler deploy --name bol-church-dev
```

Expected: 印出 `Deployed bol-church-dev` 與一個 `workers.dev` 網址

- [ ] **Step 4: 驗證端點**

把 `<DEV_URL>` 換成上一步印出的網址：

```bash
for p in "/api/bootstrap" "/api/sermons?type=sermon&limit=3" "/api/sermons?type=daily-manna&limit=3" "/api/sermons/catalogue"; do
  printf "%-40s " "$p"
  curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "<DEV_URL>$p"
done
```

Expected: 四條全部 `200 application/json; charset=utf-8`

- [ ] **Step 5: 驗證翻頁不重複也不遺漏（真實資料）**

```bash
curl -s "<DEV_URL>/api/sermons?type=sermon&limit=5" > /tmp/p1.json
CURSOR=$(python -c "import json;print(json.load(open('/tmp/p1.json'))['nextCursor'])")
curl -s "<DEV_URL>/api/sermons?type=sermon&limit=5&cursor=$CURSOR" > /tmp/p2.json
python -c "
import json
a=[x['id'] for x in json.load(open('/tmp/p1.json'))['items']]
b=[x['id'] for x in json.load(open('/tmp/p2.json'))['items']]
print('第一頁:',a)
print('第二頁:',b)
assert not set(a) & set(b), '兩頁有重複！'
print('沒有重複 ✓')
"
```

Expected: 印出兩頁的 id 與「沒有重複 ✓」

- [ ] **Step 6: 驗證快照確實避開 D1**

連續打兩次 bootstrap，第二次應該完全不查 D1：

```bash
curl -s -o /dev/null "<DEV_URL>/api/bootstrap"
curl -s -o /dev/null -w "第二次 bootstrap: %{http_code} %{time_total}s\n" "<DEV_URL>/api/bootstrap"
npx wrangler kv key list --binding SNAPSHOT --remote | head
```

Expected: 回 `200`，且 KV 列出 `site:v1` 與 `catalogue:v1` 兩個 key

- [ ] **Step 7: 驗證寫入會觸發重建**

需要管理員帳號。登入後改一段網站文字，等約 10 秒，再次執行：

```bash
npx wrangler kv key get "site:v1" --binding SNAPSHOT --remote | python -c "import sys,json;print('builtAt:', json.load(sys.stdin)['builtAt'])"
```

Expected: `builtAt` 是剛剛的時間，代表 router 出口的觸發有生效。

**若沒有管理員帳號可用，跳過這一步並在回報中明說沒有驗證到**，不要假設它有效。

- [ ] **Step 8: 隔日確認用量真的降下來**

部署滿 24 小時後：

```bash
cd Finance && set -a && . ./.dev.vars && set +a
curl -s https://api.cloudflare.com/client/v4/graphql \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data "{\"query\":\"query{viewer{accounts(filter:{accountTag:\\\"$CLOUDFLARE_ACCOUNT_ID\\\"}){d1AnalyticsAdaptiveGroups(limit:100,filter:{datetime_geq:\\\"$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)\\\",datetime_leq:\\\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\\\"}){sum{rowsRead}dimensions{databaseId}}}}}\"}"
```

Expected: `bol-church`（`22efbcee…`）的 `rowsRead` 明顯低於改造前的約 509 萬。

階段一預期降幅有限（每次請求省 2,294 列，約 34%），真正的大降幅要等階段二把 `sermons` / `dailyManna` 從 bootstrap 移除。**不要因為只降了三成就判定失敗。**

- [ ] **Step 9: Commit（若有調整）**

```bash
git add -A Church/
git commit -m "chore(church): 階段一部署驗證"
```

---

## 完成後

階段一到此結束。`/api/bootstrap` 仍然回傳完整的 `sermons` 與 `dailyManna`，前端沒有任何改動，可以獨立回滾。

階段二（前端切換、移除 bootstrap 的兩個大欄位）另開一份計畫，待階段一在 dev 觀察穩定後再開始。
