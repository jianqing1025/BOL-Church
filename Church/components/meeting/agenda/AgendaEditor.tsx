import React, { useCallback, useEffect, useState } from 'react';
import { BookmarkPlus, Copy, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import { useLocalization } from '../../../hooks/useLocalization';
import { churchConfirm } from '../../ChurchDialog';
import type { AgendaStore } from '../../../meeting/agenda/agendaStore';
import { duplicateAgenda, newAgenda, saveAsTemplate } from '../../../meeting/agenda/agendaModel';
import type { Agenda } from '../../../meeting/agenda/types';
import { AgendaItemList } from './AgendaItemList';
import { NewAgendaMenu } from './NewAgendaMenu';
import { storeErrorKey, useAgendaSaver } from './useAgendaSaver';

const formatBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`);

/**
 * 聚會內容 — prepared ahead, on this computer only. Left: every saved agenda,
 * latest meeting first. Right: the chosen one, edited in place; every change
 * is saved as it is made (text after a short pause).
 */
export const AgendaEditor: React.FC<{ store: AgendaStore; onClose: () => void }> = ({ store, onClose }) => {
  const { t } = useLocalization();
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The agenda whose ⋯ menu is open. */
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [usage, setUsage] = useState<number | null>(null);
  const [savedIn, setSavedIn] = useState<string | null>(null);
  const saver = useAgendaSaver(store, (e) => setMessage(t(storeErrorKey(e))));

  // A host's own templates are kept with the agendas but listed under 新增.
  const listed = agendas.filter((a) => !a.template);
  const myTemplates = agendas.filter((a) => a.template);
  const selected = listed.find((a) => a.id === selectedId) ?? null;

  // Menus close on the next press anywhere else.
  useEffect(() => {
    if (!rowMenu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('[data-agenda-menu]')) setRowMenu(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [rowMenu]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const refreshUsage = useCallback(() => {
    if (store.describe) {
      void store.describe().then((d) => { setUsage(d.bytes ?? null); setSavedIn(d.dir ?? null); }).catch(() => undefined);
      return;
    }
    void navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null)).catch(() => undefined);
  }, [store]);

  useEffect(() => {
    void store.list().then((list) => { setAgendas(list); setSelectedId(list.find((a) => !a.template)?.id ?? null); });
    refreshUsage();
  }, [store, refreshUsage]);

  const replace = (next: Agenda) => setAgendas((list) => list.map((a) => (a.id === next.id ? next : a)));
  const update = (next: Agenda) => { replace(next); saver.queue(next); };

  const addAgenda = async () => {
    await saver.flush();
    try {
      const created = await store.save(newAgenda(new Date(), t('meeting.agendaUntitled')));
      setAgendas((list) => [created, ...list]);
      setSelectedId(created.id);
    } catch (e) { setMessage(t(storeErrorKey(e))); }
  };

  /** The newest copy of an agenda, including any edit still waiting to be written. */
  const current = (target: Agenda) => agendas.find((a) => a.id === target.id) ?? target;

  const duplicate = async (target: Agenda) => {
    setRowMenu(null);
    await saver.flush();
    try {
      const copy = await store.save(duplicateAgenda(current(target), new Date(), t('meeting.agendaCopySuffix')));
      setAgendas((list) => [copy, ...list]);
      setSelectedId(copy.id);
    } catch (e) { setMessage(t(storeErrorKey(e))); }
  };

  const removeAgenda = async (target: Agenda, confirmKey = 'meeting.agendaDeleteConfirm') => {
    setRowMenu(null);
    const ok = await churchConfirm(t(confirmKey), {
      confirmLabel: t('meeting.agendaDelete'), cancelLabel: t('meeting.cancel'),
    });
    if (!ok) return;
    if (target.id === selectedId) saver.discard();
    await store.remove(target.id);
    const rest = agendas.filter((a) => a.id !== target.id);
    setAgendas(rest);
    if (target.id === selectedId) setSelectedId(rest.find((a) => !a.template)?.id ?? null);
    refreshUsage();
  };

  /** 保存為範本: a copy kept as the host's own template, offered under 新增. */
  const saveTemplate = async (target: Agenda) => {
    setRowMenu(null);
    await saver.flush();
    try {
      const tpl = await store.save(saveAsTemplate(current(target), new Date()));
      setAgendas((list) => [...list, tpl]);
      setNotice(t('meeting.agendaTemplateSaved').replace('{name}', tpl.title));
    } catch (e) { setMessage(t(storeErrorKey(e))); }
  };

  const finish = async () => {
    await saver.flush();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="flex h-full max-h-[860px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-5">
          <h2 className="text-base font-bold text-gray-900">{t('meeting.agendaTitle')}</h2>
          <button type="button" onClick={() => void finish()} aria-label={t('meeting.close')} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={20} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-56 shrink-0 flex-col border-r border-gray-100 bg-gray-50/80">
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {listed.map((a) => (
                <div key={a.id} className="group relative" data-agenda-menu={rowMenu === a.id ? '' : undefined}>
                  <button type="button" onClick={() => { void saver.flush(); setSelectedId(a.id); setMessage(''); }}
                    className={`w-full rounded-lg py-2 pl-3 pr-9 text-left ${a.id === selectedId ? 'bg-white font-semibold shadow-sm ring-1 ring-gray-200' : 'hover:bg-white/70'}`}>
                    <span className="block truncate text-sm text-gray-900">{a.title}</span>
                    <span className="block truncate text-xs text-gray-400">{a.date}{a.note ? ` · ${a.note}` : ''}</span>
                  </button>
                  <button type="button" aria-label={t('meeting.agendaMore')} aria-haspopup="menu" aria-expanded={rowMenu === a.id} data-agenda-menu=""
                    onClick={() => setRowMenu(rowMenu === a.id ? null : a.id)}
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 ${rowMenu === a.id || a.id === selectedId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}>
                    <MoreHorizontal size={16} />
                  </button>
                  {rowMenu === a.id && (
                    <div role="menu" data-agenda-menu="" className="absolute right-1 top-full z-10 mt-0.5 w-36 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                      <button type="button" role="menuitem" onClick={() => void duplicate(a)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"><Copy size={14} className="text-gray-400" />{t('meeting.agendaDuplicate')}</button>
                      <button type="button" role="menuitem" onClick={() => void saveTemplate(a)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"><BookmarkPlus size={14} className="text-blue-500" />{t('meeting.agendaSaveTemplate')}</button>
                      <button type="button" role="menuitem" onClick={() => void removeAgenda(a)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"><Trash2 size={14} />{t('meeting.agendaDelete')}</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {notice && <p className="mx-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700" role="status">{notice}</p>}
            <NewAgendaMenu className="m-2" store={store} templates={myTemplates} onBefore={saver.flush}
              onCreated={(created) => { setAgendas((list) => [created, ...list]); setSelectedId(created.id); refreshUsage(); }}
              onDeleteTemplate={(tpl) => void removeAgenda(tpl, 'meeting.agendaTemplateDeleteConfirm')}
              onError={(key) => setMessage(t(key))} />
          </aside>

          <main className="flex min-w-0 flex-1 flex-col">
            {selected ? (
              <>
                <div className="shrink-0 space-y-2 border-b border-gray-100 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <input value={selected.title} onChange={(e) => update({ ...selected, title: e.target.value })}
                      className="min-w-0 flex-1 rounded-md px-1 text-lg font-bold text-gray-900 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input type="date" value={selected.date} onChange={(e) => update({ ...selected, date: e.target.value })}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-700" />
                    <input value={selected.note} placeholder={t('meeting.agendaNotePlaceholder')} onChange={(e) => update({ ...selected, note: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-700" />
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <AgendaItemList key={selected.id} agenda={selected} store={store} saver={saver} onChange={replace}
                    message={message} onMessage={setMessage} onUsageChange={refreshUsage} />
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <button type="button" onClick={() => void addAgenda()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">
                  <Plus size={16} />{t('meeting.agendaTemplateBlank')}
                </button>
              </div>
            )}
            <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-gray-100 px-5 py-3">
              <span className="text-xs text-gray-400">
                {savedIn ? t('meeting.agendaSavedIn').replace('{dir}', savedIn) : t('meeting.agendaLocalOnly')}{usage !== null ? ` · ${t('meeting.agendaUsage').replace('{size}', formatBytes(usage))}` : ''}
              </span>
              <button type="button" onClick={() => void finish()}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                {t('meeting.agendaDone')}
              </button>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
};
