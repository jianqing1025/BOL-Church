// 年度奉獻報稅證明（Annual Contribution Statement）
// 此模組同時被前端（預覽）與後端（寄信）匯入，務必保持環境中立（不依賴 DOM）。

export const CHURCH_INFO = {
  nameEn: 'Bread of Life Christian Church on the Plateau',
  nameZh: '西雅图信望爱灵粮堂',
  address: '65 Front St. S. Issaquah, WA 98027',
  phone: '(425) 246-0264',
  website: 'https://www.bolccop.org',
  email: 'BOLCCOP@Gmail.com',
  // 簽名圖片：已上傳至 R2（church-finance bucket，物件 key = Signature/signature.png）。
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

function donorDisplayName(member: TaxStatementMember): string {
  const en = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
  const zh = (member.name || '').trim();
  if (en && zh && en !== zh) return `${en} (${zh})`;
  return en || zh;
}

// 聚合某成員某年度的所有奉獻為報稅證明資料
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
      fund: o.categoryName || '—',
      method: o.methodName || '—',
      amount: o.amount
    }));
  const total = gifts.reduce((sum, g) => sum + g.amount, 0);
  const donorAddress = [member.address, member.city, member.stateRegion, member.postalCode]
    .filter(Boolean)
    .join(', ');
  return { year, donorName: donorDisplayName(member), donorAddress, gifts, total };
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
}

function formatLongDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function esc(value: string): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 產生自包含的英文報稅證明 HTML，固定 A4 紙張（預覽 iframe 與 HTML 郵件共用）
export function buildTaxStatementHtml(data: TaxStatementData, statementDateIso?: string): string {
  const statementDate = formatLongDate(statementDateIso || new Date().toISOString().slice(0, 10));
  const giftRows = data.gifts.map(gift => `
        <tr>
          <td>${esc(formatLongDate(gift.date))}</td>
          <td>${esc(gift.fund)}</td>
          <td>${esc(gift.method)}</td>
          <td class="amt">${esc(formatUsd(gift.amount))}</td>
        </tr>`).join('');
  const giftCount = data.gifts.length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(String(data.year))} Annual Contribution Statement</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef1f6; color: #172033;
         font-family: Georgia, 'Times New Roman', serif; }
  .sheet { width: 210mm; min-height: 297mm; margin: 24px auto; background: #fff;
           padding: 20mm 22mm; display: flex; flex-direction: column;
           box-shadow: 0 10px 30px rgba(25, 41, 70, 0.12); }
  .org { text-align: center; }
  .org h1 { margin: 0; font-size: 21px; letter-spacing: 0.1em;
            text-transform: uppercase; color: #172033; }
  .org .zh { margin: 5px 0 0; font-size: 14px; color: #68758a; letter-spacing: 0.2em; }
  .rule { height: 3px; background: #f7c948; margin: 14px 0 10px; }
  .org .meta { margin: 0; font-size: 12px; color: #68758a; }
  .title { text-align: center; margin: 30px 0 24px; font-size: 15px; font-weight: 700;
           letter-spacing: 0.12em; text-transform: uppercase; color: #1f3358; }
  .donor { display: grid; grid-template-columns: 140px 1fr; gap: 7px 14px;
           font-size: 13px; margin: 0 0 22px; }
  .donor dt { color: #68758a; text-transform: uppercase; letter-spacing: 0.06em; font-size: 11px; }
  .donor dd { margin: 0; color: #172033; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { text-align: left; padding: 9px 10px; background: #f4f6fa;
             border-bottom: 2px solid #172033; color: #1f3358;
             text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; }
  tbody td { padding: 9px 10px; border-bottom: 1px solid #e6eaf1; }
  .amt { text-align: right; white-space: nowrap; }
  tfoot td { padding: 12px 10px; border-top: 2px solid #172033;
             font-weight: 700; font-size: 14px; color: #172033; }
  .appreciation { margin: 22px 0 0; font-size: 13px; color: #172033; }
  .notice { margin: 8px 0 0; font-size: 12px; color: #68758a; line-height: 1.6; }
  .disclosure { margin: 20px 0 0; padding: 16px 18px; background: #f8fafc;
                border-left: 3px solid #f7c948; font-size: 12px;
                line-height: 1.7; color: #3b465c; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 40px; }
  .sign-mark { min-height: 62px; display: flex; align-items: flex-end; }
  .sign-mark img { max-height: 58px; max-width: 100%; }
  .sign-mark .date-value { font-size: 13px; color: #172033; padding-bottom: 2px; }
  .sign-label { margin-top: 4px; border-top: 1px solid #8a96a8; padding-top: 6px;
                font-size: 12px; color: #3b465c; }
  .footer { margin-top: auto; padding-top: 26px; }
  .footer a { font-size: 12px; color: #1f3358; text-decoration: none; }
  @media print {
    body { background: #fff; }
    .sheet { box-shadow: none; margin: 0; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="org">
      <h1>${esc(CHURCH_INFO.nameEn)}</h1>
      <p class="zh">${esc(CHURCH_INFO.nameZh)}</p>
      <div class="rule"></div>
      <p class="meta">${esc(CHURCH_INFO.address)}</p>
    </div>

    <p class="title">${esc(String(data.year))} Annual Contribution Statement</p>

    <dl class="donor">
      <dt>Contributor</dt><dd>${esc(data.donorName) || '&mdash;'}</dd>
      <dt>Mailing Address</dt><dd>${esc(data.donorAddress) || '&mdash;'}</dd>
      <dt>Statement Date</dt><dd>${esc(statementDate)}</dd>
      <dt>Tax Year</dt><dd>January 1 &ndash; December 31, ${esc(String(data.year))}</dd>
    </dl>

    <table>
      <thead>
        <tr><th>Date</th><th>Fund</th><th>Method</th><th class="amt">Amount</th></tr>
      </thead>
      <tbody>${giftRows || `
        <tr><td colspan="4" style="text-align:center;color:#68758a;padding:20px;">No contributions recorded for this year.</td></tr>`}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3">Total Contributions (${giftCount} ${giftCount === 1 ? 'gift' : 'gifts'})</td>
          <td class="amt">${esc(formatUsd(data.total))}</td>
        </tr>
      </tfoot>
    </table>

    <p class="appreciation">Your contribution to the church is gratefully appreciated.</p>
    <p class="notice">
      If there is any discrepancy from your own records, please feel free to call
      the Church Office at ${esc(CHURCH_INFO.phone)}.
    </p>

    <p class="disclosure">
      No goods or services were provided in exchange for the contributions listed
      above, other than intangible religious benefits. ${esc(CHURCH_INFO.nameEn)} is a
      tax-exempt religious organization under Section 501(c)(3) of the Internal
      Revenue Code. Please retain this statement for your tax records.
    </p>

    <div class="sign">
      <div>
        <div class="sign-mark"><img src="${CHURCH_INFO.signatureUrl}" alt="Authorized signature" /></div>
        <div class="sign-label">${esc(CHURCH_INFO.signerName)}</div>
      </div>
      <div>
        <div class="sign-mark"><span class="date-value">${esc(statementDate)}</span></div>
        <div class="sign-label">Date</div>
      </div>
    </div>

    <div class="footer">
      <a href="${CHURCH_INFO.website}">${esc(CHURCH_INFO.website)}</a>
    </div>
  </div>
</body>
</html>`;
}
