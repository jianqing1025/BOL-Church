# Church：聊天訊息的表情回應

日期：2026-09-23

## 背景

會議聊天與主日直播聊天都只能發文字。查經時常見的情境——有人分享一段話，其他人想表示「阿們」或「收到」——目前只能再發一則訊息，把聊天室洗長。

## 兩套聊天，兩種架構

這是整份設計的前提：

| | 會議聊天 | 主日直播聊天 |
| --- | --- | --- |
| 傳輸 | WebSocket 即時推送 | HTTP 每 3 秒輪詢（`POLL_MS = 3000`）|
| 儲存 | ChatRoom Durable Object 記憶體（最近 100 則）| D1 資料表 `live_chat_messages` |
| 每次更新的成本 | 零 | 一次 D1 查詢 |

## 直播聊天的 D1 陷阱

表情回應改的是**舊訊息**，而直播聊天的輪詢用 `since` 游標，只帶回比游標新的訊息——舊訊息上多了一個讚，這個游標永遠帶不回來。

直覺解法是每次輪詢多查一次目前畫面上訊息的統計。代價可以算出來：

| 項目 | 數字 |
| --- | --- |
| 每人每 90 分鐘崇拜的輪詢次數 | 5400 ÷ 3 = 1800 |
| 80 位觀眾 | 144,000 次 |
| 每次多讀約 30 列 | **約 432 萬列** |

而 [D1 用量最小化](2026-09-22-d1-usage-minimization-design.md) 訂的目標是**每日十萬列以內**。2026-09-22 的 1101 停機就是同一種形狀的查詢造成的。照直覺做，一場崇拜會把整日額度打爆四十倍。

## 因此：讀取路徑不碰 D1

D1 只負責**寫入與保存**，統計快照放 KV（專案已有 `SNAPSHOT` KV 綁定），輪詢只讀 KV。

- 寫入時（有人按了表情）才讀一次 D1 重算該場直播的統計，寫進 KV
- 讀取路徑新增的 D1 讀取量：**零**
- 重算的成本由「表情的總數」決定，不由「觀眾人數」決定——後者才是會爆炸的那個維度

## 表情

```
👍  🙏  ❤️  😊  😮
```

不採用 Teams 的 😠。查經與禱告會裡它幾乎沒有用處，而一個沒人需要卻隨時可按的憤怒表情，對這個場合是負擔而不是功能。🙏（阿們）預期會是用得最多的一個。

白名單定義在 `meeting/reactions.ts`，前後端共用同一份。

## 共用的純邏輯（`Church/meeting/reactions.ts`）

```ts
export const REACTION_EMOJI: readonly string[];
export function isReactionEmoji(value: unknown): boolean;

/** 同一人對同一則訊息按同一個表情，第二次是取消。 */
export function toggleReaction(
  current: Record<string, string[]>,
  emoji: string,
  userId: string,
): Record<string, string[]>;

/** 畫面要顯示的膠囊，依白名單順序，空的不顯示。 */
export function reactionSummary(
  reactions: Record<string, string[]> | undefined,
  ownUserId: string | null,
): { emoji: string; count: number; mine: boolean }[];
```

不依賴 React 或瀏覽器 API，全部可單元測試，兩個聊天室共用。

## 會議聊天

**協定**：`ChatMessage` 增加 `reactions?: Record<string, string[]>`（表情 → 按過的 userId 清單）。

```ts
| { type: 'reaction'; messageId: string; emoji: string; users?: string[] }
```

客戶端送出時**不帶 `users`**，那是切換的請求；Durable Object 算完之後廣播同一個型別並補上 `users`，也就是該表情在該訊息上的新狀態。`sanitizeReactionMessage` 會丟掉客戶端自稱的 `users`——理由與房間影片的 `leaderId` 相同：DO 會原樣轉發給全房間，採信客戶端就等於讓任何人偽造全場的狀態。

**驗證**：`emoji` 必須在白名單內，`messageId` 必須存在於歷史中。

**晚到的人**：`reactions` 跟著訊息存在 DO 的 `messages` 裡，隨 welcome 的歷史一起送達，不需要額外路徑。

## 直播聊天

**新資料表**

```sql
CREATE TABLE IF NOT EXISTS live_chat_reactions (
  message_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  emoji      TEXT NOT NULL,
  video_id   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, session_id, emoji)
);
```

`video_id` 是刻意的重複欄位：重算統計時只需掃這一場直播的列，不必回頭 join `live_chat_messages`。

**新端點** `POST /api/live/chat/react`，body `{ videoId, messageId, sessionId, emoji }`
1. 該列存在就刪、不存在就插（切換）
2. 重算這場直播的統計，寫入 KV 鍵 `live-chat-reactions:<videoId>`
3. 回傳新的統計

**既有端點** `GET /api/live/chat` 的回應增加 `reactions`，值直接取自 KV。

KV 存的是 `{ [messageId]: { [emoji]: sessionId[] } }` 而非單純計數——客戶端要據此判斷「這個表情我按過沒有」，只存計數的話重新整理後自己按過的標示就沒了。聊天本來就會定期清除，這份快照不會無限長大。

## 介面（兩邊一致）

- 訊息旁一顆小的笑臉按鈕開啟選單；**手機上改為長按訊息**，因為沒有 hover
- 已有的表情以小膠囊顯示在訊息下方，帶數量；自己按過的用藍框標示
- 點膠囊直接切換，不必再開選單
- 選單依白名單順序排列，五個一排

## 測試

`meeting/reactions.test.ts` 紮實測純函式：

- `toggleReaction` 加入、移除、同一人重複按、不同人各自獨立
- `toggleReaction` 移除最後一人時整個表情鍵要消失，否則畫面會留下數量為零的膠囊
- `toggleReaction` 不修改傳入的物件
- `reactionSummary` 依白名單順序、正確計數、正確標示自己按過的
- `isReactionEmoji` 擋掉白名單外的字串與非字串

`sanitizeReactionMessage` 加進 `chatProtocol.test.ts`：壞表情、壞 id、客戶端自稱的 `users` 都要被擋掉。

介面互動沒有 jsdom 可測，列入人工驗收。

## 不做

- 自訂表情
- 對表情再回應
- 表情的通知
- 把直播聊天搬到 Durable Object——那是對的方向，但應該獨立成一件事，不該搭在一個 UI 功能上偷渡
