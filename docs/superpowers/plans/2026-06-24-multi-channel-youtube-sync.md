# 多频道 YouTube 同步 + 自学习分类 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给「主日信息」二级导航加一个管理员设置按钮，管理多个 YouTube 频道（各自 channel ID + API key），每个频道可按分类同步视频，分类用从现有数据自学习的关键词决定，并每 4 小时自动从所有频道同步一次。

**Architecture:** 把现有单频道、按 entryType 过滤的 `syncChannelUploads` 泛化为多频道、按完整分类目标过滤；分类逻辑抽到独立纯函数模块 `Church/sync/classifier.ts`（可单元测试），用从 D1 现有已分类标题学习的关键词模型归类，硬编码关键词兜底。新增 `sync_channels` 表与一套 admin CRUD/同步端点，前端新增齿轮按钮 + 频道管理 modal。

**Tech Stack:** Cloudflare Workers + D1 (`server.ts`)、React 19 + Vite（前端）、vitest（仅测纯逻辑）、wrangler cron triggers。

**约定：所有命令的工作目录是 `Church/`（package.json 所在处）。** 本文中 `npx tsc` / `npx vitest` / `git` 命令均在 `Church/` 下执行（git 仓库根在上一级，`git add` 用相对 `Church/` 的路径亦可）。

---

## 文件结构

新增：
- `Church/sync/classifier.ts` — 纯函数：标题归一化、分词、构建学习模型、分类、硬编码兜底、目标匹配。
- `Church/sync/classifier.test.ts` — vitest 单元测试。
- `Church/vitest.config.ts` — vitest 配置。
- `Church/migrations/0011_add_sync_channels.sql` — `sync_channels` 表。
- `Church/components/ChannelSyncManager.tsx` — 频道管理 + 同步菜单 modal。

修改：
- `Church/package.json` — 加 vitest 依赖 + `test` 脚本。
- `Church/server.ts` — 引入 classifier 模块、`ensureSyncChannelsTable`、泛化 `syncChannelUploads`、新增 `syncAllChannels`、频道 CRUD handlers、路由、`scheduled()` cron 分支。
- `Church/wrangler.toml` — cron `"0 14 * * *"` → `"0 */4 * * *"`。
- `Church/api.ts` — 频道 CRUD/test/sync 方法。
- `Church/constants/translations.ts` — `channelSync` 文案。
- `Church/components/SermonsSecondaryNav.tsx` — 右侧齿轮按钮 + 挂载 modal。

---

## Task 1: vitest 配置 + 自学习分类器纯函数模块（TDD）

**Files:**
- Modify: `Church/package.json`
- Create: `Church/vitest.config.ts`
- Create: `Church/sync/classifier.ts`
- Test: `Church/sync/classifier.test.ts`

- [ ] **Step 1: 加 vitest 依赖与 test 脚本**

在 `Church/package.json` 的 `"scripts"` 块加一行（放在 `"preview"` 之后）：

```json
    "test": "vitest run",
```

在 `"devDependencies"` 块加一行（保持字母序，放在 `typescript` 之前）：

```json
    "vitest": "^3.0.0",
```

- [ ] **Step 2: 安装依赖**

Run: `npm install`
Expected: 安装成功，`node_modules/.bin/vitest` 存在。

- [ ] **Step 3: 写 vitest 配置**

Create `Church/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['sync/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: 写失败的测试**

Create `Church/sync/classifier.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeTitle,
  extractTokens,
  buildClassifier,
  classifySermonCategory,
  matchesTarget,
  type TrainingRow,
} from './classifier';

describe('normalizeTitle', () => {
  it('strips leading date prefix, urls and speaker names', () => {
    expect(normalizeTitle('2024-05-05 敬拜讚美特會')).toBe('敬拜讚美特會');
    expect(normalizeTitle('主日信息 https://youtu.be/abc')).toBe('主日信息');
    expect(normalizeTitle('Pastor Andy Yu 醫治禱告')).toBe('醫治禱告');
  });
});

describe('extractTokens', () => {
  it('produces CJK bigrams and lowercased ascii words >=3', () => {
    const tokens = extractTokens('敬拜讚美 Worship');
    expect(tokens).toContain('敬拜');
    expect(tokens).toContain('拜讚');
    expect(tokens).toContain('讚美');
    expect(tokens).toContain('worship');
    expect(tokens).not.toContain('的'); // single char dropped
  });
});

const training: TrainingRow[] = [
  { title: '2024-01-07 敬拜讚美', category: 'worship-praise' },
  { title: '2024-01-14 敬拜讚美特會', category: 'worship-praise' },
  { title: '2024-01-21 敬拜讚美', category: 'worship-praise' },
  { title: '2024-02-04 醫治禱告', category: 'healing-prayer' },
  { title: '2024-02-11 醫治禱告會', category: 'healing-prayer' },
  { title: '2024-02-18 醫治禱告', category: 'healing-prayer' },
  { title: '2024-03-03 見證分享', category: 'testimony' },
  { title: '2024-03-10 見證分享', category: 'testimony' },
  { title: '2024-03-17 見證分享', category: 'testimony' },
  { title: '2024-04-07 主日信息', category: 'sunday-worship' },
  { title: '2024-04-14 主日信息', category: 'sunday-worship' },
  { title: '2024-04-21 主日信息', category: 'sunday-worship' },
];

describe('buildClassifier + classifySermonCategory', () => {
  it('classifies a new title from learned keywords', () => {
    const model = buildClassifier(training);
    expect(classifySermonCategory(model, '2024-05-05 敬拜讚美晚會')).toBe('worship-praise');
    expect(classifySermonCategory(model, '2024-05-12 醫治禱告特會')).toBe('healing-prayer');
    expect(classifySermonCategory(model, '2024-05-19 見證分享主日')).toBe('testimony');
  });

  it('falls back to hardcoded keywords when model has no signal', () => {
    const emptyModel = buildClassifier([]);
    expect(classifySermonCategory(emptyModel, '醫治特會')).toBe('healing-prayer');
    expect(classifySermonCategory(emptyModel, '純文字無關鍵詞')).toBe('sunday-worship');
  });
});

describe('matchesTarget', () => {
  it('maps targets to entry type + category', () => {
    expect(matchesTarget('sermon', 'sunday-worship', 'all')).toBe(true);
    expect(matchesTarget('daily-manna', 'sunday-worship', 'all')).toBe(true);
    expect(matchesTarget('sermon', 'worship-praise', 'worship-praise')).toBe(true);
    expect(matchesTarget('sermon', 'sunday-worship', 'worship-praise')).toBe(false);
    expect(matchesTarget('daily-manna', 'sunday-worship', 'daily-manna')).toBe(true);
    expect(matchesTarget('sermon', 'sunday-worship', 'daily-manna')).toBe(false);
    expect(matchesTarget('sermon', 'testimony', 'sermon')).toBe(true);
    expect(matchesTarget('daily-manna', 'sunday-worship', 'sermon')).toBe(false);
  });
});
```

- [ ] **Step 5: 运行测试确认失败**

Run: `npx vitest run sync/classifier.test.ts`
Expected: FAIL，报错找不到 `./classifier` 模块。

- [ ] **Step 6: 实现 classifier 模块**

Create `Church/sync/classifier.ts`:

```ts
// 纯函数自学习分类器：从现有已分类标题学习关键词，归类未来视频；硬编码关键词兜底。
// 不依赖 Worker / D1，可单元测试。

export type SermonCategoryDb =
  | 'sunday-worship' | 'worship-praise' | 'healing-prayer' | 'testimony' | 'live-broadcast';
export type EntryType = 'sermon' | 'daily-manna';

// 同步目标：'all' 全收；'sermon' 所有 sermon 类；'daily-manna' 每日天言；其余为 4 个 sermon 细分类
export type SyncTarget =
  | 'all' | 'sermon' | 'daily-manna'
  | 'sunday-worship' | 'worship-praise' | 'healing-prayer' | 'testimony';

export interface TrainingRow {
  title: string;
  category: SermonCategoryDb | 'daily-manna';
}

// category -> (keyword -> weight)
export type ClassifierModel = Map<string, Map<string, number>>;

// 仅对这 4 个 sermon 细分类做学习/打分（live-broadcast 由直播功能写入，不参与）
const LEARNABLE_CATEGORIES: SermonCategoryDb[] = [
  'sunday-worship', 'worship-praise', 'healing-prayer', 'testimony',
];

const MIN_DOC_COUNT = 2;       // 关键词在某类至少出现 2 篇才算特征
const SHARE_THRESHOLD = 0.65;  // 关键词在某类占比 >= 65% 才算该类特征（剔除跨类通用词）

// ---- 硬编码兜底（与 server.ts 原 inferCategoryFromTitle / inferEntryTypeFromTitle 一致）----

export function inferCategoryFromTitle(title: string): SermonCategoryDb {
  const text = title || '';
  if (/\blive\b|直播/i.test(text)) return 'live-broadcast';
  if (/敬拜|讚美|赞美|詩歌|诗歌|praise|worship|hymn/i.test(text)) return 'worship-praise';
  if (/醫治|医治|禱告會|祷告会|healing|prayer\s*meeting/i.test(text)) return 'healing-prayer';
  if (/見證|见证|testimony/i.test(text)) return 'testimony';
  return 'sunday-worship';
}

export function inferEntryTypeFromTitle(title: string): EntryType {
  const text = title || '';
  if (/每日天言|每日一句话|每日一句話|聖卷|圣卷|daily\s*manna/i.test(text)) return 'daily-manna';
  return 'sermon';
}

// ---- 归一化 + 分词 ----

const SPEAKER_NOISE = [/Pastor\s+Andy\s+Yu/gi, /余大器\s*牧師/g, /牧師/g, /牧师/g];

export function normalizeTitle(title: string): string {
  let t = String(title || '');
  t = t.replace(/^\d{4}-\d{2}-\d{2}\s*/, '');   // 去开头日期前缀
  t = t.replace(/https?:\/\/\S+/gi, '');         // 去 URL
  for (const re of SPEAKER_NOISE) t = t.replace(re, ' ');
  return t.trim();
}

export function extractTokens(title: string): string[] {
  const tokens: string[] = [];
  const lower = title.toLowerCase();
  // 英文/数字单词，长度 >= 3
  for (const m of lower.matchAll(/[a-z][a-z0-9]{2,}/g)) tokens.push(m[0]);
  // 中文相邻二字 bigram
  for (const run of title.matchAll(/[一-鿿]+/g)) {
    const s = run[0];
    for (let i = 0; i + 1 < s.length; i++) tokens.push(s.slice(i, i + 2));
  }
  return tokens;
}

function uniqueTokens(title: string): string[] {
  return [...new Set(extractTokens(normalizeTitle(title)))];
}

// ---- 学习 ----

export function buildClassifier(rows: TrainingRow[]): ClassifierModel {
  const catCounts = new Map<string, Map<string, number>>();   // cat -> token -> doc count
  const globalCounts = new Map<string, number>();             // token -> doc count（全类合计）

  for (const row of rows) {
    if (!LEARNABLE_CATEGORIES.includes(row.category as SermonCategoryDb)) continue;
    const cat = row.category;
    let perCat = catCounts.get(cat);
    if (!perCat) { perCat = new Map(); catCounts.set(cat, perCat); }
    for (const token of uniqueTokens(row.title)) {
      perCat.set(token, (perCat.get(token) || 0) + 1);
      globalCounts.set(token, (globalCounts.get(token) || 0) + 1);
    }
  }

  const model: ClassifierModel = new Map();
  for (const [cat, perCat] of catCounts) {
    const kept = new Map<string, number>();
    for (const [token, count] of perCat) {
      const total = globalCounts.get(token) || count;
      const share = count / total;
      if (count >= MIN_DOC_COUNT && share >= SHARE_THRESHOLD) kept.set(token, count);
    }
    model.set(cat, kept);
  }
  return model;
}

// ---- 分类 ----

export function classifySermonCategory(model: ClassifierModel, title: string): SermonCategoryDb {
  const tokens = uniqueTokens(title);
  let bestCat: SermonCategoryDb | null = null;
  let bestScore = 0;
  let tie = false;

  for (const cat of LEARNABLE_CATEGORIES) {
    const weights = model.get(cat);
    if (!weights) continue;
    let score = 0;
    for (const token of tokens) score += weights.get(token) || 0;
    if (score > bestScore) { bestScore = score; bestCat = cat; tie = false; }
    else if (score === bestScore && score > 0) { tie = true; }
  }

  if (bestCat && bestScore > 0 && !tie) return bestCat;
  return inferCategoryFromTitle(title); // 无信号或并列 → 硬编码兜底
}

// ---- 目标匹配 ----

export function matchesTarget(entryType: EntryType, category: SermonCategoryDb, target: SyncTarget): boolean {
  if (target === 'all') return true;
  if (target === 'daily-manna') return entryType === 'daily-manna';
  if (target === 'sermon') return entryType === 'sermon';
  // 4 个细分类
  return entryType === 'sermon' && category === target;
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run sync/classifier.test.ts`
Expected: PASS，所有用例绿。

- [ ] **Step 8: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 9: Commit**

```bash
git add Church/package.json Church/package-lock.json Church/vitest.config.ts Church/sync/classifier.ts Church/sync/classifier.test.ts
git commit -m "feat(church): add self-learning sermon classifier with vitest"
```

---

## Task 2: sync_channels 表（migration + 运行时 ensure + 类型）

**Files:**
- Create: `Church/migrations/0011_add_sync_channels.sql`
- Modify: `Church/server.ts`（在 `ensureSyncCursorTable` 附近加 `ensureSyncChannelsTable`，约 1866 行后）

- [ ] **Step 1: 写 migration**

Create `Church/migrations/0011_add_sync_channels.sql`:

```sql
-- 多频道 YouTube 同步：每个频道独立的 channel_id + api_key
CREATE TABLE IF NOT EXISTS sync_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  api_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_channels_sort ON sync_channels(sort_order);
```

- [ ] **Step 2: 加运行时 ensure 函数**

在 `Church/server.ts` 中 `ensureSyncCursorTable`（约 1866 行）函数之后，加入：

```ts
async function ensureSyncChannelsTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sync_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      api_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();
}

interface SyncChannelRow {
  id: string;
  name: string;
  channel_id: string;
  api_key: string;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function syncChannelRowToAdmin(row: SyncChannelRow) {
  return {
    id: row.id,
    name: row.name,
    channelId: row.channel_id,
    apiKeyMasked: maskApiKey(row.api_key),
    apiKeyPresent: Boolean(row.api_key),
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 3: 应用本地 migration 验证 SQL 合法**

Run: `npm run d1:migrate:local`
Expected: 输出包含 `0011_add_sync_channels.sql` 已应用，无 SQL 错误。

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误（`SyncChannelRow` / `syncChannelRowToAdmin` 暂未使用会触发 noUnusedLocals 吗？本仓库 tsconfig 若开启 `noUnusedLocals` 会报错——下一 Task 立即使用它们，本步若因未使用报错可接受，确认仅此一类报错即可）。

- [ ] **Step 5: Commit**

```bash
git add Church/migrations/0011_add_sync_channels.sql Church/server.ts
git commit -m "feat(church): add sync_channels table and runtime ensure helper"
```

---

## Task 3: 泛化 syncChannelUploads + 新增 syncAllChannels

**Files:**
- Modify: `Church/server.ts`（替换 `inferCategoryFromTitle`/`inferEntryTypeFromTitle` 为模块导入；改 `SyncCategory`/`SyncResult` 类型；改 `syncChannelUploads` 签名与分类逻辑；新增 `syncAllChannels`）

- [ ] **Step 1: 引入 classifier 模块，移除重复的硬编码函数**

在 `Church/server.ts` 顶部 import 区加入：

```ts
import {
  buildClassifier,
  classifySermonCategory,
  inferEntryTypeFromTitle,
  matchesTarget,
  type ClassifierModel,
  type SyncTarget,
  type TrainingRow,
} from './sync/classifier';
```

删除 `server.ts` 中原有的 `inferCategoryFromTitle`（约 76–83 行）与 `inferEntryTypeFromTitle`（约 1834–1840 行）两个函数定义（现由模块提供；`inferCategoryFromTitle` 现在只被 classifier 内部用，server 不再直接需要）。`normalizeCategory`（约 64–72 行）保留不动。

> 注意：若 `server.ts` 内其它位置仍调用 `inferCategoryFromTitle`，把那些调用改为 `classifySermonCategory(model, title)`（见 Step 3），或在确实只需要硬编码时从模块 import `inferCategoryFromTitle`。

- [ ] **Step 2: 改 SyncCategory / SyncResult 类型**

在 `Church/server.ts` 约 1863–1864 行，把：

```ts
type SyncCategory = 'sermon' | 'daily-manna' | 'all';
type SyncResult = { inserted: number; updated: number; skipped: number; errors: string[]; pages: number; hasMore: boolean; category: SyncCategory };
```

替换为（`SyncTarget` 现由模块提供，本地不再定义 `SyncCategory`）：

```ts
type SyncResult = {
  inserted: number; updated: number; skipped: number;
  errors: string[]; pages: number; hasMore: boolean; category: SyncTarget;
};
```

并把 `readSyncCursor` / `writeSyncCursor` / `ensureSyncCursorTable` 中所有 `category: SyncCategory` 形参类型改为 `category: SyncTarget`（共 2 处签名，约 1876、1884 行）。

- [ ] **Step 3: 替换 syncChannelUploads 为按频道 + 目标过滤的版本**

把 `Church/server.ts` 中整个 `syncChannelUploads` 函数（从约 1899 行 `async function syncChannelUploads` 到约 2121 行其 `return result; }`）替换为下面两个函数：

```ts
// 从现有 D1 已分类数据构建一次学习模型（供整次同步复用）
async function buildClassifierFromDb(env: Env): Promise<ClassifierModel> {
  const rows: TrainingRow[] = [];
  try {
    await ensureCategoryColumn(env);
    const sermonRes = await env.DB
      .prepare(`SELECT title_zh, title_en, category FROM sermons WHERE hidden = 0`)
      .all<{ title_zh: string; title_en: string; category: string }>();
    for (const r of sermonRes.results || []) {
      const cat = (r.category || 'sunday-worship') as TrainingRow['category'];
      if (r.title_zh) rows.push({ title: r.title_zh, category: cat });
      if (r.title_en && r.title_en !== r.title_zh) rows.push({ title: r.title_en, category: cat });
    }
  } catch { /* 没有 category 列等情况：模型为空，退回硬编码兜底 */ }
  try {
    const mannaRes = await env.DB
      .prepare(`SELECT title_zh FROM daily_manna WHERE hidden = 0`)
      .all<{ title_zh: string }>();
    for (const r of mannaRes.results || []) {
      if (r.title_zh) rows.push({ title: r.title_zh, category: 'daily-manna' });
    }
  } catch { /* ignore */ }
  return buildClassifier(rows);
}

async function syncChannelUploads(
  env: Env,
  opts: { channel: { channelId: string; apiKey: string }; target?: SyncTarget; model?: ClassifierModel }
): Promise<SyncResult> {
  const target: SyncTarget = opts.target || 'all';
  const result: SyncResult = { inserted: 0, updated: 0, skipped: 0, errors: [], pages: 0, hasMore: false, category: target };

  // 一次性清理：早期 sync 把每日天言误存到 sermons 表（type='daily-manna'）→ 搬回 daily_manna。冪等。
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO daily_manna
        (id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, created_at, updated_at)
        SELECT id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, created_at, updated_at
        FROM sermons WHERE type = 'daily-manna'`),
      env.DB.prepare(`DELETE FROM sermons WHERE type = 'daily-manna'`),
    ]);
  } catch (err) {
    result.errors.push(`cleanup misplaced: ${err instanceof Error ? err.message : String(err)}`);
  }

  const channelId = (opts.channel.channelId || '').trim();
  const apiKey = (opts.channel.apiKey || '').trim();
  if (!apiKey || !channelId) {
    result.errors.push('channel_id 或 api_key 未設定');
    return result;
  }
  const playlistId = getUploadsPlaylistId(channelId);
  if (!playlistId) {
    result.errors.push('channel_id 不是 UC 開頭，無法推斷 Uploads playlist');
    return result;
  }

  const model = opts.model || await buildClassifierFromDb(env);

  let pageToken: string | undefined = undefined;
  const MAX_PAGES = 5;
  let reachedExistingContent = false;
  for (let i = 0; i < MAX_PAGES; i++) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    let data: YouTubePlaylistItemsResponse;
    try {
      const response = await fetch(url.toString());
      data = await response.json<YouTubePlaylistItemsResponse>();
      if (!response.ok || data.error) {
        result.errors.push(data.error?.message ?? `HTTP ${response.status}`);
        break;
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
    result.pages++;

    type ItemMeta = {
      videoId: string; date: string; entryType: 'sermon' | 'daily-manna';
      finalTitle: string; category: SermonCategoryDb; imageUrl: string | null;
    };
    const metas: ItemMeta[] = [];
    for (const item of data.items || []) {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (!videoId) continue;
      const rawTitle = item.snippet?.title || `Upload ${videoId}`;
      const publishedAt = item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || new Date().toISOString();
      const date = publishedAt.slice(0, 10);
      const entryType = inferEntryTypeFromTitle(rawTitle);
      const finalTitle = buildFinalTitle(rawTitle, date, entryType);
      const category = classifySermonCategory(model, finalTitle);
      // 按目标过滤：只处理命中目标的条目
      if (!matchesTarget(entryType, category, target)) continue;
      const thumbnails = item.snippet?.thumbnails;
      const imageUrl = thumbnails?.maxres?.url || thumbnails?.high?.url || thumbnails?.default?.url || null;
      metas.push({ videoId, date, entryType, finalTitle, category, imageUrl });
    }

    if (metas.length === 0) {
      pageToken = data.nextPageToken;
      if (!pageToken) break;
      continue;
    }

    const sermonMetas = metas.filter(m => m.entryType === 'sermon');
    const mannaMetas = metas.filter(m => m.entryType === 'daily-manna');
    const existingSermons = new Set<string>();
    const existingManna = new Set<string>();

    if (sermonMetas.length > 0) {
      const ph = sermonMetas.map(() => '?').join(',');
      try {
        const res = await env.DB.prepare(`SELECT youtube_id FROM sermons WHERE youtube_id IN (${ph})`)
          .bind(...sermonMetas.map(m => m.videoId)).all<{ youtube_id: string }>();
        for (const r of res.results || []) existingSermons.add(r.youtube_id);
      } catch (err) {
        result.errors.push(`select sermons page ${result.pages}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (mannaMetas.length > 0) {
      const ph = mannaMetas.map(() => '?').join(',');
      try {
        const res = await env.DB.prepare(`SELECT youtube_id FROM daily_manna WHERE youtube_id IN (${ph})`)
          .bind(...mannaMetas.map(m => m.videoId)).all<{ youtube_id: string }>();
        for (const r of res.results || []) existingManna.add(r.youtube_id);
      } catch (err) {
        result.errors.push(`select daily_manna page ${result.pages}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const nowIso = new Date().toISOString();
    const newMetas: ItemMeta[] = [];
    let plannedSkips = 0;
    for (const meta of metas) {
      const isExisting = meta.entryType === 'sermon'
        ? existingSermons.has(meta.videoId)
        : existingManna.has(meta.videoId);
      if (isExisting) { reachedExistingContent = true; plannedSkips++; break; }
      newMetas.push(meta);
    }

    const videoMetaMap = newMetas.length > 0
      ? await fetchVideoMetadata(apiKey, newMetas.map(m => m.videoId))
      : new Map<string, VideoMeta>();

    const stmts: D1PreparedStatement[] = [];
    let plannedInserts = 0;
    for (const meta of newMetas) {
      const vm = videoMetaMap.get(meta.videoId);
      const duration = vm?.durationSeconds ?? null;
      const views = vm?.viewCount ?? null;
      if (meta.entryType === 'sermon') {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO sermons (id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, type, category, duration_seconds, view_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sermon', ?, ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(), meta.finalTitle, meta.finalTitle,
            'Pastor Andy Yu', '余大器 牧師', meta.date, '', '', '', '',
            meta.videoId, meta.imageUrl, meta.category, duration, views, nowIso, nowIso
          )
        );
      } else {
        stmts.push(
          env.DB.prepare(
            `INSERT INTO daily_manna (id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, duration_seconds, view_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(), meta.finalTitle, meta.finalTitle,
            'Pastor Andy Yu', '余大器 牧師', meta.date, '', '', '', '',
            meta.videoId, meta.imageUrl, duration, views, nowIso, nowIso
          )
        );
      }
      plannedInserts++;
    }

    if (stmts.length > 0) {
      try {
        await env.DB.batch(stmts);
        result.inserted += plannedInserts;
        result.skipped += plannedSkips;
      } catch (err) {
        result.errors.push(`batch page ${result.pages}: ${err instanceof Error ? err.message : String(err)}`);
        result.skipped += metas.length;
      }
    } else {
      result.skipped += plannedSkips;
    }

    if (reachedExistingContent) break;
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  if (!reachedExistingContent && pageToken) result.hasMore = true;
  return result;
}

// 遍历所有启用频道，逐个同步指定目标，累加结果
async function syncAllChannels(env: Env, opts?: { target?: SyncTarget }): Promise<SyncResult> {
  const target: SyncTarget = opts?.target || 'all';
  const total: SyncResult = { inserted: 0, updated: 0, skipped: 0, errors: [], pages: 0, hasMore: false, category: target };
  await ensureSyncChannelsTable(env);
  const channels = await env.DB
    .prepare('SELECT * FROM sync_channels WHERE enabled = 1 ORDER BY sort_order ASC')
    .all<SyncChannelRow>();
  const model = await buildClassifierFromDb(env);
  for (const ch of channels.results || []) {
    const r = await syncChannelUploads(env, { channel: { channelId: ch.channel_id, apiKey: ch.api_key }, target, model });
    total.inserted += r.inserted;
    total.updated += r.updated;
    total.skipped += r.skipped;
    total.pages += r.pages;
    total.hasMore = total.hasMore || r.hasMore;
    for (const e of r.errors) total.errors.push(`[${ch.name}] ${e}`);
  }
  return total;
}
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。（若报 `inferCategoryFromTitle` 未定义的引用，说明 server 内还有旧调用——改为 `classifySermonCategory(model, title)` 或从模块 import。）

- [ ] **Step 5: 跑既有测试确保未回归**

Run: `npx vitest run`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add Church/server.ts
git commit -m "feat(church): generalize sync to per-channel + full-category targets"
```

---

## Task 4: 频道 CRUD / test / sync handlers + 路由

**Files:**
- Modify: `Church/server.ts`（新增 handlers + 在 fetch 路由块加分发；改 `handleSermonSyncYoutube` 走新逻辑）

- [ ] **Step 1: 加频道管理 handlers**

在 `Church/server.ts` 中 `handleSermonSyncYoutube`（约 2516 行）之前，加入：

```ts
async function handleSyncChannelsList(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  const res = await env.DB.prepare('SELECT * FROM sync_channels ORDER BY sort_order ASC').all<SyncChannelRow>();
  return json({ channels: (res.results || []).map(syncChannelRowToAdmin) });
}

async function handleSyncChannelCreate(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  const payload = await readJson<{ name?: string; channelId?: string; apiKey?: string }>(request);
  const name = (payload.name || '').trim();
  const channelId = (payload.channelId || '').trim();
  const apiKey = (payload.apiKey || '').trim();
  if (!name || !channelId || !apiKey) return badRequest('name、channelId、apiKey 均必填');
  if (!getUploadsPlaylistId(channelId)) return badRequest('channelId 必須以 UC 開頭');
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const maxRow = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM sync_channels').first<{ m: number }>();
  const sortOrder = (maxRow?.m ?? -1) + 1;
  await env.DB.prepare(
    `INSERT INTO sync_channels (id, name, channel_id, api_key, enabled, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
  ).bind(id, name, channelId, apiKey, sortOrder, now, now).run();
  const row = await env.DB.prepare('SELECT * FROM sync_channels WHERE id = ?').bind(id).first<SyncChannelRow>();
  return json({ channel: syncChannelRowToAdmin(row as SyncChannelRow) }, 201);
}

async function handleSyncChannelUpdate(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  const current = await env.DB.prepare('SELECT * FROM sync_channels WHERE id = ?').bind(id).first<SyncChannelRow>();
  if (!current) return notFound();
  const payload = await readJson<{ name?: string; channelId?: string; apiKey?: string; enabled?: boolean }>(request);
  const name = payload.name === undefined ? current.name : (payload.name.trim() || current.name);
  const channelId = payload.channelId === undefined ? current.channel_id : (payload.channelId.trim() || current.channel_id);
  if (!getUploadsPlaylistId(channelId)) return badRequest('channelId 必須以 UC 開頭');
  const apiKey =
    payload.apiKey === undefined || payload.apiKey === UNCHANGED_API_KEY
      ? current.api_key
      : (payload.apiKey.trim() || current.api_key);
  const enabled = payload.enabled === undefined ? current.enabled : (payload.enabled ? 1 : 0);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE sync_channels SET name = ?, channel_id = ?, api_key = ?, enabled = ?, updated_at = ? WHERE id = ?`
  ).bind(name, channelId, apiKey, enabled, now, id).run();
  const row = await env.DB.prepare('SELECT * FROM sync_channels WHERE id = ?').bind(id).first<SyncChannelRow>();
  return json({ channel: syncChannelRowToAdmin(row as SyncChannelRow) });
}

async function handleSyncChannelDelete(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  await env.DB.prepare('DELETE FROM sync_channels WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function handleSyncChannelTest(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  const row = await env.DB.prepare('SELECT * FROM sync_channels WHERE id = ?').bind(id).first<SyncChannelRow>();
  if (!row) return notFound();
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('id', row.channel_id);
    url.searchParams.set('key', row.api_key);
    const response = await fetch(url.toString());
    const data = await response.json<{ items?: Array<{ snippet?: { title?: string } }>; error?: { message?: string } }>();
    if (!response.ok || data.error) return json({ ok: false, error: data.error?.message ?? `HTTP ${response.status}` });
    const channelName = data.items?.[0]?.snippet?.title;
    if (!channelName) return json({ ok: false, error: '找不到頻道（channelId 或 key 錯誤）' });
    return json({ ok: true, channelName });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleSyncChannelSync(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  const row = await env.DB.prepare('SELECT * FROM sync_channels WHERE id = ?').bind(id).first<SyncChannelRow>();
  if (!row) return notFound();
  const url = new URL(request.url);
  const target = normalizeSyncTarget(url.searchParams.get('target'));
  const result = await syncChannelUploads(env, { channel: { channelId: row.channel_id, apiKey: row.api_key }, target });
  await sendUploadsSyncNotification(env, result);
  return json(result);
}

function normalizeSyncTarget(value: string | null): SyncTarget {
  const allowed: SyncTarget[] = ['all', 'sermon', 'daily-manna', 'sunday-worship', 'worship-praise', 'healing-prayer', 'testimony'];
  return (allowed as string[]).includes(value || '') ? (value as SyncTarget) : 'all';
}
```

- [ ] **Step 2: 改写 handleSermonSyncYoutube 走新逻辑（保留旧端点兼容）**

把 `Church/server.ts` 中现有 `handleSermonSyncYoutube`（约 2516–2526 行）整体替换为：

```ts
async function handleSermonSyncYoutube(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  const url = new URL(request.url);
  const target = normalizeSyncTarget(url.searchParams.get('category'));
  // 优先用第一个启用频道；没有则回退到 live_stream_config 单频道（向后兼容旧站点）
  const first = await env.DB
    .prepare('SELECT * FROM sync_channels WHERE enabled = 1 ORDER BY sort_order ASC LIMIT 1')
    .first<SyncChannelRow>();
  let channel: { channelId: string; apiKey: string };
  if (first) {
    channel = { channelId: first.channel_id, apiKey: first.api_key };
  } else {
    const cfg = await getLiveStreamConfigRow(env);
    channel = { channelId: cfg.channel_id || '', apiKey: cfg.api_key || '' };
  }
  const result = await syncChannelUploads(env, { channel, target });
  await sendUploadsSyncNotification(env, result);
  return json(result);
}
```

- [ ] **Step 3: 注册路由**

在 `Church/server.ts` 的 fetch 路由块中，找到 `/api/admin/sermons/sync-youtube`（约 3283 行）那一段，紧随其后插入：

```ts
    if (url.pathname === '/api/admin/sync-channels' && request.method === 'GET') {
      return handleSyncChannelsList(request, env);
    }
    if (url.pathname === '/api/admin/sync-channels' && request.method === 'POST') {
      return handleSyncChannelCreate(request, env);
    }
    {
      const m = url.pathname.match(/^\/api\/admin\/sync-channels\/([^/]+)(\/test|\/sync)?$/);
      if (m) {
        const channelId = decodeURIComponent(m[1]);
        const suffix = m[2];
        if (!suffix && request.method === 'PUT') return handleSyncChannelUpdate(request, env, channelId);
        if (!suffix && request.method === 'DELETE') return handleSyncChannelDelete(request, env, channelId);
        if (suffix === '/test' && request.method === 'POST') return handleSyncChannelTest(request, env, channelId);
        if (suffix === '/sync' && request.method === 'POST') return handleSyncChannelSync(request, env, channelId);
      }
    }
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 5: Commit**

```bash
git add Church/server.ts
git commit -m "feat(church): add sync-channels CRUD/test/sync endpoints"
```

---

## Task 5: Cron 改为每 4 小时

**Files:**
- Modify: `Church/wrangler.toml`
- Modify: `Church/server.ts`（`scheduled()` 分支，约 3334 行）

- [ ] **Step 1: 改 cron 表达式**

在 `Church/wrangler.toml` 把第 39–41 行：

```toml
# Daily upload sync — UTC 14:00 = PT 06:00 (PST) / 07:00 (PDT)
[triggers]
crons = ["*/5 17-22 * * SUN", "0 14 * * *"]
```

改为：

```toml
# Multi-channel upload sync — every 4 hours
[triggers]
crons = ["*/5 17-22 * * SUN", "0 */4 * * *"]
```

- [ ] **Step 2: 改 scheduled 分发**

在 `Church/server.ts` 的 `scheduled()`（约 3334 行）中，把：

```ts
    if (event.cron === '0 14 * * *') {
      ctx.waitUntil(
        syncChannelUploads(env)
          .then(result => sendUploadsSyncNotification(env, result))
          .catch(() => undefined)
      );
    } else {
```

替换为：

```ts
    if (event.cron === '0 */4 * * *') {
      ctx.waitUntil(
        syncAllChannels(env, { target: 'all' })
          .then(result => sendUploadsSyncNotification(env, result))
          .catch(() => undefined)
      );
    } else {
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误（注意：原 `syncChannelUploads(env)` 无参调用已不存在，确认 scheduled 内已改为 `syncAllChannels`）。

- [ ] **Step 4: Commit**

```bash
git add Church/wrangler.toml Church/server.ts
git commit -m "feat(church): switch upload sync cron to every 4 hours, all channels"
```

---

## Task 6: api.ts 前端方法

**Files:**
- Modify: `Church/api.ts`

- [ ] **Step 1: 加频道相关类型与方法**

在 `Church/api.ts` 文件顶部、`LiveStreamSavePayload` interface 之后，加入：

```ts
export interface SyncChannelAdmin {
  id: string;
  name: string;
  channelId: string;
  apiKeyMasked: string;
  apiKeyPresent: boolean;
  enabled: boolean;
  sortOrder: number;
  updatedAt: string;
}

export type SyncTargetClient =
  | 'all' | 'sunday-worship' | 'worship-praise' | 'healing-prayer' | 'testimony' | 'daily-manna';

export interface SyncResultClient {
  inserted: number; updated: number; skipped: number;
  errors: string[]; pages: number; hasMore: boolean; category: string;
}
```

在 `export const api = {` 对象内（在 `sermonsSyncYoutube` 之后）加入：

```ts
  syncChannelsList: () =>
    request<{ channels: SyncChannelAdmin[] }>('/api/admin/sync-channels'),
  syncChannelCreate: (payload: { name: string; channelId: string; apiKey: string }) =>
    request<{ channel: SyncChannelAdmin }>('/api/admin/sync-channels', { method: 'POST', body: JSON.stringify(payload) }),
  syncChannelUpdate: (id: string, payload: Partial<{ name: string; channelId: string; apiKey: string; enabled: boolean }>) =>
    request<{ channel: SyncChannelAdmin }>(`/api/admin/sync-channels/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
  syncChannelDelete: (id: string) =>
    request<{ ok: true }>(`/api/admin/sync-channels/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  syncChannelTest: (id: string) =>
    request<{ ok: boolean; channelName?: string; error?: string }>(`/api/admin/sync-channels/${encodeURIComponent(id)}/test`, { method: 'POST' }),
  syncChannelSync: (id: string, target: SyncTargetClient) =>
    request<SyncResultClient>(`/api/admin/sync-channels/${encodeURIComponent(id)}/sync?target=${target}`, { method: 'POST' }),
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add Church/api.ts
git commit -m "feat(church): add sync-channels api client methods"
```

---

## Task 7: 翻译文案

**Files:**
- Modify: `Church/constants/translations.ts`

- [ ] **Step 1: 加 channelSync 文案块**

在 `Church/constants/translations.ts` 的 `admin: {` 块内末尾（紧接 `youtubeSync` 等键之后、`admin` 块的闭合 `}` 之前）加入：

```ts
    channelSyncTitle: { en: 'Channel sync settings', zh: '頻道同步設置' },
    channelSyncAdd: { en: '+ Add channel', zh: '+ 添加頻道' },
    channelSyncName: { en: 'Name', zh: '名稱' },
    channelSyncChannelId: { en: 'Channel ID (UC...)', zh: '頻道 ID（UC 開頭）' },
    channelSyncApiKey: { en: 'API key', zh: 'API key' },
    channelSyncApiKeyKeep: { en: 'Leave blank to keep current', zh: '留空表示不修改' },
    channelSyncSave: { en: 'Save', zh: '保存' },
    channelSyncCancel: { en: 'Cancel', zh: '取消' },
    channelSyncTest: { en: 'Test', zh: '測試' },
    channelSyncEdit: { en: 'Edit', zh: '編輯' },
    channelSyncDelete: { en: 'Delete', zh: '刪除' },
    channelSyncEnabled: { en: 'Enabled', zh: '啟用' },
    channelSyncDisabled: { en: 'Disabled', zh: '停用' },
    channelSyncMenu: { en: 'Sync ▾', zh: '同步 ▾' },
    channelSyncSyncing: { en: 'Syncing…', zh: '同步中…' },
    channelSyncTargetAll: { en: 'All', zh: '全部' },
    channelSyncTargetSundayWorship: { en: 'Sunday message', zh: '主日信息' },
    channelSyncTargetWorshipPraise: { en: 'Worship & praise', zh: '敬拜讚美' },
    channelSyncTargetHealingPrayer: { en: 'Healing prayer', zh: '醫治禱告' },
    channelSyncTargetTestimony: { en: 'Testimony', zh: '見證分享' },
    channelSyncTargetDailyManna: { en: 'Daily manna', zh: '每日天言' },
    channelSyncResult: { en: 'Inserted {inserted} · Skipped {skipped} · Pages {pages}', zh: '新增 {inserted} · 跳過 {skipped} · 頁數 {pages}' },
    channelSyncTestOk: { en: 'OK: {name}', zh: '成功：{name}' },
    channelSyncEmpty: { en: 'No channels yet. Add one to start syncing.', zh: '還沒有頻道，添加一個開始同步。' },
    channelSyncSettings: { en: 'Sync settings', zh: '同步設置' },
```

> 注意：`{inserted}` 等占位符是字面文本，前端用 `.replace()` 自行替换（见 Task 8）；本仓库 `t()` 不内置插值。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add Church/constants/translations.ts
git commit -m "feat(church): add channel sync translations"
```

---

## Task 8: 前端齿轮按钮 + 频道管理 modal

**Files:**
- Create: `Church/components/ChannelSyncManager.tsx`
- Modify: `Church/components/SermonsSecondaryNav.tsx`

- [ ] **Step 1: 写 ChannelSyncManager 组件**

Create `Church/components/ChannelSyncManager.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { api, type SyncChannelAdmin, type SyncTargetClient, type SyncResultClient } from '../api';
import { useLocalization } from '../hooks/useLocalization';
import { useAdmin } from '../hooks/useAdmin';

interface ChannelSyncManagerProps {
  open: boolean;
  onClose: () => void;
}

const SYNC_TARGETS: { target: SyncTargetClient; key: string }[] = [
  { target: 'all', key: 'admin.channelSyncTargetAll' },
  { target: 'sunday-worship', key: 'admin.channelSyncTargetSundayWorship' },
  { target: 'worship-praise', key: 'admin.channelSyncTargetWorshipPraise' },
  { target: 'healing-prayer', key: 'admin.channelSyncTargetHealingPrayer' },
  { target: 'testimony', key: 'admin.channelSyncTargetTestimony' },
  { target: 'daily-manna', key: 'admin.channelSyncTargetDailyManna' },
];

const emptyForm = { name: '', channelId: '', apiKey: '' };

const ChannelSyncManager: React.FC<ChannelSyncManagerProps> = ({ open, onClose }) => {
  const { t } = useLocalization();
  const { refreshBootstrap } = useAdmin();
  const [channels, setChannels] = useState<SyncChannelAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = 不在编辑；'new' = 新增
  const [form, setForm] = useState(emptyForm);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.syncChannelsList();
      setChannels(res.channels);
    } catch (err) {
      setRowMsg({ _global: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open]);

  if (!open) return null;

  const startCreate = () => { setEditingId('new'); setForm(emptyForm); };
  const startEdit = (ch: SyncChannelAdmin) => {
    setEditingId(ch.id);
    setForm({ name: ch.name, channelId: ch.channelId, apiKey: '' });
  };

  const saveForm = async () => {
    try {
      if (editingId === 'new') {
        await api.syncChannelCreate({ name: form.name, channelId: form.channelId, apiKey: form.apiKey });
      } else if (editingId) {
        const payload: Partial<{ name: string; channelId: string; apiKey: string }> = { name: form.name, channelId: form.channelId };
        if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
        await api.syncChannelUpdate(editingId, payload);
      }
      setEditingId(null);
      await load();
    } catch (err) {
      setRowMsg({ _form: err instanceof Error ? err.message : String(err) });
    }
  };

  const toggleEnabled = async (ch: SyncChannelAdmin) => {
    await api.syncChannelUpdate(ch.id, { enabled: !ch.enabled });
    await load();
  };

  const remove = async (ch: SyncChannelAdmin) => {
    await api.syncChannelDelete(ch.id);
    await load();
  };

  const test = async (ch: SyncChannelAdmin) => {
    const res = await api.syncChannelTest(ch.id);
    setRowMsg(prev => ({
      ...prev,
      [ch.id]: res.ok ? t('admin.channelSyncTestOk').replace('{name}', res.channelName || '') : (res.error || 'error'),
    }));
  };

  const runSync = async (ch: SyncChannelAdmin, target: SyncTargetClient) => {
    setOpenMenuId(null);
    setSyncingId(ch.id);
    setRowMsg(prev => ({ ...prev, [ch.id]: t('admin.channelSyncSyncing') }));
    try {
      const r: SyncResultClient = await api.syncChannelSync(ch.id, target);
      const msg = t('admin.channelSyncResult')
        .replace('{inserted}', String(r.inserted))
        .replace('{skipped}', String(r.skipped))
        .replace('{pages}', String(r.pages));
      setRowMsg(prev => ({ ...prev, [ch.id]: r.errors.length ? `${msg} · ${r.errors.slice(0, 2).join('; ')}` : msg }));
      if (r.inserted > 0) { try { await refreshBootstrap(); } catch { /* ignore */ } }
    } catch (err) {
      setRowMsg(prev => ({ ...prev, [ch.id]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-24" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-white text-gray-900 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-lg font-semibold">{t('admin.channelSyncTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="close">✕</button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-3">
          {rowMsg._global && <div className="text-sm text-red-600">{rowMsg._global}</div>}

          {!loading && channels.length === 0 && editingId !== 'new' && (
            <p className="text-sm text-gray-500">{t('admin.channelSyncEmpty')}</p>
          )}

          {channels.map(ch => (
            <div key={ch.id} className="rounded border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{ch.name}</span>
                <span className="text-xs text-gray-500">{ch.channelId}</span>
                <button
                  onClick={() => toggleEnabled(ch)}
                  className={`rounded px-2 py-0.5 text-xs ${ch.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}
                >
                  {ch.enabled ? t('admin.channelSyncEnabled') : t('admin.channelSyncDisabled')}
                </button>
                <span className="text-xs text-gray-400">{ch.apiKeyMasked}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => test(ch)} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">{t('admin.channelSyncTest')}</button>
                  <button onClick={() => startEdit(ch)} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">{t('admin.channelSyncEdit')}</button>
                  <button onClick={() => remove(ch)} className="rounded border px-2 py-1 text-xs text-red-600 hover:bg-red-50">{t('admin.channelSyncDelete')}</button>
                  <div className="relative">
                    <button
                      disabled={syncingId === ch.id}
                      onClick={() => setOpenMenuId(openMenuId === ch.id ? null : ch.id)}
                      className="rounded bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                    >
                      {syncingId === ch.id ? t('admin.channelSyncSyncing') : t('admin.channelSyncMenu')}
                    </button>
                    {openMenuId === ch.id && (
                      <div className="absolute right-0 z-10 mt-1 w-36 rounded border bg-white py-1 shadow-lg">
                        {SYNC_TARGETS.map(item => (
                          <button
                            key={item.target}
                            onClick={() => runSync(ch, item.target)}
                            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                          >
                            {t(item.key)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {rowMsg[ch.id] && <div className="mt-2 text-xs text-gray-600">{rowMsg[ch.id]}</div>}
            </div>
          ))}

          {editingId && (
            <div className="rounded border border-blue-200 bg-blue-50 p-3 space-y-2">
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                placeholder={t('admin.channelSyncName')}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                placeholder={t('admin.channelSyncChannelId')}
                value={form.channelId}
                onChange={e => setForm({ ...form, channelId: e.target.value })}
              />
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                placeholder={editingId === 'new' ? t('admin.channelSyncApiKey') : t('admin.channelSyncApiKeyKeep)')}
                value={form.apiKey}
                onChange={e => setForm({ ...form, apiKey: e.target.value })}
              />
              {rowMsg._form && <div className="text-xs text-red-600">{rowMsg._form}</div>}
              <div className="flex gap-2">
                <button onClick={saveForm} className="rounded bg-gray-900 px-3 py-1 text-sm text-white">{t('admin.channelSyncSave')}</button>
                <button onClick={() => setEditingId(null)} className="rounded border px-3 py-1 text-sm">{t('admin.channelSyncCancel')}</button>
              </div>
            </div>
          )}

          {editingId !== 'new' && (
            <button onClick={startCreate} className="rounded border border-dashed px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
              {t('admin.channelSyncAdd')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChannelSyncManager;
```

> 修正占位文案 typo：上面 placeholder 中 `t('admin.channelSyncApiKeyKeep)')` 应为 `t('admin.channelSyncApiKeyKeep')`。在实现时直接写正确形式：

```tsx
                placeholder={editingId === 'new' ? t('admin.channelSyncApiKey') : t('admin.channelSyncApiKeyKeep')}
```

- [ ] **Step 2: 在 SermonsSecondaryNav 右侧加齿轮按钮并挂载 modal**

把 `Church/components/SermonsSecondaryNav.tsx` 整体替换为：

```tsx
import React, { useState } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { useAdmin } from '../hooks/useAdmin';
import { navigateTo as navigateToRoute } from '../utils/routes';
import SecondaryNavBar from './SecondaryNavBar';
import ChannelSyncManager from './ChannelSyncManager';

export type SermonsNavKey = 'sunday-worship' | 'worship-praise' | 'healing-prayer' | 'testimony' | 'daily-manna' | 'live-stream';

interface SermonsSecondaryNavProps {
  active: SermonsNavKey;
}

const NAV_ITEMS: { key: SermonsNavKey; textKey: string; href: string }[] = [
  { key: 'sunday-worship', textKey: 'sermonsPage.navSundayWorship', href: '/sermons/sunday-worship' },
  { key: 'worship-praise', textKey: 'sermonsPage.navWorshipPraise', href: '/sermons/worship-praise' },
  { key: 'healing-prayer', textKey: 'sermonsPage.navHealingPrayer', href: '/sermons/healing-prayer' },
  { key: 'testimony', textKey: 'sermonsPage.navTestimony', href: '/sermons/testimony' },
  { key: 'daily-manna', textKey: 'sermonsPage.navDailyManna', href: '/sermons/daily-manna' },
  { key: 'live-stream', textKey: 'sermonsPage.navLiveStream', href: '/live' },
];

const SermonsSecondaryNav: React.FC<SermonsSecondaryNavProps> = ({ active }) => {
  const { t } = useLocalization();
  const { isAdminMode } = useAdmin();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    event.preventDefault();
    navigateToRoute(path);
  };

  return (
    <SecondaryNavBar>
      <nav className="container relative mx-auto px-6">
        <ul className="flex justify-center items-center -mb-px space-x-4 sm:space-x-8 overflow-x-auto">
          {NAV_ITEMS.map(item => (
            <li key={item.key}>
              <a
                href={item.href}
                onClick={event => handleClick(event, item.href)}
                className={`whitespace-nowrap inline-block text-sm sm:text-base font-semibold py-4 border-b-2 transition-colors duration-300 ${
                  active === item.key
                    ? 'border-white text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-300'
                }`}
              >
                {t(item.textKey)}
              </a>
            </li>
          ))}
        </ul>
        {isAdminMode && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title={t('admin.channelSyncSettings')}
            aria-label={t('admin.channelSyncSettings')}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-300 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </nav>
      <ChannelSyncManager open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </SecondaryNavBar>
  );
};

export default SermonsSecondaryNav;
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: vite 构建成功，无错误。

- [ ] **Step 5: Commit**

```bash
git add Church/components/ChannelSyncManager.tsx Church/components/SermonsSecondaryNav.tsx
git commit -m "feat(church): add channel sync settings gear + manager modal"
```

---

## Task 9: 手动冒烟验证

**Files:** 无（验证步骤）

- [ ] **Step 1: 跑全部单测**

Run: `npx vitest run`
Expected: 所有用例 PASS。

- [ ] **Step 2: 类型 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 均无错误。

- [ ] **Step 3: 本地起服务**

Run: `npm run cf:dev`
Expected: wrangler dev 起在本地，控制台无启动错误。

- [ ] **Step 4: 手动验证（浏览器）**

按下列清单逐项确认，记录结果：
1. 未登录访问 `/sermons/sunday-worship`：二级导航**不显示**齿轮按钮。
2. 登录管理员后：齿轮按钮出现在二级导航右侧。
3. 点齿轮 → modal 打开，显示「还没有频道」。
4. 添加频道（name + 真实 UC 频道 ID + 真实 API key）→ 列表出现该频道，key 显示为掩码。
5. 点「测试」→ 显示频道名（key 有效）或错误信息（key 无效）。
6. 点「同步 ▾」→ 选「敬拜赞美」→ 行内显示「新增 N · 跳过 M · 页数 P」；到 `/sermons/worship-praise` 确认只进了敬拜赞美类视频。
7. 选「全部」再同步一次 → 各分类视频按学习/兜底规则分流到对应 tab。
8. 停用频道 → enabled 变灰；确认 `syncAllChannels`（cron 路径）会跳过停用频道（可临时把 cron 改 `* * * * *` 本地触发，或直接调 `/api/admin/sync-channels/:id/sync` 单测）。

- [ ] **Step 5: 应用远程 migration（部署前）**

Run: `npm run d1:migrate:remote`
Expected: `0011_add_sync_channels.sql` 已应用到远程 D1。

> 说明：运行时 `ensureSyncChannelsTable` 已能在表缺失时兜底建表，但仍应应用 migration 保持 schema 一致。

---

## 自检（写计划者已核对）

- **Spec 覆盖**：① 设置按钮（Task 8）② 多频道 channelId+apiKey（Task 2/4/6/8）③ 同步菜单 6 项（Task 8 + `matchesTarget` Task 1）④ 按对应逻辑过滤（Task 3 + Task 1）⑤ 自学习分类（Task 1 + `buildClassifierFromDb` Task 3）⑥ 每 4 小时同步所有频道（Task 5）⑦ api_key 掩码（Task 2 `syncChannelRowToAdmin` + Task 4 哨兵值）。均有对应 Task。
- **占位符**：已消除；Task 8 内的 typo 已在 Step 1 末尾明确修正写法。
- **类型一致性**：`SyncTarget`/`ClassifierModel`/`TrainingRow` 在 classifier 模块定义并被 server/api 引用；`matchesTarget(entryType, category, target)` 参数顺序在 Task 1 定义、Task 3 调用一致；`syncChannelUploads(env, { channel, target, model })` 签名 Task 3 定义、Task 4 调用一致；`SyncChannelRow`/`syncChannelRowToAdmin` Task 2 定义、Task 4 使用一致。
