// Pure helpers for the admin mailbox (contact inbox + prayer requests).
// No Worker / D1 dependencies → unit-testable.

export interface Geo {
  country: string | null;
  region: string | null;
  city: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Pull country/region/city from Cloudflare's request.cf (undefined in local dev). */
export function extractGeo(cf: unknown): Geo {
  if (!cf || typeof cf !== 'object') return { country: null, region: null, city: null };
  const c = cf as Record<string, unknown>;
  return {
    country: str(c.country),
    region: str(c.region) ?? str(c.regionCode),
    city: str(c.city),
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  ));
}

export type MailboxKind = 'inbox' | 'prayer';

export interface ReplyParent {
  firstName: string;
  lastName: string;
  email: string;
  message: string;
}

/** 回信模板：開頭稱呼（{name} 代表對方姓名）與結尾署名（可多行）。 */
export interface ReplyTemplate {
  greeting: string;
  signature: string;
}

export const DEFAULT_REPLY_TEMPLATE: ReplyTemplate = {
  greeting: '親愛的 {name}：',
  signature: '信望愛靈糧堂 Lingling 敬上',
};

/** Build the reply email {subject, html}: escaped body + a quote of the original. */
export function buildReplyEmail(
  kind: MailboxKind,
  parent: ReplyParent,
  body: string,
  template: ReplyTemplate = DEFAULT_REPLY_TEMPLATE,
): { subject: string; html: string } {
  const subject = kind === 'prayer' ? '回覆您的代禱請求' : 'Re: 您寄給信望愛靈糧堂的訊息';
  const name = `${parent.firstName ?? ''} ${parent.lastName ?? ''}`.trim() || parent.email;
  const bodyHtml = escapeHtml(body).replace(/\n/g, '<br>');
  const quoted = escapeHtml(parent.message ?? '').replace(/\n/g, '<br>');
  // 空白模板字段回退預設；先代入姓名再整體轉義（姓名裏的 HTML 一併安全處理）
  const greetingRaw = template.greeting.trim() || DEFAULT_REPLY_TEMPLATE.greeting;
  const signatureRaw = template.signature.trim() || DEFAULT_REPLY_TEMPLATE.signature;
  const greeting = escapeHtml(greetingRaw.split('{name}').join(name));
  const signature = escapeHtml(signatureRaw).replace(/\n/g, '<br>');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#172033;max-width:560px;line-height:1.6;">
  <p style="margin:0 0 12px;">${greeting}</p>
  <div style="margin:0 0 16px;">${bodyHtml}</div>
  <p style="margin:16px 0 4px;color:#555;">${signature}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
  <div style="color:#888;font-size:12px;">
    <p style="margin:0 0 6px;">您先前的來信：</p>
    <blockquote style="margin:0;padding:8px 12px;border-left:3px solid #ddd;color:#666;">${quoted}</blockquote>
  </div>
</div>`;
  return { subject, html };
}
