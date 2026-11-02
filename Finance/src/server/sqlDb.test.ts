import { describe, expect, it } from 'vitest';
import { memoryDatabase } from '../testing/nodeSqlite';

function setup() {
  const db = memoryDatabase();
  db.sql.exec('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER, flag INTEGER)', []);
  return db;
}

describe('SqlDatabase (D1-compatible)', () => {
  it('runs prepared statements the way the finance API calls D1', async () => {
    const db = setup();
    const insert = db.prepare('INSERT INTO t (id, n, flag) VALUES (?, ?, ?)');
    await insert.bind('a', 1, true).run();
    await insert.bind('b', 2, false).run();
    const all = await db.prepare('SELECT * FROM t ORDER BY id').all<{ id: string; n: number; flag: number }>();
    expect(all.success).toBe(true);
    expect(all.results).toEqual([{ id: 'a', n: 1, flag: 1 }, { id: 'b', n: 2, flag: 0 }]);
    expect(await db.prepare('SELECT n FROM t WHERE id = ?').bind('b').first('n')).toBe(2);
    expect(await db.prepare('SELECT * FROM t WHERE id = ?').bind('zz').first()).toBeNull();
  });

  it('treats undefined as NULL', async () => {
    const db = setup();
    await db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').bind('u', undefined).run();
    expect(await db.prepare('SELECT n FROM t WHERE id = ?').bind('u').first('n')).toBeNull();
  });

  it('applies a batch all or nothing', async () => {
    const db = setup();
    const insert = db.prepare('INSERT INTO t (id, n) VALUES (?, ?)');
    await expect(db.batch([insert.bind('x', 1), insert.bind('x', 2)])).rejects.toThrow();
    expect((await db.prepare('SELECT COUNT(*) AS c FROM t').first<{ c: number }>())!.c).toBe(0);
    await db.batch([insert.bind('x', 1), insert.bind('y', 2)]);
    expect((await db.prepare('SELECT COUNT(*) AS c FROM t').first<{ c: number }>())!.c).toBe(2);
  });

  it('reports how many rows a write changed', async () => {
    const db = setup();
    await db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').bind('a', 1).run();
    const res = await db.prepare('UPDATE t SET n = 5').run();
    expect(res.meta.changes).toBe(1);
  });
});
