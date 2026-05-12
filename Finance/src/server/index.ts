/// <reference types="@cloudflare/workers-types" />

import type { ExpenseStatus, MemberStatus, Role } from '../types';

type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  JWT_SECRET: string;
};

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  memberId: string | null;
};

const roleRank: Record<Role, number> = {
  member: 1,
  auditor: 2,
  finance_admin: 3,
  super_admin: 4
};

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

function error(message: string, status = 400) {
  return json({ error: message }, status);
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie.split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}

function base64Url(bytes: ArrayBuffer | Uint8Array) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  data.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value: string) {
  return base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function signToken(payload: SessionUser, secret: string) {
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'SHA-256', typ: 'JWT' })));
  const body = base64Url(new TextEncoder().encode(JSON.stringify({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 8 })));
  const signature = await sha256(`${header}.${body}.${secret}`);
  return `${header}.${body}.${signature}`;
}

async function verifyToken(token: string, secret: string): Promise<SessionUser | null> {
  try {
    const [header, body, signature] = token.split('.');
    if (!header || !body || !signature) return null;
    if (await sha256(`${header}.${body}.${secret}`) !== signature) return null;
    const paddedBody = body.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(body.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(paddedBody)) as SessionUser & { exp: number };
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return {
      id: parsed.id,
      name: parsed.name,
      email: parsed.email,
      role: parsed.role,
      memberId: parsed.memberId
    };
  } catch {
    return null;
  }
}

async function currentUser(request: Request, env: Env) {
  const token = getCookie(request, 'finance_session');
  return token ? verifyToken(decodeURIComponent(token), env.JWT_SECRET || 'dev-secret') : null;
}

async function requireUser(request: Request, env: Env, role: Role = 'member') {
  const user = await currentUser(request, env);
  if (!user) return error('Authentication required', 401);
  if (roleRank[user.role] < roleRank[role]) return error('Forbidden', 403);
  return user;
}

async function readJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function mapMember(row: any) {
  return {
    id: row.id,
    importPid: row.import_pid || null,
    name: row.name,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    partner: row.partner || '',
    email: row.email || '',
    phone: row.phone || '',
    homePhone: row.home_phone || '',
    groupId: row.group_id || null,
    groupName: row.group_name || undefined,
    status: row.status as MemberStatus,
    joinDate: row.join_date || '',
    address: row.address || '',
    city: row.city || '',
    stateRegion: row.state_region || '',
    postalCode: row.postal_code || '',
    notes: row.notes || '',
    avatarUrl: row.avatar_url || null,
    contactConfirmed: Boolean(row.contact_confirmed),
    externalContact: Boolean(row.external_contact),
    importSource: row.import_source || '',
    totalOffering: Number(row.total_offering || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOffering(row: any) {
  return {
    id: row.id,
    memberId: row.member_id || null,
    memberName: row.member_name || undefined,
    amount: Number(row.amount || 0),
    date: row.date,
    categoryId: row.category_id || null,
    categoryName: row.category_name || undefined,
    methodId: row.method_id || null,
    methodName: row.method_name || undefined,
    notes: row.notes || '',
    receiptUrl: row.receipt_url || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapExpense(row: any) {
  return {
    id: row.id,
    categoryId: row.category_id || null,
    categoryName: row.category_name || undefined,
    amount: Number(row.amount || 0),
    date: row.date,
    description: row.description || '',
    paidBy: row.paid_by || null,
    paidByName: row.paid_by_name || undefined,
    approvedBy: row.approved_by || null,
    approvedByName: row.approved_by_name || undefined,
    paymentMethod: row.payment_method || '',
    status: row.status as ExpenseStatus,
    receiptUrl: row.receipt_url || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listMembers(env: Env, url: URL) {
  const search = `%${url.searchParams.get('q') || ''}%`;
  const result = await env.DB.prepare(
    `SELECT m.*, g.name AS group_name, COALESCE(SUM(o.amount), 0) AS total_offering
     FROM members m
     LEFT JOIN member_groups g ON g.id = m.group_id
     LEFT JOIN offerings o ON o.member_id = m.id
     WHERE m.name LIKE ? OR m.email LIKE ? OR m.phone LIKE ?
     GROUP BY m.id
     ORDER BY m.name`
  ).bind(search, search, search).all();
  return json({ items: (result.results || []).map(mapMember), total: result.results?.length || 0 });
}

async function listOfferings(env: Env) {
  const result = await env.DB.prepare(
    `SELECT o.*, m.name AS member_name, c.name AS category_name, method.name AS method_name
     FROM offerings o
     LEFT JOIN members m ON m.id = o.member_id
     LEFT JOIN offering_categories c ON c.id = o.category_id
     LEFT JOIN offering_methods method ON method.id = o.method_id
     ORDER BY o.date DESC, o.created_at DESC`
  ).all();
  return json({ items: (result.results || []).map(mapOffering), total: result.results?.length || 0 });
}

async function getOffering(env: Env, offeringId: string) {
  const row = await env.DB.prepare(
    `SELECT o.*, m.name AS member_name, c.name AS category_name, method.name AS method_name
     FROM offerings o
     LEFT JOIN members m ON m.id = o.member_id
     LEFT JOIN offering_categories c ON c.id = o.category_id
     LEFT JOIN offering_methods method ON method.id = o.method_id
     WHERE o.id = ?`
  ).bind(offeringId).first();
  return row ? mapOffering(row) : null;
}

async function listExpenses(env: Env) {
  const result = await env.DB.prepare(
    `SELECT e.*, c.name AS category_name, paid.name AS paid_by_name, approved.name AS approved_by_name
     FROM expenses e
     LEFT JOIN expense_categories c ON c.id = e.category_id
     LEFT JOIN members paid ON paid.id = e.paid_by
     LEFT JOIN members approved ON approved.id = e.approved_by
     ORDER BY e.date DESC, e.created_at DESC`
  ).all();
  return json({ items: (result.results || []).map(mapExpense), total: result.results?.length || 0 });
}

async function getExpense(env: Env, expenseId: string) {
  const row = await env.DB.prepare(
    `SELECT e.*, c.name AS category_name, paid.name AS paid_by_name, approved.name AS approved_by_name
     FROM expenses e
     LEFT JOIN expense_categories c ON c.id = e.category_id
     LEFT JOIN members paid ON paid.id = e.paid_by
     LEFT JOIN members approved ON approved.id = e.approved_by
     WHERE e.id = ?`
  ).bind(expenseId).first();
  return row ? mapExpense(row) : null;
}

async function dashboard(env: Env) {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const previousWeek = new Date(startOfWeek);
  previousWeek.setDate(startOfWeek.getDate() - 7);
  const month = today.toISOString().slice(0, 7);
  const weekStart = startOfWeek.toISOString().slice(0, 10);
  const prevWeekStart = previousWeek.toISOString().slice(0, 10);

  const weekOffering = await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM offerings WHERE date >= ?').bind(weekStart).first<any>();
  const prevOffering = await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM offerings WHERE date >= ? AND date < ?').bind(prevWeekStart, weekStart).first<any>();
  const monthExpense = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE substr(date, 1, 7) = ? AND status = 'approved'").bind(month).first<any>();
  const budget = await env.DB.prepare('SELECT COALESCE(SUM(budget_monthly), 0) AS total FROM expense_categories').first<any>();
  const pending = await env.DB.prepare("SELECT COUNT(*) AS count FROM expenses WHERE status = 'pending'").first<any>();
  const newMembers = await env.DB.prepare('SELECT COUNT(*) AS count FROM members WHERE substr(join_date, 1, 7) = ?').bind(month).first<any>();
  const trend = await env.DB.prepare("SELECT substr(date, 1, 7) AS label, SUM(amount) AS amount FROM offerings GROUP BY label ORDER BY label DESC LIMIT 12").all<any>();
  const incomeExpense = await env.DB.prepare(
    `WITH months AS (
       SELECT substr(date, 1, 7) AS label FROM offerings
       UNION
       SELECT substr(date, 1, 7) AS label FROM expenses
     )
     SELECT months.label,
       COALESCE((SELECT SUM(amount) FROM offerings WHERE substr(date, 1, 7) = months.label), 0) AS offerings,
       COALESCE((SELECT SUM(amount) FROM expenses WHERE substr(date, 1, 7) = months.label AND status = 'approved'), 0) AS expenses
     FROM months ORDER BY months.label DESC LIMIT 6`
  ).all<any>();

  const current = Number(weekOffering?.total || 0);
  const previous = Number(prevOffering?.total || 0);
  return json({
    weekOfferingTotal: current,
    weekOfferingChange: previous ? Math.round(((current - previous) / previous) * 100) : 0,
    monthExpenseTotal: Number(monthExpense?.total || 0),
    monthBudgetRemaining: Number(budget?.total || 0) - Number(monthExpense?.total || 0),
    pendingExpenseCount: Number(pending?.count || 0),
    newMembersThisMonth: Number(newMembers?.count || 0),
    offeringTrend: (trend.results || []).reverse().map(row => ({ label: row.label, amount: Number(row.amount || 0) })),
    incomeExpense: (incomeExpense.results || []).reverse().map(row => ({ label: row.label, offerings: Number(row.offerings || 0), expenses: Number(row.expenses || 0) }))
  });
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        const payload = await readJson<{ email: string; password: string }>(request);
        const user = await env.DB.prepare('SELECT * FROM users WHERE lower(email) = lower(?) AND active = 1').bind(payload.email).first<any>();
        if (!user || (user.password_hash !== payload.password && user.password_hash !== await sha256(payload.password))) {
          return error('Email or password is incorrect', 401);
        }
        const sessionUser: SessionUser = { id: user.id, name: user.name, email: user.email, role: user.role, memberId: user.member_id || null };
        const token = await signToken(sessionUser, env.JWT_SECRET || 'dev-secret');
        return json({ user: sessionUser }, 200, { 'Set-Cookie': `finance_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800` });
      }

      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        return json({ ok: true }, 200, { 'Set-Cookie': 'finance_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
      }

      if (url.pathname === '/api/auth/me' && request.method === 'GET') {
        return json({ user: await currentUser(request, env) });
      }

      if (url.pathname.startsWith('/api/')) {
        const auth = await requireUser(request, env, 'auditor');
        if (auth instanceof Response) return auth;
        const user = auth;

        if (url.pathname === '/api/finance/dashboard') return dashboard(env);

        if (url.pathname === '/api/lookups') {
          const [groups, offeringCategories, offeringMethods, expenseCategories] = await Promise.all([
            env.DB.prepare('SELECT id, name, description, created_at AS createdAt FROM member_groups ORDER BY name').all(),
            env.DB.prepare('SELECT id, name, description, icon, created_at AS createdAt FROM offering_categories ORDER BY name').all(),
            env.DB.prepare('SELECT id, name, created_at AS createdAt FROM offering_methods ORDER BY name').all(),
            env.DB.prepare('SELECT id, name, budget_monthly AS budgetMonthly, description, created_at AS createdAt FROM expense_categories ORDER BY name').all()
          ]);
          return json({
            memberGroups: groups.results || [],
            offeringCategories: offeringCategories.results || [],
            offeringMethods: offeringMethods.results || [],
            expenseCategories: expenseCategories.results || []
          });
        }

        if (url.pathname === '/api/members' && request.method === 'GET') return listMembers(env, url);
        if (url.pathname === '/api/offerings' && request.method === 'GET') return listOfferings(env);
        if (url.pathname === '/api/expenses' && request.method === 'GET') return listExpenses(env);

        if (url.pathname === '/api/members' && request.method === 'POST') {
          if (roleRank[user.role] < roleRank.finance_admin) return error('Forbidden', 403);
          const payload = await readJson<any>(request);
          const itemId = id();
          await env.DB.prepare(
            `INSERT INTO members (
              id, import_pid, name, first_name, last_name, partner, email, phone, home_phone,
              group_id, status, join_date, address, city, state_region, postal_code, notes,
              avatar_url, contact_confirmed, external_contact, import_source, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            itemId,
            payload.importPid || null,
            payload.name,
            payload.firstName || null,
            payload.lastName || null,
            payload.partner || null,
            payload.email || null,
            payload.phone || null,
            payload.homePhone || null,
            payload.groupId || null,
            payload.status || 'active',
            payload.joinDate || now().slice(0, 10),
            payload.address || null,
            payload.city || null,
            payload.stateRegion || null,
            payload.postalCode || null,
            payload.notes || '',
            payload.avatarUrl || null,
            payload.contactConfirmed ? 1 : 0,
            payload.externalContact ? 1 : 0,
            payload.importSource || null,
            now(),
            now()
          ).run();
          const row = await env.DB.prepare('SELECT m.*, g.name AS group_name, 0 AS total_offering FROM members m LEFT JOIN member_groups g ON g.id = m.group_id WHERE m.id = ?').bind(itemId).first();
          return json(mapMember(row), 201);
        }

        if (url.pathname === '/api/offerings' && request.method === 'POST') {
          if (roleRank[user.role] < roleRank.finance_admin) return error('Forbidden', 403);
          const payload = await readJson<any>(request);
          const itemId = id();
          await env.DB.prepare(
            'INSERT INTO offerings (id, member_id, amount, date, category_id, method_id, notes, receipt_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(itemId, payload.memberId || null, Number(payload.amount), payload.date, payload.categoryId || null, payload.methodId || null, payload.notes || '', payload.receiptUrl || null, now(), now()).run();
          return json(await getOffering(env, itemId), 201);
        }

        if (url.pathname === '/api/expenses' && request.method === 'POST') {
          if (roleRank[user.role] < roleRank.finance_admin) return error('Forbidden', 403);
          const payload = await readJson<any>(request);
          const itemId = id();
          await env.DB.prepare(
            'INSERT INTO expenses (id, category_id, amount, date, description, paid_by, approved_by, payment_method, status, receipt_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(itemId, payload.categoryId || null, Number(payload.amount), payload.date, payload.description || '', payload.paidBy || null, null, payload.paymentMethod || '現金', 'pending', payload.receiptUrl || null, now(), now()).run();
          return json(await getExpense(env, itemId), 201);
        }

        if (url.pathname.match(/^\/api\/members\/[^/]+$/)) {
          if (roleRank[user.role] < roleRank.finance_admin) return error('Forbidden', 403);
          const itemId = decodeURIComponent(url.pathname.split('/').pop() || '');
          if (request.method === 'PUT') {
            const payload = await readJson<any>(request);
            await env.DB.prepare(
              `UPDATE members SET
                import_pid = ?, name = ?, first_name = ?, last_name = ?, partner = ?, email = ?,
                phone = ?, home_phone = ?, group_id = ?, status = ?, join_date = ?, address = ?,
                city = ?, state_region = ?, postal_code = ?, notes = ?, avatar_url = ?,
                contact_confirmed = ?, external_contact = ?, import_source = ?, updated_at = ?
               WHERE id = ?`
            ).bind(
              payload.importPid || null,
              payload.name,
              payload.firstName || null,
              payload.lastName || null,
              payload.partner || null,
              payload.email || null,
              payload.phone || null,
              payload.homePhone || null,
              payload.groupId || null,
              payload.status,
              payload.joinDate,
              payload.address || null,
              payload.city || null,
              payload.stateRegion || null,
              payload.postalCode || null,
              payload.notes || '',
              payload.avatarUrl || null,
              payload.contactConfirmed ? 1 : 0,
              payload.externalContact ? 1 : 0,
              payload.importSource || null,
              now(),
              itemId
            ).run();
            const row = await env.DB.prepare('SELECT m.*, g.name AS group_name, COALESCE(SUM(o.amount), 0) AS total_offering FROM members m LEFT JOIN member_groups g ON g.id = m.group_id LEFT JOIN offerings o ON o.member_id = m.id WHERE m.id = ? GROUP BY m.id').bind(itemId).first();
            return json(mapMember(row));
          }
          if (request.method === 'DELETE') {
            await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(itemId).run();
            return json({ ok: true });
          }
        }

        if (url.pathname.match(/^\/api\/offerings\/[^/]+$/)) {
          if (roleRank[user.role] < roleRank.finance_admin) return error('Forbidden', 403);
          const itemId = decodeURIComponent(url.pathname.split('/').pop() || '');
          if (request.method === 'PUT') {
            const payload = await readJson<any>(request);
            await env.DB.prepare('UPDATE offerings SET member_id = ?, amount = ?, date = ?, category_id = ?, method_id = ?, notes = ?, receipt_url = ?, updated_at = ? WHERE id = ?')
              .bind(payload.memberId || null, Number(payload.amount), payload.date, payload.categoryId || null, payload.methodId || null, payload.notes || '', payload.receiptUrl || null, now(), itemId).run();
            return json(await getOffering(env, itemId));
          }
          if (request.method === 'DELETE') {
            await env.DB.prepare('DELETE FROM offerings WHERE id = ?').bind(itemId).run();
            return json({ ok: true });
          }
        }

        if (url.pathname.match(/^\/api\/expenses\/[^/]+\/(approve|reject)$/) && request.method === 'POST') {
          if (roleRank[user.role] < roleRank.finance_admin) return error('Forbidden', 403);
          const [, , , itemId, action] = url.pathname.split('/');
          const status = action === 'approve' ? 'approved' : 'rejected';
          await env.DB.prepare('UPDATE expenses SET status = ?, approved_by = ?, updated_at = ? WHERE id = ?').bind(status, user.memberId, now(), itemId).run();
          return json(await getExpense(env, itemId));
        }

        if (url.pathname.match(/^\/api\/expenses\/[^/]+$/)) {
          if (roleRank[user.role] < roleRank.finance_admin) return error('Forbidden', 403);
          const itemId = decodeURIComponent(url.pathname.split('/').pop() || '');
          if (request.method === 'PUT') {
            const payload = await readJson<any>(request);
            await env.DB.prepare('UPDATE expenses SET category_id = ?, amount = ?, date = ?, description = ?, paid_by = ?, payment_method = ?, receipt_url = ?, updated_at = ? WHERE id = ?')
              .bind(payload.categoryId || null, Number(payload.amount), payload.date, payload.description || '', payload.paidBy || null, payload.paymentMethod || '現金', payload.receiptUrl || null, now(), itemId).run();
            return json(await getExpense(env, itemId));
          }
          if (request.method === 'DELETE') {
            await env.DB.prepare('DELETE FROM expenses WHERE id = ?').bind(itemId).run();
            return json({ ok: true });
          }
        }

        if (url.pathname === '/api/upload' && request.method === 'POST') {
          if (roleRank[user.role] < roleRank.finance_admin) return error('Forbidden', 403);
          const form = await request.formData();
          const file = form.get('file');
          const type = String(form.get('type') || 'files');
          const entityId = String(form.get('entityId') || id());
          if (!(file instanceof File)) return error('Missing file');
          const key = `${type}/${entityId}/${Date.now()}-${file.name}`;
          await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
          return json({ key, url: `/api/files/${encodeURIComponent(key)}` });
        }

        if (url.pathname.startsWith('/api/files/') && request.method === 'GET') {
          const key = decodeURIComponent(url.pathname.replace('/api/files/', ''));
          const object = await env.FILES.get(key);
          if (!object) return error('File not found', 404);
          return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream' } });
        }

        return error('Not found', 404);
      }

      return env.ASSETS.fetch(request);
    } catch (caught) {
      return error(caught instanceof Error ? caught.message : 'Unexpected server error', 500);
    }
  }
};

export default worker;
