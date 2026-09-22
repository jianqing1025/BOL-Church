# Church：D1 用量最小化（KV 快照 + keyset 分頁）

日期：2026-09-22

## 背景

2026-09-22 16:00 UTC，帳號超過 D1 免費方案的每日 500 萬列讀取上限，`/api/bootstrap` 開始 100% 回 Cloudflare 1101，教會網站內容載不出來。同一個額度是帳號共用的，Finance（`fin.bolccop.org`）在 17:42、17:48 的 500 也是被連累的結果。

當日實測數據：

| 資料庫 | 讀取列數 | 佔比 |
| --- | --- | --- |
| bol-church | 5,092,639 | 98.9% |
| finance-bol | 55,254 | 1.1% |
| 合計 | 5,147,893 | — |

用量全部集中在 `/api/bootstrap`（[server.ts](../../../Church/server.ts) 的 `handleBootstrap`）。每一次匿名頁面載入的成本：

| 來源 | 查詢 | 讀取列數 |
| --- | --- | --- |
| `ensureSeedData` | `SELECT COUNT(*) FROM site_content` | 546 |
| `ensureSeedData` | `SELECT COUNT(*) FROM sermons` | 1,202 |
| `getSiteContent` | `SELECT path, en, zh FROM site_content` | 546 |
| bootstrap | `SELECT * FROM sermons WHERE type='sermon'` | 1,202 |
| bootstrap | `SELECT * FROM daily_manna` | 3,198 |
| | **合計** | **6,694** |

扣掉 cron 的約 106,000 列之後，4,987,000 ÷ 6,694 ≈ 745 次頁面載入，與 zone analytics 量到的 bootstrap 請求數同一量級。

換句話說：**約 750 次頁面載入就會耗盡整個帳號一天的 D1 額度**，而且 `sermons` 與 `daily_manna` 每週都在增加，這個天花板只會越來越低。

## 目標

每日 D1 讀取列數從約 509 萬降到 10 萬以下（免費額度的 2% 以內），且該數字**不隨資料量成長**。

## 設計原則

1. 讀取路徑不查 D1 — 公開內容改讀預先建好的快照
2. 每個請求的成本是 O(1)，不是 O(資料總量)
3. 種子／遷移邏輯不得出現在熱路徑
4. 快取失效靠寫入時主動重建，不靠 TTL 猜
5. 公開資料與私有資料分開處理 — 公開的大但人人相同，私有的小但必須即時
6. 所有 `ORDER BY` / `WHERE` 都要有涵蓋的索引
7. 用量要可觀測，不能靠網站掛掉才發現

## 邊界

分界線是「資料量是否隨時間成長」：

| | 管什麼 | 為什麼 |
| --- | --- | --- |
| **KV 快照** | `site_content`(546)、`settings.images`、統計數字 | 數量固定，不會因為多講幾堂道而變大 |
| **分頁 API** | `sermons`(1,202)、`daily_manna`(3,198) | 每週增加，任何「全部載入」的設計遲早再爆一次 |

兩者不重疊：快照裡**不放**講道內文，分頁 API **不碰** `site_content`。

## 架構

### 一、快照模組

新增 KV namespace，binding 名 `SNAPSHOT`。兩個 key：

| Key | 內容 | 約略大小 |
| --- | --- | --- |
| `site:v1` | `{ content, images, stats: { sermonCount, mannaCount }, builtAt }` | 60 KB |
| `catalogue:v1` | `[{ id, type, titleEn, titleZh, date, youtubeId }]` 全量 | 250 KB |

key 帶版本尾碼。日後快照結構改變時把 `v1` 升成 `v2`，舊 key 自然失效，不需要寫遷移腳本，也不會讀到結構不符的舊資料。

新增 `snapshot/` 目錄：

```ts
// snapshot/snapshot.ts
export async function buildSiteSnapshot(env: Env): Promise<SiteSnapshot>;
export async function readSiteSnapshot(env: Env): Promise<SiteSnapshot>;
export async function buildCatalogue(env: Env): Promise<CatalogueEntry[]>;
export async function readCatalogue(env: Env): Promise<CatalogueEntry[]>;
export async function rebuildSnapshots(env: Env): Promise<void>;
```

`read*` 的行為：KV 命中就直接回傳；miss 就呼叫對應的 `build*`，寫回 KV 後回傳。**KV 掛掉或 miss 絕不能讓整站掛掉**，退化成今天的 D1 成本即可。

`build*` 是唯一還會跑那些昂貴查詢的地方。

### 二、`/api/bootstrap` 瘦身

```
GET /api/bootstrap
  snapshot     = await readSiteSnapshot(env)      // KV，0 列 D1
  currentUser  = await getCurrentUser(request, env) // 1 列 session
  payload      = { content, images, stats, currentUser, messages: [], prayerRequests: [], donations: [] }
  if (currentUser) 查 messages / prayer_requests / donations（合計 11 列）
```

`ensureSeedData` 從這裡移除。它是初始化邏輯，改為只在 cron 與部署後的首次寫入路徑執行。其中的 `ensureCategoryColumn`（每次請求對 `sermons` 發一次 `ALTER TABLE`，失敗後被 catch 吞掉）一併移除，欄位改由 migration 保證。

D1 讀取：**4,946 列 → 0 列**。

### 三、分頁 API

```
GET /api/sermons?type=sermon|daily-manna&cursor=<date>_<id>&limit=20
→ { items: Sermon[], nextCursor: string | null }
```

用 **keyset 分頁，不用 `OFFSET`**。`OFFSET 1000` 仍需掃過前 1,000 列，第 50 頁的成本是第 1 頁的 50 倍，等於把原則 2 又破壞掉。keyset 每頁恆定約 20 列。

`date` 會重複（同一天可能有多堂講道），單用 `date` 當游標會漏資料或重複。游標必須是 `(date, id)` 複合：

```sql
SELECT ... FROM sermons
WHERE type = ?1
  AND (?2 IS NULL OR date < ?2 OR (date = ?2 AND id < ?3))
ORDER BY date DESC, id DESC
LIMIT ?4
```

`daily_manna` 是獨立資料表，沒有 `type` 欄位，查詢同理但少一個條件。

游標的組裝與解析寫成純函式 `encodeCursor` / `decodeCursor` / `buildKeysetQuery`，不依賴 D1，可直接單元測試。

### 四、搜尋

搜尋需要跨全量資料，與分頁天生衝突。解法是搜尋走 `catalogue:v1`，不走 D1：

```
GET /api/sermons/catalogue
→ CatalogueEntry[]   （讀 KV，回應帶 Cache-Control: public, max-age=300）
```

前端**只在使用者真的開啟搜尋時才載入**。一般訪客永遠不會下載這 250 KB，也永遠不產生 D1 讀取。比對規則沿用現有的 `filterEntries`（欄位串接後小寫 `includes`），行為不變。

### 五、詳情

```
GET /api/sermons/:id?type=sermon|daily-manna
→ Sermon   （讀 1 列）
```

`SermonDetailPage` 目前是從全量陣列 `find`，這是它需要全量資料的唯一原因。

### 六、索引

新增 migration：

```sql
CREATE INDEX IF NOT EXISTS idx_sermons_type_date_id ON sermons(type, date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_daily_manna_date_id  ON daily_manna(date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_sermons_meta_refreshed ON sermons(meta_refreshed_at);
CREATE INDEX IF NOT EXISTS idx_daily_manna_meta_refreshed ON daily_manna(meta_refreshed_at);
```

前兩個支撐 keyset 分頁。現有的 `idx_sermons_date` 只有 `date`，`WHERE type = ?` 仍會多掃。

後兩個支撐 cron 的 `refreshOldestMetadata`：它的 `ORDER BY meta_refreshed_at ASC LIMIT 100` 目前沒有索引，每小時全表掃 4,400 列。

## 快照重建

不用 TTL，用寫入觸發。**規則：任何成功寫入 `site_content`、`settings.images`、`sermons`、`daily_manna` 的路徑，都必須接著呼叫 `rebuildSnapshots`。** 實作時以 grep 全面盤點這四張表的寫入點，逐一補上。

唯一的例外是 cron `refreshOldestMetadata`（每小時）：它只改 `duration_seconds` 與 `view_count`，不值得每小時付一次重建成本，交給四小時一班的 `syncAllChannels` 順便帶走。

## 一致性與其代價

KV 是全球最終一致，寫入後最多約 60 秒才會在所有地區生效。也就是管理員改完內容，其他地區的訪客最久可能有一分鐘看到舊版。

這對教會網站可以接受，但必須明講。管理後台自己的畫面用本地 state 立即反映，不等 KV 傳播，所以編輯者不會覺得「我明明存了卻沒變」。

## 錯誤處理

| 情況 | 行為 |
| --- | --- |
| KV miss 或讀取失敗 | 退回直接查 D1（成本 4,946 列）並嘗試重建。KV 故障絕不導致整站故障 |
| 重建失敗 | 記錄錯誤，但**不讓該次寫入請求失敗** — 資料已經進 D1 了。下次讀取 miss 時會自行重建 |
| 併發重建 | 冪等，重複寫入無害。不加鎖，成本有上限 |
| D1 額度用盡 | Church 目前**沒有** catch-all，例外直接變 1101。本次一併補上，並沿用 Finance 的 `friendlyMessage` 作法把額度錯誤換成看得懂的一句話 |
| 游標格式錯誤 | 視為沒有游標，回第一頁，不回 500 |

## 前端改動

- `context/AdminContext.tsx`：移除 `sermons` / `dailyManna` 兩個陣列與其 setter；保留 `content`、`images`、`currentUser`
- 新增 `hooks/useSermonPage(type, cursor)` 與 `hooks/useSermonSearch(query)`
- 改動元件：
  - `components/Sermons.tsx`
  - `components/SermonsPage.tsx`
  - `components/SermonManager.tsx`
  - `components/SermonDetailPage.tsx`
  - `components/AdminDashboard.tsx`（只用到 `.length` 與前 3 筆，改讀快照的 `stats` 與第一頁）

## 測試

沿用既有 vitest（`npm test`，`environment: 'node'`）。在 `vitest.config.ts` 的 `include` 加入 `snapshot/**/*.test.ts`。

因為測試環境是純 node、不含 D1，模組要設計成可注入：昂貴查詢集中在 `build*`，游標邏輯是純函式。

| 測試 | 驗證什麼 |
| --- | --- |
| `snapshot/cursor.test.ts` | `encodeCursor` / `decodeCursor` 往返；壞格式回傳 null 而不是丟例外 |
| `snapshot/pagination.test.ts` | 同一天多筆資料翻頁不重複、不遺漏；最後一頁 `nextCursor` 為 null |
| `snapshot/snapshot.test.ts` | KV miss 時回退到 build 並寫回；KV 丟例外時仍回傳可用資料 |

分頁的正確性用假的 D1 介面（回傳固定列陣列）驗證，不需要真資料庫。

## 分階段交付

兩階段各自可獨立上線與回滾。

### 階段一：後端（純新增，前端不受影響）

1. 建立 KV namespace，加入 `wrangler.toml` binding
2. 新增索引 migration
3. `snapshot/` 模組與測試
4. 盤點四張表的寫入點，補上 `rebuildSnapshots`
5. `/api/bootstrap` 的 `content` / `images` 改讀快照，`ensureSeedData` 移出熱路徑；**但仍照舊回傳 `sermons` / `dailyManna`**，前端不用改
6. 新增 `/api/sermons`、`/api/sermons/:id`、`/api/sermons/catalogue`
7. Church 加上 catch-all 與 `[observability] enabled = true`

階段一單獨上線即可省下每次請求 2,294 列（約 34%）。

### 階段二：前端切換

1. `AdminContext` 移除兩個陣列，改用新 hooks
2. 五個元件改為分頁與延遲載入的搜尋目錄
3. 確認前端不再使用後，`/api/bootstrap` 移除 `sermons` / `dailyManna` 欄位

## 預估效果

| 項目 | 現況 | 改後 |
| --- | --- | --- |
| bootstrap | 4,987,000 | 0 |
| 列表分頁 | — | ~56,000 |
| 詳情頁 | — | ~750 |
| 搜尋 | — | 0（走 KV） |
| cron | ~106,000 | ~4,800 |
| 快照重建 | — | ~30,000 |
| **合計／日** | **~5,093,000** | **~92,000** |

改後的估算前提：每日約 750 次造訪、平均翻 3 頁列表（每頁 20 筆、讀約 25 列）、快照每日重建約 6 次。

約 55 倍降幅，佔免費額度 1.8%。流量成長 10 倍仍有餘裕，且分頁成本不隨講道數量成長。

KV 免費額度為每日 10 萬次讀取、1,000 次寫入；本設計約用 760 次讀取與數十次寫入。

## 不做的事

- **不做 SQLite FTS5 全文索引**。KV 目錄已經讓搜尋的 D1 成本歸零，FTS5 還要額外維護索引與同步觸發器，不划算
- **不做 Cache API 邊緣快取**。Cache API 是每個資料中心各存一份，本站約每 10 分鐘只有 5 次請求、分散在數個 colo，命中率太低。KV 已經解決問題
- **不改 Finance**。原則同樣適用，但 Finance 一天只讀 55,254 列，不是問題來源。它已另外修好未 `await` 的例外外洩與額度錯誤訊息
- **不動 Church-Photos / bol-church-photos 資料庫**。兩者當日讀取為 0
