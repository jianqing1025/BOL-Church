# 教會財務管理系統 2.0

React 19 + TypeScript + Vite + Cloudflare Workers + D1 + R2 的獨立財務管理專案。

## 功能

- 成員管理：列表、搜尋、分組、狀態、CRUD、奉獻總覽
- 奉獻記錄：分類、支付方式、匿名奉獻、CRUD、趨勢統計
- 支出管理：分類預算、提交、批准、拒絕、CRUD
- 儀表板：本週奉獻、本月支出、待批准支出、收支對比
- 認證：Cookie JWT session，角色包含 super_admin、finance_admin、auditor、member
- 檔案：`/api/upload` 上傳到 R2，支援 avatar、receipt、expense、report 等類型

## 本地開發

```bash
cd Finance
npm install
npm run d1:migrate:local
npm run api:dev
npm run dev
```

前端預設網址：`http://localhost:2110`

API/Worker 預設網址：`http://127.0.0.1:8787`

預設登入：

- Email: `BOLCCOP@Gmail.com`
- Password: `Bolccop110550`

Cloudflare 資源已在 `wrangler.toml` 綁定：

- D1 database: `church-finance`
- R2 bucket: `church-finance`
- Account ID / Zone ID: 已填入

敏感憑據放在本機 `.dev.vars`，不要提交到 Git。登入 cookie 的簽章金鑰 `JWT_SECRET`（至少 32 字元的隨機值）以 `wrangler secret put JWT_SECRET --name church-finance` 設定，不放在 `wrangler.toml`；沒設定時系統會拒絕登入。請更換預設密碼。

## 部署

```bash
npm run build
npm run d1:migrate:remote
npm run cf:deploy
```

## 匯入 Access 成員

預設來源：`E:\Repo\bolccop\Data\2019BOLCCOP-jIANQING.accdb` 的 `T_Accounts`。

```bash
npm run import:members:local
npm run import:members:remote
```

匯入會補入 PID、英文姓名、Partner、住址、城市、州/省、郵編、住家電話、聯絡確認、外部聯絡人與資料來源等欄位。重複 email 只保留第一次，後續重複值會置空以避免錯誤合併成員。

## 專案結構

```text
Finance/
├── src/
│   ├── App.tsx
│   ├── context/
│   ├── server/index.ts
│   ├── types/
│   └── utils/
├── migrations/
├── public/
├── vite.config.ts
├── wrangler.toml
└── package.json
```

## 手動切換 VPS 数据库

Finance 的 VPS SQLite 副本位于 `/var/lib/finance-standby/finance.sqlite3`，通过 HTTPS 私有 API 供 Worker 使用。默认配置 `DB_BACKEND = "d1"` 继续使用 Cloudflare D1。

需要切换时，将 `wrangler.toml` 的 `DB_BACKEND` 改成 `"vps"` 并部署；切回 D1 时改回 `"d1"` 再部署。VPS 是当前快照，不会自动与 D1 双向同步；Worker 在 VPS 模式写入的数据不会出现在 D1 中。切回 D1 前，必须先将 VPS 上的更新同步回 D1 并核对数据。
