/** 同工週報：週次、密碼通行證、附件檢查。純函式，前後端共用。 */

export const ACCESS_TTL_DAYS = 30;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** 一週從週日開始；回傳該週的週日 'YYYY-MM-DD'。 */
export function sundayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

/**
 * 通行證 `<到期毫秒>.<HMAC>`。金鑰用的是密碼雜湊：一改密碼，
 * 所有舊通行證就驗不過，不必另外記錄誰登入過。
 */
export async function issueAccessToken(secret: string, now = new Date(), ttlDays = ACCESS_TTL_DAYS): Promise<string> {
  const exp = String(now.getTime() + ttlDays * 86_400_000);
  return `${exp}.${await sign(secret, exp)}`;
}

export async function verifyAccessToken(secret: string, token: string | null | undefined, now = new Date()): Promise<boolean> {
  const [exp, sig, extra] = String(token || '').split('.');
  if (!exp || !sig || extra !== undefined || !/^\d+$/.test(exp)) return false;
  if (Number(exp) <= now.getTime()) return false;
  return (await sign(secret, exp)) === sig;
}

const ALLOWED_NAMES = [/\.pdf$/i, /\.docx?$/i, /\.(png|jpe?g|gif|webp|heic)$/i];

/** 附件只收 PDF、Word、圖片，單檔 20 MB。回傳問題種類，沒問題回 null。 */
export function attachmentProblem(name: string, type: string, size: number): 'type' | 'size' | null {
  const okType = ALLOWED_NAMES.some(re => re.test(name)) || type === 'application/pdf' || type.startsWith('image/');
  if (!okType) return 'type';
  if (size > MAX_ATTACHMENT_BYTES) return 'size';
  return null;
}
