import { DatabaseSync } from 'node:sqlite';
import { SqlDatabase, type SqlEngine } from '../server/sqlDb';

/** An in-memory SQLite engine for tests — the same engine shape a Durable Object provides. */
export function nodeSqliteEngine(db = new DatabaseSync(':memory:')): SqlEngine & { db: DatabaseSync } {
  let depth = 0;
  return {
    db,
    exec(sql, params) {
      const statement = db.prepare(sql);
      const columns = statement.columns();
      if (columns.length > 0) {
        return { rows: statement.all(...(params as never[])) as Record<string, unknown>[], changes: 0 };
      }
      const info = statement.run(...(params as never[]));
      return { rows: [], changes: Number(info.changes) };
    },
    transaction(fn) {
      // Durable Objects nest transactionSync as savepoints; so do we.
      const name = `sp${depth++}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const out = fn();
        db.exec(`RELEASE ${name}`);
        return out;
      } catch (error) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw error;
      } finally {
        depth--;
      }
    },
  };
}

export function memoryDatabase(): SqlDatabase & { node: ReturnType<typeof nodeSqliteEngine> } {
  const engine = nodeSqliteEngine();
  return Object.assign(new SqlDatabase(engine), { node: engine });
}
