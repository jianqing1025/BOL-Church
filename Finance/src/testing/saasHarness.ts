import { readFileSync } from 'node:fs';
import { ChurchRuntime } from '../server/churchStore';
import type { Env } from '../server/finance';
import { handleSaasRequest, type Mail, type SaasEnv } from '../server/saas';
import { memoryBucket } from './financeHarness';
import { memoryDatabase, nodeSqliteEngine } from './nodeSqlite';

/**
 * The whole multi-church app in memory: the platform worker, its database,
 * and a real church runtime per church (standing in for the Durable Objects).
 */
export function saasHarness() {
  const platform = memoryDatabase();
  platform.node.db.exec(readFileSync(new URL('../../migrations-platform/0001_platform.sql', import.meta.url), 'utf8'));
  const files = memoryBucket();
  const mail: Mail[] = [];
  const churches = new Map<string, ChurchRuntime>();

  const env = {
    PLATFORM_DB: platform.asD1(),
    FILES: files as unknown as R2Bucket,
    ASSETS: { fetch: async () => new Response('<!doctype html>app', { headers: { 'Content-Type': 'text/html' } }) } as unknown as Fetcher,
    JWT_SECRET: 'test-secret-that-is-long-enough-for-hmac-signing',
    FILES_URL: '',
    RESEND_API_KEY: '',
    MAIL_FROM: '',
    SAAS_MAIL_FROM: 'noreply@app.test',
    APP_NAME: 'Test Finance',
    MAILER: async (message: Mail) => { mail.push(message); },
  } as unknown as SaasEnv;

  const runtime = (id: string) => {
    let found = churches.get(id);
    if (!found) { found = new ChurchRuntime(nodeSqliteEngine(), env as unknown as Env); churches.set(id, found); }
    return found;
  };
  env.CHURCHES = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        const request = new Request(input, init);
        if (new URL(request.url).pathname === '/__church/destroy') { churches.delete(id); return new Response('{"ok":true}'); }
        return runtime(id).fetch(request);
      },
    }),
  } as unknown as DurableObjectNamespace;

  /** A browser: keeps its own session cookie. */
  function client() {
    let cookie = '';
    async function call<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; data: T }> {
      const res = await handleSaasRequest(new Request(`https://app.test${path}`, {
        method,
        headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }), env);
      const set = res.headers.get('Set-Cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      const text = await res.text();
      let data: unknown = text;
      try { data = JSON.parse(text); } catch { /* not JSON */ }
      return { status: res.status, data: data as T };
    }
    return { call, signOut: () => { cookie = ''; } };
  }

  /** The last code e-mailed to `to`. */
  const lastCode = (to: string) => mail.filter((m) => m.to === to).at(-1)?.text.match(/\b(\d{6})\b/)?.[1] ?? '';

  /** Signs up and verifies a new person; returns their browser. */
  async function signUp(email: string, name = '王司庫', password = 'correct horse battery') {
    const browser = client();
    await browser.call('POST', '/api/platform/register', { name, email, password });
    const verified = await browser.call('POST', '/api/platform/verify-email', { email, code: lastCode(email) });
    if (verified.status !== 200) throw new Error(`verify failed: ${JSON.stringify(verified.data)}`);
    return browser;
  }

  return { env, platform, files, mail, churches, client, lastCode, signUp };
}
