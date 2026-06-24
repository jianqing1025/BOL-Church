# 多频道 YouTube 同步 + 自学习分类 — 设计文档

日期：2026-06-24
状态：已与用户确认设计，待写实施计划

## 背景与目标

现状：系统已有**单频道**的 YouTube uploads 同步（`syncChannelUploads`），它从 `live_stream_config`（直播功能共用）读取唯一的 `channel_id` + `api_key`，按 entryType（sermon / daily-manna）过滤并用硬编码关键词（`inferCategoryFromTitle`）自动归类，由每日 cron `"0 14 * * *"` 触发，并在后台 `SermonManager` 有一个手动同步按钮。

目标：

1. 在「主日信息」（Sermons）二级导航右侧加一个**设置按钮**（仅管理员可见），用于管理**多个** YouTube 频道（每个频道独立的 channel ID + API key）。
2. 每个频道后面有一个**同步菜单**，可选「全部 / 主日信息 / 敬拜赞美 / 医治祷告 / 见证分享 / 每日天言」，点击按对应分类同步该频道视频。
3. 分类逻辑升级为**自学习**：从现有各分类已有视频的标题提取关键词，归类未来视频；硬编码关键词作为兜底。
4. 自动同步频率改为**每 4 小时**，从所有启用频道各同步一次。

## 关键决策（已与用户确认）

| 决策点 | 选择 |
|---|---|
| 同步菜单点分类的语义 | 按标题关键词**过滤**：只导入标题归类命中该分类的视频 |
| 多频道与现有单频道配置 | **新增独立** `sync_channels` 表；`live_stream_config` 完全不动，直播功能不受影响 |
| 4 小时 cron 与现有每日 cron | **替换**每日 cron 为 `"0 */4 * * *"`，遍历所有启用频道同步全部分类 |
| 同步菜单选项 | **全部** + 5 个分类（共 6 项） |
| 学习关键词 vs 硬编码 | **学习为主，硬编码兜底** |
| 关键词模型生成时机 | **每次同步现算**（不缓存） |

## 非目标 / YAGNI

- 不改动现有 `live_stream_config` 与直播探测逻辑。
- 不引入外部 API / 机器学习库；分类器在 Worker 内用纯 TS 实现。
- 不做关键词模型的持久化缓存（每次同步现算）。
- `live-broadcast` 分类不进同步菜单（属直播功能内部使用）。

## 方案

采用「参数化重构现有同步核心」：把单频道、按 entryType 过滤的同步泛化为多频道、按完整分类过滤；cron 遍历所有频道。复用现有「最新在前、遇到第一条已存在视频即停」的快扫优化、去重逻辑和通知邮件。

被否方案：
- 只在前端做分类过滤 — 做不到「点敬拜赞美只导入敬拜赞美」，且重复抓取浪费配额。
- 每频道固定绑一个分类 — 不符合「每频道一个 6 选 1 菜单」的要求。

## 详细设计

### 1. 数据存储

新增 migration `Church/migrations/0011_add_sync_channels.sql`：

```sql
CREATE TABLE IF NOT EXISTS sync_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,            -- 显示名，如 "Andy Yu 主频道"
  channel_id TEXT NOT NULL,      -- UC 开头的频道 ID
  api_key TEXT NOT NULL,         -- 每个频道独立的 API key
  enabled INTEGER NOT NULL DEFAULT 1,  -- 是否纳入 4 小时自动同步
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- `live_stream_config`（单频道、直播检测用）完全不动，两套独立。
- `channel_id` 必须 UC 开头（沿用现有 `getUploadsPlaylistId` 推断 uploads playlist 的约束）；非 UC 的在新增/测试时报错。
- api_key 返回给前端时掩码（沿用现有 `UNCHANGED_API_KEY` 哨兵值模式，避免明文回传）。

### 2. 后端同步逻辑

**2.1 分类过滤泛化。** 引入：

```ts
type SyncTarget = 'all' | 'sunday-worship' | 'worship-praise'
                | 'healing-prayer' | 'testimony' | 'daily-manna';
```

每页构造 meta 时算出每条视频归类：`inferEntryTypeFromTitle` → sermon / daily-manna；若 sermon，再走分类器（见 2.4）得到 4 个 sermon 分类之一。按 target 过滤：

- `all` → 全收。
- `daily-manna` → 只收 entryType 为 daily-manna。
- 其它 → 只收 entryType 为 sermon 且分类命中 target。

`live-broadcast` 不参与菜单，分类器也不会把同步进来的视频判成 live-broadcast（它仅由直播功能写入）。

**2.2 函数签名改为接收频道。** `syncChannelUploads(env, { channel, target })`，`channel = {channelId, apiKey}`，不再从 `live_stream_config` 读。保留「最新在前、遇到第一条 DB 已存在视频即停止整次扫描」的快扫优化——过滤在 meta 阶段做，「已存在判断」只针对过滤后的集合，按分类增量同步依然成立。

**2.3 多频道汇总。** 新增 `syncAllChannels(env, { target })`：读 `sync_channels` 中 `enabled=1` 的频道，逐个调 `syncChannelUploads`，把各自 `SyncResult` 累加成总结果（保留每频道明细，供通知邮件和前端展示）。跨频道去重天然成立（按 `youtube_id` 查 sermons / daily_manna 表）。

**2.4 自学习分类器** `buildCategoryClassifier(env)`，每次同步任务开始跑一次，整次同步复用同一模型：

1. 取训练数据：`SELECT title_zh, title_en, category FROM sermons WHERE hidden=0`，加 `daily_manna` 标题（视作 `daily-manna` 类）。
2. 归一化标题：去掉开头 `YYYY-MM-DD ` 日期前缀、URL、讲员名（`Pastor Andy Yu` / `余大器 牧師`）。
3. 抽词：中文取相邻二字 bigram，英文取小写单词（长度 ≥ 3）。
4. 算特征度：每个词在各分类的出现次数 → 某词在某类占比 ≥ 阈值且类内出现 ≥ 2 次才算该类特征词；跨类高频通用词降权。
5. 产出 `Map<category, Map<keyword, weight>>`。

归类一条新视频：先 `inferEntryTypeFromTitle` 区分 sermon / daily-manna（这层保持硬编码，每日天言特征稳定）；若 sermon，用学习模型对 4 个分类打分取最高；打不出（无命中或并列）→ 回退现有 `inferCategoryFromTitle` 硬编码。

反馈闭环：后台人工把某条信息移到别的分类后，下次同步重算模型即自动学进去。

### 3. API 端点 + Cron

频道管理（admin，`contributor` 权限，沿用 `requireUser`）：

| 方法 & 路径 | 作用 |
|---|---|
| `GET /api/admin/sync-channels` | 列出所有频道（api_key 掩码） |
| `POST /api/admin/sync-channels` | 新增 `{name, channelId, apiKey}` |
| `PUT /api/admin/sync-channels/:id` | 改名 / 改 key / 启用停用（api_key 传哨兵值表示不变） |
| `DELETE /api/admin/sync-channels/:id` | 删除 |
| `POST /api/admin/sync-channels/:id/test` | 用 `channels.list` 验证 key+channelId，返回频道名 |
| `POST /api/admin/sync-channels/:id/sync?target=<target>` | 同步单频道某 target（6 选 1），返回 `SyncResult` |

- 现有 `/sermon-sync-youtube` 端点**保留**，内部改走新逻辑（对第一个启用频道执行），避免破坏现有 `SermonManager` 按钮。

Cron（`wrangler.toml`）：`"0 14 * * *"` → `"0 */4 * * *"`；`scheduled()` 对应分支改调 `syncAllChannels(env, { target: 'all' })`，跑完发汇总通知邮件（`sendUploadsSyncNotification` 扩展为多频道汇总）。直播探测 cron 不动。

### 4. 前端 UI

**设置按钮**：在 `Church/components/SermonsSecondaryNav.tsx` 右侧加齿轮 ⚙ 按钮，仅当 `isAdminMode`（`useAdmin()`）时显示。nav 保持居中，齿轮靠右定位，不影响 tab 居中布局。

**新组件 `Church/components/ChannelSyncManager.tsx`**（点齿轮弹出的 modal）：

- 频道列表，每行：名称、channel_id、启用状态、掩码 key、`[测试] [编辑] [删除]`、`[同步 ▾]`。
- `[同步 ▾]` 下拉：全部 / 主日信息 / 敬拜赞美 / 医治祷告 / 见证分享 / 每日天言；点某项 → 调 `POST .../:id/sync?target=…` → 行内展示该次 `SyncResult`（新增 / 跳过 / 错误）。
- `[+ 添加频道]` / 编辑用小表单（name / channelId / apiKey）；api_key 输入框 placeholder 显示掩码，留空表示不改。

配套：
- `Church/api.ts` 加方法（list / create / update / delete / test / sync channels）。
- `Church/constants/translations.ts` 加中英文案。
- 同步成功后调一次 bootstrap 刷新（沿用 `SermonManager.handleSyncYoutube` 的刷新套路），列表自动更新。

## 测试策略

- 分类器单元测试：用现有各分类的代表性标题断言归类正确；空数据 / 单类数据时回退硬编码。
- 同步过滤单元测试：给定一页混合标题 + target，断言只导入命中分类的视频，且遇已存在即停。
- 频道 CRUD：新增 / 改 key（哨兵值不变）/ 停用后不参与 `syncAllChannels`。
- 端到端冒烟：mock YouTube playlistItems 响应，跑 `syncChannelUploads`，断言 D1 插入与去重。

## 风险与缓解

- **配额**：每频道每次同步走 playlistItems + videos 子请求；4 小时一次 × 频道数。快扫「遇已存在即停」把日常增量成本压到很低。新增频道首次回填可能多页，受 `MAX_PAGES=5` 保护。
- **分类器误判**：学习为主 + 硬编码兜底；管理员可在后台手动移动分类，形成反馈闭环。
- **api_key 泄露**：列表与回传一律掩码，沿用 `UNCHANGED_API_KEY` 哨兵值，前端永不拿到明文。
