/// <reference types="@cloudflare/workers-types" />

type StatementRequest = { sql: string; params: unknown[]; mode?: 'run' | 'all' | 'first' };
type ApiResult = { success: boolean; results?: unknown[]; meta?: Record<string, unknown>; error?: string };

class RemoteStatement {
  private params: unknown[] = [];

  constructor(private readonly database: VpsDatabase, private readonly sql: string) {}

  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.database.execute<T>({ sql: this.sql, params: this.params, mode: 'run' });
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.database.execute<T>({ sql: this.sql, params: this.params, mode: 'all' });
  }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const result = await this.database.execute<T>({ sql: this.sql, params: this.params, mode: 'first' });
    const row = result.results?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return (columnName ? row[columnName] : row) as T;
  }

  toRemoteStatement() {
    return { sql: this.sql, params: this.params };
  }
}

export class VpsDatabase {
  constructor(private readonly endpoint: string, private readonly token: string) {}

  prepare(sql: string) {
    return new RemoteStatement(this, sql);
  }

  async batch<T = unknown>(statements: RemoteStatement[]): Promise<D1Result<T>[]> {
    const response = await this.request<{ results: ApiResult[] }>('/db/batch', {
      statements: statements.map(statement => statement.toRemoteStatement())
    });
    return response.results as D1Result<T>[];
  }

  async execute<T>(statement: StatementRequest): Promise<D1Result<T>> {
    const result = await this.request<ApiResult>('/db/query', statement);
    return {
      success: true,
      results: (result.results || []) as T[],
      meta: (result.meta || {}) as D1Result<T>['meta']
    };
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.endpoint.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000)
    });
    const result = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(result.error || `VPS database request failed (${response.status})`);
    return result;
  }
}
