/**
 * Passwords, sessions and one-time codes for the multi-church app's accounts.
 *
 * Unlike the single-church system (sha256 of the password), accounts here are
 * open to the public, so passwords use PBKDF2 with a per-account salt — slow
 * enough that a stolen database does not hand over everyone's password.
 */

const encoder = new TextEncoder();

export function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  data.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

export function randomToken(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(value: string): Promise<string> {
  return base64Url(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

/**
 * Workers cap PBKDF2 at 100,000 iterations, and the free plan's CPU allowance
 * makes even that take tens of seconds — so the count is per deployment
 * (PASSWORD_ITERATIONS). Each hash records its own count, so changing it never
 * locks anyone out; a login re-hashes nothing, it just checks at the stored count.
 */
export const MAX_PBKDF2_ITERATIONS = 100_000;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** `pbkdf2$<iterations>$<salt>$<hash>` */
export async function hashPassword(password: string, iterations = MAX_PBKDF2_ITERATIONS): Promise<string> {
  const rounds = Math.min(MAX_PBKDF2_ITERATIONS, Math.max(10_000, Math.floor(iterations)));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, rounds);
  return `pbkdf2$${rounds}$${base64Url(salt)}$${base64Url(hash)}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) return false;
  const derived = await pbkdf2(password, base64UrlDecode(salt), Number(iterations));
  return sameBytes(derived, base64UrlDecode(hash));
}

/** A six-digit code for e-mail verification and password reset. */
export function sixDigitCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

function hmacKey(secret: string, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

/** Who a session is: the account, the church it is working in, and the account's token version. */
export interface SessionClaims {
  aid: string;
  cid: string | null;
  /** Bumped on password change or account deletion: every older session stops working. */
  tv: number;
  exp: number;
}

export const SESSION_HOURS = 24 * 30;

/**
 * What the signature covers, beyond the body: names this app, so a token can
 * never pass as a single-church (BOLCCOP) session even if a secret were shared.
 */
const SIGNED = (body: string) => encoder.encode(`church-finance-saas.v1.${body}`);

export async function signSession(claims: Omit<SessionClaims, 'exp'>, secret: string, now = Date.now()): Promise<string> {
  const body = base64Url(encoder.encode(JSON.stringify({ ...claims, exp: now + SESSION_HOURS * 3600_000 })));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), SIGNED(body));
  return `v1.${body}.${base64Url(signature)}`;
}

export async function verifySession(token: string, secret: string, now = Date.now()): Promise<SessionClaims | null> {
  try {
    const [version, body, signature] = token.split('.');
    if (version !== 'v1' || !body || !signature) return null;
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), base64UrlDecode(signature), SIGNED(body));
    if (!valid) return null;
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as SessionClaims;
    if (!claims.exp || claims.exp < now || typeof claims.aid !== 'string') return null;
    return claims;
  } catch {
    return null;
  }
}
