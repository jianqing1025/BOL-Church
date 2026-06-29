# 直播在线总人数、探测稳定性与历史直播统计 — 设计

日期: 2026-06-28
状态: 已批准设计，待写实现计划

## 背景与目标

针对在线直播的三项改动:

1. **总在线人数 (#1)**: 聊天窗口的计数从"实时并发"改为带累计语义。
   - 网站侧:每个新 session 算一人;同一浏览器(同一 `session_id`)只算一次;不同浏览器算不同人;**累加整场直播的历史人数**(不随离开而减少)。
   - YouTube 侧:取整场直播 `concurrentViewers` 的**峰值**(Data API 无法提供累计唯一观看人数,API key 只有并发与 VOD 播放数)。
   - **总在线 = 网站累计唯一 + YouTube 峰值**。

2. **探测稳定性 (#2)**: 直播过程中网站经常短暂"断掉"并重置开始时间,而 YouTube 并未中断。根因已定位,需修复。

3. **历史直播统计 (#3)**: 历史直播卡片增加两个数据:
   - `online`: 归档当时的"总在线人数"快照(网站累计 + YouTube 峰值)。
   - `views`: YouTube 播放数(复用既有 `view_count`,可由后台"刷新元数据"刷新)。

## #2 根因(已确认)

探测用 `search.list?eventType=live`([server.ts `probeYouTubeLive`](../../../Church/server.ts))。YouTube 该接口索引最终一致且重度缓存,**直播进行中也会间歇性返回空**。

[`runProbeIfDue`](../../../Church/server.ts) 中单次空结果即触发误判:
1. `result.videoId = null` → `justEnded = prev.is_live===1 && !result.videoId` 为 true。
2. 写状态 `is_live=0`,且因 `result.videoId` 为空将 `started_at` 设为 `null`。
3. 前端 `is_live=0` → 直播徽章消失(用户看到的"断掉")。
4. 归档检查发现 `liveBroadcastContent==='live'` → 未真归档,但 `started_at` 已被清空。
5. 下次探测 search.list 重新返回该视频 → `is_live=1`,但 `prev.started_at` 已是 null → `startedAt=Date.now()` → **开始时间重置**。

一句话:单次 `search.list` 空结果被立刻当成"直播结束",既让直播短暂消失,又清空 `started_at`,导致重现时计时归零;5 分钟探测间隔放大了可见时长。

## 架构决策:计数持久化(Approach A)

`live_viewers` 行在不活跃 5 分钟后被 [`cleanupLiveData`](../../../Church/server.ts) 删除,无法据此求"累计唯一"或对重连浏览器去重。

采用**追加式 seen 表**:
- 新表 `live_session_seen(video_id, session_id, PRIMARY KEY(video_id, session_id))`,每次 join 做 `INSERT OR IGNORE`。
- 网站累计唯一 = `COUNT(*) WHERE video_id=?`;主键天然对同一浏览器(同一 `session_id`)去重,且不受 viewer 清理影响,也不受 #2 状态抖动影响(以 `video_id` 为键)。
- YouTube 峰值存为 `live_stream_state` 新列,每次探测取 `MAX(prev, current)`。

(备选 B:对当前直播不清理 `live_viewers`,以 COUNT(*) 求累计、以 last_ping 求并发;否决,因其在单表上混叠两种语义、需改清理与观众列表查询,易出错。)

## 数据模型(新迁移 0013)

```sql
-- 整场直播的 join 去重日志(网站累计唯一)
CREATE TABLE IF NOT EXISTS live_session_seen (
  video_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (video_id, session_id)
);

-- 当前直播的 YouTube 并发峰值
ALTER TABLE live_stream_state ADD COLUMN youtube_peak INTEGER;

-- 归档当时的总在线人数快照(网站累计 + YouTube 峰值)
ALTER TABLE sermons ADD COLUMN live_online_total INTEGER;
```

`views` 复用既有 `sermons.view_count`(迁移 0008 已有),不新增列。

运行时表用 `ensure*` 兜底的现有约定也要覆盖 `live_session_seen` 与新列,避免迁移未应用时端点崩溃。

## 组件与数据流

### A. 计数(#1) — server

- `joinViewer`: 在现有逻辑基础上,加 `INSERT OR IGNORE INTO live_session_seen(video_id, session_id, joined_at)`。
- `buildPublicLiveStreamState`: 新增三个返回字段:
  - `websiteTotal` = `COUNT(*)` of `live_session_seen` for active video。
  - `youtubePeak` = `state.youtube_peak`(无则 0/null)。
  - `totalOnline` = `websiteTotal + (youtubePeak ?? 0)`。
  - 既有 `viewersOnline`(并发)与 `viewerList` 保留不变 —— 观众列表与其"在线"标题仍显示当前在场者。
- `runProbeIfDue`: 取 `concurrentViewers` 时,`youtube_peak = MAX(existing, current)`;当首次检测到**新的 `video_id`** 时把 `youtube_peak` 重置为 0。

### B. UI(#1) — [LiveStreamSection.tsx](../../../Church/components/LiveStreamSection.tsx)

- 计数栏第 1 格 👥 网站 → `websiteTotal`(累计)。
- 计数栏第 2 格 📺 YouTube → `youtubePeak`(峰值)。
- 聊天折叠条右侧(原显示 `viewersOnline 在线`)→ `总在线 {totalOnline}`。
- 需要新的 i18n 文案(沿用 `translations.ts` 既有 key 风格):如 `liveChat.countLabelTotal`(总在线)。网站/YouTube 标签可复用既有 `countLabelSite`/"YouTube"。

### C. #2 修复 — server `runProbeIfDue` / 探测

- `probeYouTubeLive` 返回空时不再直接判定结束。当空结果但 `prev.is_live && prev.video_id`:
  调用 `videos.list?part=liveStreamingDetails&id=prev.video_id`,仅当返回 `actualEndTime` 存在才判定**真结束**(进入归档流程);否则视为瞬时漏检 → 保持 `is_live=1`、**保留 `started_at`**、保留 `video_id`、刷新 `checked_at`。
- `started_at` 仅在**首次检测到新 video** 时设置,瞬时漏检绝不清空。
- 复用/扩展现有 `liveStreamingDetails` 抓取(`fetchYouTubeConcurrentViewers` 同一端点)以同时取 `actualEndTime`,避免额外往返。

### D. 归档(#3) — [tryArchiveAndNotify](../../../Church/server.ts)

- 归档时(新建插入与"认领既有行"两条路径都要):
  - 计算 `live_online_total = COUNT(live_session_seen for video) + (state.youtube_peak ?? 0)`。
  - 抓取 `statistics.viewCount` 写入 `view_count`。
  - 把上述写入新建/既有 sermon 行。
- 归档完成后删除该 `video_id` 的 `live_session_seen` 行;`cleanupLiveData` 也按保留期清理陈旧 seen 行。

### E. 历史卡片(#3) — [LiveStreamSection renderPastBroadcasts](../../../Church/components/LiveStreamSection.tsx)

- 每张卡显示两个小统计:👥 online(`live_online_total`)与 ▶ views(`viewCount`);值为空时不显示该项。
- `Sermon.viewCount` 与 `mapSermon` 已映射 `view_count`(确认见 data.ts:18、server.ts:447),**仅需在卡片上显示**,无需新增管道。
- 唯一新增映射字段:`liveOnlineTotal`(server `SermonRow` + `mapSermon` 加 `live_online_total → liveOnlineTotal`;`data.ts` `Sermon` 类型补字段)。

## 错误处理

- 所有新表/新列经 `ensure*` 兜底;新 SQL 包裹在既有 try/catch,失败不阻断 cron / 公共状态构建。
- `youtube_peak`、`live_online_total`、`view_count` 可为 null;UI 与累加均按缺省 0 处理。

## 测试

- 纯函数单测(vitest,沿用 `sync/classifier.test.ts` 风格):
  - 峰值更新 `peak = max(prev, current)`。
  - 总数 `totalOnline = websiteTotal + (youtubePeak ?? 0)`。
  - 结束判定:`search.list` 空 + 无 `actualEndTime` → 不结束;有 `actualEndTime` → 结束。
  - 为此把这些判定抽成不依赖 D1 的纯函数。
- D1/SQL 路径(seen 去重 COUNT、归档快照)用 `node:sqlite` 离线校验,方式同 0012 迁移验证。

## 超出范围(YAGNI)

- 不接入 OAuth / YouTube Analytics(真实 YouTube 累计唯一观看)。
- 不改既有并发观众列表与心跳机制。
- 不改 unlisted 自动化(另议)。
