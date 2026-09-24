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

  it('大寫十六進位簽章也算正確（Stripe 只送小寫，但驗證不應區分大小寫）', async () => {
    const header = await sign(payload, now);
    const hex = header.split('v1=')[1];
    const upperHeader = `t=${now},v1=${hex.toUpperCase()}`;
    expect(await verifyStripeSignature({ payload, header: upperHeader, secret: SECRET, nowSec: now })).toBe(true);
  });

  it('標頭出現兩個 t= 時以最後一個為準', async () => {
    // 刻意讓「取第一個」與「取最後一個」得到不同結果：staleTimestamp 遠超容忍度，
    // 若解析誤用第一個 t=，會直接被容忍度擋下而回傳 false；只有取最後一個（now，
    // 且與簽章實際簽的時間戳一致）才會通過。
    const staleTimestamp = now - 1000;
    const header = await sign(payload, now);
    const hex = header.split('v1=')[1];
    const duplicateTimestampHeader = `t=${staleTimestamp},t=${now},v1=${hex}`;
    expect(
      await verifyStripeSignature({ payload, header: duplicateTimestampHeader, secret: SECRET, nowSec: now }),
    ).toBe(true);
  });
});

describe('verifyStripeSignature 全長比對（防止簽章比對被截斷成只比對開頭幾碼）', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
  const now = 1700000000;

  /** 十六進位字元位移到另一個值，保證與原字元不同 */
  function flipHexChar(c: string): string {
    const digit = parseInt(c, 16);
    return ((digit + 1) % 16).toString(16);
  }

  async function correctHex(): Promise<string> {
    const header = await sign(payload, now);
    const hex = header.split('v1=')[1];
    expect(hex).toHaveLength(64);
    return hex;
  }

  it('前 32 碼相同、後 32 碼皆不同則不通過', async () => {
    const hex = await correctHex();
    const prefix = hex.slice(0, 32);
    const originalTail = hex.slice(32);
    const forgedTail = originalTail.split('').map(flipHexChar).join('');
    expect(forgedTail).not.toBe(originalTail);
    const candidate = prefix + forgedTail;
    expect(candidate).not.toBe(hex);
    const header = `t=${now},v1=${candidate}`;
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now })).toBe(false);
  });

  it('僅最後一碼不同則不通過', async () => {
    const hex = await correctHex();
    const lastChar = hex.slice(-1);
    const flipped = flipHexChar(lastChar);
    expect(flipped).not.toBe(lastChar);
    const candidate = hex.slice(0, -1) + flipped;
    expect(candidate).not.toBe(hex);
    expect(candidate).toHaveLength(hex.length);
    const header = `t=${now},v1=${candidate}`;
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now })).toBe(false);
  });

  it('僅第一碼不同則不通過', async () => {
    const hex = await correctHex();
    const firstChar = hex.slice(0, 1);
    const flipped = flipHexChar(firstChar);
    expect(flipped).not.toBe(firstChar);
    const candidate = flipped + hex.slice(1);
    expect(candidate).not.toBe(hex);
    expect(candidate).toHaveLength(hex.length);
    const header = `t=${now},v1=${candidate}`;
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now })).toBe(false);
  });

  it('少一碼（63 碼，截斷）則不通過', async () => {
    const hex = await correctHex();
    const truncated = hex.slice(0, 63);
    expect(truncated).toHaveLength(63);
    const header = `t=${now},v1=${truncated}`;
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now })).toBe(false);
  });

  it('多一碼（65 碼，附加）則不通過', async () => {
    const hex = await correctHex();
    const extended = `${hex}0`;
    expect(extended).toHaveLength(65);
    const header = `t=${now},v1=${extended}`;
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now })).toBe(false);
  });
});
