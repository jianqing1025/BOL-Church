# 奉獻表單快速新增成員 ＋ new 標記與自動星號

日期：2026-08-04
範圍：Finance 前端（`Finance/src`），不含後端與資料庫

## 背景

記錄奉獻時常遇到奉獻人還不在成員名單裡，必須離開奉獻表單、切到成員管理頁新增、再回來重填，流程斷掉。

同時，奉獻人下拉目前依 `member.starred`（成員管理頁的手動 ☆/★ 收藏）排序，這個旗標要人工維護，實務上跟「誰最近真的在奉獻」對不上。

## 目標

1. 奉獻表單標題列加「新增成員」按鈕，就地新增成員並自動填入奉獻人欄位。
2. 星號改由奉獻紀錄自動判定，不再只依賴人工維護。
3. 本週新增的成員在名單最上方，名字後面帶紅色 `new` 飄帶，下週日歸零。

## 非目標

- 不新增 migration、不改資料庫 schema。
- 不改動 `POST /api/members/:id/star` 或任何後端邏輯。
- 不改成員表單的欄位組成。
- 不做「半年沒奉獻就把 DB 的 starred 寫回 false」這類資料清洗。

## 決策：規則在前端衍生

`FinanceContext` 已把全部 `members` 與 `offerings` 載入記憶體，「半年內有奉獻」在前端算是 O(n) 的事。

| 方案 | 取捨 |
|---|---|
| **A. 前端衍生（採用）** | 零 migration、零排程、資料一律即時正確。DB 的 `starred` 保留原意（手動收藏），與自動規則做聯集 |
| B. 後端加 `auto_starred` 欄位 | 需要 migration ＋ Cron 每日重算，或每次查詢 join offerings。前端已有全量資料，成本換不到任何好處 |
| C. 新增成員時直接寫 `starred = true` | 改動最小，但做不到「半年沒奉獻自動下星」，不符需求 |

## 規則定義

新增 `Finance/src/utils/memberRank.ts`，作為全站唯一真相來源。

| 概念 | 定義 |
|---|---|
| `isNew(member)` | `member.createdAt` 的日期部分 ≥ 本週日（日曆週，週日為週首） |
| `isStar(member)` | `member.starred`（手動）**或** 近半年內有奉獻紀錄 **或** `isNew(member)` |
| 排序 | `isNew` 降冪 → `isStar` 降冪 → 顯示名 `localeCompare` |

- 「近半年」＝ 今天往前推 6 個月的日期字串，與 `offering.date` 做字串比較（兩者皆為 `yyyy-mm-dd`）。
- `lastSundayStr()` 目前在 `App.tsx`，搬進本模組供 `isNew` 與 `OfferingForm` 的日期預設值共用，`App.tsx` 改為 import。
- 顯示名沿用既有的 `memberDisplayName()`，其行為不變。

剛新增、尚無奉獻紀錄的成員靠 `isNew` 那一項取得星號；一週後若已有奉獻紀錄則繼續有星，否則回到一般排序。這使需求中「new 成員在 Starred 成員裡置頂、一週後參與正常排序」自然成立，不需要額外的過期處理。

模組對外介面：

```ts
export function lastSundayStr(): string;
export function isNewMember(member: Member): boolean;
/** 回傳 memberId -> { isNew, isStar }，以及可直接餵給 Array#sort 的比較器 */
export function buildMemberRank(members: Member[], offerings: Offering[]): MemberRank;
```

`MemberRank` 需提供 `isNew(id)`、`isStar(id)`、`compare(a, b)` 三個查詢，讓三個呼叫點都只依賴這個介面，不各自重算。

## UI 呈現

- 星號：名字前綴 `★`（金色），無星則不加前綴。此為兩個下拉選單的既有樣式，不改。
- new：名字**最後方**的紅色小飄帶 `new`，新增 CSS class `.member-new-badge`。
- 三個套用點：

| 位置 | 檔案 | 變更 |
|---|---|---|
| 奉獻表單「奉獻人」下拉 | `MemberCombobox` | 排序改用 `rank.compare`；`★` 前綴改讀 `rank.isStar`；名字後加 new 飄帶 |
| 支出表單「付款人」下拉 | `ExpenseForm` | 同上（原本各自 inline 排序，改成呼叫同一個比較器） |
| 成員管理頁列表 | `MembersPage` | 排序改用 `rank.compare`；名字後加 new 飄帶 |

### 成員管理頁的手動 ☆/★ 按鈕維持不變

該欄是一顆可點的開關，必須忠實顯示 `member.starred`（人工狀態），否則會出現「按鈕顯示 ★、點下去星號卻不消失」的矛盾。自動衍生的星號只用於兩個下拉選單的名字前綴。成員管理頁僅新增 new 飄帶與新排序。

## 奉獻表單的「新增成員」按鈕

### 標題列

`FormModal` 新增 optional prop `headerActions?: React.ReactNode`，渲染在「關閉」按鈕左邊。只有 `OfferingForm` 傳值，其餘彈窗行為不變。

### 巢狀彈窗

點擊後在 `OfferingForm` 內開啟第二層 `MemberForm`（沿用現有元件與 `blankMember()`，不做簡化版）。

**必要修正：`FormModal.handleSubmit` 補上 `event.stopPropagation()`。** React 合成事件會沿元件樹冒泡，內層成員表單送出時會一併觸發外層奉獻表單的 `onSubmit`，造成「存成員順便把奉獻也存了」。這一行對所有既有彈窗都是無害的。

視覺不需改 CSS：`.modal-backdrop` 為 `position: fixed; z-index: 10`，後渲染的第二層自然疊在上層，且 `position: fixed` 不受外層 `.modal` 的 `overflow: auto` 裁切。

### 保存後自動填入

- `FinanceContext.saveMember` 回傳型別由 `Promise<void>` 改為 `Promise<Member>`（`api.createMember` / `api.updateMember` 本來就回傳 `Member`），回傳值取自 API 呼叫結果，`refreshAfterWrite()` 照舊。
- `MemberForm` 的 `onSave` 型別放寬為 `(payload: Partial<Member>) => Promise<unknown>`，以容納新的回傳值；`MembersPage` 的呼叫端不需改動。
- `OfferingForm` 取得新成員後 `setForm(f => ({ ...f, memberId: created.id }))` 並關閉第二層彈窗。該成員此時 `isNew` 為真，會出現在下拉最上方並帶 new 飄帶。

### 權限

奉獻表單本身已由 `OfferingsPage` 的 `canEdit`（`super_admin` / `finance_admin` / `dev`）把關，按鈕沿用同一層級，不另做檢查。

## 錯誤處理

沿用 `FormModal` 既有機制：`onSubmit` 拋錯時在該層彈窗內顯示錯誤訊息並解除 busy 狀態。第二層成員表單保存失敗時，錯誤顯示在成員彈窗內，外層奉獻表單的內容不受影響。

## 驗證

專案無測試框架（無 vitest / jest）。驗證方式：

1. `npm run build` — `tsc -b` 型別檢查須通過。
2. `npm run deploy:prod` 後人工確認：
   - 奉獻表單標題列出現「新增成員」，位於「關閉」左邊。
   - 新增成員保存後，第二層彈窗關閉、奉獻人欄位已填入該成員，且外層奉獻表單未被送出。
   - 該成員出現在奉獻人下拉最上方，名字後有紅色 `new`。
   - 支出表單付款人下拉與成員管理頁列表呈現一致的排序與 new 飄帶。
   - 半年內有奉獻的成員在兩個下拉中顯示 `★`；成員管理頁的 ☆/★ 按鈕仍反映手動狀態。

## 受影響檔案

- 新增：`Finance/src/utils/memberRank.ts`
- 修改：`Finance/src/App.tsx`（`FormModal`、`OfferingForm`、`MemberForm`、`MemberCombobox`、`ExpenseForm`、`MembersPage`，移除 `lastSundayStr` 定義改為 import）
- 修改：`Finance/src/context/FinanceContext.tsx`（`saveMember` 回傳型別）
- 修改：`Finance/src/styles.css`（`.member-new-badge`）
