/// <reference types="@cloudflare/workers-types" />
import { ensureChurchSchema } from './churchDb';
import { DEFAULT_EXPENSE_NOTIFY_BODY, DEFAULT_EXPENSE_NOTIFY_SUBJECT, handleFinanceRequest, recordAudit, type Env, type SessionUser } from './finance';
import { SqlDatabase, durableObjectEngine, type SqlEngine } from './sqlDb';
import { DEFAULT_TAX_STATEMENT_HTML_TEMPLATE } from '../shared/taxStatement';

/**
 * One church's finance data (multi-church mode): its own SQLite database in a
 * Durable Object, named by the church id. The platform worker has already
 * checked who is asking and what they may do, and says so in a header; this
 * object then runs the ordinary finance API against this church's database.
 *
 * Nothing outside the worker can reach a Durable Object, and the worker only
 * forwards /api/* and /expense-action requests, so the header and the
 * /__church/* paths cannot be supplied by a client.
 */

export const CHURCH_CONTEXT_HEADER = 'x-church-context';

export interface ChurchContext {
  churchId: string;
  /** null for the public pages (claim form, phone uploads, e-mailed approval links). */
  user: SessionUser | null;
  /** false once a church declared over 100 people has no current subscription. */
  writable: boolean;
}

/** Headers carry only Latin-1, and names are often Chinese: the context travels percent-encoded. */
export const encodeChurchContext = (context: ChurchContext) => encodeURIComponent(JSON.stringify(context));
export const decodeChurchContext = (value: string) => JSON.parse(decodeURIComponent(value)) as ChurchContext;

/** A team member as the church's own users table mirrors them. */
export interface ChurchUserRecord {
  id: string;
  name: string;
  email: string;
  role: SessionUser['role'];
  memberId: string | null;
  active: boolean;
}

export interface ChurchInit { name: string; mailFrom: string; replyTo: string }

/** R2, with every key kept under this church's own folder. */
export function prefixedBucket(bucket: R2Bucket, prefix: string): R2Bucket {
  return {
    put: (key: string, ...rest: unknown[]) => (bucket.put as (...a: unknown[]) => unknown)(prefix + key, ...rest),
    get: (key: string, ...rest: unknown[]) => (bucket.get as (...a: unknown[]) => unknown)(prefix + key, ...rest),
    head: (key: string) => bucket.head(prefix + key),
    delete: (keys: string | string[]) => bucket.delete(Array.isArray(keys) ? keys.map((k) => prefix + k) : prefix + keys),
  } as unknown as R2Bucket;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/** Requests that change something: blocked while a church needs a subscription. */
function isWrite(request: Request, path: string): boolean {
  if (path === '/expense-action') return true;
  return request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS';
}

/** Mirrors a team member into the church's users table, which audit and authorship queries join on. */
export function upsertChurchUser(engine: SqlEngine, user: ChurchUserRecord) {
  const at = new Date().toISOString();
  engine.exec(
    `INSERT INTO users (id, name, email, role, member_id, password_hash, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, role = excluded.role,
       member_id = excluded.member_id, active = excluded.active, updated_at = excluded.updated_at`,
    [user.id, user.name, user.email, user.role, user.memberId, user.active ? 1 : 0, at, at],
  );
}

/**
 * A new church's own settings, so nothing falls back to BOLCCOP's details:
 * its name on tax statements, the app's sender address, replies to the founder.
 */
export function initChurchSettings(engine: SqlEngine, init: ChurchInit) {
  const at = new Date().toISOString();
  const taxStatement = {
    mailFrom: init.mailFrom,
    replyTo: init.replyTo,
    signatureUrl: '',
    htmlTemplate: DEFAULT_TAX_STATEMENT_HTML_TEMPLATE,
    textFields: {
      churchNameEn: init.name,
      churchNameZh: '',
      churchAddress: '',
      churchPhone: '',
      churchWebsite: '',
      appreciation: 'Your contribution to the church is gratefully appreciated.',
      notice: 'If there is any discrepancy from your own records, please contact the church office.',
      disclosure: `No goods or services were provided in exchange for the contributions listed above, other than intangible religious benefits. ${init.name} is a tax-exempt religious organization under Section 501(c)(3) of the Internal Revenue Code. Please retain this statement for your tax records.`,
      signerName: '',
    },
  };
  const expenseNotify = {
    enabled: false,
    recipients: [],
    mailFrom: init.mailFrom,
    replyTo: init.replyTo,
    subjectTemplate: DEFAULT_EXPENSE_NOTIFY_SUBJECT,
    bodyTemplate: DEFAULT_EXPENSE_NOTIFY_BODY.replace('BOLCCOP 財務系統', `${init.name} 財務系統`),
    includeActionButtons: true,
  };
  for (const [key, value] of [['taxStatement', taxStatement], ['expenseNotify', expenseNotify]] as const) {
    engine.exec(
      'INSERT OR IGNORE INTO app_settings (key, value_json, updated_by, updated_at) VALUES (?, ?, NULL, ?)',
      [key, JSON.stringify(value), at],
    );
  }
}

/** A church's request handling over any SQLite engine — the Durable Object's, or node:sqlite in tests. */
export class ChurchRuntime {
  private ready = false;
  /** Team members already mirrored this session, by id → what was written. */
  private readonly mirrored = new Map<string, string>();

  constructor(private readonly engine: SqlEngine, private readonly env: Env) {}

  private open(): SqlEngine {
    if (!this.ready) {
      ensureChurchSchema(this.engine);
      this.ready = true;
    }
    return this.engine;
  }

  private mirror(user: SessionUser) {
    const record: ChurchUserRecord = { ...user, memberId: user.memberId ?? null, active: true };
    const key = JSON.stringify(record);
    if (this.mirrored.get(user.id) === key) return;
    upsertChurchUser(this.engine, record);
    this.mirrored.set(user.id, key);
  }

  async fetch(request: Request): Promise<Response> {
    const engine = this.open();
    const url = new URL(request.url);
    const raw = request.headers.get(CHURCH_CONTEXT_HEADER);
    if (!raw) return json({ error: 'Missing church context' }, 400);
    const context = decodeChurchContext(raw);
    const db = new SqlDatabase(engine).asD1();

    if (url.pathname.startsWith('/__church/')) return this.internal(url.pathname, request, context, db);

    if (context.user) this.mirror(context.user);
    if (!context.writable && isWrite(request, url.pathname)) {
      return json({ error: '教會人數超過 100 人，需要訂閱專業版才能新增或修改資料。資料仍可查看與匯出。', code: 'subscription_required' }, 402);
    }

    const headers = new Headers(request.headers);
    headers.delete(CHURCH_CONTEXT_HEADER);
    const env: Env = {
      ...this.env,
      DB: db,
      FILES: prefixedBucket(this.env.FILES, `churches/${context.churchId}/`),
      FILES_URL: `/c/${context.churchId}/api/files`,
      PUBLIC_BASE: `/c/${context.churchId}`,
      MAIL_SENDER_ADDRESS: (this.env as Env & { SAAS_MAIL_FROM?: string }).SAAS_MAIL_FROM || 'noreply@example.app',
      SESSION_OVERRIDE: context.user,
    };
    return handleFinanceRequest(new Request(request, { headers }), env);
  }

  /** Calls from the platform worker itself: setting up the church, and keeping its team list in step. */
  private async internal(path: string, request: Request, context: ChurchContext, db: D1Database): Promise<Response> {
    if (path === '/__church/init' && request.method === 'POST') {
      initChurchSettings(this.engine, await request.json() as ChurchInit);
      return json({ ok: true });
    }
    if (path === '/__church/users' && request.method === 'POST') {
      const body = await request.json() as {
        upsert?: ChurchUserRecord[];
        audit?: { action: string; entityType: string; entityId: string; entitySummary: string; reason?: string; before?: unknown; after?: unknown };
      };
      for (const user of body.upsert ?? []) {
        upsertChurchUser(this.engine, user);
        this.mirrored.delete(user.id);
      }
      if (body.audit && context.user) {
        await recordAudit({ ...this.env, DB: db }, context.user, body.audit);
      }
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  }
}

export class ChurchStore implements DurableObject {
  private runtime: ChurchRuntime;

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    this.runtime = new ChurchRuntime(durableObjectEngine(state.storage), env);
  }

  async fetch(request: Request): Promise<Response> {
    // The church is gone (its last account was deleted): every record goes with it.
    if (new URL(request.url).pathname === '/__church/destroy' && request.method === 'POST' && request.headers.has(CHURCH_CONTEXT_HEADER)) {
      await this.state.storage.deleteAll();
      this.runtime = new ChurchRuntime(durableObjectEngine(this.state.storage), this.env);
      return json({ ok: true });
    }
    return this.runtime.fetch(request);
  }
}
