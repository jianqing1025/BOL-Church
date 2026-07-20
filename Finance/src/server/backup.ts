/// <reference types="@cloudflare/workers-types" />

// 數據備份：導出 / 導入（全部業務數據，users 不含 password_hash）。
// 導入採「按主鍵合併/更新」，永不刪除既有資料。

type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  FILES_URL: string;
};

// FK 安全順序：被引用的表先寫入。
const BACKUP_TABLES = [
  'member_groups',
  'members',
  'member_contacts',
  'users',
  'offering_categories',
  'offering_methods',
  'offerings',
  'expense_categories',
  'expenses',
  'expense_summary',
  'app_settings',
  'audit_logs'
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];

// 各表主鍵（app_settings 用 key，其餘 id）。
function primaryKey(table: BackupTable): string {
  return table === 'app_settings' ? 'key' : 'id';
}

export type BackupData = {
  version: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
  imageKeys: string[];
};

export type ImportSummary = {
  tables: Record<string, { inserted: number; updated: number }>;
  lockedUsers: number;
};

const BACKUP_VERSION = 1;
const VALID_COLUMN = /^[A-Za-z_][A-Za-z0-9_]*$/;

// 由資料中的檔案 URL 反推 R2 key（相對路徑）。
function collectImageKeys(tablesJson: string, filesUrl: string): string[] {
  const keys = new Set<string>();
  const base = (filesUrl || '').replace(/\/$/, '');
  if (base) {
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${esc}/([^"\\\\]+)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(tablesJson))) keys.add(m[1]);
  }
  const re2 = /\/api\/files\/([^"\\]+)/g;
  let m2: RegExpExecArray | null;
  while ((m2 = re2.exec(tablesJson))) {
    try {
      keys.add(decodeURIComponent(m2[1]));
    } catch {
      keys.add(m2[1]);
    }
  }
  return [...keys];
}

export async function exportBackup(env: Env): Promise<BackupData> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of BACKUP_TABLES) {
    const result = await env.DB.prepare(`SELECT * FROM ${table}`).all<Record<string, unknown>>();
    let rows = result.results ?? [];
    if (table === 'users') {
      rows = rows.map(({ password_hash, ...rest }) => rest);
    }
    tables[table] = rows;
  }
  const imageKeys = collectImageKeys(JSON.stringify(tables), env.FILES_URL);
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables, imageKeys };
}

function normalizeValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number') return value;
  return String(value);
}

// 新用戶以鎖定佔位 hash 插入（無法比對任何密碼，需管理員重設）。
function lockedHash(): string {
  return `!locked-${crypto.randomUUID()}`;
}

function buildUpsert(env: Env, table: BackupTable, row: Record<string, unknown>) {
  const pk = primaryKey(table);
  const cols = Object.keys(row).filter(c => VALID_COLUMN.test(c));
  const insertCols = [...cols];
  const insertVals: (string | number | null)[] = cols.map(c => normalizeValue(row[c]));

  // users：匯出不含 password_hash → 新增時補鎖定 hash，更新時不覆蓋既有 hash。
  if (table === 'users' && !insertCols.includes('password_hash')) {
    insertCols.push('password_hash');
    insertVals.push(lockedHash());
  }

  const updateCols = cols.filter(c => c !== pk);
  const placeholders = insertCols.map(() => '?').join(', ');
  const conflict = updateCols.length
    ? `ON CONFLICT(${pk}) DO UPDATE SET ${updateCols.map(c => `${c} = excluded.${c}`).join(', ')}`
    : `ON CONFLICT(${pk}) DO NOTHING`;
  const sql = `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders}) ${conflict}`;
  return env.DB.prepare(sql).bind(...insertVals);
}

export async function importBackup(env: Env, data: BackupData): Promise<ImportSummary> {
  if (!data || typeof data !== 'object' || !data.tables) {
    throw new Error('備份格式無效：缺少 tables');
  }
  const summary: ImportSummary = { tables: {}, lockedUsers: 0 };

  for (const table of BACKUP_TABLES) {
    const rows = data.tables[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const pk = primaryKey(table);
    const existingResult = await env.DB.prepare(`SELECT ${pk} AS k FROM ${table}`).all<{ k: unknown }>();
    const existing = new Set((existingResult.results ?? []).map(r => String(r.k)));

    let inserted = 0;
    let updated = 0;
    const statements = [];
    for (const row of rows) {
      const keyValue = row[pk];
      if (keyValue === undefined || keyValue === null) continue; // 無主鍵的行跳過
      if (existing.has(String(keyValue))) updated++;
      else {
        inserted++;
        if (table === 'users' && !('password_hash' in row)) summary.lockedUsers++;
      }
      statements.push(buildUpsert(env, table, row));
    }

    // 分批送出，避免單次 batch 過大。
    const CHUNK = 40;
    for (let i = 0; i < statements.length; i += CHUNK) {
      await env.DB.batch(statements.slice(i, i + CHUNK));
    }
    summary.tables[table] = { inserted, updated };
  }

  return summary;
}
