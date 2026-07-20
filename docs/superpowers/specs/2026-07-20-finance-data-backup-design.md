# Finance 數據備份（導出 / 導入）設計

日期：2026-07-20
範圍：`Finance/`（Cloudflare Worker + D1 + R2 + React SPA）

## 目標

在「數據看板」上方新增數據備份功能：導出可查看、可再導入、含所有圖片；也能導入符合格式的外部來源數據。僅電腦端。

## 決策（已與使用者確認）

- **數據範圍**：全部業務數據，`users` 表**不含 `password_hash`**。
- **導入方式**：按 ID 合併 / 更新（`INSERT … ON CONFLICT(id) DO UPDATE`），**永不刪除**現有行。
- **導出形式**：單一 ZIP，內含 canonical JSON、`images/` 圖片、`index.html` 可視化查看頁、`README.txt` 格式說明。
- **權限**：`super_admin` + `finance_admin`（後端 `canManageSettings` / `requireUser(…, 'finance_admin')`；前端 `hasPermission('super_admin','finance_admin')`）。
- **圖片恢復**：導入時把 `images/` 的圖片按原 R2 key 回寫，URL 照舊生效。

## 備份包結構

```
church-finance-backup-YYYYMMDD-HHmm.zip
├─ backup.json      # canonical，再導入的唯一真實來源
├─ index.html       # 自包含查看頁（數據 inline 內嵌，file:// 可直接打開）
├─ images/<key>     # 每個被引用的圖片，沿用原 R2 key（含路徑分隔）
└─ README.txt       # 版本 / 格式 / schema 說明
```

`backup.json`：
```json
{
  "version": 1,
  "exportedAt": "ISO",
  "tables": {
    "member_groups": [ { …原始欄位… } ],
    "members": [ … ],
    "member_contacts": [ … ],
    "users": [ …無 password_hash… ],
    "offering_categories": [ … ],
    "offering_methods": [ … ],
    "offerings": [ … ],
    "expense_categories": [ … ],
    "expenses": [ … ],
    "expense_summary": [ … ],
    "app_settings": [ … ],
    "audit_logs": [ … ]
  },
  "imageKeys": [ "receipt/…", "avatar/…", … ]
}
```

行資料以 `SELECT *` 動態導出（欄位隨 migration 演進自動涵蓋，不硬編碼欄位）。跳過 `password_resets`、`expense_action_tokens`（臨時 / 安全性 token）。

## 後端（新模組 `src/server/backup.ts`）

- `exportBackup(env)`：對每個表 `SELECT *`；`users` 移除 `password_hash`；從 `receipt_url` / `invoice_receipt_url` / `account_receipt_url` / `avatar_url` 及 settings 簽名 URL 收集 `imageKeys`（相對 R2 key）。
- `importBackup(env, data)`：按 FK 安全順序逐表 upsert（groups→members→contacts→users→offering cats/methods→offerings→expense cats→expenses→expense_summary→app_settings→audit_logs）。動態依 `Object.keys(row)` 組 `INSERT … ON CONFLICT(id) DO UPDATE SET …=excluded.…`。回傳每表 `{inserted, updated}`。
  - **users 特例**：更新時 `password_hash` 不在 SET 內（保留原值）；新用戶以鎖定佔位 hash（`!locked-…`，無法比對任何密碼）插入，需管理員重設密碼才能登入 —— 於 summary 標示。

`src/server/index.ts` 於 `if (url.pathname.startsWith('/api/'))` 區塊新增（均 `canManageSettings` 守衛）：

- `GET  /api/backup/export` → `exportBackup`
- `POST /api/backup/import` → 解析 JSON、`importBackup`、`recordAudit`、回傳 summary
- `POST /api/backup/restore-file` → `FormData{key,file}` → `env.FILES.put(key, …)`

## 前端

- 新增 **jszip** 依賴。
- `src/utils/backup.ts`
  - `exportBackup(onProgress)`：呼叫 `/api/backup/export` → 逐一 `fetch('/api/files/<key>')` 取圖 → 產生 `index.html` → JSZip 打包 → 觸發下載。
  - `importBackup(file, onProgress)`：JSZip 讀取 → 驗證 `version` / `tables` → `POST /api/backup/import` → 逐一 `restore-file` 回寫圖片 → 回傳 summary。
  - `buildViewerHtml(data)`：生成把各表渲染成表格、圖片以相對 `images/<key>` 顯示縮圖的自包含 HTML。
- `src/utils/api.ts`：`backupExport`、`backupImport`、`backupRestoreFile`。
- `App.tsx`：`DashboardPage` 於 `PageTitle` 下、`Toolbar` 上新增 **備份工具列**（「導出備份」+「導入備份」）；導入為 modal（選檔 → 進度 → summary），完成後 `refreshAll()`。守衛 `useIsDesktop()` 且 `hasPermission('super_admin','finance_admin')`。

## 「導入其它來源數據」

導入端點僅消費文件化的 `backup.json` schema（圖片可選）。任何外部工具產出符合該 schema 的數據即可經同一路徑導入；schema 隨每次導出寫入 `README.txt`。

## 取捨

- **瀏覽器端打包**：因僅電腦端且避開 Worker ~128MB 記憶體限制；教會圖片量級可接受，數百 MB 圖片集會吃瀏覽器記憶體（v1 可接受）。
- 導入**只合併不刪除**：無法移除「備份中不存在」的行。
- UI 文案一律繁體（zh-Hant）。
```

## 驗證

無測試框架；以 `tsc -b && vite build` 型別檢查 + 建置，及本機 `wrangler dev` 手動走查（導出→打開 index.html→導入→核對 summary 與圖片）。
