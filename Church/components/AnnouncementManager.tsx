import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type AnnouncementInput } from '../api';
import { useAdmin } from '../hooks/useAdmin';
import { useLocalization } from '../hooks/useLocalization';
import RichTextEditor from './RichTextEditor';
import { churchConfirm } from './ChurchDialog';
import { announcementDateLabel } from './AnnouncementCard';
import { defaultShowUntil, todayInChurch, type Announcement } from '../bulletin/announcements';

type Draft = AnnouncementInput & { id: string | null };

const blankDraft = (): Draft => ({ id: null, title: '', bodyHtml: '', eventDate: null, showUntil: defaultShowUntil(null, todayInChurch()) });

const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

/** 後台公告欄：顯示中／已過期、新增、編輯、複製、刪除。 */
const AnnouncementManager: React.FC = () => {
  const { language } = useLocalization();
  const { refreshBootstrap, uploadImage } = useAdmin();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // 使用者改過「顯示到」就不再跟著活動日期自動帶
  const [showUntilTouched, setShowUntilTouched] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api.adminAnnouncements()).items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '載入失敗');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const today = todayInChurch();
  const [active, expired] = useMemo(() => {
    const list = items ?? [];
    return [list.filter(item => item.showUntil >= today), list.filter(item => item.showUntil < today)];
  }, [items, today]);

  const edit = (next: Draft, touched: boolean) => { setError(''); setDraft(next); setShowUntilTouched(touched); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setError('');
    try {
      const payload: AnnouncementInput = { title: draft.title, bodyHtml: draft.bodyHtml, eventDate: draft.eventDate || null, showUntil: draft.showUntil };
      if (draft.id) await api.updateAnnouncement(draft.id, payload);
      else await api.createAnnouncement(payload);
      setDraft(null);
      await load();
      await refreshBootstrap().catch(() => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: Announcement) => {
    if (!(await churchConfirm(`刪除公告「${item.title}」？`, { confirmLabel: '刪除' }))) return;
    await api.deleteAnnouncement(item.id);
    await load();
    await refreshBootstrap().catch(() => undefined);
  };

  const row = (item: Announcement, isExpired: boolean) => (
    <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
      <span className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${isExpired ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700'}`}>{announcementDateLabel(item, language)}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">{item.title}</span>
      <span className="text-xs text-gray-500">顯示到 {item.showUntil}</span>
      <div className="flex gap-1">
        {!isExpired && <button type="button" onClick={() => edit({ id: item.id, title: item.title, bodyHtml: item.bodyHtml, eventDate: item.eventDate, showUntil: item.showUntil }, true)} className="rounded-md px-2 py-1 text-sm text-blue-700 hover:bg-blue-50">編輯</button>}
        <button type="button" onClick={() => edit({ ...blankDraft(), title: item.title, bodyHtml: item.bodyHtml }, false)} className="rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-gray-100">複製</button>
        <button type="button" onClick={() => void remove(item)} className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50">刪除</button>
      </div>
    </li>
  );

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">公告欄</h2>
          <p className="text-sm text-gray-600">首頁 Hero 右側的小卡與「公告欄」頁面；到了「顯示到」的隔天自動下架。</p>
        </div>
        {!draft && <button type="button" onClick={() => edit(blankDraft(), false)} className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">新增公告</button>}
      </div>

      {draft && (
        <form onSubmit={save} className="mb-6 space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <label className="block text-sm font-semibold text-gray-700">標題
            <input required value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className={inputClass} maxLength={200} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-gray-700">活動日期（選填）
              <input type="date" value={draft.eventDate ?? ''} className={inputClass}
                onChange={e => {
                  const eventDate = e.target.value || null;
                  setDraft({ ...draft, eventDate, showUntil: showUntilTouched ? draft.showUntil : defaultShowUntil(eventDate, today) });
                }} />
            </label>
            <label className="block text-sm font-semibold text-gray-700">顯示到
              <input type="date" required value={draft.showUntil} className={inputClass}
                onChange={e => { setShowUntilTouched(true); setDraft({ ...draft, showUntil: e.target.value }); }} />
            </label>
          </div>
          <div className="text-sm font-semibold text-gray-700">內容
            <div className="mt-1">
              <RichTextEditor value={draft.bodyHtml} onChange={bodyHtml => setDraft({ ...draft, bodyHtml })}
                onImageUpload={(file, fileName) => uploadImage(`rich-text/announcement.${Date.now()}`, file, fileName)} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">取消</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? '儲存中…' : '儲存'}</button>
          </div>
        </form>
      )}

      {!draft && error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {items === null ? (
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">顯示中（{active.length}）</h3>
            {active.length ? <ul className="space-y-2">{active.map(item => row(item, false))}</ul> : <p className="text-sm text-gray-500">目前沒有顯示中的公告。</p>}
          </section>
          {expired.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-500">已過期（{expired.length}）</h3>
              <ul className="space-y-2">{expired.map(item => row(item, true))}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default AnnouncementManager;
