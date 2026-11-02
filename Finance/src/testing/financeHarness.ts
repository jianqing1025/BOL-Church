import { ensureChurchSchema } from '../server/churchDb';
import { handleFinanceRequest, type Env, type SessionUser } from '../server/finance';
import { memoryDatabase } from './nodeSqlite';

/** Just enough of R2 for uploads and downloads. */
export function memoryBucket() {
  const objects = new Map<string, { body: ArrayBuffer; type?: string }>();
  return {
    objects,
    async put(key: string, value: ReadableStream | ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string } }) {
      const body = await new Response(value as BodyInit).arrayBuffer();
      objects.set(key, { body, type: options?.httpMetadata?.contentType });
      return { key };
    },
    async get(key: string) {
      const found = objects.get(key);
      return found ? { body: new Response(found.body).body, httpMetadata: { contentType: found.type } } : null;
    },
    async delete(keys: string | string[]) { for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key); },
    async list(options: { prefix?: string } = {}) {
      const keys = [...objects.keys()].filter((key) => key.startsWith(options.prefix ?? ''));
      return { objects: keys.map((key) => ({ key })), truncated: false, cursor: undefined };
    },
  };
}

/**
 * A church's finance API exactly as its Durable Object runs it: the real
 * handler, a fresh SQLite database, and a person already signed in.
 */
export function churchHarness(user: Partial<SessionUser> = {}) {
  const db = memoryDatabase();
  ensureChurchSchema(db.sql);
  const session: SessionUser = { id: 'acct-1', name: '王司庫', email: 'treasurer@example.org', role: 'super_admin', memberId: null, ...user };
  db.sql.exec(
    'INSERT INTO users (id, name, email, role, member_id, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, 1, ?, ?)',
    [session.id, session.name, session.email, session.role, '', new Date().toISOString(), new Date().toISOString()],
  );
  const files = memoryBucket();
  const env = {
    DB: db.asD1(),
    FILES: files as unknown as R2Bucket,
    ASSETS: { fetch: async () => new Response('app', { status: 200 }) } as unknown as Fetcher,
    JWT_SECRET: '',
    FILES_URL: '',
    RESEND_API_KEY: '',
    MAIL_FROM: '',
    SESSION_OVERRIDE: session,
  } satisfies Env;

  async function call<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const response = await handleFinanceRequest(new Request(`https://church.test${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
    const text = await response.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, data: data as T };
  }

  return { db, env, files, session, call };
}
