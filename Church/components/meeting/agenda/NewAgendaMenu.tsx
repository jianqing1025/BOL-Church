import React, { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, ChevronDown, FilePlus2, LayoutTemplate, Loader2, Plus, X } from 'lucide-react';
import { useLocalization } from '../../../hooks/useLocalization';
import type { AgendaStore } from '../../../meeting/agenda/agendaStore';
import { fromTemplate, newAgenda } from '../../../meeting/agenda/agendaModel';
import { createRoomTemplate } from '../../../meeting/agenda/remote';
import { TEMPLATE_ROOM_IDS } from '../../../meeting/agenda/templates';
import type { Agenda } from '../../../meeting/agenda/types';
import { localizeMeetingRoomText, MEETING_ROOMS } from '../../../constants/meetingRooms';
import { storeErrorKey } from './useAgendaSaver';

interface NewAgendaMenuProps {
  store: AgendaStore;
  /** The host's own templates (保存為範本). */
  templates: Agenda[];
  /** Runs first — to write an edit still waiting to be saved. */
  onBefore?: () => Promise<void>;
  onCreated: (agenda: Agenda, from: 'blank' | 'template') => void;
  /** Offered beside each of the host's templates when given (the home editor). */
  onDeleteTemplate?: (template: Agenda) => void;
  /** Receives a translation key. */
  onError: (key: string) => void;
  /** The meeting drawer is dark and opens the menu downward. */
  dark?: boolean;
  className?: string;
}

/**
 * 新增: a blank agenda, a room's ready-made template, or one of the host's own —
 * the same menu on the home editor and in the meeting drawer.
 */
export const NewAgendaMenu: React.FC<NewAgendaMenuProps> = ({
  store, templates, onBefore, onCreated, onDeleteTemplate, onError, dark = false, className = '',
}) => {
  const { language, t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const create = async (from: 'blank' | 'template', make: () => Promise<Agenda>) => {
    setOpen(false);
    await onBefore?.();
    setCreating(true);
    try {
      onCreated(await make(), from);
    } catch (e) {
      onError(storeErrorKey(e));
    } finally {
      setCreating(false);
    }
  };

  const item = `flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${dark ? 'text-gray-200 hover:bg-white/10' : 'text-gray-700 hover:bg-gray-50'}`;
  const divider = `mx-3 my-1 border-t ${dark ? 'border-white/10' : 'border-gray-100'}`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {open && (
        <div role="menu"
          className={`absolute z-20 overflow-hidden rounded-xl border py-1 shadow-lg ${dark
            ? 'right-0 top-full mt-1 w-56 border-white/10 bg-gray-800'
            : 'bottom-full left-0 right-0 mb-1 border-gray-200 bg-white'}`}>
          <button type="button" role="menuitem" className={item}
            onClick={() => void create('blank', () => store.save(newAgenda(new Date(), t('meeting.agendaUntitled'))))}>
            <FilePlus2 size={15} className="text-gray-400" />{t('meeting.agendaTemplateBlank')}
          </button>
          <div className={divider} />
          {MEETING_ROOMS.filter((room) => TEMPLATE_ROOM_IDS.includes(room.id)).map((room) => (
            <button key={room.id} type="button" role="menuitem" className={item}
              onClick={() => void create('template', () => createRoomTemplate(store, room.id))}>
              <LayoutTemplate size={15} className="text-blue-400" />
              {t('meeting.agendaTemplateOf').replace('{room}', localizeMeetingRoomText(room.name, language))}
            </button>
          ))}
          {templates.length > 0 && (
            <>
              <div className={divider} />
              <p className={`px-3 pb-1 pt-1.5 text-xs font-semibold ${dark ? 'text-gray-500' : 'text-gray-400'}`}>{t('meeting.agendaMyTemplates')}</p>
              {templates.map((tpl) => (
                <div key={tpl.id} className="flex items-center">
                  <button type="button" role="menuitem" className={`${item} min-w-0 flex-1`}
                    onClick={() => void create('template', () => store.save(fromTemplate(tpl, new Date())))}>
                    <BookmarkPlus size={15} className="shrink-0 text-emerald-400" /><span className="truncate">{tpl.title}</span>
                  </button>
                  {onDeleteTemplate && (
                    <button type="button" aria-label={t('meeting.agendaTemplateDelete')} title={t('meeting.agendaTemplateDelete')}
                      onClick={() => { setOpen(false); onDeleteTemplate(tpl); }}
                      className="mr-1.5 rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"><X size={14} /></button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
      <button type="button" disabled={creating} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
        className={dark
          ? 'flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-60'
          : 'flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60'}>
        {creating ? <Loader2 size={dark ? 13 : 16} className="animate-spin" /> : <Plus size={dark ? 13 : 16} />}
        {creating ? t('meeting.agendaTemplateLoading') : t('meeting.agendaNew')}
        {!creating && <ChevronDown size={dark ? 12 : 14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
    </div>
  );
};
