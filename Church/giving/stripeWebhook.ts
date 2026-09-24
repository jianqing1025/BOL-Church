/**
 * Stripe webhook 簽章驗證。
 *
 * 與 mailbox/inbound.ts 的 Svix 驗證不同，不要照抄：
 *   - Stripe 把整串 whsec_... 當 HMAC 金鑰直接用（UTF-8），Svix 是去前綴後 base64 解碼
 *   - Stripe 簽章是 hex，Svix 是 base64
 *
 * 簽章內容為 `${timestamp}.${rawBody}`，其中 rawBody 必須是**未經解析的原始字串**。
 * 先 JSON.parse 再 stringify 會改變位元組，簽章就對不上了。
 */

export type StripeSignatureParts = {
  timestamp: number;
  signatures: string[];
};

// 時間戳只接受純數字（Stripe 一律送十進位整數秒）。
// 拒絕空字串、科學記號（1e10）、十六進位（0x64）、帶正負號或小數點等寫法——
// 這些若被 Number() 接受，會讓時間戳語意不明確，也會讓簽章驗證時重新組出的
// `${timestamp}.${payload}` 字串跟 Stripe 實際簽的原文不一致。
const TIMESTAMP_RE = /^\d+$/;

// header 的型別必須保留 string | null：真正的來源是
// request.headers.get('Stripe-Signature')，本來就可能是 null；
// 若把型別寫死成 string，日後有人繞過 verifyStripeSignature 的守門、
// 單獨呼叫這個函式時，就會誤以為呼叫端已經排除了 null。
export function parseStripeSignatureHeader(header: string | null): StripeSignatureParts | null {
  if (!header) return null;
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const scheme = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (scheme === 't') {
      if (TIMESTAMP_RE.test(value)) timestamp = Number(value);
    } else if (scheme === 'v1') {
      signatures.push(value);
    }
  }

  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/**
 * 定時比較，避免以回應時間推測正確簽章。
 *
 * 迴圈必須讀完每一個字元、用 OR 把差異累加起來，絕對不能「簡化」成一發現
 * 不同就 return false 的提早返回寫法。提早返回在輸入輸出的層次看不出差異
 * （回傳值一樣是 true/false，單元測試也測不出來），卻會依實際比對到第幾個
 * 字元而耗時不同，重新引入可被外部量測的 timing side channel。
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export type VerifyParams = {
  /** 未經解析的原始請求 body */
  payload: string;
  /** Stripe-Signature 標頭 */
  header: string | null;
  /** whsec_ 開頭的 webhook 簽章密鑰 */
  secret: string;
  nowSec?: number;
  toleranceSec?: number;
};

export async function verifyStripeSignature(p: VerifyParams): Promise<boolean> {
  if (!p.secret || !p.header) return false;

  const parsed = parseStripeSignatureHeader(p.header);
  if (!parsed) return false;

  const now = p.nowSec ?? Math.floor(Date.now() / 1000);
  const tolerance = p.toleranceSec ?? 300;
  if (Math.abs(now - parsed.timestamp) > tolerance) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(p.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${parsed.timestamp}.${p.payload}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return parsed.signatures.some(sig => timingSafeEqual(sig.toLowerCase(), expected));
}
