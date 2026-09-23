# Church 線上查經：舉手功能與控制列重排

日期：2026-09-22

## 背景

線上查經目前沒有舉手功能。帶領的人要知道誰想發言，只能靠聲音搶話或聊天室打字，人一多就亂。

同時控制列已經塞到九顆按鈕（麥克風、鏡頭、分享螢幕、聊天、在線成員、聖經、播影片、版面切換、掛斷），手機上會換行成兩排，佔掉本來就不夠的垂直空間。

兩件事必須一起做：舉手是第十顆按鈕，硬加進去只會讓排版更糟。

## 目標

1. 舉手是一個**有先後順序的發言隊列**，帶領的人看得出誰先舉的。
2. 舉手的人**不必翻頁就會被看到**——相簿模式一頁最多只放 6～16 人，第二頁的手不能石沉大海。
3. 控制列收斂成**單排七顆**，其餘收進「⋯ 更多」。

## 關鍵決定：舉手狀態放在 LiveKit，不走聊天室

這個專案有兩套彼此不認識的身分：

| | 來源 | 識別碼 | 用在哪 |
| --- | --- | --- | --- |
| LiveKit participant | `/api/meeting/livekit-token` | `${名字}-${8碼亂數}` | 視訊方格、音訊、版面 |
| presence user | ChatRoom Durable Object | `crypto.randomUUID()` | 在線成員列表、Host 命令 |

兩邊**沒有共同的識別碼**，唯一重疊的只有名字。舉手要畫在方格上、要決定方格的排序，那是 LiveKit 的地盤；若讓舉手狀態走聊天室的 WebSocket，就得靠名字比對把 presence user 對到 LiveKit participant，同名的兩個人立刻壞掉。

因此：**舉手狀態存成 LiveKit participant attributes**，ChatRoom Durable Object 與 [chatProtocol.ts](../../../Church/meeting/chatProtocol.ts) 完全不動。

附帶好處：

- attributes 是**同步狀態而非事件**，晚進房的人自動看到已經舉著的手，斷線重連也自動恢復。
- 參與者離開時 attributes 隨之消失，手自動放下，不會留下幽靈。

代價：LiveKit 的 token 授權需要加上 `canUpdateOwnMetadata`（見下）。

## 資料模型

LiveKit participant attribute：

| Key | 值 | 意義 |
| --- | --- | --- |
| `hand` | `String(Date.now())` | 舉手當下的毫秒時間戳 |
| `hand` | `''`（空字串）| 沒有舉手 |

排序依時間戳由小到大，編號 1、2、3 由前端即時算出，伺服器不維護任何隊列。

**時鐘偏差**：時間戳取自舉手者自己的裝置。手機與電腦都有 NTP 校時，實務誤差在一秒內，對查經場景足夠。不為此引進伺服器時間。

## 元件與改動

### 1. `Church/meeting/livekitToken.ts`

授權加一行：

```ts
video: {
  room: p.roomName,
  roomJoin: true,
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
  canUpdateOwnMetadata: true,  // 舉手狀態寫在 participant attributes 上
},
```

沒有這個授權，`setAttributes()` 會被伺服器拒絕。

### 2. `Church/meeting/raisedHands.ts`（新檔，純函式）

不依賴 React 或瀏覽器 API，全部可單元測試。

```ts
/** 這位參與者舉手的時間，沒舉手則為 null。 */
export function handRaisedAt(participant: Participant): number | null;

/** 舉手的人依舉手先後排到最前，其餘維持原順序。 */
export function orderByRaisedHand(participants: Participant[]): Participant[];

/** 目前舉著手的人數。 */
export function raisedHandCount(participants: Participant[]): number;
```

`handRaisedAt` 要能擋住髒資料：非數字、負數、空字串都視為沒舉手。

### 3. `Church/services/livekitService.ts`

新增三個方法，與既有的 `toggleMic` / `toggleCamera` 同一風格：

```ts
/** 舉手或放下，回傳切換後的狀態。 */
async toggleHand(): Promise<boolean>;

/** Host 放下某人的手：廣播給全房間，目標端自己清掉。 */
async lowerHandOf(identity: string): Promise<void>;

/** Host 放下所有人的手。 */
async lowerAllHands(): Promise<void>;
```

`lowerHandOf` 走 LiveKit 的 reliable data message，payload `{ type: 'lowerHand', target: identity }`（`target: '*'` 代表全部）。收到的客戶端比對 `target` 是不是自己的 identity，是的話就把自己的 `hand` 設成空字串。

`connect()` 的事件註冊加上：

- `RoomEvent.ParticipantAttributesChanged` → `this.emit()`
- `RoomEvent.DataReceived` → 解析 `lowerHand`，若指向自己就放下

### 4. `Church/hooks/useLiveKit.ts`

新增 `handRaised: boolean`、`toggleHand()`、`lowerHandOf(identity)`、`lowerAllHands()`，比照現有 `micOn` / `toggleMic` 的寫法。

### 5. 版面：`VideoStage` / `GalleryView` / `SpeakerView` / `ScreenShareView`

`VideoStage` 把 `orderByRaisedHand()` 套在傳給三種版面的參與者清單上。

**主畫面不受影響**：演講者模式放大的仍然是正在說話的人，分享畫面時主畫面仍然是螢幕。舉手只改變**縮圖與格子的順序**，不搶主畫面——那是兩回事。

| 版面 | 重排的對象 |
| --- | --- |
| 相簿 | 全部格子（第一頁因此永遠是舉手的人）|
| 演講者 | 底下的縮圖列 |
| 分享畫面 | 側邊／底部的縮圖列 |

### 6. `Church/components/meeting/ParticipantTile.tsx`

新增兩個 prop：

- `handOrder?: number` — 有值時在右上角畫黃色圓形徽章顯示編號，外框改黃色
- `onLowerHand?: () => void` — 有值時徽章可點，`aria-label` 是「放下 ⟨名字⟩ 的手」

黃色外框與現有藍色的「正在說話」外框互斥，同時發生時**正在說話優先**——那是當下更要緊的資訊。

### 7. `Church/components/meeting/MeetingControlBar.tsx`

單排七顆，順序固定：

```
靜音   視訊   舉手  ｜  聖經   播影片   ⋯   掛斷
```

「⋯ 更多」展開為帶中文字的選單（不是純圖示）：

| 項目 | 條件 |
| --- | --- |
| 分享螢幕 | `hasVideo` |
| 聊天（帶未讀數）| `hasVideo` |
| 在線成員 | 總是 |
| 切換為演講者檢視／切換為相簿檢視 | `showViewToggle`（有人分享畫面時隱藏）|
| 放下所有人的手 | `isHost` 且目前有人舉手 |

「⋯」按鈕本身承接選單內所有徽章的總和（目前僅聊天未讀數），否則藏起來的未讀訊息沒有人會發現。

上表的規則抽成純函式 `overflowItems(...)`，與控制列元件放在同一個檔案並具名匯出，讓「⋯ 裡該有哪幾項」可以直接單元測試。

選單關閉：點選單外、按 Esc、選完任一項後自動關閉。`aria-haspopup="menu"`、`aria-expanded`。

`hasVideo: false` 的分支保留（目前四間房都是 `true`，但程式碼有這條路）：那時只有聖經、在線成員、掛斷。

### 8. `Church/constants/translations.ts`

新增 `meeting.*` 詞條，**一律繁體**：

| Key | zh | en |
| --- | --- | --- |
| `raiseHand` | 舉手 | Raise hand |
| `lowerHand` | 放下手 | Lower hand |
| `lowerHandOf` | 放下 {name} 的手 | Lower {name}'s hand |
| `lowerAllHands` | 放下所有人的手 | Lower all hands |
| `more` | 更多 | More |
| `viewSpeakerLong` | 切換為演講者檢視 | Switch to speaker view |
| `viewGalleryLong` | 切換為相簿檢視 | Switch to gallery view |

## 信任模型

Host 是在房間卡片上自我宣告的角色，不是安全邊界——[chatProtocol.ts](../../../Church/meeting/chatProtocol.ts) 既有的註解已經說明這一點。

差別在於：聊天室那條線上的 Host 命令，至少由 Durable Object 驗過 `isHost` 旗標才轉發；**放下手走的 LiveKit data message 沒有任何驗證**，房間裡任何人都能送出。

對一群彼此認識、共同查經的人，這個代價可以接受，換來的是不必在兩套身分之間做名字比對。若日後需要真正的強制力，正確作法是把 Host 角色移到 token 的授權裡，而不是在客戶端加檢查。

## 已知取捨

**舉手的人多到超過一頁時，「我」會被擠到第二頁。** 手機直立一頁只有 6 格，六個人同時舉手就會佔滿。接受：那個當下重要的就是那幾隻手。

**版面會自己動。** 有人舉手時格子重排，正在看某人的時候會有跳動感。這是選擇「自動提到最前」必然的代價，換來的是不必做任何操作就看得到舉手的人。

## 測試

純函式的部分紮實地測（`Church/meeting/raisedHands.test.ts`）：

- `handRaisedAt` 讀得出時間戳；空字串、非數字、負數都回 `null`
- `orderByRaisedHand` 把舉手的排到最前，且依舉手先後
- `orderByRaisedHand` 不更動沒舉手者之間的相對順序
- `orderByRaisedHand` 對沒有人舉手的清單回傳原順序
- `raisedHandCount` 正確計數

控制列的選單項目也抽成純函式測（`overflowItems(...)`）：

- 有人分享畫面時不含「切換檢視」
- 非 Host 不含「放下所有人的手」
- 沒有人舉手時 Host 也不含「放下所有人的手」
- `hasVideo: false` 時只剩在線成員

專案沒有 jsdom，按鈕與選單的互動、方格徽章的外觀靠手動驗收，驗收步驟寫在實作計畫裡。

## 不做

- 舉手提示音
- 頂部常駐提示條（已評估後不採用，自動重排已解決可見性）
- 在線成員列表的舉手排序（presence 與 LiveKit 無共同識別碼）
- 發言計時
