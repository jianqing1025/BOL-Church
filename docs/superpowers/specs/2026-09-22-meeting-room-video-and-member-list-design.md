# Church 線上查經：成員數可點、YouTube 房間同步播放

日期：2026-09-22

## 背景

兩件互不相干但同時提出的改動。

**一、** 頂端那個「👥 12」只是文字，點不動。在線成員清單目前只能從控制列的「⋯」選單進去，而人數就在眼前卻不能點，是最容易被誤認為壞掉的那種介面。

**二、** 「播放影片」目前只能播本機檔案：把 `<video>` 元素 `captureStream()` 之後當成螢幕分享推給房間。查經常要一起看 YouTube 上的講道或詩歌，而 YouTube 走不了這條路。

## YouTube 為什麼不能沿用現有作法

現有作法的前提是拿得到媒體元素。YouTube 播放器是跨網域 iframe，瀏覽器不允許讀取它的畫面或聲音——`captureStream()` 拿不到任何東西，canvas 也畫不出來。

唯一可行的是**每個人的瀏覽器各自嵌入 YouTube 播放器，由帶領者同步大家的進度**（Discord Watch Together、Teleparty 都是如此）。這個作法反而更好：影片不經過 LiveKit，不吃自架伺服器的頻寬也不吃雲端分鐘數，畫質音質都是 YouTube 原生的。

代價是每個人都要連得上 YouTube。**封鎖地區的退路本次不做**，已評估後決定延後。

## 目標

1. 頂端人數可點，開出來的是「⋯」選單裡**同一個**在線成員抽屜。
2. 「播放影片」拆成「本機影片」與「YouTube 影片」兩項，本機影片行為完全不變。
3. 帶領者貼一個 YouTube 網址，全房間一起看，進度同步。

## 誰能帶領

沿用聖經同步已經確立的規則：**Host，或房間裡沒有 Host 時任何人**。`chatRoom.ts` 既有的 `hasHost()` 直接重用，不另立一套權限概念。

## 協定

走聊天室的 WebSocket，與聖經同步同一條線。

```ts
export type RoomVideoMessage =
  | { type: 'video'; action: 'open'; videoId: string; startSeconds?: number }
  | { type: 'video'; action: 'close' }
  | { type: 'video'; action: 'state'; playing: boolean; seconds: number };
```

帶領者在播放、暫停、拖動時送 `state`，播放中另外每三秒送一次心跳。

跟隨者收到後的判斷（純函式 `followRoomVideo`）：

| 情況 | 動作 |
| --- | --- |
| 播放狀態與帶領者不同 | 跟著播放或暫停 |
| 秒數差 > 2 秒 | 跳轉到帶領者的位置 |
| 秒數差 ≤ 2 秒 | 不動 |

**刻意不帶時間戳。** 舉手用各自裝置的時間戳，差幾秒無傷大雅；這裡不行——時鐘偏差會直接變成跳轉誤差，而且會持續發生。WebSocket 延遲只有百毫秒等級，遠小於兩秒的容忍值，所以直接比對秒數、不做延遲補償，比補償更穩。

**跟隨者的進度條不鎖。** 自己拖走之後最多三秒會被心跳拉回。被拉回比被鎖住更好理解，偶爾有人想倒回去看兩秒也無妨。

## 驗證

Durable Object 會把訊息原樣轉發給全房間，所以 `sanitizeRoomVideoMessage` 必須擋在轉發之前，理由與 `sanitizeBibleMessage` 相同——不驗就等於讓任何人把全房間推到任意頁面。

- `videoId` 必須符合 `^[A-Za-z0-9_-]{11}$`
- `seconds` 必須是 0 到 86400 之間的有限數
- `playing` 必須是布林

## 晚到的人

Durable Object 記住 `roomVideo`（`{ videoId, playing, seconds }`），新連線進來時跟著 `biblePosition` 一起補送——這條路已經鋪好。Host 結束聚會時一併清除，與現有 `biblePosition` 的處理一致。

與房間的其他狀態一樣存在記憶體裡，部署會清掉。這是既有的取捨，本次不改。

## 舞台版面

房間影片播放時接管整個舞台，參與者縮到旁邊的縮圖列——與分享畫面同一套視覺語言，使用者不必學第二套。

與分享畫面互斥，沿用既有的「一次只有一個」規則：

- 有人在分享畫面時開 YouTube → 擋下，顯示既有的 `meeting.screenShareBusy`
- Host 搶畫面（`claimShare`）→ 房間影片一併關閉

舞台分支順序為「分享畫面 → 房間影片 → 發言人 → 網格」。兩者理應不會同時存在，萬一同時存在，正在進行的分享畫面優先。

## 自動播放被擋

跟隨者的播放器是被訊息觸發的，不是被點擊觸發的，**iOS Safari 會拒絕帶聲音的自動播放**。

處理：嘗試播放後約 1.2 秒檢查播放器狀態，若房間說在播而本地沒播起來，就蓋一層「點一下開始播放」。使用者點的那一下就是瀏覽器要的手勢。

桌機 Chrome 多半不會看到這層，iPhone 大概每次都會。這是瀏覽器政策，沒有繞路，只能讓它明確而不是變成一個沉默的黑框。

## 控制列

「播放影片」不再直接開檔案選擇器：

| 當下狀態 | 按下去 |
| --- | --- |
| 正在播本機影片 | 停止（維持現狀）|
| 正在播房間影片且可帶領 | 關閉房間影片 |
| 其他 | 彈出兩項選單：本機影片 / YouTube 影片 |

選 YouTube 影片 → 用現有的 `churchPrompt` 要網址 → 解析出影片 ID → 為全房間開啟。解析失敗顯示提示，不送出任何訊息。

「⋯」與「播放影片」兩顆都要彈出選單，所以把點擊外部關閉、Esc 關閉、選完關閉這段邏輯抽成共用的 `PopupMenu`，兩顆共用一份。

## 新增與改動

| 檔案 | 內容 |
| --- | --- |
| `meeting/youtube.ts`（新）| `parseYouTubeVideoId()`、`parseYouTubeStart()`、`followRoomVideo()` |
| `meeting/chatProtocol.ts` | `RoomVideoMessage`、`sanitizeRoomVideoMessage` |
| `meeting/chatRoom.ts` | 轉發、記住狀態、補送晚到者、結束時清除 |
| `hooks/useRoomVideo.ts`（新）| 比照 `useBibleSync` |
| `components/meeting/RoomVideoView.tsx`（新）| YouTube 播放器、縮圖列、點擊播放覆蓋層 |
| `components/meeting/VideoStage.tsx` | 新增房間影片分支 |
| `components/meeting/MeetingControlBar.tsx` | `PopupMenu` 抽出、播放影片改為兩項選單 |
| `components/meeting/MeetingRoomView.tsx` | 頂端人數可點、接線 |
| `constants/translations.ts` | 新增繁體詞條 |

YouTube IFrame API 以 `<script>` 動態載入，用模組層的 promise 確保只載入一次。專案沒有設 CSP，iframe 與腳本可直接載入。不引入 `@types/youtube`，只在 `RoomVideoView` 內宣告用得到的那幾個方法。

## 測試

純函式紮實測（`meeting/youtube.test.ts`）：

- `parseYouTubeVideoId` 吃得下 `watch?v=`、`youtu.be/`、`/shorts/`、`/embed/`、`/live/`、帶 `&t=`、帶播放清單參數、以及直接貼 11 碼 ID
- 非 YouTube 網址與垃圾輸入回 `null`
- `parseYouTubeStart` 讀得出 `t=90`、`t=1m30s`、`start=90`，沒有就回 `undefined`
- `followRoomVideo` 的漂移門檻與播放狀態判斷

`sanitizeRoomVideoMessage` 加進 `chatProtocol.test.ts`：壞 ID、壞秒數、缺欄位都要被擋。

播放器本身、覆蓋層、選單互動沒有 jsdom 可測，列入人工驗收。

## 不做

- 封鎖地區的中繼退路
- 播放清單、自動接續下一部
- 個人進度脫離後「跟回」的按鈕（會被心跳自動拉回，不需要）
- 音量同步（音量是個人的事，與聖經的字級同理）
