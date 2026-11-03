/**
 * OBS Church account sync.
 *
 * One account = one set of church content (scenes and their slide items) plus
 * the files they use (PowerPoint, pictures, video files). Content is a JSON
 * document with a revision number: a save must name the revision it was based
 * on, so two computers editing at once never silently overwrite each other.
 * Files are stored once per account under their SHA-256, so the same file is
 * never uploaded twice and a download can be checked.
 *
 *   POST /api/register   {email, password}           → {token, email}
 *   POST /api/login      {email, password}           → {token, email}
 *   GET  /api/me                                      → {email}
 *   GET  /api/content                                 → {rev, updatedAt, content|null}
 *   PUT  /api/content    {baseRev, content}           → {rev} | 409 {rev, content}
 *   HEAD /api/files/:sha256                           → 200 | 404
 *   PUT  /api/files/:sha256   (the bytes)             → 200 (checked against the hash; at most 100 MB)
 *   GET  /api/files/:sha256                           → the bytes
 *   POST /api/editor/login  {password}                → {token, email}   (the web editor, "OBS 在線")
 *   GET  /api/templates                               → {templates: [{id, name, updatedAt, scenes, items}]}
 *   GET  /api/templates/:id                           → {id, name, updatedAt, content}
 *   PUT  /api/templates/:id   {name, content}         → {ok}   (a saved setup: scenes and their sources)
 *   DELETE /api/templates/:id                         → {ok}
 *   GET  /api/youtube-playlist?list=ID                → {title, videos: [{id, title}]}   (no sign-in; CORS open)
 *
 * The web editor itself is served from /editor/ (static files, built from church-presenter).
 * Its password opens the one account named by EDITOR_EMAIL; ten wrong passwords from one
 * address lock it out for 15 minutes.
 */

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  TOKEN_SECRET: string;
  /** The web editor's password (a secret) and the account it opens. */
  EDITOR_PASSWORD: string;
  EDITOR_EMAIL: string;
  ASSETS: Fetcher;
}

const EDITOR_WINDOW_MS = 15 * 60 * 1000;
const EDITOR_MAX_FAILURES = 10;

const PBKDF2_ITERATIONS = 100_000;
const TOKEN_DAYS = 365;
const MAX_CONTENT_BYTES = 4 * 1024 * 1024;
/** Files (videos, mostly) in the account: at most 100 MB each. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const error = (status: number, message: string) => json({ error: message }, status);

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return b64url(bits);
}

/** Constant-time string comparison. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`obs-church-sync.v1.${data}`)));
}

async function makeToken(env: Env, userId: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ u: userId, e: Date.now() + TOKEN_DAYS * 86_400_000 })));
  return `${body}.${await hmac(env.TOKEN_SECRET, body)}`;
}

async function readToken(env: Env, request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [body, sig] = token.split('.');
  if (!body || !sig || !same(sig, await hmac(env.TOKEN_SECRET, body))) return null;
  try {
    const { u, e } = JSON.parse(new TextDecoder().decode(fromB64url(body))) as { u: string; e: number };
    return typeof u === 'string' && e > Date.now() ? u : null;
  } catch {
    return null;
  }
}

const normEmail = (email: unknown) => (typeof email === 'string' ? email.trim().toLowerCase() : '');
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

async function register(request: Request, env: Env): Promise<Response> {
  const { email: rawEmail, password } = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = normEmail(rawEmail);
  if (!validEmail(email)) return error(400, 'invalid-email');
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) return error(400, 'weak-password');

  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
  if (exists) return error(409, 'email-taken');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users (id, email, pw_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, email, await hashPassword(password, salt), b64url(salt), Date.now())
    .run();
  return json({ token: await makeToken(env, id), email });
}

async function login(request: Request, env: Env): Promise<Response> {
  const { email: rawEmail, password } = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = normEmail(rawEmail);
  const user = await env.DB.prepare('SELECT id, pw_hash, salt FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; pw_hash: string; salt: string }>();
  // Hash even when the account is unknown, so the timing does not tell.
  const salt = user ? fromB64url(user.salt) : new Uint8Array(16);
  const hash = await hashPassword(typeof password === 'string' ? password : '', salt);
  if (!user || !same(hash, user.pw_hash)) return error(401, 'wrong-login');
  return json({ token: await makeToken(env, user.id), email });
}

async function editorLogin(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const since = Date.now() - EDITOR_WINDOW_MS;
  const failures = await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_failures WHERE ip = ? AND at > ?')
    .bind(ip, since)
    .first<{ n: number }>();
  if ((failures?.n ?? 0) >= EDITOR_MAX_FAILURES) return error(429, 'too-many-attempts');

  const { password } = (await request.json().catch(() => ({}))) as { password?: unknown };
  if (typeof password !== 'string' || !env.EDITOR_PASSWORD || !same(password, env.EDITOR_PASSWORD)) {
    await env.DB.prepare('INSERT INTO editor_failures (ip, at) VALUES (?, ?)').bind(ip, Date.now()).run();
    await env.DB.prepare('DELETE FROM editor_failures WHERE at < ?').bind(since).run();
    return error(401, 'wrong-password');
  }
  const email = normEmail(env.EDITOR_EMAIL);
  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  if (!user) return error(404, 'no-account');
  return json({ token: await makeToken(env, user.id), email });
}

async function getContent(userId: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare('SELECT rev, content, updated_at FROM content WHERE user_id = ?')
    .bind(userId)
    .first<{ rev: number; content: string; updated_at: number }>();
  if (!row) return json({ rev: 0, updatedAt: null, content: null });
  return json({ rev: row.rev, updatedAt: row.updated_at, content: JSON.parse(row.content) });
}

async function putContent(request: Request, userId: string, env: Env): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_CONTENT_BYTES) return error(413, 'too-large');
  let body: { baseRev?: unknown; content?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return error(400, 'bad-json');
  }
  if (typeof body.baseRev !== 'number' || typeof body.content !== 'object' || body.content === null) return error(400, 'bad-request');

  const content = JSON.stringify(body.content);
  const now = Date.now();
  const next = body.baseRev + 1;
  // Only if nobody saved since baseRev (rev 0: there is nothing yet).
  const result = body.baseRev === 0
    ? await env.DB.prepare('INSERT INTO content (user_id, rev, content, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(user_id) DO NOTHING')
      .bind(userId, content, now).run()
    : await env.DB.prepare('UPDATE content SET rev = ?, content = ?, updated_at = ? WHERE user_id = ? AND rev = ?')
      .bind(next, content, now, userId, body.baseRev).run();

  if (!result.meta.changes) {
    const current = await env.DB.prepare('SELECT rev, content FROM content WHERE user_id = ?')
      .bind(userId)
      .first<{ rev: number; content: string }>();
    return json({ error: 'conflict', rev: current?.rev ?? 0, content: current ? JSON.parse(current.content) : null }, 409);
  }
  return json({ rev: next, updatedAt: now });
}

const MAX_TEMPLATES = 100;

/** A content document's size, for the template list: its scenes and their items. */
function counts(content: string): { scenes: number; items: number } {
  try {
    const scenes = (JSON.parse(content) as { scenes?: { items?: unknown[] }[] }).scenes ?? [];
    return { scenes: scenes.length, items: scenes.reduce((n, scene) => n + (scene.items?.length ?? 0), 0) };
  } catch {
    return { scenes: 0, items: 0 };
  }
}

async function templates(request: Request, userId: string, id: string | null, env: Env): Promise<Response> {
  if (!id) {
    if (request.method !== 'GET') return error(405, 'method');
    const { results } = await env.DB.prepare('SELECT id, name, content, updated_at FROM templates WHERE user_id = ? ORDER BY name')
      .bind(userId)
      .all<{ id: string; name: string; content: string; updated_at: number }>();
    return json({ templates: results.map((row) => ({ id: row.id, name: row.name, updatedAt: row.updated_at, ...counts(row.content) })) });
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return error(400, 'bad-id');
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT name, content, updated_at FROM templates WHERE user_id = ? AND id = ?')
      .bind(userId, id)
      .first<{ name: string; content: string; updated_at: number }>();
    if (!row) return error(404, 'not-found');
    return json({ id, name: row.name, updatedAt: row.updated_at, content: JSON.parse(row.content) });
  }
  if (request.method === 'PUT') {
    const text = await request.text();
    if (text.length > MAX_CONTENT_BYTES) return error(413, 'too-large');
    let body: { name?: unknown; content?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return error(400, 'bad-json');
    }
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    if (!name || typeof body.content !== 'object' || body.content === null) return error(400, 'bad-request');
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM templates WHERE user_id = ? AND id != ?')
      .bind(userId, id)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_TEMPLATES) return error(409, 'too-many-templates');
    await env.DB.prepare(
      'INSERT INTO templates (user_id, id, name, content, updated_at) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(user_id, id) DO UPDATE SET name = excluded.name, content = excluded.content, updated_at = excluded.updated_at',
    )
      .bind(userId, id, name, JSON.stringify(body.content), Date.now())
      .run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM templates WHERE user_id = ? AND id = ?').bind(userId, id).run();
    return json({ ok: true });
  }
  return error(405, 'method');
}

const PLAYLIST_CACHE_SECONDS = 600;

/** The videos of a YouTube playlist (its first 100), read from the playlist's page: YouTube lets
 * no web page read it itself, and the slide panel and web editor both want it. */
async function youTubePlaylist(request: Request, ctx: ExecutionContext): Promise<Response> {
  const cors = { 'access-control-allow-origin': '*' };
  const list = new URL(request.url).searchParams.get('list') ?? '';
  if (!/^[\w-]{10,64}$/.test(list)) return new Response(JSON.stringify({ error: 'bad-list' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } });

  const cache = caches.default;
  const key = new Request(`https://obs-sync.bolccop.org/api/youtube-playlist?list=${list}`);
  const cached = await cache.match(key);
  if (cached) return cached;

  const page = await fetch(`https://www.youtube.com/playlist?list=${list}&hl=en`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'accept-language': 'en' },
  });
  const html = page.ok ? await page.text() : '';
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  let data: unknown = null;
  try {
    data = match ? JSON.parse(match[1]) : null;
  } catch {
    data = null;
  }
  const videos: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  const add = (id: unknown, title: unknown) => {
    if (typeof id !== 'string' || !/^[\w-]{11}$/.test(id) || seen.has(id)) return;
    seen.add(id);
    videos.push({ id, title: typeof title === 'string' ? title : '' });
  };
  // Today's pages list "lockupViewModel"s; older ones "playlistVideoRenderer"s.
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, any>;
    const lockup = o.lockupViewModel;
    if (lockup && lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      add(lockup.contentId, lockup.metadata?.lockupMetadataViewModel?.title?.content);
      return;
    }
    const renderer = o.playlistVideoRenderer;
    if (renderer) {
      add(renderer.videoId, renderer.title?.runs?.[0]?.text ?? renderer.title?.simpleText);
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(data);
  const meta = (data as Record<string, any> | null)?.metadata?.playlistMetadataRenderer;
  if (!videos.length) {
    return new Response(JSON.stringify({ error: page.ok ? 'empty-or-private' : `youtube-${page.status}` }),
      { status: 404, headers: { ...cors, 'content-type': 'application/json' } });
  }
  const response = new Response(JSON.stringify({ title: typeof meta?.title === 'string' ? meta.title : '', videos }), {
    headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${PLAYLIST_CACHE_SECONDS}` },
  });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

async function files(request: Request, userId: string, hash: string, env: Env): Promise<Response> {
  if (!/^[0-9a-f]{64}$/.test(hash)) return error(400, 'bad-hash');
  const key = `${userId}/${hash}`;
  if (request.method === 'HEAD') {
    return new Response(null, { status: (await env.FILES.head(key)) ? 200 : 404 });
  }
  if (request.method === 'GET') {
    const object = await env.FILES.get(key);
    if (!object) return error(404, 'not-found');
    return new Response(object.body, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(object.size) } });
  }
  if (request.method === 'PUT') {
    const size = Number(request.headers.get('content-length'));
    if (!request.body || !Number.isFinite(size) || size <= 0) return error(411, 'length-required');
    if (size > MAX_FILE_BYTES) return error(413, 'file-too-large');
    // Streamed into R2 while hashed, so a large video never has to fit in the worker's memory.
    const [toHash, toStore] = request.body.tee();
    const digest = new crypto.DigestStream('SHA-256');
    const hashed = toHash.pipeTo(digest);
    await env.FILES.put(key, toStore.pipeThrough(new FixedLengthStream(size)));
    await hashed;
    if (hex(await digest.digest) !== hash) {
      await env.FILES.delete(key);
      return error(400, 'hash-mismatch');
    }
    return json({ ok: true, size });
  }
  return error(405, 'method');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/api/register' && request.method === 'POST') return await register(request, env);
      if (path === '/api/login' && request.method === 'POST') return await login(request, env);
      if (path === '/api/editor/login' && request.method === 'POST') return await editorLogin(request, env);
      if (path === '/api/youtube-playlist' && request.method === 'GET') return await youTubePlaylist(request, ctx);
      if (path === '/api/health') return json({ ok: true, service: 'obs-church-sync', version: '33.0.2' });
      if (path === '/' || path === '/editor') return Response.redirect(`${url.origin}/editor/`, 302);
      if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

      const userId = await readToken(env, request);
      if (!userId) return error(401, 'signed-out');

      if (path === '/api/me' && request.method === 'GET') {
        const user = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first<{ email: string }>();
        return user ? json({ email: user.email }) : error(401, 'signed-out');
      }
      if (path === '/api/content' && request.method === 'GET') return await getContent(userId, env);
      if (path === '/api/content' && request.method === 'PUT') return await putContent(request, userId, env);
      const template = path.match(/^\/api\/templates(?:\/([^/]+))?$/);
      if (template) return await templates(request, userId, template[1] ?? null, env);
      const file = path.match(/^\/api\/files\/([0-9a-f]+)$/);
      if (file) return await files(request, userId, file[1], env);
      return error(404, 'not-found');
    } catch (e) {
      console.error(e);
      return error(500, 'server-error');
    }
  },
} satisfies ExportedHandler<Env>;
