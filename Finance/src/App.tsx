import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useFinance } from './context/FinanceContext';
import { LoginAnimation } from './components/LoginAnimation';
import { KpiCard, CategoryDoughnut, BudgetDoughnut, TrendLine, GroupedBar, CATEGORY_COLORS } from './components/dashboardCharts';
import type { AppSettings, AuditLog, Expense, ExpenseCategory, ExpenseStatus, ImportResult, Member, MemberStatus, Offering, OfferingCategory, OfferingMethod, Role, TaxStatementSettings, TaxStatementTextFields, User, UserAccount } from './types';
import { compactDate, currency, dateTime, shortDate, tinyDate } from './utils/format';
import { api } from './utils/api';
import { exportBackup, importBackup, TABLE_LABELS } from './utils/backup';
import { APP_VERSION } from './version';
import {
  DEFAULT_REPLY_TO,
  DEFAULT_TAX_STATEMENT_HTML_TEMPLATE,
  DEFAULT_TAX_STATEMENT_SETTINGS,
  DEFAULT_TAX_STATEMENT_TEXT_FIELDS,
  buildTaxStatementData,
  buildTaxStatementHtml,
  normalizeTaxStatementSettings
} from './shared/taxStatement';

type Page = 'dashboard' | 'members' | 'offerings' | 'expenses' | 'reports' | 'users' | 'account';
type AccountTab = 'profile' | 'password';
type ExpenseEmailAction = {
  expenseId: string;
  action: 'approve' | 'reject';
  token: string;
};

const PAGE_PATHS: Record<Page, string> = {
  dashboard: '/',
  members: '/members',
  offerings: '/offerings',
  expenses: '/expense',
  reports: '/reports',
  users: '/users',
  account: '/account'
};

function routeFromLocation(): { page: Page; accountTab: AccountTab } {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/members') return { page: 'members', accountTab: 'profile' };
  if (path === '/offerings' || path === '/offering') return { page: 'offerings', accountTab: 'profile' };
  if (path === '/expense' || path === '/expenses' || path === '/expense-action') return { page: 'expenses', accountTab: 'profile' };
  if (path === '/reports' || path === '/report') return { page: 'reports', accountTab: 'profile' };
  if (path === '/users') return { page: 'users', accountTab: 'profile' };
  if (path === '/account/password') return { page: 'account', accountTab: 'password' };
  if (path === '/account') return { page: 'account', accountTab: 'profile' };
  return { page: 'dashboard', accountTab: 'profile' };
}

function pathForPage(page: Page, accountTab: AccountTab = 'profile') {
  if (page === 'account' && accountTab === 'password') return '/account/password';
  return PAGE_PATHS[page];
}

function expenseEmailActionFromLocation(): ExpenseEmailAction | null {
  const params = new URLSearchParams(window.location.search);
  const expenseId = params.get('expenseId') || params.get('id') || '';
  const action = params.get('expenseAction') || params.get('action') || '';
  const token = params.get('token') || '';
  if (!expenseId || !token || (action !== 'approve' && action !== 'reject')) return null;
  return { expenseId, action, token };
}

function clearExpenseEmailActionFromUrl() {
  const url = new URL(window.location.href);
  ['expenseId', 'expenseAction', 'id', 'action', 'token'].forEach(key => url.searchParams.delete(key));
  const pathname = url.pathname === '/expense-action' ? '/expense' : url.pathname;
  window.history.replaceState({}, '', `${pathname}${url.search}${url.hash}`);
}

const roleLabels: Record<Role, string> = {
  super_admin: 'Super Admin',
  finance_admin: 'Admin',
  auditor: 'Reader',
  dev: 'Dev'
};

function userInitials(name?: string, email?: string): string {
  const n = (name || '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  return (email || '?').slice(0, 2).toUpperCase();
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1024;
      let { width, height } = img;
      if (width > height) {
        if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
      } else {
        if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.85);
    };
    img.src = url;
  });
}

const statusLabels: Record<MemberStatus, string> = {
  active: '活躍',
  inactive: '非活躍',
  visitor: '訪客'
};

const expenseStatusLabels: Record<ExpenseStatus, string> = {
  pending: '待審核',
  approved: '已批准',
  rejected: '已拒絕'
};

const DEFAULT_EXPENSE_NOTIFY_SUBJECT = '[新增支出] {{description}} · {{amount}}';
const DEFAULT_EXPENSE_NOTIFY_BODY = `<p>有新的支出記錄已提交，請審核。</p>
<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;border:1px solid #ddd;font-family:Arial,sans-serif;font-size:14px;">
<tr><td style="background:#f5f5f5;font-weight:bold;">描述</td><td>{{description}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">金額</td><td>{{amount}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">分類</td><td>{{category}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">日期</td><td>{{date}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">付款人</td><td>{{paidBy}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">提交人</td><td>{{submittedBy}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">備註</td><td>{{notes}}</td></tr>
<tr><td style="background:#f5f5f5;font-weight:bold;">附件</td><td>{{receiptLink}}</td></tr>
</table>
{{actionButtons}}
<p style="color:#888;font-size:12px;margin-top:16px;">此郵件由 BOLCCOP 財務系統自動發送。</p>`;

function expenseOperatorDisplay(memberById: Map<string, Member>, id: string | null | undefined, name: string | undefined, at: string | null | undefined): { name: string; at: string } | null {
  if (!id && !name && !at) return null;
  const member = id ? memberById.get(id) : null;
  const display = member ? memberDisplayName(member) : (name || '');
  const formattedAt = at ? compactDate(at.slice(0, 10)) : '';
  if (!display && !formattedAt) return null;
  return { name: display, at: formattedAt };
}

function ExpenseStatusOperator({ op }: { op: { name: string; at: string } | null }) {
  if (!op) return null;
  return (
    <span className="expense-status-op">
      {op.name && <span className="expense-status-op-name">{op.name}</span>}
      {op.at && <span className="expense-status-op-date">{op.at}</span>}
    </span>
  );
}

// 成員顯示格式：First Name Last Name (中文名)
function memberDisplayName(member?: Member | null): string {
  if (!member) return '';
  const en = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
  const zh = (member.name || '').trim();
  if (en && zh) return `${en} (${zh})`;
  return en || zh;
}

function LoginPage() {
  const { login, error, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focusField, setFocusField] = useState<'none' | 'email' | 'password'>('none');
  const [forgotOpen, setForgotOpen] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await login(email, password);
  };

  return (
    <main className="login-shell">
      <span className="login-dot dot-one" />
      <span className="login-dot dot-two" />
      <span className="login-dot dot-three" />
      <section className="login-panel">
        <div className="login-art">
          <LoginAnimation
            isTyping={focusField === 'email'}
            passwordLength={password.length}
            passwordVisible={passwordVisible}
          />
        </div>
        <div className="login-form-panel">
          <div>
            <p className="eyebrow">BOLCCOP Finance 2.0</p>
            <h1>信望愛靈糧堂財務系統</h1>
            <p className="muted">
              各人要照所得的恩賜彼此服事， 作 神百般恩賜的好管家。
              <span className="bible-reference">— 彼得前书 4:10  </span>
            </p>
          </div>
          <form onSubmit={submit} className="stack">
            <label>
              電子郵件
              <input
                value={email}
                onChange={event => setEmail(event.target.value)}
                onFocus={() => setFocusField('email')}
                onBlur={() => setFocusField('none')}
                type="email"
                required
              />
            </label>
            <label>
              密碼
              <div className="input-with-icon">
                <input
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  onFocus={() => setFocusField('password')}
                  onBlur={() => setFocusField('none')}
                  type={passwordVisible ? 'text' : 'password'}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setPasswordVisible(value => !value)}
                  aria-label={passwordVisible ? '隱藏密碼' : '顯示密碼'}
                >
                  {passwordVisible ? '🙈' : '👁️'}
                </button>
              </div>
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={loading}>登入</button>
            <button type="button" className="login-forgot" onClick={() => setForgotOpen(true)}>忘記密碼？</button>
          </form>
        </div>
      </section>
      {forgotOpen && <ForgotPasswordModal onClose={() => setForgotOpen(false)} />}
    </main>
  );
}

function ClaimPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [claimants, setClaimants] = useState<Array<{ id: string; name: string }>>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['現金', '銀行轉帳', '支票', '信用卡']);
  const [form, setForm] = useState({
    claimantMemberId: '',
    claimantName: '',
    claimantEmail: '',
    description: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    categoryId: '',
    paymentMethod: '現金',
    notes: '',
    receiptUrl: ''
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.publicClaimOptions()
      .then(result => {
        setCategories(result.expenseCategories);
        setClaimants(result.claimants);
        if (result.paymentMethods.length) {
          setPaymentMethods(result.paymentMethods);
          setForm(current => current.paymentMethod ? current : { ...current, paymentMethod: result.paymentMethods[0] });
        }
      })
      .catch(caught => setError(caught instanceof Error ? caught.message : '載入資料失敗'))
      .finally(() => setLoading(false));
  }, []);

  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const blob = file.type.startsWith('image/') ? await compressImage(file) : file;
      const uploadFile = blob instanceof File ? blob : new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
      const uploaded = await api.uploadClaimAttachment(uploadFile);
      update('receiptUrl', uploaded.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '上傳附件失敗');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createPublicClaim({
        claimantName: form.claimantName,
        claimantEmail: form.claimantEmail,
        claimantMemberId: form.claimantMemberId || null,
        description: form.description,
        amount: Number(form.amount),
        date: form.date,
        categoryId: form.categoryId || null,
        paymentMethod: form.paymentMethod,
        notes: form.notes,
        receiptUrl: form.receiptUrl || null
      });
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '提交失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="claim-page">
      <section className="claim-panel">
        <div className="claim-brand">
          <div className="brand-mark">財</div>
          <div>
            <strong>信望愛靈糧堂</strong>
            <span>請款申請</span>
          </div>
        </div>
        {done ? (
          <div className="claim-success">
            <h1>已提交請款單</h1>
            <p>謝謝，財務同工已收到申請通知。</p>
            <button className="primary" onClick={() => { setDone(false); setForm(current => ({ ...current, description: '', amount: '', notes: '', receiptUrl: '' })); }}>
              提交另一張
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="claim-form">
            <div>
              <h1>請款申請</h1>
              <p>請填寫支出資料並上傳憑證。</p>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="claim-grid">
              <label>
                姓名
                <input
                  list="claim-claimants"
                  value={form.claimantName}
                  onChange={event => {
                    const name = event.target.value;
                    const matched = claimants.find(item => item.name === name);
                    setForm(current => ({
                      ...current,
                      claimantName: name,
                      claimantMemberId: matched?.id || ''
                    }));
                  }}
                  placeholder="可從下拉選擇，也可手動輸入"
                  required
                />
                <datalist id="claim-claimants">
                  {claimants.map(item => <option key={item.id} value={item.name} />)}
                </datalist>
              </label>
              <label>Email<input type="email" value={form.claimantEmail} onChange={event => update('claimantEmail', event.target.value)} /></label>
              <label className="wide">請款內容<input value={form.description} onChange={event => update('description', event.target.value)} required /></label>
              <label>金額<input type="number" min="0.01" step="0.01" value={form.amount} onChange={event => update('amount', event.target.value)} required /></label>
              <label>日期<input type="date" value={form.date} onChange={event => update('date', event.target.value)} required /></label>
              <label>
                分類
                <select value={form.categoryId} onChange={event => update('categoryId', event.target.value)} disabled={loading}>
                  <option value="">未分類</option>
                  {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label>
                付款方式
                <select value={form.paymentMethod} onChange={event => update('paymentMethod', event.target.value)}>
                  {paymentMethods.map(method => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
              <label className="wide">備註<textarea value={form.notes} onChange={event => update('notes', event.target.value)} /></label>
            </div>
            <div className="claim-actions">
              <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFile} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? '上傳中...' : form.receiptUrl ? '重新上傳憑證' : '上傳憑證'}</button>
              {form.receiptUrl && <a href={form.receiptUrl} target="_blank" rel="noreferrer">查看憑證</a>}
              <button className="primary" disabled={saving}>{saving ? '提交中...' : '提交請款單'}</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

function Shell({ page, setPage, onOpenAccount }: {
  page: Page;
  setPage: (page: Page) => void;
  onOpenAccount: (tab: AccountTab) => void;
}) {
  const { user, logout } = useAuth();
  const items: Array<[Page, string]> = [
    ['dashboard', '數據看板'],
    ['members', '成員管理'],
    ['offerings', '奉獻記錄'],
    ['expenses', '支出管理'],
    ['reports', '報表日誌']
  ];
  if (user?.role === 'super_admin') items.push(['users', '用戶管理']);

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">財</span>
        <div className="brand-text">
          <strong>信望愛靈糧堂</strong>
          <small><span className="desk-only">財務管理系統</span><span className="mob-only">財務系統</span></small>
        </div>
        {user && (
          <details className="brand-account mob-only">
            <summary className="brand-avatar" aria-label="帳號選單">{userInitials(user.name, user.email)}</summary>
            <div className="user-card-pop">
              <button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onOpenAccount('profile'); }}>個人資料</button>
              <button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onOpenAccount('password'); }}>變更密碼</button>
              <button type="button" className="danger" onClick={() => logout()}>登出</button>
            </div>
          </details>
        )}
      </div>
      <nav>
        {items.map(([id, label]) => (
          <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>
            {label}
          </button>
        ))}
      </nav>
      {user && (
        <div className="sidebar-footer">
          <div className="app-version">Version: {APP_VERSION}</div>
          <div className="user-card">
            <div className="user-card-avatar">{userInitials(user.name, user.email)}</div>
          <div className="user-card-id">
            <strong title={user.name}>{user.name}</strong>
            <small>{roleLabels[user.role]}</small>
          </div>
          <details className="user-card-menu">
            <summary aria-label="帳號選單">⋯</summary>
            <div className="user-card-pop">
              <button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onOpenAccount('profile'); }}>個人資料</button>
              <button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onOpenAccount('password'); }}>變更密碼</button>
              <button type="button" className="danger" onClick={() => logout()}>登出</button>
            </div>
          </details>
          </div>
        </div>
      )}
    </aside>
  );
}


function ImportSummaryView({ result }: { result: ImportResult }) {
  const rows = Object.entries(result.tables).filter(([, v]) => v.inserted || v.updated);
  return (
    <div className="backup-summary">
      {rows.length ? (
        <table className="backup-summary-table">
          <thead><tr><th>資料表</th><th>新增</th><th>更新</th></tr></thead>
          <tbody>
            {rows.map(([name, v]) => (
              <tr key={name}>
                <td>{TABLE_LABELS[name] || name}</td>
                <td>{v.inserted}</td>
                <td>{v.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p style={{ margin: 0 }}>沒有可導入的資料。</p>}
      {result.lockedUsers > 0 && (
        <p style={{ margin: '8px 0 0', color: '#b45309' }}>
          新增 {result.lockedUsers} 個用戶帳號，需管理員重設密碼後才能登入。
        </p>
      )}
      <p style={{ margin: '8px 0 0', color: '#68758a' }}>
        圖片：已恢復 {result.imagesRestored}{result.imagesFailed ? `，失敗 ${result.imagesFailed}` : ''}
      </p>
    </div>
  );
}

function BackupBar() {
  const { hasPermission } = useAuth();
  const { refreshAll } = useFinance();
  const isDesktop = useIsDesktop();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showImport, setShowImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isDesktop || !hasPermission('super_admin', 'finance_admin')) return null;

  const doExport = async () => {
    setError(null);
    setExporting(true);
    try {
      await exportBackup(setProgress);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '導出失敗');
    } finally {
      setExporting(false);
      setProgress('');
    }
  };

  const doImport = async (file: File) => {
    setError(null);
    setResult(null);
    setImporting(true);
    try {
      const res = await importBackup(file, setProgress);
      setResult(res);
      await refreshAll();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '導入失敗');
    } finally {
      setImporting(false);
      setProgress('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const closeImport = () => {
    if (importing) return;
    setShowImport(false);
    setResult(null);
    setError(null);
  };

  return (
    <div className="backup-actions">
      {error && !showImport && <span className="error" style={{ fontSize: 13 }}>{error}</span>}
      <button type="button" onClick={doExport} disabled={exporting}>
        {exporting ? (progress || '導出中…') : '導出備份'}
      </button>
      <button type="button" className="primary" onClick={() => { setResult(null); setError(null); setShowImport(true); }}>
        導入備份
      </button>

      {showImport && (
        <div className="modal-backdrop">
          <div className="modal">
            <header><h2>導入備份</h2><button type="button" onClick={closeImport}>關閉</button></header>
            <div className="form-grid">
              <p style={{ margin: 0, fontSize: 13, color: '#68758a' }}>
                選擇由本系統導出的 .zip 備份，或符合格式的來源資料。按主鍵合併／更新，不會刪除既有資料；圖片將一併恢復。
              </p>
              <input ref={fileRef} type="file" accept=".zip,application/zip" disabled={importing}
                onChange={event => { const file = event.target.files?.[0]; if (file) doImport(file); }} />
              {importing && <p style={{ margin: 0 }}>{progress || '處理中…'}</p>}
              {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
              {result && <ImportSummaryView result={result} />}
            </div>
            <footer>
              <button type="button" onClick={closeImport} disabled={importing}>{result ? '完成' : '取消'}</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { dashboard, lookups, offerings, expenses, members } = useFinance();
  const years = useMemo(() => {
    const set = new Set<string>();
    for (const item of [...offerings, ...expenses]) {
      const y = (item.date || '').slice(0, 4);
      if (y) set.add(y);
    }
    return Array.from(set).sort().reverse();
  }, [offerings, expenses]);
  const [year, setYear] = useState<number>(() => {
    const current = new Date().getFullYear();
    const present = new Set([...offerings, ...expenses].map(item => (item.date || '').slice(0, 4)).filter(Boolean));
    if (present.has(String(current))) return current;
    const sorted = Array.from(present).sort();
    return sorted.length ? Number(sorted[sorted.length - 1]) : current;
  });
  const [trendMode, setTrendMode] = useState<'week' | 'month'>('month');
  const [showAllDonors, setShowAllDonors] = useState(false);
  if (!dashboard) return <Empty title="正在載入數據看板" />;

  const yearStr = String(year);
  const prevYearStr = String(year - 1);
  const now = new Date();

  // ---- 當年範圍（全部狀態；不含歷史年度）----
  const yearOfferings = offerings.filter(o => (o.date || '').slice(0, 4) === yearStr);
  const yearExpenses = expenses.filter(e => (e.date || '').slice(0, 4) === yearStr);
  const prevYearOfferings = offerings.filter(o => (o.date || '').slice(0, 4) === prevYearStr);
  const prevYearExpenses = expenses.filter(e => (e.date || '').slice(0, 4) === prevYearStr);

  // ---- 累計奉獻（當年，按奉獻人彙總，金額由大到小；匿名合併為一列；姓名中英文全顯示）----
  const membersById = new Map(members.map(m => [m.id, m]));
  const donorRankingMap = new Map<string, { memberId: string | null; fallbackName: string; total: number; count: number }>();
  for (const o of yearOfferings) {
    const key = o.memberId || 'anonymous';
    const entry = donorRankingMap.get(key) || { memberId: o.memberId, fallbackName: o.memberName || '匿名', total: 0, count: 0 };
    entry.total += o.amount;
    entry.count += 1;
    donorRankingMap.set(key, entry);
  }
  const donorRanking = [...donorRankingMap.values()]
    .map(e => ({
      total: e.total,
      count: e.count,
      name: e.memberId ? (memberDisplayName(membersById.get(e.memberId)) || e.fallbackName) : '匿名'
    }))
    .sort((a, b) => b.total - a.total);

  const sum = (arr: Array<{ amount: number }>) => arr.reduce((s, x) => s + x.amount, 0);
  const inRange = (d: string, start: Date, end: Date) => { const t = new Date(`${d}T00:00:00`); return t >= start && t < end; };
  const pct = (cur: number, prev: number): number | null => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

  // 週/月邊界
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const nextWeekStart = new Date(weekStart); nextWeekStart.setDate(nextWeekStart.getDate() + 7);

  // ---- 收入指標 ----
  const weekOfferingTotal = sum(offerings.filter(o => inRange(o.date, weekStart, nextWeekStart)));
  const prevWeekOfferingTotal = sum(offerings.filter(o => inRange(o.date, prevWeekStart, weekStart)));
  const monthOfferingTotal = sum(offerings.filter(o => inRange(o.date, monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1))));
  const prevMonthOfferingTotal = sum(offerings.filter(o => inRange(o.date, prevMonthStart, monthStart)));
  const yearOfferingTotal = sum(yearOfferings);
  const donorCount = new Set(yearOfferings.filter(o => o.memberId).map(o => o.memberId)).size;
  const prevDonorCount = new Set(prevYearOfferings.filter(o => o.memberId).map(o => o.memberId)).size;

  // ---- 支出指標 ----
  const monthExpenseTotal = sum(expenses.filter(e => inRange(e.date, monthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1))));
  const prevMonthExpenseTotal = sum(expenses.filter(e => inRange(e.date, prevMonthStart, monthStart)));
  const yearExpenseTotal = sum(yearExpenses);
  const pendingExpenses = yearExpenses.filter(e => e.status === 'pending');
  const netBalance = yearOfferingTotal - yearExpenseTotal;
  const prevNet = sum(prevYearOfferings) - sum(prevYearExpenses);

  // ---- 月度序列（當年 12 個月）----
  const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
  const monthOf = (list: Array<{ date: string; amount: number }>, i: number) =>
    sum(list.filter(x => (x.date || '').startsWith(`${yearStr}-${String(i + 1).padStart(2, '0')}`)));
  const monthlyOffer = monthLabels.map((_, i) => monthOf(yearOfferings, i));
  const monthlyExp = monthLabels.map((_, i) => monthOf(yearExpenses, i));
  const monthlyNet = monthLabels.map((_, i) => monthlyOffer[i] - monthlyExp[i]);
  const monthlyDonors = monthLabels.map((_, i) => new Set(yearOfferings.filter(o => o.memberId && (o.date || '').startsWith(`${yearStr}-${String(i + 1).padStart(2, '0')}`)).map(o => o.memberId)).size);
  const monthlyPending = monthLabels.map((_, i) => yearExpenses.filter(e => e.status === 'pending' && (e.date || '').startsWith(`${yearStr}-${String(i + 1).padStart(2, '0')}`)).length);

  // 當年只畫到當月（過去年度顯示滿 12 個月）；用於折線與卡片 sparkline，避免未來月補 0 拖平
  const monthCap = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const capLabels = monthLabels.slice(0, monthCap);
  const capOffer = monthlyOffer.slice(0, monthCap);
  const capExp = monthlyExp.slice(0, monthCap);
  const capNet = monthlyNet.slice(0, monthCap);
  const capDonors = monthlyDonors.slice(0, monthCap);
  const capPending = monthlyPending.slice(0, monthCap);

  // ---- 週度序列（近 12 週）----
  const weekBuckets = Array.from({ length: 12 }, (_, i) => {
    const start = new Date(weekStart); start.setDate(start.getDate() - (11 - i) * 7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    return { label: `${start.getMonth() + 1}/${start.getDate()}`, start, end };
  });
  const weeklyOffer = weekBuckets.map(b => sum(offerings.filter(o => inRange(o.date, b.start, b.end))));
  const weeklyExp = weekBuckets.map(b => sum(expenses.filter(e => inRange(e.date, b.start, b.end))));

  // ---- 年度預算 = 已出支月份的平均 × 12（取整）----
  const activeMonthsExp = monthlyExp.filter(v => v > 0);
  const avgMonthlyExp = activeMonthsExp.length ? activeMonthsExp.reduce((s, v) => s + v, 0) / activeMonthsExp.length : 0;
  const budgetTotal = Math.round(avgMonthlyExp * 12);

  // ---- 支出分類 Doughnut（當年，全部狀態，Top 7 + 其他）----
  // 用類別短名（薪资福利/水电网络…）而非伺服器回傳的長全名
  const catShort = new Map((lookups?.expenseCategories ?? []).map(c => [c.id, c.shortName?.trim() || c.name]));
  const catMap = new Map<string, number>();
  for (const e of yearExpenses) {
    const label = (e.categoryId && catShort.get(e.categoryId)) || e.categoryName?.trim() || '未分類';
    catMap.set(label, (catMap.get(label) || 0) + e.amount);
  }
  const catSorted = [...catMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const catDoughnut = catSorted.length > 8
    ? [...catSorted.slice(0, 7), { label: '其他', value: catSorted.slice(7).reduce((s, x) => s + x.value, 0) }]
    : catSorted;

  // ---- 新增記錄趨勢（金額，週/月切換）----
  const trendLabels = trendMode === 'week' ? weekBuckets.map(b => b.label) : capLabels;
  const trendOffer = trendMode === 'week' ? weeklyOffer : capOffer;
  const trendExp = trendMode === 'week' ? weeklyExp : capExp;

  const INCOME_COLOR = CATEGORY_COLORS[0];
  const EXPENSE_COLOR = CATEGORY_COLORS[5];

  const dashboardYearAction = (
    <select value={year} onChange={event => setYear(Number(event.target.value))} style={{ width: 'auto' }}>
      {years.length
        ? years.map(y => <option key={y} value={y}>{y} 年度</option>)
        : <option value={year}>{year} 年度</option>}
    </select>
  );

  return (
    <section className="page">
      <PageTitle title="數據看板" subtitle={`${year} 年度與待處理財務事項總覽`} action={<BackupBar />} />
      <Toolbar className="toolbar-inline">
        <strong>{year} 年度資料</strong>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {dashboardYearAction}
        </div>
      </Toolbar>

      {/* 收入統計 */}
      <Panel title="收入統計">
        <div className="kpi-grid">
          <KpiCard title="本週奉獻" value={currency(weekOfferingTotal)} delta={pct(weekOfferingTotal, prevWeekOfferingTotal)} accent="linear-gradient(135deg,#6366f1,#4f46e5)" spark={weeklyOffer} />
          <KpiCard title="本月奉獻" value={currency(monthOfferingTotal)} delta={pct(monthOfferingTotal, prevMonthOfferingTotal)} accent="linear-gradient(135deg,#3b82f6,#2563eb)" spark={capOffer} />
          <KpiCard title="年度奉獻" value={currency(yearOfferingTotal)} delta={pct(yearOfferingTotal, sum(prevYearOfferings))} accent="linear-gradient(135deg,#14b8a6,#0d9488)" spark={capOffer} sparkType="area" />
          <KpiCard title="奉獻人數" value={`${donorCount}`} delta={pct(donorCount, prevDonorCount)} accent="linear-gradient(135deg,#8b5cf6,#7c3aed)" spark={capDonors} sparkType="bar" />
        </div>
      </Panel>

      {/* 支出統計 */}
      <Panel title="支出統計">
        <div className="kpi-grid">
          <KpiCard title="待審批支出" value={`${pendingExpenses.length}`} accent="linear-gradient(135deg,#f43f5e,#e11d48)" spark={capPending} sparkType="bar" onClick={() => onNavigate('expenses')} />
          <KpiCard title="本月支出" value={currency(monthExpenseTotal)} delta={pct(monthExpenseTotal, prevMonthExpenseTotal)} accent="linear-gradient(135deg,#64748b,#475569)" spark={capExp} />
          <KpiCard title="年度支出" value={currency(yearExpenseTotal)} delta={pct(yearExpenseTotal, sum(prevYearExpenses))} accent="linear-gradient(135deg,#f59e0b,#d97706)" spark={capExp} sparkType="area" />
          <KpiCard title="年度淨結餘" value={currency(netBalance)} delta={pct(netBalance, prevNet)} accent={netBalance >= 0 ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#ef4444,#dc2626)'} spark={capNet} sparkType="area" />
        </div>
      </Panel>

      {/* 支出分類 + 新增記錄趨勢 */}
      <div className="two-col">
        <Panel title="支出分類">
          {catDoughnut.length ? <CategoryDoughnut items={catDoughnut} /> : <Empty title="本年度暫無支出" />}
        </Panel>
        <Panel
          title="新增記錄趨勢"
          action={
            <div className="seg-toggle">
              <button type="button" className={trendMode === 'week' ? 'active' : ''} onClick={() => setTrendMode('week')}>週趨勢</button>
              <button type="button" className={trendMode === 'month' ? 'active' : ''} onClick={() => setTrendMode('month')}>月趨勢</button>
            </div>
          }
        >
          <TrendLine
            labels={trendLabels}
            series={[
              { label: '奉獻', data: trendOffer, color: INCOME_COLOR },
              { label: '支出', data: trendExp, color: EXPENSE_COLOR },
            ]}
          />
        </Panel>
      </div>

      {/* 預算 vs 實際 + 現金流 */}
      <div className="two-col">
        <Panel title="預算 vs 實際">
          <BudgetDoughnut used={yearExpenseTotal} budget={budgetTotal} />
          <p className="panel-note">年度預算 {currency(budgetTotal)} · 已用 {currency(yearExpenseTotal)} · 剩餘 {currency(Math.max(0, budgetTotal - yearExpenseTotal))}</p>
        </Panel>
        <Panel title="現金流">
          <p className="panel-note">{year} 年度各月收入與支出對比</p>
          <GroupedBar
            labels={monthLabels}
            series={[
              { label: '收入', data: monthlyOffer, color: INCOME_COLOR },
              { label: '支出', data: monthlyExp, color: EXPENSE_COLOR },
            ]}
          />
        </Panel>
      </div>

      <div className="dash-bottom">
        <Panel title="累計奉獻" action={<small className="panel-note" style={{ margin: 0 }}>{year} 年度 · 共 {donorRanking.length} 人</small>}>
          <table className="cum-table">
            <colgroup><col style={{ width: '60%' }} /><col style={{ width: '20%' }} /><col style={{ width: '20%' }} /></colgroup>
            <thead>
              <tr><th>名字</th><th className="num">筆數</th><th className="num">金額</th></tr>
            </thead>
            <tbody>
              {(showAllDonors ? donorRanking : donorRanking.slice(0, 11)).map((d, i) => (
                <tr key={i}>
                  <td className="cum-name">{d.name}</td>
                  <td className="num">{d.count}</td>
                  <td className="num">{currency(d.total)}</td>
                </tr>
              ))}
              {!donorRanking.length && <tr><td colSpan={3} className="cum-empty">本年度暫無奉獻記錄</td></tr>}
            </tbody>
          </table>
          {donorRanking.length > 11 && (
            <button type="button" className="cum-more" onClick={() => setShowAllDonors(v => !v)}>
              {showAllDonors ? '收起' : `展開全部 ${donorRanking.length} 人`}
            </button>
          )}
        </Panel>
        <div className="dash-bottom-right">
          <Panel title="最近奉獻">
            <SimpleList items={yearOfferings.slice(0, 5).map(item => `${shortDate(item.date)} ${item.memberName || '匿名'} ${currency(item.amount)}`)} />
          </Panel>
          <Panel title="最近支出">
            <SimpleList items={yearExpenses.slice(0, 5).map(item => `${shortDate(item.date)} ${item.description || item.categoryName || '支出'} ${currency(item.amount)}`)} />
          </Panel>
        </div>
      </div>

    </section>
  );
}

function MemberDetail({ member, onClose }: { member: Member; onClose: () => void }) {
  const displayName = [member.firstName, member.lastName].filter(Boolean).join(' ');
  const fields: Array<[string, string | undefined | null]> = [
    ['英文名', displayName],
    ['中文名 / 全名', member.name],
    ['配偶', member.partner],
    ['電話', member.phone || member.homePhone],
    ['電郵', member.email],
    ['地址', member.address],
    ['城市', member.city],
    ['州／省', member.stateRegion],
    ['郵編', member.postalCode],
    ['分組', member.groupName],
    ['狀態', statusLabels[member.status]],
    ['入會日期', member.joinDate ? shortDate(member.joinDate) : undefined],
    ['備註', member.notes],
  ];
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <header>
          <h2>{member.starred ? '★ ' : ''}{displayName || member.name}</h2>
          <button type="button" onClick={onClose}>關閉</button>
        </header>
        <div className="detail-grid">
          {fields.filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="detail-field">
              <small>{label}</small>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ title, target, onClose, onConfirm }: {
  title: string;
  target: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const trimmed = reason.trim();

  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onConfirm(trimmed);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : '刪除失敗');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(440px, 100%)' }}>
        <header><h2>{title}</h2><button type="button" onClick={onClose}>關閉</button></header>
        <p style={{ margin: 0, color: '#526176' }}>
          確定要刪除「<strong>{target}</strong>」嗎？此操作無法復原。
        </p>
        <label className="stack" style={{ gap: '0.4rem', color: '#526176', fontWeight: 700 }}>
          刪除原因（必填）
          <textarea
            value={reason}
            onChange={event => { setReason(event.target.value); setErr(null); }}
            placeholder="請輸入刪除原因，將記入審計日誌"
            autoFocus
          />
        </label>
        {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
        <footer>
          <button type="button" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="primary" style={{ background: '#dc2626' }} disabled={!trimmed || busy} onClick={submit}>
            {busy ? '刪除中…' : '確認刪除'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function OfferingDetail({ offering, offerings, members, canEdit, onClose, onNavigate, onEdit, onDelete }: {
  offering: Offering;
  offerings: Offering[];
  members: Member[];
  canEdit: boolean;
  onClose: () => void;
  onNavigate: (offering: Offering) => void;
  onEdit: (offering: Offering) => void;
  onDelete: (offering: Offering) => void;
}) {
  const index = offerings.findIndex(o => o.id === offering.id);
  const prev = index > 0 ? offerings[index - 1] : null;
  const next = index >= 0 && index < offerings.length - 1 ? offerings[index + 1] : null;

  const member = offering.memberId ? members.find(m => m.id === offering.memberId) : null;
  const memberLabel = offering.memberId
    ? (memberDisplayName(member) || offering.memberName || '未知成員')
    : '匿名';

  const fields: Array<[string, string]> = [
    ['日期', shortDate(offering.date)],
    ['成員', memberLabel],
    ['分類', offering.categoryName || '—'],
    ['方式', offering.methodName || '—'],
    ['金額', currency(offering.amount)],
    ['備註', offering.notes || '—'],
    ['建立時間', offering.createdAt ? shortDate(offering.createdAt.slice(0, 10)) : '—'],
    ['更新時間', offering.updatedAt ? shortDate(offering.updatedAt.slice(0, 10)) : '—']
  ];

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <header>
          <h2>奉獻詳情</h2>
          <button type="button" onClick={onClose}>關閉</button>
        </header>
        <div className="detail-grid">
          {fields.map(([label, value]) => (
            <div key={label} className="detail-field">
              <small>{label}</small>
              <span>{value}</span>
            </div>
          ))}
        </div>
        {offering.receiptUrl && (
          <div className="detail-field">
            <small>憑證</small>
            <img src={offering.receiptUrl} alt="憑證" style={{ width: '100%', borderRadius: 8, marginTop: '0.35rem', display: 'block' }} />
          </div>
        )}
        <footer>
          <button type="button" disabled={!prev} onClick={() => prev && onNavigate(prev)}>← 上一條</button>
          {canEdit && <button type="button" onClick={() => onEdit(offering)}>編輯</button>}
          {canEdit && <button type="button" onClick={() => onDelete(offering)}>刪除</button>}
          <button type="button" disabled={!next} onClick={() => next && onNavigate(next)}>下一條 →</button>
        </footer>
      </div>
    </div>
  );
}

type MemberColKey = 'star' | 'name' | 'partner' | 'phone' | 'email' | 'address' | 'yearOffering' | 'totalOffering' | 'actions';

const MEMBER_COLUMNS: ReadonlyArray<{ key: MemberColKey; label: string; width: number; required?: boolean }> = [
  { key: 'star', label: 'Star', width: 40 },
  { key: 'name', label: '姓名', width: 300, required: true },
  { key: 'partner', label: '配偶', width: 200 },
  { key: 'phone', label: '電話', width: 150 },
  { key: 'email', label: '電郵', width: 260 },
  { key: 'address', label: '地址', width: 320 },
  { key: 'yearOffering', label: '今年奉獻', width: 140 },
  { key: 'totalOffering', label: '累計奉獻', width: 140 },
  { key: 'actions', label: '操作', width: 260 }
];

const DEFAULT_VISIBLE_MEMBER_COLS: MemberColKey[] = ['star', 'name', 'phone', 'yearOffering', 'actions'];
const MEMBER_COLS_STORAGE_KEY = 'members.visibleColumns.v1';

function loadVisibleMemberCols(): Set<MemberColKey> {
  const fallback = new Set<MemberColKey>(DEFAULT_VISIBLE_MEMBER_COLS);
  try {
    const raw = localStorage.getItem(MEMBER_COLS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    const valid = new Set(MEMBER_COLUMNS.map(c => c.key));
    const next = new Set<MemberColKey>(parsed.filter((k: any) => valid.has(k)));
    next.add('name'); // 姓名列強制保留
    return next.size ? next : fallback;
  } catch {
    return fallback;
  }
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia('(min-width: 921px)').matches
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 921px)');
    const handler = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

function MembersPage() {
  const { members, lookups, offerings, saveMember, deleteMember, starMember, saveOffering } = useFinance();
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [editing, setEditing] = useState<Member | null>(null);
  const [detail, setDetail] = useState<Member | null>(null);
  const [offeringMember, setOfferingMember] = useState<Offering | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [sortKey, setSortKey] = useState<'yearOffering' | 'totalOffering' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (key: 'yearOffering' | 'totalOffering') => {
    if (sortKey === key) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };
  const sortArrow = (key: 'yearOffering' | 'totalOffering') => (sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '');

  const isDesktop = useIsDesktop();
  const [visibleCols, setVisibleCols] = useState<Set<MemberColKey>>(() => loadVisibleMemberCols());
  const [colSettingsOpen, setColSettingsOpen] = useState(false);
  const colSettingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(MEMBER_COLS_STORAGE_KEY, JSON.stringify(Array.from(visibleCols)));
    } catch { /* ignore quota / private-mode errors */ }
  }, [visibleCols]);

  useEffect(() => {
    if (!colSettingsOpen) return;
    const handler = (event: MouseEvent) => {
      if (colSettingsRef.current && !colSettingsRef.current.contains(event.target as Node)) {
        setColSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colSettingsOpen]);

  const visibleWidthTotal = useMemo(
    () => MEMBER_COLUMNS.filter(c => visibleCols.has(c.key)).reduce((sum, c) => sum + c.width, 0),
    [visibleCols]
  );

  // 桌面端：可見列按原寬度比例縮放佔滿全屏；移動端：返回 undefined，沿用既有 CSS
  const colWidth = (key: MemberColKey): string | undefined => {
    if (!isDesktop || !visibleCols.has(key) || visibleWidthTotal === 0) return undefined;
    const def = MEMBER_COLUMNS.find(c => c.key === key)!;
    return `${(def.width / visibleWidthTotal) * 100}%`;
  };

  // 僅桌面端隱藏未勾選的列；移動端不受欄位設定影響
  const colHidden = (key: MemberColKey): boolean => isDesktop && !visibleCols.has(key);

  const toggleCol = (key: MemberColKey) => {
    setVisibleCols(prev => {
      const def = MEMBER_COLUMNS.find(c => c.key === key)!;
      if (def.required && prev.has(key)) return prev; // 姓名列不可取消
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const yearStr = String(new Date().getFullYear());
  const yearOfferingMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of offerings) {
      if (o.memberId && o.date.startsWith(yearStr)) {
        map.set(o.memberId, (map.get(o.memberId) ?? 0) + o.amount);
      }
    }
    return map;
  }, [offerings]);

  const filtered = members
    .filter(m => {
      if (activeOnly && m.status !== 'active') return false;
      if (query) {
        const q = query.toLowerCase();
        const searchable = `${m.firstName ?? ''} ${m.lastName ?? ''} ${m.name} ${m.email} ${m.phone} ${m.homePhone ?? ''}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortKey) {
        const av = sortKey === 'yearOffering' ? (yearOfferingMap.get(a.id) ?? 0) : a.totalOffering;
        const bv = sortKey === 'yearOffering' ? (yearOfferingMap.get(b.id) ?? 0) : b.totalOffering;
        if (av !== bv) return sortDir === 'desc' ? bv - av : av - bv;
      }
      return (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || a.name.localeCompare(b.name);
    });

  return (
    <section className="page">
      <PageTitle title="成員管理" subtitle="搜尋、分組、狀態與奉獻概覽" />
      <Toolbar>
        <input placeholder="搜尋姓名、電話或郵件" value={query} onChange={event => setQuery(event.target.value)} />
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button className="primary" onClick={() => setEditing(blankMember())}>新增成員</button>
          <button type="button" onClick={() => setActiveOnly(v => !v)} className={activeOnly ? 'primary' : ''}>
            {activeOnly ? '僅活躍成員' : '顯示全部'}
          </button>
          <div className="col-settings-wrap desk-only" ref={colSettingsRef}>
            <button type="button" onClick={() => setColSettingsOpen(open => !open)} className={colSettingsOpen ? 'primary' : ''}>
              欄位設定
            </button>
            {colSettingsOpen && (
              <div className="col-settings-popover">
                <div className="col-settings-popover-title">顯示欄位</div>
                {MEMBER_COLUMNS.map(col => (
                  <label key={col.key} className={col.required ? 'disabled' : ''}>
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col.key)}
                      disabled={col.required}
                      onChange={() => toggleCol(col.key)}
                    />
                    <span>{col.label}{col.required ? ' (必選)' : ''}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </Toolbar>
      {editing && (
        <MemberForm
          member={editing}
          onClose={() => setEditing(null)}
          onSave={async payload => { await saveMember(payload, editing.id || undefined); setEditing(null); }}
        />
      )}
      {detail && <MemberDetail member={detail} onClose={() => setDetail(null)} />}
      {deletingMember && (
        <ConfirmDeleteModal
          title="刪除成員"
          target={memberDisplayName(deletingMember) || deletingMember.name}
          onClose={() => setDeletingMember(null)}
          onConfirm={async reason => { await deleteMember(deletingMember.id, reason); setDeletingMember(null); }}
        />
      )}
      {offeringMember && (
        <OfferingForm
          offering={offeringMember}
          members={members}
          categories={lookups?.offeringCategories ?? []}
          methods={lookups?.offeringMethods ?? []}
          onClose={() => setOfferingMember(null)}
          onSave={async payload => { await saveOffering(payload); setOfferingMember(null); }}
        />
      )}
      <div style={{ overflowX: 'auto', borderRadius: 8, background: '#fff', boxShadow: '0 10px 30px rgba(25, 41, 70, 0.06)' }}>
      <table className="members-table" style={{ tableLayout: 'fixed', width: isDesktop ? '100%' : 1889, boxShadow: 'none' }}>
        <thead>
          <tr>
            <th className="col-star" style={{ width: colWidth('star'), display: colHidden('star') ? 'none' : undefined }}></th>
            <th className="col-name" style={{ width: colWidth('name'), display: colHidden('name') ? 'none' : undefined }}>姓名</th>
            <th className="desk-only" style={{ width: colWidth('partner'), display: colHidden('partner') ? 'none' : undefined }}>配偶</th>
            <th className="desk-only" style={{ width: colWidth('phone'), display: colHidden('phone') ? 'none' : undefined }}>電話</th>
            <th className="desk-only" style={{ width: colWidth('email'), display: colHidden('email') ? 'none' : undefined }}>電郵</th>
            <th className="desk-only" style={{ width: colWidth('address'), display: colHidden('address') ? 'none' : undefined }}>地址</th>
            <th className="col-year" onClick={() => toggleSort('yearOffering')} title="點擊排序" style={{ width: colWidth('yearOffering'), display: colHidden('yearOffering') ? 'none' : undefined, cursor: 'pointer', userSelect: 'none' }}>今年奉獻{sortArrow('yearOffering')}</th>
            <th className="desk-only" onClick={() => toggleSort('totalOffering')} title="點擊排序" style={{ width: colWidth('totalOffering'), display: colHidden('totalOffering') ? 'none' : undefined, cursor: 'pointer', userSelect: 'none' }}>累計奉獻{sortArrow('totalOffering')}</th>
            <th className="col-actions" style={{ width: colWidth('actions'), display: colHidden('actions') ? 'none' : undefined }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(member => {
            const displayName = [member.firstName, member.lastName].filter(Boolean).join(' ');
            const phone = member.phone || member.homePhone || '';
            const address = [member.address, member.city, member.stateRegion, member.postalCode].filter(Boolean);
            return (
              <tr key={member.id}>
                <td className="col-star" style={{ display: colHidden('star') ? 'none' : undefined }}>
                  <button
                    className="star-btn"
                    onClick={() => starMember(member.id)}
                    title={member.starred ? '取消收藏' : '加入收藏'}
                    style={{ color: member.starred ? '#f59e0b' : '#cbd5e1' }}
                  >
                    {member.starred ? '★' : '☆'}
                  </button>
                </td>
                <td className="col-name" style={{ display: colHidden('name') ? 'none' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', overflow: 'hidden', paddingRight: '0.35rem' }}>
                    <div style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
                      <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={displayName || member.name}>{displayName || member.name}</strong>
                      {displayName && <small style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={member.name}>{member.name}</small>}
                    </div>
                    <button className="primary" style={{ flexShrink: 0, padding: '0.4rem 0.6rem', fontSize: '0.92rem', whiteSpace: 'nowrap' }} onClick={() => setOfferingMember(blankOffering(member.id))}><span className="desk-only">新增奉獻</span><span className="mob-only">奉獻</span></button>
                  </div>
                </td>
                <td className="desk-only" style={{ display: colHidden('partner') ? 'none' : undefined }}>{member.partner || '—'}</td>
                <td className="desk-only" style={{ display: colHidden('phone') ? 'none' : undefined }}>{phone || '—'}</td>
                <td className="desk-only" style={{ display: colHidden('email') ? 'none' : undefined }}>{member.email || '—'}</td>
                <td className="desk-only" style={{ display: colHidden('address') ? 'none' : undefined }}>
                  {address.length ? (
                    <div
                      title={address.join('，')}
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: '0.85rem',
                        lineHeight: 1.35,
                        color: '#68758a',
                        wordBreak: 'break-word'
                      }}
                    >
                      {address.join('，')}
                    </div>
                  ) : '—'}
                </td>
                <td className="col-year" style={{ display: colHidden('yearOffering') ? 'none' : undefined }}>{currency(yearOfferingMap.get(member.id) ?? 0)}</td>
                <td className="desk-only" style={{ display: colHidden('totalOffering') ? 'none' : undefined }}>{currency(member.totalOffering)}</td>
                <td className="actions col-actions" style={{ flexWrap: 'nowrap', gap: '0.3rem', display: colHidden('actions') ? 'none' : undefined }}>
                  <button
                    className="desk-only"
                    style={{
                      padding: '0.45rem 0.6rem',
                      fontSize: '0.95rem',
                      background: member.status === 'active' ? '#e9f2ff' : undefined,
                      color: member.status === 'active' ? '#1959b8' : undefined
                    }}
                    title="點擊切換活躍／非活躍"
                    onClick={async () => {
                      const newStatus: MemberStatus = member.status === 'active' ? 'inactive' : 'active';
                      await saveMember({ ...member, status: newStatus }, member.id);
                    }}
                  >
                    {statusLabels[member.status]}
                  </button>
                  <button className="desk-only" style={{ padding: '0.45rem 0.6rem', fontSize: '0.95rem' }} onClick={() => setDetail(member)}>詳情</button>
                  <button style={{ padding: '0.45rem 0.6rem', fontSize: '0.95rem' }} onClick={() => setEditing(member)}>編輯</button>
                  <button className="desk-only" style={{ padding: '0.45rem 0.6rem', fontSize: '0.95rem' }} onClick={() => setDeletingMember(member)}>刪除</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </section>
  );
}

function isImageAttachment(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url);
}

function AttachmentPreviewModal({ url, title = '查看附件', onClose }: { url: string; title?: string; onClose: () => void }) {
  const isImage = isImageAttachment(url);

  return (
    <div
      className="attachment-modal-backdrop"
      onClick={onClose}
    >
      <div className="attachment-modal" onClick={event => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label="關閉">✕</button>
        </header>
        <div className="attachment-modal-body">
          {isImage ? (
            <img src={url} alt={title} />
          ) : (
            <iframe src={url} title={title} />
          )}
        </div>
        <footer>
          <a href={url} download>下載附件</a>
        </footer>
      </div>
    </div>
  );
}

const Lightbox = AttachmentPreviewModal;

function OfferingsPage() {
  const { members, offerings, lookups, saveOffering, deleteOffering } = useFinance();
  const { hasPermission } = useAuth();
  const isDesktop = useIsDesktop();
  const canEdit = hasPermission('super_admin', 'finance_admin', 'dev');
  const [editing, setEditing] = useState<Offering | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [detail, setDetail] = useState<Offering | null>(null);
  const [deletingOffering, setDeletingOffering] = useState<Offering | null>(null);
  const years = useMemo(() => {
    const set = new Set<string>();
    for (const item of offerings) {
      const y = (item.date || '').slice(0, 4);
      if (y) set.add(y);
    }
    return Array.from(set).sort().reverse();
  }, [offerings]);
  const [year, setYear] = useState<number>(() => {
    const current = new Date().getFullYear();
    const present = new Set(offerings.map(o => (o.date || '').slice(0, 4)).filter(Boolean));
    if (present.has(String(current - 1))) return current - 1;
    const sorted = Array.from(present).sort();
    return sorted.length ? Number(sorted[sorted.length - 1]) : current;
  });
  const filteredOfferings = useMemo(
    () => offerings.filter(item => (item.date || '').slice(0, 4) === String(year)),
    [offerings, year]
  );
  const total = filteredOfferings.reduce((sum, item) => sum + item.amount, 0);
  const [amtSort, setAmtSort] = useState<'none' | 'asc' | 'desc'>('none');
  const cycleAmt = () => setAmtSort(s => (s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none'));
  const displayOfferings = useMemo(() => {
    if (amtSort === 'none') return filteredOfferings;
    return [...filteredOfferings].sort((a, b) => (amtSort === 'desc' ? b.amount - a.amount : a.amount - b.amount));
  }, [filteredOfferings, amtSort]);

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const offeringMemberLabel = (item: Offering) =>
    item.memberId ? (memberDisplayName(memberById.get(item.memberId)) || item.memberName || '未知成員') : '匿名';

  return (
    <section className="page">
      <PageTitle title="奉獻記錄" subtitle="分類、支付方式、匿名奉獻與收據追蹤" />
      <Toolbar>
        <strong>目前列表合計：{currency(total)}</strong>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end' }}>
          {canEdit && <button className="primary" onClick={() => setEditing(blankOffering())}>記錄奉獻</button>}
          <select value={year} onChange={event => setYear(Number(event.target.value))} style={{ width: 'auto' }}>
            {years.length
              ? years.map(y => <option key={y} value={y}>{y} 年度</option>)
              : <option value={year}>{year} 年度</option>}
          </select>
        </div>
      </Toolbar>
      {editing && (
        <OfferingForm
          offering={editing}
          members={members}
          categories={lookups?.offeringCategories ?? []}
          methods={lookups?.offeringMethods ?? []}
          onClose={() => setEditing(null)}
          onSave={async payload => {
            await saveOffering(payload, editing.id || undefined);
            setEditing(null);
          }}
        />
      )}
      {detail && (
        <OfferingDetail
          offering={detail}
          offerings={filteredOfferings}
          members={members}
          canEdit={canEdit}
          onClose={() => setDetail(null)}
          onNavigate={setDetail}
          onEdit={offering => { setDetail(null); setEditing(offering); }}
          onDelete={offering => { setDetail(null); setDeletingOffering(offering); }}
        />
      )}
      {deletingOffering && (
        <ConfirmDeleteModal
          title="刪除奉獻記錄"
          target={`${shortDate(deletingOffering.date)} ${offeringMemberLabel(deletingOffering)} ${currency(deletingOffering.amount)}`}
          onClose={() => setDeletingOffering(null)}
          onConfirm={async reason => { await deleteOffering(deletingOffering.id, reason); setDeletingOffering(null); }}
        />
      )}
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
      <table className="offerings-table">
        <thead>
          <tr><th className="desk-only">日期</th><th>成員</th><th className="desk-only">分類</th><th className="desk-only">方式</th><th onClick={cycleAmt} title="點擊排序" style={{ cursor: 'pointer', userSelect: 'none' }}>金額{amtSort === 'desc' ? ' ↓' : amtSort === 'asc' ? ' ↑' : ''}</th><th className="desk-only">備註</th><th className="desk-only">憑證</th><th>操作</th></tr>
        </thead>
        <tbody>
          {displayOfferings.map(item => (
            <tr key={item.id}>
              <td data-label="日期">{shortDate(item.date)}</td>
              <td data-label="成員">{offeringMemberLabel(item)}</td>
              <td data-label="分類">{item.categoryName || '-'}</td>
              <td data-label="方式">{item.methodName || '-'}</td>
              <td data-label="金額">{currency(item.amount)}</td>
              <td data-label="備註" className="offering-notes-col">{isDesktop ? item.notes : <span className="clamp-2" onClick={() => setDetail(item)}>{item.notes}</span>}</td>
              <td data-label="憑證">{item.receiptUrl ? <button style={{ background: 'none', border: 'none', color: 'var(--accent, #4f7df3)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }} onClick={() => setLightbox(item.receiptUrl!)}>查看憑證</button> : <span style={{ color: '#aaa' }}>—</span>}</td>
              <td className="actions"><button onClick={() => setDetail(item)}>詳情</button>{canEdit && <><button onClick={() => setEditing(item)}>編輯</button><button onClick={() => setDeletingOffering(item)}>刪除</button></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ExpensesPage() {
  const { members, expenses, lookups, settings, saveExpense, deleteExpense, approveExpense, rejectExpense, invoiceExpense, accountExpense, saveSettings, refreshAll } = useFinance();
  const { hasPermission, user } = useAuth();
  const isDesktop = useIsDesktop();
  const canEdit = hasPermission('super_admin', 'finance_admin', 'dev');
  const canManageNotify = hasPermission('super_admin', 'finance_admin');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [invoicingExpense, setInvoicingExpense] = useState<Expense | null>(null);
  const [accountingExpense, setAccountingExpense] = useState<Expense | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [emailAction, setEmailAction] = useState<ExpenseEmailAction | null>(() => expenseEmailActionFromLocation());
  const pending = expenses.filter(item => item.status === 'pending');

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const item of expenses) {
      const y = (item.date || '').slice(0, 4);
      if (y) set.add(y);
    }
    return Array.from(set).sort().reverse();
  }, [expenses]);
  const [year, setYear] = useState<number>(() => {
    const current = new Date().getFullYear();
    const present = new Set(expenses.map(e => (e.date || '').slice(0, 4)).filter(Boolean));
    if (present.has(String(current - 1))) return current - 1;
    const sorted = Array.from(present).sort();
    return sorted.length ? Number(sorted[sorted.length - 1]) : current;
  });
  const filteredExpenses = useMemo(
    () => expenses.filter(item => (item.date || '').slice(0, 4) === String(year)),
    [expenses, year]
  );
  const [expAmtSort, setExpAmtSort] = useState<'none' | 'asc' | 'desc'>('none');
  const cycleExpAmt = () => setExpAmtSort(s => (s === 'none' ? 'desc' : s === 'desc' ? 'asc' : 'none'));
  const displayExpenses = useMemo(() => {
    if (expAmtSort === 'none') return filteredExpenses;
    return [...filteredExpenses].sort((a, b) => (expAmtSort === 'desc' ? b.amount - a.amount : a.amount - b.amount));
  }, [filteredExpenses, expAmtSort]);

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const categoryShortById = useMemo(() => {
    const m = new Map<string, string>();
    (lookups?.expenseCategories ?? []).forEach(c => { if (c.shortName) m.set(c.id, c.shortName); });
    return m;
  }, [lookups]);
  const emailActionExpense = emailAction ? expenses.find(item => item.id === emailAction.expenseId) : null;
  const closeEmailAction = () => {
    setEmailAction(null);
    clearExpenseEmailActionFromUrl();
  };
  const confirmEmailAction = async () => {
    if (!emailAction) return;
    const params = new URLSearchParams({
      id: emailAction.expenseId,
      action: emailAction.action,
      token: emailAction.token
    });
    const response = await fetch(`/expense-action?${params.toString()}`, { credentials: 'same-origin' });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '操作失敗');
    }
    await refreshAll();
    closeEmailAction();
  };
  // 付款人顯示：First Name Last Name (中文名)
  const paidByLabel = (item: Expense): string => {
    if (!item.paidBy) return '—';
    return memberDisplayName(memberById.get(item.paidBy)) || item.paidByName || '未知';
  };

  return (
    <section className="page">
      <PageTitle title="支出管理" subtitle="支出提交、預算分類與批准流程" />
      <Toolbar>
        <strong>待審核：{pending.length}</strong>
        <div className="toolbar-actions">
          {canManageNotify && (
            <button onClick={() => setNotifyOpen(true)} title="設置">⚙ 設置</button>
          )}
          {canEdit && <button className="primary expense-add-btn" onClick={() => setEditing(blankExpense())}>新增支出</button>}
          <select value={year} onChange={event => setYear(Number(event.target.value))} style={{ width: 'auto' }}>
            {years.length
              ? years.map(y => <option key={y} value={y}>{y} 年度</option>)
              : <option value={year}>{year} 年度</option>}
          </select>
        </div>
      </Toolbar>
      {editing && (
        <ExpenseForm
          expense={editing}
          members={members}
          categories={lookups?.expenseCategories ?? []}
          onClose={() => setEditing(null)}
          onSave={async payload => {
            await saveExpense(payload, editing.id || undefined);
            setEditing(null);
          }}
        />
      )}
      {deletingExpense && (
        <ConfirmDeleteModal
          title="刪除支出記錄"
          target={`${shortDate(deletingExpense.date)} ${deletingExpense.description || ''} ${currency(deletingExpense.amount)}`.trim()}
          onClose={() => setDeletingExpense(null)}
          onConfirm={async reason => { await deleteExpense(deletingExpense.id, reason); setDeletingExpense(null); }}
        />
      )}
      {invoicingExpense && (
        <ExpenseInvoiceModal
          expense={invoicingExpense}
          onClose={() => setInvoicingExpense(null)}
          onSave={async payload => {
            await invoiceExpense(invoicingExpense.id, payload);
            setInvoicingExpense(null);
          }}
        />
      )}
      {accountingExpense && (
        <ExpenseAccountModal
          expense={accountingExpense}
          onClose={() => setAccountingExpense(null)}
          onSave={async payload => {
            await accountExpense(accountingExpense.id, payload);
            setAccountingExpense(null);
          }}
        />
      )}
      {detailExpense && (
        <ExpenseDetailModal
          expense={detailExpense}
          memberById={memberById}
          onClose={() => setDetailExpense(null)}
        />
      )}
      {notifyOpen && settings && (
        <ExpenseNotifySettingsModal
          settings={settings}
          categories={lookups?.expenseCategories ?? []}
          onClose={() => setNotifyOpen(false)}
          onSave={async next => {
            await saveSettings(next);
            setNotifyOpen(false);
          }}
          onReload={refreshAll}
        />
      )}
      {emailAction && (
        <ConfirmModal
          title={emailAction.action === 'approve' ? '批准支出' : '拒絕支出'}
          message={
            <>
              確定要{emailAction.action === 'approve' ? '批准' : '拒絕'}這筆支出嗎？
              <br />
              <strong>{emailActionExpense ? `${shortDate(emailActionExpense.date)} ${emailActionExpense.description || ''} ${currency(emailActionExpense.amount)}`.trim() : emailAction.expenseId}</strong>
            </>
          }
          confirmText={emailAction.action === 'approve' ? '批准' : '拒絕'}
          danger={emailAction.action === 'reject'}
          onClose={closeEmailAction}
          onConfirm={confirmEmailAction}
        />
      )}
      <table className="expenses-table">
        <thead>
          <tr>
            <th>日期</th><th>描述</th><th>分類</th><th>付款人</th><th onClick={cycleExpAmt} title="點擊排序" style={{ cursor: 'pointer', userSelect: 'none' }}>金額{expAmtSort === 'desc' ? ' ↓' : expAmtSort === 'asc' ? ' ↑' : ''}</th>
            <th>狀態</th><th>開票</th><th>入賬</th><th></th>
          </tr>
        </thead>
        <tbody>
          {displayExpenses.map(item => {
            const approvalOp = (item.status === 'approved' || item.status === 'rejected')
              ? expenseOperatorDisplay(memberById, item.approvedBy, item.approvedByName, item.approvedAt) : null;
            const invoiceOp = item.invoicedAt ? expenseOperatorDisplay(memberById, item.invoicedBy, item.invoicedByName, item.invoicedAt) : null;
            const accountOp = item.accountedAt ? expenseOperatorDisplay(memberById, item.accountedBy, item.accountedByName, item.accountedAt) : null;

            const currentOperatorLabel = (user?.name || user?.email || '').trim().toLowerCase();
            const isCurrentApprover = Boolean(
              (user?.memberId && item.approvedBy && user.memberId === item.approvedBy) ||
              (currentOperatorLabel && item.approvedByName && item.approvedByName.trim().toLowerCase() === currentOperatorLabel)
            );
            const showInvoiceBtn = canEdit && item.status === 'approved' && !item.invoicedAt;
            const showAccountBtn = canEdit && !!item.invoicedAt && !item.accountedAt;
            const invoiceBadge = item.invoicedAt ? '已開票' : (item.status === 'approved' ? '待開票' : '—');
            const accountBadge = item.accountedAt ? '已入賬' : (item.invoicedAt ? '待入賬' : '—');

            return (
              <tr key={item.id}>
                <td data-label="日期">{shortDate(item.date)}</td>
                <td data-label="描述" className="expense-description-col">{isDesktop ? item.description : <span className="clamp-2" onClick={() => setDetailExpense(item)}>{item.description}</span>}</td>
                <td data-label="分類" className="expense-category-col">{isDesktop ? (item.categoryName || '-') : <span className="clamp-2" onClick={() => setDetailExpense(item)}>{(item.categoryId && categoryShortById.get(item.categoryId)) || item.categoryName || '-'}</span>}</td>
                <td data-label="付款人">{paidByLabel(item)}</td>
                <td data-label="金額">{currency(item.amount)}</td>
                <td data-label="狀態">
                  <div className="expense-status-cell">
                    <Badge>{expenseStatusLabels[item.status]}</Badge>
                    <ExpenseStatusOperator op={approvalOp} />
                    {canEdit && item.status === 'pending' && (
                      <div className="expense-status-actions">
                        <button className="primary" onClick={() => approveExpense(item.id)}>批准</button>
                        <button onClick={() => rejectExpense(item.id)}>拒絕</button>
                      </div>
                    )}
                  </div>
                </td>
                <td data-label="開票">
                  <div className="expense-status-cell">
                    <Badge>{invoiceBadge}</Badge>
                    <ExpenseStatusOperator op={invoiceOp} />
                    {showInvoiceBtn && (
                      <div
                        className="expense-status-actions"
                        title={isCurrentApprover ? '需另一位同工開票' : undefined}
                      >
                        <button
                          className="primary"
                          disabled={isCurrentApprover}
                          onClick={() => setInvoicingExpense(item)}
                        >
                          開票
                        </button>
                      </div>
                    )}
                  </div>
                </td>
                <td data-label="入賬">
                  <div className="expense-status-cell">
                    <Badge>{accountBadge}</Badge>
                    <ExpenseStatusOperator op={accountOp} />
                    {showAccountBtn && (
                      <div className="expense-status-actions">
                        <button className="primary" onClick={() => setAccountingExpense(item)}>入賬</button>
                      </div>
                    )}
                  </div>
                </td>
                <td className="actions">
                  {canEdit && <button onClick={() => setEditing(item)}>編輯</button>}
                  <button onClick={() => setDetailExpense(item)}>詳細</button>
                  {canEdit && <button onClick={() => setDeletingExpense(item)}>刪除</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function ExpenseNotifySettingsModal({ settings, categories, onClose, onSave, onReload }: {
  settings: AppSettings;
  categories: ExpenseCategory[];
  onClose: () => void;
  onSave: (next: AppSettings) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const current = settings.expenseNotify;
  const [tab, setTab] = useState<'notify' | 'template' | 'categories'>('notify');
  const [catRows, setCatRows] = useState(() => categories.map(c => ({ id: c.id, name: c.name, shortName: c.shortName ?? '' })));
  const [catSavedAt, setCatSavedAt] = useState(false);
  const [enabled, setEnabled] = useState(current?.enabled ?? false);
  const [recipientsText, setRecipientsText] = useState((current?.recipients ?? []).join('\n'));
  const [mailFrom, setMailFrom] = useState(current?.mailFrom ?? 'Seattle Bread of Life Christian Church <finance@bolccop.org>');
  const [replyTo, setReplyTo] = useState(current?.replyTo ?? 'finance@bolccop.org');
  const [subjectTemplate, setSubjectTemplate] = useState(current?.subjectTemplate ?? DEFAULT_EXPENSE_NOTIFY_SUBJECT);
  const [bodyTemplate, setBodyTemplate] = useState(current?.bodyTemplate ?? DEFAULT_EXPENSE_NOTIFY_BODY);
  const [includeActionButtons, setIncludeActionButtons] = useState(current?.includeActionButtons ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<Array<{ recipient: string; ok: boolean; status?: number; error?: string }> | null>(null);

  const handleSave = async () => {
    const recipients = recipientsText
      .split(/[\n,;]/)
      .map(s => s.trim())
      .filter(item => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
    if (enabled && recipients.length === 0) {
      setError('請至少填寫一個有效收件人郵箱');
      setTab('notify');
      return;
    }
    setBusy(true); setError(null);
    try {
      await onSave({
        ...settings,
        expenseNotify: {
          enabled,
          recipients,
          mailFrom: mailFrom.trim(),
          replyTo: replyTo.trim(),
          subjectTemplate,
          bodyTemplate,
          includeActionButtons
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失敗');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCategories = async () => {
    setBusy(true); setError(null); setCatSavedAt(false);
    try {
      await api.updateExpenseCategories(catRows.map(c => ({ id: c.id, name: c.name.trim(), shortName: c.shortName.trim() })));
      await onReload();
      setCatSavedAt(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失敗');
    } finally {
      setBusy(false);
    }
  };

  const handleSendTest = async () => {
    setTesting(true);
    setTestResults(null);
    setError(null);
    try {
      const res = await api.testExpenseNotify();
      setTestResults(res.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : '測試發送失敗');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header>
          <h2>設置</h2>
          <button type="button" onClick={onClose}>關閉</button>
        </header>

        <div className="settings-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'notify'} className={tab === 'notify' ? 'active' : ''} onClick={() => setTab('notify')}>通知設置</button>
          <button type="button" role="tab" aria-selected={tab === 'template'} className={tab === 'template' ? 'active' : ''} onClick={() => setTab('template')}>郵件模板</button>
          <button type="button" role="tab" aria-selected={tab === 'categories'} className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}>支出類型管理</button>
        </div>

        {tab === 'notify' && (
          <div className="modal-body" style={{ display: 'grid', gap: '0.85rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
              <span>啟用新增支出郵件通知</span>
            </label>
            <label>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>收件人（每行一個郵箱，或用逗號分隔）</span>
              <textarea
                value={recipientsText}
                onChange={e => setRecipientsText(e.target.value)}
                placeholder="andy@bolccop.org&#10;accounting@bolccop.org"
                rows={4}
                style={{ width: '100%', marginTop: '0.4rem' }}
              />
            </label>
            <label>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>寄件郵箱（bolccop.org）</span>
              <input
                value={mailFrom}
                onChange={e => setMailFrom(e.target.value)}
                style={{ width: '100%', marginTop: '0.4rem' }}
              />
            </label>
            <label>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>回信地址（Reply-To）</span>
              <input
                value={replyTo}
                onChange={e => setReplyTo(e.target.value)}
                style={{ width: '100%', marginTop: '0.4rem' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={includeActionButtons} onChange={e => setIncludeActionButtons(e.target.checked)} />
              <span>在郵件中加入批准 / 拒絕按鈕</span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
              <button type="button" onClick={handleSendTest} disabled={testing}>
                {testing ? '發送中…' : '發送測試郵件'}
              </button>
              <span style={{ fontSize: '0.8rem', color: '#68758a' }}>
                會把 [TEST] 樣板郵件發到上方每個收件人，失敗會顯示 Resend 的具體錯誤
              </span>
            </div>
            {testResults && (
              <div className="notify-test-results">
                {testResults.length === 0 && <div style={{ color: '#68758a', fontSize: '0.85rem' }}>沒有有效收件人。</div>}
                {testResults.map(r => (
                  <div key={r.recipient} className={r.ok ? 'notify-test-row ok' : 'notify-test-row fail'}>
                    <span className="notify-test-dot">{r.ok ? '✓' : '✗'}</span>
                    <span className="notify-test-email">{r.recipient}</span>
                    {r.status != null && <span className="notify-test-status">HTTP {r.status}</span>}
                    {r.error && <span className="notify-test-error">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'template' && (
          <div className="modal-body" style={{ display: 'grid', gap: '0.85rem' }}>
            <label>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>郵件主旨模板</span>
              <input
                value={subjectTemplate}
                onChange={e => setSubjectTemplate(e.target.value)}
                placeholder={DEFAULT_EXPENSE_NOTIFY_SUBJECT}
                style={{ width: '100%', marginTop: '0.4rem' }}
              />
            </label>
            <label>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>郵件 HTML 模板</span>
              <textarea
                value={bodyTemplate}
                onChange={e => setBodyTemplate(e.target.value)}
                rows={12}
                style={{ width: '100%', marginTop: '0.4rem', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}
              />
            </label>
            <div className="template-help">
              可用占位符：{'{{description}}'} {'{{amount}}'} {'{{category}}'} {'{{paidBy}}'} {'{{date}}'} {'{{notes}}'} {'{{submittedBy}}'} {'{{receiptUrl}}'} {'{{receiptLink}}'} {'{{actionButtons}}'}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#68758a', margin: 0 }}>
              {'{{actionButtons}}'} 會在啟用「在郵件中加入批准 / 拒絕按鈕」（通知設置 tab）時，被替換成兩個帶簽名 token 的按鈕；否則為空字串。
            </p>
          </div>
        )}

        {tab === 'categories' && (
          <div className="modal-body" style={{ display: 'grid', gap: '0.6rem' }}>
            <p style={{ fontSize: '0.8rem', color: '#68758a', margin: 0 }}>
              長類型用於網站表格顯示，短類型用於手機端卡片。短類型留空時手機端回退顯示長類型。
            </p>
            <div className="category-mgmt">
              <div className="category-mgmt-head">
                <span>長類型（網站）</span>
                <span>短類型（手機）</span>
              </div>
              {catRows.map((row, idx) => (
                <div key={row.id} className="category-mgmt-row">
                  <input
                    value={row.name}
                    onChange={e => setCatRows(rows => rows.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))}
                  />
                  <input
                    value={row.shortName}
                    placeholder="短類型"
                    onChange={e => setCatRows(rows => rows.map((r, i) => i === idx ? { ...r, shortName: e.target.value } : r))}
                  />
                </div>
              ))}
              {catRows.length === 0 && <div style={{ color: '#68758a', fontSize: '0.85rem' }}>暫無支出類型。</div>}
            </div>
            {catSavedAt && <div style={{ color: '#1f9d55', fontSize: '0.85rem' }}>已保存。</div>}
          </div>
        )}

        {error && (
          <div style={{ color: '#c0392b', fontSize: '0.9rem', padding: '0 0.5rem' }}>{error}</div>
        )}

        <footer>
          <button type="button" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="primary" onClick={tab === 'categories' ? handleSaveCategories : handleSave} disabled={busy}>{busy ? '保存中...' : '保存'}</button>
        </footer>
      </div>
    </div>
  );
}

async function uploadWorkflowAttachment(file: File, type: string, entityId: string) {
  if (file.type.startsWith('image/')) {
    const blob = await compressImage(file);
    const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
    return api.upload(compressed, type, entityId);
  }
  return api.upload(file, type, entityId);
}

function ExpenseInvoiceModal({ expense, onClose, onSave }: {
  expense: Expense;
  onClose: () => void;
  onSave: (payload: { invoiceNote?: string; invoiceAmount?: number; invoiceReceiptUrl?: string | null }) => Promise<void>;
}) {
  const [note, setNote] = useState(expense.invoiceNote || '');
  const [amount, setAmount] = useState(expense.invoiceAmount ?? expense.amount);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(expense.invoiceReceiptUrl || null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadWorkflowAttachment(file, 'expense-invoices', expense.id);
      setReceiptUrl(url);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const footer = (
    <>
      <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFile} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? '上傳中…' : receiptUrl ? '重新上傳附件' : '上傳附件'}
      </button>
      <button type="button" onClick={onClose}>取消</button>
      <button className="primary">保存開票</button>
    </>
  );

  return (
    <FormModal title="開票" onClose={onClose} onSubmit={() => onSave({ invoiceNote: note, invoiceAmount: amount, invoiceReceiptUrl: receiptUrl })} footer={footer}>
      <textarea value={note} onChange={event => setNote(event.target.value)} placeholder="開票描述" />
      <input type="number" min="0" step="0.01" value={amount || ''} onChange={event => setAmount(Number(event.target.value))} placeholder="開票金額" required />
      {receiptUrl && (
        <div className="attachment-preview">
          <button type="button" className="link-button" onClick={() => setPreviewUrl(receiptUrl)}>查看附件</button>
          {isImageAttachment(receiptUrl) && <img src={receiptUrl} alt="開票附件" />}
          <button type="button" onClick={() => setReceiptUrl(null)}>移除附件</button>
        </div>
      )}
      {previewUrl && <AttachmentPreviewModal url={previewUrl} title="開票附件" onClose={() => setPreviewUrl(null)} />}
    </FormModal>
  );
}

function ExpenseAccountModal({ expense, onClose, onSave }: {
  expense: Expense;
  onClose: () => void;
  onSave: (payload: { accountReceiptUrl?: string | null }) => Promise<void>;
}) {
  const [receiptUrl, setReceiptUrl] = useState<string | null>(expense.accountReceiptUrl || null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadWorkflowAttachment(file, 'expense-accounts', expense.id);
      setReceiptUrl(url);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const footer = (
    <>
      <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFile} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? '上傳中…' : receiptUrl ? '重新上傳附件' : '上傳附件'}
      </button>
      <button type="button" onClick={onClose}>取消</button>
      <button className="primary">保存入賬</button>
    </>
  );

  return (
    <FormModal title="入賬" onClose={onClose} onSubmit={() => onSave({ accountReceiptUrl: receiptUrl })} footer={footer}>
      <div className="detail-field">
        <small>支出</small>
        <span>{expense.description || '—'} · {currency(expense.amount)}</span>
      </div>
      {receiptUrl && (
        <div className="attachment-preview">
          <button type="button" className="link-button" onClick={() => setPreviewUrl(receiptUrl)}>查看附件</button>
          {isImageAttachment(receiptUrl) && <img src={receiptUrl} alt="入賬附件" />}
          <button type="button" onClick={() => setReceiptUrl(null)}>移除附件</button>
        </div>
      )}
      {previewUrl && <AttachmentPreviewModal url={previewUrl} title="入賬附件" onClose={() => setPreviewUrl(null)} />}
    </FormModal>
  );
}

function ExpenseDetailModal({ expense, memberById, onClose }: {
  expense: Expense;
  memberById: Map<string, Member>;
  onClose: () => void;
}) {
  const paidBy = expense.paidBy
    ? (memberDisplayName(memberById.get(expense.paidBy)) || expense.paidByName || '未知')
    : '—';
  const approvalOp = expense.status === 'approved' || expense.status === 'rejected'
    ? expenseOperatorDisplay(memberById, expense.approvedBy, expense.approvedByName, expense.approvedAt)
    : null;
  const invoiceOp = expense.invoicedAt ? expenseOperatorDisplay(memberById, expense.invoicedBy, expense.invoicedByName, expense.invoicedAt) : null;
  const accountOp = expense.accountedAt ? expenseOperatorDisplay(memberById, expense.accountedBy, expense.accountedByName, expense.accountedAt) : null;
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  const steps = [
    {
      title: '提交',
      meta: `${shortDate(expense.date)} · 付款人 ${paidBy}`,
      detail: `${expense.description || '—'} · ${currency(expense.amount)}`,
      url: expense.receiptUrl || null,
      done: true
    },
    {
      title: expense.status === 'rejected' ? '已拒絕' : '已批准',
      meta: approvalOp ? [approvalOp.name, approvalOp.at].filter(Boolean).join(' · ') : '待審核',
      detail: expense.status === 'pending' ? '尚未審核' : expenseStatusLabels[expense.status],
      url: null,
      done: expense.status !== 'pending'
    },
    {
      title: '已開票',
      meta: invoiceOp ? [invoiceOp.name, invoiceOp.at].filter(Boolean).join(' · ') : '待開票',
      detail: expense.invoicedAt ? `${currency(expense.invoiceAmount ?? expense.amount)}${expense.invoiceNote ? ` · ${expense.invoiceNote}` : ''}` : '尚未開票',
      url: expense.invoiceReceiptUrl || null,
      done: Boolean(expense.invoicedAt)
    },
    {
      title: '已入賬',
      meta: accountOp ? [accountOp.name, accountOp.at].filter(Boolean).join(' · ') : '待入賬',
      detail: expense.accountedAt ? '入賬完成' : '尚未入賬',
      url: expense.accountReceiptUrl || null,
      done: Boolean(expense.accountedAt)
    }
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={event => event.stopPropagation()}>
        <header>
          <h2>支出詳情</h2>
          <button type="button" onClick={onClose}>關閉</button>
        </header>
        <div className="detail-grid">
          <div className="detail-field"><small>描述</small><span>{expense.description || '—'}</span></div>
          <div className="detail-field"><small>分類</small><span>{expense.categoryName || '—'}</span></div>
          <div className="detail-field"><small>付款方式</small><span>{expense.paymentMethod || '—'}</span></div>
          <div className="detail-field"><small>備註</small><span>{expense.notes || '—'}</span></div>
        </div>
        <div className="workflow-timeline">
          {steps.map(step => (
            <div key={step.title} className={`workflow-step ${step.done ? 'done' : ''}`}>
              <span className="workflow-dot" />
              <div>
                <strong>{step.title}</strong>
                <p>{step.meta}</p>
                <small>{step.detail}</small>
                {step.url && (
                  <button type="button" className="link-button workflow-attachment-button" onClick={() => setPreview({ url: step.url!, title: `${step.title}附件` })}>
                    查看附件
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {preview && <AttachmentPreviewModal url={preview.url} title={preview.title} onClose={() => setPreview(null)} />}
      </div>
    </div>
  );
}

const auditActionLabels: Record<string, string> = {
  create: '新增',
  update: '修改',
  delete: '刪除',
  approve: '批准',
  reject: '拒絕',
  send: '發送'
};

// 操作徽章配色：刪除紅、新增綠、修改琥珀；批准/拒絕沿用同色系
const auditActionColors: Record<string, { bg: string; fg: string }> = {
  create: { bg: '#e6f6ec', fg: '#1d8a4a' },
  update: { bg: '#fef3cd', fg: '#a16207' },
  delete: { bg: '#fde8e8', fg: '#c0392b' },
  approve: { bg: '#e6f6ec', fg: '#1d8a4a' },
  reject: { bg: '#fde8e8', fg: '#c0392b' },
  send: { bg: '#e9f2ff', fg: '#1959b8' }
};

const auditEntityLabels: Record<string, string> = {
  member: '成員',
  offering: '奉獻',
  expense: '支出',
  tax_statement: '報稅文件',
  settings: '帳單設定',
  user: '用戶'
};

const auditFieldLabels: Record<string, string> = {
  name: '姓名', firstName: 'First Name', lastName: 'Last Name', partner: '配偶',
  email: '電郵', phone: '電話', homePhone: '住家電話', status: '狀態',
  joinDate: '入會日期', address: '地址', city: '城市', stateRegion: '州/省',
  postalCode: '郵編', notes: '備註', starred: '收藏', isTest: '測試數據',
  groupName: '分組', contactConfirmed: '聯絡確認', externalContact: '外部聯絡人',
  memberName: '奉獻人', amount: '金額', date: '日期', categoryName: '分類',
  methodName: '方式', receiptUrl: '憑證', description: '描述', paidByName: '付款人',
  approvedByName: '審批人', paymentMethod: '支付方式',
  role: '角色', active: '啟用', mailFrom: '寄件地址', replyTo: '回覆地址', signatureUrl: '簽名圖'
};

const auditDiffSkip = new Set([
  'id', 'createdAt', 'updatedAt', 'memberId', 'categoryId', 'methodId',
  'paidBy', 'approvedBy', 'groupId', 'importPid', 'importSource', 'avatarUrl',
  'totalOffering', 'htmlTemplate', 'textFields'
]);

function auditFmt(key: string, value: unknown): string {
  if (key === 'receiptUrl' || key === 'signatureUrl') return value ? '有' : '無';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'amount') return currency(Number(value));
  return String(value);
}

function AuditLogDetail({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  const before = log.before;
  const after = log.after;
  const hasSnapshot = Boolean(before || after);
  const isUpdate = Boolean(before && after);
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]))
    .filter(key => !auditDiffSkip.has(key))
    .filter(key => {
      const bv = before ? before[key] : undefined;
      const av = after ? after[key] : undefined;
      if ((bv !== null && typeof bv === 'object') || (av !== null && typeof av === 'object')) return false;
      if (isUpdate) return auditFmt(key, bv) !== auditFmt(key, av);
      return true;
    });

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(560px, 100%)' }}>
        <header><h2>操作詳情</h2><button type="button" onClick={onClose}>關閉</button></header>
        <div className="detail-grid">
          <div className="detail-field"><small>時間</small><span>{dateTime(log.createdAt)}</span></div>
          <div className="detail-field"><small>操作人</small><span>{log.userName || '—'}</span></div>
          <div className="detail-field"><small>操作</small><span>{auditActionLabels[log.action] || log.action}</span></div>
          <div className="detail-field"><small>對象類型</small><span>{auditEntityLabels[log.entityType] || log.entityType}</span></div>
          <div className="detail-field" style={{ gridColumn: '1 / -1' }}><small>對象</small><span>{log.entitySummary || '—'}</span></div>
          {log.reason && <div className="detail-field" style={{ gridColumn: '1 / -1' }}><small>原因／備註</small><span>{log.reason}</span></div>}
        </div>
        {hasSnapshot && keys.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="audit-diff">
              <thead><tr><th>欄位</th><th>修改前</th><th>修改後</th></tr></thead>
              <tbody>
                {keys.map(key => {
                  const bv = auditFmt(key, before ? before[key] : undefined);
                  const av = auditFmt(key, after ? after[key] : undefined);
                  return (
                    <tr key={key} className={bv !== av ? 'audit-diff-changed' : ''}>
                      <td>{auditFieldLabels[key] || key}</td>
                      <td>{bv}</td>
                      <td>{av}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {hasSnapshot && keys.length === 0 && <p className="settings-note">此操作無欄位明細變動。</p>}
        {!hasSnapshot && <p className="settings-note">此筆記錄無前後快照（可能為舊記錄）。</p>}
        <footer><button type="button" className="primary" onClick={onClose}>關閉</button></footer>
      </div>
    </div>
  );
}

function AuditLogTable({ logs }: { logs: AuditLog[] }) {
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);
  if (!logs.length) return <SimpleList items={[]} />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr><th>時間</th><th>操作人</th><th>操作</th><th className="desk-only">對象</th><th className="desk-only">原因／備註</th><th>詳情</th></tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id}>
              <td style={{ whiteSpace: 'nowrap' }}>
                <span className="desk-only">{dateTime(log.createdAt)}</span>
                <span className="mob-only">{tinyDate(log.createdAt)}</span>
              </td>
              <td>{log.userName || '—'}</td>
              <td>
                <span
                  className="badge"
                  style={{
                    background: (auditActionColors[log.action] ?? { bg: '#e9f2ff' }).bg,
                    color: (auditActionColors[log.action] ?? { fg: '#1959b8' }).fg
                  }}
                >
                  {auditActionLabels[log.action] || log.action}
                </span>
              </td>
              <td className="desk-only">{log.entitySummary || auditEntityLabels[log.entityType] || log.entityType}</td>
              <td className="desk-only">{log.reason || '—'}</td>
              <td className="actions"><button onClick={() => setDetailLog(log)}>詳情</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {detailLog && <AuditLogDetail log={detailLog} onClose={() => setDetailLog(null)} />}
    </div>
  );
}

function TaxStatementModal({ member, year, offerings, settings, onClose }: {
  member: Member;
  year: number;
  offerings: Offering[];
  settings: TaxStatementSettings;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const html = useMemo(
    () => buildTaxStatementHtml(buildTaxStatementData(member, member.id, offerings, year), undefined, settings),
    [member, offerings, year, settings]
  );

  // 把預覽 iframe 內的 .sheet 渲染成 A4 PDF（一頁內容只出一頁）
  const generatePdf = async () => {
    const doc = iframeRef.current?.contentDocument;
    const sheet = doc?.querySelector('.sheet') as HTMLElement | null;
    if (!doc || !sheet) throw new Error('預覽尚未就緒');
    // 簽名圖改走同源代理，否則 html2canvas 無法擷取跨域圖片
    const sig = doc.querySelector('.sign-img') as HTMLImageElement | null;
    if (sig && !sig.src.includes('/api/reports/tax-signature')) {
      await new Promise<void>(resolve => {
        sig.onload = () => resolve();
        sig.onerror = () => resolve();
        sig.src = '/api/reports/tax-signature';
      });
    }
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf')
    ]);
    const prevZoom = sheet.style.zoom;
    sheet.style.zoom = '';
    const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      .finally(() => { sheet.style.zoom = prevZoom; });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    let imgH = (canvas.height * pageW) / canvas.width;
    // 一頁內容時容許 2mm 捨入誤差，避免多出一張空白頁
    if (imgH <= pageH + 2) imgH = pageH;
    let position = 0;
    let heightLeft = imgH;
    pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
      heightLeft -= pageH;
    }
    return pdf;
  };

  const downloadPdf = async () => {
    if (downloading) return;
    setDownloading(true);
    setResult(null);
    try {
      const pdf = await generatePdf();
      const data = buildTaxStatementData(member, member.id, offerings, year);
      pdf.save(`${year} Annual Contribution Statement - ${data.donorName}.pdf`);
    } catch (caught) {
      setResult({ ok: false, message: caught instanceof Error ? caught.message : 'PDF 下載失敗' });
    } finally {
      setDownloading(false);
    }
  };

  const send = async () => {
    if (sending) return;
    setSending(true);
    setResult(null);
    let pdf: string | undefined;
    try {
      pdf = (await generatePdf()).output('datauristring').split('base64,')[1];
    } catch {
      pdf = undefined; // PDF 生成失敗則只寄 HTML 版，不阻擋發送
    }
    try {
      await api.sendTaxStatement(member.id, year, pdf);
      setResult({ ok: true, message: `已發送至 ${member.email}` });
    } catch (caught) {
      setResult({ ok: false, message: caught instanceof Error ? caught.message : '發送失敗' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(880px, 100%)' }}>
        <header>
          <h2>報稅文件預覽 — {memberDisplayName(member)}</h2>
          <button type="button" onClick={onClose}>關閉</button>
        </header>
        <iframe ref={iframeRef} className="tax-preview-frame" srcDoc={html} title="報稅文件預覽" />
        {result && <p className={result.ok ? 'tax-sent' : 'error'} style={{ margin: 0 }}>{result.message}</p>}
        <footer>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={() => iframeRef.current?.contentWindow?.print()}>列印</button>
            <button type="button" onClick={downloadPdf} disabled={downloading}>{downloading ? '生成中…' : '下載 PDF'}</button>
          </div>
          {member.email ? (
            <button type="button" className="primary" onClick={send} disabled={sending}>
              {sending ? '發送中…' : `發送至 ${member.email}`}
            </button>
          ) : (
            <button type="button" className="primary" disabled title="該成員無電郵地址">無電郵，無法發送</button>
          )}
        </footer>
      </div>
    </div>
  );
}

const mailFromPresets = [
  'Seattle Bread of Life Christian Church <Lingling@bolccop.org>',
  'Bread of Life Christian Church on the Plateau <giving@bolccop.org>',
  'Bread of Life Christian Church on the Plateau <finance@bolccop.org>',
  'Bread of Life Christian Church on the Plateau <office@bolccop.org>',
  'Bread of Life Christian Church on the Plateau <donations@bolccop.org>'
];

const textFieldLabels: Array<[keyof TaxStatementTextFields, string, 'input' | 'textarea']> = [
  ['churchNameEn', 'Church Name', 'input'],
  ['churchNameZh', '中文堂名', 'input'],
  ['churchAddress', '地址', 'input'],
  ['churchPhone', '電話', 'input'],
  ['churchWebsite', '網址', 'input'],
  ['appreciation', '致謝語', 'textarea'],
  ['notice', '聯絡提示', 'textarea'],
  ['disclosure', 'IRS 聲明', 'textarea'],
  ['signerName', '簽名人', 'input']
];

function TaxSettingsModal({
  settings,
  onClose,
  onSave
}: {
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState<AppSettings>(() => ({
    taxStatement: normalizeTaxStatementSettings(settings.taxStatement)
  }));
  const [tab, setTab] = useState<'mail' | 'signature' | 'template'>('mail');
  const [templateMode, setTemplateMode] = useState<'text' | 'html'>('text');
  const [htmlEditorMode, setHtmlEditorMode] = useState<'edit' | 'preview'>('edit');
  const [customMail, setCustomMail] = useState(!mailFromPresets.includes(settings.taxStatement.mailFrom));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const updateTax = (patch: Partial<TaxStatementSettings>) => {
    setDraft(current => ({
      taxStatement: normalizeTaxStatementSettings({
        ...current.taxStatement,
        ...patch,
        textFields: {
          ...current.taxStatement.textFields,
          ...(patch.textFields || {})
        }
      })
    }));
  };

  const updateTextField = (key: keyof TaxStatementTextFields, value: string) => {
    updateTax({ textFields: { ...draft.taxStatement.textFields, [key]: value } });
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await onSave({ taxStatement: normalizeTaxStatementSettings(draft.taxStatement) });
      setMessage('設定已儲存');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '設定儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const uploadSignature = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      const { url } = await api.upload(file, 'signatures', 'tax-statement');
      updateTax({ signatureUrl: url });
      setMessage('簽名已上傳，請儲存設定');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '簽名上傳失敗');
    } finally {
      setUploading(false);
    }
  };

  const selectedMailFrom = mailFromPresets.includes(draft.taxStatement.mailFrom)
    ? draft.taxStatement.mailFrom
    : mailFromPresets[0];
  const htmlPreview = useMemo(() => buildTaxStatementHtml({
    year: new Date().getFullYear() - 1,
    donorName: 'Grace Chen (陳恩典)',
    donorAddress: '65 Front St. S., Issaquah, WA 98027',
    gifts: [
      { date: `${new Date().getFullYear() - 1}-01-07`, fund: '主日奉獻', method: '支票', amount: 250 },
      { date: `${new Date().getFullYear() - 1}-03-17`, fund: '特殊奉獻', method: '現金', amount: 120 },
      { date: `${new Date().getFullYear() - 1}-11-24`, fund: '線上奉獻', method: '轉帳', amount: 500 }
    ],
    total: 870
  }, undefined, draft.taxStatement), [draft.taxStatement]);

  return (
    <div className="modal-backdrop">
      <div className="modal tax-settings-modal">
        <header>
          <div className="settings-modal-head">
            <h2>帳單設定</h2>
            <p>寄件信箱、簽名與帳單模板</p>
          </div>
          <button type="button" onClick={onClose}>關閉</button>
        </header>

        <div className="settings-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'mail'} className={tab === 'mail' ? 'active' : ''} onClick={() => setTab('mail')}>寄件郵箱</button>
          <button type="button" role="tab" aria-selected={tab === 'signature'} className={tab === 'signature' ? 'active' : ''} onClick={() => setTab('signature')}>簽名</button>
          <button type="button" role="tab" aria-selected={tab === 'template'} className={tab === 'template' ? 'active' : ''} onClick={() => setTab('template')}>文件模板</button>
        </div>

        {tab === 'mail' && (
          <div className="settings-panel">
            <label>
              From
              <select
                value={customMail ? 'custom' : selectedMailFrom}
                onChange={event => {
                  if (event.target.value === 'custom') {
                    setCustomMail(true);
                    return;
                  }
                  setCustomMail(false);
                  updateTax({ mailFrom: event.target.value });
                }}
              >
                {mailFromPresets.map(item => <option key={item} value={item}>{item}</option>)}
                <option value="custom">自訂...</option>
              </select>
            </label>
            {customMail && (
              <label>
                自訂 From
                <input value={draft.taxStatement.mailFrom} onChange={event => updateTax({ mailFrom: event.target.value })} />
              </label>
            )}
            <p className="settings-callout">bolccop.org 網域已完成驗證，可使用任何自訂信箱發送。</p>
            <label>
              Reply-To
              <input
                type="email"
                value={draft.taxStatement.replyTo || DEFAULT_REPLY_TO}
                onChange={event => updateTax({ replyTo: event.target.value })}
              />
            </label>
          </div>
        )}

        {tab === 'signature' && (
          <div className="settings-panel">
            <div className="signature-block">
              <div className="signature-preview">
                {draft.taxStatement.signatureUrl
                  ? <img src={draft.taxStatement.signatureUrl} alt="Signature preview" />
                  : <span>尚未設定簽名</span>}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={event => uploadSignature(event.target.files?.[0])}
              />
              <div className="signature-actions">
                <button type="button" className="primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? '上傳中...' : '上傳新簽名'}
                </button>
                <span className="settings-note">建議使用透明背景 PNG，會自動套用至報稅文件。</span>
              </div>
              <label>
                簽名圖片 URL
                <input value={draft.taxStatement.signatureUrl} onChange={event => updateTax({ signatureUrl: event.target.value })} />
              </label>
            </div>
          </div>
        )}

        {tab === 'template' && (
          <div className="settings-panel">
            <div className="settings-tabs secondary">
              <button type="button" className={templateMode === 'text' ? 'active' : ''} onClick={() => setTemplateMode('text')}>文字字段</button>
              <button type="button" className={templateMode === 'html' ? 'active' : ''} onClick={() => setTemplateMode('html')}>HTML 編輯</button>
            </div>

            {templateMode === 'text' && (
              <>
                <div className="form-grid settings-grid">
                  {textFieldLabels.map(([key, label, kind]) => (
                    <label key={key}>
                      {label}
                      {kind === 'textarea' ? (
                        <textarea value={draft.taxStatement.textFields[key]} onChange={event => updateTextField(key, event.target.value)} />
                      ) : (
                        <input value={draft.taxStatement.textFields[key]} onChange={event => updateTextField(key, event.target.value)} />
                      )}
                    </label>
                  ))}
                </div>
                <button type="button" onClick={() => updateTax({ textFields: DEFAULT_TAX_STATEMENT_TEXT_FIELDS })}>恢復預設文字</button>
              </>
            )}

            {templateMode === 'html' && (
              <>
                <div className="template-actions">
                  <button type="button" onClick={() => updateTax({ htmlTemplate: settings.taxStatement.htmlTemplate })}>載入當前模板</button>
                  <button type="button" onClick={() => updateTax({ htmlTemplate: DEFAULT_TAX_STATEMENT_HTML_TEMPLATE })}>恢復預設 HTML</button>
                  <button type="button" className={htmlEditorMode === 'edit' ? 'primary' : ''} onClick={() => setHtmlEditorMode('edit')}>HTML 編輯</button>
                  <button type="button" className={htmlEditorMode === 'preview' ? 'primary' : ''} onClick={() => setHtmlEditorMode('preview')}>預覽</button>
                </div>
                {htmlEditorMode === 'edit' ? (
                  <textarea
                    className="html-template-editor"
                    spellCheck={false}
                    value={draft.taxStatement.htmlTemplate}
                    onChange={event => updateTax({ htmlTemplate: event.target.value })}
                  />
                ) : (
                  <iframe className="html-template-preview" srcDoc={htmlPreview} title="HTML 模板預覽" />
                )}
                <div className="template-token-hint">
                  <span>可用占位符：</span>
                  {['{{year}}', '{{contributorName}}', '{{contributorAddress}}', '{{statementDate}}', '{{donorRows}}', '{{giftRows}}', '{{giftCount}}', '{{giftLabel}}', '{{total}}', '{{signatureUrl}}', '{{churchNameEn}}', '{{churchNameZh}}', '{{churchAddress}}', '{{churchPhone}}', '{{churchWebsite}}', '{{appreciation}}', '{{notice}}', '{{disclosure}}', '{{signerName}}'].map(token => (
                    <code key={token}>{token}</code>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {message && <p className={message.includes('失敗') || message.includes('Forbidden') ? 'error' : 'tax-sent'}>{message}</p>}
        <footer>
          <button type="button" onClick={() => setDraft({ taxStatement: DEFAULT_TAX_STATEMENT_SETTINGS })}>全部恢復預設</button>
          <button type="button" className="primary" onClick={save} disabled={saving}>{saving ? '儲存中...' : '儲存'}</button>
        </footer>
      </div>
    </div>
  );
}

function AnnualTaxReportSection() {
  const { members, offerings, settings, saveMember, saveSettings } = useFinance();
  const { hasPermission } = useAuth();
  const [taxMember, setTaxMember] = useState<Member | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const item of offerings) {
      const y = (item.date || '').slice(0, 4);
      if (y) set.add(y);
    }
    return Array.from(set).sort().reverse();
  }, [offerings]);

  const [year, setYear] = useState<number>(() => {
    const current = new Date().getFullYear();
    const present = new Set(offerings.map(o => (o.date || '').slice(0, 4)).filter(Boolean));
    if (present.has(String(current - 1))) return current - 1;
    const sorted = Array.from(present).sort();
    return sorted.length ? Number(sorted[sorted.length - 1]) : current;
  });

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  const { rows, anonymousTotal, grandTotal } = useMemo(() => {
    const yearStr = String(year);
    const agg = new Map<string, { count: number; total: number }>();
    let anonymous = 0;
    for (const item of offerings) {
      if ((item.date || '').slice(0, 4) !== yearStr) continue;
      if (!item.memberId) { anonymous += item.amount; continue; }
      const current = agg.get(item.memberId) ?? { count: 0, total: 0 };
      current.count += 1;
      current.total += item.amount;
      agg.set(item.memberId, current);
    }
    const rows = Array.from(agg.entries())
      .map(([memberId, value]) => ({ member: memberById.get(memberId), ...value }))
      .filter((row): row is { member: Member; count: number; total: number } => Boolean(row.member))
      .sort((a, b) => b.total - a.total);
    return { rows, anonymousTotal: anonymous, grandTotal: rows.reduce((sum, row) => sum + row.total, 0) };
  }, [offerings, year, memberById]);

  const action = (
    <div className="tax-report-actions">
      {hasPermission('finance_admin', 'super_admin') && (
        <button type="button" className="primary" onClick={() => setSettingsOpen(true)}>帳單設定</button>
      )}
      <select value={year} onChange={event => setYear(Number(event.target.value))} style={{ width: 'auto' }}>
      {years.length
        ? years.map(y => <option key={y} value={y}>{y} 年度</option>)
        : <option value={year}>{year} 年度</option>}
      </select>
    </div>
  );

  return (
    <Panel title="年度奉獻報稅證明" action={action}>
      <p className="tax-summary">
        <span>{year} 年度 · 共 <strong>{rows.length}</strong> 人參與奉獻 · 合計 <strong>{currency(grandTotal)}</strong></span>
        <span className="tax-summary-extra">
          {anonymousTotal > 0 && <>另有匿名奉獻 <strong>{currency(anonymousTotal)}</strong>（無法開立報稅證明）{' · '}</>}
          總計奉獻 <strong>{currency(grandTotal + anonymousTotal)}</strong>
        </span>
      </p>
      {rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="tax-report-table">
            <thead>
              <tr><th>姓名</th><th className="desk-only">電郵</th><th className="desk-only">筆數</th><th>年度合計</th><th>操作</th></tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const address = [row.member.address, row.member.city, row.member.stateRegion, row.member.postalCode]
                  .filter(Boolean)
                  .join(', ');
                return (
                <tr key={row.member.id}>
                  <td>
                    <strong style={{ display: 'block' }}>{memberDisplayName(row.member)}</strong>
                    {address && <small className="desk-only">{address}</small>}
                  </td>
                  <td className="desk-only">{row.member.email || <span style={{ color: '#94a3b8' }}>無電郵</span>}</td>
                  <td className="desk-only">{row.count}</td>
                  <td>{currency(row.total)}</td>
                  <td className="actions">
                    <button onClick={() => setEditingMember(row.member)}>編輯</button>
                    <button className="primary" onClick={() => setTaxMember(row.member)}><span className="desk-only">生成年度帳單</span><span className="mob-only">帳單</span></button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">該年度暫無實名奉獻記錄</div>
      )}
      {editingMember && (
        <MemberForm
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSave={async payload => { await saveMember(payload, editingMember.id); setEditingMember(null); }}
        />
      )}
      {taxMember && (
        <TaxStatementModal
          member={taxMember}
          year={year}
          offerings={offerings}
          settings={settings.taxStatement}
          onClose={() => setTaxMember(null)}
        />
      )}
      {settingsOpen && (
        <TaxSettingsModal
          settings={settings}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </Panel>
  );
}

function ReportsPage() {
  const { auditLogs } = useFinance();

  return (
    <section className="page reports-page">
      <PageTitle title="報表日誌" subtitle="月度收支、預算與操作日誌" />

      {/* 第二部分：年度奉獻報稅 */}
      <AnnualTaxReportSection />

      {/* 第三部分：操作日誌 */}
      <Panel title={`操作日誌（最近 ${auditLogs.length} 條）`}>
        <AuditLogTable logs={auditLogs} />
      </Panel>
    </section>
  );
}

function PageTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <header className="page-title">
      <div>
        <h1>{title}</h1>
      </div>
      <div className="page-title-right">
        <p>{subtitle}</p>
        {action}
      </div>
    </header>
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head"><h2>{title}</h2>{action}</div>
      {children}
    </section>
  );
}

function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className ? `toolbar ${className}` : 'toolbar'}>{children}</div>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}

function Empty({ title }: { title: string }) {
  return <section className="page"><div className="empty">{title}</div></section>;
}

function SimpleList({ items }: { items: string[] }) {
  return <div className="simple-list">{items.length ? items.map(item => <span key={item}>{item}</span>) : <small>暫無資料</small>}</div>;
}

function MemberForm({
  member,
  onClose,
  onSave
}: {
  member: Member;
  onClose: () => void;
  onSave: (payload: Partial<Member>) => Promise<void>;
}) {
  const [form, setForm] = useState(member);
  return (
    <FormModal title="成員資料" onClose={onClose} onSubmit={() => onSave(form)}>
      <label>First Name *<input value={form.firstName ?? ''} onChange={event => setForm({ ...form, firstName: event.target.value })} required /></label>
      <label>Last Name<input value={form.lastName ?? ''} onChange={event => setForm({ ...form, lastName: event.target.value })} /></label>
      <label>姓名（中文）<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label>Partner<input value={form.partner ?? ''} onChange={event => setForm({ ...form, partner: event.target.value })} /></label>
      <label>電話<input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label>
      <label>Email<input value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
      <label>地址<input value={form.address ?? ''} onChange={event => setForm({ ...form, address: event.target.value })} /></label>
      <label>城市<input value={form.city ?? ''} onChange={event => setForm({ ...form, city: event.target.value })} /></label>
      <label>州/省<input value={form.stateRegion ?? ''} onChange={event => setForm({ ...form, stateRegion: event.target.value })} /></label>
      <label>郵編<input value={form.postalCode ?? ''} onChange={event => setForm({ ...form, postalCode: event.target.value })} /></label>
      <label className="form-wide">備註<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
    </FormModal>
  );
}

// 上一個星期日（今天為週日則取當天），回傳 yyyy-mm-dd（本地時區）
function lastSundayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Group offering methods by groupName, preserving the (sort_order) input order.
 *  Returns [groupLabel, items] pairs; '' label = ungrouped (rendered flat). */
function groupOfferingMethods(methods: OfferingMethod[]): [string, OfferingMethod[]][] {
  const order: string[] = [];
  const map = new Map<string, OfferingMethod[]>();
  for (const m of methods) {
    const g = m.groupName?.trim() || '';
    if (!map.has(g)) { map.set(g, []); order.push(g); }
    map.get(g)!.push(m);
  }
  return order.map(g => [g, map.get(g)!]);
}

// 可搜索的奉獻人選擇器：輸入即過濾，下方彈出匹配名單，含「匿名」項與鍵盤操作
function MemberCombobox({ members, value, onChange }: { members: Member[]; value: string | null; onChange: (id: string | null) => void }) {
  const label = (m: Member) => (memberDisplayName(m) || m.name || '（未命名）');
  const selected = value ? members.find(m => m.id === value) ?? null : null;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const sorted = useMemo(
    () => [...members].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || label(a).localeCompare(label(b))),
    [members]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(m => `${label(m)} ${m.name} ${m.firstName ?? ''} ${m.lastName ?? ''} ${m.email ?? ''}`.toLowerCase().includes(q));
  }, [sorted, query]);
  const shown = filtered;

  const pick = (id: string | null) => { onChange(id); setOpen(false); setQuery(''); };

  return (
    <div className="combobox" ref={wrapRef}>
      <input
        type="text"
        value={open ? query : (selected ? label(selected) : '')}
        placeholder="搜尋姓名，留空＝匿名"
        onFocus={() => { setOpen(true); setQuery(''); setHi(0); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, shown.length)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (hi === 0) pick(null); else pick(shown[hi - 1]?.id ?? null); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
      />
      {open && (
        <ul className="combobox-menu">
          <li className={hi === 0 ? 'active' : ''} onMouseDown={e => { e.preventDefault(); pick(null); }} onMouseEnter={() => setHi(0)}>匿名</li>
          {shown.map((m, i) => (
            <li key={m.id} className={hi === i + 1 ? 'active' : ''} onMouseDown={e => { e.preventDefault(); pick(m.id); }} onMouseEnter={() => setHi(i + 1)}>
              {m.starred ? '★ ' : ''}{label(m)}
            </li>
          ))}
          {shown.length === 0 && <li className="combobox-empty">無匹配</li>}
        </ul>
      )}
    </div>
  );
}

function OfferingForm({
  offering,
  members,
  categories,
  methods,
  onClose,
  onSave
}: {
  offering: Offering;
  members: Member[];
  categories: OfferingCategory[];
  methods: OfferingMethod[];
  onClose: () => void;
  onSave: (payload: Partial<Offering>) => Promise<void>;
}) {
  const [form, setForm] = useState<Offering>(() => {
    if (offering.id) return offering; // 編輯既有記錄：保留原值
    // 新增記錄：套用預設值（支付方式=支票、分類=主日奉獻、日期=上一個星期日）
    return {
      ...offering,
      date: lastSundayStr(),
      methodId: offering.methodId ?? methods.find(m => m.name === '支票')?.id ?? null,
      categoryId: offering.categoryId ?? categories.find(c => c.name === '主日奉獻' || c.name === '主日奉献')?.id ?? null
    };
  });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const blob = await compressImage(file);
      const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
      const { url } = await api.upload(compressed, 'offerings', form.id || undefined);
      setForm(f => ({ ...f, receiptUrl: url }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const footer = (
    <>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? '上傳中…' : form.receiptUrl ? '重新上傳附件' : '上傳附件'}
      </button>
      <button className="primary">保存</button>
    </>
  );

  return (
    <FormModal title="奉獻記錄" onClose={onClose} onSubmit={() => onSave(form)} footer={footer}>
      <label>
        奉獻人
        <MemberCombobox members={members} value={form.memberId ?? null} onChange={id => setForm({ ...form, memberId: id })} />
      </label>
      <label>奉獻金額<input type="number" min="0" step="0.01" value={form.amount || ''} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} required /></label>
      <label>
        支付方式
        <select value={form.methodId ?? ''} onChange={event => setForm({ ...form, methodId: event.target.value || null })}>
          <option value="">未選擇</option>
          {groupOfferingMethods(methods).map(([group, items]) => group
            ? <optgroup key={group} label={group}>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
            : items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)
          )}
        </select>
      </label>
      <label>
        分類
        <select value={form.categoryId ?? ''} onChange={event => setForm({ ...form, categoryId: event.target.value || null })}>
          <option value="">未選擇</option>
          {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label>日期<input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} required /></label>
      <label className="form-wide">備註<textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label>
      {form.receiptUrl && (
        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center' }}>
          <img src={form.receiptUrl} alt="憑證預覽" style={{ maxWidth: 400, maxHeight: 400, objectFit: 'contain', borderRadius: 6, display: 'block', border: '1px solid #e2e8f0' }} />
          <button type="button" onClick={() => setForm(f => ({ ...f, receiptUrl: null }))}>移除附件</button>
        </div>
      )}
    </FormModal>
  );
}

function ExpenseForm({
  expense,
  members,
  categories,
  onClose,
  onSave
}: {
  expense: Expense;
  members: Member[];
  categories: ExpenseCategory[];
  onClose: () => void;
  onSave: (payload: Partial<Expense>) => Promise<void>;
}) {
  const [form, setForm] = useState(expense);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const blob = await compressImage(file);
      const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
      const { url } = await api.upload(compressed, 'expenses', form.id || undefined);
      setForm(f => ({ ...f, receiptUrl: url }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const footer = (
    <>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? '上傳中…' : form.receiptUrl ? '重新上傳附件' : '上傳附件'}
      </button>
      <button className="primary">保存</button>
    </>
  );

  return (
    <FormModal title="支出記錄" onClose={onClose} onSubmit={() => onSave(form)} footer={footer}>
      <input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="支出描述" required />
      <input type="number" min="0" step="0.01" value={form.amount || ''} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} placeholder="支出金額" required />
      <input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} required />
      <select value={form.categoryId ?? ''} onChange={event => setForm({ ...form, categoryId: event.target.value || null })}>
        <option value="">選擇分類</option>
        {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select value={form.paidBy ?? ''} onChange={event => setForm({ ...form, paidBy: event.target.value || null })}>
        <option value="">付款人</option>
        {[...members]
          .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || a.name.localeCompare(b.name))
          .map(item => (
            <option key={item.id} value={item.id}>{item.starred ? '★ ' : ''}{memberDisplayName(item) || item.name}</option>
          ))}
      </select>
      <select value={form.paymentMethod} onChange={event => setForm({ ...form, paymentMethod: event.target.value })}>
        <option>現金</option><option>銀行轉帳</option><option>支票</option><option>信用卡</option>
      </select>
      <textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="備註" />
      {form.receiptUrl && (
        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center' }}>
          <img src={form.receiptUrl} alt="憑證預覽" style={{ maxWidth: 400, maxHeight: 400, objectFit: 'contain', borderRadius: 6, display: 'block', border: '1px solid #e2e8f0' }} />
          <button type="button" onClick={() => setForm(f => ({ ...f, receiptUrl: null }))}>移除附件</button>
        </div>
      )}
    </FormModal>
  );
}

function FormModal({ title, children, onClose, onSubmit, footer }: { title: string; children: React.ReactNode; onClose: () => void; onSubmit: () => void | Promise<void>; footer?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失敗');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={handleSubmit}>
        <header><h2>{title}</h2><button type="button" onClick={onClose}>關閉</button></header>
        <div className="form-grid">{children}</div>
        {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
        <footer>{footer ?? <><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={busy}>{busy ? '保存中…' : '保存'}</button></>}</footer>
      </form>
    </div>
  );
}

function blankMember(): Member {
  return {
    id: '',
    name: '',
    firstName: '',
    lastName: '',
    partner: '',
    email: '',
    phone: '',
    homePhone: '',
    groupId: null,
    status: 'active',
    joinDate: new Date().toISOString().slice(0, 10),
    address: '',
    city: '',
    stateRegion: '',
    postalCode: '',
    notes: '',
    starred: false,
    contactConfirmed: false,
    externalContact: false,
    totalOffering: 0,
    createdAt: '',
    updatedAt: ''
  };
}

function blankOffering(memberId: string | null = null): Offering {
  return { id: '', memberId, amount: 0, date: new Date().toISOString().slice(0, 10), categoryId: null, methodId: null, notes: '', receiptUrl: null, createdAt: '', updatedAt: '' };
}

function blankExpense(): Expense {
  return { id: '', categoryId: null, amount: 0, date: new Date().toISOString().slice(0, 10), description: '', paidBy: null, approvedBy: null, paymentMethod: '現金', status: 'pending', notes: '', receiptUrl: null, createdAt: '', updatedAt: '' };
}

function ConfirmModal({ title, message, confirmText = '確認', danger, onClose, onConfirm }: {
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onConfirm();
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : '操作失敗');
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(420px, 100%)' }}>
        <header><h2>{title}</h2><button type="button" onClick={onClose}>關閉</button></header>
        <p style={{ margin: 0, color: '#526176' }}>{message}</p>
        {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
        <footer>
          <button type="button" onClick={onClose} disabled={busy}>取消</button>
          <button type="button" className="primary" style={danger ? { background: '#dc2626' } : undefined} disabled={busy} onClick={run}>
            {busy ? '處理中…' : confirmText}
          </button>
        </footer>
      </div>
    </div>
  );
}

function UserForm({ user, onClose, onSaved }: {
  user?: UserAccount;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = Boolean(user);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'auditor');
  const [active, setActive] = useState(user?.active ?? true);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      if (isEdit && user) {
        await api.updateUser(user.id, { name, email, role, active });
      } else {
        await api.createUser({ name, email, role, password });
      }
      await onSaved();
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : '儲存失敗');
      setBusy(false);
    }
  };

  const footer = (
    <>
      <button type="button" onClick={onClose} disabled={busy}>取消</button>
      <button className="primary" disabled={busy}>{busy ? '儲存中…' : '儲存'}</button>
    </>
  );

  return (
    <FormModal title={isEdit ? '編輯用戶' : '新增用戶'} onClose={onClose} onSubmit={submit} footer={footer}>
      <input value={name} onChange={event => setName(event.target.value)} placeholder="姓名 *" required />
      <input value={email} onChange={event => setEmail(event.target.value)} type="email" placeholder="電郵 *" required />
      <select value={role} onChange={event => setRole(event.target.value as Role)}>
        {(Object.keys(roleLabels) as Role[]).map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
      </select>
      {isEdit ? (
        <select value={active ? '1' : '0'} onChange={event => setActive(event.target.value === '1')}>
          <option value="1">啟用</option>
          <option value="0">停用</option>
        </select>
      ) : (
        <input value={password} onChange={event => setPassword(event.target.value)} type="password" placeholder="初始密碼 *（至少 6 字元）" required />
      )}
      {err && <p className="error" style={{ gridColumn: '1 / -1', margin: 0 }}>{err}</p>}
    </FormModal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: UserAccount; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (password.length < 6) { setErr('密碼至少 6 個字元'); return; }
    setBusy(true);
    setErr(null);
    try {
      await api.resetUserPassword(user.id, password);
      setDone(true);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : '重置失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" style={{ width: 'min(420px, 100%)' }} onSubmit={event => { event.preventDefault(); submit(); }}>
        <header><h2>重置密碼</h2><button type="button" onClick={onClose}>關閉</button></header>
        <p style={{ margin: 0, color: '#526176' }}>為 <strong>{user.name}</strong> 設定新密碼。</p>
        <input
          value={password}
          onChange={event => { setPassword(event.target.value); setErr(null); setDone(false); }}
          type="password"
          placeholder="新密碼（至少 6 字元）"
          autoFocus
        />
        {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
        {done && <p className="tax-sent" style={{ margin: 0 }}>密碼已重置</p>}
        <footer>
          <button type="button" onClick={onClose} disabled={busy}>關閉</button>
          <button type="submit" className="primary" disabled={busy || done}>{busy ? '處理中…' : '重置密碼'}</button>
        </footer>
      </form>
    </div>
  );
}

function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [resetting, setResetting] = useState<UserAccount | null>(null);
  const [deleting, setDeleting] = useState<UserAccount | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.users();
      setUsers(result.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <section className="page">
      <PageTitle title="用戶管理" subtitle="帳號、角色與密碼管理" />
      <Toolbar>
        <strong>共 {users.length} 個帳號</strong>
        <button className="primary" onClick={() => setCreating(true)}>新增用戶</button>
      </Toolbar>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <div className="empty">載入中…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr><th>姓名</th><th>電郵</th><th>角色</th><th>狀態</th><th>操作</th></tr>
            </thead>
            <tbody>
              {users.map(item => (
                <tr key={item.id}>
                  <td>{item.name}{item.id === currentUser?.id && <small>目前登入</small>}</td>
                  <td>{item.email}</td>
                  <td><Badge>{roleLabels[item.role]}</Badge></td>
                  <td>{item.active ? '啟用' : <span style={{ color: '#94a3b8' }}>停用</span>}</td>
                  <td className="actions">
                    <button onClick={() => setEditing(item)}>編輯</button>
                    <button onClick={() => setResetting(item)}>重置密碼</button>
                    <button onClick={() => setDeleting(item)} disabled={item.id === currentUser?.id}>刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <UserForm onClose={() => setCreating(false)} onSaved={async () => { setCreating(false); await load(); }} />}
      {editing && <UserForm user={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
      {deleting && (
        <ConfirmModal
          title="刪除用戶"
          message={<>確定要刪除「<strong>{deleting.name}</strong>」嗎？此操作無法復原。</>}
          confirmText="確認刪除"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await api.deleteUser(deleting.id); setDeleting(null); await load(); }}
        />
      )}
    </section>
  );
}

function AccountProfile({ user }: { user: User }) {
  return (
    <div className="panel account-panel">
      <div className="profile-card">
        <div className="profile-card-avatar">{userInitials(user.name, user.email)}</div>
        <strong>{user.name}</strong>
        <span className="user-card-role">{roleLabels[user.role]}</span>
      </div>
      <div className="detail-grid">
        <div className="detail-field"><small>姓名</small><span>{user.name}</span></div>
        <div className="detail-field"><small>角色</small><span>{roleLabels[user.role]}</span></div>
        <div className="detail-field" style={{ gridColumn: '1 / -1' }}><small>電郵</small><span>{user.email}</span></div>
      </div>
    </div>
  );
}

function AccountPassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => { setErr(null); setDone(false); };

  const submit = async () => {
    if (busy) return;
    if (next.length < 6) { setErr('新密碼至少 6 個字元'); return; }
    if (next !== confirm) { setErr('兩次輸入的新密碼不一致'); return; }
    setBusy(true);
    setErr(null);
    try {
      await api.changePassword(current, next);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : '變更失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel account-panel">
      <form className="stack" onSubmit={event => { event.preventDefault(); submit(); }}>
        <label>當前密碼
          <input type="password" value={current} onChange={event => { setCurrent(event.target.value); reset(); }} required />
        </label>
        <label>新密碼（至少 6 字元）
          <input type="password" value={next} onChange={event => { setNext(event.target.value); reset(); }} required />
        </label>
        <label>確認新密碼
          <input type="password" value={confirm} onChange={event => { setConfirm(event.target.value); reset(); }} required />
        </label>
        {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
        {done && <p className="tax-sent" style={{ margin: 0 }}>密碼已變更</p>}
        <div className="account-actions">
          <button type="submit" className="primary" disabled={busy}>{busy ? '處理中…' : '變更密碼'}</button>
        </div>
      </form>
    </div>
  );
}

function AccountPage({ tab, setTab }: { tab: AccountTab; setTab: (tab: AccountTab) => void }) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <section className="page">
      <PageTitle title="帳號設定" subtitle="個人資料與密碼" />
      <div className="settings-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'profile'} className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>個人資料</button>
        <button type="button" role="tab" aria-selected={tab === 'password'} className={tab === 'password' ? 'active' : ''} onClick={() => setTab('password')}>變更密碼</button>
      </div>
      {tab === 'profile' ? <AccountProfile user={user} /> : <AccountPassword />}
    </section>
  );
}

function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : '發送失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" style={{ width: 'min(420px, 100%)' }} onSubmit={event => { event.preventDefault(); submit(); }}>
        <header><h2>忘記密碼</h2><button type="button" onClick={onClose}>關閉</button></header>
        {sent ? (
          <p style={{ margin: 0, color: '#526176', lineHeight: 1.6 }}>
            若該電郵已註冊，重設密碼的連結已寄出，請查收郵件（含垃圾郵件匣）。連結 1 小時內有效。
          </p>
        ) : (
          <>
            <p style={{ margin: 0, color: '#526176', lineHeight: 1.6 }}>輸入你的帳號電郵，系統會寄出重設密碼的連結。</p>
            <input type="email" value={email} onChange={event => { setEmail(event.target.value); setErr(null); }} placeholder="電郵" autoFocus required />
            {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
          </>
        )}
        <footer>
          <button type="button" onClick={onClose} disabled={busy}>關閉</button>
          {!sent && <button type="submit" className="primary" disabled={busy}>{busy ? '發送中…' : '寄出重設連結'}</button>}
        </footer>
      </form>
    </div>
  );
}

function ResetPasswordView({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (password.length < 6) { setErr('密碼至少 6 個字元'); return; }
    if (password !== confirm) { setErr('兩次輸入的密碼不一致'); return; }
    setBusy(true);
    setErr(null);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : '重設失敗');
    } finally {
      setBusy(false);
    }
  };

  const goLogin = () => { window.location.href = window.location.pathname; };

  return (
    <main className="login-shell">
      <span className="login-dot dot-one" />
      <span className="login-dot dot-two" />
      <span className="login-dot dot-three" />
      <section className="reset-panel">
        <p className="eyebrow">BOLCCOP Finance 2.0</p>
        <h1>重設密碼</h1>
        {done ? (
          <div className="stack">
            <p className="tax-sent" style={{ margin: 0 }}>密碼已重設，請使用新密碼登入。</p>
            <button type="button" className="primary" onClick={goLogin}>前往登入</button>
          </div>
        ) : (
          <form className="stack" onSubmit={event => { event.preventDefault(); submit(); }}>
            <label>新密碼（至少 6 字元）
              <input type="password" value={password} onChange={event => { setPassword(event.target.value); setErr(null); }} required />
            </label>
            <label>確認新密碼
              <input type="password" value={confirm} onChange={event => { setConfirm(event.target.value); setErr(null); }} required />
            </label>
            {err && <p className="error" style={{ margin: 0 }}>{err}</p>}
            <button type="submit" className="primary" disabled={busy}>{busy ? '處理中…' : '重設密碼'}</button>
            <button type="button" className="login-forgot" onClick={goLogin}>返回登入</button>
          </form>
        )}
      </section>
    </main>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const finance = useFinance();
  const initialRoute = useMemo(() => routeFromLocation(), []);
  const [page, setPage] = useState<Page>(initialRoute.page);
  const [accountTab, setAccountTab] = useState<AccountTab>(initialRoute.accountTab);
  const resetToken = useMemo(() => new URLSearchParams(window.location.search).get('reset'), []);
  const isClaimRoute = window.location.pathname.replace(/\/+$/, '') === '/claim';

  useEffect(() => {
    if (user) finance.refreshAll();
  }, [user]);

  useEffect(() => {
    const onPopState = () => {
      const route = routeFromLocation();
      setPage(route.page);
      setAccountTab(route.accountTab);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToPage = (nextPage: Page, nextAccountTab: AccountTab = 'profile') => {
    setPage(nextPage);
    setAccountTab(nextPage === 'account' ? nextAccountTab : 'profile');
    const nextPath = pathForPage(nextPage, nextAccountTab);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  };

  const content = useMemo(() => {
    if (finance.loading) return <Empty title="正在載入資料" />;
    if (finance.error) return <Empty title={finance.error} />;
    if (page === 'members') return <MembersPage />;
    if (page === 'offerings') return <OfferingsPage />;
    if (page === 'expenses') return <ExpensesPage />;
    if (page === 'reports') return <ReportsPage />;
    if (page === 'users') return <UsersPage />;
    if (page === 'account') return <AccountPage tab={accountTab} setTab={tab => navigateToPage('account', tab)} />;
    return <DashboardPage onNavigate={navigateToPage} />;
  }, [page, accountTab, finance.loading, finance.error, finance.members, finance.offerings, finance.expenses, finance.dashboard]);

  if (loading) return <Empty title="正在檢查登入狀態" />;
  if (isClaimRoute) return <ClaimPage />;
  if (resetToken && !user) return <ResetPasswordView token={resetToken} />;
  if (!user) return <LoginPage />;

  return (
    <div className="app-shell">
      <Shell
        page={page}
        setPage={navigateToPage}
        onOpenAccount={tab => navigateToPage('account', tab)}
      />
      <main className="content">{content}</main>
    </div>
  );
}
