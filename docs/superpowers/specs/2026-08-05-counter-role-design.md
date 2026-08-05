# Counter（點款人員）帳戶類型

日期：2026-08-05
範圍：Finance 前後端與資料庫

## 需求

新增一種帳戶類型，登入後只能記錄奉獻，不能查看現有數據，且只看得到本帳號記錄的資料。

釐清後的具體範圍：

- 可搜尋成員姓名、可查看電話與地址、可新增成員。
- **不可**查看任何奉獻金額匯總（成員的今年奉獻／累計奉獻）。
- 可看、可改、可刪**自己記錄**的奉獻。
- 登入後只有「奉獻記錄」一頁，儀表板／支出／報表／帳號管理一律不給。
- 角色名稱：Counter（點款人員），role key `counter`。

## 核心安全原則：fail-closed

`requireUser(request, env, role)` 目前依線性 `roleRank`（dev=1 為最低）判斷。Counter 的權限是非線性的——能寫奉獻，卻不能讀儀表板／支出／稽核——塞不進這個階梯。

採用 `roleRank.counter = 0`：所有現存端點（最低要求 rank 1）對 Counter **自動回 403**，再逐一白名單開放。往後新增端點若未特別處理，預設是擋住而非放行。

UI 隱藏不構成防護，所有限制必須在 server 端落實。

## 端點白名單

| 端點 | Counter 行為 |
|---|---|
| `POST /api/login`、`GET /api/me`、`POST /api/logout` | 照常 |
| `GET /api/lookups` | 開放（分類、支付方式，不含金額） |
| `GET /api/members` | 開放，但 `totalOffering` 一律回傳 0 |
| `POST /api/members` | 開放 |
| `GET /api/offerings` | 開放，強制附加 `WHERE created_by = ?` |
| `POST /api/offerings` | 開放，強制寫入 `created_by = user.id` |
| `PUT /api/offerings/:id`、`DELETE /api/offerings/:id` | 開放，先驗該筆 `created_by` 等於自己，否則 403 |
| `POST /api/upload` | 開放（收據附件） |
| dashboard、expenses、audit-logs、settings、users、reports、backup 等其餘全部 | 403 |

## 資料庫

新增 `migrations/0019_add_offering_created_by.sql`：

```sql
ALTER TABLE offerings ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_offerings_created_by ON offerings(created_by);
```

**所有角色**新增奉獻時都寫入 `created_by`，不只 Counter，否則管理員記錄的資料沒有來源可追。歷史資料為 NULL，Counter 天然看不到，符合預期。

## 前端

- `Role` 型別加入 `'counter'`；`roleLabels.counter = 'Counter'`。使用者管理頁的角色下拉由 `Object.keys(roleLabels)` 產生，加入後 Super Admin 即可開此類帳號。
- `FinanceProvider.refreshAll()` 目前以 `Promise.all` 一次撈七個端點。Counter 會取得多個 403 導致整頁進入錯誤狀態，必須改為依角色決定撈取範圍：Counter 只撈 `lookups`／`members`／`offerings`。`refreshAfterWrite()` 同理。
- 導覽只顯示「奉獻記錄」；路徑解析對 Counter 一律導向 `/offerings`。
- Counter 的 `canEdit` 為 true，可使用「記錄奉獻」與奉獻表單內的「新增成員」按鈕。
- 所有寫入照現有 `recordAudit` 進稽核日誌；Counter 本身看不到該日誌。

## 已知取捨

1. **「目前列表合計」保留。** 該列只加總 Counter 自己記錄的資料，是點款核對的依據，不構成外洩。
2. **Counter 在奉獻人下拉看到的 ★ 不完全準確。** 星號規則含「半年內有奉獻」，但 Counter 只取得自己記錄的奉獻，因此其看到的星號僅反映「手動收藏 ＋ 自己記過 ＋ 本週新增」。要修正需開放「哪些 memberId 近半年有奉獻」的查詢，等同間接洩漏奉獻者名單，不划算，接受此降級。

## 驗證

1. `npm run build` 型別檢查通過。
2. 套用 migration 至遠端 D1。
3. 建立 Counter 測試帳號，登入後確認：導覽只有「奉獻記錄」；列表初始為空；記錄一筆後出現在列表；可修改與刪除該筆。
4. **以 `curl` 直接打 API 驗證，不可只看 UI**：
   - `/api/dashboard`、`/api/expenses`、`/api/audit-logs`、`/api/users`、`/api/settings` → 403
   - `/api/members` → 200 且每筆 `totalOffering` 為 0
   - `/api/offerings` → 200 且只含自己記錄的資料
   - 以 Counter 身分 `PUT` 他人記錄的奉獻 → 403

## 受影響檔案

- 新增：`Finance/migrations/0019_add_offering_created_by.sql`
- 修改：`Finance/src/types/index.ts`（`Role`、`Offering.createdBy`）
- 修改：`Finance/src/server/index.ts`（角色定義、端點白名單、`created_by` 寫入與過濾、`mapMember` 金額遮蔽）
- 修改：`Finance/src/context/FinanceContext.tsx`（依角色撈取）
- 修改：`Finance/src/App.tsx`（`roleLabels`、導覽與路徑限制）
