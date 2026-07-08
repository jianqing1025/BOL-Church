# 主日直播「进入直播」房间 — 设计文档

日期：2026-07-08
状态：已确认（方案 A）

## 目标

在主日直播页（/live）增加一个「进入直播」按钮，点击后进入全屏直播房间：
左侧最大区域播放 YouTube 直播，右侧是参会人名单 + 直播聊天，
观感与小组查经会议室（MeetingRoomView）一致，但不接音视频。

## 已确认的决策

| 决策点 | 结论 |
| --- | --- |
| 身份验证 | 输入姓名即可（复用直播页 LiveJoinModal 身份），不需要教会密码 |
| 参会人音视频 | 不发布音视频、不接 LiveKit；右侧仅显示在线名单 |
| 按钮显示时机 | 离线时显示但置灰（刷新按钮前）；直播中在红色 LIVE 提示条右侧显示可点按钮；回放状态不显示 |
| 房间内聊天 | 右侧栏 = 参会人名单（上）+ 直播聊天（下），复用 LiveChatPanel，与页面外同一聊天流 |
| 实现方式 | 方案 A：LiveStreamSection 内的全屏覆盖层（fixed inset-0 z-50），零后端、零路由改动 |

## 不做的事（YAGNI）

- 不新增后端 API、不改 meetingApi / LiveKit token 流程
- 不新增路由（房间没有独立 URL）
- 不做麦克风/摄像头/屏幕共享
- 不改会议室（小组查经）任何行为

## 架构

全部改动集中在前端 `Church/`：

```
LiveStreamSection (已有：状态轮询、身份、心跳、聊天流)
├─ 离线提示条：＋「进入直播」置灰按钮（刷新按钮前）
├─ LIVE 提示条：＋「进入直播」可点按钮（右侧）
└─ roomOpen state → 渲染 <LiveRoomView>（全屏覆盖层）
       ├─ 顶栏：← 返回 ｜ 主日直播 + 🔴 LIVE + 开播时间 ｜ 👥 在线数
       ├─ 主区域：<LivePlayer videoId={state.videoId}>（黑底铺满）
       └─ 右侧栏（~320px）：<LiveViewerList>（1/6）＋ <LiveChatPanel>（5/6）
```

### 新组件 `Church/components/LiveRoomView.tsx`

Props（全部由 LiveStreamSection 传入，本身无数据获取逻辑）：

- `state: LiveStreamPublicState` — videoId、startedAt、websiteTotal、viewerList
- `identity: { sessionId, displayName } ` — 聊天与名单高亮用
- `isAdmin: boolean` — 传给 LiveChatPanel
- `onLeave: () => void` — 返回直播页

样式仿 MeetingRoomView：`bg-gray-950` 深色全屏、顶栏 `border-b border-white/10 bg-gray-900/80`。
右侧栏内的 LiveViewerList / LiveChatPanel 保持原有浅色样式，装在白底卡片容器里（组件原样复用，不做深色改造）。

### LiveStreamSection 改动

- 新增 `roomOpen` state；`isLive && roomOpen && identity` 时渲染覆盖层。
- 离线提示条：刷新按钮前插入置灰按钮，`disabled`，title=「直播开始后可进入」。
- LIVE 提示条：右侧（`ml-auto`）插入红色实心「进入直播」按钮。
- 房间打开期间锁定 body 滚动（`overflow:hidden`，卸载时恢复）。
- 轮询/心跳不动 —— LiveStreamSection 保持挂载，覆盖层只是它渲染的一部分。

## 行为细节

- **进房**：直播中用户通常已有身份（LiveJoinModal 已弹过 / 管理员自动 join），点击直接进房。
  兜底：若点击时 `identity` 仍为空（如管理员自动 join 失败），先弹 LiveJoinModal，完成后再进房。
- **直播中途结束**：轮询发现 `status !== 'live'` 时，若房间开着 → 自动关闭房间回到直播页；
  页面切到 replay/offline 布局后自带「回放/下次直播」提示条，房间内不另做提示。
- **移动端**：上下堆叠 — YouTube 在上（aspect-video），参会人 + 聊天在下占剩余高度。
- **回放中选看历史直播**（selectedPastBroadcast）：与房间无关，房间始终播 `state.videoId`。

## 文案（translations.ts 新增，中英双语）

- `liveChat.enterRoom` — 进入直播 / Enter Live Room
- `liveChat.enterRoomOffline` — 直播开始后可进入 / Available when the stream is live
- `liveChat.leaveRoom` — 返回 / Back

## 测试

- 单元测试（vitest）：按钮状态逻辑（离线置灰 / 直播可点 / 回放不显示）、直播结束自动退房。
- 布局与滚动锁定：手动在桌面与移动宽度下验证。

## 错误处理

- `state.videoId` 缺失时按钮不可点（isLive 已含此判断）。
- 聊天/名单接口出错沿用现有组件内部的静默处理，不新增错误路径。
