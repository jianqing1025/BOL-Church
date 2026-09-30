import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type WeeklyInput } from '../api';
import { useAdmin } from '../hooks/useAdmin';
import RichTextEditor from './RichTextEditor';
import { churchConfirm } from './ChurchDialog';
import { formatBytes } from './WeeklyReportPage';
import { todayInChurch } from '../bulletin/announcements';
import { sundayOf } from '../bulletin/weekly';
import type { WeeklyReportSummary } from '../data';

type Draft = WeeklyInput & { id: string | null };

const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

/** 後台同工週報：每週一份（週日為週次），附件放 R2，owner 可改密碼。 */
const WeeklyReportManager: React.FC = () => {
  const { currentUser, uploadImage } = useAdmin();
  const [items, setItems] = useState<WeeklyReportSummary[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api.weeklyList()).items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '載入失敗');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openReport = async (id: string) => {
    setError('');
    const report = await api.weeklyGet(id);
    setDraft({ id: report.id, weekOf: report.weekOf, title: report.title, bodyHtml: report.bodyHtml, attachments: report.attachments });
  };

  const newThisWeek = async () => {
    const weekOf = sundayOf(todayInChurch());
    const existing = items?.find(item => item.weekOf === weekOf);
    if (existing) return openReport(existing.id);
    setError('');
    setDraft({ id: null, weekOf, title: '', bodyHtml: '', attachments: [] });
  };

  const upload = async (files: FileList | null) => {
    if (!draft || !files?.length) return;
    setUploading(true);
    setError('');
    try {
      const added = [];
      for (const file of Array.from(files)) added.push(await api.adminUploadWeekly(file));
      setDraft(current => current && { ...current, attachments: [...current.attachments, ...added] });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '上傳失敗');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const move = (index: number, delta: -1 | 1) => setDraft(current => {
    if (!current) return current;
    const list = [...current.attachments];
    const target = index + delta;
    if (target < 0 || target >= list.length) return current;
    [list[index], list[target]] = [list[target], list[index]];
    return { ...current, attachments: list };
  });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setError('');
    const payload: WeeklyInput = { weekOf: sundayOf(draft.weekOf), title: draft.title, bodyHtml: draft.bodyHtml, attachments: draft.attachments };
    try {
      if (draft.id) await api.adminUpdateWeekly(draft.id, payload);
      else await api.adminCreateWeekly(payload);
      setDraft(null);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setError(`${payload.weekOf} 這一週已經有週報，請改編輯那一份。`);
      } else {
        setError(caught instanceof Error ? caught.message : '儲存失敗');
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    if (!(await churchConfirm(`刪除 ${draft.weekOf} 的週報（含附件）？`, { confirmLabel: '刪除' }))) return;
    await api.adminDeleteWeekly(draft.id);
    setDraft(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">同工週報</h2>
            <p className="text-sm text-gray-600">每週一份，同工以密碼在 <a className="text-blue-600 underline" href="/weekly" target="_blank" rel="noopener">/weekly</a> 閱讀。</p>
          </div>
          {!draft && <button type="button" onClick={() => void newThisWeek()} className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">新增本週週報</button>}
        </div>

        {draft ? (
          <form onSubmit={save} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <label className="block text-sm font-semibold text-gray-700">週次（週日）
                <input type="date" required value={draft.weekOf} onChange={e => setDraft({ ...draft, weekOf: e.target.value ? sundayOf(e.target.value) : draft.weekOf })} className={inputClass} />
              </label>
              <label className="block text-sm font-semibold text-gray-700">標題
                <input required value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className={inputClass} maxLength={200} />
              </label>
            </div>
            <div className="text-sm font-semibold text-gray-700">內容
              <div className="mt-1">
                <RichTextEditor value={draft.bodyHtml} onChange={bodyHtml => setDraft({ ...draft, bodyHtml })} minHeightClassName="min-h-[260px]"
                  onImageUpload={(file, fileName) => uploadImage(`rich-text/weekly.${Date.now()}`, file, fileName)} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">附件（PDF、Word、圖片，每檔 20 MB 內）</span>
                <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60">
                  {uploading ? '上傳中…' : '上傳附件'}
                </button>
                <input ref={fileRef} type="file" multiple hidden accept=".pdf,.doc,.docx,image/*" onChange={e => void upload(e.target.files)} />
              </div>
              {draft.attachments.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {draft.attachments.map((file, index) => (
                    <li key={file.key} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="shrink-0 text-xs text-gray-500">{formatBytes(file.size)}</span>
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded px-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label="上移">↑</button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === draft.attachments.length - 1} className="rounded px-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label="下移">↓</button>
                      <button type="button" onClick={() => setDraft({ ...draft, attachments: draft.attachments.filter(item => item.key !== file.key) })} className="rounded px-1.5 text-red-600 hover:bg-red-50" aria-label="移除">✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-between gap-2">
              <div>{draft.id && <button type="button" onClick={() => void remove()} className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">刪除這份週報</button>}</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDraft(null)} className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">取消</button>
                <button type="submit" disabled={saving || uploading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? '儲存中…' : '儲存'}</button>
              </div>
            </div>
          </form>
        ) : (
          <>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            {items === null ? (
              <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
            ) : items.length === 0 ? (
              <p className="text-sm text-gray-500">還沒有週報。</p>
            ) : (
              <ul className="space-y-2">
                {items.map(item => (
                  <li key={item.id}>
                    <button type="button" onClick={() => void openReport(item.id)} className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-left hover:border-blue-200 hover:bg-blue-50">
                      <span className="shrink-0 text-sm font-semibold text-gray-700 tabular-nums">{item.weekOf}</span>
                      <span className="min-w-0 truncate text-gray-900">{item.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {currentUser?.role === 'owner' && <WeeklyPasswordCard />}
    </div>
  );
};

/** 只有擁有者能改週報密碼；改了之後所有已解鎖的裝置都要重新輸入。 */
const WeeklyPasswordCard: React.FC = () => {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (first.trim().length < 4) return setMessage({ ok: false, text: '密碼至少 4 個字' });
    if (first !== second) return setMessage({ ok: false, text: '兩次輸入的密碼不一樣' });
    try {
      await api.adminSetWeeklyPassword(first.trim());
      setFirst('');
      setSecond('');
      setMessage({ ok: true, text: '已更新；所有裝置需要用新密碼重新進入。' });
    } catch (caught) {
      setMessage({ ok: false, text: caught instanceof Error ? caught.message : '更新失敗' });
    }
  };

  return (
    <form onSubmit={submit} className="rounded-lg bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-gray-900">週報密碼</h3>
      <p className="text-sm text-gray-600">同工進入 /weekly 時要輸入的密碼。</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input type="password" autoComplete="new-password" placeholder="新密碼" value={first} onChange={e => setFirst(e.target.value)} className={inputClass} />
        <input type="password" autoComplete="new-password" placeholder="再輸入一次" value={second} onChange={e => setSecond(e.target.value)} className={inputClass} />
      </div>
      {message && <p className={`mt-2 text-sm ${message.ok ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>}
      <button type="submit" className="mt-3 rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900">更新密碼</button>
    </form>
  );
};

export default WeeklyReportManager;
