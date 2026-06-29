interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  CLOUDFLARE_R2_PUBLIC_URL?: string;
  LOGIN_PASS?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  });
}

const DEFAULT_PUBLIC_BASE = 'https://garyhub.4022.us';
const SESSION_COOKIE = 'imagehub_session';
const SESSION_SALT = 'imagehub-auth-v1';
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;

type LoginRateLimitRow = {
  ip: string;
  failures: number;
  blocked_until: number | null;
  updated_at: number;
};

function publicBase(env: Env) {
  return (env.CLOUDFLARE_R2_PUBLIC_URL ?? DEFAULT_PUBLIC_BASE).replace(/\/+$/, '');
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = rest.join('=');
    return acc;
  }, {});
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sessionToken(env: Env): Promise<string> {
  return sha256Hex(`${env.LOGIN_PASS ?? ''}:${SESSION_SALT}`);
}

function cookieAttributes(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  if (!env.LOGIN_PASS) return true;
  const cookies = parseCookies(request.headers.get('Cookie'));
  if (!cookies[SESSION_COOKIE]) return false;
  return cookies[SESSION_COOKIE] === await sessionToken(env);
}

function getClientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP')?.trim();
  if (cfIp) return cfIp;
  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }
  return 'unknown';
}

async function getLoginRateLimit(db: D1Database, ip: string): Promise<LoginRateLimitRow | null> {
  return db
    .prepare('SELECT ip, failures, blocked_until, updated_at FROM login_rate_limits WHERE ip = ?')
    .bind(ip)
    .first<LoginRateLimitRow>();
}

async function upsertLoginRateLimit(db: D1Database, row: LoginRateLimitRow) {
  await db.prepare(
    `INSERT INTO login_rate_limits (ip, failures, blocked_until, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ip) DO UPDATE SET
       failures = excluded.failures,
       blocked_until = excluded.blocked_until,
       updated_at = excluded.updated_at`
  ).bind(row.ip, row.failures, row.blocked_until, row.updated_at).run();
}

async function clearLoginRateLimit(db: D1Database, ip: string) {
  await db.prepare('DELETE FROM login_rate_limits WHERE ip = ?').bind(ip).run();
}

function retryAfterSeconds(blockedUntil: number, now: number): number {
  return Math.max(1, Math.ceil((blockedUntil - now) / 1000));
}

// ─── DB init ──────────────────────────────────────────────────────────────────

async function initDB(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS gallery (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    src        TEXT    NOT NULL,
    title      TEXT    NOT NULL DEFAULT '',
    collection TEXT    DEFAULT '',
    album      TEXT    DEFAULT '',
    size_bytes INTEGER,
    exif       TEXT,
    created_at INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS videos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    video       TEXT    NOT NULL,
    title       TEXT    NOT NULL DEFAULT '',
    description TEXT    DEFAULT '',
    collection  TEXT    DEFAULT '',
    album       TEXT    DEFAULT '',
    created_at  INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS config (
    id   TEXT PRIMARY KEY,
    data TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS guestbook (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    email      TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    approved   INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS login_rate_limits (
    ip            TEXT PRIMARY KEY,
    failures      INTEGER NOT NULL DEFAULT 0,
    blocked_until INTEGER,
    updated_at    INTEGER NOT NULL
  )`).run();
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

const mapGallery = (r: any) => ({
  id: String(r.id),
  src: r.src,
  title: r.title,
  collection: r.collection || '',
  album: r.album || '',
  ...(r.size_bytes != null && { sizeBytes: r.size_bytes }),
  ...(r.exif && { exif: (() => { try { return JSON.parse(r.exif); } catch { return undefined; } })() }),
  createdAt: r.created_at,
});

const mapVideo = (r: any) => ({
  id: String(r.id),
  video: r.video,
  title: r.title,
  desc: r.description || '',
  collection: r.collection || '',
  album: r.album || '',
  createdAt: r.created_at,
});

const mapGuestbook = (r: any) => ({
  id: String(r.id),
  name: r.name,
  email: r.email,
  content: r.content,
  approved: r.approved === 1,
  date: new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  createdAt: r.created_at,
});

// ─── Main handler ─────────────────────────────────────────────────────────────

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  await initDB(env.DB);

  if (path === '/api/login' && method === 'POST') {
    if (!env.LOGIN_PASS) return json({ error: 'LOGIN_PASS is not configured' }, 500);
    try {
      const now = Date.now();
      const ip = getClientIp(request);
      const rateLimit = await getLoginRateLimit(env.DB, ip);
      if (rateLimit?.blocked_until && rateLimit.blocked_until > now) {
        const retryAfter = retryAfterSeconds(rateLimit.blocked_until, now);
        return json(
          { error: `Too many failed attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).` },
          429,
          { 'Retry-After': String(retryAfter) }
        );
      }

      const body = await request.json() as { password?: string };
      if (!body.password) return json({ error: 'Password is required' }, 400);
      if (body.password !== env.LOGIN_PASS) {
        const baselineFailures =
          rateLimit && now - rateLimit.updated_at < LOGIN_BLOCK_MS ? rateLimit.failures : 0;
        const failures = baselineFailures + 1;
        const blockedUntil = failures >= LOGIN_FAILURE_LIMIT ? now + LOGIN_BLOCK_MS : null;

        await upsertLoginRateLimit(env.DB, {
          ip,
          failures,
          blocked_until: blockedUntil,
          updated_at: now,
        });

        if (blockedUntil) {
          const retryAfter = retryAfterSeconds(blockedUntil, now);
          return json(
            { error: `Too many failed attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).` },
            429,
            { 'Retry-After': String(retryAfter) }
          );
        }

        return json({ error: `Invalid password. ${LOGIN_FAILURE_LIMIT - failures} attempt(s) remaining.` }, 401);
      }

      await clearLoginRateLimit(env.DB, ip);
      const token = await sessionToken(env);
      return json({ success: true }, 200, {
        'Set-Cookie': `${SESSION_COOKIE}=${token}; Max-Age=2592000; ${cookieAttributes(request)}`,
      });
    } catch (e: any) {
      return json({ error: e.message || 'Login failed' }, 500);
    }
  }

  if (path === '/api/logout' && method === 'POST') {
    return json({ success: true }, 200, {
      'Set-Cookie': `${SESSION_COOKIE}=; Max-Age=0; ${cookieAttributes(request)}`,
    });
  }

  if (path === '/api/me' && method === 'GET') {
    return json({ authenticated: await isAuthenticated(request, env) });
  }

  if (path === '/api/site-background' && method === 'GET') {
    const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'background'").first<{ value: string }>();
    if (!row?.value) return json({ type: 'none', url: '', enabled: false });
    try {
      return json(JSON.parse(row.value));
    } catch {
      return json({ type: 'none', url: '', enabled: false });
    }
  }

  if (path.startsWith('/api/') && !(await isAuthenticated(request, env))) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // ── R2 Upload ──────────────────────────────────────────────────────────────
  if (path === '/api/upload-r2' && method === 'POST') {
    try {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const category = (formData.get('category') as string | null)?.trim() || 'Uncategorized';
      if (!file) return json({ error: 'No file' }, 400);

      const safeName = file.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `${category}/${Date.now()}-${safeName}`;
      const buffer = await file.arrayBuffer();

      await env.R2_BUCKET.put(key, buffer, {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
      });

      const secureUrl = `${publicBase(env)}/${key}`;
      return json({ secureUrl, sizeBytes: buffer.byteLength });
    } catch (e: any) {
      return json({ error: e.message }, 500);
    }
  }

  // ── R2 Delete ──────────────────────────────────────────────────────────────
  if (path === '/api/delete-r2' && method === 'POST') {
    try {
      const { key } = await request.json() as { key?: string };
      if (!key) return json({ error: 'Missing key' }, 400);
      await env.R2_BUCKET.delete(key);
      return json({ success: true });
    } catch (e: any) {
      return json({ error: e.message }, 500);
    }
  }

  // ── Gallery ────────────────────────────────────────────────────────────────
  if (path === '/api/gallery') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM gallery ORDER BY created_at DESC').all();
      return json({ items: results.map(mapGallery) });
    }
    if (method === 'POST') {
      const b = await request.json() as any;
      const now = Date.now();
      const r = await env.DB.prepare(
        'INSERT INTO gallery (src, title, collection, album, size_bytes, exif, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(b.src, b.title || '', b.collection || '', b.album || '', b.sizeBytes ?? null, b.exif ? JSON.stringify(b.exif) : null, now).run();
      return json({ id: String(r.meta.last_row_id), createdAt: now });
    }
  }

  // Batch insert
  if (path === '/api/gallery/batch' && method === 'POST') {
    const b = await request.json() as { items?: any[] };
    if (!Array.isArray(b.items)) return json({ error: 'items array required' }, 400);
    const now = Date.now();
    const ids: string[] = [];
    for (const item of b.items) {
      const r = await env.DB.prepare(
        'INSERT INTO gallery (src, title, collection, album, size_bytes, exif, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(item.src, item.title || '', item.collection || '', item.album || '', item.sizeBytes ?? null, item.exif ? JSON.stringify(item.exif) : null, now).run();
      ids.push(String(r.meta.last_row_id));
    }
    return json({ ids, createdAt: now });
  }

  // Batch move
  if (path === '/api/gallery/batch-move' && method === 'POST') {
    const b = await request.json() as { ids?: string[]; collection?: string; album?: string };
    if (!Array.isArray(b.ids)) return json({ error: 'ids array required' }, 400);
    let succeeded = 0, failed = 0;
    for (const id of b.ids) {
      try {
        await env.DB.prepare('UPDATE gallery SET collection = ?, album = ? WHERE id = ?').bind(b.collection ?? '', b.album ?? '', Number(id)).run();
        succeeded++;
      } catch { failed++; }
    }
    return json({ succeeded, failed });
  }

  const galleryMatch = path.match(/^\/api\/gallery\/(\d+)$/);
  if (galleryMatch) {
    const id = Number(galleryMatch[1]);
    if (method === 'PATCH') {
      const b = await request.json() as any;
      const sets: string[] = [], params: any[] = [];
      if (b.src !== undefined) { sets.push('src = ?'); params.push(b.src); }
      if (b.title !== undefined) { sets.push('title = ?'); params.push(b.title); }
      if (b.collection !== undefined) { sets.push('collection = ?'); params.push(b.collection); }
      if (b.album !== undefined) { sets.push('album = ?'); params.push(b.album); }
      if (b.sizeBytes !== undefined) { sets.push('size_bytes = ?'); params.push(b.sizeBytes); }
      if (b.exif !== undefined) { sets.push('exif = ?'); params.push(JSON.stringify(b.exif)); }
      if (sets.length) await env.DB.prepare(`UPDATE gallery SET ${sets.join(', ')} WHERE id = ?`).bind(...params, id).run();
      return json({ success: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM gallery WHERE id = ?').bind(id).run();
      return json({ success: true });
    }
  }

  // ── Videos ─────────────────────────────────────────────────────────────────
  if (path === '/api/videos') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM videos ORDER BY created_at DESC').all();
      return json({ items: results.map(mapVideo) });
    }
    if (method === 'POST') {
      const b = await request.json() as any;
      const now = Date.now();
      const r = await env.DB.prepare(
        'INSERT INTO videos (video, title, description, collection, album, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(b.video, b.title || '', b.desc || '', b.collection || '', b.album || '', now).run();
      return json({ id: String(r.meta.last_row_id), createdAt: now });
    }
  }

  const videoMatch = path.match(/^\/api\/videos\/(\d+)$/);
  if (videoMatch) {
    const id = Number(videoMatch[1]);
    if (method === 'PATCH') {
      const b = await request.json() as any;
      const sets: string[] = [], params: any[] = [];
      if (b.video !== undefined) { sets.push('video = ?'); params.push(b.video); }
      if (b.title !== undefined) { sets.push('title = ?'); params.push(b.title); }
      if (b.desc !== undefined) { sets.push('description = ?'); params.push(b.desc); }
      if (b.collection !== undefined) { sets.push('collection = ?'); params.push(b.collection); }
      if (b.album !== undefined) { sets.push('album = ?'); params.push(b.album); }
      if (sets.length) await env.DB.prepare(`UPDATE videos SET ${sets.join(', ')} WHERE id = ?`).bind(...params, id).run();
      return json({ success: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
      return json({ success: true });
    }
  }

  // ── Config ─────────────────────────────────────────────────────────────────
  if (path === '/api/config') {
    if (method === 'GET') {
      const r = await env.DB.prepare("SELECT data FROM config WHERE id = 'main'").first<{ data: string }>();
      return json({ data: r ? JSON.parse(r.data) : null });
    }
    if (method === 'POST') {
      const body = await request.json();
      await env.DB.prepare("INSERT OR REPLACE INTO config (id, data) VALUES ('main', ?)").bind(JSON.stringify(body)).run();
      return json({ success: true });
    }
  }

  // ── Guestbook ──────────────────────────────────────────────────────────────
  if (path === '/api/guestbook') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM guestbook ORDER BY created_at DESC').all();
      return json({ messages: results.map(mapGuestbook) });
    }
    if (method === 'POST') {
      const b = await request.json() as any;
      const now = Date.now();
      const r = await env.DB.prepare(
        'INSERT INTO guestbook (name, email, content, approved, created_at) VALUES (?, ?, ?, 0, ?)'
      ).bind(b.name, b.email, b.content, now).run();
      return json({
        id: String(r.meta.last_row_id),
        name: b.name, email: b.email, content: b.content,
        approved: false,
        date: new Date(now).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        createdAt: now,
      });
    }
  }

  const gbMatch = path.match(/^\/api\/guestbook\/(\d+)$/);
  if (gbMatch) {
    const id = Number(gbMatch[1]);
    if (method === 'PATCH') {
      const { approved } = await request.json() as { approved?: boolean };
      await env.DB.prepare('UPDATE guestbook SET approved = ? WHERE id = ?').bind(approved ? 1 : 0, id).run();
      return json({ success: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(id).run();
      return json({ success: true });
    }
  }

  return new Response('Not Found', { status: 404 });
};
