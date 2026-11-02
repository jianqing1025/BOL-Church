import { describe, expect, it } from 'vitest';
import { saasHarness } from '../testing/saasHarness';

describe('signing up and starting a church', () => {
  it('registers, verifies by e-mailed code, creates a church as its super admin, and records an offering', async () => {
    const app = saasHarness();
    const browser = app.client();
    const reg = await browser.call('POST', '/api/platform/register', { name: '王司庫', email: 'Wang@Grace.test', password: 'correct horse battery' });
    expect(reg.status).toBe(201);
    expect(app.mail.at(-1)!.to).toBe('wang@grace.test');

    // Not verified yet: no way in.
    expect((await browser.call('POST', '/api/auth/login', { email: 'wang@grace.test', password: 'correct horse battery' })).data.code).toBe('email_unverified');
    expect((await browser.call('POST', '/api/platform/verify-email', { email: 'wang@grace.test', code: '000000' })).status).toBe(400);

    const verified = await browser.call('POST', '/api/platform/verify-email', { email: 'wang@grace.test', code: app.lastCode('wang@grace.test') });
    expect(verified.status).toBe(200);
    expect(verified.data.account.email).toBe('wang@grace.test');
    expect(verified.data.church).toBeNull();

    // Before a church exists the finance API says so.
    expect((await browser.call('GET', '/api/lookups')).data.code).toBe('no_church');

    const created = await browser.call('POST', '/api/platform/churches', { name: 'Grace Chinese Church', declaredSize: 80 });
    expect(created.status).toBe(200);
    expect(created.data.user.role).toBe('super_admin');
    expect(created.data.church).toMatchObject({ name: 'Grace Chinese Church', declaredSize: 80, plan: { writable: true, needsSubscription: false } });

    const lookups = (await browser.call('GET', '/api/lookups')).data;
    const member = await browser.call('POST', '/api/members', { name: '陳弟兄' });
    expect(member.status).toBe(201);
    const offering = await browser.call('POST', '/api/offerings', {
      memberId: member.data.id, amount: 50, date: '2026-10-25',
      categoryId: lookups.offeringCategories[0].id, methodId: lookups.offeringMethods[0].id,
    });
    expect(offering.status).toBe(201);

    const settings = (await browser.call('GET', '/api/settings')).data;
    expect(settings.taxStatement.textFields.churchNameEn).toBe('Grace Chinese Church');
    expect(JSON.stringify(settings)).not.toMatch(/Bread of Life|bolccop/i);
  });

  it('refuses a wrong password and an address that is already registered', async () => {
    const app = saasHarness();
    await app.signUp('a@grace.test');
    const other = app.client();
    expect((await other.call('POST', '/api/auth/login', { email: 'a@grace.test', password: 'wrong password!' })).status).toBe(401);
    expect((await other.call('POST', '/api/platform/register', { name: 'x', email: 'a@grace.test', password: 'another password' })).data.code).toBe('email_taken');
  });

  it('works with the session as a Bearer token, as the iPhone app sends it', async () => {
    const app = saasHarness();
    const browser = app.client();
    await browser.call('POST', '/api/platform/register', { name: '王', email: 'b@grace.test', password: 'correct horse battery' });
    const verified = await browser.call('POST', '/api/platform/verify-email', { email: 'b@grace.test', code: app.lastCode('b@grace.test') });
    const phone = app.client();
    const me = await phone.call('GET', '/api/auth/me', undefined, { Authorization: `Bearer ${verified.data.token}` });
    expect(me.data.account.email).toBe('b@grace.test');
  });
});

describe('each church sees only its own books', () => {
  it('keeps two churches apart, even when someone tries to switch into the other', async () => {
    const app = saasHarness();
    const a = await app.signUp('a@one.test');
    await a.call('POST', '/api/platform/churches', { name: 'Church One', declaredSize: 50 });
    await a.call('POST', '/api/members', { name: '只屬於一堂' });

    const b = await app.signUp('b@two.test');
    const two = await b.call('POST', '/api/platform/churches', { name: 'Church Two', declaredSize: 50 });
    expect((await b.call('GET', '/api/members')).data.items).toHaveLength(0);

    const one = (await a.call('GET', '/api/auth/me')).data.church.id;
    expect((await b.call('POST', '/api/platform/switch-church', { churchId: one })).status).toBe(403);
    expect(two.data.church.id).not.toBe(one);
  });
});

describe('the 100-person line', () => {
  it('keeps a church declared over 100 read-only until it subscribes', async () => {
    const app = saasHarness();
    const browser = await app.signUp('big@church.test');
    const created = await browser.call('POST', '/api/platform/churches', { name: 'Big Church', declaredSize: 250 });
    expect(created.data.church.plan).toEqual({ needsSubscription: true, subscribed: false, writable: false });
    expect((await browser.call('GET', '/api/lookups')).status).toBe(200);
    const blocked = await browser.call('POST', '/api/members', { name: '新朋友' });
    expect(blocked.status).toBe(402);
    expect(blocked.data.code).toBe('subscription_required');

    app.platform.node.exec("INSERT INTO entitlements (church_id, source, product, status, expires_at, updated_at) VALUES (?, 'apple', 'pro_monthly', 'active', ?, ?)",
      [created.data.church.id, new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString()]);
    expect((await browser.call('POST', '/api/members', { name: '新朋友' })).status).toBe(201);
  });

  it('lets the super admin change the declared size', async () => {
    const app = saasHarness();
    const browser = await app.signUp('s@church.test');
    await browser.call('POST', '/api/platform/churches', { name: 'Small Church', declaredSize: 60 });
    const updated = await browser.call('PUT', '/api/platform/church', { declaredSize: 120 });
    expect(updated.data.church.plan.writable).toBe(false);
  });
});

describe('the team (用戶管理)', () => {
  it('adds a treasurer with a starting password, who then signs in to that church only', async () => {
    const app = saasHarness();
    const admin = await app.signUp('admin@grace.test');
    await admin.call('POST', '/api/platform/churches', { name: 'Grace', declaredSize: 40 });
    const added = await admin.call('POST', '/api/users', { name: '李會計', email: 'li@grace.test', role: 'finance_admin', password: 'starting password' });
    expect(added.status).toBe(201);
    expect((await admin.call('GET', '/api/users')).data.total).toBe(2);

    const li = app.client();
    const login = await li.call('POST', '/api/auth/login', { email: 'li@grace.test', password: 'starting password' });
    expect(login.data.user.role).toBe('finance_admin');
    expect((await li.call('GET', '/api/users')).status).toBe(403);

    // Removing them takes them out of the church at once.
    expect((await admin.call('DELETE', `/api/users/${added.data.id}`)).status).toBe(200);
    expect((await li.call('GET', '/api/lookups')).data.code).toBe('no_church');
  });

  it('never lets the last super admin go', async () => {
    const app = saasHarness();
    const admin = await app.signUp('only@grace.test');
    const me = (await admin.call('POST', '/api/platform/churches', { name: 'Grace', declaredSize: 40 })).data;
    expect((await admin.call('PUT', `/api/users/${me.account.id}`, { role: 'auditor' })).status).toBe(400);
  });

  it('will not reset the password of someone who also serves another church', async () => {
    const app = saasHarness();
    const one = await app.signUp('one@a.test');
    await one.call('POST', '/api/platform/churches', { name: 'A', declaredSize: 10 });
    const shared = await one.call('POST', '/api/users', { name: '共用', email: 'shared@x.test', role: 'auditor', password: 'starting password' });
    const two = await app.signUp('two@b.test');
    await two.call('POST', '/api/platform/churches', { name: 'B', declaredSize: 10 });
    await two.call('POST', '/api/users', { name: '共用', email: 'shared@x.test', role: 'auditor' });
    expect((await two.call('POST', `/api/users/${shared.data.id}/reset-password`, { password: 'taken over!!' })).status).toBe(403);
  });
});

describe('passwords and leaving', () => {
  it('resets a forgotten password by e-mailed link and signs out other devices', async () => {
    const app = saasHarness();
    const old = await app.signUp('r@grace.test');
    await old.call('POST', '/api/platform/churches', { name: 'Grace', declaredSize: 10 });
    await app.client().call('POST', '/api/auth/forgot-password', { email: 'r@grace.test' });
    const link = app.mail.at(-1)!.text.match(/reset=([^\s]+)/)![1];
    const reset = await app.client().call('POST', '/api/auth/reset-password', { token: decodeURIComponent(link), password: 'a brand new password' });
    expect(reset.status).toBe(200);
    expect((await old.call('GET', '/api/auth/me')).data.account).toBeNull();
    expect((await app.client().call('POST', '/api/auth/login', { email: 'r@grace.test', password: 'a brand new password' })).status).toBe(200);
  });

  it('deletes an account and the church only it used, data and files', async () => {
    const app = saasHarness();
    const browser = await app.signUp('bye@grace.test');
    const church = (await browser.call('POST', '/api/platform/churches', { name: 'Alone', declaredSize: 5 })).data.church;
    await browser.call('POST', '/api/members', { name: '某人' });
    await app.files.put(`churches/${church.id}/receipt/x.png`, 'x');
    expect(app.churches.has(church.id)).toBe(true);
    expect((await browser.call('POST', '/api/platform/delete-account', { password: 'correct horse battery' })).status).toBe(200);
    expect(app.churches.has(church.id)).toBe(false);
    expect([...app.files.objects.keys()].some((k) => k.startsWith(`churches/${church.id}/`))).toBe(false);
    expect((await app.client().call('POST', '/api/auth/login', { email: 'bye@grace.test', password: 'correct horse battery' })).status).toBe(401);
  });

  it('asks a sole super admin with a team to hand over first', async () => {
    const app = saasHarness();
    const admin = await app.signUp('lead@grace.test');
    await admin.call('POST', '/api/platform/churches', { name: 'Grace', declaredSize: 10 });
    await admin.call('POST', '/api/users', { name: '同工', email: 'helper@grace.test', role: 'counter', password: 'starting password' });
    const res = await admin.call('POST', '/api/platform/delete-account', { password: 'correct horse battery' });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe('sole_admin');
  });
});

describe('a church’s public pages', () => {
  it('serves the claim form under the church’s own address, and nothing for an unknown church', async () => {
    const app = saasHarness();
    const admin = await app.signUp('p@grace.test');
    const church = (await admin.call('POST', '/api/platform/churches', { name: 'Grace', declaredSize: 10 })).data.church;
    const visitor = app.client();
    expect((await visitor.call('GET', `/c/${church.id}/api/public/claim-options`)).status).toBe(200);
    expect((await visitor.call('GET', '/c/00000000-0000-4000-8000-000000000000/api/public/claim-options')).status).toBe(404);
    // A visitor gets the app, not the finance API, without a session.
    expect((await visitor.call('GET', '/api/members')).status).toBe(401);
  });
});
