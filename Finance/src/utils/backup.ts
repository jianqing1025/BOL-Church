import JSZip from 'jszip';
import { api } from './api';
import type { BackupData, ImportResult } from '../types';

// 表名 → 繁體標題（查看頁用）
export const TABLE_LABELS: Record<string, string> = {
  member_groups: '成員群組',
  members: '成員',
  member_contacts: '成員聯絡方式',
  users: '用戶帳號',
  offering_categories: '奉獻分類',
  offering_methods: '奉獻方式',
  offerings: '奉獻記錄',
  expense_categories: '支出分類',
  expenses: '支出記錄',
  expense_summary: '支出彙總',
  app_settings: '系統設定',
  audit_logs: '操作日誌'
};

type ProgressFn = (message: string) => void;

// 檔案 URL → R2 key（與後端 collectImageKeys 對應）
function urlToKey(value: string): string | null {
  if (value.includes('/api/files/')) {
    try {
      return decodeURIComponent(value.split('/api/files/')[1]);
    } catch {
      return value.split('/api/files/')[1];
    }
  }
  try {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    return null;
  }
}

// 以段落編碼 key，保留 '/' 作為路徑分隔（避免 %2F 被代理拒絕）
function filesPath(key: string): string {
  return `/api/files/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function stamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// 掃描資料，建立 完整URL → images/<key> 的對映（僅限實際打包的圖片）
function buildUrlMap(data: BackupData): Record<string, string> {
  const imageKeys = new Set(data.imageKeys || []);
  const map: Record<string, string> = {};
  for (const rows of Object.values(data.tables || {})) {
    for (const row of rows) {
      for (const value of Object.values(row)) {
        if (typeof value !== 'string' || !value) continue;
        const key = urlToKey(value);
        if (key && imageKeys.has(key)) map[value] = `images/${key}`;
      }
    }
  }
  return map;
}

function escapeJsonForScript(json: string): string {
  return json.replace(/</g, '\\u003c');
}

// 產生 Excel 可直接開啟的 CSV（欄位同 backup.json 的原始欄位）
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols: string[] = [];
  rows.forEach(r => Object.keys(r).forEach(c => { if (!cols.includes(c)) cols.push(c); }));
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map(c => esc(r[c])).join(','));
  return lines.join('\r\n');
}

// UTF-8 BOM：讓 Excel 正確辨識中文
const CSV_BOM = '﻿';

// 產生自包含查看頁：資料 inline 內嵌，file:// 直接打開；圖片以相對路徑顯示縮圖
function buildViewerHtml(data: BackupData, urlMap: Record<string, string>): string {
  const payload = escapeJsonForScript(JSON.stringify({ data, urlMap, labels: TABLE_LABELS }));
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>信望愛靈糧堂 財務數據備份</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", "Microsoft JhengHei", sans-serif; color: #172033; background: #eef1f6; }
  header { padding: 20px 24px; background: #1f2937; color: #fff; }
  header h1 { margin: 0 0 4px; font-size: 18px; }
  header p { margin: 0; font-size: 13px; color: #cbd5e1; }
  nav { padding: 12px 24px; background: #fff; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; }
  nav a { display: inline-block; margin: 4px 10px 4px 0; font-size: 13px; color: #1f6feb; text-decoration: none; }
  main { padding: 8px 24px 48px; }
  section { margin-top: 28px; }
  section h2 { font-size: 16px; border-left: 4px solid #1f6feb; padding-left: 10px; }
  .count { color: #68758a; font-weight: normal; font-size: 13px; margin-left: 8px; }
  .table-wrap { overflow-x: auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #eef1f6; padding: 6px 8px; text-align: left; vertical-align: top; white-space: nowrap; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
  th { background: #f8fafc; position: sticky; top: 0; }
  tbody tr:nth-child(even) { background: #fafbfc; }
  img.thumb { max-height: 60px; max-width: 120px; border-radius: 4px; border: 1px solid #e2e8f0; display: block; }
  .empty { color: #94a3b8; font-style: italic; padding: 10px; }
</style>
</head>
<body>
<header>
  <h1>信望愛靈糧堂 財務數據備份</h1>
  <p>導出時間：<span id="exportedAt"></span> · 格式版本 v<span id="version"></span></p>
</header>
<nav id="nav"></nav>
<main id="app"></main>
<script id="backup-payload" type="application/json">${payload}</script>
<script>
(function () {
  var payload = JSON.parse(document.getElementById('backup-payload').textContent);
  var data = payload.data, urlMap = payload.urlMap || {}, labels = payload.labels || {};
  document.getElementById('exportedAt').textContent = data.exportedAt || '';
  document.getElementById('version').textContent = data.version || '';
  var nav = document.getElementById('nav'), app = document.getElementById('app');
  Object.keys(data.tables || {}).forEach(function (name) {
    var rows = data.tables[name] || [];
    var label = labels[name] || name;
    var a = document.createElement('a');
    a.href = '#tbl-' + name;
    a.textContent = label + ' (' + rows.length + ')';
    nav.appendChild(a);

    var section = document.createElement('section');
    section.id = 'tbl-' + name;
    var h2 = document.createElement('h2');
    h2.innerHTML = label + '<span class="count">' + name + ' · ' + rows.length + ' 筆</span>';
    section.appendChild(h2);

    if (!rows.length) {
      var e = document.createElement('div'); e.className = 'empty'; e.textContent = '無資料'; section.appendChild(e);
      app.appendChild(section); return;
    }
    var cols = [];
    rows.forEach(function (r) { Object.keys(r).forEach(function (c) { if (cols.indexOf(c) < 0) cols.push(c); }); });
    var wrap = document.createElement('div'); wrap.className = 'table-wrap';
    var table = document.createElement('table');
    var thead = document.createElement('thead'); var htr = document.createElement('tr');
    cols.forEach(function (c) { var th = document.createElement('th'); th.textContent = c; htr.appendChild(th); });
    thead.appendChild(htr); table.appendChild(thead);
    var tbody = document.createElement('tbody');
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      cols.forEach(function (c) {
        var td = document.createElement('td');
        var v = r[c];
        if (typeof v === 'string' && urlMap[v]) {
          var link = document.createElement('a'); link.href = urlMap[v]; link.target = '_blank';
          var img = document.createElement('img'); img.className = 'thumb'; img.src = urlMap[v]; img.alt = c;
          link.appendChild(img); td.appendChild(link);
        } else if (v === null || v === undefined) {
          td.textContent = '';
        } else if (typeof v === 'object') {
          td.textContent = JSON.stringify(v);
        } else {
          td.textContent = String(v);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); wrap.appendChild(table); section.appendChild(wrap); app.appendChild(section);
  });
})();
</script>
</body>
</html>`;
}

const README = `信望愛靈糧堂 財務數據備份
============================

檔案說明
  backup.json    完整資料（再導入的唯一真實來源）
  members.csv    成員（Excel 可直接開啟，UTF-8 BOM）
  offerings.csv  奉獻記錄（同上）
  expenses.csv   支出記錄（同上）
  index.html     可視化查看頁，直接用瀏覽器打開即可瀏覽所有資料與圖片
  images/        所有被引用的圖片，沿用原始儲存路徑（R2 key）
  README.txt     本說明

backup.json 格式
  {
    "version": 1,
    "exportedAt": "ISO 時間",
    "tables": {
      "member_groups": [ { 各欄位... } ],
      "members": [ ... ],
      "member_contacts": [ ... ],
      "users": [ ...（不含密碼）... ],
      "offering_categories": [ ... ],
      "offering_methods": [ ... ],
      "offerings": [ ... ],
      "expense_categories": [ ... ],
      "expenses": [ ... ],
      "expense_summary": [ ... ],
      "app_settings": [ ... ],
      "audit_logs": [ ... ]
    },
    "imageKeys": [ "圖片的 R2 key", ... ]
  }

導入規則
  - 按各表主鍵（app_settings 為 key，其餘為 id）合併/更新，永不刪除既有資料。
  - 外部來源資料只要符合上述格式即可導入；images 可省略。
  - 用戶密碼不在備份內；導入的新用戶需由管理員重設密碼後才能登入。
`;

export async function exportBackup(onProgress?: ProgressFn): Promise<void> {
  onProgress?.('讀取數據…');
  const data = await api.backupExport();

  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(data, null, 2));
  zip.file('README.txt', README);
  zip.file('index.html', buildViewerHtml(data, buildUrlMap(data)));

  // 三個主要資料表另存 CSV，方便用 Excel 查看／單獨發送（完整導入仍靠 backup.json）
  zip.file('members.csv', CSV_BOM + toCsv(data.tables.members || []));
  zip.file('offerings.csv', CSV_BOM + toCsv(data.tables.offerings || []));
  zip.file('expenses.csv', CSV_BOM + toCsv(data.tables.expenses || []));

  const images = zip.folder('images');
  const keys = data.imageKeys || [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    onProgress?.(`下載圖片 ${i + 1}/${keys.length}`);
    try {
      const res = await fetch(filesPath(key), { credentials: 'same-origin' });
      if (res.ok && images) images.file(key, await res.blob());
    } catch {
      /* 缺失圖片跳過 */
    }
  }

  onProgress?.('打包中…');
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `church-finance-backup-${stamp()}.zip`);
  onProgress?.('完成');
}

export async function importBackup(file: File, onProgress?: ProgressFn): Promise<ImportResult> {
  onProgress?.('讀取備份檔…');
  const zip = await JSZip.loadAsync(file);
  const jsonEntry = zip.file('backup.json');
  if (!jsonEntry) throw new Error('備份檔缺少 backup.json');

  const data = JSON.parse(await jsonEntry.async('string')) as BackupData;
  if (!data || !data.tables) throw new Error('備份格式無效：缺少 tables');

  onProgress?.('寫入數據…');
  const summary = await api.backupImport(data);

  const imageEntries: { key: string; file: JSZip.JSZipObject }[] = [];
  const imagesFolder = zip.folder('images');
  if (imagesFolder) {
    imagesFolder.forEach((relativePath, entry) => {
      if (!entry.dir) imageEntries.push({ key: relativePath, file: entry });
    });
  }

  let imagesRestored = 0;
  let imagesFailed = 0;
  for (let i = 0; i < imageEntries.length; i++) {
    const { key, file: entry } = imageEntries[i];
    onProgress?.(`回寫圖片 ${i + 1}/${imageEntries.length}`);
    try {
      const blob = await entry.async('blob');
      const name = key.split('/').pop() || 'file';
      await api.backupRestoreFile(key, new File([blob], name, { type: blob.type || 'application/octet-stream' }));
      imagesRestored++;
    } catch {
      imagesFailed++;
    }
  }

  onProgress?.('完成');
  return { ...summary, imagesRestored, imagesFailed };
}
