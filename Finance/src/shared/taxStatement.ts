// Annual Contribution Statement shared by preview and email rendering.
// Keep this module DOM-free so it works in both React and Cloudflare Workers.

export const CHURCH_INFO = {
  nameEn: 'Bread of Life Christian Church on the Plateau',
  nameZh: '西雅圖信望愛靈糧堂',
  address: '65 Front St. S. Issaquah, WA 98027',
  phone: '(425) 246-0264',
  website: 'https://www.bolccop.org',
  email: 'BOLCCOP@Gmail.com',
  signatureUrl: 'https://church-finance.bolccop.org/Signature/signature.png',
  signerName: 'LingLing Chang Yu, President'
};

export interface TaxStatementMember {
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  address?: string;
  city?: string;
  stateRegion?: string;
  postalCode?: string;
}

export interface TaxStatementOffering {
  memberId: string | null;
  amount: number;
  date: string;
  categoryName?: string;
  methodName?: string;
}

export interface TaxStatementGift {
  date: string;
  fund: string;
  method: string;
  amount: number;
}

export interface TaxStatementData {
  year: number;
  donorName: string;
  donorAddress: string;
  gifts: TaxStatementGift[];
  total: number;
}

export interface TaxStatementTextFields {
  churchNameEn: string;
  churchNameZh: string;
  churchAddress: string;
  churchPhone: string;
  churchWebsite: string;
  appreciation: string;
  notice: string;
  disclosure: string;
  signerName: string;
}

export interface TaxStatementSettings {
  mailFrom: string;
  replyTo: string;
  signatureUrl: string;
  textFields: TaxStatementTextFields;
  htmlTemplate: string;
}

export const DEFAULT_TAX_STATEMENT_TEXT_FIELDS: TaxStatementTextFields = {
  churchNameEn: CHURCH_INFO.nameEn,
  churchNameZh: CHURCH_INFO.nameZh,
  churchAddress: CHURCH_INFO.address,
  churchPhone: CHURCH_INFO.phone,
  churchWebsite: CHURCH_INFO.website,
  appreciation: 'Your contribution to the church is gratefully appreciated.',
  notice: 'If there is any discrepancy from your own records, please feel free to call the Church Office at {{churchPhone}}.',
  disclosure: `No goods or services were provided in exchange for the contributions listed above, other than intangible religious benefits. ${CHURCH_INFO.nameEn} is a tax-exempt religious organization under Section 501(c)(3) of the Internal Revenue Code. Please retain this statement for your tax records.`,
  signerName: CHURCH_INFO.signerName
};

export const DEFAULT_MAIL_FROM = `${CHURCH_INFO.nameEn} <giving@bolccop.org>`;
export const DEFAULT_REPLY_TO = 'bolccop@gmail.com';

export const DEFAULT_TAX_STATEMENT_HTML_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{{year}} Annual Contribution Statement</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef1f6; color: #172033;
         font-family: Georgia, 'Times New Roman', serif; }
  .sheet { position: relative; width: 210mm; min-height: 297mm; margin: 24px auto; background: #fff;
           padding: 20mm 22mm; }
  .org { text-align: center; }
  .org h1 { margin: 0; font-size: 21px; letter-spacing: 0.1em;
            text-transform: uppercase; color: #172033; }
  .org .zh { margin: 5px 0 0; font-size: 14px; color: #68758a; letter-spacing: 0.2em; }
  .rule { height: 3px; background: #f7c948; margin: 14px 0 10px; }
  .org .meta { margin: 0; font-size: 12px; color: #68758a; }
  .title { text-align: center; margin: 30px 0 22px; font-size: 15px; font-weight: 700;
           letter-spacing: 0.12em; text-transform: uppercase; color: #1f3358; }

  .donor { width: 100%; border-collapse: collapse; margin: 0 0 24px; }
  .donor td { padding: 4px 0; vertical-align: top; }
  .donor .donor-label { width: 156px; color: #68758a; text-transform: uppercase;
                        letter-spacing: 0.06em; font-size: 11px; }
  .donor .donor-value { color: #172033; font-size: 13px; }

  .gifts { width: 100%; border-collapse: collapse; font-size: 13px; }
  .gifts th { text-align: left; padding: 9px 10px; background: #f4f6fa;
              border-bottom: 2px solid #172033; color: #1f3358;
              text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; }
  .gifts tbody td { padding: 9px 10px; border-bottom: 1px solid #e6eaf1; }
  .gifts tfoot td { padding: 12px 10px; border-top: 2px solid #172033;
                    font-weight: 700; font-size: 14px; color: #172033; }
  .gifts .amt { text-align: right; white-space: nowrap; }

  .appreciation { margin: 22px 0 0; font-size: 13px; color: #172033; }
  .notice { margin: 8px 0 0; font-size: 12px; color: #68758a; line-height: 1.6; }
  .disclosure { margin: 20px 0 0; padding: 16px 18px; background: #f8fafc;
                border-left: 3px solid #f7c948; font-size: 12px;
                line-height: 1.7; color: #3b465c; }

  .sign { width: 100%; border-collapse: collapse; margin-top: 44px; }
  .sign .sign-cell { width: 46%; vertical-align: bottom; }
  .sign .sign-gap { width: 8%; }
  .mark { width: 100%; border-collapse: collapse; }
  .mark td { vertical-align: bottom; }
  .sign-img { display: block; max-height: 54px; max-width: 100%; }
  .date-value { font-size: 13px; color: #172033; }
  .sign-label { border-top: 1px solid #8a96a8; padding-top: 6px; margin-top: 2px;
                font-size: 12px; color: #3b465c; }

  @media print {
    body { background: #fff; }
    .sheet { margin: 0; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="org">
      <h1>{{churchNameEn}}</h1>
      <p class="zh">{{churchNameZh}}</p>
      <div class="rule"></div>
      <p class="meta">{{churchAddress}} · {{churchWebsiteDisplay}}</p>
    </div>

    <p class="title">{{year}} Annual Contribution Statement</p>

    <table class="donor" cellpadding="0" cellspacing="0">
      <tbody>{{donorRows}}</tbody>
    </table>

    <table class="gifts" cellpadding="0" cellspacing="0">
      <thead>
        <tr><th>Date</th><th>Fund</th><th>Method</th><th class="amt">Amount</th></tr>
      </thead>
      <tbody>{{giftRows}}</tbody>
      <tfoot>
        <tr>
          <td colspan="3">Total Contributions ({{giftCount}} {{giftLabel}})</td>
          <td class="amt">{{total}}</td>
        </tr>
      </tfoot>
    </table>

    <p class="appreciation">{{appreciation}}</p>
    <p class="notice">{{notice}}</p>
    <p class="disclosure">{{disclosure}}</p>

    <table class="sign" cellpadding="0" cellspacing="0">
      <tbody>
        <tr>
          <td class="sign-cell">
            <table class="mark" cellpadding="0" cellspacing="0"><tbody><tr>
              <td height="56"><img class="sign-img" src="{{signatureUrl}}" alt="Authorized signature" /></td>
            </tr></tbody></table>
            <div class="sign-label">{{signerName}}</div>
          </td>
          <td class="sign-gap"></td>
          <td class="sign-cell">
            <table class="mark" cellpadding="0" cellspacing="0"><tbody><tr>
              <td height="56"><span class="date-value">{{statementDate}}</span></td>
            </tr></tbody></table>
            <div class="sign-label">Date</div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <script>
    (function () {
      var sheet = document.querySelector('.sheet');
      if (!sheet) return;
      function fit() {
        sheet.style.zoom = '';
        var avail = document.documentElement.clientWidth;
        var w = sheet.offsetWidth;
        if (w > avail + 1) sheet.style.zoom = String(avail / w);
      }
      function clear() { sheet.style.zoom = ''; }
      window.addEventListener('resize', fit);
      window.addEventListener('beforeprint', clear);
      window.addEventListener('afterprint', fit);
      fit();
    })();
  </script>
</body>
</html>`;

export const DEFAULT_TAX_STATEMENT_SETTINGS: TaxStatementSettings = {
  mailFrom: DEFAULT_MAIL_FROM,
  replyTo: DEFAULT_REPLY_TO,
  signatureUrl: CHURCH_INFO.signatureUrl,
  textFields: DEFAULT_TAX_STATEMENT_TEXT_FIELDS,
  htmlTemplate: DEFAULT_TAX_STATEMENT_HTML_TEMPLATE
};

const labelMap: Record<string, string> = {
  '主日奉献': 'Sunday Offering',
  '主日奉獻': 'Sunday Offering',
  '特殊奉献': 'Special Offering',
  '特殊奉獻': 'Special Offering',
  '祈祷会': 'Prayer Meeting',
  '祈禱會': 'Prayer Meeting',
  '线上奉献': 'Online Giving',
  '線上奉獻': 'Online Giving',
  '現金': 'Cash',
  '现金': 'Cash',
  '支票': 'Check',
  '轉帳': 'Bank Transfer',
  '转帐': 'Bank Transfer',
  '轉賬': 'Bank Transfer',
  '转账': 'Bank Transfer'
};

function donorDisplayName(member: TaxStatementMember): string {
  const en = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
  const zh = (member.name || '').trim();
  if (en && zh && en !== zh) return `${en} (${zh})`;
  return en || zh;
}

export function buildTaxStatementData(
  member: TaxStatementMember,
  memberId: string,
  offerings: TaxStatementOffering[],
  year: number
): TaxStatementData {
  const yearStr = String(year);
  const gifts = offerings
    .filter(o => o.memberId === memberId && (o.date || '').slice(0, 4) === yearStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(o => ({
      date: o.date,
      fund: o.categoryName || '-',
      method: o.methodName || '-',
      amount: o.amount
    }));
  const total = gifts.reduce((sum, g) => sum + g.amount, 0);
  const donorAddress = [member.address, member.city, member.stateRegion, member.postalCode]
    .filter(Boolean)
    .join(', ');
  return { year, donorName: donorDisplayName(member), donorAddress, gifts, total };
}

export function normalizeTaxStatementSettings(settings?: Partial<TaxStatementSettings> | null): TaxStatementSettings {
  const textFields = { ...DEFAULT_TAX_STATEMENT_TEXT_FIELDS, ...(settings?.textFields || {}) };
  return {
    mailFrom: settings?.mailFrom || DEFAULT_TAX_STATEMENT_SETTINGS.mailFrom,
    replyTo: settings?.replyTo || DEFAULT_TAX_STATEMENT_SETTINGS.replyTo,
    signatureUrl: settings?.signatureUrl || DEFAULT_TAX_STATEMENT_SETTINGS.signatureUrl,
    textFields,
    htmlTemplate: settings?.htmlTemplate || DEFAULT_TAX_STATEMENT_SETTINGS.htmlTemplate
  };
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
}

function formatLongDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function esc(value: string | number): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function translateGivingLabel(value: string): string {
  const trimmed = String(value || '').trim();
  return labelMap[trimmed] || trimmed;
}

function interpolateText(value: string, tokens: Record<string, string>): string {
  return value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => tokens[key] ?? '');
}

function replacePlaceholders(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => tokens[key] ?? '');
}

function websiteDisplay(value: string): string {
  return String(value || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function normalizeRenderedTaxStatementHtml(html: string, address: string, website: string): string {
  const displayWebsite = websiteDisplay(website);
  let next = html.replace(/\s*<div class="footer">[\s\S]*?<\/div>\s*/g, '\n');
  if (displayWebsite && address && !next.includes(displayWebsite)) {
    next = next.replace(
      `<p class="meta">${address}</p>`,
      `<p class="meta">${address} · ${displayWebsite}</p>`
    );
  }
  return next;
}

export function buildTaxStatementHtml(
  data: TaxStatementData,
  statementDateIso?: string,
  rawSettings?: Partial<TaxStatementSettings> | null
): string {
  const settings = normalizeTaxStatementSettings(rawSettings);
  const statementDate = formatLongDate(statementDateIso || new Date().toISOString().slice(0, 10));
  const giftRows = data.gifts.map(gift => `
        <tr>
          <td>${esc(formatLongDate(gift.date))}</td>
          <td>${esc(translateGivingLabel(gift.fund))}</td>
          <td>${esc(translateGivingLabel(gift.method))}</td>
          <td class="amt">${esc(formatUsd(gift.amount))}</td>
        </tr>`).join('') || `
        <tr><td colspan="4" style="text-align:center;color:#68758a;padding:20px;">No contributions recorded for this year.</td></tr>`;
  const giftCount = data.gifts.length;
  const donorRow = (label: string, value: string) => `
        <tr>
          <td class="donor-label">${esc(label)}</td>
          <td class="donor-value">${value || '&mdash;'}</td>
        </tr>`;
  const baseTokens: Record<string, string> = {
    year: esc(data.year),
    contributorName: esc(data.donorName),
    contributorAddress: esc(data.donorAddress),
    donorName: esc(data.donorName),
    donorAddress: esc(data.donorAddress),
    statementDate: esc(statementDate),
    taxYear: `January 1 &ndash; December 31, ${esc(data.year)}`,
    giftRows,
    giftCount: esc(giftCount),
    giftLabel: giftCount === 1 ? 'gift' : 'gifts',
    total: esc(formatUsd(data.total)),
    totalAmount: esc(formatUsd(data.total)),
    signatureUrl: esc(settings.signatureUrl)
  };

  const textTokens: Record<string, string> = {
    ...baseTokens,
    churchNameEn: esc(settings.textFields.churchNameEn),
    churchNameZh: esc(settings.textFields.churchNameZh),
    churchAddress: esc(settings.textFields.churchAddress),
    churchPhone: esc(settings.textFields.churchPhone),
    churchWebsite: esc(settings.textFields.churchWebsite),
    churchWebsiteDisplay: esc(websiteDisplay(settings.textFields.churchWebsite)),
    signerName: esc(settings.textFields.signerName)
  };

  const appreciation = interpolateText(settings.textFields.appreciation, textTokens);
  const notice = interpolateText(settings.textFields.notice, textTokens);
  const disclosure = interpolateText(settings.textFields.disclosure, textTokens);
  const tokens: Record<string, string> = {
    ...textTokens,
    appreciation: esc(appreciation),
    notice: esc(notice),
    disclosure: esc(disclosure),
    donorRows: donorRow('Contributor', baseTokens.contributorName) +
      donorRow('Mailing Address', baseTokens.contributorAddress) +
      donorRow('Statement Date', baseTokens.statementDate) +
      donorRow('Tax Year', baseTokens.taxYear)
  };

  return normalizeRenderedTaxStatementHtml(
    replacePlaceholders(settings.htmlTemplate, tokens),
    textTokens.churchAddress,
    textTokens.churchWebsite
  );
}
