import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryBucket } from '../testing/financeHarness';
import { nodeSqliteEngine } from '../testing/nodeSqlite';
import { CHURCH_CONTEXT_HEADER, ChurchRuntime, encodeChurchContext, type ChurchContext } from './churchStore';
import type { Env, SessionUser } from './finance';

const admin: SessionUser = { id: 'acct-1', name: '王司庫', email: 'wang@example.org', role: 'super_admin', memberId: null };

function church(churchId = 'church-a') {
  const engine = nodeSqliteEngine();
  const files = memoryBucket();
  const runtime = new ChurchRuntime(engine, {
    FILES: files as unknown as R2Bucket,
    ASSETS: { fetch: async () => new Response('app') } as unknown as Fetcher,
    JWT_SECRET: '', FILES_URL: '', RESEND_API_KEY: 're_test', MAIL_FROM: '',
    SAAS_MAIL_FROM: 'noreply@app.test',
  } as unknown as Env);
  const call = async (method: string, path: string, body?: unknown, context: Partial<ChurchContext> = {}) => {
    const ctx: ChurchContext = { churchId, user: admin, writable: true, ...context };
    const res = await runtime.fetch(new Request(`https://app.test${path}`, {
      method,
      headers: { [CHURCH_CONTEXT_HEADER]: encodeChurchContext(ctx), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    const text = await res.text();
    try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: text as any }; }
  };
  return { engine, files, call };
}

describe('a church in its Durable Object', () => {
  it('sets itself up on first use and mirrors who is signed in', async () => {
    const { engine, call } = church();
    const res = await call('GET', '/api/lookups');
    expect(res.status).toBe(200);
    expect(res.data.offeringCategories.length).toBeGreaterThan(0);
    const users = engine.exec('SELECT id, name, role FROM users', []).rows;
    expect(users).toEqual([{ id: 'acct-1', name: '王司庫', role: 'super_admin' }]);
  });

  it('starts with its own name on tax statements, never BOLCCOP’s', async () => {
    const { call } = church();
    await call('POST', '/__church/init', { name: 'Grace Chinese Church', mailFrom: 'Grace Chinese Church via App <noreply@app.test>', replyTo: 'pastor@grace.test' });
    const settings = (await call('GET', '/api/settings')).data;
    const text = JSON.stringify(settings);
    expect(text).toContain('Grace Chinese Church');
    expect(text).not.toMatch(/Bread of Life|bolccop|Issaquah|LingLing/i);
    expect(settings.taxStatement.signatureUrl).toBe('');
  });

  it('keeps reading and exporting open but refuses changes without a needed subscription', async () => {
    const { call } = church();
    const blocked = await call('POST', '/api/members', { name: '新朋友' }, { writable: false });
    expect(blocked.status).toBe(402);
    expect(blocked.data.code).toBe('subscription_required');
    expect((await call('GET', '/api/members', undefined, { writable: false })).status).toBe(200);
    expect((await call('GET', '/api/backup/export', undefined, { writable: false })).status).toBe(200);
    expect((await call('POST', '/api/members', { name: '新朋友' })).status).toBe(201);
  });

  it('files uploads under the church’s own folder and links them back through it', async () => {
    const { files, call } = church('church-b');
    const form = new FormData();
    form.append('file', new File(['receipt'], 'r.png', { type: 'image/png' }));
    form.append('type', 'receipt');
    const res = await (async () => {
      const ctx: ChurchContext = { churchId: 'church-b', user: admin, writable: true };
      const runtime = new ChurchRuntime(nodeSqliteEngine(), { FILES: files, ASSETS: { fetch: async () => new Response('') } } as unknown as Env);
      const r = await runtime.fetch(new Request('https://app.test/api/upload', { method: 'POST', headers: { [CHURCH_CONTEXT_HEADER]: encodeChurchContext(ctx) }, body: form }));
      return r.json() as Promise<{ key: string; url: string }>;
    })();
    expect(res.url.startsWith('/c/church-b/api/files/receipt/')).toBe(true);
    expect([...files.objects.keys()][0].startsWith('churches/church-b/receipt/')).toBe(true);
  });

  it('accepts public requests without a person (the claim form)', async () => {
    const { call } = church();
    const options = await call('GET', '/api/public/claim-options', undefined, { user: null });
    expect(options.status).toBe(200);
  });
});

describe('mail from a church in the multi-church app', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('always goes out from the app’s own address, keeping only the name the church chose', async () => {
    const { call } = church();
    await call('POST', '/__church/init', { name: 'Grace', mailFrom: 'Grace <noreply@app.test>', replyTo: 'pastor@grace.test' });
    const settings = (await call('GET', '/api/settings')).data;
    settings.expenseNotify = { ...settings.expenseNotify, enabled: true, recipients: ['treasurer@grace.test'], mailFrom: 'Evil <ceo@bank.test>' };
    expect((await call('PUT', '/api/settings', settings)).status).toBe(200);

    const sent: Array<{ from: string; reply_to?: string }> = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response('{"id":"x"}', { status: 200 });
    });
    await call('POST', '/api/settings/expense-notify/test', {});
    expect(sent).toHaveLength(1);
    expect(sent[0].from).toBe('"Evil" <noreply@app.test>');
    expect(sent[0].reply_to).toBe('pastor@grace.test');
  });
});
