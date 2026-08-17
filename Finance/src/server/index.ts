/// <reference types="@cloudflare/workers-types" />

import type { AppSettings, ExpenseNotifySettings, ExpenseStatus, MemberStatus, Role, TaxStatementSettings } from '../types';
import { CHURCH_INFO, buildTaxStatementData, buildTaxStatementHtml, normalizeTaxStatementSettings } from '../shared/taxStatement';
import { exportBackup, importBackup, type BackupData } from './backup';

type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  FILES_URL: string;
  RESEND_API_KEY: string;
  MAIL_FROM: string;
};

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  memberId: string | null;
};

const roleRank: Record<Role, number> = {
  counter: 0,
  dev: 1,
  auditor: 2,
  finance_admin: 3,
  super_admin: 4
};

const VALID_ROLES: Role[] = ['super_admin', 'finance_admin', 'auditor', 'dev', 'counter'];

// Counter（點款人員）唯一能存取的端點。fail-closed：未列出的一律 403。
// counter 的 roleRank 為 0，所以任何用 requireUser 預設門檻的端點也擋得住它。
function counterAllows(pathname: string, method: string): boolean {
  if (pathname === '/api/auth/change-password' && method === 'POST') return true;
  if (pathname === '/api/lookups' && method === 'GET') return true;
  if (pathname === '/api/members' && (method === 'GET' || method === 'POST')) return true;
  if (pathname === '/api/offerings' && (method === 'GET' || method === 'POST')) return true;
  if (/^\/api\/offerings\/[^/]+$/.test(pathname) && (method === 'PUT' || method === 'DELETE')) return true;
  if (pathname === '/api/upload' && method === 'POST') return true;
  if (pathname === '/api/upload-sessions' && method === 'POST') return true;
  if (/^\/api\/upload-sessions\/[^/]+$/.test(pathname) && (method === 'GET' || method === 'DELETE')) return true;
  if (pathname.startsWith('/api/files/') && method === 'GET') return true;
  return false;
}

// 角色權限（非線性：Reader 可改成員、卻不能改奉獻/支出）
function canManageMembers(role: Role): boolean {
  return role === 'super_admin' || role === 'finance_admin' || role === 'auditor' || role === 'dev' || role === 'counter';
}
function canManageFinance(role: Role): boolean {
  return role === 'super_admin' || role === 'finance_admin' || role === 'dev';
}
// 記錄奉獻：財務角色 ＋ Counter。Counter 只能碰自己建立的那幾筆，另由 created_by 把關。
function canRecordOffering(role: Role): boolean {
  return canManageFinance(role) || role === 'counter';
}
function canManageSettings(role: Role): boolean {
  return role === 'super_admin' || role === 'finance_admin';
}
function canManageUsers(role: Role): boolean {
  return role === 'super_admin';
}
// dev 帳號只在測試數據沙盒內活動
function testFlagFor(role: Role): number {
  return role === 'dev' ? 1 : 0;
}
function sameTestScope(role: Role, isTest: unknown): boolean {
  // 僅防止 dev 帳號越界改動真實數據；其他角色不受限
  // （遷移把舊奉獻/支出標記為測試數據後，曾誤擋超管/管理員的正常編輯）
  return role !== 'dev' || Boolean(isTest);
}

function normalizeOperatorLabel(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function isSameExpenseOperator(user: SessionUser, expense: any, operatorLabel: string): boolean {
  if (user.memberId && expense.approvedBy && user.memberId === expense.approvedBy) {
    return true;
  }

  const approvedLabel = normalizeOperatorLabel(expense.approvedByName);
  return Boolean(approvedLabel && approvedLabel === normalizeOperatorLabel(operatorLabel));
}

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

async function requireUser(request: Request, env: Env, role: Role = 'dev') {
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

async function recordAudit(
  env: Env,
  user: SessionUser,
  entry: { action: string; entityType: string; entityId: string; entitySummary: string; reason?: string; before?: unknown; after?: unknown }
) {
  const rowId = id();
  const ts = now();
  const toJson = (value: unknown) => (value === undefined || value === null ? null : JSON.stringify(value));
  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, action, entity_type, entity_id, entity_summary, reason, user_id, user_name, created_at, before_json, after_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(rowId, entry.action, entry.entityType, entry.entityId, entry.entitySummary, entry.reason || '', user.id, user.name, ts, toJson(entry.before), toJson(entry.after)).run();
  } catch {
    // before_json / after_json 欄位尚未建立時，退回舊格式
    try {
      await env.DB.prepare(
        `INSERT INTO audit_logs (id, action, entity_type, entity_id, entity_summary, reason, user_id, user_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(rowId, entry.action, entry.entityType, entry.entityId, entry.entitySummary, entry.reason || '', user.id, user.name, ts).run();
    } catch {
      // 審計寫入失敗不應影響主操作
    }
  }
}

const statusZhMap: Record<string, string> = { active: '活躍', inactive: '非活躍', visitor: '訪客' };
function statusZh(value: any): string {
  return statusZhMap[String(value)] || String(value ?? '');
}

// 比對欄位新舊值，產生「欄位：舊值→新值」的變更摘要
function buildChangeSummary(fields: Array<{ label: string; from: any; to: any }>): string {
  const fmt = (v: any) => (v === null || v === undefined || v === '' ? '(空)' : String(v));
  const changed = fields.filter(f => fmt(f.from) !== fmt(f.to));
  if (!changed.length) return '無變更';
  return changed.map(f => `${f.label}：${fmt(f.from)}→${fmt(f.to)}`).join('，');
}

// 審計「對象」欄統一格式：日期 | 類型 金額 | 主體
function offeringSummary(o: any): string {
  return `${o?.date ?? ''} | 奉獻 $${o?.amount ?? ''} | ${o?.memberName || '匿名'}`.trim();
}
function expenseSummary(e: any): string {
  return `${e?.date ?? ''} | 支出 $${e?.amount ?? ''} | ${e?.description || ''}`.trim();
}

function mapAuditLog(row: any) {
  const parse = (value: any) => {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  };
  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entitySummary: row.entity_summary || '',
    reason: row.reason || '',
    userId: row.user_id || '',
    userName: row.user_name || '',
    createdAt: row.created_at,
    before: parse(row.before_json),
    after: parse(row.after_json)
  };
}

async function listAuditLogs(env: Env) {
  try {
    const result = await env.DB.prepare(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 300'
    ).all();
    return json({ items: (result.results || []).map(mapAuditLog), total: result.results?.length || 0 });
  } catch {
    // audit_logs 表尚未建立時返回空，避免整個應用載入失敗
    return json({ items: [], total: 0 });
  }
}

async function ensurePasswordResetsTable(env: Env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    )`
  ).run();
}

async function ensureAppSettingsTable(env: Env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    )`
  ).run();
}

async function readTaxStatementSettings(env: Env): Promise<TaxStatementSettings> {
  try {
    await ensureAppSettingsTable(env);
    const row = await env.DB.prepare('SELECT value_json FROM app_settings WHERE key = ?').bind('taxStatement').first<{ value_json: string }>();
    if (!row?.value_json) return normalizeTaxStatementSettings();
    return normalizeTaxStatementSettings(JSON.parse(row.value_json));
  } catch {
    return normalizeTaxStatementSettings();
  }
}

const DEFAULT_EXPENSE_NOTIFY_SUBJECT = '[新增支出] {{description}} · {{amount}}';
const DEFAULT_EXPENSE_NOTIFY_BODY = `<p>有新的支出記錄已提交，請審閱。</p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;border:1px solid #ddd;font-family:Arial,sans-serif;font-size:14px;">
<tr><td style="background:#f5f5f5;font-weight:bold;">描述</td><td>{{description}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">金額</td><td>{{amount}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">分類</td><td>{{category}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">日期</td><td>{{date}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">付款人</td><td>{{paidBy}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">提交人</td><td>{{submittedBy}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">備註</td><td>{{notes}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">附件</td><td>{{receiptLink}}</td></tr>
</table>
{{actionButtons}}
<p style="color:#888;font-size:12px;margin-top:16px;">此郵件由 BOLCCOP 財務系統自動發送。</p>`;

function defaultExpenseNotifySettings(): ExpenseNotifySettings {
  return {
    enabled: false,
    recipients: [],
    mailFrom: 'Seattle Bread of Life Christian Church <finance@bolccop.org>',
    replyTo: 'finance@bolccop.org',
    subjectTemplate: DEFAULT_EXPENSE_NOTIFY_SUBJECT,
    bodyTemplate: DEFAULT_EXPENSE_NOTIFY_BODY,
    includeActionButtons: true
  };
}

function normalizeExpenseNotifySettings(raw?: Partial<ExpenseNotifySettings>): ExpenseNotifySettings {
  const base = defaultExpenseNotifySettings();
  if (!raw) return base;
  const recipients = Array.isArray(raw.recipients)
    ? raw.recipients.map(r => String(r || '').trim()).filter(isEmailAddress)
    : base.recipients;
  return {
    enabled: Boolean(raw.enabled),
    recipients,
    mailFrom: typeof raw.mailFrom === 'string' && raw.mailFrom.trim() ? raw.mailFrom.trim() : base.mailFrom,
    replyTo: typeof raw.replyTo === 'string' && raw.replyTo.trim() ? raw.replyTo.trim() : base.replyTo,
    subjectTemplate: typeof raw.subjectTemplate === 'string' && raw.subjectTemplate.trim() ? raw.subjectTemplate : base.subjectTemplate,
    bodyTemplate: typeof raw.bodyTemplate === 'string' && raw.bodyTemplate.trim() ? raw.bodyTemplate : base.bodyTemplate,
    includeActionButtons: raw.includeActionButtons === undefined ? base.includeActionButtons : Boolean(raw.includeActionButtons)
  };
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function settingsAuditTarget(before: AppSettings, after: AppSettings): { id: string; summary: string; before: unknown; after: unknown } {
  const taxChanged = stableJson(before.taxStatement) !== stableJson(after.taxStatement);
  const expenseNotifyChanged = stableJson(before.expenseNotify) !== stableJson(after.expenseNotify);

  if (expenseNotifyChanged && !taxChanged) {
    return {
      id: 'expenseNotify',
      summary: '支出通知設定已更新',
      before: before.expenseNotify,
      after: after.expenseNotify
    };
  }

  if (taxChanged && !expenseNotifyChanged) {
    return {
      id: 'taxStatement',
      summary: '報稅設定已更新',
      before: before.taxStatement,
      after: after.taxStatement
    };
  }

  return {
    id: 'appSettings',
    summary: '系統設定已更新',
    before,
    after
  };
}

async function readExpenseNotifySettings(env: Env): Promise<ExpenseNotifySettings> {
  try {
    await ensureAppSettingsTable(env);
    const row = await env.DB.prepare('SELECT value_json FROM app_settings WHERE key = ?').bind('expenseNotify').first<{ value_json: string }>();
    if (!row?.value_json) return defaultExpenseNotifySettings();
    return normalizeExpenseNotifySettings(JSON.parse(row.value_json));
  } catch {
    return defaultExpenseNotifySettings();
  }
}

async function readAppSettings(env: Env): Promise<AppSettings> {
  const [taxStatement, expenseNotify] = await Promise.all([
    readTaxStatementSettings(env),
    readExpenseNotifySettings(env)
  ]);
  return { taxStatement, expenseNotify };
}

async function saveAppSettings(env: Env, user: SessionUser, payload: AppSettings): Promise<AppSettings> {
  await ensureAppSettingsTable(env);
  const current = await readAppSettings(env);
  const next: AppSettings = {
    taxStatement: normalizeTaxStatementSettings({
      ...current.taxStatement,
      ...(payload?.taxStatement || {}),
      textFields: {
        ...current.taxStatement.textFields,
        ...(payload?.taxStatement?.textFields || {})
      }
    }),
    expenseNotify: normalizeExpenseNotifySettings({
      ...current.expenseNotify,
      ...(payload?.expenseNotify || {})
    })
  };
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`
  ).bind('taxStatement', JSON.stringify(next.taxStatement), user.id, now()).run();
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value_json, updated_by, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`
  ).bind('expenseNotify', JSON.stringify(next.expenseNotify), user.id, now()).run();
  return next;
}

function escapeHtml(value: string): string {
  return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

async function createActionToken(env: Env, expenseId: string, action: 'approve' | 'reject'): Promise<string> {
  const raw = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await sha256(raw);
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  await env.DB.prepare(
    'INSERT INTO expense_action_tokens (token_hash, expense_id, action, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(hash, expenseId, action, expires.toISOString(), now()).run();
  return raw;
}

function renderActionButtons(baseUrl: string, expenseId: string, approveToken: string, rejectToken: string): string {
  const approveUrl = `${baseUrl}/expense?expenseId=${encodeURIComponent(expenseId)}&expenseAction=approve&token=${encodeURIComponent(approveToken)}`;
  const rejectUrl = `${baseUrl}/expense?expenseId=${encodeURIComponent(expenseId)}&expenseAction=reject&token=${encodeURIComponent(rejectToken)}`;
  return `<div style="margin-top:18px;">
  <a href="${approveUrl}" style="display:inline-block;background:#1f6feb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700;margin-right:8px;">批准</a>
  <a href="${rejectUrl}" style="display:inline-block;background:#fff;color:#c0392b;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700;border:1px solid #c0392b;">拒絕</a>
</div>`;
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => (key in vars ? vars[key] : ''));
}

function currencyFormatForEmail(amount: number): string {
  return `$${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function inferOriginFromRequest(request: Request | null, env: Env): string {
  if (request) {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  }
  return 'https://finance.bolccop.org';
}

const publicClaimUser: SessionUser = {
  id: 'public-claim',
  name: 'Public Claim',
  email: '',
  role: 'finance_admin',
  memberId: null
};

function cleanPublicText(value: unknown, maxLength = 500): string {
  return String(value || '').trim().slice(0, maxLength);
}

// 憑證多圖：每階段最多 10 張，DB 存 JSON 陣列，單張欄位恆等於陣列第一張。
const MAX_RECEIPTS_PER_SLOT = 10;

/** 讀取時把 JSON 陣列欄位解回字串陣列；舊資料只有單張欄位時退回用它 */
function parseReceiptUrls(raw: unknown, single: unknown): string[] {
  const fallback = String(single || '').trim();
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const list = parsed.map(item => String(item || '').trim()).filter(Boolean);
        if (list.length) return list.slice(0, MAX_RECEIPTS_PER_SLOT);
      }
    } catch {
      // 欄位內容壞掉就當作沒有，退回單張欄位
    }
  }
  return fallback ? [fallback] : [];
}

/** 寫入時正規化：去空白、去重、裁到上限。payload 沒帶陣列就退回單張欄位 */
function normalizeReceiptUrls(list: unknown, single: unknown): string[] {
  const source = Array.isArray(list) ? list : [single];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of source) {
    const url = cleanPublicText(item, 1000);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
    if (result.length >= MAX_RECEIPTS_PER_SLOT) break;
  }
  return result;
}

/** 供 SQL 綁定用：[JSON 陣列或 null, 第一張或 null] */
function receiptUrlBindings(urls: string[]): [string | null, string | null] {
  return [urls.length ? JSON.stringify(urls) : null, urls[0] ?? null];
}

// 手機掃碼上傳的 session 有效期。夠掃碼＋拍幾張，又不會讓連結長期可用。
const UPLOAD_SESSION_TTL_MS = 10 * 60 * 1000;

/** 取回仍然有效的上傳 session；token 比對用 hash，過期或已關閉都算無效 */
async function activeUploadSession(env: Env, sessionId: string, token: string) {
  if (!sessionId || !token) return null;
  const row = await env.DB.prepare('SELECT * FROM upload_sessions WHERE id = ?').bind(sessionId).first<any>();
  if (!row || row.closed_at) return null;
  if (row.token_hash !== await sha256(token)) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

async function publicClaimOptions(env: Env) {
  const [categories, members, usedMethods] = await Promise.all([
    env.DB.prepare('SELECT * FROM expense_categories ORDER BY name').all<any>(),
    env.DB.prepare(
      `SELECT id, name, first_name, last_name
       FROM members
       WHERE status = 'active' AND COALESCE(is_test, 0) = 0
       ORDER BY COALESCE(first_name, ''), COALESCE(last_name, ''), name`
    ).all<any>(),
    env.DB.prepare(
      `SELECT DISTINCT payment_method AS name
       FROM expenses
       WHERE payment_method IS NOT NULL AND trim(payment_method) <> ''
       ORDER BY payment_method`
    ).all<any>()
  ]);
  const standardPaymentMethods = ['現金', '銀行轉帳', '支票', '信用卡'];
  const paymentMethods = Array.from(new Set([
    ...standardPaymentMethods,
    ...(usedMethods.results || []).map(row => String(row.name || '').trim()).filter(Boolean)
  ]));
  return json({
    expenseCategories: (categories.results || []).map(row => ({
      id: row.id,
      name: row.name,
      budgetMonthly: Number(row.budget_monthly || 0),
      description: row.description || '',
      createdAt: row.created_at
    })),
    claimants: (members.results || []).map(row => {
      const english = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
      const localName = String(row.name || '').trim();
      return {
        id: row.id,
        name: english && localName && english !== localName ? `${english} (${localName})` : (english || localName || row.id)
      };
    }),
    paymentMethods
  });
}

async function createPublicClaim(env: Env, request: Request) {
  const payload = await readJson<any>(request);
  const claimantName = cleanPublicText(payload.claimantName, 120);
  const claimantEmail = cleanPublicText(payload.claimantEmail, 160);
  const claimantMemberId = cleanPublicText(payload.claimantMemberId, 80) || null;
  const description = cleanPublicText(payload.description, 240);
  const amount = Number(payload.amount);
  const date = cleanPublicText(payload.date, 20) || now().slice(0, 10);
  const categoryId = cleanPublicText(payload.categoryId, 80) || null;
  const paymentMethod = cleanPublicText(payload.paymentMethod, 80) || 'Reimbursement';
  const notes = cleanPublicText(payload.notes, 1000);
  const receiptUrl = cleanPublicText(payload.receiptUrl, 1000) || null;

  if (!claimantName) return error('請填寫姓名', 400);
  if (!description) return error('請填寫報銷內容', 400);
  if (!Number.isFinite(amount) || amount <= 0) return error('請填寫正確金額', 400);

  const itemId = id();
  const claimNotes = [
    `Claimant: ${claimantName}`,
    claimantEmail ? `Email: ${claimantEmail}` : '',
    notes ? `Notes: ${notes}` : ''
  ].filter(Boolean).join('\n');

  const [receiptJson, receiptFirst] = receiptUrlBindings(normalizeReceiptUrls(payload.receiptUrls, receiptUrl));
  await env.DB.prepare(
    'INSERT INTO expenses (id, category_id, amount, date, description, paid_by, approved_by, payment_method, status, notes, receipt_url, receipt_urls, is_test, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(itemId, categoryId, amount, date, description, claimantMemberId, null, paymentMethod, 'pending', claimNotes, receiptFirst, receiptJson, 0, now(), now()).run();

  const created = await getExpense(env, itemId);
  await recordAudit(env, publicClaimUser, {
    action: 'create',
    entityType: 'expense',
    entityId: itemId,
    entitySummary: expenseSummary(created),
    after: created
  });
  if (created) {
    await sendExpenseNotification(env, { ...publicClaimUser, name: claimantName, email: claimantEmail }, created, request);
  }
  return json({ ok: true, expense: created }, 201);
}

function actionResultHtml(title: string, message: string, ok = true) {
  return new Response(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f6fb;font-family:Arial,'Helvetica Neue',sans-serif;color:#172033;">
  <main style="max-width:520px;margin:8vh auto;padding:28px 24px;background:#fff;border-radius:12px;box-shadow:0 18px 48px rgba(25,41,70,.12);">
    <div style="font-size:38px;line-height:1;">${ok ? '✓' : '!'}</div>
    <h1 style="margin:16px 0 8px;font-size:24px;">${escapeHtml(title)}</h1>
    <p style="margin:0;color:#536179;line-height:1.65;">${escapeHtml(message)}</p>
  </main>
</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: ok ? 200 : 400 });
}

async function handleExpenseActionLink(env: Env, url: URL, request: Request) {
  const expenseId = url.searchParams.get('id') || '';
  const action = url.searchParams.get('action') as 'approve' | 'reject' | null;
  const token = url.searchParams.get('token') || '';
  if (!expenseId || !token || (action !== 'approve' && action !== 'reject')) {
    return actionResultHtml('連結無效', '缺少必要的批准或拒絕資訊。', false);
  }

  const tokenHash = await sha256(token);
  const tokenRow = await env.DB.prepare('SELECT * FROM expense_action_tokens WHERE token_hash = ?')
    .bind(tokenHash).first<any>();
  if (!tokenRow || tokenRow.expense_id !== expenseId || tokenRow.action !== action) {
    return actionResultHtml('連結無效', '這個操作連結不存在或不匹配。', false);
  }
  if (tokenRow.used_at) {
    return actionResultHtml('連結已使用', '這個操作連結已經被使用過。', false);
  }
  if (String(tokenRow.expires_at) < now()) {
    return actionResultHtml('連結已過期', '這個操作連結已超過 7 天有效期。', false);
  }

  const before = await getExpense(env, expenseId);
  if (!before) return actionResultHtml('支出不存在', '找不到這筆支出記錄。', false);
  if (before.status !== 'pending') {
    return actionResultHtml('無法操作', '這筆支出目前不是待審核狀態。', false);
  }

  const stamp = now();
  const actionUser = await currentUser(request, env);
  const opLabel = actionUser ? (actionUser.name || actionUser.email || 'Email Action') : 'Email Action';
  await env.DB.prepare('UPDATE expenses SET status = ?, approved_by = ?, approved_by_text = ?, approved_at = ?, updated_at = ? WHERE id = ?')
    .bind(action === 'approve' ? 'approved' : 'rejected', actionUser?.memberId || null, opLabel, stamp, stamp, expenseId).run();
  await env.DB.prepare('UPDATE expense_action_tokens SET used_at = ?, used_by = ? WHERE token_hash = ?')
    .bind(stamp, opLabel, tokenHash).run();

  const after = await getExpense(env, expenseId);
  await recordAudit(env, actionUser ?? { id: 'email-action', name: opLabel, email: '', role: 'finance_admin', memberId: null }, {
    action,
    entityType: 'expense',
    entityId: expenseId,
    entitySummary: expenseSummary(after),
    before,
    after
  });

  return actionResultHtml(action === 'approve' ? '已批准' : '已拒絕', `支出「${after?.description || expenseId}」已完成${action === 'approve' ? '批准' : '拒絕'}。`);
}

type RecipientSendResult = { recipient: string; ok: boolean; status?: number; error?: string };

async function sendOneNotification(env: Env, from: string, replyTo: string, subject: string, html: string, recipient: string): Promise<RecipientSendResult> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: recipient, reply_to: replyTo, subject, html })
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('Resend send failed', recipient, response.status, text);
      return { recipient, ok: false, status: response.status, error: text || `HTTP ${response.status}` };
    }
    return { recipient, ok: true, status: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Resend send threw', recipient, message);
    return { recipient, ok: false, error: message };
  }
}

async function buildExpenseNotificationContent(
  env: Env,
  user: SessionUser,
  expense: any,
  request: Request | null,
  settings: ExpenseNotifySettings
): Promise<{ subject: string; html: string }> {
  let actionButtonsHtml = '';
  if (settings.includeActionButtons) {
    try {
      const approveToken = await createActionToken(env, expense.id, 'approve');
      const rejectToken = await createActionToken(env, expense.id, 'reject');
      actionButtonsHtml = renderActionButtons(inferOriginFromRequest(request, env), expense.id, approveToken, rejectToken);
    } catch {
      actionButtonsHtml = '';
    }
  }
  const vars: Record<string, string> = {
    description: escapeHtml(expense.description || '無描述'),
    amount: currencyFormatForEmail(expense.amount),
    category: escapeHtml(expense.categoryName || '未分類'),
    date: escapeHtml(expense.date || ''),
    paidBy: escapeHtml(expense.paidByName || '—'),
    submittedBy: escapeHtml(user.name || user.email || ''),
    paymentMethod: escapeHtml(expense.paymentMethod || ''),
    notes: escapeHtml(expense.notes || ''),
    receiptUrl: escapeHtml(expense.receiptUrl || ''),
    receiptLink: expense.receiptUrl ? `<a href="${escapeHtml(expense.receiptUrl)}">查看憑證</a>` : '—',
    actionButtons: actionButtonsHtml
  };
  const subject = applyTemplate(settings.subjectTemplate || DEFAULT_EXPENSE_NOTIFY_SUBJECT, vars);
  const html = applyTemplate(settings.bodyTemplate || DEFAULT_EXPENSE_NOTIFY_BODY, vars);
  return { subject, html };
}

async function sendExpenseNotification(env: Env, user: SessionUser, expense: any, request: Request | null): Promise<RecipientSendResult[]> {
  if (!env.RESEND_API_KEY) return [];
  const settings = await readExpenseNotifySettings(env);
  const recipients = settings.recipients.filter(isEmailAddress);
  if (!settings.enabled || recipients.length === 0) return [];

  const { subject, html } = await buildExpenseNotificationContent(env, user, expense, request, settings);

  // 每收件人一次 API 調用：避免共享 To header 觸發 Gmail/Outlook 多收件人 spam 啟發；
  // 個別失敗不連帶其他人；可追蹤每地址的送達狀態。
  const results = await Promise.allSettled(
    recipients.map(r => sendOneNotification(env, settings.mailFrom, settings.replyTo, subject, html, r))
  );
  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { recipient: recipients[i], ok: false, error: String((r as PromiseRejectedResult).reason) }
  );
}

async function sendExpenseNotificationTest(env: Env, user: SessionUser, request: Request): Promise<RecipientSendResult[]> {
  if (!env.RESEND_API_KEY) return [];
  const settings = await readExpenseNotifySettings(env);
  const recipients = settings.recipients.filter(isEmailAddress);
  if (recipients.length === 0) return [];

  const sampleExpense = {
    id: 'test-' + Date.now(),
    description: '[測試] 範例支出',
    amount: 123.45,
    categoryName: '測試分類',
    date: new Date().toISOString().slice(0, 10),
    paidByName: user.name || user.email || '測試付款人',
    paymentMethod: '現金',
    notes: '這是一封來自「支出通知設置」的測試郵件。',
    receiptUrl: ''
  };
  const { subject, html } = await buildExpenseNotificationContent(env, user, sampleExpense, request, settings);
  const testSubject = `[TEST] ${subject}`;
  const results = await Promise.allSettled(
    recipients.map(r => sendOneNotification(env, settings.mailFrom, settings.replyTo, testSubject, html, r))
  );
  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { recipient: recipients[i], ok: false, error: String((r as PromiseRejectedResult).reason) }
  );
}

async function readDeleteReason(request: Request): Promise<string> {
  const payload = await readJson<{ reason?: string }>(request).catch(() => ({} as { reason?: string }));
  return String(payload?.reason || '').trim();
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
    starred: Boolean(row.starred),
    avatarUrl: row.avatar_url || null,
    contactConfirmed: Boolean(row.contact_confirmed),
    externalContact: Boolean(row.external_contact),
    importSource: row.import_source || '',
    totalOffering: Number(row.total_offering || 0),
    isTest: Boolean(row.is_test),
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
    receiptUrls: parseReceiptUrls(row.receipt_urls, row.receipt_url),
    isTest: Boolean(row.is_test),
    createdBy: row.created_by || null,
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
    approvedAt: row.approved_at || null,
    invoicedBy: row.invoiced_by || null,
    invoicedByName: row.invoiced_by_name || undefined,
    invoicedAt: row.invoiced_at || null,
    invoiceNote: row.invoice_note || null,
    invoiceAmount: row.invoice_amount != null ? Number(row.invoice_amount) : null,
    invoiceReceiptUrl: row.invoice_receipt_url || null,
    invoiceReceiptUrls: parseReceiptUrls(row.invoice_receipt_urls, row.invoice_receipt_url),
    accountedBy: row.accounted_by || null,
    accountedByName: row.accounted_by_name || undefined,
    accountedAt: row.accounted_at || null,
    accountReceiptUrl: row.account_receipt_url || null,
    accountReceiptUrls: parseReceiptUrls(row.account_receipt_urls, row.account_receipt_url),
    paymentMethod: row.payment_method || '',
    status: row.status as ExpenseStatus,
    notes: row.notes || '',
    receiptUrl: row.receipt_url || null,
    receiptUrls: parseReceiptUrls(row.receipt_urls, row.receipt_url),
    isTest: Boolean(row.is_test),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapUser(row: any) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    memberId: row.member_id || null,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listMembers(env: Env, url: URL, testFlag: number, hideTotals = false) {
  const search = `%${url.searchParams.get('q') || ''}%`;
  const result = await env.DB.prepare(
    `SELECT m.*, g.name AS group_name, COALESCE(SUM(o.amount), 0) AS total_offering
     FROM members m
     LEFT JOIN member_groups g ON g.id = m.group_id
     LEFT JOIN offerings o ON o.member_id = m.id AND o.is_test = ?
     WHERE (m.name LIKE ? OR m.email LIKE ? OR m.phone LIKE ?) AND m.is_test = ?
     GROUP BY m.id
     ORDER BY m.name`
  ).bind(testFlag, search, search, search, testFlag).all();
  // Counter 可看成員的聯絡資料，但不得看到任何奉獻金額
  const items = (result.results || []).map(row => {
    const member = mapMember(row);
    return hideTotals ? { ...member, totalOffering: 0 } : member;
  });
  return json({ items, total: result.results?.length || 0 });
}

/** ownerId 有值時只回傳該帳號建立的奉獻（Counter 用） */
async function listOfferings(env: Env, testFlag: number, ownerId?: string) {
  const result = ownerId
    ? await env.DB.prepare(
        `SELECT o.*, m.name AS member_name, c.name AS category_name, method.name AS method_name
         FROM offerings o
         LEFT JOIN members m ON m.id = o.member_id
         LEFT JOIN offering_categories c ON c.id = o.category_id
         LEFT JOIN offering_methods method ON method.id = o.method_id
         WHERE o.is_test = ? AND o.created_by = ?
         ORDER BY o.date DESC, o.created_at DESC`
      ).bind(testFlag, ownerId).all()
    : await env.DB.prepare(
        `SELECT o.*, m.name AS member_name, c.name AS category_name, method.name AS method_name
         FROM offerings o
         LEFT JOIN members m ON m.id = o.member_id
         LEFT JOIN offering_categories c ON c.id = o.category_id
         LEFT JOIN offering_methods method ON method.id = o.method_id
         WHERE o.is_test = ?
         ORDER BY o.date DESC, o.created_at DESC`
      ).bind(testFlag).all();
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

async function listExpenses(env: Env, testFlag: number) {
  const result = await env.DB.prepare(
    `SELECT e.*, c.name AS category_name, paid.name AS paid_by_name,
            COALESCE(e.approved_by_text, approved.name) AS approved_by_name,
            COALESCE(e.invoiced_by_text, invoiced.name) AS invoiced_by_name,
            COALESCE(e.accounted_by_text, accounted.name) AS accounted_by_name
     FROM expenses e
     LEFT JOIN expense_categories c ON c.id = e.category_id
     LEFT JOIN members paid ON paid.id = e.paid_by
     LEFT JOIN members approved ON approved.id = e.approved_by
     LEFT JOIN members invoiced ON invoiced.id = e.invoiced_by
     LEFT JOIN members accounted ON accounted.id = e.accounted_by
     WHERE e.is_test = ?
     ORDER BY e.date DESC, e.created_at DESC`
  ).bind(testFlag).all();
  return json({ items: (result.results || []).map(mapExpense), total: result.results?.length || 0 });
}

async function getExpense(env: Env, expenseId: string) {
  const row = await env.DB.prepare(
    `SELECT e.*, c.name AS category_name, paid.name AS paid_by_name,
            COALESCE(e.approved_by_text, approved.name) AS approved_by_name,
            COALESCE(e.invoiced_by_text, invoiced.name) AS invoiced_by_name,
            COALESCE(e.accounted_by_text, accounted.name) AS accounted_by_name
     FROM expenses e
     LEFT JOIN expense_categories c ON c.id = e.category_id
     LEFT JOIN members paid ON paid.id = e.paid_by
     LEFT JOIN members approved ON approved.id = e.approved_by
     LEFT JOIN members invoiced ON invoiced.id = e.invoiced_by
     LEFT JOIN members accounted ON accounted.id = e.accounted_by
     WHERE e.id = ?`
  ).bind(expenseId).first();
  return row ? mapExpense(row) : null;
}

async function dashboard(env: Env, testFlag: number) {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const previousWeek = new Date(startOfWeek);
  previousWeek.setDate(startOfWeek.getDate() - 7);
  const month = today.toISOString().slice(0, 7);
  const weekStart = startOfWeek.toISOString().slice(0, 10);
  const prevWeekStart = previousWeek.toISOString().slice(0, 10);
  const t = testFlag ? 1 : 0;

  const weekOffering = await env.DB.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM offerings WHERE date >= ? AND is_test = ${t}`).bind(weekStart).first<any>();
  const prevOffering = await env.DB.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM offerings WHERE date >= ? AND date < ? AND is_test = ${t}`).bind(prevWeekStart, weekStart).first<any>();
  const monthExpense = await env.DB.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE substr(date, 1, 7) = ? AND status = 'approved' AND is_test = ${t}`).bind(month).first<any>();
  const budget = await env.DB.prepare('SELECT COALESCE(SUM(budget_monthly), 0) AS total FROM expense_categories').first<any>();
  const pending = await env.DB.prepare(`SELECT COUNT(*) AS count FROM expenses WHERE status = 'pending' AND is_test = ${t}`).first<any>();
  const newMembers = await env.DB.prepare(`SELECT COUNT(*) AS count FROM members WHERE substr(join_date, 1, 7) = ? AND is_test = ${t}`).bind(month).first<any>();
  const trend = await env.DB.prepare(`SELECT substr(date, 1, 7) AS label, SUM(amount) AS amount FROM offerings WHERE is_test = ${t} GROUP BY label ORDER BY label DESC LIMIT 12`).all<any>();
  const incomeExpense = await env.DB.prepare(
    `WITH months AS (
       SELECT substr(date, 1, 7) AS label FROM offerings WHERE is_test = ${t}
       UNION
       SELECT substr(date, 1, 7) AS label FROM expenses WHERE is_test = ${t}
     )
     SELECT months.label,
       COALESCE((SELECT SUM(amount) FROM offerings WHERE substr(date, 1, 7) = months.label AND is_test = ${t}), 0) AS offerings,
       COALESCE((SELECT SUM(amount) FROM expenses WHERE substr(date, 1, 7) = months.label AND status = 'approved' AND is_test = ${t}), 0) AS expenses
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

      if (url.pathname === '/api/public/claim-options' && request.method === 'GET') {
        return publicClaimOptions(env);
      }

      if (url.pathname === '/api/public/claims' && request.method === 'POST') {
        return createPublicClaim(env, request);
      }

      if (url.pathname === '/api/public/claim-upload' && request.method === 'POST') {
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) return error('No file uploaded', 400);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const key = `claim/${Date.now()}-${safeName}`;
        await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
        const fileUrl = env.FILES_URL ? `${env.FILES_URL.replace(/\/$/, '')}/${key}` : `/api/files/${encodeURIComponent(key)}`;
        return json({ key, url: fileUrl });
      }

      // 手機掃碼上傳：免登入，但 token 只對這一個 session 有效，且只能寫不能讀。
      if (url.pathname === '/api/public/snap-upload' && request.method === 'POST') {
        const form = await request.formData();
        const sessionId = String(form.get('sessionId') || '');
        const token = String(form.get('token') || '');
        const file = form.get('file');
        if (!(file instanceof File)) return error('No file uploaded', 400);
        // 免登入端點，擋掉超大檔；正常憑證壓縮後遠低於此
        if (file.size > 15 * 1024 * 1024) return error('檔案過大', 400);
        const session = await activeUploadSession(env, sessionId, token);
        if (!session) return error('連結已失效，請在電腦上重新產生 QR Code', 403);
        const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM upload_session_files WHERE session_id = ?')
          .bind(sessionId).first<any>();
        if (Number(count?.n || 0) >= MAX_RECEIPTS_PER_SLOT) return error(`最多 ${MAX_RECEIPTS_PER_SLOT} 張`, 400);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-') || 'photo.jpg';
        const key = `snap/${sessionId}/${Date.now()}-${safeName}`;
        await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
        const fileUrl = env.FILES_URL ? `${env.FILES_URL.replace(/\/$/, '')}/${key}` : `/api/files/${encodeURIComponent(key)}`;
        await env.DB.prepare('INSERT INTO upload_session_files (id, session_id, url, created_at) VALUES (?, ?, ?, ?)')
          .bind(id(), sessionId, fileUrl, now()).run();
        return json({ url: fileUrl });
      }

      // 手機端進頁時確認連結還有效，順便取得已傳張數
      if (url.pathname === '/api/public/snap-session' && request.method === 'POST') {
        const payload = await readJson<{ sessionId?: string; token?: string }>(request)
          .catch(() => ({} as { sessionId?: string; token?: string }));
        const session = await activeUploadSession(env, String(payload.sessionId || ''), String(payload.token || ''));
        if (!session) return error('連結已失效，請在電腦上重新產生 QR Code', 403);
        const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM upload_session_files WHERE session_id = ?')
          .bind(session.id).first<any>();
        return json({ ok: true, uploaded: Number(count?.n || 0), max: MAX_RECEIPTS_PER_SLOT, expiresAt: session.expires_at });
      }

      if (url.pathname.startsWith('/api/files/') && request.method === 'GET') {
        const key = decodeURIComponent(url.pathname.replace('/api/files/', ''));
        const object = await env.FILES.get(key);
        if (!object) return error('File not found', 404);
        return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream' } });
      }

      if (url.pathname === '/expense-action' && request.method === 'GET') {
        return handleExpenseActionLink(env, url, request);
      }

      if (url.pathname === '/api/auth/forgot-password' && request.method === 'POST') {
        const payload = await readJson<{ email?: string }>(request).catch(() => ({} as { email?: string }));
        const email = String(payload.email || '').trim();
        if (email && env.RESEND_API_KEY) {
          try {
            await ensurePasswordResetsTable(env);
            const account = await env.DB.prepare('SELECT id, name, email FROM users WHERE lower(email) = lower(?) AND active = 1').bind(email).first<any>();
            if (account) {
              const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
              const tokenHash = await sha256(token);
              const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
              await env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').bind(now(), account.id).run();
              await env.DB.prepare('INSERT INTO password_resets (id, user_id, token_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)')
                .bind(id(), account.id, tokenHash, expiresAt, now()).run();
              const settings = await readTaxStatementSettings(env);
              const resetUrl = `${url.origin}/?reset=${token}`;
              const html = `<!doctype html><html><body style="margin:0;background:#eef1f6;font-family:Arial,'Helvetica Neue',sans-serif;color:#172033;">
  <div style="max-width:480px;margin:0 auto;padding:28px 24px;">
    <div style="background:#fff;border-radius:10px;padding:28px 26px;box-shadow:0 10px 30px rgba(25,41,70,.1);">
      <h2 style="margin:0 0 4px;font-size:18px;color:#172033;">重設密碼 Reset Password</h2>
      <p style="margin:14px 0 0;font-size:14px;">您好 ${account.name}，</p>
      <p style="margin:10px 0 0;font-size:14px;line-height:1.6;">我們收到了您在「信望愛靈糧堂財務系統」的密碼重設請求。請點擊下方按鈕設定新密碼，連結 <strong>1 小時內</strong>有效。</p>
      <p style="margin:22px 0;"><a href="${resetUrl}" style="display:inline-block;background:#1f6feb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">重設密碼</a></p>
      <p style="margin:0;font-size:12px;color:#68758a;line-height:1.6;">若按鈕無法點擊，請複製此連結至瀏覽器開啟：<br/>${resetUrl}</p>
      <p style="margin:16px 0 0;font-size:12px;color:#68758a;">如果您並未提出此請求，請忽略本郵件，您的密碼不會被更改。</p>
    </div>
  </div></body></html>`;
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: settings.mailFrom || env.MAIL_FROM,
                  to: account.email,
                  reply_to: settings.replyTo,
                  subject: '重設密碼 — 信望愛靈糧堂財務系統',
                  html
                })
              });
            }
          } catch {
            // 不向客戶端透露任何細節（防郵箱枚舉）
          }
        }
        return json({ ok: true });
      }

      if (url.pathname === '/api/auth/reset-password' && request.method === 'POST') {
        const payload = await readJson<{ token?: string; password?: string }>(request).catch(() => ({} as { token?: string; password?: string }));
        const token = String(payload.token || '');
        const password = String(payload.password || '');
        if (!token) return error('連結無效');
        if (password.length < 6) return error('密碼至少 6 個字元');
        await ensurePasswordResetsTable(env);
        const tokenHash = await sha256(token);
        const row = await env.DB.prepare('SELECT * FROM password_resets WHERE token_hash = ?').bind(tokenHash).first<any>();
        if (!row || row.used_at || String(row.expires_at) < now()) {
          return error('連結已失效或過期，請重新申請', 400);
        }
        await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(await sha256(password), now(), row.user_id).run();
        await env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').bind(now(), row.id).run();
        return json({ ok: true });
      }

      if (url.pathname.startsWith('/api/')) {
        const auth = await requireUser(request, env, 'counter');
        if (auth instanceof Response) return auth;
        const user = auth;
        const testFlag = testFlagFor(user.role);

        // Counter 的總閘門：白名單以外的端點在這裡就攔掉，不進入後面的路由
        if (user.role === 'counter' && !counterAllows(url.pathname, request.method)) {
          return error('Forbidden', 403);
        }
        // 其餘角色維持原本的最低門檻（dev 以上）
        if (user.role !== 'counter' && roleRank[user.role] < roleRank['dev']) {
          return error('Forbidden', 403);
        }

        if (url.pathname === '/api/auth/change-password' && request.method === 'POST') {
          const payload = await readJson<{ currentPassword?: string; newPassword?: string }>(request);
          const current = String(payload.currentPassword || '');
          const next = String(payload.newPassword || '');
          if (next.length < 6) return error('新密碼至少 6 個字元');
          const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<any>();
          if (!row) return error('User not found', 404);
          if (row.password_hash !== current && row.password_hash !== await sha256(current)) {
            return error('當前密碼不正確', 400);
          }
          await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(await sha256(next), now(), user.id).run();
          return json({ ok: true });
        }

        if (url.pathname === '/api/finance/dashboard') return dashboard(env, testFlag);

        if (url.pathname === '/api/backup/export' && request.method === 'GET') {
          if (!canManageSettings(user.role)) return error('Forbidden', 403);
          return json(await exportBackup(env));
        }

        if (url.pathname === '/api/backup/import' && request.method === 'POST') {
          if (!canManageSettings(user.role)) return error('Forbidden', 403);
          const payload = await readJson<BackupData>(request);
          const summary = await importBackup(env, payload);
          const total = Object.values(summary.tables).reduce((acc, t) => acc + t.inserted + t.updated, 0);
          await recordAudit(env, user, {
            action: 'import',
            entityType: 'backup',
            entityId: 'backup',
            entitySummary: `導入備份：${total} 筆（新增/更新）`,
            after: summary
          });
          return json(summary);
        }

        if (url.pathname === '/api/backup/restore-file' && request.method === 'POST') {
          if (!canManageSettings(user.role)) return error('Forbidden', 403);
          const form = await request.formData();
          const key = String(form.get('key') || '');
          const file = form.get('file');
          if (!key) return error('Missing key');
          if (!(file instanceof File)) return error('Missing file');
          await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
          return json({ ok: true });
        }

        if (url.pathname === '/api/settings' && request.method === 'GET') {
          return json(await readAppSettings(env));
        }

        if (url.pathname === '/api/settings' && request.method === 'PUT') {
          if (!canManageSettings(user.role)) return error('Forbidden', 403);
          const payload = await readJson<AppSettings>(request);
          const beforeSettings = await readAppSettings(env);
          const saved = await saveAppSettings(env, user, payload);
          const auditTarget = settingsAuditTarget(beforeSettings, saved);
          await recordAudit(env, user, {
            action: 'update',
            entityType: 'settings',
            entityId: auditTarget.id,
            entitySummary: auditTarget.summary,
            before: auditTarget.before,
            after: auditTarget.after
          });
          return json(saved);
        }

        if (url.pathname === '/api/settings/expense-notify/test' && request.method === 'POST') {
          if (!canManageSettings(user.role)) return error('Forbidden', 403);
          if (!env.RESEND_API_KEY) return error('郵件服務尚未設定（缺少 RESEND_API_KEY）', 500);
          const results = await sendExpenseNotificationTest(env, user, request);
          return json({ results });
        }

        if (url.pathname === '/api/lookups') {
          const [groups, offeringCategories, offeringMethods, expenseCategories] = await Promise.all([
            env.DB.prepare('SELECT id, name, description, created_at AS createdAt FROM member_groups ORDER BY name').all(),
            env.DB.prepare('SELECT id, name, description, icon, created_at AS createdAt FROM offering_categories ORDER BY name').all(),
            env.DB.prepare('SELECT id, name, group_name AS groupName, sort_order AS sortOrder, created_at AS createdAt FROM offering_methods ORDER BY sort_order, name').all(),
            env.DB.prepare('SELECT id, name, short_name AS shortName, budget_monthly AS budgetMonthly, description, created_at AS createdAt FROM expense_categories ORDER BY name').all()
          ]);
          return json({
            memberGroups: groups.results || [],
            offeringCategories: offeringCategories.results || [],
            offeringMethods: offeringMethods.results || [],
            expenseCategories: expenseCategories.results || []
          });
        }

        if (url.pathname === '/api/expense-categories' && request.method === 'PUT') {
          if (!canManageSettings(user.role)) return error('Forbidden', 403);
          const payload = await readJson<{ categories: Array<{ id?: string; name: string; shortName: string }> }>(request);
          const items = Array.isArray(payload?.categories) ? payload.categories : [];
          const existingRows = await env.DB.prepare('SELECT id FROM expense_categories').all<{ id: string }>();
          const existingIds = new Set((existingRows.results || []).map(r => r.id));
          const keepIds = new Set<string>();
          for (const c of items) {
            const name = String(c?.name ?? '').trim();
            if (!name) continue;
            const shortName = String(c?.shortName ?? '').trim();
            if (c?.id && existingIds.has(c.id)) {
              await env.DB.prepare('UPDATE expense_categories SET name = ?, short_name = ? WHERE id = ?').bind(name, shortName, c.id).run();
              keepIds.add(c.id);
            } else {
              const newId = id();
              await env.DB.prepare("INSERT INTO expense_categories (id, name, short_name, budget_monthly, description, created_at) VALUES (?, ?, ?, 0, '', ?)").bind(newId, name, shortName, now()).run();
              keepIds.add(newId);
            }
          }
          // 移除不在清單中的類型：相關支出的分類設為未分類，再刪除
          for (const oldId of existingIds) {
            if (keepIds.has(oldId)) continue;
            await env.DB.prepare('UPDATE expenses SET category_id = NULL WHERE category_id = ?').bind(oldId).run();
            await env.DB.prepare('DELETE FROM expense_categories WHERE id = ?').bind(oldId).run();
          }
          return json({ ok: true });
        }

        if (url.pathname === '/api/members' && request.method === 'GET') return listMembers(env, url, testFlag, user.role === 'counter');
        if (url.pathname === '/api/offerings' && request.method === 'GET') return listOfferings(env, testFlag, user.role === 'counter' ? user.id : undefined);
        if (url.pathname === '/api/expenses' && request.method === 'GET') return listExpenses(env, testFlag);
        if (url.pathname === '/api/audit-logs' && request.method === 'GET') return listAuditLogs(env);

        if (url.pathname === '/api/reports/tax-signature' && request.method === 'GET') {
          const settings = await readTaxStatementSettings(env);
          if (!settings.signatureUrl) return error('未設定簽名', 404);
          const upstream = await fetch(settings.signatureUrl);
          if (!upstream.ok) return error('簽名圖讀取失敗', 502);
          return new Response(upstream.body, {
            headers: {
              'Content-Type': upstream.headers.get('Content-Type') || 'image/png',
              'Cache-Control': 'private, max-age=300'
            }
          });
        }

        if (url.pathname === '/api/reports/tax-statement/send' && request.method === 'POST') {
          const payload = await readJson<{ memberId?: string; year?: number; pdf?: string }>(request);
          const memberId = String(payload.memberId || '');
          const year = Number(payload.year);
          if (!memberId || !year) return error('缺少 memberId 或 year');
          if (!env.RESEND_API_KEY) return error('郵件服務尚未設定（缺少 RESEND_API_KEY）', 500);

          const memberRow = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(memberId).first<any>();
          if (!memberRow) return error('Member not found', 404);
          const member = mapMember(memberRow);
          if (!sameTestScope(user.role, member.isTest)) return error('Forbidden', 403);
          if (!member.email) return error('該成員沒有電郵地址，無法發送', 400);

          const offeringRows = await env.DB.prepare(
            `SELECT o.*, c.name AS category_name, method.name AS method_name
             FROM offerings o
             LEFT JOIN offering_categories c ON c.id = o.category_id
             LEFT JOIN offering_methods method ON method.id = o.method_id
             WHERE o.member_id = ? AND substr(o.date, 1, 4) = ? AND o.is_test = ?
             ORDER BY o.date`
          ).bind(memberId, String(year), testFlagFor(user.role)).all();
          const offerings = (offeringRows.results || []).map(mapOffering);
          if (!offerings.length) return error(`${year} 年度沒有該成員的奉獻記錄`, 400);

          const settings = await readTaxStatementSettings(env);
          const data = buildTaxStatementData(member, memberId, offerings, year);
          const html = buildTaxStatementHtml(data, undefined, settings);

          const emailBody: Record<string, unknown> = {
            from: settings.mailFrom || env.MAIL_FROM || `${CHURCH_INFO.nameEn} <onboarding@resend.dev>`,
            to: member.email,
            reply_to: settings.replyTo || CHURCH_INFO.email,
            subject: `${year} Annual Contribution Statement — ${settings.textFields.churchNameEn || CHURCH_INFO.nameEn}`,
            html
          };
          if (payload.pdf) {
            emailBody.attachments = [{
              filename: `${year} Annual Contribution Statement.pdf`,
              content: payload.pdf
            }];
          }
          const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailBody)
          });
          if (!resendResponse.ok) {
            const detail = await resendResponse.text();
            return error(`郵件發送失敗：${detail || resendResponse.status}`, 502);
          }

          await recordAudit(env, user, {
            action: 'send',
            entityType: 'tax_statement',
            entityId: memberId,
            entitySummary: `報稅文件 ${year} ｜ ${data.donorName} <${member.email}>`
          });
          return json({ ok: true });
        }

        if (url.pathname === '/api/users' && request.method === 'GET') {
          if (!canManageUsers(user.role)) return error('Forbidden', 403);
          const result = await env.DB.prepare('SELECT * FROM users ORDER BY created_at').all();
          return json({ items: (result.results || []).map(mapUser), total: result.results?.length || 0 });
        }

        if (url.pathname === '/api/users' && request.method === 'POST') {
          if (!canManageUsers(user.role)) return error('Forbidden', 403);
          const payload = await readJson<any>(request);
          const name = String(payload.name || '').trim();
          const email = String(payload.email || '').trim();
          const role = String(payload.role || '') as Role;
          const password = String(payload.password || '');
          if (!name || !email) return error('姓名與電郵必填');
          if (!VALID_ROLES.includes(role)) return error('角色無效');
          if (password.length < 6) return error('密碼至少 6 個字元');
          const dup = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').bind(email).first();
          if (dup) return error('該電郵已被使用');
          const itemId = id();
          await env.DB.prepare(
            'INSERT INTO users (id, name, email, role, member_id, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)'
          ).bind(itemId, name, email, role, payload.memberId || null, await sha256(password), now(), now()).run();
          const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(itemId).first();
          await recordAudit(env, user, { action: 'create', entityType: 'user', entityId: itemId, entitySummary: `用戶 ${name} <${email}>`, after: mapUser(row) });
          return json(mapUser(row), 201);
        }

        if (url.pathname.match(/^\/api\/users\/[^/]+\/reset-password$/) && request.method === 'POST') {
          if (!canManageUsers(user.role)) return error('Forbidden', 403);
          const itemId = url.pathname.split('/')[3];
          const payload = await readJson<{ password?: string }>(request);
          const password = String(payload.password || '');
          if (password.length < 6) return error('密碼至少 6 個字元');
          const target = await env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(itemId).first<any>();
          if (!target) return error('User not found', 404);
          await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(await sha256(password), now(), itemId).run();
          await recordAudit(env, user, { action: 'update', entityType: 'user', entityId: itemId, entitySummary: `重置密碼 ｜ ${target.name} <${target.email}>` });
          return json({ ok: true });
        }

        if (url.pathname.match(/^\/api\/users\/[^/]+$/)) {
          if (!canManageUsers(user.role)) return error('Forbidden', 403);
          const itemId = decodeURIComponent(url.pathname.split('/').pop() || '');
          const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(itemId).first<any>();
          if (!target) return error('User not found', 404);
          if (request.method === 'PUT') {
            const payload = await readJson<any>(request);
            const name = String(payload.name ?? target.name).trim();
            const email = String(payload.email ?? target.email).trim();
            const role = String(payload.role ?? target.role) as Role;
            const active = payload.active === undefined ? Number(target.active) : (payload.active ? 1 : 0);
            if (!name || !email) return error('姓名與電郵必填');
            if (!VALID_ROLES.includes(role)) return error('角色無效');
            if (target.role === 'super_admin' && (role !== 'super_admin' || !active)) {
              const supers = await env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'super_admin' AND active = 1").first<any>();
              if (Number(supers?.c || 0) <= 1) return error('必須保留至少一個啟用的 Super Admin');
            }
            const dup = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').bind(email, itemId).first();
            if (dup) return error('該電郵已被使用');
            await env.DB.prepare('UPDATE users SET name = ?, email = ?, role = ?, member_id = ?, active = ?, updated_at = ? WHERE id = ?')
              .bind(name, email, role, payload.memberId || null, active, now(), itemId).run();
            const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(itemId).first();
            await recordAudit(env, user, { action: 'update', entityType: 'user', entityId: itemId, entitySummary: `用戶 ${name} <${email}>`, before: mapUser(target), after: mapUser(row) });
            return json(mapUser(row));
          }
          if (request.method === 'DELETE') {
            if (itemId === user.id) return error('不能刪除自己的帳號');
            if (target.role === 'super_admin') {
              const supers = await env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'super_admin' AND active = 1").first<any>();
              if (Number(supers?.c || 0) <= 1) return error('必須保留至少一個啟用的 Super Admin');
            }
            await recordAudit(env, user, { action: 'delete', entityType: 'user', entityId: itemId, entitySummary: `用戶 ${target.name} <${target.email}>`, reason: '用戶管理刪除', before: mapUser(target) });
            await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(itemId).run();
            return json({ ok: true });
          }
        }

        if (url.pathname === '/api/members' && request.method === 'POST') {
          if (!canManageMembers(user.role)) return error('Forbidden', 403);
          const payload = await readJson<any>(request);
          if (payload.email) {
            const dup = await env.DB.prepare('SELECT id FROM members WHERE lower(email) = lower(?)').bind(payload.email).first();
            if (dup) return error('該電郵已被其他成員使用，請改用其他電郵或留空');
          }
          const itemId = id();
          await env.DB.prepare(
            `INSERT INTO members (
              id, import_pid, name, first_name, last_name, partner, email, phone, home_phone,
              group_id, status, join_date, address, city, state_region, postal_code, notes,
              avatar_url, contact_confirmed, external_contact, import_source, is_test, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            testFlag,
            now(),
            now()
          ).run();
          const row = await env.DB.prepare('SELECT m.*, g.name AS group_name, 0 AS total_offering FROM members m LEFT JOIN member_groups g ON g.id = m.group_id WHERE m.id = ?').bind(itemId).first();
          const created = mapMember(row);
          await recordAudit(env, user, {
            action: 'create',
            entityType: 'member',
            entityId: itemId,
            entitySummary: `成員 ${[created.firstName, created.lastName].filter(Boolean).join(' ').trim() || created.name || itemId}`,
            after: created
          });
          return json(created, 201);
        }

        if (url.pathname === '/api/offerings' && request.method === 'POST') {
          if (!canRecordOffering(user.role)) return error('Forbidden', 403);
          const payload = await readJson<any>(request);
          const itemId = id();
          const [receiptJson, receiptFirst] = receiptUrlBindings(normalizeReceiptUrls(payload.receiptUrls, payload.receiptUrl));
          // created_by 一律取自 session，不接受 payload 帶入
          await env.DB.prepare(
            'INSERT INTO offerings (id, member_id, amount, date, category_id, method_id, notes, receipt_url, receipt_urls, is_test, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(itemId, payload.memberId || null, Number(payload.amount), payload.date, payload.categoryId || null, payload.methodId || null, payload.notes || '', receiptFirst, receiptJson, testFlag, user.id, now(), now()).run();
          const created = await getOffering(env, itemId);
          await recordAudit(env, user, {
            action: 'create',
            entityType: 'offering',
            entityId: itemId,
            entitySummary: offeringSummary(created),
            after: created
          });
          return json(created, 201);
        }

        if (url.pathname === '/api/expenses' && request.method === 'POST') {
          if (!canManageFinance(user.role)) return error('Forbidden', 403);
          const payload = await readJson<any>(request);
          const itemId = id();
          const [receiptJson, receiptFirst] = receiptUrlBindings(normalizeReceiptUrls(payload.receiptUrls, payload.receiptUrl));
          await env.DB.prepare(
            'INSERT INTO expenses (id, category_id, amount, date, description, paid_by, approved_by, payment_method, status, notes, receipt_url, receipt_urls, is_test, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(itemId, payload.categoryId || null, Number(payload.amount), payload.date, payload.description || '', payload.paidBy || null, null, payload.paymentMethod || '現金', 'pending', payload.notes || '', receiptFirst, receiptJson, testFlag, now(), now()).run();
          const created = await getExpense(env, itemId);
          await recordAudit(env, user, {
            action: 'create',
            entityType: 'expense',
            entityId: itemId,
            entitySummary: expenseSummary(created),
            after: created
          });
          // 邮件通知（如已配置）；失败不影响主流程
          if (created && !created.isTest) {
            await sendExpenseNotification(env, user, created, request);
          }
          return json(created, 201);
        }

        if (url.pathname.match(/^\/api\/members\/[^/]+\/star$/) && request.method === 'POST') {
          if (!canManageMembers(user.role)) return error('Forbidden', 403);
          const itemId = url.pathname.split('/')[3];
          const current = await env.DB.prepare('SELECT starred, is_test FROM members WHERE id = ?').bind(itemId).first<any>();
          if (!current) return error('Member not found', 404);
          if (!sameTestScope(user.role, current.is_test)) return error('Forbidden', 403);
          const newStarred = current.starred ? 0 : 1;
          await env.DB.prepare('UPDATE members SET starred = ?, updated_at = ? WHERE id = ?').bind(newStarred, now(), itemId).run();
          const row = await env.DB.prepare(
            'SELECT m.*, g.name AS group_name, COALESCE(SUM(o.amount), 0) AS total_offering FROM members m LEFT JOIN member_groups g ON g.id = m.group_id LEFT JOIN offerings o ON o.member_id = m.id WHERE m.id = ? GROUP BY m.id'
          ).bind(itemId).first();
          return json(mapMember(row));
        }

        if (url.pathname.match(/^\/api\/members\/[^/]+$/)) {
          if (!canManageMembers(user.role)) return error('Forbidden', 403);
          const itemId = decodeURIComponent(url.pathname.split('/').pop() || '');
          if (request.method === 'PUT') {
            const payload = await readJson<any>(request);
            const before = await env.DB.prepare('SELECT m.*, g.name AS group_name, COALESCE(SUM(o.amount), 0) AS total_offering FROM members m LEFT JOIN member_groups g ON g.id = m.group_id LEFT JOIN offerings o ON o.member_id = m.id WHERE m.id = ? GROUP BY m.id').bind(itemId).first<any>();
            if (before && !sameTestScope(user.role, before.is_test)) return error('Forbidden', 403);
            if (payload.email) {
              const dup = await env.DB.prepare('SELECT id FROM members WHERE lower(email) = lower(?) AND id != ?').bind(payload.email, itemId).first();
              if (dup) return error('該電郵已被其他成員使用，請改用其他電郵或留空');
            }
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
            const updated = mapMember(row);
            const memberName = [updated.firstName, updated.lastName].filter(Boolean).join(' ').trim() || updated.name || itemId;
            const changes = buildChangeSummary([
              { label: 'First Name', from: before?.first_name, to: payload.firstName },
              { label: 'Last Name', from: before?.last_name, to: payload.lastName },
              { label: '姓名', from: before?.name, to: payload.name },
              { label: 'Partner', from: before?.partner, to: payload.partner },
              { label: '電話', from: before?.phone, to: payload.phone },
              { label: 'Email', from: before?.email, to: payload.email },
              { label: '地址', from: before?.address, to: payload.address },
              { label: '城市', from: before?.city, to: payload.city },
              { label: '州/省', from: before?.state_region, to: payload.stateRegion },
              { label: '郵編', from: before?.postal_code, to: payload.postalCode },
              { label: '備註', from: before?.notes, to: payload.notes },
              { label: '狀態', from: statusZh(before?.status), to: statusZh(payload.status) }
            ]);
            await recordAudit(env, user, {
              action: 'update',
              entityType: 'member',
              entityId: itemId,
              entitySummary: `成員 ${memberName} ｜ ${changes}`,
              before: before ? mapMember(before) : null,
              after: updated
            });
            return json(updated);
          }
          if (request.method === 'DELETE') {
            const reason = await readDeleteReason(request);
            if (!reason) return error('刪除原因不能為空');
            const existing = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(itemId).first<any>();
            if (!existing) return error('Member not found', 404);
            if (!sameTestScope(user.role, existing.is_test)) return error('Forbidden', 403);
            const fullName = [existing.first_name, existing.last_name].filter(Boolean).join(' ').trim();
            const summary = `成員 ${fullName || existing.name || itemId}`;
            await recordAudit(env, user, { action: 'delete', entityType: 'member', entityId: itemId, entitySummary: summary, reason, before: mapMember(existing) });
            await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(itemId).run();
            return json({ ok: true });
          }
        }

        if (url.pathname.match(/^\/api\/offerings\/[^/]+$/)) {
          if (!canRecordOffering(user.role)) return error('Forbidden', 403);
          const itemId = decodeURIComponent(url.pathname.split('/').pop() || '');
          // Counter 只能動自己建立的那幾筆
          if (user.role === 'counter') {
            const owner = await env.DB.prepare('SELECT created_by FROM offerings WHERE id = ?').bind(itemId).first<any>();
            if (!owner) return error('Offering not found', 404);
            if (owner.created_by !== user.id) return error('Forbidden', 403);
          }
          if (request.method === 'PUT') {
            const payload = await readJson<any>(request);
            const before = await getOffering(env, itemId);
            if (before && !sameTestScope(user.role, before.isTest)) return error('Forbidden', 403);
            const [receiptJson, receiptFirst] = receiptUrlBindings(normalizeReceiptUrls(payload.receiptUrls, payload.receiptUrl));
            await env.DB.prepare('UPDATE offerings SET member_id = ?, amount = ?, date = ?, category_id = ?, method_id = ?, notes = ?, receipt_url = ?, receipt_urls = ?, updated_at = ? WHERE id = ?')
              .bind(payload.memberId || null, Number(payload.amount), payload.date, payload.categoryId || null, payload.methodId || null, payload.notes || '', receiptFirst, receiptJson, now(), itemId).run();
            const updated = await getOffering(env, itemId);
            const changes = buildChangeSummary([
              { label: '奉獻人', from: before?.memberName || '匿名', to: updated?.memberName || '匿名' },
              { label: '金額', from: before?.amount, to: updated?.amount },
              { label: '日期', from: before?.date, to: updated?.date },
              { label: '分類', from: before?.categoryName, to: updated?.categoryName },
              { label: '方式', from: before?.methodName, to: updated?.methodName },
              { label: '備註', from: before?.notes, to: updated?.notes },
              { label: '憑證', from: `${before?.receiptUrls.length ?? 0} 張`, to: `${updated?.receiptUrls.length ?? 0} 張` }
            ]);
            await recordAudit(env, user, {
              action: 'update',
              entityType: 'offering',
              entityId: itemId,
              entitySummary: `${offeringSummary(updated)} ｜ ${changes}`,
              before,
              after: updated
            });
            return json(updated);
          }
          if (request.method === 'DELETE') {
            const reason = await readDeleteReason(request);
            if (!reason) return error('刪除原因不能為空');
            const existing = await getOffering(env, itemId);
            if (!existing) return error('Offering not found', 404);
            if (!sameTestScope(user.role, existing.isTest)) return error('Forbidden', 403);
            const summary = offeringSummary(existing);
            await recordAudit(env, user, { action: 'delete', entityType: 'offering', entityId: itemId, entitySummary: summary, reason, before: existing });
            await env.DB.prepare('DELETE FROM offerings WHERE id = ?').bind(itemId).run();
            return json({ ok: true });
          }
        }

        if (url.pathname.match(/^\/api\/expenses\/[^/]+\/(approve|reject|invoice|account)$/) && request.method === 'POST') {
          if (!canManageFinance(user.role)) return error('Forbidden', 403);
          const [, , , itemId, action] = url.pathname.split('/');
          const payload = await readJson<any>(request).catch(() => ({}));
          const reviewTarget = await getExpense(env, itemId);
          if (!reviewTarget) return error('Expense not found', 404);
          if (!sameTestScope(user.role, reviewTarget.isTest)) return error('Forbidden', 403);

          // 校驗：approve/reject 需要 pending；invoice 需要已批准且未開票；account 需要已開票且未入賬
          if (action === 'approve' || action === 'reject') {
            if (reviewTarget.status !== 'pending') return error('當前狀態無法執行此操作', 400);
          } else if (action === 'invoice') {
            if (reviewTarget.status !== 'approved') return error('需先批准才能開票', 400);
            if (reviewTarget.invoicedAt) return error('已開票', 400);
            const opLabel = user.name || user.email || '';
            if (isSameExpenseOperator(user, reviewTarget, opLabel)) return error('Approver cannot invoice the same expense', 400);
            const invoiceAmount = payload.invoiceAmount === undefined || payload.invoiceAmount === null || payload.invoiceAmount === ''
              ? reviewTarget.amount
              : Number(payload.invoiceAmount);
            if (!Number.isFinite(invoiceAmount) || invoiceAmount < 0) return error('開票金額不正確', 400);
          } else if (action === 'account') {
            if (!reviewTarget.invoicedAt) return error('需先開票才能入賬', 400);
            if (reviewTarget.accountedAt) return error('已入賬', 400);
          }

          const stamp = now();
          const opLabel = user.name || user.email || '';
          if (action === 'approve') {
            await env.DB.prepare('UPDATE expenses SET status = ?, approved_by = ?, approved_by_text = ?, approved_at = ?, updated_at = ? WHERE id = ?')
              .bind('approved', user.memberId, opLabel, stamp, stamp, itemId).run();
          } else if (action === 'reject') {
            await env.DB.prepare('UPDATE expenses SET status = ?, approved_by = ?, approved_by_text = ?, approved_at = ?, updated_at = ? WHERE id = ?')
              .bind('rejected', user.memberId, opLabel, stamp, stamp, itemId).run();
          } else if (action === 'invoice') {
            const invoiceAmount = payload.invoiceAmount === undefined || payload.invoiceAmount === null || payload.invoiceAmount === ''
              ? reviewTarget.amount
              : Number(payload.invoiceAmount);
            const [invoiceJson, invoiceFirst] = receiptUrlBindings(normalizeReceiptUrls(payload.invoiceReceiptUrls, payload.invoiceReceiptUrl));
            await env.DB.prepare('UPDATE expenses SET invoiced_by = ?, invoiced_by_text = ?, invoiced_at = ?, invoice_note = ?, invoice_amount = ?, invoice_receipt_url = ?, invoice_receipt_urls = ?, updated_at = ? WHERE id = ?')
              .bind(user.memberId, opLabel, stamp, String(payload.invoiceNote || '').trim(), invoiceAmount, invoiceFirst, invoiceJson, stamp, itemId).run();
          } else if (action === 'account') {
            const [accountJson, accountFirst] = receiptUrlBindings(normalizeReceiptUrls(payload.accountReceiptUrls, payload.accountReceiptUrl));
            await env.DB.prepare('UPDATE expenses SET accounted_by = ?, accounted_by_text = ?, accounted_at = ?, account_receipt_url = ?, account_receipt_urls = ?, updated_at = ? WHERE id = ?')
              .bind(user.memberId, opLabel, stamp, accountFirst, accountJson, stamp, itemId).run();
          }
          const reviewed = await getExpense(env, itemId);
          await recordAudit(env, user, {
            action,
            entityType: 'expense',
            entityId: itemId,
            entitySummary: expenseSummary(reviewed),
            before: reviewTarget,
            after: reviewed
          });
          return json(reviewed);
        }

        // 憑證清單整批取代，一次涵蓋新增／刪除／排序／編輯後替換。
        // 開票／入賬憑證沒有別的寫入途徑，因為 invoice / account 端點只接受首次操作。
        if (url.pathname.match(/^\/api\/expenses\/[^/]+\/receipts$/) && request.method === 'PUT') {
          if (!canManageFinance(user.role)) return error('Forbidden', 403);
          const itemId = decodeURIComponent(url.pathname.split('/').slice(-2)[0] || '');
          const payload = await readJson<{ slot?: string; urls?: unknown }>(request);
          const slots: Record<string, { single: string; list: string; label: string }> = {
            submit: { single: 'receipt_url', list: 'receipt_urls', label: '提交憑證' },
            invoice: { single: 'invoice_receipt_url', list: 'invoice_receipt_urls', label: '開票憑證' },
            account: { single: 'account_receipt_url', list: 'account_receipt_urls', label: '入賬憑證' }
          };
          const slot = slots[String(payload.slot || '')];
          if (!slot) return error('憑證類型不正確');
          if (!Array.isArray(payload.urls)) return error('憑證清單格式不正確');
          const before = await getExpense(env, itemId);
          if (!before) return error('Expense not found', 404);
          if (!sameTestScope(user.role, before.isTest)) return error('Forbidden', 403);
          const urls = normalizeReceiptUrls(payload.urls, null);
          const [listJson, first] = receiptUrlBindings(urls);
          await env.DB.prepare(`UPDATE expenses SET ${slot.single} = ?, ${slot.list} = ?, updated_at = ? WHERE id = ?`)
            .bind(first, listJson, now(), itemId).run();
          const updated = await getExpense(env, itemId);
          await recordAudit(env, user, {
            action: 'update',
            entityType: 'expense',
            entityId: itemId,
            entitySummary: `${expenseSummary(updated)} ｜ ${slot.label} ${urls.length} 張`,
            before,
            after: updated
          });
          return json(updated);
        }

        if (url.pathname.match(/^\/api\/expenses\/[^/]+$/)) {
          if (!canManageFinance(user.role)) return error('Forbidden', 403);
          const itemId = decodeURIComponent(url.pathname.split('/').pop() || '');
          if (request.method === 'PUT') {
            const payload = await readJson<any>(request);
            const before = await getExpense(env, itemId);
            if (before && !sameTestScope(user.role, before.isTest)) return error('Forbidden', 403);
            const [receiptJson, receiptFirst] = receiptUrlBindings(normalizeReceiptUrls(payload.receiptUrls, payload.receiptUrl));
            await env.DB.prepare('UPDATE expenses SET category_id = ?, amount = ?, date = ?, description = ?, paid_by = ?, payment_method = ?, notes = ?, receipt_url = ?, receipt_urls = ?, updated_at = ? WHERE id = ?')
              .bind(payload.categoryId || null, Number(payload.amount), payload.date, payload.description || '', payload.paidBy || null, payload.paymentMethod || '現金', payload.notes || '', receiptFirst, receiptJson, now(), itemId).run();
            const updated = await getExpense(env, itemId);
            const changes = buildChangeSummary([
              { label: '描述', from: before?.description, to: updated?.description },
              { label: '金額', from: before?.amount, to: updated?.amount },
              { label: '日期', from: before?.date, to: updated?.date },
              { label: '分類', from: before?.categoryName, to: updated?.categoryName },
              { label: '付款人', from: before?.paidByName, to: updated?.paidByName },
              { label: '支付方式', from: before?.paymentMethod, to: updated?.paymentMethod },
              { label: '備註', from: before?.notes, to: updated?.notes },
              { label: '憑證', from: `${before?.receiptUrls.length ?? 0} 張`, to: `${updated?.receiptUrls.length ?? 0} 張` }
            ]);
            await recordAudit(env, user, {
              action: 'update',
              entityType: 'expense',
              entityId: itemId,
              entitySummary: `${expenseSummary(updated)} ｜ ${changes}`,
              before,
              after: updated
            });
            return json(updated);
          }
          if (request.method === 'DELETE') {
            const reason = await readDeleteReason(request);
            if (!reason) return error('刪除原因不能為空');
            const existing = await getExpense(env, itemId);
            if (!existing) return error('Expense not found', 404);
            if (!sameTestScope(user.role, existing.isTest)) return error('Forbidden', 403);
            const summary = expenseSummary(existing);
            await recordAudit(env, user, { action: 'delete', entityType: 'expense', entityId: itemId, entitySummary: summary, reason, before: existing });
            await env.DB.prepare('DELETE FROM expenses WHERE id = ?').bind(itemId).run();
            return json({ ok: true });
          }
        }

        // 建立掃碼上傳 session；明碼 token 只在這裡回傳一次，DB 只留 hash
        if (url.pathname === '/api/upload-sessions' && request.method === 'POST') {
          if (!canRecordOffering(user.role)) return error('Forbidden', 403);
          const sessionId = id();
          const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
          const expiresAt = new Date(Date.now() + UPLOAD_SESSION_TTL_MS).toISOString();
          await env.DB.prepare(
            'INSERT INTO upload_sessions (id, token_hash, created_by, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(sessionId, await sha256(token), user.id, 'receipt', expiresAt, now()).run();
          return json({ id: sessionId, token, expiresAt, snapPath: `/snap/${sessionId}` }, 201);
        }

        if (url.pathname.match(/^\/api\/upload-sessions\/[^/]+$/) && request.method === 'GET') {
          if (!canRecordOffering(user.role)) return error('Forbidden', 403);
          const sessionId = decodeURIComponent(url.pathname.split('/').pop() || '');
          const session = await env.DB.prepare('SELECT * FROM upload_sessions WHERE id = ? AND created_by = ?')
            .bind(sessionId, user.id).first<any>();
          if (!session) return error('Session not found', 404);
          const files = await env.DB.prepare('SELECT url FROM upload_session_files WHERE session_id = ? ORDER BY created_at')
            .bind(sessionId).all<any>();
          return json({
            id: sessionId,
            expiresAt: session.expires_at,
            closed: Boolean(session.closed_at) || new Date(session.expires_at).getTime() < Date.now(),
            urls: (files.results || []).map((row: any) => String(row.url))
          });
        }

        // 桌面關掉 QR 彈窗即作廢，避免連結在有效期內還能被再次使用
        if (url.pathname.match(/^\/api\/upload-sessions\/[^/]+$/) && request.method === 'DELETE') {
          if (!canRecordOffering(user.role)) return error('Forbidden', 403);
          const sessionId = decodeURIComponent(url.pathname.split('/').pop() || '');
          await env.DB.prepare('UPDATE upload_sessions SET closed_at = ? WHERE id = ? AND created_by = ? AND closed_at IS NULL')
            .bind(now(), sessionId, user.id).run();
          return json({ ok: true });
        }

        if (url.pathname === '/api/upload' && request.method === 'POST') {
          if (!canRecordOffering(user.role)) return error('Forbidden', 403);
          const form = await request.formData();
          const file = form.get('file');
          const type = String(form.get('type') || 'files');
          const entityId = String(form.get('entityId') || id());
          if (!(file instanceof File)) return error('Missing file');
          const key = `${type}/${entityId}/${Date.now()}-${file.name}`;
          await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
          const fileUrl = env.FILES_URL ? `${env.FILES_URL.replace(/\/$/, '')}/${key}` : `/api/files/${encodeURIComponent(key)}`;
          return json({ key, url: fileUrl });
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
