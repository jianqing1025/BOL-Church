import React from 'react';
import { ClipboardList, LogOut, Video } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import { localizeMeetingRoomText, type MeetingRoom } from '../../constants/meetingRooms';
import { LogoIcon } from '../icons/Icons';
import { DESKTOP_CONTROLS_WIDTH } from './DesktopShell';

type RoomWithActivity = MeetingRoom & { activeCount?: number };

interface DesktopRoomPickerProps {
  rooms: readonly RoomWithActivity[];
  name: string;
  hostFor: string | null;
  onHostForChange: (roomId: string | null) => void;
  onJoin: (room: RoomWithActivity) => void;
  onSignOut: () => void;
  onOpenAgenda: () => void;
}

/**
 * The desktop app's home: a slim header that doubles as the title bar, and
 * the rooms laid out to fit the window without a scrollbar.
 */
export const DesktopRoomPicker: React.FC<DesktopRoomPickerProps> = ({ rooms, name, hostFor, onHostForChange, onJoin, onSignOut, onOpenAgenda }) => {
  const { language, t } = useLocalization();
  return (
    <div className="flex h-screen flex-col bg-[#f6f7fb]">
      <header className="desktop-drag flex h-12 shrink-0 items-center justify-between border-b border-gray-200/70 bg-white pl-5" style={{ paddingRight: DESKTOP_CONTROLS_WIDTH + 8 }}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white"><LogoIcon className="h-4 w-4" /></span>
          <span className="text-sm font-semibold text-gray-800">{t('header.logo')}</span>
          <span className="text-xs text-gray-400">{t('meeting.desktopAppTitle')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{name.trim().slice(0, 1).toUpperCase()}</span>
          <span className="max-w-40 truncate text-sm text-gray-700">{name}</span>
          <button
            type="button"
            onClick={onSignOut}
            title={t('meeting.switchUser')}
            aria-label={t('meeting.switchUser')}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pb-8 pt-7">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('meeting.pickPrompt')}</h2>
              <p className="mt-1 text-sm text-gray-500">{t('meeting.desktopPickHint')}</p>
            </div>
            <button type="button" onClick={onOpenAgenda}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
              <ClipboardList size={16} />{t('meeting.agendaTitle')}
            </button>
          </div>

          {/* Rows share the window's height, so the cards grow with it instead of leaving a blank lower half. */}
          <div className="mt-5 grid flex-1 auto-rows-[minmax(13rem,1fr)] grid-cols-1 gap-4 min-[860px]:grid-cols-2">
            {rooms.map((r) => {
              const live = (r.activeCount ?? 0) > 0;
              return (
                <div
                  key={r.id}
                  className={`group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-lg ${live ? 'ring-2 ring-blue-500' : 'ring-gray-200/80'}`}
                >
                  <div className="relative min-h-0 flex-1 overflow-hidden bg-gray-100">
                    {r.imageUrl && <img src={r.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />}
                    {live && (
                      <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                        {r.activeCount}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-gray-900">{localizeMeetingRoomText(r.name, language)}</h3>
                      <p className="mt-0.5 truncate text-[13px] text-gray-500">
                        {live ? <span className="font-medium text-blue-600">{t('meeting.inProgress')}</span> : localizeMeetingRoomText(r.schedule, language)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={hostFor === r.id}
                          onChange={(e) => onHostForChange(e.target.checked ? r.id : null)}
                          className="h-3.5 w-3.5 cursor-pointer accent-blue-600"
                        />
                        {t('meeting.host')}
                      </label>
                      <button
                        type="button"
                        onClick={() => onJoin(r)}
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                      >
                        <Video size={15} />
                        {t('meeting.join')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};
