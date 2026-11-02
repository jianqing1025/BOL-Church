import { describe, expect, it } from 'vitest';
import { memoryDatabase } from '../testing/nodeSqlite';
import { DEFAULT_OFFERING_CATEGORIES, ensureChurchSchema, splitStatements } from './churchDb';
import { CHURCH_MIGRATIONS } from './churchSchema';

const tables = (db: ReturnType<typeof memoryDatabase>) =>
  db.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name", []).rows.map((r) => r.name);

describe('ensureChurchSchema', () => {
  it('creates a new church with every finance table and the defaults, and no BOLCCOP data', () => {
    const db = memoryDatabase();
    const applied = ensureChurchSchema(db.sql);
    expect(applied[0]).toBe('baseline');
    expect(applied.slice(1)).toEqual(CHURCH_MIGRATIONS.map((m) => m.name));
    for (const table of ['members', 'offerings', 'offering_categories', 'offering_methods', 'expenses', 'expense_categories', 'users', 'audit_logs', 'app_settings', 'reconciliations', 'upload_sessions']) {
      expect(tables(db)).toContain(table);
    }
    const count = (table: string) => Number(db.sql.exec(`SELECT COUNT(*) AS c FROM ${table}`, []).rows[0].c);
    expect(count('offering_categories')).toBe(DEFAULT_OFFERING_CATEGORIES.length);
    expect(count('offering_methods')).toBeGreaterThan(0);
    expect(count('expense_categories')).toBeGreaterThan(0);
    expect(count('users')).toBe(0);
    expect(count('members')).toBe(0);
    expect(count('offerings')).toBe(0);
  });

  it('brings in later migrations (the reconciliation deposits column)', () => {
    const db = memoryDatabase();
    ensureChurchSchema(db.sql);
    const columns = db.sql.exec('PRAGMA table_info(reconciliations)', []).rows.map((r) => r.name);
    expect(columns).toContain('deposits');
  });

  it('does nothing the second time', () => {
    const db = memoryDatabase();
    ensureChurchSchema(db.sql);
    expect(ensureChurchSchema(db.sql)).toEqual([]);
  });
});

describe('splitStatements', () => {
  it('splits on semicolons outside quotes and drops comments and PRAGMAs', () => {
    expect(splitStatements(`PRAGMA foreign_keys=OFF;
-- a comment; with a semicolon
INSERT INTO t VALUES ('a;b');
/* block; */ UPDATE t SET x = 1;`)).toEqual(["INSERT INTO t VALUES ('a;b')", 'UPDATE t SET x = 1']);
  });
});
