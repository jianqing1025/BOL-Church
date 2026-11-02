import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { CreateChurchPage } from './Onboarding';
import { FREE_CHURCH_SIZE, PRO_PRICE_USD, platformApi } from './platform';

/** The multi-church app's additions around the finance screens. All render nothing for BOLCCOP. */

/** In the account menu: the other churches this person serves, and a way to start another. */
export function ChurchSwitcherItems({ onDone }: { onDone: () => void }) {
  const { multiChurch, me, applyMe } = useAuth();
  const [creating, setCreating] = useState(false);
  if (!multiChurch || !me?.church) return null;
  const others = (me.churches ?? []).filter((c) => c.id !== me.church!.id);
  return (
    <>
      {others.map((church) => (
        <button key={church.id} type="button" onClick={async () => {
          onDone();
          applyMe(await platformApi.switchChurch(church.id));
          // A different church's books: start the screens over.
          window.location.assign('/');
        }}>切換到 {church.name}</button>
      ))}
      <button type="button" onClick={() => setCreating(true)}>新增教會</button>
      {/* Rendered at the top of the page: inside the account menu it would sit under the dashboard. */}
      {creating && createPortal(
        <div className="church-create-overlay" role="dialog" aria-modal="true">
          <CreateChurchPage firstChurch={false} onCancel={() => { setCreating(false); onDone(); }} />
        </div>,
        document.body,
      )}
    </>
  );
}

/** The church's name where BOLCCOP's is written into the single-church app. */
export function useChurchName(fallback: string): string {
  const { multiChurch, me } = useAuth();
  return multiChurch && me?.church ? me.church.name : fallback;
}

/** Shown over every screen while a church declared over 100 people has no subscription. */
export function ReadOnlyBanner({ onOpenPlan }: { onOpenPlan: () => void }) {
  const { multiChurch, me } = useAuth();
  const church = me?.church;
  if (!multiChurch || !church || church.plan.writable) return null;
  return (
    <div className="plan-banner" role="status">
      <span>
        教會人數 {church.declaredSize} 人，超過 {FREE_CHURCH_SIZE} 人需訂閱「教會專業版」每月 US${PRO_PRICE_USD}。
        目前可以查看與匯出資料，訂閱後即可新增與修改。
      </span>
      <button type="button" onClick={onOpenPlan}>查看方案</button>
    </div>
  );
}

/** Account page: the church itself (super admin) and leaving the app (everyone). */
export function ChurchAccountSections() {
  const { multiChurch, me, applyMe, user, logout } = useAuth();
  const church = me?.church;
  const [name, setName] = useState(church?.name ?? '');
  const [size, setSize] = useState(String(church?.declaredSize ?? ''));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setName(church?.name ?? '');
    setSize(String(church?.declaredSize ?? ''));
  }, [church?.id, church?.name, church?.declaredSize]);

  if (!multiChurch || !church) return null;
  const isSuperAdmin = user?.role === 'super_admin';

  const saveChurch = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      applyMe(await platformApi.updateChurch({ name: name.trim(), declaredSize: Math.floor(Number(size)) }));
      setMessage('已儲存');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setDeleteError(null);
    try {
      await platformApi.deleteAccount(deletePassword);
      await logout();
      window.location.assign('/');
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : '刪除失敗');
    }
  };

  return (
    <>
      <section className="panel" id="church-plan">
        <h2>教會資料與方案</h2>
        {isSuperAdmin ? (
          <form className="stack" onSubmit={saveChurch}>
            <label>教會名稱<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
            <label>教會人數<input type="number" min={1} value={size} onChange={(e) => setSize(e.target.value)} required /></label>
            <p className="muted">
              {Number(size) > FREE_CHURCH_SIZE
                ? `超過 ${FREE_CHURCH_SIZE} 人：「教會專業版」每月 US$${PRO_PRICE_USD}。${church.plan.subscribed ? '已訂閱。' : '尚未訂閱，目前只能查看與匯出資料。'}`
                : `${FREE_CHURCH_SIZE} 人（含）以內：所有功能免費。`}
            </p>
            {message && <p className="muted">{message}</p>}
            <button className="primary" disabled={saving}>{saving ? '儲存中…' : '儲存'}</button>
          </form>
        ) : (
          <p className="muted">{church.name} · {church.declaredSize} 人 · {church.plan.writable ? '可正常使用' : '需要訂閱專業版'}</p>
        )}
      </section>
      <section className="panel danger-zone">
        <h2>刪除帳戶</h2>
        <p className="muted">
          刪除後無法復原。若某間教會只有您一位使用者，該教會的所有資料與檔案會一併刪除，請先在「報表日誌」匯出備份。
          若您是某間教會唯一的超級管理員、而教會還有其他同工，請先把超級管理員交給其他同工。
        </p>
        {!confirmingDelete ? (
          <button type="button" className="danger" onClick={() => setConfirmingDelete(true)}>刪除我的帳戶…</button>
        ) : (
          <form className="stack" onSubmit={deleteAccount}>
            <label>請輸入密碼確認<input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} required autoComplete="current-password" /></label>
            {deleteError && <p className="error">{deleteError}</p>}
            <div className="row">
              <button type="button" onClick={() => setConfirmingDelete(false)}>取消</button>
              <button className="danger">永久刪除帳戶</button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
