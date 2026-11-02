import { CHURCH_MIGRATIONS, CHURCH_SCHEMA } from './churchSchema';
import type { SqlEngine } from './sqlDb';

/**
 * A church's own database (multi-church mode): created from the schema
 * snapshot the first time it is opened, then brought up to date with any
 * later migrations — each recorded, so each runs exactly once.
 */

const LEDGER = '_church_migrations';
const BASELINE = 'baseline';

/**
 * Splits a migration file into statements: on `;` outside quotes and comments.
 * PRAGMA lines are dropped — a Durable Object's SQLite does not allow them, and
 * every migration here uses them only to bracket a table rebuild.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; current += ch; continue; }
    if (ch === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; current += '\n'; continue; }
    if (ch === '/' && sql[i + 1] === '*') { i = sql.indexOf('*/', i + 2); if (i < 0) break; i++; continue; }
    if (ch === ';') { out.push(current); current = ''; continue; }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter((s) => s && !/^PRAGMA\b/i.test(s));
}

const now = () => new Date().toISOString();

/** What a new church starts with: common offering kinds, ways to give, and expense headings. */
export const DEFAULT_OFFERING_CATEGORIES: readonly [id: string, name: string, icon: string][] = [
  ['cat-sunday', '主日奉獻 Sunday Offering', 'church'],
  ['cat-tithe', '十一奉獻 Tithe', 'gift'],
  ['cat-thanks', '感恩奉獻 Thanksgiving', 'sparkles'],
  ['cat-building', '建堂奉獻 Building Fund', 'gift'],
  ['cat-mission', '宣教奉獻 Missions', 'gift'],
  ['cat-mercy', '慈惠奉獻 Benevolence', 'hands'],
  ['cat-other', '其他收入 Other Income', 'gift'],
];

export const DEFAULT_OFFERING_METHODS: readonly [id: string, name: string, group: string, order: number][] = [
  ['method-cash', '現金 Cash', 'Cash', 10],
  ['method-check', '支票 Check', 'Check', 20],
  ['method-zelle', 'Zelle', 'Electronic', 30],
  ['method-online', '線上奉獻 Online', 'Electronic', 31],
  ['method-transfer', '銀行轉帳 Bank Transfer', 'Electronic', 32],
];

export const DEFAULT_EXPENSE_CATEGORIES: readonly [id: string, name: string, shortName: string][] = [
  ['exp-facility', 'Facility 房屋設施（租金、貸款、保險）', '房屋設施'],
  ['exp-utility', 'Utilities 水電網路', '水電網路'],
  ['exp-payroll', 'Payroll & Benefits 薪資福利', '薪資福利'],
  ['exp-ministry', 'Ministry 事工活動', '事工活動'],
  ['exp-mission', 'Missions 宣教', '宣教'],
  ['exp-mercy', 'Benevolence 慈惠', '慈惠'],
  ['exp-equipment', 'Equipment & Supplies 設備耗材', '設備耗材'],
  ['exp-misc', 'Miscellaneous 雜項', '雜項'],
];

function seedDefaults(engine: SqlEngine) {
  const at = now();
  for (const [id, name, icon] of DEFAULT_OFFERING_CATEGORIES) {
    engine.exec('INSERT INTO offering_categories (id, name, description, icon, created_at) VALUES (?, ?, ?, ?, ?)', [id, name, '', icon, at]);
  }
  for (const [id, name, group, order] of DEFAULT_OFFERING_METHODS) {
    engine.exec('INSERT INTO offering_methods (id, name, group_name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)', [id, name, group, order, at]);
  }
  for (const [id, name, shortName] of DEFAULT_EXPENSE_CATEGORIES) {
    engine.exec('INSERT INTO expense_categories (id, name, short_name, budget_monthly, description, created_at) VALUES (?, ?, ?, 0, ?, ?)', [id, name, shortName, '', at]);
  }
}

/** Brings a church's database up to date; cheap to call on every open. Returns what it applied. */
export function ensureChurchSchema(engine: SqlEngine): string[] {
  engine.exec(`CREATE TABLE IF NOT EXISTS ${LEDGER} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`, []);
  const done = new Set(engine.exec(`SELECT name FROM ${LEDGER}`, []).rows.map((r) => String(r.name)));
  const applied: string[] = [];
  if (!done.has(BASELINE)) {
    engine.transaction(() => {
      for (const statement of CHURCH_SCHEMA) engine.exec(statement, []);
      seedDefaults(engine);
      engine.exec(`INSERT INTO ${LEDGER} (name, applied_at) VALUES (?, ?)`, [BASELINE, now()]);
    });
    applied.push(BASELINE);
  }
  for (const migration of CHURCH_MIGRATIONS) {
    if (done.has(migration.name)) continue;
    engine.transaction(() => {
      for (const statement of splitStatements(migration.sql)) engine.exec(statement, []);
      engine.exec(`INSERT INTO ${LEDGER} (name, applied_at) VALUES (?, ?)`, [migration.name, now()]);
    });
    applied.push(migration.name);
  }
  return applied;
}
