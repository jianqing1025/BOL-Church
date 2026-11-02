import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FREE_CHURCH_SIZE, PRO_PRICE_USD, platformApi } from './platform';

/**
 * First use of the multi-church app: an account, its e-mail confirmed with a
 * code, then the church — whose founder becomes its super admin.
 */

export const APP_NAME = 'Church Finance';

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="login-shell">
      <span className="login-dot dot-one" />
      <span className="login-dot dot-two" />
      <span className="login-dot dot-three" />
      <section className="login-panel onboarding-panel">
        <div className="login-form-panel">
          <div>
            <p className="eyebrow">{APP_NAME}</p>
            <h1>{title}</h1>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

export function RegisterPage({ onSignIn }: { onSignIn: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) return <VerifyEmailPage email={sentTo} onBack={() => setSentTo(null)} />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await platformApi.register(name, email, password);
      setSentTo(result.email);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '註冊失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="建立帳戶" subtitle="註冊後建立您的教會，您就是教會的超級管理員。">
      <form onSubmit={submit} className="stack">
        <label>姓名<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></label>
        <label>電子郵件<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
        <label>密碼（至少 8 個字元）<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? '寄送驗證碼…' : '註冊'}</button>
        <button type="button" className="login-forgot" onClick={onSignIn}>已有帳戶？登入</button>
      </form>
    </Panel>
  );
}

export function VerifyEmailPage({ email, onBack }: { email: string; onBack: () => void }) {
  const { applyMe } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      applyMe(await platformApi.verifyEmail(email, code));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '驗證失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="驗證 Email" subtitle={`我們已寄出 6 位數驗證碼到 ${email}，15 分鐘內有效。`}>
      <form onSubmit={submit} className="stack">
        <label>
          驗證碼
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required className="code-input" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy || code.length !== 6}>{busy ? '驗證中…' : '確認'}</button>
        <button type="button" className="login-forgot" disabled={resent}
          onClick={async () => { await platformApi.resendCode(email).catch(() => undefined); setResent(true); }}>
          {resent ? '已重新寄出' : '沒收到？重新寄送'}
        </button>
        <button type="button" className="login-forgot" onClick={onBack}>返回</button>
      </form>
    </Panel>
  );
}

export function CreateChurchPage({ firstChurch = true, onCancel }: { firstChurch?: boolean; onCancel?: () => void }) {
  const { applyMe, logout, me } = useAuth();
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const declared = Number(size);
  const overFree = Number.isFinite(declared) && declared > FREE_CHURCH_SIZE;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      applyMe(await platformApi.createChurch(name.trim(), Math.floor(declared)));
      onCancel?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '建立失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={firstChurch ? '建立您的教會' : '新增一間教會'}
      subtitle={firstChurch ? `${me?.account?.name ?? ''} 您好！建立後您就是這間教會的超級管理員，可以開始記錄奉獻、邀請同工。` : '建立後您是這間教會的超級管理員，可隨時在教會之間切換。'}
    >
      <form onSubmit={submit} className="stack">
        <label>教會名稱<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：恩典華人基督教會 Grace Chinese Church" required /></label>
        <label>
          教會人數
          <input type="number" min={1} step={1} value={size} onChange={(e) => setSize(e.target.value)} inputMode="numeric" required />
        </label>
        <p className="muted plan-note">
          {overFree
            ? `超過 ${FREE_CHURCH_SIZE} 人的教會需訂閱「教會專業版」每月 US$${PRO_PRICE_USD}。建立後可以先看看各項功能，訂閱後即可新增與修改資料。`
            : `${FREE_CHURCH_SIZE} 人（含）以內的教會，所有功能免費使用。`}
        </p>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? '建立中…' : '建立教會'}</button>
        {onCancel
          ? <button type="button" className="login-forgot" onClick={onCancel}>取消</button>
          : <button type="button" className="login-forgot" onClick={() => void logout()}>登出</button>}
      </form>
    </Panel>
  );
}
