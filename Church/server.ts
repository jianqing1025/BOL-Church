/// <reference types="@cloudflare/workers-types" />

import { DEFAULT_SERMONS, type AdminRole, type WebAnalyticsRange } from './data';
import { translations } from './constants/translations';
import {
  buildClassifier,
  classifySermonCategory,
  inferEntryTypeFromTitle,
  matchesTarget,
  type ClassifierModel,
  type SyncTarget,
  type TrainingRow,
} from './sync/classifier';
import { nextPeak, computeTotalOnline } from './live/liveStats';

type Env = {
  DB: D1Database;
  PHOTOS_DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  CHURCH_PHOTOS_BUCKET: R2Bucket;
  ASSETS: Fetcher;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_WEB_ANALYTICS_SITE_TAG?: string;
  CLOUDFLARE_ANALYTICS_API_TOKEN?: string;
  ADMIN_BOOTSTRAP_EMAIL?: string;
  ADMIN_BOOTSTRAP_PASSWORD?: string;
  ADMIN_BOOTSTRAP_NAME?: string;
  RESEND_API_KEY?: string;
};

type LocalizedText = { en: string; zh: string };

type SermonCategoryDb = 'sunday-worship' | 'worship-praise' | 'healing-prayer' | 'testimony' | 'live-broadcast';

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
  category?: SermonCategoryDb | null;
  hidden?: number;
  duration_seconds?: number | null;
  view_count?: number | null;
  live_online_total?: number | null;
};

type DailyMannaRow = Omit<SermonRow, 'type' | 'category'>;

async function ensureHiddenColumns(env: Env): Promise<void> {
  try { await env.DB.prepare('ALTER TABLE sermons ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0').run(); } catch { /* already exists */ }
  try { await env.DB.prepare('ALTER TABLE daily_manna ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0').run(); } catch { /* already exists */ }
}

async function ensureMetadataColumns(env: Env): Promise<void> {
  try { await env.DB.prepare('ALTER TABLE sermons ADD COLUMN duration_seconds INTEGER').run(); } catch { /* already exists */ }
  try { await env.DB.prepare('ALTER TABLE sermons ADD COLUMN view_count INTEGER').run(); } catch { /* already exists */ }
  try { await env.DB.prepare('ALTER TABLE daily_manna ADD COLUMN duration_seconds INTEGER').run(); } catch { /* already exists */ }
  try { await env.DB.prepare('ALTER TABLE daily_manna ADD COLUMN view_count INTEGER').run(); } catch { /* already exists */ }
}

async function ensureCategoryColumn(env: Env): Promise<void> {
  try {
    await env.DB.prepare("ALTER TABLE sermons ADD COLUMN category TEXT NOT NULL DEFAULT 'sunday-worship'").run();
  } catch { /* already exists */ }
}

async function ensureLiveStatsSchema(env: Env): Promise<void> {
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS live_session_seen (
        video_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (video_id, session_id)
      )`
    ).run();
  } catch { /* ignore */ }
  try { await env.DB.prepare('ALTER TABLE live_stream_state ADD COLUMN youtube_peak INTEGER').run(); } catch { /* already exists */ }
  try { await env.DB.prepare('ALTER TABLE sermons ADD COLUMN live_online_total INTEGER').run(); } catch { /* already exists */ }
}

function normalizeCategory(value: unknown): SermonCategoryDb {
  if (
    value === 'worship-praise' ||
    value === 'healing-prayer' ||
    value === 'testimony' ||
    value === 'live-broadcast'
  ) return value;
  return 'sunday-worship';
}

// Parse YouTube ISO 8601 duration (e.g. "PT1H35M20S") to seconds
function parseIsoDuration(iso: string | undefined | null): number {
  if (!iso) return 0;
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

type VideoMeta = { durationSeconds: number; viewCount: number };

async function fetchVideoMetadata(apiKey: string, videoIds: string[]): Promise<Map<string, VideoMeta>> {
  const map = new Map<string, VideoMeta>();
  if (!videoIds.length || !apiKey) return map;
  // YouTube videos.list accepts up to 50 IDs per call
  const CHUNK = 50;
  for (let i = 0; i < videoIds.length; i += CHUNK) {
    const chunk = videoIds.slice(i, i + CHUNK);
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'contentDetails,statistics');
    url.searchParams.set('id', chunk.join(','));
    url.searchParams.set('key', apiKey);
    try {
      const response = await fetch(url.toString());
      if (!response.ok) continue;
      const data = await response.json<{
        items?: Array<{
          id?: string;
          contentDetails?: { duration?: string };
          statistics?: { viewCount?: string };
        }>;
      }>();
      for (const item of data.items || []) {
        if (!item.id) continue;
        map.set(item.id, {
          durationSeconds: parseIsoDuration(item.contentDetails?.duration),
          viewCount: Number(item.statistics?.viewCount || 0),
        });
      }
    } catch { /* skip on error */ }
  }
  return map;
}

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

type PhotoRow = {
  id: string;
  object_key: string;
  src: string;
  title: string;
  collection: string;
  album: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  shot_at: string | null;
  camera: string | null;
  lens: string | null;
  focal_length: string | null;
  aperture: string | null;
  shutter: string | null;
  iso: number | null;
  thumb_object_key: string | null;
  thumb_src: string | null;
  uploader_id: string | null;
  uploader_name: string | null;
  sort_order: number;
  hidden: number;
  created_at: number;
  updated_at: number;
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

function sanitizeObjectSegment(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'photo';
}

function mapPhoto(row: PhotoRow) {
  const exif: Record<string, string | number> = {};
  if (row.camera) exif.camera = row.camera;
  if (row.lens) exif.lens = row.lens;
  if (row.focal_length) exif.focalLength = row.focal_length;
  if (row.aperture) exif.aperture = row.aperture;
  if (row.shutter) exif.shutter = row.shutter;
  if (row.iso != null) exif.iso = Number(row.iso);
  return {
    id: row.id,
    src: row.src,
    title: row.title,
    collection: row.collection,
    album: row.album,
    sizeBytes: row.size_bytes ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    thumbSrc: row.thumb_src || undefined,
    shotAt: row.shot_at || undefined,
    exif: Object.keys(exif).length > 0 ? exif : undefined,
    uploaderId: row.uploader_id || undefined,
    uploaderName: row.uploader_name || undefined,
    hidden: Boolean(row.hidden),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
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
    category: normalizeCategory(row.category),
    hidden: Boolean(row.hidden),
    durationSeconds: row.duration_seconds ?? null,
    viewCount: row.view_count ?? null,
    liveOnlineTotal: row.live_online_total ?? null,
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
    hidden: Boolean(row.hidden),
    durationSeconds: row.duration_seconds ?? null,
    viewCount: row.view_count ?? null,
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
  await ensureCategoryColumn(env);

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
          series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, type, category,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        normalizeCategory(sermon.category),
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

async function ensurePhotoTables(env: Env): Promise<void> {
  await env.PHOTOS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      object_key TEXT NOT NULL,
      src TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      collection TEXT NOT NULL DEFAULT '',
      album TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER,
      width INTEGER,
      height INTEGER,
      uploader_id TEXT NOT NULL DEFAULT '',
      uploader_name TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      hidden INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`
  ).run();
  await env.PHOTOS_DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_photos_visible_sort ON photos(hidden, sort_order DESC, created_at DESC)'
  ).run();
  await env.PHOTOS_DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_photos_collection_album ON photos(collection, album)'
  ).run();
  await env.PHOTOS_DB.prepare('ALTER TABLE photos ADD COLUMN uploader_id TEXT NOT NULL DEFAULT ""').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare('ALTER TABLE photos ADD COLUMN uploader_name TEXT NOT NULL DEFAULT ""').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare('ALTER TABLE photos ADD COLUMN shot_at TEXT').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare('ALTER TABLE photos ADD COLUMN camera TEXT').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare('ALTER TABLE photos ADD COLUMN lens TEXT').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare('ALTER TABLE photos ADD COLUMN focal_length TEXT').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare('ALTER TABLE photos ADD COLUMN aperture TEXT').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare('ALTER TABLE photos ADD COLUMN shutter TEXT').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare('ALTER TABLE photos ADD COLUMN iso INTEGER').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare('ALTER TABLE photos ADD COLUMN thumb_object_key TEXT').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare('ALTER TABLE photos ADD COLUMN thumb_src TEXT').run().catch(() => undefined);

  await env.PHOTOS_DB.prepare(
    `CREATE TABLE IF NOT EXISTS photo_settings (
      id INTEGER PRIMARY KEY,
      max_long_edge INTEGER NOT NULL DEFAULT 1600,
      jpeg_quality REAL NOT NULL DEFAULT 0.82,
      default_year TEXT NOT NULL DEFAULT '',
      default_album TEXT NOT NULL DEFAULT '',
      page_size INTEGER NOT NULL DEFAULT 100
    )`
  ).run();
  await env.PHOTOS_DB.prepare('ALTER TABLE photo_settings ADD COLUMN default_year TEXT NOT NULL DEFAULT ""').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare('ALTER TABLE photo_settings ADD COLUMN default_album TEXT NOT NULL DEFAULT ""').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare('ALTER TABLE photo_settings ADD COLUMN page_size INTEGER NOT NULL DEFAULT 100').run().catch(() => undefined);
  await env.PHOTOS_DB.prepare(
    'INSERT OR IGNORE INTO photo_settings (id, max_long_edge, jpeg_quality, page_size) VALUES (1, 1600, 0.82, 100)'
  ).run();
}

const PHOTO_SETTINGS_DEFAULT = { maxLongEdge: 1600, jpegQuality: 0.82, defaultYear: '', defaultAlbum: '', pageSize: 100 };
const PHOTO_PAGE_SIZE_OPTIONS = [50, 100, 200, 500, 1000];

type PhotoSettings = { maxLongEdge: number; jpegQuality: number; defaultYear: string; defaultAlbum: string; pageSize: number };

async function readPhotoSettings(env: Env): Promise<PhotoSettings> {
  const row = await env.PHOTOS_DB
    .prepare('SELECT max_long_edge, jpeg_quality, default_year, default_album, page_size FROM photo_settings WHERE id = 1')
    .first<{ max_long_edge: number | null; jpeg_quality: number | null; default_year: string | null; default_album: string | null; page_size: number | null }>();
  if (!row) return { ...PHOTO_SETTINGS_DEFAULT };
  const pageSize = Number(row.page_size) || PHOTO_SETTINGS_DEFAULT.pageSize;
  return {
    maxLongEdge: Number(row.max_long_edge) || PHOTO_SETTINGS_DEFAULT.maxLongEdge,
    jpegQuality: Number(row.jpeg_quality) || PHOTO_SETTINGS_DEFAULT.jpegQuality,
    defaultYear: row.default_year || '',
    defaultAlbum: row.default_album || '',
    pageSize: PHOTO_PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : PHOTO_SETTINGS_DEFAULT.pageSize,
  };
}

async function handlePhotoSettingsGet(env: Env): Promise<Response> {
  await ensurePhotoTables(env);
  return json(await readPhotoSettings(env));
}

async function handlePhotoSettingsUpdate(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;

  await ensurePhotoTables(env);
  const payload = await readJson<Partial<PhotoSettings>>(request);
  const current = await readPhotoSettings(env);
  const maxLongEdge = Math.max(512, Math.min(7680, Math.round(Number(payload.maxLongEdge)) || current.maxLongEdge));
  const jpegQuality = Math.max(0.5, Math.min(1, Number(payload.jpegQuality) || current.jpegQuality));
  const rawYear = payload.defaultYear === undefined ? current.defaultYear : String(payload.defaultYear).trim();
  const defaultYear = /^\d{4}$/.test(rawYear) ? rawYear : '';
  const defaultAlbum = (payload.defaultAlbum === undefined ? current.defaultAlbum : String(payload.defaultAlbum).trim()).slice(0, 80);
  const requestedPageSize = Number(payload.pageSize) || current.pageSize;
  const pageSize = PHOTO_PAGE_SIZE_OPTIONS.includes(requestedPageSize) ? requestedPageSize : current.pageSize;
  await env.PHOTOS_DB
    .prepare('UPDATE photo_settings SET max_long_edge = ?, jpeg_quality = ?, default_year = ?, default_album = ?, page_size = ? WHERE id = 1')
    .bind(maxLongEdge, jpegQuality, defaultYear, defaultAlbum, pageSize)
    .run();
  return json({ maxLongEdge, jpegQuality, defaultYear, defaultAlbum, pageSize });
}

async function handlePhotosList(env: Env, includeHidden = false): Promise<Response> {
  await ensurePhotoTables(env);
  const result = await env.PHOTOS_DB
    .prepare(
      `SELECT * FROM photos
       ${includeHidden ? '' : 'WHERE hidden = 0'}
       ORDER BY sort_order DESC, created_at DESC`
    )
    .all<PhotoRow>();
  return json({ photos: (result.results || []).map(mapPhoto) });
}

async function handlePhotoObject(env: Env, key: string): Promise<Response> {
  const object = await env.CHURCH_PHOTOS_BUCKET.get(key);
  if (!object) {
    return notFound('Photo not found');
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}

async function handlePhotoUpload(request: Request, env: Env): Promise<Response> {
  await ensurePhotoTables(env);
  const formData = await request.formData();
  const file = formData.get('file');
  if (!isUploadBlob(file)) {
    return badRequest('Missing upload file');
  }

  const uploaderId = String(formData.get('uploaderId') || '').trim();
  if (!/^[a-zA-Z0-9_-]{16,120}$/.test(uploaderId)) {
    return badRequest('Missing uploader identity');
  }

  const originalName = file instanceof File ? file.name : 'photo.jpg';
  const extension = sanitizeFileName(originalName).split('.').pop() || 'jpg';
  const title = String(formData.get('title') || '').trim() || sanitizeFileName(originalName).replace(/\.[^.]+$/, '');
  const collection = String(formData.get('collection') || '').trim();
  const album = String(formData.get('album') || '').trim();
  const uploaderName = String(formData.get('uploaderName') || '').trim().slice(0, 80);

  // Client-supplied (canvas) metadata — best-effort, parsed defensively.
  const toInt = (value: FormDataEntryValue | null): number | null => {
    const n = Number(String(value ?? '').trim());
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const toText = (value: FormDataEntryValue | null): string | null => {
    const s = String(value ?? '').trim();
    return s ? s.slice(0, 200) : null;
  };
  const width = toInt(formData.get('width'));
  const height = toInt(formData.get('height'));
  const shotAt = toText(formData.get('shotAt'));
  const camera = toText(formData.get('camera'));
  const lens = toText(formData.get('lens'));
  const focalLength = toText(formData.get('focalLength'));
  const aperture = toText(formData.get('aperture'));
  const shutter = toText(formData.get('shutter'));
  const iso = toInt(formData.get('iso'));

  const baseName = `${Date.now()}-${sanitizeObjectSegment(originalName).replace(/\.[^.]+$/, '')}`;
  const collectionSeg = sanitizeObjectSegment(collection || 'all');
  const albumSeg = sanitizeObjectSegment(album || 'general');
  const objectKey = ['photos', collectionSeg, albumSeg, `${baseName}.${extension}`].join('/');
  const buffer = await file.arrayBuffer();

  await env.CHURCH_PHOTOS_BUCKET.put(objectKey, buffer, {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  });

  // Optional client-generated thumbnail.
  const thumb = formData.get('thumb');
  let thumbObjectKey: string | null = null;
  let thumbSrc: string | null = null;
  if (isUploadBlob(thumb)) {
    thumbObjectKey = ['photos', 'thumbs', collectionSeg, albumSeg, `${baseName}.jpg`].join('/');
    await env.CHURCH_PHOTOS_BUCKET.put(thumbObjectKey, await thumb.arrayBuffer(), {
      httpMetadata: { contentType: thumb.type || 'image/jpeg' },
    });
    thumbSrc = `/api/photos/media/${thumbObjectKey}`;
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const src = `/api/photos/media/${objectKey}`;
  await env.PHOTOS_DB.prepare(
    `INSERT INTO photos (
      id, object_key, src, title, collection, album, size_bytes, width, height,
      shot_at, camera, lens, focal_length, aperture, shutter, iso,
      thumb_object_key, thumb_src,
      uploader_id, uploader_name, sort_order, hidden, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).bind(
    id,
    objectKey,
    src,
    title,
    collection,
    album,
    buffer.byteLength,
    width,
    height,
    shotAt,
    camera,
    lens,
    focalLength,
    aperture,
    shutter,
    iso,
    thumbObjectKey,
    thumbSrc,
    uploaderId,
    uploaderName,
    now,
    now,
    now
  ).run();

  const row = await env.PHOTOS_DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first<PhotoRow>();
  return json({ photo: row ? mapPhoto(row) : null }, 201);
}

async function handleOwnPhotoDelete(request: Request, env: Env, id: string): Promise<Response> {
  await ensurePhotoTables(env);
  const payload = await readJson<{ uploaderId?: string }>(request);
  const uploaderId = String(payload.uploaderId || '').trim();
  if (!uploaderId) return unauthorized('Uploader identity required');

  const row = await env.PHOTOS_DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first<PhotoRow>();
  if (!row) return notFound('Photo not found');
  if (row.uploader_id !== uploaderId) {
    return forbidden('You can only delete photos uploaded from this device.');
  }

  await env.CHURCH_PHOTOS_BUCKET.delete(row.object_key);
  if (row.thumb_object_key) await env.CHURCH_PHOTOS_BUCKET.delete(row.thumb_object_key);
  await env.PHOTOS_DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function handleOwnPhotoUpdate(request: Request, env: Env, id: string): Promise<Response> {
  await ensurePhotoTables(env);
  const payload = await readJson<Partial<{ uploaderId: string; title: string; collection: string; album: string; uploaderName: string }>>(request);
  const uploaderId = String(payload.uploaderId || '').trim();
  if (!uploaderId) return unauthorized('Uploader identity required');

  const row = await env.PHOTOS_DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first<PhotoRow>();
  if (!row) return notFound('Photo not found');
  if (row.uploader_id !== uploaderId) {
    return forbidden('You can only update photos uploaded from this device.');
  }

  await env.PHOTOS_DB.prepare(
    `UPDATE photos SET title = ?, collection = ?, album = ?, uploader_name = ?, updated_at = ? WHERE id = ?`
  ).bind(
    payload.title ?? row.title,
    payload.collection ?? row.collection,
    payload.album ?? row.album,
    payload.uploaderName !== undefined ? String(payload.uploaderName).trim().slice(0, 80) : (row.uploader_name ?? ''),
    Date.now(),
    id
  ).run();

  const next = await env.PHOTOS_DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first<PhotoRow>();
  return json({ photo: next ? mapPhoto(next) : null });
}

async function handlePhotoUpdate(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;

  await ensurePhotoTables(env);
  const payload = await readJson<Partial<{ title: string; collection: string; album: string; hidden: boolean; sortOrder: number; uploaderName: string }>>(request);
  const existing = await env.PHOTOS_DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first<PhotoRow>();
  if (!existing) return notFound('Photo not found');

  await env.PHOTOS_DB.prepare(
    `UPDATE photos SET
      title = ?, collection = ?, album = ?, uploader_name = ?, hidden = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    payload.title ?? existing.title,
    payload.collection ?? existing.collection,
    payload.album ?? existing.album,
    payload.uploaderName !== undefined ? String(payload.uploaderName).trim().slice(0, 80) : (existing.uploader_name ?? ''),
    typeof payload.hidden === 'boolean' ? (payload.hidden ? 1 : 0) : existing.hidden,
    typeof payload.sortOrder === 'number' ? payload.sortOrder : existing.sort_order,
    Date.now(),
    id
  ).run();

  const row = await env.PHOTOS_DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first<PhotoRow>();
  return json({ photo: row ? mapPhoto(row) : null });
}

async function handlePhotoDelete(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;

  await ensurePhotoTables(env);
  const row = await env.PHOTOS_DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first<PhotoRow>();
  if (!row) return notFound('Photo not found');
  await env.CHURCH_PHOTOS_BUCKET.delete(row.object_key);
  if (row.thumb_object_key) await env.CHURCH_PHOTOS_BUCKET.delete(row.thumb_object_key);
  await env.PHOTOS_DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();
  return json({ ok: true });
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
  youtube_viewers?: number | null;
  youtube_peak?: number | null;
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
  return { id: 1, is_live: 0, video_id: null, started_at: null, checked_at: 0, last_error: null, youtube_peak: null };
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

type LatestSermon = { id: string; titleEn: string; titleZh: string; videoId: string; date: string };

async function getLatestSermons(env: Env, limit = 4): Promise<LatestSermon[]> {
  const result = await env.DB
    .prepare("SELECT id, title_en, title_zh, youtube_id, date FROM sermons WHERE type = 'sermon' AND COALESCE(hidden, 0) = 0 ORDER BY date DESC LIMIT ?")
    .bind(limit)
    .all<{ id: string; title_en: string; title_zh: string; youtube_id: string; date: string }>();
  return (result.results || []).map(row => ({
    id: row.id,
    titleEn: row.title_en,
    titleZh: row.title_zh,
    videoId: row.youtube_id,
    date: row.date,
  }));
}

async function updateLiveStreamState(
  env: Env,
  patch: Partial<{ is_live: number; video_id: string | null; started_at: number | null; checked_at: number; last_error: string | null; youtube_viewers: number | null; youtube_peak: number | null }>
): Promise<void> {
  const current = await getLiveStreamStateRow(env);
  const next = { ...current, ...patch };
  await env.DB
    .prepare(
      `UPDATE live_stream_state
       SET is_live = ?, video_id = ?, started_at = ?, checked_at = ?, last_error = ?, youtube_viewers = ?, youtube_peak = ?
       WHERE id = 1`
    )
    .bind(next.is_live, next.video_id, next.started_at, next.checked_at, next.last_error, (next as any).youtube_viewers ?? null, (next as any).youtube_peak ?? null)
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

// 24h-before-next-service 自動清除 manual_video_id：
// 直播結束後 archive 把 just-ended video 寫進 manual_video_id 作為「上次直播回放」。
// 下次直播即將開始（24h 內）就清掉它，讓真正的直播偵測可以恢復。
async function clearExpiredManualOverride(env: Env, config: LiveStreamConfigRow): Promise<LiveStreamConfigRow> {
  if (!config.manual_video_id) return config;
  const nextIso = nextServiceIso(config, new Date());
  if (!nextIso) return config;
  const nextMs = new Date(nextIso).getTime();
  const HOURS_24 = 24 * 60 * 60 * 1000;
  if (nextMs - Date.now() > HOURS_24) return config;
  try {
    await env.DB.prepare('UPDATE live_stream_config SET manual_video_id = ?, updated_at = ? WHERE id = 1')
      .bind('', Date.now()).run();
    return await getLiveStreamConfigRow(env);
  } catch {
    return config;
  }
}

async function runProbeIfDue(env: Env, force: boolean): Promise<LiveStreamStateRow> {
  let config = await getLiveStreamConfigRow(env);
  // 進入直播窗口前 24h，把回放期的 manual override 清掉，讓自動偵測能跑
  config = await clearExpiredManualOverride(env, config);
  if (!force) {
    if (!config.enabled || config.manual_video_id) {
      return getLiveStreamStateRow(env);
    }
    if (!withinServiceWindow(config, new Date())) {
      // 即使在窗口外，仍然檢查是否有待歸檔的視頻（直播窗口剛結束、VOD 還在處理中）
      const prev = await getLiveStreamStateRow(env);
      if (prev.video_id && !prev.is_live) {
        await tryArchiveAndNotify(env, config, prev.video_id);
      }
      return getLiveStreamStateRow(env);
    }
  }
  const result = await probeYouTubeLive(config);
  const prev = await getLiveStreamStateRow(env);

  // #2 修复:search.list 间歇性返回空。上次在直播、本次为空时,用 liveStreamingDetails
  // 的 actualEndTime 确认是否真结束;未结束则视为瞬时漏检,保留 is_live / started_at / video_id。
  if (!result.videoId && prev.is_live === 1 && prev.video_id) {
    const details = await fetchLiveStreamingDetails(config.api_key, prev.video_id);
    if (!details.actualEndTime) {
      const peak = nextPeak((prev as any).youtube_peak ?? null, details.concurrentViewers);
      await updateLiveStreamState(env, {
        checked_at: Date.now(),
        last_error: result.error,
        youtube_viewers: details.concurrentViewers,
        youtube_peak: peak,
      });
      await cleanupLiveData(env);
      return getLiveStreamStateRow(env);
    }
  }

  // 邊沿檢測：justEnded 已经过上面的 actualEndTime 确认
  const justEnded = prev.is_live === 1 && prev.video_id && !result.videoId;
  const pendingArchive = !prev.is_live && prev.video_id && !result.videoId;
  const videoIdToArchive = justEnded || pendingArchive ? prev.video_id : null;

  // 寫狀態：is_live 跟最新探測；如果 videoIdToArchive 還在處理中，video_id 保留它直到歸檔成功
  const newVideoId = result.videoId ?? videoIdToArchive ?? null;
  const isNewVideo = !!result.videoId && prev.video_id !== result.videoId;
  const startedAt = result.videoId
    ? (prev.video_id === result.videoId && prev.started_at ? prev.started_at : Date.now())
    : null;
  await updateLiveStreamState(env, {
    is_live: result.videoId ? 1 : 0,
    video_id: newVideoId,
    started_at: startedAt,
    checked_at: Date.now(),
    last_error: result.error,
    ...(isNewVideo ? { youtube_peak: 0 } : {}),
  });

  if (videoIdToArchive) {
    await tryArchiveAndNotify(env, config, videoIdToArchive);
  }

  // 直播中:拉并发,更新峰值(新视频从 0 起算)
  if (result.videoId && config.api_key) {
    try {
      const details = await fetchLiveStreamingDetails(config.api_key, result.videoId);
      const basePeak = isNewVideo ? 0 : ((prev as any).youtube_peak ?? null);
      const peak = nextPeak(basePeak, details.concurrentViewers);
      await updateLiveStreamState(env, { youtube_viewers: details.concurrentViewers, youtube_peak: peak });
    } catch { /* ignore */ }
  } else if (!result.videoId) {
    // 非直播狀態：清零，避免顯示陳舊數字
    try { await updateLiveStreamState(env, { youtube_viewers: null }); } catch { /* ignore */ }
  }

  // 順手清理過期 viewer / 老舊 chat
  await cleanupLiveData(env);

  return getLiveStreamStateRow(env);
}

type YouTubeVideoSnippet = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      publishedAt?: string;
      thumbnails?: { high?: { url?: string }; maxres?: { url?: string } };
      liveBroadcastContent?: 'none' | 'live' | 'upcoming';
    };
  }>;
  error?: { message?: string };
};

async function fetchYouTubeVideoSnippet(apiKey: string, videoId: string): Promise<{ snippet: YouTubeVideoSnippet['items'][number]['snippet'] | null; error: string | null }> {
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('id', videoId);
    url.searchParams.set('key', apiKey);
    const response = await fetch(url.toString());
    const data = await response.json<YouTubeVideoSnippet>();
    if (!response.ok || data.error) {
      return { snippet: null, error: data.error?.message ?? `HTTP ${response.status}` };
    }
    return { snippet: data.items?.[0]?.snippet ?? null, error: null };
  } catch (err) {
    return { snippet: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function tryArchiveAndNotify(env: Env, config: LiveStreamConfigRow, videoId: string): Promise<void> {
  try {
    await ensureLiveStatsSchema(env);
    const stateForSnapshot = await getLiveStreamStateRow(env);
    const websiteUnique = await countWebsiteUnique(env, videoId);
    const onlineTotal = websiteUnique + Number((stateForSnapshot as any).youtube_peak ?? 0);
    let archivedViewCount: number | null = null;
    let archivedDuration: number | null = null;
    if (config.api_key) {
      const vm = (await fetchVideoMetadata(config.api_key, [videoId])).get(videoId);
      if (vm) { archivedViewCount = vm.viewCount; archivedDuration = vm.durationSeconds; }
    }

    // 已存在（多半是每日同步先把這支影片從 Uploads 匯入了）→ 認領為 live-broadcast，
    // 確保它出現在歷史直播區，並設為回放影片，寫入在线/播放数快照,然後清除 pending 狀態。
    const exists = await env.DB.prepare("SELECT id, category FROM sermons WHERE youtube_id = ? LIMIT 1")
      .bind(videoId).first<{ id: string; category: string }>();
    if (exists) {
      const sets: string[] = ['live_online_total = ?'];
      const binds: unknown[] = [onlineTotal];
      if (exists.category !== 'live-broadcast') {
        await ensureCategoryColumn(env);
        sets.push("category = 'live-broadcast'");
      }
      if (archivedViewCount != null) { sets.push('view_count = ?'); binds.push(archivedViewCount); }
      sets.push('updated_at = ?'); binds.push(new Date().toISOString());
      binds.push(exists.id);
      await env.DB.prepare(`UPDATE sermons SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      try {
        await env.DB.prepare('UPDATE live_stream_config SET manual_video_id = ?, updated_at = ? WHERE id = 1')
          .bind(videoId, Date.now()).run();
      } catch { /* ignore */ }
      await updateLiveStreamState(env, { is_live: 0, video_id: null, started_at: null, checked_at: Date.now(), last_error: null });
      await env.DB.prepare('DELETE FROM live_session_seen WHERE video_id = ?').bind(videoId).run();
      return;
    }

    if (!config.api_key) return;
    const { snippet, error } = await fetchYouTubeVideoSnippet(config.api_key, videoId);
    if (error || !snippet) return;

    // VOD 還沒處理完 → 下次 cron 再試
    if (snippet.liveBroadcastContent && snippet.liveBroadcastContent !== 'none') return;

    const today = new Date().toISOString().slice(0, 10);
    const sermonId = crypto.randomUUID();
    const titleZh = `${today} 主日直播`;
    const titleEn = `Sunday Live - ${today}`;
    const speakerEn = 'Pastor Andy Yu';
    const speakerZh = '余大器 牧師';
    const imageUrl = snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || null;
    const nowIso = new Date().toISOString();

    await ensureCategoryColumn(env);
    // OR IGNORE：若同步在我們查重後、插入前剛好併發插入了同一支影片（唯一索引），
    // 不報錯、不破壞 cron 主流程；隨後再認領分類。
    const insertRes = await env.DB
      .prepare(
        `INSERT OR IGNORE INTO sermons (id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, type, category, duration_seconds, view_count, live_online_total, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sermon', 'live-broadcast', ?, ?, ?, ?, ?)`
      )
      .bind(sermonId, titleEn, titleZh, speakerEn, speakerZh, today, '', '', '', '', videoId, imageUrl, archivedDuration, archivedViewCount, onlineTotal, nowIso, nowIso)
      .run();
    const didInsert = (insertRes.meta?.changes ?? 0) > 0;
    if (!didInsert) {
      // 併發競態：那行已被同步插入 → 認領為 live-broadcast，並寫入快照,保證進入歷史直播區。
      await env.DB.prepare("UPDATE sermons SET category = 'live-broadcast', live_online_total = ?, updated_at = ? WHERE youtube_id = ? AND category <> 'live-broadcast'")
        .bind(onlineTotal, nowIso, videoId).run();
    }

    // 歸檔成功 → 清除 pending video_id
    await updateLiveStreamState(env, { is_live: 0, video_id: null, started_at: null, checked_at: Date.now(), last_error: null });

    // 把剛結束的直播設為 manual_video_id —— /live 頁繼續放它當「上次直播回放」，
    // 直到下次直播前 24h 自動清除（見 clearExpiredManualOverride）
    try {
      await env.DB.prepare('UPDATE live_stream_config SET manual_video_id = ?, updated_at = ? WHERE id = 1')
        .bind(videoId, Date.now()).run();
    } catch { /* ignore */ }

    // 通知 admin（只在我們真正新建了 sermon 時；認領既有行不重複發信）
    if (didInsert) {
      await sendLiveStreamArchiveNotification(env, { sermonId, titleZh, titleEn, videoId, date: today });
    }

    // 歸檔完成 → 清掉這場直播的 seen 記錄
    await env.DB.prepare('DELETE FROM live_session_seen WHERE video_id = ?').bind(videoId).run();
  } catch (err) {
    // 不影響 cron 主流程
    console.error('Archive sermon failed', err);
  }
}

async function sendLiveStreamArchiveNotification(env: Env, sermon: { sermonId: string; titleZh: string; titleEn: string; videoId: string; date: string }): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  const adminEmail = 'Admin@Bolccop.org';
  const from = 'Bread of Life Christian Church <admin@bolccop.org>';
  const subject = `[BOLCCOP] 主日直播已自動歸檔: ${sermon.date}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#172033;max-width:520px;">
  <h2 style="margin:0 0 12px 0;">主日直播自動歸檔</h2>
  <p style="margin:0 0 8px;">系統剛偵測到一場主日直播結束，已自動建立 sermon 條目並列在「主日崇拜」頁面。</p>
  <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;border:1px solid #ddd;margin:8px 0 16px;">
    <tr><td style="background:#f5f5f5;font-weight:bold;">標題（中）</td><td>${escapeHtmlForChurch(sermon.titleZh)}</td></tr>
    <tr><td style="background:#f5f5f5;font-weight:bold;">Title (EN)</td><td>${escapeHtmlForChurch(sermon.titleEn)}</td></tr>
    <tr><td style="background:#f5f5f5;font-weight:bold;">日期</td><td>${escapeHtmlForChurch(sermon.date)}</td></tr>
    <tr><td style="background:#f5f5f5;font-weight:bold;">講員</td><td>Pastor Andy Yu / 余大器 牧師</td></tr>
    <tr><td style="background:#f5f5f5;font-weight:bold;">YouTube</td><td><a href="https://youtu.be/${sermon.videoId}">https://youtu.be/${sermon.videoId}</a></td></tr>
  </table>
  <p style="margin:0 0 8px;">如需修改標題、講員或經文，請到 <a href="https://www.bolccop.org/admin">後台管理 → Sermons</a> 編輯。</p>
  <p style="margin:14px 0 0;color:#888;font-size:12px;">此郵件由 BOLCCOP 系統自動發送。</p>
</div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: adminEmail, subject, html })
    });
    if (!response.ok) {
      console.error('Archive notification email failed', response.status, await response.text());
    }
  } catch (err) {
    console.error('Archive notification email threw', err);
  }
}

// ============================================================================
// 每日同步：頻道 Uploads playlist → sermons 表
// ============================================================================

// YouTube 頻道 ID（UC...）對應的「Uploads」自動 playlist ID 規則：
// UC + xxxxxxxxxxxxxxxxxxxxxx  →  UU + xxxxxxxxxxxxxxxxxxxxxx
function getUploadsPlaylistId(channelId: string | null | undefined): string | null {
  if (!channelId || channelId.length < 3) return null;
  if (!channelId.startsWith('UC')) return null;
  return 'UU' + channelId.slice(2);
}

// 主日崇拜的標題前面加上 "YYYY-MM-DD " 上傳日期前綴；冪等（如果已經有日期前綴就不重複加）
function buildFinalTitle(originalTitle: string, dateIso: string, entryType: 'sermon' | 'daily-manna'): string {
  if (entryType !== 'sermon') return originalTitle;
  if (/^\d{4}-\d{2}-\d{2}/.test(originalTitle)) return originalTitle;
  return `${dateIso} ${originalTitle}`.trim();
}

type YouTubePlaylistItemsResponse = {
  items?: Array<{
    contentDetails?: { videoId?: string; videoPublishedAt?: string };
    snippet?: {
      title?: string;
      publishedAt?: string;
      thumbnails?: { high?: { url?: string }; default?: { url?: string }; maxres?: { url?: string } };
      resourceId?: { videoId?: string };
    };
  }>;
  nextPageToken?: string;
  error?: { message?: string };
};

type SyncResult = {
  inserted: number; updated: number; skipped: number;
  errors: string[]; pages: number; hasMore: boolean; category: SyncTarget;
};

async function ensureSyncCursorTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sync_cursors (
      category TEXT PRIMARY KEY,
      page_token TEXT,
      updated_at TEXT NOT NULL
    )`
  ).run();
}

async function ensureSyncChannelsTable(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sync_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      api_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();
}

interface SyncChannelRow {
  id: string;
  name: string;
  channel_id: string;
  api_key: string;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function syncChannelRowToAdmin(row: SyncChannelRow) {
  return {
    id: row.id,
    name: row.name,
    channelId: row.channel_id,
    apiKeyMasked: maskApiKey(row.api_key),
    apiKeyPresent: Boolean(row.api_key),
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

async function readSyncCursor(env: Env, category: SyncTarget): Promise<string | null> {
  try {
    await ensureSyncCursorTable(env);
    const row = await env.DB.prepare('SELECT page_token FROM sync_cursors WHERE category = ?').bind(category).first<{ page_token: string | null }>();
    return row?.page_token || null;
  } catch { return null; }
}

async function writeSyncCursor(env: Env, category: SyncTarget, pageToken: string | null): Promise<void> {
  try {
    await ensureSyncCursorTable(env);
    const now = new Date().toISOString();
    if (pageToken) {
      await env.DB.prepare(
        `INSERT INTO sync_cursors (category, page_token, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(category) DO UPDATE SET page_token = excluded.page_token, updated_at = excluded.updated_at`
      ).bind(category, pageToken, now).run();
    } else {
      await env.DB.prepare('DELETE FROM sync_cursors WHERE category = ?').bind(category).run();
    }
  } catch { /* ignore */ }
}

// 从现有 D1 已分类数据构建一次学习模型（供整次同步复用）
async function buildClassifierFromDb(env: Env): Promise<ClassifierModel> {
  const rows: TrainingRow[] = [];
  try {
    await ensureCategoryColumn(env);
    const sermonRes = await env.DB
      .prepare(`SELECT title_zh, title_en, category FROM sermons WHERE hidden = 0`)
      .all<{ title_zh: string; title_en: string; category: string }>();
    for (const r of sermonRes.results || []) {
      const cat = (r.category || 'sunday-worship') as TrainingRow['category'];
      if (r.title_zh) rows.push({ title: r.title_zh, category: cat });
      if (r.title_en && r.title_en !== r.title_zh) rows.push({ title: r.title_en, category: cat });
    }
  } catch { /* 没有 category 列等情况：模型为空，退回硬编码兜底 */ }
  try {
    const mannaRes = await env.DB
      .prepare(`SELECT title_zh FROM daily_manna WHERE hidden = 0`)
      .all<{ title_zh: string }>();
    for (const r of mannaRes.results || []) {
      if (r.title_zh) rows.push({ title: r.title_zh, category: 'daily-manna' });
    }
  } catch { /* ignore */ }
  return buildClassifier(rows);
}

async function syncChannelUploads(
  env: Env,
  opts: { channel: { channelId: string; apiKey: string }; target?: SyncTarget; model?: ClassifierModel }
): Promise<SyncResult> {
  const target: SyncTarget = opts.target || 'all';
  const result: SyncResult = { inserted: 0, updated: 0, skipped: 0, errors: [], pages: 0, hasMore: false, category: target };

  // 一次性清理：早期 sync 把每日天言误存到 sermons 表（type='daily-manna'）→ 搬回 daily_manna。冪等。
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO daily_manna
        (id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, created_at, updated_at)
        SELECT id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, created_at, updated_at
        FROM sermons WHERE type = 'daily-manna'`),
      env.DB.prepare(`DELETE FROM sermons WHERE type = 'daily-manna'`),
    ]);
  } catch (err) {
    result.errors.push(`cleanup misplaced: ${err instanceof Error ? err.message : String(err)}`);
  }

  const channelId = (opts.channel.channelId || '').trim();
  const apiKey = (opts.channel.apiKey || '').trim();
  if (!apiKey || !channelId) {
    result.errors.push('channel_id 或 api_key 未設定');
    return result;
  }
  const playlistId = getUploadsPlaylistId(channelId);
  if (!playlistId) {
    result.errors.push('channel_id 不是 UC 開頭，無法推斷 Uploads playlist');
    return result;
  }

  const model = opts.model || await buildClassifierFromDb(env);

  let pageToken: string | undefined = undefined;
  const MAX_PAGES = 5;
  let reachedExistingContent = false;
  for (let i = 0; i < MAX_PAGES; i++) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    let data: YouTubePlaylistItemsResponse;
    try {
      const response = await fetch(url.toString());
      data = await response.json<YouTubePlaylistItemsResponse>();
      if (!response.ok || data.error) {
        result.errors.push(data.error?.message ?? `HTTP ${response.status}`);
        break;
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
      break;
    }
    result.pages++;

    type ItemMeta = {
      videoId: string; date: string; entryType: 'sermon' | 'daily-manna';
      finalTitle: string; category: SermonCategoryDb; imageUrl: string | null;
    };
    const metas: ItemMeta[] = [];
    for (const item of data.items || []) {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (!videoId) continue;
      const rawTitle = item.snippet?.title || `Upload ${videoId}`;
      const publishedAt = item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || new Date().toISOString();
      const date = publishedAt.slice(0, 10);
      const entryType = inferEntryTypeFromTitle(rawTitle);
      const finalTitle = buildFinalTitle(rawTitle, date, entryType);
      const category = classifySermonCategory(model, finalTitle);
      // 按目标过滤：只处理命中目标的条目
      if (!matchesTarget(entryType, category, target)) continue;
      const thumbnails = item.snippet?.thumbnails;
      const imageUrl = thumbnails?.maxres?.url || thumbnails?.high?.url || thumbnails?.default?.url || null;
      metas.push({ videoId, date, entryType, finalTitle, category, imageUrl });
    }

    if (metas.length === 0) {
      pageToken = data.nextPageToken;
      if (!pageToken) break;
      continue;
    }

    const sermonMetas = metas.filter(m => m.entryType === 'sermon');
    const mannaMetas = metas.filter(m => m.entryType === 'daily-manna');
    const existingSermons = new Set<string>();
    const existingManna = new Set<string>();

    if (sermonMetas.length > 0) {
      const ph = sermonMetas.map(() => '?').join(',');
      try {
        const res = await env.DB.prepare(`SELECT youtube_id FROM sermons WHERE youtube_id IN (${ph})`)
          .bind(...sermonMetas.map(m => m.videoId)).all<{ youtube_id: string }>();
        for (const r of res.results || []) existingSermons.add(r.youtube_id);
      } catch (err) {
        result.errors.push(`select sermons page ${result.pages}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (mannaMetas.length > 0) {
      const ph = mannaMetas.map(() => '?').join(',');
      try {
        const res = await env.DB.prepare(`SELECT youtube_id FROM daily_manna WHERE youtube_id IN (${ph})`)
          .bind(...mannaMetas.map(m => m.videoId)).all<{ youtube_id: string }>();
        for (const r of res.results || []) existingManna.add(r.youtube_id);
      } catch (err) {
        result.errors.push(`select daily_manna page ${result.pages}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const nowIso = new Date().toISOString();
    const newMetas: ItemMeta[] = [];
    let plannedSkips = 0;
    for (const meta of metas) {
      const isExisting = meta.entryType === 'sermon'
        ? existingSermons.has(meta.videoId)
        : existingManna.has(meta.videoId);
      if (isExisting) { reachedExistingContent = true; plannedSkips++; break; }
      newMetas.push(meta);
    }

    const videoMetaMap = newMetas.length > 0
      ? await fetchVideoMetadata(apiKey, newMetas.map(m => m.videoId))
      : new Map<string, VideoMeta>();

    const stmts: D1PreparedStatement[] = [];
    let plannedInserts = 0;
    for (const meta of newMetas) {
      const vm = videoMetaMap.get(meta.videoId);
      const duration = vm?.durationSeconds ?? null;
      const views = vm?.viewCount ?? null;
      if (meta.entryType === 'sermon') {
        stmts.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO sermons (id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, type, category, duration_seconds, view_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sermon', ?, ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(), meta.finalTitle, meta.finalTitle,
            'Pastor Andy Yu', '余大器 牧師', meta.date, '', '', '', '',
            meta.videoId, meta.imageUrl, meta.category, duration, views, nowIso, nowIso
          )
        );
      } else {
        stmts.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO daily_manna (id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, duration_seconds, view_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(), meta.finalTitle, meta.finalTitle,
            'Pastor Andy Yu', '余大器 牧師', meta.date, '', '', '', '',
            meta.videoId, meta.imageUrl, duration, views, nowIso, nowIso
          )
        );
      }
      plannedInserts++;
    }

    if (stmts.length > 0) {
      try {
        const batchRes = await env.DB.batch(stmts);
        // OR IGNORE 下，併發競態可能讓部分行被跳過 → 以實際 changes 計數，未變動的計入 skipped。
        const actuallyInserted = batchRes.reduce((sum, r) => sum + (r.meta?.changes ?? 0), 0);
        result.inserted += actuallyInserted;
        result.skipped += plannedSkips + (plannedInserts - actuallyInserted);
      } catch (err) {
        result.errors.push(`batch page ${result.pages}: ${err instanceof Error ? err.message : String(err)}`);
        result.skipped += metas.length;
      }
    } else {
      result.skipped += plannedSkips;
    }

    if (reachedExistingContent) break;
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  if (!reachedExistingContent && pageToken) result.hasMore = true;
  return result;
}

// 遍历所有启用频道，逐个同步指定目标，累加结果
async function syncAllChannels(env: Env, opts?: { target?: SyncTarget }): Promise<SyncResult> {
  const target: SyncTarget = opts?.target || 'all';
  const total: SyncResult = { inserted: 0, updated: 0, skipped: 0, errors: [], pages: 0, hasMore: false, category: target };
  await ensureSyncChannelsTable(env);
  const channels = await env.DB
    .prepare('SELECT * FROM sync_channels WHERE enabled = 1 ORDER BY sort_order ASC')
    .all<SyncChannelRow>();
  const model = await buildClassifierFromDb(env);
  for (const ch of channels.results || []) {
    const r = await syncChannelUploads(env, { channel: { channelId: ch.channel_id, apiKey: ch.api_key }, target, model });
    total.inserted += r.inserted;
    total.updated += r.updated;
    total.skipped += r.skipped;
    total.pages += r.pages;
    total.hasMore = total.hasMore || r.hasMore;
    for (const e of r.errors) total.errors.push(`[${ch.name}] ${e}`);
  }
  return total;
}

async function sendUploadsSyncNotification(env: Env, result: SyncResult): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  if (result.inserted === 0 && result.updated === 0 && result.errors.length === 0) return; // 沒新東西，不打擾
  const adminEmail = 'Admin@Bolccop.org';
  const from = 'Bread of Life Christian Church <admin@bolccop.org>';
  const subject = `[BOLCCOP] YouTube 同步：新增 ${result.inserted} 條 · 更新 ${result.updated} 條`;
  const errBlock = result.errors.length ? `<p style="color:#c0392b;margin:8px 0;">錯誤：${result.errors.slice(0, 5).map(escapeHtmlForChurch).join('<br/>')}</p>` : '';
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#172033;max-width:520px;">
  <h2 style="margin:0 0 12px 0;">每日 YouTube 同步</h2>
  <p style="margin:0 0 8px;">新增 <strong>${result.inserted}</strong> 條，更新 ${result.updated} 條（重新分類或重命名），跳過 ${result.skipped} 條，掃描 ${result.pages} 頁。</p>
  ${errBlock}
  <p style="margin:8px 0;">請到 <a href="https://www.bolccop.org/admin">後台管理 → Sermons</a> 補上標題、講員、經文等資料。</p>
  <p style="margin:14px 0 0;color:#888;font-size:12px;">此郵件由 BOLCCOP 系統自動發送。</p>
</div>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: adminEmail, subject, html })
    });
  } catch { /* ignore */ }
}

function escapeHtmlForChurch(value: string): string {
  return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

// ============================================================================
// Live chat & viewers helpers
// ============================================================================

const VIEWER_ACTIVE_MS = 60_000;
const CHAT_RATE_LIMIT_MS = 2_000;
const CHAT_MAX_LENGTH = 500;
const CHAT_HISTORY_LIMIT = 100;
const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function ensureLiveChatTables(env: Env): Promise<void> {
  // Runtime fallback if migration not applied yet — keeps endpoints from crashing
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS live_viewers (
      session_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      guest_number INTEGER,
      last_ping_at INTEGER NOT NULL,
      video_id TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0
    )`
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS live_chat_messages (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      ip_hash TEXT,
      deleted_at INTEGER
    )`
  ).run();
}

function resolveActiveVideoId(config: LiveStreamConfigRow, state: LiveStreamStateRow): string | null {
  if (config.manual_video_id) return config.manual_video_id;
  if (state.is_live && state.video_id) return state.video_id;
  return null;
}

async function joinViewer(
  env: Env,
  params: { sessionId: string; videoId: string; name?: string; asGuest?: boolean; existingDisplayName?: string; isAdmin?: boolean }
): Promise<{ displayName: string; guestNumber: number | null; isAdmin: boolean }> {
  const now = Date.now();
  await recordSessionSeen(env, params.videoId, params.sessionId);
  const existing = await env.DB
    .prepare('SELECT display_name, guest_number, is_admin, video_id FROM live_viewers WHERE session_id = ?')
    .bind(params.sessionId)
    .first<{ display_name: string; guest_number: number | null; is_admin: number; video_id: string }>();
  if (existing && existing.video_id === params.videoId) {
    await env.DB.prepare('UPDATE live_viewers SET last_ping_at = ? WHERE session_id = ?').bind(now, params.sessionId).run();
    return {
      displayName: existing.display_name,
      guestNumber: existing.guest_number,
      isAdmin: Boolean(existing.is_admin) || Boolean(params.isAdmin),
    };
  }
  // Either no row yet, or sessionId belonged to an older videoId → re-issue identity for current video
  let displayName: string;
  let guestNumber: number | null = null;
  const cleanName = (params.name ?? '').trim().slice(0, 30);
  const cleanExisting = (params.existingDisplayName ?? '').trim().slice(0, 30);
  if (cleanName) {
    displayName = cleanName;
  } else if (cleanExisting) {
    // Returning visitor whose localStorage retains previous identity (could be guest# or real name)
    displayName = cleanExisting;
    const m = cleanExisting.match(/^游客(\d+)$/);
    if (m) guestNumber = Number(m[1]);
  } else if (params.asGuest) {
    const row = await env.DB
      .prepare('SELECT COALESCE(MAX(guest_number), 0) AS m FROM live_viewers WHERE video_id = ?')
      .bind(params.videoId)
      .first<{ m: number }>();
    const next = Number(row?.m || 0) + 1;
    guestNumber = next;
    displayName = `游客${next}`;
  } else {
    // No name and not explicit guest — treat as guest
    const row = await env.DB
      .prepare('SELECT COALESCE(MAX(guest_number), 0) AS m FROM live_viewers WHERE video_id = ?')
      .bind(params.videoId)
      .first<{ m: number }>();
    const next = Number(row?.m || 0) + 1;
    guestNumber = next;
    displayName = `游客${next}`;
  }
  if (existing) {
    await env.DB
      .prepare('UPDATE live_viewers SET display_name = ?, guest_number = ?, last_ping_at = ?, video_id = ?, joined_at = ?, is_admin = ? WHERE session_id = ?')
      .bind(displayName, guestNumber, now, params.videoId, now, params.isAdmin ? 1 : 0, params.sessionId)
      .run();
  } else {
    await env.DB
      .prepare('INSERT INTO live_viewers (session_id, display_name, guest_number, last_ping_at, video_id, joined_at, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(params.sessionId, displayName, guestNumber, now, params.videoId, now, params.isAdmin ? 1 : 0)
      .run();
  }
  return { displayName, guestNumber, isAdmin: Boolean(params.isAdmin) };
}

async function getViewerList(env: Env, videoId: string) {
  const result = await env.DB
    .prepare(
      `SELECT display_name, guest_number, is_admin FROM live_viewers
       WHERE video_id = ? AND last_ping_at > ?
       ORDER BY is_admin DESC, joined_at ASC`
    )
    .bind(videoId, Date.now() - VIEWER_ACTIVE_MS)
    .all<{ display_name: string; guest_number: number | null; is_admin: number }>();
  return (result.results || []).map(row => ({
    displayName: row.display_name,
    isAdmin: Boolean(row.is_admin),
    isGuest: row.guest_number != null,
    guestNumber: row.guest_number,
  }));
}

async function countViewersOnline(env: Env, videoId: string): Promise<number> {
  const row = await env.DB
    .prepare('SELECT COUNT(*) AS c FROM live_viewers WHERE video_id = ? AND last_ping_at > ?')
    .bind(videoId, Date.now() - VIEWER_ACTIVE_MS)
    .first<{ c: number }>();
  return Number(row?.c || 0);
}

async function recordSessionSeen(env: Env, videoId: string, sessionId: string): Promise<void> {
  try {
    await env.DB
      .prepare('INSERT OR IGNORE INTO live_session_seen (video_id, session_id, joined_at) VALUES (?, ?, ?)')
      .bind(videoId, sessionId, Date.now())
      .run();
  } catch { /* table may be missing pre-migration */ }
}

async function countWebsiteUnique(env: Env, videoId: string): Promise<number> {
  try {
    const row = await env.DB
      .prepare('SELECT COUNT(*) AS c FROM live_session_seen WHERE video_id = ?')
      .bind(videoId)
      .first<{ c: number }>();
    return Number(row?.c || 0);
  } catch {
    return 0;
  }
}

async function fetchLiveStreamingDetails(
  apiKey: string | null,
  videoId: string
): Promise<{ concurrentViewers: number | null; actualEndTime: string | null }> {
  if (!apiKey) return { concurrentViewers: null, actualEndTime: null };
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'liveStreamingDetails');
    url.searchParams.set('id', videoId);
    url.searchParams.set('key', apiKey);
    const response = await fetch(url.toString());
    if (!response.ok) return { concurrentViewers: null, actualEndTime: null };
    const data = await response.json<{
      items?: Array<{ liveStreamingDetails?: { concurrentViewers?: string; actualEndTime?: string } }>;
    }>();
    const d = data.items?.[0]?.liveStreamingDetails;
    const n = d?.concurrentViewers != null ? Number(d.concurrentViewers) : NaN;
    return {
      concurrentViewers: Number.isFinite(n) ? n : null,
      actualEndTime: d?.actualEndTime ?? null,
    };
  } catch {
    return { concurrentViewers: null, actualEndTime: null };
  }
}

async function cleanupLiveData(env: Env): Promise<void> {
  const viewerCutoff = Date.now() - 5 * 60_000; // 5 min
  const chatCutoff = Date.now() - CHAT_RETENTION_MS;
  try {
    await env.DB.prepare('DELETE FROM live_viewers WHERE last_ping_at < ?').bind(viewerCutoff).run();
  } catch { /* table may not exist yet */ }
  try {
    await env.DB.prepare('DELETE FROM live_chat_messages WHERE created_at < ?').bind(chatCutoff).run();
  } catch { /* table may not exist yet */ }
  try {
    await env.DB.prepare('DELETE FROM live_session_seen WHERE joined_at < ?').bind(chatCutoff).run();
  } catch { /* table may not exist yet */ }
}

async function hashIp(ip: string): Promise<string> {
  return sha256(ip || 'unknown');
}

// ============================================================================
// Public live-stream state builder (extended with viewers + chat counts)
// ============================================================================

async function buildPublicLiveStreamState(env: Env) {
  const config = await getLiveStreamConfigRow(env);
  const state = await getLiveStreamStateRow(env);
  const latestSermons = await getLatestSermons(env, 4);
  const latest = latestSermons[0] || null;
  const next = nextServiceIso(config, new Date());
  const activeVideoId = resolveActiveVideoId(config, state);

  let viewersOnline = 0;
  let websiteTotal = 0;
  let viewerList: Array<{ displayName: string; isAdmin: boolean; isGuest: boolean; guestNumber: number | null }> = [];
  if (activeVideoId) {
    try {
      viewersOnline = await countViewersOnline(env, activeVideoId);
      viewerList = await getViewerList(env, activeVideoId);
      websiteTotal = await countWebsiteUnique(env, activeVideoId);
    } catch { /* tables may be missing */ }
  }
  const youtubeViewers = (state as any).youtube_viewers != null ? Number((state as any).youtube_viewers) : null;
  const youtubePeak = (state as any).youtube_peak != null ? Number((state as any).youtube_peak) : null;
  const totalOnline = computeTotalOnline(websiteTotal, youtubePeak);

  const baseExtras = { viewersOnline, youtubeViewers, viewerList, websiteTotal, youtubePeak, totalOnline };

  // 三態決策（注意：真正的「直播中」優先級 > manual override 的「回放」）
  //   1. state.is_live + state.video_id   → 真正直播中（status='live'，啟用聊天）
  //   2. 否則有 manual_video_id           → 上次直播回放（status='replay'，無聊天）
  //   3. 都沒有                            → 完全離線（status='offline'）
  if (state.is_live && state.video_id) {
    return {
      status: 'live' as const,
      videoId: state.video_id,
      startedAt: state.started_at,
      nextServiceIso: next,
      latestSermon: latest,
      latestSermons,
      checkedAt: state.checked_at || null,
      ...baseExtras,
    };
  }
  if (config.manual_video_id) {
    return {
      status: 'replay' as const,
      videoId: config.manual_video_id,
      startedAt: null,
      nextServiceIso: next,
      latestSermon: latest,
      latestSermons,
      checkedAt: state.checked_at || null,
      ...baseExtras,
    };
  }
  return {
    status: 'offline' as const,
    videoId: null,
    startedAt: null,
    nextServiceIso: next,
    latestSermon: latest,
    latestSermons,
    checkedAt: state.checked_at || null,
    ...baseExtras,
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
      latestSermons: [],
      checkedAt: null,
      viewersOnline: 0,
      youtubeViewers: null,
      viewerList: [],
      websiteTotal: 0,
      youtubePeak: null,
      totalOnline: 0,
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

async function handleSyncChannelsList(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  const res = await env.DB.prepare('SELECT * FROM sync_channels ORDER BY sort_order ASC').all<SyncChannelRow>();
  return json({ channels: (res.results || []).map(syncChannelRowToAdmin) });
}

async function handleSyncChannelCreate(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  const payload = await readJson<{ name?: string; channelId?: string; apiKey?: string }>(request);
  const name = (payload.name || '').trim();
  const channelId = (payload.channelId || '').trim();
  const apiKey = (payload.apiKey || '').trim();
  if (!name || !channelId || !apiKey) return badRequest('name、channelId、apiKey 均必填');
  if (!getUploadsPlaylistId(channelId)) return badRequest('channelId 必須以 UC 開頭');
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const maxRow = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM sync_channels').first<{ m: number }>();
  const sortOrder = (maxRow?.m ?? -1) + 1;
  await env.DB.prepare(
    `INSERT INTO sync_channels (id, name, channel_id, api_key, enabled, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
  ).bind(id, name, channelId, apiKey, sortOrder, now, now).run();
  const row = await env.DB.prepare('SELECT * FROM sync_channels WHERE id = ?').bind(id).first<SyncChannelRow>();
  return json({ channel: syncChannelRowToAdmin(row as SyncChannelRow) }, 201);
}

async function handleSyncChannelUpdate(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  const current = await env.DB.prepare('SELECT * FROM sync_channels WHERE id = ?').bind(id).first<SyncChannelRow>();
  if (!current) return notFound();
  const payload = await readJson<{ name?: string; channelId?: string; apiKey?: string; enabled?: boolean }>(request);
  const name = payload.name === undefined ? current.name : (payload.name.trim() || current.name);
  const channelId = payload.channelId === undefined ? current.channel_id : (payload.channelId.trim() || current.channel_id);
  if (!getUploadsPlaylistId(channelId)) return badRequest('channelId 必須以 UC 開頭');
  const apiKey =
    payload.apiKey === undefined || payload.apiKey === UNCHANGED_API_KEY
      ? current.api_key
      : (payload.apiKey.trim() || current.api_key);
  const enabled = payload.enabled === undefined ? current.enabled : (payload.enabled ? 1 : 0);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE sync_channels SET name = ?, channel_id = ?, api_key = ?, enabled = ?, updated_at = ? WHERE id = ?`
  ).bind(name, channelId, apiKey, enabled, now, id).run();
  const row = await env.DB.prepare('SELECT * FROM sync_channels WHERE id = ?').bind(id).first<SyncChannelRow>();
  return json({ channel: syncChannelRowToAdmin(row as SyncChannelRow) });
}

async function handleSyncChannelDelete(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  await env.DB.prepare('DELETE FROM sync_channels WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function handleSyncChannelTest(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  const row = await env.DB.prepare('SELECT * FROM sync_channels WHERE id = ?').bind(id).first<SyncChannelRow>();
  if (!row) return notFound();
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('id', row.channel_id);
    url.searchParams.set('key', row.api_key);
    const response = await fetch(url.toString());
    const data = await response.json<{ items?: Array<{ snippet?: { title?: string } }>; error?: { message?: string } }>();
    if (!response.ok || data.error) return json({ ok: false, error: data.error?.message ?? `HTTP ${response.status}` });
    const channelName = data.items?.[0]?.snippet?.title;
    if (!channelName) return json({ ok: false, error: '找不到頻道（channelId 或 key 錯誤）' });
    return json({ ok: true, channelName });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleSyncChannelSync(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  const row = await env.DB.prepare('SELECT * FROM sync_channels WHERE id = ?').bind(id).first<SyncChannelRow>();
  if (!row) return notFound();
  const url = new URL(request.url);
  const target = normalizeSyncTarget(url.searchParams.get('target'));
  const result = await syncChannelUploads(env, { channel: { channelId: row.channel_id, apiKey: row.api_key }, target });
  await sendUploadsSyncNotification(env, result);
  return json(result);
}

function normalizeSyncTarget(value: string | null): SyncTarget {
  const allowed: SyncTarget[] = ['all', 'sermon', 'daily-manna', 'sunday-worship', 'worship-praise', 'healing-prayer', 'testimony'];
  return (allowed as string[]).includes(value || '') ? (value as SyncTarget) : 'all';
}

async function handleSermonSyncYoutube(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureSyncChannelsTable(env);
  const url = new URL(request.url);
  const target = normalizeSyncTarget(url.searchParams.get('category'));
  // 优先用第一个启用频道；没有则回退到 live_stream_config 单频道（向后兼容旧站点）
  const first = await env.DB
    .prepare('SELECT * FROM sync_channels WHERE enabled = 1 ORDER BY sort_order ASC LIMIT 1')
    .first<SyncChannelRow>();
  let channel: { channelId: string; apiKey: string };
  if (first) {
    channel = { channelId: first.channel_id, apiKey: first.api_key };
  } else {
    const cfg = await getLiveStreamConfigRow(env);
    channel = { channelId: cfg.channel_id || '', apiKey: cfg.api_key || '' };
  }
  const result = await syncChannelUploads(env, { channel, target });
  await sendUploadsSyncNotification(env, result);
  return json(result);
}

// ============================================================================
// Move + Hide content
// ============================================================================

async function handleMoveSermon(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureHiddenColumns(env);
  await ensureCategoryColumn(env);
  const payload = await readJson<{ to?: 'daily-manna' | 'live-override' | SermonCategoryDb }>(request);
  const target = payload.to;
  if (
    target !== 'daily-manna' &&
    target !== 'live-override' &&
    target !== 'sunday-worship' &&
    target !== 'worship-praise' &&
    target !== 'healing-prayer' &&
    target !== 'testimony' &&
    target !== 'live-broadcast'
  ) {
    return badRequest('Invalid target');
  }

  if (target === 'daily-manna') {
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO daily_manna (id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, hidden, created_at, updated_at)
           SELECT id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, hidden, created_at, updated_at
           FROM sermons WHERE id = ?`
        ).bind(id),
        env.DB.prepare('DELETE FROM sermons WHERE id = ?').bind(id),
      ]);
      return json({ ok: true, moved: 'daily-manna' });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  if (target === 'live-override') {
    // 把 sermon 的 youtube_id 設為 live_stream_config.manual_video_id，
    // /live 的 manual override 邏輯會立即播放此影片。
    // 注意：這是 action，不是 category。把 sermon "釘住" 為當前 /live 顯示的影片。
    try {
      const row = await env.DB.prepare('SELECT youtube_id FROM sermons WHERE id = ?').bind(id).first<{ youtube_id: string }>();
      if (!row) return notFound();
      await env.DB.prepare('UPDATE live_stream_config SET manual_video_id = ?, updated_at = ? WHERE id = 1')
        .bind(row.youtube_id, Date.now())
        .run();
      return json({ ok: true, moved: 'live-override', videoId: row.youtube_id });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  // 否則：改 category（5 個 sermon 子分類間調整）
  try {
    await env.DB.prepare('UPDATE sermons SET category = ?, updated_at = ? WHERE id = ?')
      .bind(target, new Date().toISOString(), id)
      .run();
    return json({ ok: true, moved: target });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

async function handleMoveDailyManna(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureHiddenColumns(env);
  await ensureCategoryColumn(env);
  const payload = await readJson<{ to?: SermonCategoryDb }>(request);
  const target = normalizeCategory(payload.to);
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO sermons (id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, type, category, hidden, created_at, updated_at)
         SELECT id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh, passage_en, passage_zh, youtube_id, image_url, 'sermon', ?, hidden, created_at, updated_at
         FROM daily_manna WHERE id = ?`
      ).bind(target, id),
      env.DB.prepare('DELETE FROM daily_manna WHERE id = ?').bind(id),
    ]);
    return json({ ok: true, moved: target });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

async function handleSermonVisibility(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureHiddenColumns(env);
  const payload = await readJson<{ hidden?: boolean }>(request);
  const hidden = payload.hidden ? 1 : 0;
  try {
    await env.DB.prepare('UPDATE sermons SET hidden = ?, updated_at = ? WHERE id = ?')
      .bind(hidden, new Date().toISOString(), id).run();
    return json({ ok: true, hidden: Boolean(hidden) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

async function handleDailyMannaVisibility(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureHiddenColumns(env);
  const payload = await readJson<{ hidden?: boolean }>(request);
  const hidden = payload.hidden ? 1 : 0;
  try {
    await env.DB.prepare('UPDATE daily_manna SET hidden = ?, updated_at = ? WHERE id = ?')
      .bind(hidden, new Date().toISOString(), id).run();
    return json({ ok: true, hidden: Boolean(hidden) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

async function handleBackfillMetadata(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureMetadataColumns(env);
  const config = await getLiveStreamConfigRow(env);
  if (!config.api_key) return json({ error: 'YouTube API key not configured' }, 400);

  const result = { updated: 0, batches: 0, errors: [] as string[], hasMore: false };

  // 拿所有缺 metadata 的 rows（sermons + daily_manna），每次最多處理 30 批 = 1500 條
  const MAX_BATCHES_PER_CALL = 30;
  const sermonRows = await env.DB
    .prepare("SELECT id, youtube_id FROM sermons WHERE duration_seconds IS NULL LIMIT ?")
    .bind(MAX_BATCHES_PER_CALL * 50)
    .all<{ id: string; youtube_id: string }>();
  const mannaRows = await env.DB
    .prepare("SELECT id, youtube_id FROM daily_manna WHERE duration_seconds IS NULL LIMIT ?")
    .bind(MAX_BATCHES_PER_CALL * 50)
    .all<{ id: string; youtube_id: string }>();

  const sermonItems = sermonRows.results || [];
  const mannaItems = mannaRows.results || [];

  // 處理 sermons
  for (let i = 0; i < sermonItems.length && result.batches < MAX_BATCHES_PER_CALL; i += 50) {
    const chunk = sermonItems.slice(i, i + 50);
    const ids = chunk.map(r => r.youtube_id);
    try {
      const metaMap = await fetchVideoMetadata(config.api_key, ids);
      const stmts: D1PreparedStatement[] = [];
      for (const row of chunk) {
        const vm = metaMap.get(row.youtube_id);
        if (!vm) continue;
        stmts.push(
          env.DB.prepare('UPDATE sermons SET duration_seconds = ?, view_count = ? WHERE id = ?')
            .bind(vm.durationSeconds, vm.viewCount, row.id)
        );
      }
      if (stmts.length > 0) await env.DB.batch(stmts);
      result.updated += stmts.length;
      result.batches++;
    } catch (err) {
      result.errors.push(`sermons batch ${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 處理 daily_manna
  for (let i = 0; i < mannaItems.length && result.batches < MAX_BATCHES_PER_CALL; i += 50) {
    const chunk = mannaItems.slice(i, i + 50);
    const ids = chunk.map(r => r.youtube_id);
    try {
      const metaMap = await fetchVideoMetadata(config.api_key, ids);
      const stmts: D1PreparedStatement[] = [];
      for (const row of chunk) {
        const vm = metaMap.get(row.youtube_id);
        if (!vm) continue;
        stmts.push(
          env.DB.prepare('UPDATE daily_manna SET duration_seconds = ?, view_count = ? WHERE id = ?')
            .bind(vm.durationSeconds, vm.viewCount, row.id)
        );
      }
      if (stmts.length > 0) await env.DB.batch(stmts);
      result.updated += stmts.length;
      result.batches++;
    } catch (err) {
      result.errors.push(`manna batch ${i}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 如果某張表的搜尋拿滿了 LIMIT，可能還有更多
  if (sermonItems.length === MAX_BATCHES_PER_CALL * 50 || mannaItems.length === MAX_BATCHES_PER_CALL * 50) {
    result.hasMore = true;
  }

  return json(result);
}

// ============================================================================
// Live chat & viewers endpoints
// ============================================================================

async function handleLiveJoin(request: Request, env: Env): Promise<Response> {
  try {
    await ensureLiveChatTables(env);
    await ensureLiveStatsSchema(env);
    const payload = await readJson<{ sessionId?: string; name?: string; asGuest?: boolean; displayName?: string }>(request);
    const sessionId = String(payload.sessionId || '').trim();
    if (!sessionId) return badRequest('Missing sessionId');

    const config = await getLiveStreamConfigRow(env);
    const state = await getLiveStreamStateRow(env);
    const videoId = resolveActiveVideoId(config, state);
    if (!videoId) return badRequest('當前無進行中的直播');

    const auth = await getCurrentUser(request, env);
    const adminName = auth?.name || '';
    const result = await joinViewer(env, {
      sessionId,
      videoId,
      name: auth ? adminName : payload.name,
      asGuest: !auth && payload.asGuest,
      existingDisplayName: !auth ? payload.displayName : undefined,
      isAdmin: !!auth,
    });
    return json({ displayName: result.displayName, guestNumber: result.guestNumber, isAdmin: result.isAdmin, videoId });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

async function handleLivePing(request: Request, env: Env): Promise<Response> {
  try {
    await ensureLiveChatTables(env);
    const payload = await readJson<{ sessionId?: string }>(request);
    const sessionId = String(payload.sessionId || '').trim();
    if (!sessionId) return json({ ok: false }, 400);
    await env.DB.prepare('UPDATE live_viewers SET last_ping_at = ? WHERE session_id = ?').bind(Date.now(), sessionId).run();
    return json({ ok: true });
  } catch {
    return json({ ok: false });
  }
}

async function handleLiveChatGet(request: Request, env: Env): Promise<Response> {
  try {
    await ensureLiveChatTables(env);
    const url = new URL(request.url);
    const videoId = url.searchParams.get('videoId') || '';
    const sinceParam = url.searchParams.get('since') || '0';
    const since = Number(sinceParam) || 0;
    if (!videoId) return json({ messages: [] });
    const result = await env.DB
      .prepare(
        `SELECT id, display_name, is_admin, message, created_at
         FROM live_chat_messages
         WHERE video_id = ? AND deleted_at IS NULL AND created_at > ?
         ORDER BY created_at ASC
         LIMIT ?`
      )
      .bind(videoId, since, CHAT_HISTORY_LIMIT)
      .all<{ id: string; display_name: string; is_admin: number; message: string; created_at: number }>();
    const messages = (result.results || []).map(r => ({
      id: r.id,
      displayName: r.display_name,
      isAdmin: Boolean(r.is_admin),
      message: r.message,
      createdAt: Number(r.created_at),
    }));
    return json({ messages });
  } catch (err) {
    return json({ messages: [], error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleLiveChatPost(request: Request, env: Env): Promise<Response> {
  try {
    await ensureLiveChatTables(env);
    const payload = await readJson<{ sessionId?: string; message?: string }>(request);
    const sessionId = String(payload.sessionId || '').trim();
    const text = String(payload.message || '').trim().slice(0, CHAT_MAX_LENGTH);
    if (!sessionId || !text) return badRequest('Missing sessionId or message');

    const viewer = await env.DB
      .prepare('SELECT display_name, is_admin, video_id, last_ping_at FROM live_viewers WHERE session_id = ?')
      .bind(sessionId)
      .first<{ display_name: string; is_admin: number; video_id: string; last_ping_at: number }>();
    if (!viewer) return json({ error: '請先加入聊天' }, 401);

    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ipHash = await hashIp(ip);

    // Rate limit per IP
    const recent = await env.DB
      .prepare('SELECT created_at FROM live_chat_messages WHERE ip_hash = ? ORDER BY created_at DESC LIMIT 1')
      .bind(ipHash)
      .first<{ created_at: number }>();
    if (recent && Date.now() - Number(recent.created_at) < CHAT_RATE_LIMIT_MS) {
      return json({ error: '訊息發送太快，請稍等' }, 429);
    }

    const messageId = crypto.randomUUID();
    const createdAt = Date.now();
    await env.DB
      .prepare(
        'INSERT INTO live_chat_messages (id, video_id, session_id, display_name, is_admin, message, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(messageId, viewer.video_id, sessionId, viewer.display_name, viewer.is_admin, text, createdAt, ipHash)
      .run();

    // Bump viewer last_ping_at so sender stays in list
    await env.DB.prepare('UPDATE live_viewers SET last_ping_at = ? WHERE session_id = ?').bind(createdAt, sessionId).run();

    return json({
      ok: true,
      message: {
        id: messageId,
        displayName: viewer.display_name,
        isAdmin: Boolean(viewer.is_admin),
        message: text,
        createdAt,
      }
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

async function handleLivePublicRefresh(env: Env): Promise<Response> {
  // 公開刷新：等同管理員「立即重新檢查」，但加 30 秒冷卻避免有人狂點刷光 YouTube API quota
  try {
    const state = await getLiveStreamStateRow(env);
    const config = await getLiveStreamConfigRow(env);
    const PUBLIC_REFRESH_COOLDOWN_MS = 30_000;
    const sinceLastCheck = Date.now() - (state.checked_at || 0);
    if (config.enabled && !config.manual_video_id && sinceLastCheck > PUBLIC_REFRESH_COOLDOWN_MS) {
      await runProbeIfDue(env, true);
    }
    const data = await buildPublicLiveStreamState(env);
    return json(data);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

async function handleLiveChatDelete(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireUser(request, env, 'contributor');
  if (auth instanceof Response) return auth;
  await ensureLiveChatTables(env);
  await env.DB.prepare('UPDATE live_chat_messages SET deleted_at = ? WHERE id = ?').bind(Date.now(), id).run();
  return json({ ok: true });
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

    if (url.pathname === '/api/photos' && request.method === 'GET') {
      return handlePhotosList(env);
    }

    if (url.pathname === '/api/photos/upload' && request.method === 'POST') {
      return handlePhotoUpload(request, env);
    }

    if (url.pathname.startsWith('/api/photos/media/') && request.method === 'GET') {
      const objectKey = decodeURIComponent(url.pathname.replace('/api/photos/media/', ''));
      return handlePhotoObject(env, objectKey);
    }

    if (url.pathname === '/api/photos/settings' && request.method === 'GET') {
      return handlePhotoSettingsGet(env);
    }

    {
      const ownPhotoMatch = url.pathname.match(/^\/api\/photos\/([^/]+)$/);
      if (ownPhotoMatch && request.method === 'PATCH') {
        return handleOwnPhotoUpdate(request, env, decodeURIComponent(ownPhotoMatch[1]));
      }
      if (ownPhotoMatch && request.method === 'DELETE') {
        return handleOwnPhotoDelete(request, env, decodeURIComponent(ownPhotoMatch[1]));
      }
    }

    if (url.pathname === '/api/admin/photos' && request.method === 'GET') {
      const auth = await requireUser(request, env, 'contributor');
      if (auth instanceof Response) return auth;
      return handlePhotosList(env, true);
    }

    if (url.pathname === '/api/admin/photos/settings' && request.method === 'PUT') {
      return handlePhotoSettingsUpdate(request, env);
    }

    {
      const photoMatch = url.pathname.match(/^\/api\/admin\/photos\/([^/]+)$/);
      if (photoMatch && request.method === 'PATCH') {
        return handlePhotoUpdate(request, env, decodeURIComponent(photoMatch[1]));
      }
      if (photoMatch && request.method === 'DELETE') {
        return handlePhotoDelete(request, env, decodeURIComponent(photoMatch[1]));
      }
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
      await ensureCategoryColumn(env);
      const sermon = await readJson<any>(request);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO sermons (
          id, title_en, title_zh, speaker_en, speaker_zh, date, series_en, series_zh,
          passage_en, passage_zh, youtube_id, image_url, type, category, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        normalizeCategory(sermon.category),
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
        await ensureCategoryColumn(env);
        const sermon = await readJson<any>(request);
        await env.DB.prepare(
          `UPDATE sermons SET
            title_en = ?, title_zh = ?, speaker_en = ?, speaker_zh = ?, date = ?,
            series_en = ?, series_zh = ?, passage_en = ?, passage_zh = ?,
            youtube_id = ?, image_url = ?, type = ?, category = ?, updated_at = ?
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
          normalizeCategory(sermon.category),
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
    if (url.pathname === '/api/admin/sermons/sync-youtube' && request.method === 'POST') {
      return handleSermonSyncYoutube(request, env);
    }
    if (url.pathname === '/api/admin/sync-channels' && request.method === 'GET') {
      return handleSyncChannelsList(request, env);
    }
    if (url.pathname === '/api/admin/sync-channels' && request.method === 'POST') {
      return handleSyncChannelCreate(request, env);
    }
    {
      const channelMatch = url.pathname.match(/^\/api\/admin\/sync-channels\/([^/]+)(\/test|\/sync)?$/);
      if (channelMatch) {
        const channelRouteId = decodeURIComponent(channelMatch[1]);
        const suffix = channelMatch[2];
        if (!suffix && request.method === 'PUT') return handleSyncChannelUpdate(request, env, channelRouteId);
        if (!suffix && request.method === 'DELETE') return handleSyncChannelDelete(request, env, channelRouteId);
        if (suffix === '/test' && request.method === 'POST') return handleSyncChannelTest(request, env, channelRouteId);
        if (suffix === '/sync' && request.method === 'POST') return handleSyncChannelSync(request, env, channelRouteId);
      }
    }
    {
      const moveSermonMatch = url.pathname.match(/^\/api\/admin\/sermons\/([^/]+)\/move$/);
      if (moveSermonMatch && request.method === 'POST') return handleMoveSermon(request, env, decodeURIComponent(moveSermonMatch[1]));
      const moveMannaMatch = url.pathname.match(/^\/api\/admin\/daily-manna\/([^/]+)\/move$/);
      if (moveMannaMatch && request.method === 'POST') return handleMoveDailyManna(request, env, decodeURIComponent(moveMannaMatch[1]));
      const visSermonMatch = url.pathname.match(/^\/api\/admin\/sermons\/([^/]+)\/visibility$/);
      if (visSermonMatch && request.method === 'PATCH') return handleSermonVisibility(request, env, decodeURIComponent(visSermonMatch[1]));
      const visMannaMatch = url.pathname.match(/^\/api\/admin\/daily-manna\/([^/]+)\/visibility$/);
      if (visMannaMatch && request.method === 'PATCH') return handleDailyMannaVisibility(request, env, decodeURIComponent(visMannaMatch[1]));
      if (url.pathname === '/api/admin/sermons/backfill-metadata' && request.method === 'POST') {
        return handleBackfillMetadata(request, env);
      }
    }

    if (url.pathname === '/api/live/join' && request.method === 'POST') {
      return handleLiveJoin(request, env);
    }
    if (url.pathname === '/api/live/ping' && request.method === 'POST') {
      return handleLivePing(request, env);
    }
    if (url.pathname === '/api/live/refresh' && request.method === 'POST') {
      return handleLivePublicRefresh(env);
    }
    if (url.pathname === '/api/live/chat' && request.method === 'GET') {
      return handleLiveChatGet(request, env);
    }
    if (url.pathname === '/api/live/chat' && request.method === 'POST') {
      return handleLiveChatPost(request, env);
    }
    if (url.pathname.startsWith('/api/live/chat/') && request.method === 'DELETE') {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      if (!id) return badRequest('Missing message id');
      return handleLiveChatDelete(request, env, id);
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

  async scheduled(event, env, ctx): Promise<void> {
    // 多個 cron trigger 分派：
    //  - "0 */4 * * *"  每 4 小時從所有頻道同步 YouTube uploads
    //  - 其它（"*/5 17-22 * * SUN"） live 偵測
    if (event.cron === '0 */4 * * *') {
      ctx.waitUntil(
        syncAllChannels(env, { target: 'all' })
          .then(result => sendUploadsSyncNotification(env, result))
          .catch(() => undefined)
      );
    } else {
      ctx.waitUntil(runProbeIfDue(env, false).then(() => undefined).catch(() => undefined));
    }
  },
};

export default worker;
