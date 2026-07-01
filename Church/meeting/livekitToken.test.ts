import { describe, it, expect } from 'vitest';
import { createLiveKitToken } from './livekitToken';

function decodeSegment(seg: string): any {
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(Buffer.from(pad, 'base64').toString('utf8'));
}

describe('createLiveKitToken', () => {
  it('produces a signed JWT with the LiveKit video grant', async () => {
    const token = await createLiveKitToken({
      apiKey: 'devkey', apiSecret: 'devsecret',
      identity: 'user-1', name: 'Andy', roomName: 'bolccop-prayer', ttlSeconds: 3600,
    });
    const [h, p, s] = token.split('.');
    expect(h && p && s).toBeTruthy();
    expect(decodeSegment(h)).toEqual({ alg: 'HS256', typ: 'JWT' });
    const payload = decodeSegment(p);
    expect(payload.iss).toBe('devkey');
    expect(payload.sub).toBe('user-1');
    expect(payload.name).toBe('Andy');
    expect(payload.video).toMatchObject({ room: 'bolccop-prayer', roomJoin: true, canPublish: true, canSubscribe: true });
    expect(payload.exp).toBeGreaterThan(payload.nbf);
  });

  it('signs with HMAC-SHA256 verifiable by the secret', async () => {
    const token = await createLiveKitToken({
      apiKey: 'k', apiSecret: 'topsecret', identity: 'i', name: 'n', roomName: 'r',
    });
    const [h, p, s] = token.split('.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('topsecret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigB64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const sigPad = sigB64 + '='.repeat((4 - (sigB64.length % 4)) % 4);
    const sig = Uint8Array.from(Buffer.from(sigPad, 'base64'));
    const ok = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});
