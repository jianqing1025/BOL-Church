import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { useFinance } from './context/FinanceContext';
import { LoginAnimation } from './components/LoginAnimation';
import type { Expense, ExpenseCategory, ExpenseStatus, Member, MemberGroup, MemberStatus, Offering, OfferingCategory, OfferingMethod } from './types';
import { currency, shortDate } from './utils/format';

type Page = 'dashboard' | 'members' | 'offerings' | 'expenses' | 'reports';

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
    ['reports', '報表']
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

function MembersPage() {
  const { members, lookups, saveMember, deleteMember, saveOffering } = useFinance();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);
  const [offeringMember, setOfferingMember] = useState<Offering | null>(null);
  const filtered = members.filter(item => `${item.name} ${item.email} ${item.phone}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <section className="page">
      <PageTitle title="成員管理" subtitle="搜尋、分組、狀態與奉獻概覽" />
      <Toolbar>
        <input placeholder="搜尋姓名、電話或郵件" value={query} onChange={event => setQuery(event.target.value)} />
        <button className="primary" onClick={() => setEditing(blankMember())}>新增成員</button>
      </Toolbar>
      {editing && (
        <MemberForm
          member={editing}
          groups={lookups?.memberGroups ?? []}
          onClose={() => setEditing(null)}
          onSave={async payload => {
            await saveMember(payload, editing.id || undefined);
            setEditing(null);
          }}
        />
      )}
      {offeringMember && (
        <OfferingForm
          offering={offeringMember}
          members={members}
          categories={lookups?.offeringCategories ?? []}
          methods={lookups?.offeringMethods ?? []}
          onClose={() => setOfferingMember(null)}
          onSave={async payload => {
            await saveOffering(payload);
            setOfferingMember(null);
          }}
        />
      )}
      <table>
        <thead>
          <tr><th>姓名</th><th>分組</th><th>狀態</th><th>聯絡方式</th><th>累計奉獻</th><th></th></tr>
        </thead>
        <tbody>
          {filtered.map(member => (
            <tr key={member.id}>
              <td><strong>{member.name}</strong><small>{shortDate(member.joinDate)}</small></td>
              <td>{member.groupName || '-'}</td>
              <td><Badge>{statusLabels[member.status]}</Badge></td>
              <td>
                <small>{member.email || '-'}</small>
                <small>{member.phone || member.homePhone || '-'}</small>
                {(member.city || member.stateRegion) && <small>{[member.city, member.stateRegion].filter(Boolean).join(', ')}</small>}
              </td>
              <td>{currency(member.totalOffering)}</td>
              <td className="actions">
                <button onClick={() => setEditing(member)}>編輯</button>
                <button onClick={() => deleteMember(member.id)}>刪除</button>
                <button className="primary" onClick={() => setOfferingMember(blankOffering(member.id))}>新增奉獻</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function OfferingsPage() {
  const { members, offerings, lookups, saveOffering, deleteOffering } = useFinance();
  const [editing, setEditing] = useState<Offering | null>(null);
  const total = offerings.reduce((sum, item) => sum + item.amount, 0);

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
      <table>
        <thead>
          <tr><th>日期</th><th>成員</th><th>分類</th><th>方式</th><th>金額</th><th>備註</th><th></th></tr>
        </thead>
        <tbody>
          {offerings.map(item => (
            <tr key={item.id}>
              <td>{shortDate(item.date)}</td>
              <td>{item.memberName || '匿名'}</td>
              <td>{item.categoryName || '-'}</td>
              <td>{item.methodName || '-'}</td>
              <td>{currency(item.amount)}</td>
              <td>{item.notes}</td>
              <td className="actions"><button onClick={() => setEditing(item)}>編輯</button><button onClick={() => deleteOffering(item.id)}>刪除</button></td>
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
                <button onClick={() => deleteExpense(item.id)}>刪除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ReportsPage() {
  const { dashboard, lookups, expenses } = useFinance();
  const budgetTotal = (lookups?.expenseCategories ?? []).reduce((sum, item) => sum + item.budgetMonthly, 0);
  const approvedTotal = expenses.filter(item => item.status === 'approved').reduce((sum, item) => sum + item.amount, 0);

  return (
    <section className="page">
      <PageTitle title="報表" subtitle="月度收支、預算與現金流摘要" />
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
  groups,
  onClose,
  onSave
}: {
  member: Member;
  groups: MemberGroup[];
  onClose: () => void;
  onSave: (payload: Partial<Member>) => Promise<void>;
}) {
  const [form, setForm] = useState(member);
  return (
    <FormModal title="成員資料" onClose={onClose} onSubmit={() => onSave(form)}>
      <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="姓名" required />
      <input value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="Email" />
      <input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="電話" />
      <input value={form.homePhone ?? ''} onChange={event => setForm({ ...form, homePhone: event.target.value })} placeholder="住家電話" />
      <input value={form.firstName ?? ''} onChange={event => setForm({ ...form, firstName: event.target.value })} placeholder="First name" />
      <input value={form.lastName ?? ''} onChange={event => setForm({ ...form, lastName: event.target.value })} placeholder="Last name" />
      <input value={form.partner ?? ''} onChange={event => setForm({ ...form, partner: event.target.value })} placeholder="Partner" />
      <select value={form.groupId ?? ''} onChange={event => setForm({ ...form, groupId: event.target.value || null })}>
        <option value="">未分組</option>
        {groups.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as MemberStatus })}>
        <option value="active">活躍</option><option value="inactive">非活躍</option><option value="visitor">訪客</option>
      </select>
      <input type="date" value={form.joinDate} onChange={event => setForm({ ...form, joinDate: event.target.value })} />
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
  return (
    <FormModal title="奉獻記錄" onClose={onClose} onSubmit={() => onSave(form)}>
      <input type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} placeholder="金額" required />
      <input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} required />
      <select value={form.memberId ?? ''} onChange={event => setForm({ ...form, memberId: event.target.value || null })}>
        <option value="">匿名奉獻</option>
        {members.map((item: Member) => <option key={item.id} value={item.id}>{item.name}</option>)}
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

function FormModal({ title, children, onClose, onSubmit }: { title: string; children: React.ReactNode; onClose: () => void; onSubmit: () => void }) {
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={event => { event.preventDefault(); onSubmit(); }}>
        <header><h2>{title}</h2><button type="button" onClick={onClose}>關閉</button></header>
        <div className="form-grid">{children}</div>
        <footer><button type="button" onClick={onClose}>取消</button><button className="primary">保存</button></footer>
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
    contactConfirmed: false,
    externalContact: false,
    totalOffering: 0,
    createdAt: '',
    updatedAt: ''
  };
}

function blankOffering(memberId: string | null = null): Offering {
  return { id: '', memberId, amount: 0, date: new Date().toISOString().slice(0, 10), categoryId: null, methodId: null, notes: '', createdAt: '', updatedAt: '' };
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
