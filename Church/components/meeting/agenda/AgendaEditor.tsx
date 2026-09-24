import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Copy, FileVideo, GripVertical, Image as ImageIcon, Pencil, Plus, Trash2, Type, X, Youtube } from 'lucide-react';
import { useLocalization } from '../../../hooks/useLocalization';
import { churchConfirm } from '../../ChurchDialog';
import { AgendaStoreError, type AgendaStore } from '../../../meeting/agenda/agendaStore';
import { duplicateAgenda, itemLabel, moveItem, newAgenda, newId } from '../../../meeting/agenda/agendaModel';
import { MAX_VIDEO_BYTES, type Agenda, type AgendaItem, type AgendaItemKind } from '../../../meeting/agenda/types';
import { ImageDecodeError, prepareImage } from '../../../meeting/agenda/imageFile';
import { AgendaItemEditor, youTubeFromLink } from './AgendaItemEditor';

export const KIND_ICON: Record<AgendaItemKind, React.ReactNode> = {
  text: <Type size={16} />,
  image: <ImageIcon size={16} />,
  scripture: <BookOpen size={16} />,
  youtube: <Youtube size={16} />,
  localVideo: <FileVideo size={16} />,
};

export function useItemFallbacks() {
  const { t } = useLocalization();
  return { text: t('meeting.agendaAddText'), image: t('meeting.agendaAddImage'), youtube: 'YouTube', localVideo: t('meeting.agendaVideoLocal') };
}

const formatBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`);

/**
 * 聚會內容 — prepared ahead, on this computer only. Left: every saved agenda,
 * latest meeting first. Right: the chosen one, edited in place; every change
 * is saved as it is made (text after a short pause).
 */
export const AgendaEditor: React.FC<{ store: AgendaStore; onClose: () => void }> = ({ store, onClose }) => {
  const { language, t } = useLocalization();
  const fallbacks = useItemFallbacks();
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [usage, setUsage] = useState<number | null>(null);
  const [videoTab, setVideoTab] = useState<'youtube' | 'local' | null>(null);
  const [link, setLink] = useState('');
  const dragFrom = useRef<number | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  /** The latest unsaved edit, written at once when the editor closes. */
  const pending = useRef<Agenda | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const selected = agendas.find((a) => a.id === selectedId) ?? null;

  const refreshUsage = useCallback(() => {
    void navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null)).catch(() => undefined);
  }, []);

  useEffect(() => {
    void store.list().then((list) => { setAgendas(list); setSelectedId(list[0]?.id ?? null); });
    refreshUsage();
  }, [store, refreshUsage]);

  const fail = (error: unknown) => {
    setMessage(t(error instanceof AgendaStoreError && error.reason === 'quota' ? 'meeting.agendaStorageFull' : 'meeting.agendaSaveFailed'));
  };
  const replace = (saved: Agenda) => setAgendas((list) => list.map((a) => (a.id === saved.id ? saved : a)));

  const flush = () => {
    window.clearTimeout(saveTimer.current);
    const next = pending.current;
    pending.current = null;
    return next ? store.save(next).catch(fail) : Promise.resolve();
  };

  /** Updates the screen at once; writes after 400ms of quiet so typing is not a write per key. */
  const update = (next: Agenda) => {
    replace(next);
    pending.current = next;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flush(); }, 400);
  };
  // Closing mid-typing must not lose the last few keystrokes.
  useEffect(() => () => { void flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addAgenda = async () => {
    await flush();
    try {
      const created = await store.save(newAgenda(new Date(), t('meeting.agendaUntitled')));
      setAgendas((list) => [created, ...list]);
      setSelectedId(created.id);
    } catch (e) { fail(e); }
  };

  const duplicate = async () => {
    if (!selected) return;
    await flush();
    try {
      const copy = await store.save(duplicateAgenda(selected, new Date(), t('meeting.agendaCopySuffix')));
      setAgendas((list) => [copy, ...list]);
      setSelectedId(copy.id);
    } catch (e) { fail(e); }
  };

  const removeAgenda = async () => {
    if (!selected) return;
    const ok = await churchConfirm(t('meeting.agendaDeleteConfirm'), {
      confirmLabel: t('meeting.agendaDelete'), cancelLabel: t('meeting.cancel'),
    });
    if (!ok) return;
    window.clearTimeout(saveTimer.current);
    pending.current = null;
    await store.remove(selected.id);
    const rest = agendas.filter((a) => a.id !== selected.id);
    setAgendas(rest);
    setSelectedId(rest[0]?.id ?? null);
    refreshUsage();
  };

  const addItem = (item: AgendaItem) => {
    if (!selected) return;
    update({ ...selected, items: [...selected.items, item] });
    setOpenItemId(item.id);
  };

  const removeItem = async (itemId: string) => {
    if (!selected) return;
    window.clearTimeout(saveTimer.current);
    pending.current = null;
    try { replace(await store.removeItem(selected, itemId)); refreshUsage(); } catch (e) { fail(e); }
  };

  const addFile = async (file: File, kind: 'image' | 'localVideo') => {
    if (!selected) return;
    setMessage('');
    try {
      if (kind === 'localVideo' && file.size > MAX_VIDEO_BYTES) { setMessage(t('meeting.agendaVideoTooBig')); return; }
      const blob = kind === 'image' ? await prepareImage(file) : file;
      const title = file.name.replace(/\.[^.]+$/, '');
      window.clearTimeout(saveTimer.current);
      pending.current = null;
      const saved = await store.addFileItem(selected, blob, (fileId) => (kind === 'image'
        ? { id: newId(), kind: 'image', title, fileId }
        : { id: newId(), kind: 'localVideo', title, fileId, fileName: file.name, size: file.size }));
      replace(saved);
      refreshUsage();
    } catch (e) {
      if (e instanceof ImageDecodeError) setMessage(t('meeting.agendaImageInvalid'));
      else fail(e);
    }
  };

  const addYouTube = () => {
    const parsed = youTubeFromLink(link);
    if (!parsed) { setMessage(t('meeting.agendaYouTubeInvalid')); return; }
    addItem({ id: newId(), kind: 'youtube', title: 'YouTube', ...parsed });
    setLink('');
    setVideoTab(null);
    setMessage('');
  };

  const addButton = 'flex items-center gap-1.5 rounded-lg border border-dashed border-blue-300 bg-blue-50/60 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="flex h-full max-h-[860px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-5">
          <h2 className="text-base font-bold text-gray-900">{t('meeting.agendaTitle')}</h2>
          <button type="button" onClick={onClose} aria-label={t('meeting.close')} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={20} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-56 shrink-0 flex-col border-r border-gray-100 bg-gray-50/80">
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {agendas.map((a) => (
                <button key={a.id} type="button" onClick={() => { void flush(); setSelectedId(a.id); setOpenItemId(null); }}
                  className={`w-full rounded-lg px-3 py-2 text-left ${a.id === selectedId ? 'bg-white font-semibold shadow-sm ring-1 ring-gray-200' : 'hover:bg-white/70'}`}>
                  <span className="block truncate text-sm text-gray-900">{a.title}</span>
                  <span className="block truncate text-xs text-gray-400">{a.date}{a.note ? ` · ${a.note}` : ''}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void addAgenda()} className="m-2 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
              <Plus size={16} />{t('meeting.agendaNew')}
            </button>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            {selected ? (
              <>
                <div className="shrink-0 space-y-2 border-b border-gray-100 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <input value={selected.title} onChange={(e) => update({ ...selected, title: e.target.value })}
                      className="min-w-0 flex-1 rounded-md px-1 text-lg font-bold text-gray-900 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none" />
                    <button type="button" onClick={() => void duplicate()} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"><Copy size={14} />{t('meeting.agendaDuplicate')}</button>
                    <button type="button" onClick={() => void removeAgenda()} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} />{t('meeting.agendaDelete')}</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input type="date" value={selected.date} onChange={(e) => update({ ...selected, date: e.target.value })}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-700" />
                    <input value={selected.note} placeholder={t('meeting.agendaNotePlaceholder')} onChange={(e) => update({ ...selected, note: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-700" />
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
                  {selected.items.length === 0 && <p className="py-6 text-center text-sm text-gray-400">{t('meeting.agendaEmpty')}</p>}
                  {selected.items.map((item, index) => {
                    const open = item.id === openItemId;
                    return (
                      <div key={item.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragFrom.current === null || dragFrom.current === index) return;
                          update({ ...selected, items: moveItem(selected.items, dragFrom.current, index) });
                          dragFrom.current = null;
                        }}
                        className={`rounded-xl border px-3 py-2.5 ${open ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
                        <div className="flex items-center gap-2">
                          <span draggable onDragStart={() => { dragFrom.current = index; }} title={t('meeting.agendaMove')}
                            className="cursor-grab text-gray-300 hover:text-gray-500"><GripVertical size={16} /></span>
                          <span className="text-gray-500">{KIND_ICON[item.kind]}</span>
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{itemLabel(item, language, fallbacks)}</span>
                          <button type="button" onClick={() => setOpenItemId(open ? null : item.id)}
                            aria-label={open ? t('meeting.agendaDone') : t('meeting.agendaEdit')}
                            className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">
                            {open ? t('meeting.agendaDone') : <Pencil size={14} />}
                          </button>
                          <button type="button" onClick={() => void removeItem(item.id)} aria-label={t('meeting.agendaRemoveItem')}
                            className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                        </div>
                        {open && (
                          <div className="mt-3 pl-8">
                            <AgendaItemEditor item={item}
                              onChange={(next) => update({ ...selected, items: selected.items.map((i) => (i.id === next.id ? next : i)) })} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {videoTab && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="mb-2 flex gap-1">
                        {(['youtube', 'local'] as const).map((tab) => (
                          <button key={tab} type="button" onClick={() => setVideoTab(tab)}
                            className={`rounded-md px-3 py-1 text-sm ${videoTab === tab ? 'bg-white font-semibold shadow-sm' : 'text-gray-500'}`}>
                            {t(tab === 'youtube' ? 'meeting.agendaVideoYouTube' : 'meeting.agendaVideoLocal')}
                          </button>
                        ))}
                      </div>
                      {videoTab === 'youtube' ? (
                        <div className="flex gap-2">
                          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('meeting.agendaYouTubeLink')}
                            onKeyDown={(e) => { if (e.key === 'Enter') addYouTube(); }}
                            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                          <button type="button" onClick={addYouTube} className="rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">{t('meeting.agendaDone')}</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => videoInput.current?.click()} className={addButton}>
                          <FileVideo size={16} />{t('meeting.agendaVideoLocal')}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" className={addButton} onClick={() => addItem({ id: newId(), kind: 'text', title: '', body: '' })}><Type size={16} />{t('meeting.agendaAddText')}</button>
                    <button type="button" className={addButton} onClick={() => imageInput.current?.click()}><ImageIcon size={16} />{t('meeting.agendaAddImage')}</button>
                    <button type="button" className={addButton} onClick={() => addItem({ id: newId(), kind: 'scripture', bookId: 43, chapter: 3, fromVerse: 16, toVerse: 16 })}><BookOpen size={16} />{t('meeting.agendaAddScripture')}</button>
                    <button type="button" className={addButton} onClick={() => setVideoTab(videoTab ? null : 'youtube')}><Youtube size={16} />{t('meeting.agendaAddVideo')}</button>
                  </div>
                  {message && <p className="text-sm font-medium text-red-600" role="alert">{message}</p>}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <button type="button" onClick={() => void addAgenda()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">
                  <Plus size={16} />{t('meeting.agendaNew')}
                </button>
              </div>
            )}
            <footer className="shrink-0 border-t border-gray-100 px-5 py-2 text-xs text-gray-400">
              {t('meeting.agendaLocalOnly')}{usage !== null ? ` · ${t('meeting.agendaUsage').replace('{size}', formatBytes(usage))}` : ''}
            </footer>
          </main>
        </div>
      </div>
      <input ref={imageInput} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addFile(f, 'image'); }} />
      <input ref={videoInput} type="file" accept="video/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setVideoTab(null); void addFile(f, 'localVideo'); } }} />
    </div>
  );
};
