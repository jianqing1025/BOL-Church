# 主日直播入口页 + 影院式房间 — 设计文档

日期：2026-07-10
状态：已确认（用户口令执行；要求所有中文文案用繁體）

## 目标

直播页转为「入口页」（不再站内嵌直播/回放视频），房间成为唯一观看场所；
房间重设计为影院式（全屏视频、自动显隐 chrome、互斥右侧抽屉、手机横屏）。

## 已确认的决策

| 决策点 | 结论 |
| --- | --- |
| 页面三状态 | 统一一张状态卡：等待（置灰進入直播）/ 回放窗口（查看回放）/ 直播中（红色進入直播）；右侧都带刷新按钮 |
| 回放窗口 | `status==='replay'` 且教会时区（America/Los_Angeles）当前**不是周六**；周六 00:00 起切回等待态；前端每分钟自查 |
| 页面嵌视频 | 直播、回放、历史直播都不再站内嵌——点历史直播卡片同样进影院式房间（replay 模式、播该期视频、聊天为该场存档只读，不受当前流状态影响） |
| 身份/心跳 | 不再进页自动弹姓名框；点「進入直播」才弹（管理员仍自动身份）；liveJoin/livePing 仅在直播房间打开期间运行（在线人数=进房人数） |
| 回放进房 | 不需要身份（无发言/名单）；聊天面板显示该场次历史、输入禁用（enabled=false） |
| 房间布局 | 桌面与手机统一影院式：视频铺满、右侧抽屉宽 20%（min 200px）深色半透明 |
| 底部控制 | 三个圆钮：在线列表（Users）/ 聊天（MessageCircle）/ 挂断（PhoneOff 红色=退房）；回放模式无在线列表 |
| 抽屉互斥 | 名单与聊天只能开一个，点另一个则替换；再点当前项收起 |
| 自动显隐 | 进房 4s 后 header+控制条隐藏；点屏幕唤出（header：信望愛在線直播 + 徽章 + 在线数）；抽屉开着时常显；chrome 隐藏时用透明层接管点击（可见时不遮挡 YouTube 控件） |
| 手机横屏 | 进房尝试 requestFullscreen + orientation.lock('landscape')；失败（iOS）时触屏设备竖屏用 CSS rotate(90deg) fallback；退房解锁+退全屏 |
| 边界 | 看回放中 status→live：房间原地切直播模式；直播中途结束：自动退房，页面卡变「查看回放」 |

## 纯逻辑（Church/live/liveRoom.ts 扩展）

- `pageCtaState(status, videoId, now)` → `'enter-live' | 'watch-replay' | 'waiting'`
- `isReplayWindowOpen(now, timeZone='America/Los_Angeles')` — Intl 取星期，非 Sat 为 true
- `shouldCloseLiveRoom(roomOpen, cta)` 改签名：cta==='waiting' 才关房
- 移除已无消费者的 `liveRoomButtonState`（被 pageCtaState 取代），测试同步更新

## 文件

| 文件 | 动作 |
| --- | --- |
| `Church/live/liveRoom.ts` + `.test.ts` | 扩展/改签名（TDD） |
| `Church/constants/translations.ts` | 新增 watchReplay / roomBrand / replayUntil / liveInProgress（zh 繁體） |
| `Church/components/LiveStatusCard.tsx` | 新建：三态状态卡（倒计时/按钮组/刷新） |
| `Church/components/LiveRoomView.tsx` | 重写：影院式 |
| `Church/components/LiveStreamSection.tsx` | 精简：删三分支布局与页面嵌播放器，接状态卡与新房间 |

## 文案（zh 全繁體）

- `liveChat.watchReplay` — 查看回放 / Watch Replay
- `liveChat.roomBrand` — 信望愛在線直播 / Faith Hope Love Live
- `liveChat.replayUntil` — 上次直播回放可觀看至週五午夜 / Replay available until Friday midnight
- `liveChat.liveInProgress` — 直播進行中 / Live now

## 测试

- 纯逻辑 vitest：isReplayWindowOpen 周六边界（LA 时区，含 UTC 跨日）、pageCtaState 全组合、shouldCloseLiveRoom 新签名
- 横屏/全屏/自动显隐/抽屉为浏览器行为：手动验收
