// 入站郵件（對方回信進收件箱）的純邏輯：thread 專屬 Reply-To 地址的生成與解析、
// 入站正文提取、Resend(Svix) webhook 簽名校驗。無 Worker/D1 依賴，可單元測試。

export type ThreadParentType = 'message' | 'prayer';

export interface InboundThread {
  parentType: ThreadParentType;
  id: string;
}

/** 每個 thread 唯一的 Reply-To：reply+m-<id>@域名（訊息）/ reply+p-<id>@域名（代禱）。 */
export function threadReplyAddress(parentType: ThreadParentType, id: string, domain: string): string {
  return `reply+${parentType === 'message' ? 'm' : 'p'}-${id}@${domain}`;
}

const THREAD_ADDR_RE = /reply\+([mp])-([^@>\s]+)@/i;

/**
 * 從入站郵件的收件人列表解析 thread。兼容純地址、"Name <addr>"、
 * 單一字串或字串數組；取第一個匹配。id 保留原大小寫（uuid 存儲原樣）。
 */
export function parseThreadFromRecipients(to: unknown): InboundThread | null {
  const list: string[] = typeof to === 'string'
    ? [to]
    : Array.isArray(to)
      ? to.map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object') {
            const o = entry as Record<string, unknown>;
            return String(o.address ?? o.email ?? '');
          }
          return '';
        })
      : [];
  for (const addr of list) {
    const m = THREAD_ADDR_RE.exec(addr);
    if (m) {
      return { parentType: m[1].toLowerCase() === 'm' ? 'message' : 'prayer', id: m[2] };
    }
  }
  return null;
}

/** 入站正文：優先純文字；否則剝掉 HTML 標籤；再否則空字串。 */
export function extractInboundBody(data: { text?: string | null; html?: string | null }): string {
  const text = (data.text ?? '').trim();
  if (text) return text;
  const html = (data.html ?? '').trim();
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 引用歷史的起始標記（按行匹配）：Outlook 下劃線分隔線、Original Message、
// "On ... wrote:"、中文「在…寫道：」、郵件頭（发件人/發件人/From:）、> 引用行、
// 以及我們自己回信模板裏的「您先前的來信：」
const QUOTE_MARKERS: RegExp[] = [
  /^_{10,}\s*$/,
  /^-{3,}\s*Original Message\s*-{3,}/i,
  /^On .{0,200} wrote:\s*$/,
  /^在.{0,80}(寫道|写道)[:：]\s*$/,
  /^(发件人|發件人|From)[:：]/,
  /^>/,
  /^您先前的來信[:：]\s*$/,
];

/**
 * 剝掉郵件客戶端自動附帶的引用歷史，只留對方新寫的內容。
 * 從第一個引用標記行起裁掉；若裁完為空則回退原文（寧可多顯示，不丟內容）。
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (QUOTE_MARKERS.some((re) => re.test(lines[i]))) { cut = i; break; }
  }
  const stripped = lines.slice(0, cut).join('\n').trim();
  return stripped || text.trim();
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** 常數時間比較，避免簽名比對的 timing 泄露。 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface SvixVerifyParams {
  /** Resend webhook signing secret（whsec_ 開頭） */
  secret: string;
  /** svix-id 請求頭 */
  id: string;
  /** svix-timestamp 請求頭（unix 秒） */
  timestamp: string;
  /** 原始請求體（必須是未經解析的原文） */
  payload: string;
  /** svix-signature 請求頭（可含多個空格分隔的 v1,<sig>） */
  signatureHeader: string;
  /** 注入當前時間（秒）便於測試；預設 Date.now()/1000 */
  nowSec?: number;
  /** 時間戳容差（秒），預設 300 */
  toleranceSec?: number;
}

/** 手寫 Svix(Resend webhook) HMAC-SHA256 簽名校驗——Workers 無第三方依賴。 */
export async function verifySvixSignature(p: SvixVerifyParams): Promise<boolean> {
  if (!p.secret.startsWith('whsec_')) return false;
  const now = p.nowSec ?? Math.floor(Date.now() / 1000);
  const ts = Number(p.timestamp);
  const tolerance = p.toleranceSec ?? 300;
  if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) return false;

  let keyBytes: Uint8Array;
  try { keyBytes = base64ToBytes(p.secret.slice('whsec_'.length)); } catch { return false; }

  const signedContent = `${p.id}.${p.timestamp}.${p.payload}`;
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent));
  const expected = bytesToBase64(new Uint8Array(sig));

  return p.signatureHeader.split(/\s+/).some((part) => {
    const comma = part.indexOf(',');
    if (comma < 0) return false;
    return part.slice(0, comma) === 'v1' && timingSafeEqual(part.slice(comma + 1), expected);
  });
}
