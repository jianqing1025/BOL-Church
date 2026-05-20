import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useFinance } from './context/FinanceContext';
import { LoginAnimation } from './components/LoginAnimation';
import type { AuditLog, Expense, ExpenseCategory, ExpenseStatus, Member, MemberStatus, Offering, OfferingCategory, OfferingMethod } from './types';
import { currency, dateTime, shortDate } from './utils/format';
import { api } from './utils/api';

type Page = 'dashboard' | 'members' | 'offerings' | 'expenses' | 'reports';

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
          </form>
        </div>
      </section>
    </main>
  );
}

function Shell({ page, setPage }: { page: Page; setPage: (page: Page) => void }) {
  const { user, logout } = useAuth();
  const items: Array<[Page, string]> = [
    ['dashboard', '儀表板'],
    ['members', '成員管理'],
    ['offerings', '奉獻記錄'],
    ['expenses', '支出管理'],
    ['reports', '報表日誌']
  ];

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
      <div className="user-card">
        <strong>{user?.name}</strong>
        <small>{user?.role}</small>
        <button onClick={logout}>登出</button>
      </div>
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
  const { dashboard, offerings, expenses } = useFinance();
  if (!dashboard) return <Empty title="正在載入儀表板" />;

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
  const weekExpenses = expenses.filter(e => new Date(e.date) >= weekStart);
  const monthExpenses = expenses.filter(e => new Date(e.date) >= monthStart);
  const yearExpenses = expenses.filter(e => new Date(e.date) >= yearStart);
  const totalExpenses = expenses;

  const weekExpenseTotal = weekExpenses.reduce((sum, e) => sum + e.amount, 0);
  const monthExpenseTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const yearExpenseTotal = yearExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalExpenseAmount = totalExpenses.reduce((sum, e) => sum + e.amount, 0);

  const pendingExpenses = expenses.filter(e => e.status === 'pending');

  return (
    <section className="page">
      <PageTitle title="儀表板" subtitle="本週、本月與待處理財務事項總覽" />

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
          <StatCard title="本週支出" value={currency(weekExpenseTotal)} />
          <StatCard title="本月支出" value={currency(monthExpenseTotal)} note={`預算剩餘 ${currency(dashboard.monthBudgetRemaining)}`} />
          <StatCard title="本年支出" value={currency(yearExpenseTotal)} />
          <StatCard title="所有支出" value={currency(totalExpenseAmount)} />
          <StatCard title="待批准支出" value={`${dashboard.pendingExpenseCount}`} note="需要財務同工處理" />
        </div>
      </Panel>

      {/* 动态部分 */}
      <div className="two-col">
        <Panel title="最近奉獻">
          <SimpleList items={offerings.slice(0, 5).map(item => `${shortDate(item.date)} ${item.memberName || '匿名'} ${currency(item.amount)}`)} />
        </Panel>
        <Panel title="收支對比">
          <MiniBars data={dashboard.incomeExpense} />
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
          <button type="button" onClick={() => setActiveOnly(v => !v)} className={activeOnly ? 'primary' : ''}>
            {activeOnly ? '僅活躍成員' : '顯示全部'}
          </button>
          <button className="primary" onClick={() => setEditing(blankMember())}>新增成員</button>
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
  const [editing, setEditing] = useState<Offering | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [detail, setDetail] = useState<Offering | null>(null);
  const [deletingOffering, setDeletingOffering] = useState<Offering | null>(null);
  const total = offerings.reduce((sum, item) => sum + item.amount, 0);

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const offeringMemberLabel = (item: Offering) =>
    item.memberId ? (memberDisplayName(memberById.get(item.memberId)) || item.memberName || '未知成員') : '匿名';

  return (
    <section className="page">
      <PageTitle title="奉獻記錄" subtitle="分類、支付方式、匿名奉獻與收據追蹤" />
      <Toolbar>
        <strong>目前列表合計：{currency(total)}</strong>
        <button className="primary" onClick={() => setEditing(blankOffering())}>記錄奉獻</button>
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
          offerings={offerings}
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
          {offerings.map(item => (
            <tr key={item.id}>
              <td>{shortDate(item.date)}</td>
              <td>{offeringMemberLabel(item)}</td>
              <td>{item.categoryName || '-'}</td>
              <td>{item.methodName || '-'}</td>
              <td>{currency(item.amount)}</td>
              <td>{item.notes}</td>
              <td>{item.receiptUrl ? <button style={{ background: 'none', border: 'none', color: 'var(--accent, #4f7df3)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }} onClick={() => setLightbox(item.receiptUrl!)}>查看憑證</button> : <span style={{ color: '#aaa' }}>—</span>}</td>
              <td className="actions"><button onClick={() => setDetail(item)}>詳情</button><button onClick={() => setEditing(item)}>編輯</button><button onClick={() => setDeletingOffering(item)}>刪除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ExpensesPage() {
  const { members, expenses, lookups, saveExpense, deleteExpense, approveExpense, rejectExpense } = useFinance();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const pending = expenses.filter(item => item.status === 'pending');

  return (
    <section className="page">
      <PageTitle title="支出管理" subtitle="支出提交、預算分類與批准流程" />
      <Toolbar>
        <strong>待審核：{pending.length}</strong>
        <button className="primary" onClick={() => setEditing(blankExpense())}>新增支出</button>
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
              <td>{item.paidByName || '-'}</td>
              <td>{currency(item.amount)}</td>
              <td><Badge>{expenseStatusLabels[item.status]}</Badge></td>
              <td className="actions">
                {item.status === 'pending' && <button onClick={() => approveExpense(item.id)}>批准</button>}
                {item.status === 'pending' && <button onClick={() => rejectExpense(item.id)}>拒絕</button>}
                <button onClick={() => setEditing(item)}>編輯</button>
                <button onClick={() => setDeletingExpense(item)}>刪除</button>
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
  reject: '拒絕'
};

const auditEntityLabels: Record<string, string> = {
  member: '成員',
  offering: '奉獻',
  expense: '支出'
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
              <td><Badge>{auditActionLabels[log.action] || log.action}</Badge></td>
              <td>{log.entitySummary || auditEntityLabels[log.entityType] || log.entityType}</td>
              <td>{log.reason || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportsPage() {
  const { dashboard, lookups, expenses, auditLogs } = useFinance();
  const budgetTotal = (lookups?.expenseCategories ?? []).reduce((sum, item) => sum + item.budgetMonthly, 0);
  const approvedTotal = expenses.filter(item => item.status === 'approved').reduce((sum, item) => sum + item.amount, 0);

  return (
    <section className="page">
      <PageTitle title="報表日誌" subtitle="月度收支、預算與操作日誌" />

      {/* 第一部分：報表 */}
      <div className="two-col">
        <Panel title="預算 vs 實際">
          <p className="report-number">{currency(approvedTotal)} / {currency(budgetTotal)}</p>
          <MiniBars data={(lookups?.expenseCategories ?? []).map(category => ({
            label: category.name,
            offerings: category.budgetMonthly,
            expenses: expenses.filter(item => item.categoryId === category.id && item.status === 'approved').reduce((sum, item) => sum + item.amount, 0)
          }))} />
        </Panel>
        <Panel title="現金流">
          <MiniBars data={dashboard?.incomeExpense ?? []} />
        </Panel>
      </div>

      {/* 第二部分：操作日誌 */}
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
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
  const [form, setForm] = useState(offering);
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? '上傳中…' : '上傳附件'}
        </button>
        {form.receiptUrl && (
          <>
            <img src={form.receiptUrl} alt="憑證預覽" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
            <button type="button" onClick={() => setForm(f => ({ ...f, receiptUrl: null }))}>移除</button>
          </>
        )}
      </div>
      <button className="primary">保存</button>
    </>
  );

  return (
    <FormModal title="奉獻記錄" onClose={onClose} onSubmit={() => onSave(form)} footer={footer}>
      <input type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} placeholder="金額" required />
      <input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} required />
      <select value={form.memberId ?? ''} onChange={event => setForm({ ...form, memberId: event.target.value || null })}>
        <option value="">匿名奉獻</option>
        {[...members]
          .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || a.name.localeCompare(b.name))
          .map(item => (
            <option key={item.id} value={item.id}>{item.starred ? '★ ' : ''}{memberDisplayName(item) || item.name}</option>
          ))}
      </select>
      <select value={form.categoryId ?? ''} onChange={event => setForm({ ...form, categoryId: event.target.value || null })}>
        <option value="">選擇分類</option>
        {categories.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select value={form.methodId ?? ''} onChange={event => setForm({ ...form, methodId: event.target.value || null })}>
        <option value="">支付方式</option>
        {methods.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="備註" />
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
  return (
    <FormModal title="支出記錄" onClose={onClose} onSubmit={() => onSave(form)}>
      <input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="描述" required />
      <input type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} placeholder="金額" required />
      <input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} required />
      <select value={form.categoryId ?? ''} onChange={event => setForm({ ...form, categoryId: event.target.value || null })}>
        <option value="">選擇分類</option>
        {categories.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select value={form.paidBy ?? ''} onChange={event => setForm({ ...form, paidBy: event.target.value || null })}>
        <option value="">付款人</option>
        {members.map((item: Member) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select value={form.paymentMethod} onChange={event => setForm({ ...form, paymentMethod: event.target.value })}>
        <option>現金</option><option>銀行轉帳</option><option>支票</option><option>信用卡</option>
      </select>
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
  return { id: '', categoryId: null, amount: 0, date: new Date().toISOString().slice(0, 10), description: '', paidBy: null, approvedBy: null, paymentMethod: '現金', status: 'pending', createdAt: '', updatedAt: '' };
}

export default function App() {
  const { user, loading } = useAuth();
  const finance = useFinance();
  const [page, setPage] = useState<Page>('dashboard');

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
    return <DashboardPage />;
  }, [page, finance.loading, finance.error, finance.members, finance.offerings, finance.expenses, finance.dashboard]);

  if (loading) return <Empty title="正在檢查登入狀態" />;
  if (!user) return <LoginPage />;

  return (
    <div className="app-shell">
      <Shell page={page} setPage={setPage} />
      <main className="content">{content}</main>
    </div>
  );
}
