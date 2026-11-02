/// <reference types="@cloudflare/workers-types" />

/**
 * A D1-compatible database over plain SQLite — each church's own database
 * inside its Durable Object (multi-church mode), or node:sqlite in tests.
 *
 * The finance API was written against D1 (`env.DB.prepare(...).bind(...).all()`),
 * so this keeps that exact surface: the same queries run unchanged on a
 * church's private database. See vpsDb.ts for the same idea over HTTPS.
 */

/** What a SQLite engine must offer: run one statement, and run a block atomically. */
export interface SqlEngine {
  exec(sql: string, params: unknown[]): { rows: Record<string, unknown>[]; changes: number };
  transaction<T>(fn: () => T): T;
}

/** D1 accepts booleans and treats undefined as an error; SQLite here wants 1/0 and null. */
function normalizeParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function result<T>(rows: Record<string, unknown>[], changes: number): D1Result<T> {
  return {
    results: rows as T[],
    success: true,
    meta: { changes, rows_written: changes, rows_read: rows.length, last_row_id: 0, duration: 0, changed_db: changes > 0, size_after: 0 },
  } as unknown as D1Result<T>;
}

export class SqlStatement {
  constructor(private readonly engine: SqlEngine, readonly sql: string, readonly params: unknown[] = []) {}

  /** Like D1: binding gives a new statement, so one prepared query can be bound many times. */
  bind(...values: unknown[]): SqlStatement {
    return new SqlStatement(this.engine, this.sql, values.map(normalizeParam));
  }

  /** Runs now, synchronously — used by batch() inside a transaction. */
  execute<T>(): D1Result<T> {
    const { rows, changes } = this.engine.exec(this.sql, this.params);
    return result<T>(rows, changes);
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const row = this.execute<Record<string, unknown>>().results[0];
    if (!row) return null;
    return (columnName ? row[columnName] : row) as T;
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    return this.execute<Record<string, unknown>>().results.map((row) => Object.values(row)) as T[];
  }
}

export class SqlDatabase {
  constructor(private readonly engine: SqlEngine) {}

  prepare(sql: string): SqlStatement {
    return new SqlStatement(this.engine, sql);
  }

  /** All or nothing, as in D1. */
  async batch<T = unknown>(statements: SqlStatement[]): Promise<D1Result<T>[]> {
    return this.engine.transaction(() => statements.map((statement) => statement.execute<T>()));
  }

  /** The engine itself, for schema work that is not a single prepared statement. */
  get sql(): SqlEngine {
    return this.engine;
  }

  /** Typed as D1, which is the surface the finance API is written against. */
  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

/** A Durable Object's own SQLite (ctx.storage) as an engine. */
export function durableObjectEngine(storage: DurableObjectStorage): SqlEngine {
  return {
    exec(sql, params) {
      const cursor = storage.sql.exec(sql, ...(params as (string | number | ArrayBuffer | null)[]));
      const rows = cursor.toArray() as Record<string, unknown>[];
      return { rows, changes: cursor.rowsWritten };
    },
    transaction(fn) {
      return storage.transactionSync(fn);
    },
  };
}
