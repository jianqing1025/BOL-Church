import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useFinance } from './context/FinanceContext';
import { LoginAnimation } from './components/LoginAnimation';
import type { AppSettings, AuditLog, Expense, ExpenseCategory, ExpenseStatus, Member, MemberStatus, Offering, OfferingCategory, OfferingMethod, Role, TaxStatementSettings, TaxStatementTextFields, User, UserAccount } from './types';
import { currency, dateTime, shortDate } from './utils/format';
import { api } from './utils/api';
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
  const [email, setEmail] = useState('BOLCCOP@Gmail.com');
  const [password, setPassword] = useState('Bolccop110550');
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
            <h1>信望愛靈糧堂财务系统</h1>
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

function Shell({ page, setPage, onOpenAccount }: {
  page: Page;
  setPage: (page: Page) => void;
  onOpenAccount: (tab: 'profile' | 'password') => void;
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
          <small>财务管理系统</small>
        </div>
      </div>
      <nav>
        {items.map(([id, label]) => (
          <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>
            {label}
          </button>
        ))}
      </nav>
      {user && (
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
      )}
    </aside>
  );
}

function StatCard({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <article className="stat-card">
      <span>{title}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

function MiniBars({ data }: { data: Array<{ label: string; amount?: number; offerings?: number; expenses?: number }> }) {
  const max = Math.max(1, ...data.flatMap(item => [item.amount ?? 0, item.offerings ?? 0, item.expenses ?? 0]));
  return (
    <div className="chart">
      {data.map(item => (
        <div key={item.label} className="bar-row">
          <span>{item.label}</span>
          <div className="bar-track">
            {'amount' in item ? (
              <i style={{ width: `${((item.amount || 0) / max) * 100}%` }} />
            ) : (
              <>
                <i style={{ width: `${((item.offerings || 0) / max) * 100}%` }} />
                <b style={{ width: `${((item.expenses || 0) / max) * 100}%` }} />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardPage() {
  const { dashboard, lookups, offerings, expenses } = useFinance();
  if (!dashboard) return <Empty title="正在載入數據看板" />;

  // 计算收入统计
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const weekOfferings = offerings.filter(o => new Date(o.date) >= weekStart);
  const monthOfferings = offerings.filter(o => new Date(o.date) >= monthStart);
  const yearOfferings = offerings.filter(o => new Date(o.date) >= yearStart);
  const totalOfferings = offerings;

  const weekOfferingTotal = weekOfferings.reduce((sum, o) => sum + o.amount, 0);
  const monthOfferingTotal = monthOfferings.reduce((sum, o) => sum + o.amount, 0);
  const yearOfferingTotal = yearOfferings.reduce((sum, o) => sum + o.amount, 0);
  const totalOfferingAmount = totalOfferings.reduce((sum, o) => sum + o.amount, 0);

  // 计算支出统计
  const monthExpenses = expenses.filter(e => new Date(e.date) >= monthStart);
  const yearExpenses = expenses.filter(e => new Date(e.date) >= yearStart);
  const totalExpenses = expenses;

  const monthExpenseTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const yearExpenseTotal = yearExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalExpenseAmount = totalExpenses.reduce((sum, e) => sum + e.amount, 0);

  const pendingExpenses = expenses.filter(e => e.status === 'pending');
  const budgetTotal = (lookups?.expenseCategories ?? []).reduce((sum, item) => sum + item.budgetMonthly, 0);
  const approvedTotal = expenses.filter(item => item.status === 'approved').reduce((sum, item) => sum + item.amount, 0);
  const budgetUsed = budgetTotal ? Math.min(100, Math.round((approvedTotal / budgetTotal) * 100)) : 0;

  return (
    <section className="page">
      <PageTitle title="數據看板" subtitle="本週、本月與待處理財務事項總覽" />

      {/* 收入部分 */}
      <Panel title="收入統計">
        <div className="stats-grid">
          <StatCard title="本週奉獻" value={currency(weekOfferingTotal)} />
          <StatCard title="本月奉獻" value={currency(monthOfferingTotal)} />
          <StatCard title="本年奉獻" value={currency(yearOfferingTotal)} />
          <StatCard title="所有奉獻" value={currency(totalOfferingAmount)} />
        </div>
      </Panel>

      {/* 支出部分 */}
      <Panel title="支出統計">
        <div className="stats-grid">
          <StatCard title="本月支出" value={currency(monthExpenseTotal)} note={`預算剩餘 ${currency(dashboard.monthBudgetRemaining)}`} />
          <StatCard title="本年支出" value={currency(yearExpenseTotal)} />
          <StatCard title="所有支出" value={currency(totalExpenseAmount)} />
          <StatCard title="待批准支出" value={`${dashboard.pendingExpenseCount}`} note="需要財務同工處理" />
        </div>
      </Panel>

      {/* 动态部分 */}
      <div className="two-col finance-overview">
        <Panel title="預算 vs 實際">
          <div className="budget-overview">
            <div>
              <span>Approved Expenses</span>
              <strong>{currency(approvedTotal)}</strong>
            </div>
            <div>
              <span>Monthly Budget</span>
              <strong>{currency(budgetTotal)}</strong>
            </div>
          </div>
          <div className="budget-meter" aria-label={`Budget used ${budgetUsed}%`}>
            <i style={{ width: `${budgetUsed}%` }} />
          </div>
          <p className="panel-note">已使用 {budgetUsed}% · 剩餘 {currency(Math.max(0, budgetTotal - approvedTotal))}</p>
          <MiniBars data={(lookups?.expenseCategories ?? []).map(category => ({
            label: category.name,
            offerings: category.budgetMonthly,
            expenses: expenses.filter(item => item.categoryId === category.id && item.status === 'approved').reduce((sum, item) => sum + item.amount, 0)
          }))} />
        </Panel>
        <Panel title="現金流">
          <p className="panel-note">最近月份收入與核准支出對比</p>
          <MiniBars data={dashboard.incomeExpense} />
        </Panel>
      </div>

      <div className="two-col">
        <Panel title="最近奉獻">
          <SimpleList items={offerings.slice(0, 5).map(item => `${shortDate(item.date)} ${item.memberName || '匿名'} ${currency(item.amount)}`)} />
        </Panel>
        <Panel title="最近支出">
          <SimpleList items={expenses.slice(0, 5).map(item => `${shortDate(item.date)} ${item.description || item.categoryName || '支出'} ${currency(item.amount)}`)} />
        </Panel>
      </div>

      <div className="two-col">
        <Panel title="奉獻趨勢">
          <MiniBars data={dashboard.offeringTrend} />
        </Panel>
        <Panel title="待審核支出">
          <SimpleList items={pendingExpenses.slice(0, 5).map(item => `${shortDate(item.date)} ${item.description} ${currency(item.amount)}`)} />
        </Panel>
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

function OfferingDetail({ offering, offerings, members, onClose, onNavigate }: {
  offering: Offering;
  offerings: Offering[];
  members: Member[];
  onClose: () => void;
  onNavigate: (offering: Offering) => void;
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
    .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || a.name.localeCompare(b.name));

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
            <th className="col-year" style={{ width: colWidth('yearOffering'), display: colHidden('yearOffering') ? 'none' : undefined }}>今年奉獻</th>
            <th className="desk-only" style={{ width: colWidth('totalOffering'), display: colHidden('totalOffering') ? 'none' : undefined }}>累計奉獻</th>
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

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div style={{ position: 'relative' }} onClick={event => event.stopPropagation()}>
        <img src={url} alt="憑證" style={{ maxWidth: '80vw', maxHeight: '75vh', borderRadius: 8, display: 'block', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} />
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: -14, right: -14, width: 28, height: 28, borderRadius: '50%', border: 'none', background: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: 14, lineHeight: '28px', textAlign: 'center', padding: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
        >✕</button>
      </div>
    </div>
  );
}

function OfferingsPage() {
  const { members, offerings, lookups, saveOffering, deleteOffering } = useFinance();
  const { hasPermission } = useAuth();
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

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const offeringMemberLabel = (item: Offering) =>
    item.memberId ? (memberDisplayName(memberById.get(item.memberId)) || item.memberName || '未知成員') : '匿名';

  return (
    <section className="page">
      <PageTitle title="奉獻記錄" subtitle="分類、支付方式、匿名奉獻與收據追蹤" />
      <Toolbar>
        <strong>目前列表合計：{currency(total)}</strong>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
          onClose={() => setDetail(null)}
          onNavigate={setDetail}
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
      <table>
        <thead>
          <tr><th>日期</th><th>成員</th><th>分類</th><th>方式</th><th>金額</th><th>備註</th><th>憑證</th><th>操作</th></tr>
        </thead>
        <tbody>
          {filteredOfferings.map(item => (
            <tr key={item.id}>
              <td>{shortDate(item.date)}</td>
              <td>{offeringMemberLabel(item)}</td>
              <td>{item.categoryName || '-'}</td>
              <td>{item.methodName || '-'}</td>
              <td>{currency(item.amount)}</td>
              <td>{item.notes}</td>
              <td>{item.receiptUrl ? <button style={{ background: 'none', border: 'none', color: 'var(--accent, #4f7df3)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }} onClick={() => setLightbox(item.receiptUrl!)}>查看憑證</button> : <span style={{ color: '#aaa' }}>—</span>}</td>
              <td className="actions"><button onClick={() => setDetail(item)}>詳情</button>{canEdit && <><button onClick={() => setEditing(item)}>編輯</button><button onClick={() => setDeletingOffering(item)}>刪除</button></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ExpensesPage() {
  const { members, expenses, lookups, saveExpense, deleteExpense, approveExpense, rejectExpense } = useFinance();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('super_admin', 'finance_admin', 'dev');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const pending = expenses.filter(item => item.status === 'pending');

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
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
        {canEdit && <button className="primary" onClick={() => setEditing(blankExpense())}>新增支出</button>}
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
      <table>
        <thead>
          <tr><th>日期</th><th>描述</th><th>分類</th><th>付款人</th><th>金額</th><th>狀態</th><th></th></tr>
        </thead>
        <tbody>
          {expenses.map(item => (
            <tr key={item.id}>
              <td>{shortDate(item.date)}</td>
              <td>{item.description}</td>
              <td>{item.categoryName || '-'}</td>
              <td>{paidByLabel(item)}</td>
              <td>{currency(item.amount)}</td>
              <td><Badge>{expenseStatusLabels[item.status]}</Badge></td>
              <td className="actions">
                {canEdit && item.status === 'pending' && <button onClick={() => approveExpense(item.id)}>批准</button>}
                {canEdit && item.status === 'pending' && <button onClick={() => rejectExpense(item.id)}>拒絕</button>}
                {canEdit && <button onClick={() => setEditing(item)}>編輯</button>}
                {canEdit && <button onClick={() => setDeletingExpense(item)}>刪除</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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
  settings: '報稅設定',
  user: '用戶'
};

function AuditLogTable({ logs }: { logs: AuditLog[] }) {
  if (!logs.length) return <SimpleList items={[]} />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr><th>時間</th><th>操作人</th><th>操作</th><th>對象</th><th>原因／備註</th></tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{dateTime(log.createdAt)}</td>
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
              <td>{log.entitySummary || auditEntityLabels[log.entityType] || log.entityType}</td>
              <td>{log.reason || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const { hasPermission } = useAuth();
  const canSend = hasPermission('super_admin', 'finance_admin');
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const html = useMemo(
    () => buildTaxStatementHtml(buildTaxStatementData(member, member.id, offerings, year), undefined, settings),
    [member, offerings, year, settings]
  );

  const downloadPdf = async () => {
    if (downloading) return;
    const sheet = iframeRef.current?.contentDocument?.querySelector('.sheet') as HTMLElement | null;
    if (!sheet) return;
    setDownloading(true);
    setResult(null);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = 210;
      const pageH = 297;
      const imgH = (canvas.height * pageW) / canvas.width;
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
    try {
      await api.sendTaxStatement(member.id, year);
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
          <button type="button" onClick={() => iframeRef.current?.contentWindow?.print()}>列印</button>
          <button type="button" onClick={downloadPdf} disabled={downloading}>{downloading ? '生成中…' : '下載 PDF'}</button>
          {canSend && (member.email ? (
            <button type="button" className="primary" onClick={send} disabled={sending}>
              {sending ? '發送中…' : `發送至 ${member.email}`}
            </button>
          ) : (
            <button type="button" className="primary" disabled title="該成員無電郵地址">無電郵，無法發送</button>
          ))}
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
            <h2>報稅設定</h2>
            <p>寄件信箱、簽名與報稅文件模板</p>
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
        <button type="button" onClick={() => setSettingsOpen(true)}>報稅設定</button>
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
        {year} 年度 · 共 <strong>{rows.length}</strong> 人參與奉獻 · 合計 <strong>{currency(grandTotal)}</strong>
      </p>
      {rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr><th>姓名</th><th>電郵</th><th>筆數</th><th>年度合計</th><th>操作</th></tr>
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
                    {address && <small>{address}</small>}
                  </td>
                  <td>{row.member.email || <span style={{ color: '#94a3b8' }}>無電郵</span>}</td>
                  <td>{row.count}</td>
                  <td>{currency(row.total)}</td>
                  <td className="actions">
                    <button onClick={() => setEditingMember(row.member)}>編輯</button>
                    <button onClick={() => setTaxMember(row.member)}>生成稅務文件</button>
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
      {anonymousTotal > 0 && (
        <p className="tax-foot">另有匿名奉獻 {currency(anonymousTotal)}（無法開立報稅證明）</p>
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

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-title">
      <div>
        <h1>{title}</h1>
      </div>
      <p>{subtitle}</p>
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

function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="toolbar">{children}</div>;
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
      <input value={form.firstName ?? ''} onChange={event => setForm({ ...form, firstName: event.target.value })} placeholder="First Name *" required />
      <input value={form.lastName ?? ''} onChange={event => setForm({ ...form, lastName: event.target.value })} placeholder="Last Name" />
      <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="姓名(中文）" />
      <input value={form.partner ?? ''} onChange={event => setForm({ ...form, partner: event.target.value })} placeholder="Partner" />
      <input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="電話" />
      <input value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="Email" />
      <input value={form.address ?? ''} onChange={event => setForm({ ...form, address: event.target.value })} placeholder="地址" />
      <input value={form.city ?? ''} onChange={event => setForm({ ...form, city: event.target.value })} placeholder="城市" />
      <input value={form.stateRegion ?? ''} onChange={event => setForm({ ...form, stateRegion: event.target.value })} placeholder="州/省" />
      <input value={form.postalCode ?? ''} onChange={event => setForm({ ...form, postalCode: event.target.value })} placeholder="郵編" />
      <textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="備註" />
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
    // 新增記錄：套用預設值（支付方式=支票、分類=主日奉献、日期=上一個星期日）
    return {
      ...offering,
      date: lastSundayStr(),
      methodId: offering.methodId ?? methods.find(m => m.name === '支票')?.id ?? null,
      categoryId: offering.categoryId ?? categories.find(c => c.name === '主日奉献')?.id ?? null
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
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? '上傳中…' : form.receiptUrl ? '重新上傳附件' : '上傳附件'}
      </button>
      <button className="primary">保存</button>
    </>
  );

  return (
    <FormModal title="奉獻記錄" onClose={onClose} onSubmit={() => onSave(form)} footer={footer}>
      <select
        value={form.memberId ?? ''}
        onChange={event => setForm({ ...form, memberId: event.target.value || null })}
        style={{ color: form.memberId ? '#172033' : '#94a3b8' }}
      >
        <option value="" style={{ color: '#94a3b8' }}>奉献人</option>
        {[...members]
          .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || a.name.localeCompare(b.name))
          .map(item => (
            <option key={item.id} value={item.id} style={{ color: '#172033' }}>{item.starred ? '★ ' : ''}{memberDisplayName(item) || item.name}</option>
          ))}
      </select>
      <input type="number" min="0" step="0.01" value={form.amount || ''} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} placeholder="奉献金额" required />
      <select value={form.methodId ?? ''} onChange={event => setForm({ ...form, methodId: event.target.value || null })}>
        <option value="">支付方式</option>
        {methods.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select value={form.categoryId ?? ''} onChange={event => setForm({ ...form, categoryId: event.target.value || null })}>
        <option value="">選擇分類</option>
        {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} required />
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
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? '上傳中…' : form.receiptUrl ? '重新上傳附件' : '上傳附件'}
      </button>
      <button className="primary">保存</button>
    </>
  );

  return (
    <FormModal title="支出記錄" onClose={onClose} onSubmit={() => onSave(form)} footer={footer}>
      <input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="支出描述" required />
      <input type="number" min="0" step="0.01" value={form.amount || ''} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} placeholder="支出金额" required />
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

function FormModal({ title, children, onClose, onSubmit, footer }: { title: string; children: React.ReactNode; onClose: () => void; onSubmit: () => void; footer?: React.ReactNode }) {
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
        <header><h2>{title}</h2><button type="button" onClick={onClose}>關閉</button></header>
        <div className="form-grid">{children}</div>
        <footer>{footer ?? <><button type="button" onClick={onClose}>取消</button><button className="primary">保存</button></>}</footer>
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

function AccountPage({ tab, setTab }: { tab: 'profile' | 'password'; setTab: (tab: 'profile' | 'password') => void }) {
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
  const [page, setPage] = useState<Page>('dashboard');
  const [accountTab, setAccountTab] = useState<'profile' | 'password'>('profile');
  const resetToken = useMemo(() => new URLSearchParams(window.location.search).get('reset'), []);

  useEffect(() => {
    if (user) finance.refreshAll();
  }, [user]);

  const content = useMemo(() => {
    if (finance.loading) return <Empty title="正在載入資料" />;
    if (finance.error) return <Empty title={finance.error} />;
    if (page === 'members') return <MembersPage />;
    if (page === 'offerings') return <OfferingsPage />;
    if (page === 'expenses') return <ExpensesPage />;
    if (page === 'reports') return <ReportsPage />;
    if (page === 'users') return <UsersPage />;
    if (page === 'account') return <AccountPage tab={accountTab} setTab={setAccountTab} />;
    return <DashboardPage />;
  }, [page, accountTab, finance.loading, finance.error, finance.members, finance.offerings, finance.expenses, finance.dashboard]);

  if (loading) return <Empty title="正在檢查登入狀態" />;
  if (resetToken && !user) return <ResetPasswordView token={resetToken} />;
  if (!user) return <LoginPage />;

  return (
    <div className="app-shell">
      <Shell
        page={page}
        setPage={setPage}
        onOpenAccount={tab => { setAccountTab(tab); setPage('account'); }}
      />
      <main className="content">{content}</main>
    </div>
  );
}
