// Hand-signed LiveKit access token (JWT HS256) using Web Crypto — runs on the
// Cloudflare Workers runtime with no external SDK. Node 18+ (vitest) also has
// globalThis.crypto.subtle, so the same code is testable.

function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface LiveKitTokenParams {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name: string;
  roomName: string;
  ttlSeconds?: number;
}

export async function createLiveKitToken(p: LiveKitTokenParams): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = p.ttlSeconds ?? 6 * 60 * 60; // 6h
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: p.apiKey,
    sub: p.identity,
    name: p.name,
    nbf: now,
    iat: now,
    exp: now + ttl,
    video: {
      room: p.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(p.apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}
