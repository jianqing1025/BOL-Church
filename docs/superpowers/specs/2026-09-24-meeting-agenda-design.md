# 線上查經「聚會內容」— 設計

- 日期：2026-09-24
- 專案：Church（線上查經 `/meeting`，網頁與 Windows 桌面版共用）
- 狀態：設計已確認，待實作

## 1. 背景與目標

帶領聚會的 Host 目前要在會議中臨時做每一件事：開聖經找經文、貼 YouTube 連結、找本機影片、分享螢幕給大家看講稿或圖片。準備好的東西散在各處，會議中大家在等。

「聚會內容」讓 Host **會前把本週要講的內容排成一份清單**（文字、圖片、經文、影片），會議中從清單**一鍵分享**給全體。

### 核心原則

- **內容只存在 Host 自己的電腦**：誰編輯誰看得到，不經伺服器、不需要權限設計。其他與會者只會在 Host 按下分享的那一刻，透過既有的同步通道看到那一項。
- **重用既有通道**：經文用聖經同步、YouTube 用房間影片同步、本機影片用影片廣播；只有文字與圖片需要新的「投影片」畫面。

### 不做的事

- 跨裝置同步、匯出匯入（內容存在哪個瀏覽器／App 就只在那裡）。
- 分享時的小工具列（整個螢幕分享時縮小的工具列）不加入聚會內容入口。
- 伺服器端儲存任何聚會內容。

## 2. 名詞

| 名詞 | 意思 |
|---|---|
| 一份內容（agenda） | 一次聚會要講的東西，例如「約翰福音第 3 章（10/7 聯合小組）」 |
| 項目（item） | 清單中的一項：文字、圖片、經文、YouTube、本機影片 |
| 分享 | Host 把某一項推給全房間 |
| 共享畫面位 | 房間同一時間只有一個的主畫面內容：螢幕分享、本機影片、投影片、YouTube |

## 3. 使用者介面

### 3.1 入口

- **首頁（選房間頁）**：「請選擇小組房間」標題右側新增按鈕「聚會內容」，打開編輯畫面。任何人都能打開——內容只存在自己電腦上，不影響他人。網頁版與桌面版都有。
- **會議中**：只有**勾選 Host 進入房間**的人，控制列上才出現「聚會內容」按鈕，打開右側抽屜。一般成員看不到此按鈕。

### 3.2 編輯畫面（左右兩欄）

全螢幕對話框（桌面版在窗口內）。

- **左欄**：所有已存的內容，依日期由近到遠。每筆顯示標題、副標（日期與備註，或「N 項」）。底部「＋ 新增一份」。
- **右欄**：選中那份的編輯區。
  - 頂部：標題（可編輯）、日期、備註；操作「複製」「刪除」。
  - 項目清單：每列左側 `⋮⋮` 可拖曳排序，圖示表示類型，右側編輯／刪除。點開一列就地編輯。
  - 底部四個新增鈕：「＋ 文字」「＋ 圖片」「＋ 經文」「＋ 影片」。
  - 最底一行小字：「內容只存在這台電腦的瀏覽器裡 · 已使用 X GB」。

各類型的編輯方式：

| 類型 | 編輯欄位 |
|---|---|
| 文字 | 標題（選填）、內文（多行） |
| 圖片 | 選檔；標題預設為檔名，可改 |
| 經文 | 下拉「書卷 ▾」「第 N 章 ▾」「起始節 ▾ 至 結束節 ▾」，選完立即在下方預覽經文；結束節只列出該章有效的節 |
| 影片 | 兩個分頁：「YouTube」貼連結＋開始時間（連結中的 `t=` 自動帶入）；「本機影片」選檔 |

### 3.3 會議中的右側抽屜

和聊天、成員一樣從右側打開，行為與現有抽屜一致（可與聊天、成員同時開啟，各自由自己的按鈕開關）。

- 頂部：「聚會內容」＋下拉切換要用哪一份（預設為日期離今天最近的一份）。
- 清單：每列圖示、標題，右側 `▶`。正在分享的那一列**黃框**，`▶` 變成「■ 停止」。
- 底部：「◀ 上一項」「下一項 ▶」——直接分享前／後一項。
- 清單為空或沒有任何內容時，顯示「還沒有準備內容」與「前往編輯」連結（打開 3.2 的編輯畫面）。

## 4. 分享行為

| 類型 | 按 ▶ 後大家看到的 | 使用的通道 |
|---|---|---|
| 經文 | 所有人的內建聖經打開到該章，捲到起始節，**起訖節高亮** | 既有聖經同步（`BibleMessage`），新增高亮範圍（見 6.3） |
| YouTube | 從設定的開始時間同步播放，Host 控制進度 | 既有 `useRoomVideo().open(videoId, startSeconds)` |
| 本機影片 | Host 端出現播放控制列，大家看到影片 | 既有本機影片廣播（`VideoBroadcastBar` / `publishVideoFile`） |
| 文字／圖片 | 一張投影片佔滿大家的主畫面 | **新**：投影片軌道（見第 5 節） |

規則：

1. **同一時間只分享一項**。按另一項的 ▶ 時，先停止目前這項，再開始新的。
2. **經文例外**：經文顯示在聖經面板、不佔共享畫面位；分享經文時，若 Host 正在放投影片或影片，一併停止，讓大家專心看經文。
3. **別人佔著共享畫面位**：比照現有 Host 規則，先送出 `claimShare` 讓對方停止，再開始。
4. **上一項／下一項**：以清單順序分享相鄰項目；已在第一／最後一項時該鈕停用。
5. **Host 斷線重連**：不自動恢復分享，Host 重按 ▶。

## 5. 投影片

### 5.1 畫面規格

- 1920×1080，深藍底（`#0f2a5c → #1e3a8a` 斜向漸層），淺色文字；標題淡金色（`#fde68a`）。
- 文字投影片：標題約 72px、內文約 48px、行高 1.7，左右留白 8%。內文過長時自動縮小字級，最小 32px；仍放不下時，**編輯時**就提示「內容太長，建議分成兩項」。
- 圖片投影片：底色 `#0b1220`，圖片等比例放大置中，標題置於圖下。
- 右下角小字「信望愛靈糧堂 · 〈房間名〉」，55% 透明度。

### 5.2 技術做法

- 以 `<canvas>` 繪製，`canvas.captureStream()` 取得視訊軌，以 `ScreenShare` 來源、軌道名 `meeting-slide` 發佈——與本機影片相同的做法，所以每位觀看者的舞台會自動把它當成共享畫面顯示，不需要改觀看端。
- 靜態畫面：`captureStream(1)`（每秒 1 幀即可），並在切換內容時主動 `requestFrame()`。
- `LiveKitService` 新增 `publishSlide(canvas)` / `unpublishSlide()`；`isPlayingVideoFile` 的判斷擴充為「媒體類共享」（影片或投影片），讓既有「本機分享 vs 螢幕分享」的邏輯（例如桌面版不把投影片當成螢幕分享而縮成工具列）維持正確。
- 發佈參數：`contentHint: 'detail'`、`maintain-resolution`、不做 simulcast——與螢幕分享相同，確保文字清楚。

## 6. 資料與儲存

### 6.1 儲存位置

瀏覽器的 IndexedDB，資料庫 `meeting-agenda`，兩個 object store：

**`agendas`**（每份內容一筆）

```ts
interface Agenda {
  id: string;            // crypto.randomUUID()
  title: string;         // 「約翰福音第 3 章」
  date: string;          // 'YYYY-MM-DD'
  note: string;          // 「10/7 聯合小組」
  items: AgendaItem[];   // 依顯示順序
  updatedAt: number;
}

type AgendaItem =
  | { id: string; kind: 'text'; title: string; body: string }
  | { id: string; kind: 'image'; title: string; fileId: string }
  | { id: string; kind: 'scripture'; bookId: number; chapter: number; fromVerse: number; toVerse: number }
  | { id: string; kind: 'youtube'; title: string; videoId: string; startSeconds: number }
  | { id: string; kind: 'localVideo'; title: string; fileId: string; fileName: string; size: number };
```

經文項目的標題不存，顯示時由 `localizeBookName` 產生，例如「約翰福音 3:16–17」。

**`files`**（圖片與影片本體）

```ts
interface StoredFile { id: string; blob: Blob; type: string; size: number }
```

### 6.2 規則

- 圖片存入前縮到最長邊 3840px 以內（保留原格式；PNG 透明保留）。
- 本機影片單支上限 2GB；超過在選檔時就拒絕。
- **參照計數**：「複製」一份內容時共用 `fileId`，不複製檔案；刪除項目或整份內容後，若某檔案已無任何項目參照，才刪除該檔案。以掃描所有 agenda 的方式判斷（份數少，不需另存計數）。
- 寫入失敗（`QuotaExceededError`）時提示「空間不足」，並確保不留下只寫了一半的項目：先寫檔案、再寫 agenda，agenda 寫入失敗時刪除剛寫入的檔案。
- 「已使用 X GB」用 `navigator.storage.estimate()`。

### 6.3 經文高亮（同步協定擴充）

`BibleMessage` 的 `passage` 動作新增選填欄位：

```ts
| { type: 'bible'; action: 'passage'; bookId: number; chapter: number; highlight?: { from: number; to: number } }
```

- 收到帶 `highlight` 的 passage：打開聖經、跳到該章、捲到 `from`、將 `from..to` 節加上高亮底色。
- 使用者（或 Host）換章、或 Host 再選別的經文時，高亮清除。
- 舊版用戶端忽略未知欄位，仍會正確跳到該章——向下相容。

## 7. 程式結構

新增檔案都放在 `Church/meeting/agenda/`（邏輯）與 `Church/components/meeting/agenda/`（介面），每個檔案單一職責：

| 檔案 | 職責 |
|---|---|
| `meeting/agenda/types.ts` | `Agenda`、`AgendaItem` 型別 |
| `meeting/agenda/agendaStore.ts` | IndexedDB 存取：列表、讀寫、刪除、複製、參照清理、用量 |
| `meeting/agenda/youtubeLink.ts` | 解析 YouTube 連結（youtu.be、watch?v=、shorts、`t=`） |
| `meeting/agenda/slideRenderer.ts` | 在 canvas 上畫文字／圖片投影片，含自動縮字 |
| `hooks/useAgendaPresenter.ts` | 會議中的分享狀態機：目前分享哪一項、切換時先停再開、上一項／下一項 |
| `components/meeting/agenda/AgendaEditor.tsx` | 3.2 編輯畫面（左右兩欄） |
| `components/meeting/agenda/AgendaItemEditor.tsx` | 單一項目的就地編輯（依類型） |
| `components/meeting/agenda/ScripturePicker.tsx` | 書卷／章／起訖節下拉與預覽 |
| `components/meeting/agenda/AgendaDrawer.tsx` | 3.3 會議中的右側抽屜 |

修改既有檔案：

- `components/meeting/MeetingPage.tsx`、`DesktopRoomPicker.tsx`：首頁「聚會內容」按鈕。
- `components/meeting/MeetingRoomView.tsx`、`MeetingControlBar.tsx`：Host 限定的控制列按鈕與抽屜。
- `services/livekitService.ts`：`publishSlide` / `unpublishSlide`，媒體類共享的判斷。
- `meeting/chatProtocol.ts`、`hooks/useBibleSync.ts`、`components/meeting/BiblePanel.tsx`：經文高亮。
- `constants/translations.ts`：所有新文字（繁中＋英文）。

## 8. 邊界情況

| 情況 | 處理 |
|---|---|
| Host 中途斷線 | 投影片軌道隨連線消失，大家主畫面自動收起；重連後不自動恢復 |
| YouTube 連結格式錯誤 | 新增時就提示，不存入 |
| 經文結束節超出本章 | 下拉只列有效的節；起始節改變時，結束節至少等於起始節 |
| 空間不足 | 提示「空間不足」，不留半個檔案（6.2） |
| 瀏覽器清除網站資料 | 內容一併消失；編輯畫面底部小字事先說明 |
| 沒勾 Host 進房 | 不顯示會議中的「聚會內容」按鈕 |
| 分享中刪除該項目 | 會議中的抽屜不提供刪除；編輯畫面與會議是不同頁面，不會同時發生 |
| 圖片檔損毀／格式不支援 | 選檔時解碼失敗即提示，不存入 |

## 9. 測試

- **單元測試**（vitest；新增 devDependency `fake-indexeddb` 模擬 IndexedDB）：agenda 增刪改查、複製後共用檔案、刪除時只清掉無參照的檔案、寫入失敗時回滾；YouTube 連結解析各格式；經文範圍校驗；投影片自動縮字的斷點計算（純函式，與 canvas 分離）；`useAgendaPresenter` 的切換順序（先停再開、上一項／下一項邊界）。
- **介面冒煙測試**（Electron + Playwright，比照 `desktop/smoke.cjs`）：新建內容 → 加入四種項目 → 以 Host 進房 → 開抽屜 → 依序分享每一種 → 上一項／下一項 → 停止；確認投影片以 `meeting-slide` 軌道發佈、經文訊息帶 `highlight`。
- **真人測試**（需兩台電腦，由使用者進行）：觀看端看到投影片字清楚、經文跳到正確位置且高亮、YouTube 與本機影片同步正常。
