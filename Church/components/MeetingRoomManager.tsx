import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAdmin } from '../hooks/useAdmin';
import { churchConfirm } from './ChurchDialog';
import { resizeImageToBlob } from '../imageUpload';
import { publishMeetingRooms } from '../meeting/meetingRoomsStore';
import type { MeetingRoom, MeetingRoomInput } from '../constants/meetingRooms';

type Draft = MeetingRoomInput & { id: string | null };

const blankDraft = (): Draft => ({ id: null, nameZh: '', nameEn: '', scheduleZh: '', scheduleEn: '', imageUrl: '' });
const draftOf = (room: MeetingRoom): Draft => ({
  id: room.id, nameZh: room.name.zh, nameEn: room.name.en === room.name.zh ? '' : room.name.en,
  scheduleZh: room.schedule.zh, scheduleEn: room.schedule.en === room.schedule.zh ? '' : room.schedule.en, imageUrl: room.imageUrl,
});

const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500';

/** 後台的線上團契（線上查經房間）：新增、刪除、排序，改名稱、時間與圖片。 */
const MeetingRoomManager: React.FC = () => {
  const { uploadImage } = useAdmin();
  const [rooms, setRooms] = useState<MeetingRoom[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 每次改動後伺服器都回傳完整清單；同時更新前台用的清單，切過去就看得到。
  const take = useCallback((next: MeetingRoom[]) => {
    setRooms(next);
    publishMeetingRooms(next);
  }, []);

  const run = async (action: () => Promise<{ rooms: MeetingRoom[] }>, failure: string) => {
    setBusy(true);
    setError('');
    try {
      take((await action()).rooms);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : failure);
      return false;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    api.adminMeetingRooms().then(({ rooms: list }) => setRooms(list)).catch((caught) => {
      setError(caught instanceof Error ? caught.message : '載入失敗');
    });
  }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || busy) return;
    const { id, ...payload } = draft;
    const ok = await run(() => (id ? api.updateMeetingRoom(id, payload) : api.createMeetingRoom(payload)), '儲存失敗');
    if (ok) setDraft(null);
  };

  const remove = async (room: MeetingRoom) => {
    const confirmed = await churchConfirm(`刪除房間「${room.name.zh}」？正在裡面的人不受影響，但之後就無法再進入。`, { confirmLabel: '刪除' });
    if (confirmed) await run(() => api.deleteMeetingRoom(room.id), '刪除失敗');
  };

  const move = async (index: number, delta: number) => {
    if (!rooms) return;
    const ids = rooms.map((r) => r.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    await run(() => api.reorderMeetingRooms(ids), '排序失敗');
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !draft) return;
    setBusy(true);
    setError('');
    try {
      const blob = await resizeImageToBlob(file, 1200, 800);
      const url = await uploadImage(`meeting-room.${Date.now()}`, blob, file.name);
      setDraft((current) => (current ? { ...current, imageUrl: url } : current));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '圖片上傳失敗');
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, key: keyof MeetingRoomInput, placeholder = '', required = false) => draft && (
    <label className="block text-sm font-semibold text-gray-700">{label}
      <input value={draft[key]} required={required} placeholder={placeholder} className={inputClass}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
    </label>
  );

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">線上團契</h2>
          <p className="text-sm text-gray-600">「線上查經」頁面與桌面版的房間卡片，依這裡的順序排列；桌面版每頁四間。</p>
        </div>
        {!draft && <button type="button" onClick={() => { setError(''); setDraft(blankDraft()); }} className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">新增房間</button>}
      </div>

      {draft && (
        <form onSubmit={save} className="mb-6 space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {field('房間名稱', 'nameZh', '例如：青少年團契', true)}
            {field('英文名稱（選填）', 'nameEn', 'Youth Fellowship')}
            {field('聚會時間', 'scheduleZh', '例如：每週五晚上7:30')}
            {field('英文時間（選填）', 'scheduleEn', 'Fridays at 7:30 PM')}
          </div>
          <div className="text-sm font-semibold text-gray-700">圖片
            <div className="mt-1 flex flex-wrap items-start gap-3">
              <div className="h-24 w-40 shrink-0 overflow-hidden rounded-lg bg-gray-100 ring-1 ring-gray-200">
                {draft.imageUrl && <img src={draft.imageUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">上傳圖片</button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e)} />
                <input value={draft.imageUrl} placeholder="或貼上圖片網址 https://…" className={inputClass}
                  onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} />
              </div>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">取消</button>
            <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? '儲存中…' : '儲存'}</button>
          </div>
        </form>
      )}

      {!draft && error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {rooms === null ? (
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
      ) : (
        <ol className="space-y-2">
          {rooms.map((room, index) => (
            <li key={room.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
              <span className="w-5 text-center text-sm font-semibold tabular-nums text-gray-400">{index + 1}</span>
              <div className="h-12 w-20 shrink-0 overflow-hidden rounded-md bg-gray-100">
                {room.imageUrl && <img src={room.imageUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-900">{room.name.zh}</p>
                <p className="truncate text-xs text-gray-500">{room.schedule.zh || '（未填時間）'}</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="上移" title="上移" disabled={busy || index === 0} onClick={() => void move(index, -1)}
                  className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30">↑</button>
                <button type="button" aria-label="下移" title="下移" disabled={busy || index === rooms.length - 1} onClick={() => void move(index, 1)}
                  className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30">↓</button>
                <button type="button" disabled={busy} onClick={() => { setError(''); setDraft(draftOf(room)); }} className="rounded-md px-2 py-1 text-sm text-blue-700 hover:bg-blue-50">編輯</button>
                <button type="button" disabled={busy || rooms.length <= 1} onClick={() => void remove(room)} className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-30">刪除</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default MeetingRoomManager;
