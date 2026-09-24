import { describe, it, expect } from 'vitest';
import { verifyStripeSignature, parseStripeSignatureHeader } from './stripeWebhook';

const SECRET = 'whsec_testsecretvalue1234567890';

/** 依 Stripe 規則產生合法簽章，供測試使用 */
async function sign(payload: string, timestamp: number, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

describe('parseStripeSignatureHeader', () => {
  it('解析出時間戳與所有 v1 簽章', () => {
    const parsed = parseStripeSignatureHeader('t=1700000000,v1=aaa,v1=bbb');
    expect(parsed).toEqual({ timestamp: 1700000000, signatures: ['aaa', 'bbb'] });
  });

  it('忽略未知的 scheme（如 v0）', () => {
    const parsed = parseStripeSignatureHeader('t=1700000000,v0=xxx,v1=aaa');
    expect(parsed).toEqual({ timestamp: 1700000000, signatures: ['aaa'] });
  });

  it('缺時間戳回 null', () => {
    expect(parseStripeSignatureHeader('v1=aaa')).toBeNull();
  });

  it('缺簽章回 null', () => {
    expect(parseStripeSignatureHeader('t=1700000000')).toBeNull();
  });

  it('空字串回 null', () => {
    expect(parseStripeSignatureHeader('')).toBeNull();
  });
});

describe('verifyStripeSignature', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
  const now = 1700000000;

  it('正確的簽章通過', async () => {
    const header = await sign(payload, now);
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now })).toBe(true);
  });

  it('被竄改的 payload 不通過', async () => {
    const header = await sign(payload, now);
    const tampered = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', extra: 1 });
    expect(await verifyStripeSignature({ payload: tampered, header, secret: SECRET, nowSec: now })).toBe(false);
  });

  it('用錯誤金鑰簽的不通過', async () => {
    const header = await sign(payload, now, 'whsec_wrongsecret');
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now })).toBe(false);
  });

  it('過期的時間戳不通過（超過 300 秒容忍度）', async () => {
    const header = await sign(payload, now);
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now + 301 })).toBe(false);
  });

  it('容忍度內的時間戳通過', async () => {
    const header = await sign(payload, now);
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now + 299 })).toBe(true);
  });

  it('未來時間戳超過容忍度也不通過', async () => {
    const header = await sign(payload, now);
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now - 301 })).toBe(false);
  });

  it('缺少簽章標頭不通過', async () => {
    expect(await verifyStripeSignature({ payload, header: null, secret: SECRET, nowSec: now })).toBe(false);
  });

  it('格式錯誤的標頭不通過', async () => {
    expect(await verifyStripeSignature({ payload, header: 'garbage', secret: SECRET, nowSec: now })).toBe(false);
  });

  it('空的 secret 不通過（設定漏了不能變成全部放行）', async () => {
    const header = await sign(payload, now);
    expect(await verifyStripeSignature({ payload, header, secret: '', nowSec: now })).toBe(false);
  });

  it('多個 v1 簽章中有一個正確即通過（Stripe 輪換金鑰時會這樣送）', async () => {
    const header = await sign(payload, now);
    const hex = header.split('v1=')[1];
    const multi = `t=${now},v1=deadbeef,v1=${hex}`;
    expect(await verifyStripeSignature({ payload, header: multi, secret: SECRET, nowSec: now })).toBe(true);
  });
});
