import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Square } from 'lucide-react';
import { useLocalization } from '../../../hooks/useLocalization';
import type { AgendaStore } from '../../../meeting/agenda/agendaStore';
import { itemLabel, localDateString, nearestAgenda } from '../../../meeting/agenda/agendaModel';
import type { Agenda, AgendaItem } from '../../../meeting/agenda/types';
import type { AgendaPresenter } from '../../../hooks/useAgendaPresenter';
import { KIND_ICON, useItemFallbacks } from './AgendaEditor';

/** The host's list during the meeting: pick an agenda, share its items one at a time. */
export const AgendaDrawer: React.FC<{ store: AgendaStore; presenter: AgendaPresenter; onOpenEditor: () => void; reloadKey: number }> = ({
  store, presenter, onOpenEditor, reloadKey,
}) => {
  const { language, t } = useLocalization();
  const fallbacks = useItemFallbacks();
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void store.list().then((list) => {
      setAgendas(list);
      setSelectedId((id) => (id && list.some((a) => a.id === id) ? id : nearestAgenda(list, localDateString(new Date()))?.id ?? null));
    });
  }, [store, reloadKey]);

  const agenda = agendas.find((a) => a.id === selectedId) ?? null;
  const items: AgendaItem[] = agenda?.items ?? [];
  const activeIndex = items.findIndex((i) => i.id === presenter.activeId);

  return (
    <aside className="flex w-1/3 shrink-0 flex-col overflow-hidden border-l border-white/10 bg-gray-900 sm:w-80">
      <div className="shrink-0 border-b border-white/10 px-3 py-3">
        <p className="text-sm font-semibold text-gray-100">{t('meeting.agendaTitle')}</p>
        {agendas.length > 0 && (
          <select value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-gray-800 px-2 py-1.5 text-sm text-gray-200">
            {agendas.map((a) => <option key={a.id} value={a.id}>{a.title}（{a.date}）</option>)}
          </select>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-sm text-gray-400">
            {t('meeting.agendaNothing')}
            <button type="button" onClick={onOpenEditor} className="rounded-lg bg-white/10 px-3 py-1.5 text-gray-200 hover:bg-white/20">{t('meeting.agendaOpenEditor')}</button>
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
                <button type="button" onClick={() => void presenter.share(item)} aria-label={t('meeting.agendaShare')}
                  className="flex shrink-0 items-center rounded-md px-2 py-1 text-blue-300 hover:bg-white/10 hover:text-white">
                  <Play size={15} fill="currentColor" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {items.length > 0 && (
        <div className="flex shrink-0 gap-2 border-t border-white/10 p-3">
          <button type="button" disabled={activeIndex <= 0} onClick={() => void presenter.step(items, -1)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/15 py-2 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-30">
            <ChevronLeft size={16} />{t('meeting.agendaPrev')}
          </button>
          <button type="button" disabled={activeIndex >= items.length - 1 && activeIndex !== -1} onClick={() => void presenter.step(items, 1)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/15 py-2 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-30">
            {t('meeting.agendaNext')}<ChevronRight size={16} />
          </button>
        </div>
      )}
    </aside>
  );
};
