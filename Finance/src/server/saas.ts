/// <reference types="@cloudflare/workers-types" />
import { CHURCH_CONTEXT_HEADER, encodeChurchContext, type ChurchContext, type ChurchInit, type ChurchUserRecord } from './churchStore';
import type { Env, SessionUser } from './finance';
import { hashPassword, randomToken, sha256, signSession, sixDigitCode, verifyPassword, verifySession, SESSION_HOURS, type SessionClaims } from './platform/crypto';
import { churchPlan, type ChurchPlan } from './platform/plan';
import type { Role } from '../types';

/**
 * The multi-church app (MODE=saas): accounts, churches and team on a small
 * platform database; each church's finance data in its own Durable Object
 * (ChurchStore). The single-church deployment (BOLCCOP) does not use this file.
 */

export type SaasEnv = Env & {
  PLATFORM_DB: D1Database;
  CHURCHES: DurableObjectNamespace;
  /** The app's sender address for codes and notices, e.g. "noreply@example.app". */
  SAAS_MAIL_FROM?: string;
  /** The app's name in e-mails, until the brand is settled. */
  APP_NAME?: string;
  /** Tests: capture e-mail instead of sending it. */
  MAILER?: (message: Mail) => Promise<void>;
  /** PBKDF2 rounds for new passwords (10,000–100,000); lower on the free plan, whose CPU allowance makes 100,000 take half a minute. */
  PASSWORD_ITERATIONS?: string;
  /** Local development only (`--var DEV_MAIL_LOG:1`): print e-mail to the console instead of sending it. */
  DEV_MAIL_LOG?: string;
};

export interface Mail { to: string; subject: string; html: string; text: string }

type ChurchRole = Exclude<Role, 'dev'>;
const CHURCH_ROLES: ChurchRole[] = ['super_admin', 'finance_admin', 'auditor', 'counter'];
const SESSION_COOKIE = 'finance_session';
const CODE_MINUTES = 15;
const CODE_ATTEMPTS = 5;

// ---------- small helpers ----------

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
const fail = (message: string, status = 400, code?: string) => json({ error: message, ...(code ? { code } : {}) }, status);

async function body<T>(request: Request): Promise<T> {
  return (await request.json().catch(() => ({}))) as T;
}

const normalEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const rounds = (env: SaasEnv) => Number(env.PASSWORD_ITERATIONS) || undefined;

function secret(env: SaasEnv): string {
  const value = env.JWT_SECRET?.trim();
  if (!value || value.length < 32) throw new Error('JWT_SECRET is not configured');
  return value;
}

function sessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secure}`;
}
const clearCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** The session token: the app sends it as a Bearer header (a WebView keeps cookies poorly); the web uses the cookie. */
function sessionToken(request: Request): string {
  const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return bearer.trim();
  const cookie = (request.headers.get('Cookie') || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1)) : '';
}

async function sendMail(env: SaasEnv, message: Mail) {
  if (env.MAILER) return env.MAILER(message);
  if (env.DEV_MAIL_LOG === '1') { console.log(`[mail to ${message.to}] ${message.subject}
${message.text}`); return; }
  if (!env.RESEND_API_KEY || !env.SAAS_MAIL_FROM) throw new Error('E-mail is not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${env.APP_NAME || 'Church Finance'} <${env.SAAS_MAIL_FROM}>`, to: message.to, subject: message.subject, html: message.html, text: message.text }),
  });
  if (!res.ok) throw new Error(`E-mail failed: ${res.status}`);
}

function mailShell(title: string, inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#eef1f6;font-family:Arial,'Helvetica Neue',sans-serif;color:#172033;">
<div style="max-width:480px;margin:0 auto;padding:28px 24px;"><div style="background:#fff;border-radius:10px;padding:28px 26px;">
<h2 style="margin:0 0 12px;font-size:18px;">${title}</h2>${inner}</div></div></body></html>`;
}

// ---------- accounts and sessions ----------

interface AccountRow { id: string; email: string; name: string; password_hash: string; email_verified_at: string | null; token_version: number; last_church_id: string | null; deleted_at: string | null }
interface MembershipRow { church_id: string; role: ChurchRole; member_id: string | null; active: number; name: string; declared_size: number; timezone: string; currency: string; e_status: string | null; e_expires: string | null }

async function accountByEmail(env: SaasEnv, email: string) {
  return env.PLATFORM_DB.prepare('SELECT * FROM accounts WHERE email = ? AND deleted_at IS NULL').bind(email).first<AccountRow>();
}

async function accountById(env: SaasEnv, id: string) {
  return env.PLATFORM_DB.prepare('SELECT * FROM accounts WHERE id = ? AND deleted_at IS NULL').bind(id).first<AccountRow>();
}

async function memberships(env: SaasEnv, accountId: string): Promise<MembershipRow[]> {
  const res = await env.PLATFORM_DB.prepare(
    `SELECT cu.church_id, cu.role, cu.member_id, cu.active, c.name, c.declared_size, c.timezone, c.currency,
            e.status AS e_status, e.expires_at AS e_expires
       FROM church_users cu
       JOIN churches c ON c.id = cu.church_id AND c.deleted_at IS NULL
       LEFT JOIN entitlements e ON e.church_id = c.id
      WHERE cu.account_id = ? AND cu.active = 1
      ORDER BY c.created_at`,
  ).bind(accountId).all<MembershipRow>();
  return res.results ?? [];
}

const planOf = (m: MembershipRow): ChurchPlan =>
  churchPlan(m.declared_size, m.e_status ? { status: m.e_status, expires_at: m.e_expires } : null);

/** The signed-in person, in the church they are working in (if any). */
export interface Session {
  claims: SessionClaims;
  account: AccountRow;
  churches: MembershipRow[];
  church: MembershipRow | null;
  user: SessionUser | null;
}

async function loadSession(request: Request, env: SaasEnv): Promise<Session | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const claims = await verifySession(token, secret(env));
  if (!claims) return null;
  const account = await accountById(env, claims.aid);
  if (!account || account.token_version !== claims.tv || !account.email_verified_at) return null;
  const churches = await memberships(env, account.id);
  const church = churches.find((c) => c.church_id === claims.cid) ?? null;
  const user: SessionUser | null = church
    ? { id: account.id, name: account.name, email: account.email, role: church.role, memberId: church.member_id }
    : null;
  return { claims, account, churches, church, user };
}

function mePayload(account: AccountRow, churches: MembershipRow[], church: MembershipRow | null) {
  return {
    user: church ? { id: account.id, name: account.name, email: account.email, role: church.role, memberId: church.member_id } : null,
    account: { id: account.id, name: account.name, email: account.email },
    church: church ? {
      id: church.church_id, name: church.name, declaredSize: church.declared_size,
      timezone: church.timezone, currency: church.currency, plan: planOf(church),
    } : null,
    churches: churches.map((c) => ({ id: c.church_id, name: c.name, role: c.role })),
  };
}

/** Signs the account in, working in `churchId` (or the last church they used, or their first). */
async function startSession(env: SaasEnv, request: Request, account: AccountRow, churchId?: string | null) {
  const churches = await memberships(env, account.id);
  const church = churches.find((c) => c.church_id === churchId)
    ?? churches.find((c) => c.church_id === account.last_church_id)
    ?? churches[0]
    ?? null;
  if (church && church.church_id !== account.last_church_id) {
    await env.PLATFORM_DB.prepare('UPDATE accounts SET last_church_id = ? WHERE id = ?').bind(church.church_id, account.id).run();
  }
  const token = await signSession({ aid: account.id, cid: church?.church_id ?? null, tv: account.token_version }, secret(env));
  return json({ ...mePayload(account, churches, church), token }, 200, { 'Set-Cookie': sessionCookie(token, request) });
}

// ---------- one-time codes ----------

async function issueCode(env: SaasEnv, email: string, purpose: 'verify' | 'reset', secretValue: string) {
  const expires = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString();
  await env.PLATFORM_DB.prepare(
    `INSERT INTO email_codes (email, purpose, code_hash, attempts, expires_at, created_at) VALUES (?, ?, ?, 0, ?, ?)
     ON CONFLICT(email, purpose) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at`,
  ).bind(email, purpose, await sha256(secretValue), expires, nowIso()).run();
}

/** Checks a code; a wrong guess counts, and after five the code is spent. */
async function useCode(env: SaasEnv, email: string, purpose: 'verify' | 'reset', given: string): Promise<boolean> {
  const row = await env.PLATFORM_DB.prepare('SELECT * FROM email_codes WHERE email = ? AND purpose = ?').bind(email, purpose)
    .first<{ code_hash: string; attempts: number; expires_at: string }>();
  if (!row || row.expires_at < nowIso() || row.attempts >= CODE_ATTEMPTS) return false;
  if (row.code_hash !== await sha256(given.trim())) {
    await env.PLATFORM_DB.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?').bind(email, purpose).run();
    return false;
  }
  await env.PLATFORM_DB.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').bind(email, purpose).run();
  return true;
}

async function sendVerifyCode(env: SaasEnv, account: { email: string; name: string }) {
  const code = sixDigitCode();
  await issueCode(env, account.email, 'verify', code);
  const app = env.APP_NAME || 'Church Finance';
  await sendMail(env, {
    to: account.email,
    subject: `${code} 是您的驗證碼 — ${app}`,
    text: `${account.name} 您好，您的驗證碼是 ${code}，${CODE_MINUTES} 分鐘內有效。`,
    html: mailShell('驗證您的 Email', `<p style="font-size:14px;">${escapeHtml(account.name)} 您好，請在 App 中輸入以下驗證碼：</p>
<p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:18px 0;">${code}</p>
<p style="font-size:12px;color:#68758a;">${CODE_MINUTES} 分鐘內有效。如果您沒有註冊，請忽略本郵件。</p>`),
  });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- the church Durable Object ----------

function churchStub(env: SaasEnv, churchId: string) {
  return env.CHURCHES.get(env.CHURCHES.idFromName(churchId));
}

async function callChurch(env: SaasEnv, churchId: string, path: string, context: ChurchContext, payload: unknown) {
  const res = await churchStub(env, churchId).fetch(`https://church${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [CHURCH_CONTEXT_HEADER]: encodeChurchContext(context) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Church ${path} failed: ${res.status}`);
}

/** Hands a finance request to the church's own database, saying who asks and what they may do. */
function forwardToChurch(env: SaasEnv, request: Request, churchId: string, path: string, search: string, context: ChurchContext) {
  const headers = new Headers(request.headers);
  headers.set(CHURCH_CONTEXT_HEADER, encodeChurchContext(context));
  headers.delete('Authorization');
  const url = new URL(request.url);
  return churchStub(env, churchId).fetch(new Request(`${url.origin}${path}${search}`, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    // Streams the body (uploads) rather than holding it; required outside Workers, ignored inside.
    duplex: 'half',
  } as RequestInit));
}

async function deleteChurchFiles(env: SaasEnv, churchId: string) {
  let cursor: string | undefined;
  do {
    const page = await env.FILES.list({ prefix: `churches/${churchId}/`, cursor });
    if (page.objects.length) await env.FILES.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

// ---------- team (the existing 用戶管理 screen, against platform accounts) ----------

function mapTeamUser(row: { id: string; name: string; email: string; role: ChurchRole; member_id: string | null; active: number; created_at: string; updated_at: string }) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, memberId: row.member_id || null, active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at };
}

async function teamRow(env: SaasEnv, churchId: string, accountId: string) {
  return env.PLATFORM_DB.prepare(
    `SELECT a.id, a.name, a.email, cu.role, cu.member_id, cu.active, cu.created_at, cu.updated_at
       FROM church_users cu JOIN accounts a ON a.id = cu.account_id
      WHERE cu.church_id = ? AND cu.account_id = ? AND a.deleted_at IS NULL`,
  ).bind(churchId, accountId).first<Parameters<typeof mapTeamUser>[0]>();
}

/** Whether the account is shared with another church — then only its role here may be changed from here. */
async function inOtherChurches(env: SaasEnv, accountId: string, churchId: string) {
  const row = await env.PLATFORM_DB.prepare('SELECT COUNT(*) AS n FROM church_users WHERE account_id = ? AND church_id <> ?').bind(accountId, churchId).first<{ n: number }>();
  return Number(row?.n || 0) > 0;
}

async function activeSuperAdmins(env: SaasEnv, churchId: string) {
  const row = await env.PLATFORM_DB.prepare("SELECT COUNT(*) AS n FROM church_users WHERE church_id = ? AND role = 'super_admin' AND active = 1").bind(churchId).first<{ n: number }>();
  return Number(row?.n || 0);
}

async function syncTeamMember(env: SaasEnv, session: Session, accountId: string, audit: { action: string; summary: string; before?: unknown; after?: unknown }) {
  const church = session.church!;
  const row = await teamRow(env, church.church_id, accountId);
  const upsert: ChurchUserRecord[] = row ? [{ id: row.id, name: row.name, email: row.email, role: row.role, memberId: row.member_id, active: Boolean(row.active) }] : [];
  await callChurch(env, church.church_id, '/__church/users', { churchId: church.church_id, user: session.user, writable: true }, {
    upsert,
    audit: { action: audit.action, entityType: 'user', entityId: accountId, entitySummary: audit.summary, before: audit.before, after: audit.after },
  });
}

async function handleTeam(request: Request, env: SaasEnv, session: Session, path: string): Promise<Response> {
  const church = session.church;
  if (!church || !session.user) return fail('Authentication required', 401);
  if (church.role !== 'super_admin') return fail('Forbidden', 403);
  const churchId = church.church_id;

  if (path === '/api/users' && request.method === 'GET') {
    const res = await env.PLATFORM_DB.prepare(
      `SELECT a.id, a.name, a.email, cu.role, cu.member_id, cu.active, cu.created_at, cu.updated_at
         FROM church_users cu JOIN accounts a ON a.id = cu.account_id
        WHERE cu.church_id = ? AND a.deleted_at IS NULL ORDER BY cu.created_at`,
    ).bind(churchId).all<Parameters<typeof mapTeamUser>[0]>();
    const items = (res.results ?? []).map(mapTeamUser);
    return json({ items, total: items.length });
  }

  if (!planOf(church).writable && request.method !== 'GET') {
    return fail('教會人數超過 100 人，需要訂閱專業版才能新增或修改資料。', 402, 'subscription_required');
  }

  // Add a team member: a new account with the password given here, or someone who already has an account.
  if (path === '/api/users' && request.method === 'POST') {
    const payload = await body<{ name?: string; email?: string; role?: string; password?: string; memberId?: string }>(request);
    const name = String(payload.name || '').trim();
    const email = normalEmail(payload.email);
    const role = String(payload.role || '') as ChurchRole;
    if (!name || !email) return fail('姓名與電郵必填');
    if (!isEmail(email)) return fail('Email 格式不正確');
    if (!CHURCH_ROLES.includes(role)) return fail('角色無效');
    let account = await accountByEmail(env, email);
    if (account) {
      const existing = await env.PLATFORM_DB.prepare('SELECT 1 FROM church_users WHERE church_id = ? AND account_id = ?').bind(churchId, account.id).first();
      if (existing) return fail('該電郵已被使用');
    } else {
      const password = String(payload.password || '');
      if (password.length < 8) return fail('密碼至少 8 個字元');
      const at = nowIso();
      account = { id: newId(), email, name, password_hash: await hashPassword(password, rounds(env)), email_verified_at: at, token_version: 0, last_church_id: churchId, deleted_at: null };
      await env.PLATFORM_DB.prepare(
        'INSERT INTO accounts (id, email, name, password_hash, email_verified_at, token_version, last_church_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)',
      ).bind(account.id, email, name, account.password_hash, at, churchId, at, at).run();
    }
    const at = nowIso();
    await env.PLATFORM_DB.prepare('INSERT INTO church_users (church_id, account_id, role, member_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .bind(churchId, account.id, role, payload.memberId || null, at, at).run();
    const row = (await teamRow(env, churchId, account.id))!;
    await syncTeamMember(env, session, account.id, { action: 'create', summary: `用戶 ${row.name} <${row.email}>`, after: mapTeamUser(row) });
    return json(mapTeamUser(row), 201);
  }

  const resetMatch = path.match(/^\/api\/users\/([^/]+)\/reset-password$/);
  if (resetMatch && request.method === 'POST') {
    const accountId = decodeURIComponent(resetMatch[1]);
    const target = await teamRow(env, churchId, accountId);
    if (!target) return fail('User not found', 404);
    if (await inOtherChurches(env, accountId, churchId)) return fail('此帳戶也屬於其他教會，請本人使用「忘記密碼」重設', 403);
    const password = String((await body<{ password?: string }>(request)).password || '');
    if (password.length < 8) return fail('密碼至少 8 個字元');
    await env.PLATFORM_DB.prepare('UPDATE accounts SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?')
      .bind(await hashPassword(password, rounds(env)), nowIso(), accountId).run();
    await syncTeamMember(env, session, accountId, { action: 'update', summary: `重置密碼 ｜ ${target.name} <${target.email}>` });
    return json({ ok: true });
  }

  const itemMatch = path.match(/^\/api\/users\/([^/]+)$/);
  if (itemMatch) {
    const accountId = decodeURIComponent(itemMatch[1]);
    const target = await teamRow(env, churchId, accountId);
    if (!target) return fail('User not found', 404);
    if (request.method === 'PUT') {
      const payload = await body<{ name?: string; email?: string; role?: string; active?: boolean; memberId?: string | null }>(request);
      const role = String(payload.role ?? target.role) as ChurchRole;
      const active = payload.active === undefined ? Number(target.active) : (payload.active ? 1 : 0);
      if (!CHURCH_ROLES.includes(role)) return fail('角色無效');
      if (target.role === 'super_admin' && target.active && (role !== 'super_admin' || !active) && await activeSuperAdmins(env, churchId) <= 1) {
        return fail('必須保留至少一個啟用的 Super Admin');
      }
      const name = String(payload.name ?? target.name).trim();
      const email = normalEmail(payload.email ?? target.email);
      if (!name || !email) return fail('姓名與電郵必填');
      if (name !== target.name || email !== target.email.toLowerCase()) {
        // An account's own name and e-mail belong to the person, and may be shared with other churches.
        if (await inOtherChurches(env, accountId, churchId)) return fail('此帳戶也屬於其他教會，姓名與 Email 請本人修改', 403);
        if (email !== target.email.toLowerCase() && await accountByEmail(env, email)) return fail('該電郵已被使用');
        await env.PLATFORM_DB.prepare('UPDATE accounts SET name = ?, email = ?, updated_at = ? WHERE id = ?').bind(name, email, nowIso(), accountId).run();
      }
      await env.PLATFORM_DB.prepare('UPDATE church_users SET role = ?, member_id = ?, active = ?, updated_at = ? WHERE church_id = ? AND account_id = ?')
        .bind(role, payload.memberId === undefined ? target.member_id : (payload.memberId || null), active, nowIso(), churchId, accountId).run();
      const row = (await teamRow(env, churchId, accountId))!;
      await syncTeamMember(env, session, accountId, { action: 'update', summary: `用戶 ${row.name} <${row.email}>`, before: mapTeamUser(target), after: mapTeamUser(row) });
      return json(mapTeamUser(row));
    }
    if (request.method === 'DELETE') {
      if (accountId === session.account.id) return fail('不能刪除自己的帳號');
      if (target.role === 'super_admin' && target.active && await activeSuperAdmins(env, churchId) <= 1) return fail('必須保留至少一個啟用的 Super Admin');
      // Leaves the church; the account (and its other churches) stays. Kept inactive here so history still names them.
      await env.PLATFORM_DB.prepare('DELETE FROM church_users WHERE church_id = ? AND account_id = ?').bind(churchId, accountId).run();
      await callChurch(env, churchId, '/__church/users', { churchId, user: session.user, writable: true }, {
        upsert: [{ id: target.id, name: target.name, email: target.email, role: target.role, memberId: target.member_id, active: false }],
        audit: { action: 'delete', entityType: 'user', entityId: accountId, entitySummary: `用戶 ${target.name} <${target.email}>`, reason: '用戶管理刪除', before: mapTeamUser(target) },
      });
      return json({ ok: true });
    }
  }
  return fail('Not found', 404);
}

// ---------- the worker ----------

/** /c/<churchId>/... — a church's public pages and links (claim form, phone uploads, e-mailed approvals, files). */
const PUBLIC_PREFIX = /^\/c\/([0-9a-f-]{36})(\/.*)$/i;

export async function handleSaasRequest(request: Request, env: SaasEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  try {
    // ----- signing up -----
    if (path === '/api/platform/register' && request.method === 'POST') {
      const payload = await body<{ name?: string; email?: string; password?: string }>(request);
      const name = String(payload.name || '').trim();
      const email = normalEmail(payload.email);
      const password = String(payload.password || '');
      if (!name) return fail('請填寫姓名');
      if (!isEmail(email)) return fail('Email 格式不正確');
      if (password.length < 8) return fail('密碼至少 8 個字元');
      const existing = await accountByEmail(env, email);
      if (existing?.email_verified_at) return fail('此 Email 已註冊，請直接登入', 409, 'email_taken');
      const at = nowIso();
      const hash = await hashPassword(password, rounds(env));
      if (existing) {
        await env.PLATFORM_DB.prepare('UPDATE accounts SET name = ?, password_hash = ?, updated_at = ? WHERE id = ?').bind(name, hash, at, existing.id).run();
      } else {
        await env.PLATFORM_DB.prepare('INSERT INTO accounts (id, email, name, password_hash, token_version, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
          .bind(newId(), email, name, hash, at, at).run();
      }
      await sendVerifyCode(env, { email, name });
      return json({ ok: true, email }, 201);
    }

    if (path === '/api/platform/verify-email' && request.method === 'POST') {
      const payload = await body<{ email?: string; code?: string }>(request);
      const email = normalEmail(payload.email);
      const account = await accountByEmail(env, email);
      if (!account || !await useCode(env, email, 'verify', String(payload.code || ''))) return fail('驗證碼不正確或已過期', 400, 'bad_code');
      await env.PLATFORM_DB.prepare('UPDATE accounts SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?').bind(nowIso(), nowIso(), account.id).run();
      return startSession(env, request, (await accountById(env, account.id))!);
    }

    if (path === '/api/platform/resend-code' && request.method === 'POST') {
      const email = normalEmail((await body<{ email?: string }>(request)).email);
      const account = await accountByEmail(env, email);
      if (account && !account.email_verified_at) await sendVerifyCode(env, account);
      return json({ ok: true });
    }

    // ----- signing in and out (same paths as the single-church app) -----
    if (path === '/api/auth/login' && request.method === 'POST') {
      const payload = await body<{ email?: string; password?: string }>(request);
      const email = normalEmail(payload.email);
      const account = await accountByEmail(env, email);
      if (!account || !await verifyPassword(String(payload.password || ''), account.password_hash)) return fail('Email or password is incorrect', 401);
      if (!account.email_verified_at) {
        await sendVerifyCode(env, account);
        return fail('請先驗證 Email，驗證碼已重新寄出', 403, 'email_unverified');
      }
      return startSession(env, request, account);
    }

    if (path === '/api/auth/logout' && request.method === 'POST') {
      return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
    }

    if (path === '/api/auth/forgot-password' && request.method === 'POST') {
      const email = normalEmail((await body<{ email?: string }>(request)).email);
      const account = email ? await accountByEmail(env, email) : null;
      if (account) {
        const token = randomToken();
        await issueCode(env, email, 'reset', token);
        const link = `${url.origin}/?reset=${encodeURIComponent(`${email}:${token}`)}`;
        await sendMail(env, {
          to: email,
          subject: `重設密碼 Reset Password — ${env.APP_NAME || 'Church Finance'}`,
          text: `請在 ${CODE_MINUTES} 分鐘內開啟此連結重設密碼：${link}`,
          html: mailShell('重設密碼 Reset Password', `<p style="font-size:14px;">${escapeHtml(account.name)} 您好，請在 ${CODE_MINUTES} 分鐘內點擊下方按鈕設定新密碼。</p>
<p style="margin:22px 0;"><a href="${link}" style="display:inline-block;background:#1f6feb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">重設密碼</a></p>
<p style="font-size:12px;color:#68758a;">如果您並未提出此請求，請忽略本郵件。</p>`),
        }).catch(() => undefined);
      }
      // The same answer either way: whether an address has an account is not given away.
      return json({ ok: true });
    }

    if (path === '/api/auth/reset-password' && request.method === 'POST') {
      const payload = await body<{ token?: string; password?: string }>(request);
      const [rawEmail, token] = String(payload.token || '').split(':');
      const email = normalEmail(rawEmail);
      const password = String(payload.password || '');
      if (password.length < 8) return fail('密碼至少 8 個字元');
      const account = await accountByEmail(env, email);
      if (!account || !token || !await useCode(env, email, 'reset', token)) return fail('連結已失效或過期，請重新申請');
      await env.PLATFORM_DB.prepare('UPDATE accounts SET password_hash = ?, token_version = token_version + 1, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?')
        .bind(await hashPassword(password, rounds(env)), nowIso(), nowIso(), account.id).run();
      return json({ ok: true });
    }

    // ----- everything else needs a session (except a church's public pages) -----
    const session = await loadSession(request, env);

    if (path === '/api/auth/me' && request.method === 'GET') {
      if (!session) return json({ user: null, account: null, church: null, churches: [] });
      return json(mePayload(session.account, session.churches, session.church));
    }

    const publicMatch = path.match(PUBLIC_PREFIX);
    if (publicMatch) {
      const [, churchId, rest] = publicMatch;
      if (rest.startsWith('/api/') || rest === '/expense-action') {
        const church = await env.PLATFORM_DB.prepare(
          'SELECT c.declared_size, e.status, e.expires_at FROM churches c LEFT JOIN entitlements e ON e.church_id = c.id WHERE c.id = ? AND c.deleted_at IS NULL',
        ).bind(churchId).first<{ declared_size: number; status: string | null; expires_at: string | null }>();
        if (!church) return fail('Not found', 404);
        const plan = churchPlan(church.declared_size, church.status ? { status: church.status, expires_at: church.expires_at } : null);
        const user = session?.church?.church_id === churchId ? session.user : null;
        return forwardToChurch(env, request, churchId, rest, url.search, { churchId, user, writable: plan.writable });
      }
      return env.ASSETS.fetch(request);
    }

    if (!path.startsWith('/api/') && path !== '/expense-action') return env.ASSETS.fetch(request);
    if (!session) return fail('Authentication required', 401);

    if (path === '/api/auth/change-password' && request.method === 'POST') {
      const payload = await body<{ currentPassword?: string; newPassword?: string }>(request);
      const next = String(payload.newPassword || '');
      if (next.length < 8) return fail('新密碼至少 8 個字元');
      if (!await verifyPassword(String(payload.currentPassword || ''), session.account.password_hash)) return fail('當前密碼不正確');
      await env.PLATFORM_DB.prepare('UPDATE accounts SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?')
        .bind(await hashPassword(next, rounds(env)), nowIso(), session.account.id).run();
      // Every other device is signed out; this one carries on with a fresh session.
      return startSession(env, request, (await accountById(env, session.account.id))!, session.church?.church_id);
    }

    if (path === '/api/platform/churches' && request.method === 'POST') {
      const payload = await body<{ name?: string; declaredSize?: number; timezone?: string; currency?: string }>(request);
      const name = String(payload.name || '').trim();
      const declaredSize = Math.floor(Number(payload.declaredSize));
      if (!name) return fail('請填寫教會名稱');
      if (!Number.isFinite(declaredSize) || declaredSize < 1) return fail('請填寫教會人數');
      const churchId = newId();
      const at = nowIso();
      await env.PLATFORM_DB.batch([
        env.PLATFORM_DB.prepare('INSERT INTO churches (id, name, declared_size, timezone, currency, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(churchId, name, declaredSize, String(payload.timezone || 'America/Los_Angeles'), String(payload.currency || 'USD'), session.account.id, at, at),
        env.PLATFORM_DB.prepare("INSERT INTO church_users (church_id, account_id, role, member_id, active, created_at, updated_at) VALUES (?, ?, 'super_admin', NULL, 1, ?, ?)")
          .bind(churchId, session.account.id, at, at),
      ]);
      const founder: SessionUser = { id: session.account.id, name: session.account.name, email: session.account.email, role: 'super_admin', memberId: null };
      const init: ChurchInit = {
        name,
        mailFrom: `${name} <${env.SAAS_MAIL_FROM || 'noreply@example.app'}>`,
        replyTo: session.account.email,
      };
      await callChurch(env, churchId, '/__church/init', { churchId, user: founder, writable: true }, init);
      return startSession(env, request, session.account, churchId);
    }

    if (path === '/api/platform/switch-church' && request.method === 'POST') {
      const churchId = String((await body<{ churchId?: string }>(request)).churchId || '');
      if (!session.churches.some((c) => c.church_id === churchId)) return fail('Forbidden', 403);
      return startSession(env, request, session.account, churchId);
    }

    if (path === '/api/platform/church' && request.method === 'PUT') {
      const church = session.church;
      if (!church || church.role !== 'super_admin') return fail('Forbidden', 403);
      const payload = await body<{ name?: string; declaredSize?: number; timezone?: string; currency?: string }>(request);
      const name = String(payload.name ?? church.name).trim();
      const declaredSize = Math.floor(Number(payload.declaredSize ?? church.declared_size));
      if (!name) return fail('請填寫教會名稱');
      if (!Number.isFinite(declaredSize) || declaredSize < 1) return fail('請填寫教會人數');
      await env.PLATFORM_DB.prepare('UPDATE churches SET name = ?, declared_size = ?, timezone = ?, currency = ?, updated_at = ? WHERE id = ?')
        .bind(name, declaredSize, String(payload.timezone ?? church.timezone), String(payload.currency ?? church.currency), nowIso(), church.church_id).run();
      return json(mePayload(session.account, await memberships(env, session.account.id), (await memberships(env, session.account.id)).find((c) => c.church_id === church.church_id) ?? null));
    }

    if (path === '/api/platform/delete-account' && request.method === 'POST') {
      const password = String((await body<{ password?: string }>(request)).password || '');
      if (!await verifyPassword(password, session.account.password_hash)) return fail('密碼不正確');
      // A church cannot be left without anyone to run it: hand it over first, unless no one else is on its team.
      for (const church of session.churches.filter((c) => c.role === 'super_admin')) {
        const team = await env.PLATFORM_DB.prepare('SELECT COUNT(*) AS n FROM church_users WHERE church_id = ? AND account_id <> ? AND active = 1').bind(church.church_id, session.account.id).first<{ n: number }>();
        if (Number(team?.n || 0) > 0 && await activeSuperAdmins(env, church.church_id) <= 1) {
          return fail(`請先把「${church.name}」的 Super Admin 交給其他同工，再刪除帳戶`, 409, 'sole_admin');
        }
      }
      const at = nowIso();
      for (const church of session.churches) {
        const team = await env.PLATFORM_DB.prepare('SELECT COUNT(*) AS n FROM church_users WHERE church_id = ? AND account_id <> ?').bind(church.church_id, session.account.id).first<{ n: number }>();
        // A church only this person used goes with the account: its records and its files.
        if (Number(team?.n || 0) === 0) {
          await env.PLATFORM_DB.prepare('UPDATE churches SET deleted_at = ? WHERE id = ?').bind(at, church.church_id).run();
          await callChurch(env, church.church_id, '/__church/destroy', { churchId: church.church_id, user: null, writable: true }, {});
          await deleteChurchFiles(env, church.church_id);
        }
      }
      await env.PLATFORM_DB.batch([
        env.PLATFORM_DB.prepare('DELETE FROM church_users WHERE account_id = ?').bind(session.account.id),
        env.PLATFORM_DB.prepare("UPDATE accounts SET deleted_at = ?, email = id || '@deleted.invalid', name = '已刪除帳戶', password_hash = '', token_version = token_version + 1, updated_at = ? WHERE id = ?")
          .bind(at, at, session.account.id),
      ]);
      return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });
    }

    if (path === '/api/users' || path.startsWith('/api/users/')) return handleTeam(request, env, session, path);

    if (path.startsWith('/api/platform/')) return fail('Not found', 404);

    // ----- the finance API itself, in the church the person is working in -----
    if (!session.church || !session.user) return fail('請先建立或選擇教會', 409, 'no_church');
    return forwardToChurch(env, request, session.church.church_id, path, url.search, {
      churchId: session.church.church_id,
      user: session.user,
      writable: planOf(session.church).writable,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Unexpected server error';
    return fail(message, 500);
  }
}
