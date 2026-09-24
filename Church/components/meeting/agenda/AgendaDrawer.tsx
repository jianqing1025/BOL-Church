import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Play, Square } from 'lucide-react';
import { useLocalization } from '../../../hooks/useLocalization';
import type { AgendaStore } from '../../../meeting/agenda/agendaStore';
import { itemLabel, localDateString, nearestAgenda, slideFooter } from '../../../meeting/agenda/agendaModel';
import type { Agenda, AgendaItem } from '../../../meeting/agenda/types';
import type { AgendaPresenter } from '../../../hooks/useAgendaPresenter';
import { AgendaItemList, KIND_ICON, useItemFallbacks } from './AgendaItemList';
import { NewAgendaMenu } from './NewAgendaMenu';
import { storeErrorKey, useAgendaSaver } from './useAgendaSaver';

/**
 * The host's list during the meeting: pick an agenda and share its items one
 * at a time — or switch to editing and add, change or remove items without
 * leaving the room. Editing the slide that is on screen updates it for everyone.
 */
export const AgendaDrawer: React.FC<{ store: AgendaStore; presenter: AgendaPresenter }> = ({ store, presenter }) => {
  const { language, t } = useLocalization();
  const fallbacks = useItemFallbacks();
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  /** The host's own templates, offered under 新增. */
  const [templates, setTemplates] = useState<Agenda[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const saver = useAgendaSaver(store, (e) => setMessage(t(storeErrorKey(e))));

  useEffect(() => {
    void store.list().then((list) => {
      // Templates are for starting new agendas, not for presenting.
      const agendasOnly = list.filter((a) => !a.template);
      setAgendas(agendasOnly);
      setTemplates(list.filter((a) => a.template));
      setSelectedId(nearestAgenda(agendasOnly, localDateString(new Date()))?.id ?? null);
    });
  }, [store]);

  const agenda = agendas.find((a) => a.id === selectedId) ?? null;
  const items: AgendaItem[] = agenda?.items ?? [];
  const footer = slideFooter(agenda, t('header.logo'), language);
  const activeIndex = items.findIndex((i) => i.id === presenter.activeId);
  const replace = (next: Agenda) => setAgendas((list) => list.map((a) => (a.id === next.id ? next : a)));

  const toggleEditing = () => {
    if (editing) void saver.flush();
    setMessage('');
    setEditing(!editing);
  };

  return (
    <aside className="flex w-1/3 shrink-0 flex-col overflow-hidden border-l border-white/10 bg-gray-900 sm:w-80">
      <div className="shrink-0 border-b border-white/10 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-100">{t('meeting.agendaTitle')}</p>
          <div className="ml-auto flex items-center gap-1">
          <NewAgendaMenu dark store={store} templates={templates} onBefore={saver.flush}
            onCreated={(created, from) => {
              setAgendas((list) => [created, ...list]);
              setSelectedId(created.id);
              // A blank one needs filling in; a template is ready to present.
              setEditing(from === 'blank');
              setMessage('');
            }}
            onError={(key) => setMessage(t(key))} />
          {agenda && (editing ? (
            <button type="button" onClick={toggleEditing}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-500">
              {t('meeting.agendaDone')}
            </button>
          ) : (
            <button type="button" onClick={toggleEditing}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-300 hover:bg-white/10 hover:text-white">
              <Pencil size={13} />{t('meeting.agendaEdit')}
            </button>
          ))}
          </div>
        </div>
        {agendas.length > 0 && (
          <select value={selectedId ?? ''} onChange={(e) => { void saver.flush(); setSelectedId(e.target.value); }}
            className="mt-2 w-full rounded-lg border border-white/10 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
            {agendas.map((a) => <option key={a.id} value={a.id}>{a.title}（{a.date}）</option>)}
          </select>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!agenda ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-sm text-gray-400">
            {t('meeting.agendaNothing')}
            {message && <p className="text-red-300">{message}</p>}
          </div>
        ) : editing ? (
          <div className="p-3">
            <AgendaItemList key={agenda.id} agenda={agenda} store={store} saver={saver} onChange={replace} dark
              message={message} onMessage={setMessage}
              onItemEdited={(item) => {
                // The slide on screen follows its text as it is typed.
                if (item.id === presenter.activeId && (item.kind === 'text' || item.kind === 'image' || item.kind === 'scripture')) void presenter.share(item, footer);
              }}
              onBeforeRemove={async (itemId) => { if (itemId === presenter.activeId) await presenter.stop(); }} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-sm text-gray-400">
            {t('meeting.agendaNothing')}
            <button type="button" onClick={toggleEditing} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-gray-200 hover:bg-white/20">
              <Pencil size={14} />{t('meeting.agendaEdit')}
            </button>
          </div>
        ) : items.map((item) => {
          const active = item.id === presenter.activeId;
          return (
            <div key={item.id} className={`flex items-center gap-2 border-b border-white/5 px-3 py-2.5 ${active ? 'bg-amber-400/10 ring-2 ring-inset ring-amber-400' : ''}`}>
              <span className={active ? 'text-amber-300' : 'text-gray-400'}>{KIND_ICON[item.kind]}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-100">{itemLabel(item, language, fallbacks)}</span>
              {active ? (
                <button type="button" onClick={() => void presenter.stop()} className="flex shrink-0 items-center gap-1 rounded-md bg-amber-400 px-2 py-1 text-xs font-semibold text-gray-900">
                  <Square size={11} fill="currentColor" />{t('meeting.agendaStop')}
                </button>
              ) : (
                <button type="button" onClick={() => void presenter.share(item, footer)} aria-label={t('meeting.agendaShare')}
                  className="flex shrink-0 items-center rounded-md px-2 py-1 text-blue-300 hover:bg-white/10 hover:text-white">
                  <Play size={15} fill="currentColor" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!editing && items.length > 0 && (
        <div className="flex shrink-0 gap-2 border-t border-white/10 p-3">
          <button type="button" disabled={activeIndex <= 0} onClick={() => void presenter.step(items, -1, footer)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/15 py-2 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-30">
            <ChevronLeft size={16} />{t('meeting.agendaPrev')}
          </button>
          <button type="button" disabled={activeIndex >= items.length - 1 && activeIndex !== -1} onClick={() => void presenter.step(items, 1, footer)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/15 py-2 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-30">
            {t('meeting.agendaNext')}<ChevronRight size={16} />
          </button>
        </div>
      )}
    </aside>
  );
};
