import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, GripVertical, Hand, Maximize2, MessageSquare, Mic, MicOff, Users, Video as VideoIcon, VideoOff } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';

/** One raised hand, in queue order. */
export interface RaisedHand {
  identity: string;
  name: string;
  order: number;
  isLocal: boolean;
}

interface DesktopShareBarProps {
  elapsed: string;
  micOn: boolean;
  camOn: boolean;
  chatBadge: number;
  memberCount: number;
  bibleOpen: boolean;
  handRaised: boolean;
  raisedHands: RaisedHand[];
  isHost: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onOpenChat: () => void;
  onOpenMembers: () => void;
  onOpenBible: () => void;
  onToggleHand: () => void;
  onLowerHand: (identity: string) => void;
  onLowerAllHands: () => void;
  onStopShare: () => void;
}

/** Height of the bar itself; the window grows below it for the hands list. */
const BAR_HEIGHT = 68;
const iconButton = 'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors';

/**
 * What the meeting window becomes while a whole screen is shared: a small
 * floating toolbar, like Zoom's, kept out of the capture by the shell. Only the
 * presenter's own clicks bring the full meeting back.
 */
export const DesktopShareBar: React.FC<DesktopShareBarProps> = ({
  elapsed, micOn, camOn, chatBadge, memberCount, bibleOpen, handRaised, raisedHands, isHost,
  onToggleMic, onToggleCamera, onOpenChat, onOpenMembers, onOpenBible, onToggleHand, onLowerHand, onLowerAllHands, onStopShare,
}) => {
  const { t } = useLocalization();
  const idle = 'text-gray-300 hover:bg-white/10 hover:text-white';
  const [handsOpen, setHandsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // The badge counts other people: your own hand already shows as the lit button.
  const othersRaised = raisedHands.filter((h) => !h.isLocal).length;

  // The window is only as tall as the bar, so the list needs the window to grow.
  // An older executable cannot resize the bar; there the full meeting opens instead.
  const toggleHands = () => {
    if (!window.meetingDesktop?.setCompactHeight) { window.meetingDesktop?.expand(); return; }
    setHandsOpen((open) => !open);
  };
  // Observed rather than measured once: the list changes as hands go up and
  // down, and Tailwind's runtime styles new classes a moment after render.
  useLayoutEffect(() => {
    const setHeight = window.meetingDesktop?.setCompactHeight;
    const panel = panelRef.current;
    if (!setHeight) return;
    if (!handsOpen || !panel) { setHeight(BAR_HEIGHT); return; }
    const observer = new ResizeObserver(() => setHeight(BAR_HEIGHT + panel.offsetHeight));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [handsOpen]);
  useEffect(() => () => window.meetingDesktop?.setCompactHeight?.(BAR_HEIGHT), []);
  useEffect(() => {
    if (!handsOpen) return;
    const close = () => setHandsOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('blur', close); window.removeEventListener('keydown', onKey); };
  }, [handsOpen]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#1b1f27] text-gray-100">
      <div className="desktop-drag flex shrink-0 items-center gap-1 pl-1.5 pr-2.5" style={{ height: BAR_HEIGHT }}>
        <GripVertical size={16} className="shrink-0 text-gray-600" aria-hidden />
        <div className="mr-2 flex min-w-0 items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <span className="truncate text-[13px] font-medium">{t('meeting.desktopSharingShort')}</span>
          <span className="shrink-0 tabular-nums text-xs text-gray-500">{elapsed}</span>
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" title={t('meeting.microphone')} aria-label={t('meeting.microphone')} aria-pressed={micOn}
            className={`${iconButton} ${micOn ? idle : 'text-red-400 hover:bg-white/10'}`} onClick={onToggleMic}>
            {micOn ? <Mic size={19} /> : <MicOff size={19} />}
          </button>
          <button type="button" title={t('meeting.camera')} aria-label={t('meeting.camera')} aria-pressed={camOn}
            className={`${iconButton} ${camOn ? idle : 'text-red-400 hover:bg-white/10'}`} onClick={onToggleCamera}>
            {camOn ? <VideoIcon size={19} /> : <VideoOff size={19} />}
          </button>
          <button type="button" title={t('meeting.raiseHand')} aria-label={t('meeting.raiseHand')} aria-expanded={handsOpen}
            className={`${iconButton} ${handRaised ? 'bg-amber-400/15 text-amber-300 hover:bg-amber-400/25' : handsOpen ? 'bg-white/10 text-white' : idle}`}
            onClick={toggleHands}>
            <Hand size={18} />
            {othersRaised > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold leading-none text-gray-900">
                {othersRaised}
              </span>
            )}
          </button>
          <button type="button" title={t('meeting.tagBible')} aria-label={t('bible.open')} aria-pressed={bibleOpen}
            className={`${iconButton} ${bibleOpen ? 'text-blue-300 hover:bg-white/10' : idle}`} onClick={onOpenBible}>
            <BookOpen size={18} />
          </button>
          <button type="button" title={t('meeting.chat')} aria-label={t('meeting.chat')} className={`${iconButton} ${idle}`} onClick={onOpenChat}>
            <MessageSquare size={18} />
            {chatBadge > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                {chatBadge > 99 ? '99+' : chatBadge}
              </span>
            )}
          </button>
          <button type="button" title={t('meeting.members')} aria-label={t('meeting.members')}
            className={`flex h-10 shrink-0 items-center gap-1 rounded-xl px-2.5 text-sm transition-colors ${idle}`} onClick={onOpenMembers}>
            <Users size={18} />
            <span className="tabular-nums">{memberCount}</span>
          </button>
        </div>

        <div className="mx-1.5 h-6 w-px bg-white/10" />
        <button type="button" onClick={onStopShare}
          className="h-9 shrink-0 rounded-xl bg-red-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-red-500">
          {t('meeting.stopShare')}
        </button>
        <button type="button" title={t('meeting.desktopExpand')} aria-label={t('meeting.desktopExpand')}
          className={`${iconButton} ${idle}`} onClick={() => window.meetingDesktop?.expand()}>
          <Maximize2 size={17} />
        </button>
      </div>

      {handsOpen && (
        <div ref={panelRef} className="shrink-0 border-t border-white/10 px-4 pb-3 pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">{t('meeting.desktopHandsTitle')} · {raisedHands.length}</span>
            {isHost && raisedHands.length > 0 && (
              <button type="button" onClick={onLowerAllHands} className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-white/10 hover:text-white">
                {t('meeting.lowerAllHands')}
              </button>
            )}
          </div>
          <ul className="mt-1.5 max-h-60 space-y-0.5 overflow-y-auto">
            {raisedHands.length === 0 && <li className="py-2 text-[13px] text-gray-500">{t('meeting.desktopNoHands')}</li>}
            {raisedHands.map((h) => (
              <li key={h.identity} className="flex h-9 items-center gap-2.5 rounded-lg px-2 hover:bg-white/5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold text-gray-900">{h.order}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {h.name}
                  {h.isLocal && <span className="ml-1 text-gray-500">({t('meeting.desktopYou')})</span>}
                </span>
                {isHost && !h.isLocal && (
                  <button type="button" onClick={() => onLowerHand(h.identity)} className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-white/10 hover:text-white">
                    {t('meeting.lowerHand')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button type="button" onClick={onToggleHand}
            className={`mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition-colors ${
              handRaised ? 'bg-white/10 text-gray-200 hover:bg-white/15' : 'bg-amber-400 text-gray-900 hover:bg-amber-300'
            }`}>
            <Hand size={15} />
            {t(handRaised ? 'meeting.lowerHand' : 'meeting.raiseHand')}
          </button>
        </div>
      )}
    </div>
  );
};
