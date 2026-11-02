import { describe, expect, it } from 'vitest';
import { churchHarness } from '../testing/financeHarness';

/**
 * The finance API, unchanged, on a church's own SQLite database: what every
 * church in the multi-church app runs. If a query only works on D1, it fails here.
 */
describe('finance API on a church database', () => {
  it('answers every read endpoint the app loads on start', async () => {
    const { call } = churchHarness();
    for (const path of ['/api/lookups', '/api/members', '/api/members/names', '/api/offerings', '/api/expenses', '/api/finance/dashboard', '/api/settings', '/api/audit-logs', '/api/reconciliations', '/api/users']) {
      const res = await call('GET', path);
      expect(res.status, `${path}: ${JSON.stringify(res.data).slice(0, 200)}`).toBe(200);
    }
  });

  it('records a member and an offering, and shows them back', async () => {
    const { call } = churchHarness();
    const lookups = (await call('GET', '/api/lookups')).data;
    const member = await call('POST', '/api/members', { name: '陳弟兄', email: 'chen@example.org' });
    expect(member.status).toBe(201);
    const offering = await call('POST', '/api/offerings', {
      memberId: member.data.id, amount: 100, date: '2026-10-25',
      categoryId: lookups.offeringCategories[0].id, methodId: lookups.offeringMethods[0].id,
    });
    expect(offering.status, JSON.stringify(offering.data)).toBe(201);
    const list = await call('GET', '/api/offerings');
    expect(list.data.total).toBe(1);
    expect(list.data.items[0]).toMatchObject({ amount: 100, memberId: member.data.id });
    const audit = await call('GET', '/api/audit-logs');
    expect(audit.data.total).toBeGreaterThanOrEqual(2);
  });

  it('submits and approves an expense', async () => {
    const { call } = churchHarness();
    const lookups = (await call('GET', '/api/lookups')).data;
    const created = await call('POST', '/api/expenses', { categoryId: lookups.expenseCategories[0].id, amount: 42.5, date: '2026-10-20', description: '影印紙' });
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    const approved = await call('POST', `/api/expenses/${created.data.id}/approve`, {});
    expect(approved.status, JSON.stringify(approved.data)).toBeLessThan(300);
    const dashboard = await call('GET', '/api/finance/dashboard');
    expect(dashboard.status).toBe(200);
  });

  it('exports a backup of the whole church', async () => {
    const { call } = churchHarness();
    await call('POST', '/api/members', { name: '林姊妹' });
    const backup = await call('GET', '/api/backup/export');
    expect(backup.status).toBe(200);
  });
});
