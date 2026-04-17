/// <reference types="@cloudflare/workers-types" />

import { DEFAULT_SERMONS, type AdminRole } from './data';
import { translations } from './constants/translations';

type Env = {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  ASSETS: Fetcher;
  CLOUDFLARE_ZONE_ID?: string;
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
  return flattenSiteContent(nextContent as Record<string, unknown>)
    .filter(row => row.path.startsWith('hero.'))
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
          return forbidden('Admins cannot edit homepage content.');
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

    if (url.pathname.startsWith('/api/')) {
      return notFound();
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;
