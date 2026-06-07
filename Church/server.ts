/// <reference types="@cloudflare/workers-types" />

import { DEFAULT_SERMONS, type AdminRole, type WebAnalyticsRange } from './data';
import { translations } from './constants/translations';

type Env = {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  ASSETS: Fetcher;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_WEB_ANALYTICS_SITE_TAG?: string;
  CLOUDFLARE_ANALYTICS_API_TOKEN?: string;
  ADMIN_BOOTSTRAP_EMAIL?: string;
  ADMIN_BOOTSTRAP_PASSWORD?: string;
  ADMIN_BOOTSTRAP_NAME?: string;
};

type LocalizedText = { en: string; zh: string };

type SermonRow = {
  id: string;
  title_en: string;
  title_zh: string;
  speaker_en: string;
  speaker_zh: string;
  date: string;
  series_en: string;
  series_zh: string;
  passage_en: string;
  passage_zh: string;
  youtube_id: string;
  image_url: string | null;
  type: 'sermon' | 'daily-manna';
};

type DailyMannaRow = Omit<SermonRow, 'type'>;

type MessageRow = {
  id: string;
  date: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  message: string;
  read: number;
};

type PrayerRequestRow = {
  id: string;
  date: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  message: string;
  status: 'new' | 'prayed';
};

type DonationRow = {
  id: string;
  date: string;
  amount: number;
  type: 'one-time' | 'recurring';
  status: 'completed';
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  password_hash: string;
  password_salt: string;
  active: number;
  created_at: string;
  updated_at: string;
};

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
};

type SiteContentRow = {
  path: string;
  en: string;
  zh: string;
};

type CloudflareGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type CloudflareAnalyticsGraphQLData = {
  viewer?: {
    zones?: Array<{
      totals?: Array<{
        count?: number;
        sum?: {
          visits?: number;
        };
      }>;
      byCountry?: Array<{
        count?: number;
        dimensions?: {
          clientCountryName?: string;
        };
      }>;
      byDay?: Array<{
        count?: number;
        sum?: {
          visits?: number;
        };
        dimensions?: {
          datetimeHour?: string;
        };
      }>;
    }>;
  };
};

type CloudflareWebAnalyticsGroup = {
  count?: number;
  sum?: {
    visits?: number;
  };
  dimensions?: Record<string, string | null | undefined>;
};

type CloudflareWebAnalyticsPerformanceGroup = {
  quantiles?: {
    pageLoadTimeP50?: number;
    pageLoadTimeP75?: number;
    pageLoadTimeP90?: number;
    largestContentfulPaintP75?: number;
    interactionToNextPaintP75?: number;
    cumulativeLayoutShiftP75?: number;
    firstContentfulPaintP75?: number;
  };
};

type CloudflareWebAnalyticsGraphQLData = {
  viewer?: {
    accounts?: Array<{
      totals?: CloudflareWebAnalyticsGroup[];
      timeseries?: CloudflareWebAnalyticsGroup[];
      paths?: CloudflareWebAnalyticsGroup[];
      countries?: CloudflareWebAnalyticsGroup[];
      referrers?: CloudflareWebAnalyticsGroup[];
      browsers?: CloudflareWebAnalyticsGroup[];
      operatingSystems?: CloudflareWebAnalyticsGroup[];
      deviceTypes?: CloudflareWebAnalyticsGroup[];
      hosts?: CloudflareWebAnalyticsGroup[];
      performance?: CloudflareWebAnalyticsPerformanceGroup[];
      webVitals?: CloudflareWebAnalyticsPerformanceGroup[];
    }>;
  };
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function notFound(message = 'Not found'): Response {
  return json({ error: message }, 404);
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

function forbidden(message = 'Forbidden'): Response {
  return json({ error: message }, 403);
}

function unauthorized(message = 'Authentication required'): Response {
  return json({ error: message }, 401);
}

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie') ?? '';
  const parts = cookie.split(';').map(part => part.trim());
  const prefix = `${name}=`;
  const match = parts.find(part => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

function sessionCookie(request: Request, token: string, expiresAt: string): string {
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAge}`;
}

function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `admin_session=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

function shouldServeAppShell(request: Request, url: URL, response: Response): boolean {
  const lastSegment = url.pathname.split('/').pop() ?? '';
  const acceptsHtml = request.headers.get('Accept')?.includes('text/html') ?? false;

  return request.method === 'GET' && response.status === 404 && acceptsHtml && !lastSegment.includes('.');
}

function mapUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSessionUser(user: SessionUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
  };
}

function randomHex(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: ArrayBuffer): string {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return toBase64(digest);
}

async function hashPassword(password: string, salt = randomHex(16)): Promise<{ hash: string; salt: string }> {
  return { hash: await sha256(`${salt}:${password}`), salt };
}

async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const { hash } = await hashPassword(password, salt);
  return hash === expectedHash;
}

function asLocalizedText(en = '', zh = ''): LocalizedText {
  return { en, zh };
}

function startOfUtcDay(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return utcDate.toISOString();
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mapSermon(row: SermonRow) {
  return {
    id: row.id,
    title: asLocalizedText(row.title_en, row.title_zh),
    speaker: asLocalizedText(row.speaker_en, row.speaker_zh),
    date: row.date,
    series: asLocalizedText(row.series_en, row.series_zh),
    passage: asLocalizedText(row.passage_en, row.passage_zh),
    youtubeId: row.youtube_id,
    imageUrl: row.image_url ?? undefined,
    type: row.type,
  };
}

function mapDailyManna(row: DailyMannaRow) {
  return {
    id: row.id,
    title: asLocalizedText(row.title_en, row.title_zh),
    speaker: asLocalizedText(row.speaker_en, row.speaker_zh),
    date: row.date,
    series: asLocalizedText(row.series_en, row.series_zh),
    passage: asLocalizedText(row.passage_en, row.passage_zh),
    youtubeId: row.youtube_id,
    imageUrl: row.image_url ?? undefined,
    type: 'daily-manna' as const,
  };
}

function mapMessage(row: MessageRow) {
  return {
    id: row.id,
    date: row.date,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    read: Boolean(row.read),
  };
}

function mapPrayerRequest(row: PrayerRequestRow) {
  return {
    id: row.id,
    date: row.date,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    status: row.status,
  };
}

function mapDonation(row: DonationRow) {
  return {
    id: row.id,
    date: row.date,
    amount: Number(row.amount),
    type: row.type,
    status: row.status,
  };
}

async function getSetting<T>(env: Env, key: string, fallback: T): Promise<T> {
  const row = await env.DB.prepare('SELECT value_json FROM settings WHERE key = ?').bind(key).first<{ value_json: string }>();
  if (!row?.value_json) {
    return fallback;
  }
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

async function putSetting(env: Env, key: string, value: unknown): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at'
  ).bind(key, JSON.stringify(value), new Date().toISOString()).run();
}

function isLocalizedContent(value: unknown): value is LocalizedText {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'en' in value &&
    'zh' in value &&
    typeof (value as { en?: unknown }).en === 'string' &&
    typeof (value as { zh?: unknown }).zh === 'string'
  );
}

function flattenSiteContent(obj: Record<string, unknown>, prefix = ''): SiteContentRow[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isLocalizedContent(value)) {
      return [{ path, en: value.en, zh: value.zh }];
    }

    if (value && typeof value === 'object') {
      return flattenSiteContent(value as Record<string, unknown>, path);
    }

    return [];
  });
}

function restrictedContentChanges(nextContent: typeof translations, currentContent: typeof translations): string[] {
  const currentRows = new Map(flattenSiteContent(currentContent as Record<string, unknown>).map(row => [row.path, row]));
  const ownerOnlyPrefixes = ['hero.', 'header.', 'footer.', 'about.', 'events.', 'sermons.', 'support.', 'contact.'];

  return flattenSiteContent(nextContent as Record<string, unknown>)
    .filter(row => ownerOnlyPrefixes.some(prefix => row.path.startsWith(prefix)))
    .filter(row => {
      const current = currentRows.get(row.path);
      return !current || current.en !== row.en || current.zh !== row.zh;
    })
    .map(row => row.path);
}

function restrictedImageChanges(nextImages: Record<string, string>, currentImages: Record<string, string>): string[] {
  const keys = new Set([...Object.keys(currentImages), ...Object.keys(nextImages)]);
  return Array.from(keys).filter(key => key.startsWith('hero.') && (currentImages[key] ?? '') !== (nextImages[key] ?? ''));
}

function setNestedContentValue(obj: Record<string, any>, path: string, value: LocalizedText): void {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) {
    return;
  }

  let target = obj;
  for (const key of keys) {
    if (!target[key] || typeof target[key] !== 'object') {
      target[key] = {};
    }
    target = target[key];
  }
  target[lastKey] = value;
}

function expandSiteContent(rows: SiteContentRow[], fallback: typeof translations): typeof translations {
  const expanded = structuredClone(fallback) as Record<string, any>;
  for (const row of rows) {
    setNestedContentValue(expanded, row.path, asLocalizedText(row.en, row.zh));
  }
  return expanded as typeof translations;
}

async function getSiteContent(env: Env): Promise<typeof translations> {
  const result = await env.DB.prepare('SELECT path, en, zh FROM site_content ORDER BY path').all<SiteContentRow>();
  const rows = result.results ?? [];

  if (rows.length > 0) {
    return expandSiteContent(rows, translations);
  }

  return getSetting(env, 'website_content', translations);
}

async function putSiteContent(env: Env, content: typeof translations): Promise<void> {
  const now = new Date().toISOString();
  const rows = flattenSiteContent(content as Record<string, unknown>);

  if (rows.length > 0) {
    const statements = rows.map(row => env.DB.prepare(
      `INSERT INTO site_content (path, en, zh, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         en = excluded.en,
         zh = excluded.zh,
         updated_at = excluded.updated_at`
    ).bind(row.path, row.en, row.zh, now));

    await env.DB.batch(statements);
  }

  await putSetting(env, 'website_content', content);
}

async function ensureDefaultOwner(env: Env): Promise<void> {
  const userCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
  if (userCount && Number(userCount.count) > 0) {
    return;
  }

  const now = new Date().toISOString();
  const email = (env.ADMIN_BOOTSTRAP_EMAIL || 'owner@bolccop.org').trim().toLowerCase();
  const password = env.ADMIN_BOOTSTRAP_PASSWORD || 'change-me';
  const name = env.ADMIN_BOOTSTRAP_NAME || 'Owner';
  const { hash, salt } = await hashPassword(password);

  await env.DB.prepare(
    `INSERT INTO users (
      id, name, email, role, password_hash, password_salt, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), name, email, 'owner', hash, salt, 1, now, now).run();
}

async function getCurrentUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = getCookie(request, 'admin_session');
  if (!token) {
    return null;
  }

  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT users.id, users.name, users.email, users.role, users.active
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1`
  ).bind(tokenHash, new Date().toISOString()).first<{
    id: string;
    name: string;
    email: string;
    role: AdminRole;
    active: number;
  }>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: Boolean(row.active),
  };
}

function userCanAccess(user: SessionUser | null, minimumRole: AdminRole): boolean {
  if (!user) {
    return false;
  }
  return minimumRole === 'contributor' || user.role === 'owner';
}

async function requireUser(request: Request, env: Env, minimumRole: AdminRole): Promise<SessionUser | Response> {
  await ensureDefaultOwner(env);
  const user = await getCurrentUser(request, env);
  if (!user) {
    return unauthorized();
  }
  if (!userCanAccess(user, minimumRole)) {
    return forbidden();
  }
  return user;
}

async function createSession(request: Request, env: Env, userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + 14);
  const expiresAt = expires.toISOString();

  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), userId, tokenHash, expiresAt, now.toISOString()).run();

  return { token, expiresAt };
}

async function activeOwnerCount(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND active = 1").first<{ count: number }>();
  return Number(row?.count ?? 0);
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  await ensureDefaultOwner(env);
  const payload = await readJson<{ email?: string; password?: string }>(request);
  const email = (payload.email || '').trim().toLowerCase();
  const password = payload.password || '';

  if (!email || !password) {
    return badRequest('Email and password are required.');
  }

  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!row || !row.active || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
    return unauthorized('Invalid email or password.');
  }

  const session = await createSession(request, env, row.id);
  const response = json({ user: mapUser(row) });
  response.headers.append('Set-Cookie', sessionCookie(request, session.token, session.expiresAt));
  return response;
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const token = getCookie(request, 'admin_session');
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  }
  const response = json({ ok: true });
  response.headers.append('Set-Cookie', clearSessionCookie(request));
  return response;
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  await ensureDefaultOwner(env);
  const user = await getCurrentUser(request, env);
  return json({ user });
}

async function handleUpdateMe(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) {
    return auth;
  }

  const existing = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.id).first<UserRow>();
  if (!existing) {
    return unauthorized();
  }

  const payload = await readJson<{ name?: string; email?: string; currentPassword?: string; newPassword?: string }>(request);
  const nextName = payload.name?.trim() || existing.name;
  const nextEmail = payload.email?.trim().toLowerCase() || existing.email;
  const emailChanged = nextEmail !== existing.email;
  const passwordChanged = Boolean(payload.newPassword);

  if (!nextName) {
    return badRequest('Name is required.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    return badRequest('A valid email is required.');
  }

  if ((emailChanged || passwordChanged) && !(await verifyPassword(payload.currentPassword || '', existing.password_salt, existing.password_hash))) {
    return unauthorized('Current password is incorrect.');
  }

  if (passwordChanged && (payload.newPassword || '').length < 8) {
    return badRequest('New password must be at least 8 characters.');
  }

  let passwordHash = existing.password_hash;
  let passwordSalt = existing.password_salt;
  if (passwordChanged) {
    const nextPassword = await hashPassword(payload.newPassword as string);
    passwordHash = nextPassword.hash;
    passwordSalt = nextPassword.salt;
  }

  try {
    await env.DB.prepare(
      `UPDATE users SET
        name = ?, email = ?, password_hash = ?, password_salt = ?, updated_at = ?
       WHERE id = ?`
    ).bind(nextName, nextEmail, passwordHash, passwordSalt, new Date().toISOString(), auth.id).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.toLowerCase().includes('unique')) {
      return badRequest('That email is already used by another user.');
    }
    throw error;
  }

  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.id).first<UserRow>();
  return json({ user: mapUser(row as UserRow) });
}

async function handleUsers(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'owner');
  if (auth instanceof Response) {
    return auth;
  }

  if (request.method === 'GET') {
    const result = await env.DB.prepare('SELECT * FROM users ORDER BY created_at ASC').all<UserRow>();
    return json((result.results ?? []).map(mapUser));
  }

  if (request.method === 'POST') {
    const payload = await readJson<{ name?: string; email?: string; password?: string; role?: AdminRole }>(request);
    const name = (payload.name || '').trim();
    const email = (payload.email || '').trim().toLowerCase();
    const password = payload.password || '';
    const role = payload.role;

    if (!name || !email || password.length < 8 || !role || !['owner', 'contributor'].includes(role)) {
      return badRequest('Name, email, an 8+ character password, and role are required.');
    }

    const now = new Date().toISOString();
    const { hash, salt } = await hashPassword(password);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO users (
        id, name, email, role, password_hash, password_salt, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, name, email, role, hash, salt, 1, now, now).run();
    const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
    return json(mapUser(row as UserRow), 201);
  }

  return notFound();
}

async function handleUserById(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'owner');
  if (auth instanceof Response) {
    return auth;
  }

  const existing = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!existing) {
    return notFound('User not found');
  }

  if (request.method === 'PATCH') {
    const payload = await readJson<{ name?: string; email?: string; role?: AdminRole; active?: boolean; password?: string }>(request);
    const nextRole = payload.role ?? existing.role;
    const nextActive = typeof payload.active === 'boolean' ? payload.active : Boolean(existing.active);

    if (!['owner', 'contributor'].includes(nextRole)) {
      return badRequest('Invalid role.');
    }

    if (existing.role === 'owner' && existing.active && (nextRole !== 'owner' || !nextActive) && (await activeOwnerCount(env)) <= 1) {
      return badRequest('At least one active owner is required.');
    }

    const name = payload.name?.trim() || existing.name;
    const email = payload.email?.trim().toLowerCase() || existing.email;
    let passwordHash = existing.password_hash;
    let passwordSalt = existing.password_salt;

    if (payload.password) {
      if (payload.password.length < 8) {
        return badRequest('Password must be at least 8 characters.');
      }
      const nextPassword = await hashPassword(payload.password);
      passwordHash = nextPassword.hash;
      passwordSalt = nextPassword.salt;
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
    }

    await env.DB.prepare(
      `UPDATE users SET
        name = ?, email = ?, role = ?, active = ?, password_hash = ?, password_salt = ?, updated_at = ?
       WHERE id = ?`
    ).bind(name, email, nextRole, nextActive ? 1 : 0, passwordHash, passwordSalt, new Date().toISOString(), id).run();

    if (!nextActive) {
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
    }

    const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
    return json(mapUser(row as UserRow));
  }

  return notFound();
}

async function ensureSeedData(env: Env): Promise<void> {
  await ensureDefaultOwner(env);

  const contentRowCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM site_content').first<{ count: number }>();
  if (!contentRowCount || Number(contentRowCount.count) === 0) {
    const legacyContent = await getSetting(env, 'website_content', translations);
    await putSiteContent(env, legacyContent);
  }

  const imagesExists = await env.DB.prepare('SELECT key FROM settings WHERE key = ?').bind('images').first();
  if (!imagesExists) {
    await putSetting(env, 'images', {});
  }

  const sermonCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM sermons').first<{ count: number }>();
  if (!sermonCount || Number(sermonCount.count) === 0) {
    for (const sermon of DEFAULT_SERMONS.filter(item => item.type === 'sermon')) {
      await env.DB.prepare(
        `INSERT INTO sermons (
          id, title_en, title_zh, speaker_en, speaker_zh, date,
          series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, type,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        sermon.title.en,
        sermon.title.zh,
        sermon.speaker.en,
        sermon.speaker.zh,
        sermon.date,
        sermon.series.en,
        sermon.series.zh,
        sermon.passage.en,
        sermon.passage.zh,
        sermon.youtubeId,
        sermon.imageUrl ?? null,
        sermon.type,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
    }
  }

  const mannaCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM daily_manna').first<{ count: number }>();
  if (!mannaCount || Number(mannaCount.count) === 0) {
    for (const sermon of DEFAULT_SERMONS.filter(item => item.type === 'daily-manna')) {
      await env.DB.prepare(
        `INSERT INTO daily_manna (
          id, title_en, title_zh, speaker_en, speaker_zh, date,
          series_en, series_zh, passage_en, passage_zh, youtube_id, image_url,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        sermon.title.en,
        sermon.title.zh,
        sermon.speaker.en,
        sermon.speaker.zh,
        sermon.date,
        sermon.series.en,
        sermon.series.zh,
        sermon.passage.en,
        sermon.passage.zh,
        sermon.youtubeId,
        sermon.imageUrl ?? null,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
    }
  }
}

async function handleBootstrap(request: Request, env: Env): Promise<Response> {
  await ensureSeedData(env);
  const currentUser = await getCurrentUser(request, env);

  const [content, images, sermonsResult, dailyMannaResult] = await Promise.all([
    getSiteContent(env),
    getSetting<Record<string, string>>(env, 'images', {}),
    env.DB.prepare("SELECT * FROM sermons WHERE type = 'sermon' ORDER BY date DESC").all<SermonRow>(),
    env.DB.prepare('SELECT * FROM daily_manna ORDER BY date DESC').all<DailyMannaRow>(),
  ]);

  const payload: Record<string, unknown> = {
    content,
    images,
    sermons: (sermonsResult.results ?? []).map(mapSermon),
    dailyManna: (dailyMannaResult.results ?? []).map(mapDailyManna),
    messages: [],
    prayerRequests: [],
    donations: [],
    currentUser,
  };

  if (currentUser) {
    const [messagesResult, prayerResult, donationsResult, usersResult] = await Promise.all([
      env.DB.prepare('SELECT * FROM messages ORDER BY date DESC').all<MessageRow>(),
      env.DB.prepare('SELECT * FROM prayer_requests ORDER BY date DESC').all<PrayerRequestRow>(),
      env.DB.prepare('SELECT * FROM donations ORDER BY date DESC').all<DonationRow>(),
      currentUser.role === 'owner'
        ? env.DB.prepare('SELECT * FROM users ORDER BY created_at ASC').all<UserRow>()
        : Promise.resolve({ results: [] as UserRow[] }),
    ]);
    payload.messages = (messagesResult.results ?? []).map(mapMessage);
    payload.prayerRequests = (prayerResult.results ?? []).map(mapPrayerRequest);
    payload.donations = (donationsResult.results ?? []).map(mapDonation);
    payload.users = (usersResult.results ?? []).map(mapUser);
  }

  return json(payload);
}

async function handleAnalyticsSummary(env: Env): Promise<Response> {
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  const apiToken = env.CLOUDFLARE_ANALYTICS_API_TOKEN;

  if (!zoneId || !apiToken) {
    return json({
      configured: false,
      source: 'cloudflare',
      period: '7d',
      pageviews: 0,
      visitors: 0,
      countries: [],
      timeseries: [],
      lastUpdated: new Date().toISOString(),
      error: 'Cloudflare analytics is not configured. Set CLOUDFLARE_ZONE_ID and CLOUDFLARE_ANALYTICS_API_TOKEN in Wrangler.',
    });
  }

  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const since = startOfUtcDay(addUtcDays(now, -6));
  const until = addUtcDays(new Date(todayStart), 1).toISOString();
  const query = `
    query WebsiteAnalyticsSummary($zoneTag: string, $datetimeStart: Time, $datetimeEnd: Time) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          totals: httpRequestsAdaptiveGroups(
            limit: 1
            filter: {
              datetime_geq: $datetimeStart
              datetime_lt: $datetimeEnd
              requestSource: "eyeball"
            }
          ) {
            count
            sum {
              visits
            }
          }
          byCountry: httpRequestsAdaptiveGroups(
            limit: 8
            orderBy: [count_DESC]
            filter: {
              datetime_geq: $datetimeStart
              datetime_lt: $datetimeEnd
              requestSource: "eyeball"
            }
          ) {
            count
            dimensions {
              clientCountryName
            }
          }
          byDay: httpRequestsAdaptiveGroups(
            limit: 168
            orderBy: [datetimeHour_ASC]
            filter: {
              datetime_geq: $datetimeStart
              datetime_lt: $datetimeEnd
              requestSource: "eyeball"
            }
          ) {
            count
            sum {
              visits
            }
            dimensions {
              datetimeHour
            }
          }
        }
      }
    }
  `;

  const dayRanges = Array.from({ length: 7 }, (_, index) => {
    const start = startOfUtcDay(addUtcDays(now, -6 + index));
    const end = addUtcDays(new Date(start), 1).toISOString();
    return { start, end };
  });

  const dayResponses = await Promise.all(dayRanges.map(async ({ start, end }) => {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          zoneTag: zoneId,
          datetimeStart: start,
          datetimeEnd: end,
        },
      }),
    });

    const payload = await response.json<CloudflareGraphQLResponse<CloudflareAnalyticsGraphQLData>>();
    return { response, payload, start };
  }));

  const failedResponse = dayResponses.find(({ response, payload }) => !response.ok || !payload.data?.viewer?.zones?.[0]);
  if (failedResponse) {
    const message = failedResponse.payload.errors?.map(error => error.message).filter(Boolean).join('; ') || 'Failed to load Cloudflare analytics from GraphQL API.';
    return json({
      configured: true,
      source: 'cloudflare',
      period: '7d',
      pageviews: 0,
      visitors: 0,
      countries: [],
      timeseries: [],
      lastUpdated: new Date().toISOString(),
      error: message,
    }, failedResponse.response.ok ? 200 : failedResponse.response.status);
  }

  const countryMap = new Map<string, number>();
  const timeseries = dayResponses.map(({ payload, start }) => {
    const zone = payload.data?.viewer?.zones?.[0];
    const totals = zone?.totals?.[0];
    for (const point of zone?.byCountry ?? []) {
      const country = point.dimensions?.clientCountryName || 'Unknown';
      const requests = Number(point.count ?? 0);
      countryMap.set(country, (countryMap.get(country) ?? 0) + requests);
    }

    return {
      date: start.slice(0, 10),
      pageviews: Number(totals?.count ?? 0),
      visitors: Number(totals?.sum?.visits ?? 0),
    };
  });

  const countries = Array.from(countryMap.entries())
    .sort(([, left], [, right]) => right - left)
    .slice(0, 8)
    .map(([country, requests]) => ({ country, requests }));

  const pageviews = timeseries.reduce((sum, point) => sum + point.pageviews, 0);
  const visitors = timeseries.reduce((sum, point) => sum + point.visitors, 0);

  return json({
    configured: true,
    source: 'cloudflare',
    period: '7d',
    pageviews,
    visitors,
    countries,
    timeseries,
    lastUpdated: new Date().toISOString(),
  });
}

function normalizeWebAnalyticsRange(value: string | null): WebAnalyticsRange {
  return value === '24h' || value === '7d' || value === '30d' ? value : '72h';
}

function webAnalyticsStartDate(range: WebAnalyticsRange, now: Date): Date {
  const start = new Date(now);
  if (range === '24h') {
    start.setUTCHours(start.getUTCHours() - 24);
    return start;
  }
  if (range === '72h') {
    start.setUTCHours(start.getUTCHours() - 72);
    return start;
  }
  if (range === '7d') {
    start.setUTCDate(start.getUTCDate() - 7);
    return start;
  }
  start.setUTCDate(start.getUTCDate() - 30);
  return start;
}

function graphQLString(value: string): string {
  return JSON.stringify(value);
}

function webAnalyticsEmptyResponse(range: WebAnalyticsRange, excludeBots: boolean, error?: string, configured = false) {
  return {
    configured,
    source: 'cloudflare-web-analytics' as const,
    range,
    excludeBots,
    pageviews: 0,
    visits: 0,
    timeseries: [],
    paths: [],
    countries: [],
    referrers: [],
    browsers: [],
    operatingSystems: [],
    deviceTypes: [],
    hosts: [],
    performance: {
      pageLoadP50Ms: null,
      pageLoadP75Ms: null,
      pageLoadP90Ms: null,
      lcpP75Ms: null,
      inpP75Ms: null,
      clsP75: null,
      fcpP75Ms: null,
    },
    lastUpdated: new Date().toISOString(),
    error,
  };
}

function decodeAnalyticsPath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isPageAnalyticsPath(value: string) {
  const path = value.split('?')[0].toLowerCase();
  if (!path || path === '/') {
    return true;
  }

  if (path.startsWith('/assets/') || path.startsWith('/images/') || path.startsWith('/audio/') || path.startsWith('/video/')) {
    return false;
  }

  return !/\.(?:aac|avi|css|gif|ico|jpeg|jpg|js|m4a|m4v|map|mov|mp3|mp4|ogg|opus|pdf|png|svg|wav|webm|webp|wma|wmv)$/i.test(path);
}

function groupList(items: CloudflareWebAnalyticsGroup[] | undefined, dimension: string, fallback = 'Unknown') {
  return (items ?? []).map(item => ({
    label: item.dimensions?.[dimension] || fallback,
    pageviews: Number(item.count ?? 0),
    visits: Number(item.sum?.visits ?? 0),
  }));
}

function pathGroupList(items: CloudflareWebAnalyticsGroup[] | undefined) {
  return groupList(items, 'requestPath', '/')
    .filter(item => isPageAnalyticsPath(item.label))
    .map(item => ({ ...item, label: decodeAnalyticsPath(item.label) }))
    .sort((a, b) => b.visits - a.visits || b.pageviews - a.pageviews)
    .slice(0, 15);
}

function microsToMs(value: number | undefined): number | null {
  return typeof value === 'number' && value >= 0 ? Math.round(value / 1000) : null;
}

async function handleWebAnalytics(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const range = normalizeWebAnalyticsRange(url.searchParams.get('range'));
  const excludeBots = url.searchParams.get('excludeBots') !== '0';
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || '953bb353d5d63c4249b8fec0b83d805d';
  const siteTag = env.CLOUDFLARE_WEB_ANALYTICS_SITE_TAG || 'f701ee03f7074b45b7d00f0fcc031369';
  const apiToken = env.CLOUDFLARE_ANALYTICS_API_TOKEN;

  const missingConfig = [
    !accountId ? 'CLOUDFLARE_ACCOUNT_ID' : '',
    !siteTag ? 'CLOUDFLARE_WEB_ANALYTICS_SITE_TAG' : '',
    !apiToken ? 'CLOUDFLARE_ANALYTICS_API_TOKEN' : '',
  ].filter(Boolean);

  if (missingConfig.length > 0) {
    return json(webAnalyticsEmptyResponse(
      range,
      excludeBots,
      `Cloudflare Web Analytics is not configured. Missing: ${missingConfig.join(', ')}.`,
      false
    ));
  }

  const now = new Date();
  const start = webAnalyticsStartDate(range, now).toISOString();
  const end = now.toISOString();
  const filter = `{
    datetime_geq: ${graphQLString(start)}
    datetime_leq: ${graphQLString(end)}
    siteTag: ${graphQLString(siteTag)}
    ${excludeBots ? 'bot: 0' : ''}
  }`;
  const query = `
    query WebAnalyticsDashboard {
      viewer {
        accounts(filter: { accountTag: ${graphQLString(accountId)} }) {
          totals: rumPageloadEventsAdaptiveGroups(limit: 1, filter: ${filter}) {
            count
            sum { visits }
          }
          timeseries: rumPageloadEventsAdaptiveGroups(limit: 10000, orderBy: [datetimeHour_ASC], filter: ${filter}) {
            count
            sum { visits }
            dimensions { datetimeHour }
          }
          paths: rumPageloadEventsAdaptiveGroups(limit: 100, orderBy: [sum_visits_DESC], filter: ${filter}) {
            count
            sum { visits }
            dimensions { requestPath }
          }
          countries: rumPageloadEventsAdaptiveGroups(limit: 50, orderBy: [count_DESC], filter: ${filter}) {
            count
            sum { visits }
            dimensions { countryName }
          }
          referrers: rumPageloadEventsAdaptiveGroups(limit: 15, orderBy: [count_DESC], filter: ${filter}) {
            count
            sum { visits }
            dimensions { refererHost }
          }
          browsers: rumPageloadEventsAdaptiveGroups(limit: 15, orderBy: [count_DESC], filter: ${filter}) {
            count
            sum { visits }
            dimensions { userAgentBrowser }
          }
          operatingSystems: rumPageloadEventsAdaptiveGroups(limit: 15, orderBy: [count_DESC], filter: ${filter}) {
            count
            sum { visits }
            dimensions { userAgentOS }
          }
          deviceTypes: rumPageloadEventsAdaptiveGroups(limit: 15, orderBy: [count_DESC], filter: ${filter}) {
            count
            sum { visits }
            dimensions { deviceType }
          }
          hosts: rumPageloadEventsAdaptiveGroups(limit: 15, orderBy: [count_DESC], filter: ${filter}) {
            count
            sum { visits }
            dimensions { requestHost }
          }
          performance: rumPerformanceEventsAdaptiveGroups(limit: 1, filter: ${filter}) {
            quantiles {
              pageLoadTimeP50
              pageLoadTimeP75
              pageLoadTimeP90
            }
          }
          webVitals: rumWebVitalsEventsAdaptiveGroups(limit: 1, filter: ${filter}) {
            quantiles {
              largestContentfulPaintP75
              interactionToNextPaintP75
              cumulativeLayoutShiftP75
              firstContentfulPaintP75
            }
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const payload = await response.json<CloudflareGraphQLResponse<CloudflareWebAnalyticsGraphQLData>>();
  const account = payload.data?.viewer?.accounts?.[0];

  if (!response.ok || !account || payload.errors?.length) {
    const message = payload.errors?.map(error => error.message).filter(Boolean).join('; ') || 'Failed to load Cloudflare Web Analytics.';
    return json(webAnalyticsEmptyResponse(range, excludeBots, message, true), response.ok ? 200 : response.status);
  }

  const totals = account.totals?.[0];
  const performance = account.performance?.[0]?.quantiles;
  const webVitals = account.webVitals?.[0]?.quantiles;

  return json({
    configured: true,
    source: 'cloudflare-web-analytics',
    range,
    excludeBots,
    siteTag,
    pageviews: Number(totals?.count ?? 0),
    visits: Number(totals?.sum?.visits ?? 0),
    timeseries: (account.timeseries ?? []).map(point => ({
      datetime: point.dimensions?.datetimeHour || '',
      pageviews: Number(point.count ?? 0),
      visits: Number(point.sum?.visits ?? 0),
    })).filter(point => point.datetime),
    paths: pathGroupList(account.paths),
    countries: groupList(account.countries, 'countryName'),
    referrers: groupList(account.referrers, 'refererHost', 'Direct'),
    browsers: groupList(account.browsers, 'userAgentBrowser'),
    operatingSystems: groupList(account.operatingSystems, 'userAgentOS'),
    deviceTypes: groupList(account.deviceTypes, 'deviceType'),
    hosts: groupList(account.hosts, 'requestHost'),
    performance: {
      pageLoadP50Ms: microsToMs(performance?.pageLoadTimeP50),
      pageLoadP75Ms: microsToMs(performance?.pageLoadTimeP75),
      pageLoadP90Ms: microsToMs(performance?.pageLoadTimeP90),
      lcpP75Ms: microsToMs(webVitals?.largestContentfulPaintP75),
      inpP75Ms: microsToMs(webVitals?.interactionToNextPaintP75),
      clsP75: typeof webVitals?.cumulativeLayoutShiftP75 === 'number' && webVitals.cumulativeLayoutShiftP75 >= 0
        ? Number(webVitals.cumulativeLayoutShiftP75.toFixed(3))
        : null,
      fcpP75Ms: microsToMs(webVitals?.firstContentfulPaintP75),
    },
    lastUpdated: new Date().toISOString(),
  });
}

async function readJson<T>(request: Request): Promise<T> {
  return request.json<T>();
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'upload.jpg';
}

function isUploadBlob(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === 'object' && 'arrayBuffer' in value);
}

async function handleImageObject(env: Env, key: string): Promise<Response> {
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) {
    return notFound('Image not found');
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}

// ============================================================================
// Live Stream — see docs/superpowers/specs/2026-05-21-youtube-livestream-design.md
// ============================================================================

type LiveStreamConfigRow = {
  id: number;
  channel_id: string | null;
  api_key: string | null;
  service_day: number;
  service_start_local: string;
  service_duration_minutes: number;
  timezone: string;
  manual_video_id: string | null;
  enabled: number;
  updated_at: number;
};

type LiveStreamStateRow = {
  id: number;
  is_live: number;
  video_id: string | null;
  started_at: number | null;
  checked_at: number;
  last_error: string | null;
};

const UNCHANGED_API_KEY = '__unchanged__';

function maskApiKey(key: string | null): string {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

async function getLiveStreamConfigRow(env: Env): Promise<LiveStreamConfigRow> {
  const row = await env.DB
    .prepare('SELECT * FROM live_stream_config WHERE id = 1')
    .first<LiveStreamConfigRow>();
  if (row) return row;
  // Seed-on-read fallback in case migration ran but seed inserts were skipped.
  await env.DB.prepare(
    "INSERT OR IGNORE INTO live_stream_config (id, updated_at) VALUES (1, 0)"
  ).run();
  return {
    id: 1,
    channel_id: null,
    api_key: null,
    service_day: 0,
    service_start_local: '10:00',
    service_duration_minutes: 90,
    timezone: 'America/Los_Angeles',
    manual_video_id: null,
    enabled: 0,
    updated_at: 0,
  };
}

async function getLiveStreamStateRow(env: Env): Promise<LiveStreamStateRow> {
  const row = await env.DB
    .prepare('SELECT * FROM live_stream_state WHERE id = 1')
    .first<LiveStreamStateRow>();
  if (row) return row;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO live_stream_state (id, checked_at) VALUES (1, 0)"
  ).run();
  return { id: 1, is_live: 0, video_id: null, started_at: null, checked_at: 0, last_error: null };
}

function configRowToAdmin(row: LiveStreamConfigRow) {
  return {
    channelId: row.channel_id ?? '',
    apiKeyMasked: maskApiKey(row.api_key),
    apiKeyPresent: Boolean(row.api_key),
    serviceDay: row.service_day,
    serviceStartLocal: row.service_start_local,
    serviceDurationMinutes: row.service_duration_minutes,
    timezone: row.timezone,
    manualVideoId: row.manual_video_id ?? '',
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at,
  };
}

function stateRowToAdmin(row: LiveStreamStateRow) {
  return {
    isLive: Boolean(row.is_live),
    videoId: row.video_id,
    startedAt: row.started_at,
    checkedAt: row.checked_at || null,
    lastError: row.last_error,
  };
}

// Use Intl to convert UTC `Date` into the configured timezone's wall clock parts.
function nowInTimezone(now: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

function withinServiceWindow(row: LiveStreamConfigRow, now: Date): boolean {
  const local = nowInTimezone(now, row.timezone);
  if (local.weekday !== row.service_day) return false;

  const [hStr, mStr] = row.service_start_local.split(':');
  const startMinutes = Number(hStr) * 60 + Number(mStr);
  const nowMinutes = local.hour * 60 + local.minute;
  const offset = nowMinutes - startMinutes;
  return offset >= -30 && offset <= row.service_duration_minutes + 30;
}

function nextServiceIso(row: LiveStreamConfigRow, now: Date): string | null {
  const [hStr, mStr] = row.service_start_local.split(':');
  const startH = Number(hStr);
  const startM = Number(mStr);

  // Walk up to 8 days forward, returning the first matching weekday whose start time is still in the future.
  for (let i = 0; i <= 8; i++) {
    const probe = new Date(now.getTime() + i * 86400000);
    const local = nowInTimezone(probe, row.timezone);
    if (local.weekday !== row.service_day) continue;

    const candidate = new Date(Date.UTC(local.year, local.month - 1, local.day, startH, startM));
    // candidate is the wall-clock time interpreted as UTC; we need to shift back to the configured timezone.
    // Compute the offset between the probe's UTC and its localized representation, then subtract.
    const offsetMinutes = computeTzOffsetMinutes(probe, row.timezone);
    const trueUtc = candidate.getTime() - offsetMinutes * 60_000;
    if (trueUtc >= now.getTime() - 5 * 60_000) {
      return new Date(trueUtc).toISOString();
    }
  }
  return null;
}

function computeTzOffsetMinutes(at: Date, timezone: string): number {
  // Returns (local wall-clock minutes since UTC midnight on `at`'s date) - (UTC minutes), accounting for DST.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((localAsUtc - at.getTime()) / 60_000);
}

async function getLatestSermon(env: Env): Promise<{ id: string; titleEn: string; titleZh: string; videoId: string; date: string } | null> {
  const row = await env.DB
    .prepare("SELECT id, title_en, title_zh, youtube_id, date FROM sermons WHERE type = 'sermon' ORDER BY date DESC LIMIT 1")
    .first<{ id: string; title_en: string; title_zh: string; youtube_id: string; date: string }>();
  if (!row) return null;
  return {
    id: row.id,
    titleEn: row.title_en,
    titleZh: row.title_zh,
    videoId: row.youtube_id,
    date: row.date,
  };
}

async function updateLiveStreamState(
  env: Env,
  patch: Partial<{ is_live: number; video_id: string | null; started_at: number | null; checked_at: number; last_error: string | null }>
): Promise<void> {
  const current = await getLiveStreamStateRow(env);
  const next = { ...current, ...patch };
  await env.DB
    .prepare(
      `UPDATE live_stream_state
       SET is_live = ?, video_id = ?, started_at = ?, checked_at = ?, last_error = ?
       WHERE id = 1`
    )
    .bind(next.is_live, next.video_id, next.started_at, next.checked_at, next.last_error)
    .run();
}

type YouTubeSearchResponse = {
  items?: Array<{ id?: { videoId?: string } }>;
  error?: { message?: string; code?: number };
};

async function probeYouTubeLive(row: LiveStreamConfigRow): Promise<{ videoId: string | null; error: string | null }> {
  if (!row.channel_id || !row.api_key) {
    return { videoId: null, error: 'channel_id or api_key missing' };
  }
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'id');
  url.searchParams.set('channelId', row.channel_id);
  url.searchParams.set('eventType', 'live');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '1');
  url.searchParams.set('key', row.api_key);

  try {
    const response = await fetch(url.toString());
    const data = await response.json<YouTubeSearchResponse>();
    if (!response.ok || data.error) {
      return { videoId: null, error: data.error?.message ?? `HTTP ${response.status}` };
    }
    const videoId = data.items?.[0]?.id?.videoId ?? null;
    return { videoId, error: null };
  } catch (err) {
    return { videoId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function runProbeIfDue(env: Env, force: boolean): Promise<LiveStreamStateRow> {
  const config = await getLiveStreamConfigRow(env);
  if (!force) {
    if (!config.enabled || config.manual_video_id) {
      return getLiveStreamStateRow(env);
    }
    if (!withinServiceWindow(config, new Date())) {
      return getLiveStreamStateRow(env);
    }
  }
  const result = await probeYouTubeLive(config);
  const prev = await getLiveStreamStateRow(env);
  const startedAt = result.videoId
    ? (prev.video_id === result.videoId && prev.started_at ? prev.started_at : Date.now())
    : null;
  await updateLiveStreamState(env, {
    is_live: result.videoId ? 1 : 0,
    video_id: result.videoId,
    started_at: startedAt,
    checked_at: Date.now(),
    last_error: result.error,
  });
  return getLiveStreamStateRow(env);
}

async function buildPublicLiveStreamState(env: Env) {
  const config = await getLiveStreamConfigRow(env);
  const state = await getLiveStreamStateRow(env);
  const latest = await getLatestSermon(env);
  const next = nextServiceIso(config, new Date());

  // Manual override always wins.
  if (config.manual_video_id) {
    return {
      status: 'live' as const,
      videoId: config.manual_video_id,
      startedAt: null,
      nextServiceIso: next,
      latestSermon: latest,
      checkedAt: state.checked_at || null,
    };
  }
  if (state.is_live && state.video_id) {
    return {
      status: 'live' as const,
      videoId: state.video_id,
      startedAt: state.started_at,
      nextServiceIso: next,
      latestSermon: latest,
      checkedAt: state.checked_at || null,
    };
  }
  return {
    status: 'offline' as const,
    videoId: null,
    startedAt: null,
    nextServiceIso: next,
    latestSermon: latest,
    checkedAt: state.checked_at || null,
  };
}

async function handleLiveStreamPublic(env: Env): Promise<Response> {
  try {
    const data = await buildPublicLiveStreamState(env);
    return json(data);
  } catch (err) {
    // Degrade gracefully: missing tables (pre-migration), DB errors, etc.
    // Public page shows the offline banner without latest sermon rather than crashing.
    return json({
      status: 'offline' as const,
      videoId: null,
      startedAt: null,
      nextServiceIso: null,
      latestSermon: null,
      checkedAt: null,
      degraded: true,
      degradedReason: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleLiveStreamGetConfig(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  try {
    const config = await getLiveStreamConfigRow(env);
    const state = await getLiveStreamStateRow(env);
    return json({ config: configRowToAdmin(config), state: stateRowToAdmin(state) });
  } catch (err) {
    return json({ error: 'Live stream tables not initialized. Run `npm run d1:migrate:remote` to apply migration 0005.', detail: err instanceof Error ? err.message : String(err) }, 500);
  }
}

async function handleLiveStreamPutConfig(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'owner');
  if (auth instanceof Response) return auth;
  const payload = await readJson<{
    channelId?: string;
    apiKey?: string;
    serviceDay?: number;
    serviceStartLocal?: string;
    serviceDurationMinutes?: number;
    timezone?: string;
    manualVideoId?: string;
    enabled?: boolean;
  }>(request);

  const current = await getLiveStreamConfigRow(env);
  const apiKey =
    payload.apiKey === undefined || payload.apiKey === UNCHANGED_API_KEY
      ? current.api_key
      : payload.apiKey.trim() || null;

  const next = {
    channel_id: (payload.channelId ?? current.channel_id ?? '').trim() || null,
    api_key: apiKey,
    service_day: clampInt(payload.serviceDay ?? current.service_day, 0, 6),
    service_start_local: validateTimeOrDefault(payload.serviceStartLocal, current.service_start_local),
    service_duration_minutes: clampInt(payload.serviceDurationMinutes ?? current.service_duration_minutes, 5, 720),
    timezone: (payload.timezone ?? current.timezone).trim() || 'America/Los_Angeles',
    manual_video_id: (payload.manualVideoId ?? current.manual_video_id ?? '').trim() || null,
    enabled: payload.enabled === undefined ? current.enabled : payload.enabled ? 1 : 0,
    updated_at: Date.now(),
  };

  await env.DB
    .prepare(
      `UPDATE live_stream_config
       SET channel_id = ?, api_key = ?, service_day = ?, service_start_local = ?,
           service_duration_minutes = ?, timezone = ?, manual_video_id = ?, enabled = ?, updated_at = ?
       WHERE id = 1`
    )
    .bind(
      next.channel_id,
      next.api_key,
      next.service_day,
      next.service_start_local,
      next.service_duration_minutes,
      next.timezone,
      next.manual_video_id,
      next.enabled,
      next.updated_at
    )
    .run();

  const config = await getLiveStreamConfigRow(env);
  return json({ config: configRowToAdmin(config) });
}

async function handleLiveStreamTest(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  const payload = await readJson<{ channelId?: string; apiKey?: string }>(request);
  const current = await getLiveStreamConfigRow(env);

  const channelId = (payload.channelId ?? current.channel_id ?? '').trim();
  const apiKey =
    payload.apiKey && payload.apiKey !== UNCHANGED_API_KEY
      ? payload.apiKey.trim()
      : current.api_key ?? '';

  if (!channelId || !apiKey) {
    return json({ ok: false, error: 'channelId and apiKey are required' }, 400);
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', channelId);
  url.searchParams.set('key', apiKey);

  try {
    const response = await fetch(url.toString());
    const data = await response.json<{
      items?: Array<{ snippet?: { title?: string } }>;
      error?: { message?: string };
    }>();
    if (!response.ok || data.error) {
      return json({ ok: false, error: data.error?.message ?? `HTTP ${response.status}` });
    }
    const title = data.items?.[0]?.snippet?.title;
    if (!title) {
      return json({ ok: false, error: 'Channel not found' });
    }
    return json({ ok: true, channelName: title });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleLiveStreamProbe(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  const state = await runProbeIfDue(env, true);
  return json({ state: stateRowToAdmin(state) });
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function validateTimeOrDefault(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      return handleLogin(request, env);
    }

    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      return handleLogout(request, env);
    }

    if (url.pathname === '/api/auth/me' && request.method === 'GET') {
      return handleMe(request, env);
    }

    if (url.pathname === '/api/auth/me' && request.method === 'PATCH') {
      return handleUpdateMe(request, env);
    }

    if (url.pathname === '/api/users') {
      return handleUsers(request, env);
    }

    if (url.pathname.startsWith('/api/users/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      if (!id) {
        return badRequest('Missing user id');
      }
      return handleUserById(request, env, id);
    }

    if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
      return handleBootstrap(request, env);
    }

    if (url.pathname === '/api/analytics/summary' && request.method === 'GET') {
      const auth = await requireUser(request, env, 'contributor');
      if (auth instanceof Response) {
        return auth;
      }
      return handleAnalyticsSummary(env);
    }

    if (url.pathname === '/api/analytics/web' && request.method === 'GET') {
      const auth = await requireUser(request, env, 'contributor');
      if (auth instanceof Response) {
        return auth;
      }
      return handleWebAnalytics(request, env);
    }

    if (url.pathname === '/api/content' && request.method === 'PUT') {
      const auth = await requireUser(request, env, 'contributor');
      if (auth instanceof Response) {
        return auth;
      }
      const content = await readJson(request);
      if (auth.role !== 'owner') {
        const currentContent = await getSiteContent(env);
        const restricted = restrictedContentChanges(content as typeof translations, currentContent);
        if (restricted.length > 0) {
          return forbidden('Admins cannot edit owner-only content.');
        }
      }
      await putSiteContent(env, content as typeof translations);
      return json({ ok: true });
    }

    if (url.pathname === '/api/images' && request.method === 'PUT') {
      const auth = await requireUser(request, env, 'contributor');
      if (auth instanceof Response) {
        return auth;
      }
      const images = await readJson<Record<string, string>>(request);
      if (auth.role !== 'owner') {
        const currentImages = await getSetting<Record<string, string>>(env, 'images', {});
        const restricted = restrictedImageChanges(images, currentImages);
        if (restricted.length > 0) {
          return forbidden('Admins cannot edit homepage media.');
        }
      }
      await putSetting(env, 'images', images);
      return json(images);
    }

    if (url.pathname === '/api/images/upload' && request.method === 'POST') {
      const auth = await requireUser(request, env, 'contributor');
      if (auth instanceof Response) {
        return auth;
      }
      const imageKey = url.searchParams.get('key');
      if (!imageKey) {
        return badRequest('Missing image key');
      }
      if (auth.role !== 'owner' && imageKey.startsWith('hero.')) {
        return forbidden('Admins cannot edit homepage media.');
      }
      const formData = await request.formData();
      const file = formData.get('file');
      if (!isUploadBlob(file)) {
        return badRequest('Missing upload file');
      }
      const originalName = file instanceof File ? file.name : 'upload.jpg';
      const extension = sanitizeFileName(originalName).split('.').pop() || 'jpg';
      const objectKey = `images/${imageKey.replace(/[^a-zA-Z0-9._/-]+/g, '-')}-${Date.now()}.${extension}`;
      await env.MEDIA_BUCKET.put(objectKey, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || 'image/jpeg' },
      });
      const images = await getSetting<Record<string, string>>(env, 'images', {});
      images[imageKey] = `/api/images/${objectKey}`;
      await putSetting(env, 'images', images);
      return json({ key: imageKey, url: images[imageKey] });
    }

    if (url.pathname.startsWith('/api/images/') && request.method === 'GET') {
      const objectKey = decodeURIComponent(url.pathname.replace('/api/images/', ''));
      return handleImageObject(env, objectKey);
    }

    if (url.pathname === '/api/sermons' && request.method === 'POST') {
      const auth = await requireUser(request, env, 'contributor');
      if (auth instanceof Response) {
        return auth;
      }
      const sermon = await readJson<any>(request);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO sermons (
          id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh,
          passage_en, passage_zh, youtube_id, image_url, type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        sermon.title.en,
        sermon.title.zh,
        sermon.speaker.en,
        sermon.speaker.zh,
        sermon.date,
        sermon.series.en,
        sermon.series.zh,
        sermon.passage.en,
        sermon.passage.zh,
        sermon.youtubeId,
        sermon.imageUrl ?? null,
        'sermon',
        now,
        now
      ).run();
      const row = await env.DB.prepare('SELECT * FROM sermons WHERE id = ?').bind(id).first<SermonRow>();
      return json(mapSermon(row as SermonRow), 201);
    }

    if (url.pathname === '/api/daily-manna' && request.method === 'POST') {
      const auth = await requireUser(request, env, 'contributor');
      if (auth instanceof Response) {
        return auth;
      }
      const sermon = await readJson<any>(request);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO daily_manna (
          id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh,
          passage_en, passage_zh, youtube_id, image_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        sermon.title.en,
        sermon.title.zh,
        sermon.speaker.en,
        sermon.speaker.zh,
        sermon.date,
        sermon.series.en,
        sermon.series.zh,
        sermon.passage.en,
        sermon.passage.zh,
        sermon.youtubeId,
        sermon.imageUrl ?? null,
        now,
        now
      ).run();
      const row = await env.DB.prepare('SELECT * FROM daily_manna WHERE id = ?').bind(id).first<DailyMannaRow>();
      return json(mapDailyManna(row as DailyMannaRow), 201);
    }

    if (url.pathname.startsWith('/api/daily-manna/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      if (!id) {
        return badRequest('Missing daily manna id');
      }
      if (request.method === 'PUT') {
        const auth = await requireUser(request, env, 'contributor');
        if (auth instanceof Response) {
          return auth;
        }
        const sermon = await readJson<any>(request);
        await env.DB.prepare(
          `UPDATE daily_manna SET
            title_en = ?, title_zh = ?, speaker_en = ?, speaker_zh = ?, date = ?,
            series_en = ?, series_zh = ?, passage_en = ?, passage_zh = ?,
            youtube_id = ?, image_url = ?, updated_at = ?
          WHERE id = ?`
        ).bind(
          sermon.title.en,
          sermon.title.zh,
          sermon.speaker.en,
          sermon.speaker.zh,
          sermon.date,
          sermon.series.en,
          sermon.series.zh,
          sermon.passage.en,
          sermon.passage.zh,
          sermon.youtubeId,
          sermon.imageUrl ?? null,
          new Date().toISOString(),
          id
        ).run();
        const row = await env.DB.prepare('SELECT * FROM daily_manna WHERE id = ?').bind(id).first<DailyMannaRow>();
        return json(mapDailyManna(row as DailyMannaRow));
      }
      if (request.method === 'DELETE') {
        const auth = await requireUser(request, env, 'contributor');
        if (auth instanceof Response) {
          return auth;
        }
        await env.DB.prepare('DELETE FROM daily_manna WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }
    }

    if (url.pathname.startsWith('/api/sermons/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      if (!id) {
        return badRequest('Missing sermon id');
      }
      if (request.method === 'PUT') {
        const auth = await requireUser(request, env, 'contributor');
        if (auth instanceof Response) {
          return auth;
        }
        const sermon = await readJson<any>(request);
        await env.DB.prepare(
          `UPDATE sermons SET
            title_en = ?, title_zh = ?, speaker_en = ?, speaker_zh = ?, date = ?,
            series_en = ?, series_zh = ?, passage_en = ?, passage_zh = ?,
            youtube_id = ?, image_url = ?, type = ?, updated_at = ?
          WHERE id = ?`
        ).bind(
          sermon.title.en,
          sermon.title.zh,
          sermon.speaker.en,
          sermon.speaker.zh,
          sermon.date,
          sermon.series.en,
          sermon.series.zh,
          sermon.passage.en,
          sermon.passage.zh,
          sermon.youtubeId,
          sermon.imageUrl ?? null,
          'sermon',
          new Date().toISOString(),
          id
        ).run();
        const row = await env.DB.prepare('SELECT * FROM sermons WHERE id = ?').bind(id).first<SermonRow>();
        return json(mapSermon(row as SermonRow));
      }
      if (request.method === 'DELETE') {
        const auth = await requireUser(request, env, 'contributor');
        if (auth instanceof Response) {
          return auth;
        }
        await env.DB.prepare('DELETE FROM sermons WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }
    }

    if (url.pathname === '/api/messages' && request.method === 'POST') {
      const payload = await readJson<any>(request);
      const id = crypto.randomUUID();
      const row = {
        id,
        date: new Date().toISOString(),
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        message: payload.message,
        read: 0,
      };
      await env.DB.prepare(
        'INSERT INTO messages (id, date, first_name, last_name, email, phone, message, read) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(row.id, row.date, row.first_name, row.last_name, row.email, row.phone, row.message, row.read).run();
      return json(mapMessage(row as MessageRow), 201);
    }

    if (url.pathname.endsWith('/read') && request.method === 'PATCH' && url.pathname.startsWith('/api/messages/')) {
      const auth = await requireUser(request, env, 'contributor');
      if (auth instanceof Response) {
        return auth;
      }
      const id = decodeURIComponent(url.pathname.split('/')[3] || '');
      await env.DB.prepare('UPDATE messages SET read = 1 WHERE id = ?').bind(id).run();
      const row = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first<MessageRow>();
      return json(mapMessage(row as MessageRow));
    }

    if (url.pathname.startsWith('/api/messages/') && request.method === 'DELETE') {
      const auth = await requireUser(request, env, 'contributor');
      if (auth instanceof Response) {
        return auth;
      }
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    if (url.pathname === '/api/prayer-requests' && request.method === 'POST') {
      const payload = await readJson<any>(request);
      const row = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        message: payload.message,
        status: 'new' as const,
      };
      await env.DB.prepare(
        'INSERT INTO prayer_requests (id, date, first_name, last_name, email, phone, message, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(row.id, row.date, row.first_name, row.last_name, row.email, row.phone, row.message, row.status).run();
      return json(mapPrayerRequest(row as PrayerRequestRow), 201);
    }

    if (url.pathname.endsWith('/prayed') && request.method === 'PATCH' && url.pathname.startsWith('/api/prayer-requests/')) {
      const auth = await requireUser(request, env, 'contributor');
      if (auth instanceof Response) {
        return auth;
      }
      const id = decodeURIComponent(url.pathname.split('/')[3] || '');
      await env.DB.prepare("UPDATE prayer_requests SET status = 'prayed' WHERE id = ?").bind(id).run();
      const row = await env.DB.prepare('SELECT * FROM prayer_requests WHERE id = ?').bind(id).first<PrayerRequestRow>();
      return json(mapPrayerRequest(row as PrayerRequestRow));
    }

    if (url.pathname.startsWith('/api/prayer-requests/') && request.method === 'DELETE') {
      const auth = await requireUser(request, env, 'contributor');
      if (auth instanceof Response) {
        return auth;
      }
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      await env.DB.prepare('DELETE FROM prayer_requests WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    if (url.pathname === '/api/donations' && request.method === 'POST') {
      const payload = await readJson<any>(request);
      const row = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        amount: Number(payload.amount),
        type: payload.type,
        status: 'completed' as const,
      };
      await env.DB.prepare(
        'INSERT INTO donations (id, date, amount, type, status) VALUES (?, ?, ?, ?, ?)'
      ).bind(row.id, row.date, row.amount, row.type, row.status).run();
      return json(mapDonation(row as DonationRow), 201);
    }

    if (url.pathname === '/api/live-stream' && request.method === 'GET') {
      return handleLiveStreamPublic(env);
    }

    if (url.pathname === '/api/admin/live-stream/config' && request.method === 'GET') {
      return handleLiveStreamGetConfig(request, env);
    }

    if (url.pathname === '/api/admin/live-stream/config' && request.method === 'PUT') {
      return handleLiveStreamPutConfig(request, env);
    }

    if (url.pathname === '/api/admin/live-stream/test' && request.method === 'POST') {
      return handleLiveStreamTest(request, env);
    }

    if (url.pathname === '/api/admin/live-stream/probe' && request.method === 'POST') {
      return handleLiveStreamProbe(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return notFound();
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (shouldServeAppShell(request, url, assetResponse)) {
      const indexUrl = new URL('/index.html', url.origin);
      return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
    }

    return assetResponse;
  },

  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(runProbeIfDue(env, false).then(() => undefined).catch(() => undefined));
  },
};

export default worker;
