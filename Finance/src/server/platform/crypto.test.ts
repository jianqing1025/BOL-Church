import { describe, expect, it } from 'vitest';
import { hashPassword, signSession, verifyPassword, verifySession } from './crypto';

const SECRET = 'a-secret-that-is-long-enough-for-signing-tokens';

describe('passwords', () => {
  it('hashes with a salt, so the same password never hashes the same', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).not.toBe(b);
    expect(a.startsWith('pbkdf2$100000$')).toBe(true);
    expect(await verifyPassword('correct horse battery', a)).toBe(true);
    expect(await verifyPassword('wrong', a)).toBe(false);
    expect(await verifyPassword('anything', 'plain-sha256-from-the-old-system')).toBe(false);
  });
});

describe('sessions', () => {
  it('round-trips, expires, and rejects tampering', async () => {
    const token = await signSession({ aid: 'a1', cid: 'c1', tv: 0 }, SECRET);
    expect(await verifySession(token, SECRET)).toMatchObject({ aid: 'a1', cid: 'c1', tv: 0 });
    expect(await verifySession(token, `${SECRET}x`)).toBeNull();
    const [v, body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ aid: 'admin', cid: 'c1', tv: 0, exp: Date.now() + 1e9 })).toString('base64url');
    expect(await verifySession(`${v}.${forged}.${sig}`, SECRET)).toBeNull();
    expect(await verifySession(`${v}.${body}.${sig}`, SECRET, Date.now() + 1000 * 3600 * 24 * 31)).toBeNull();
  });
});
