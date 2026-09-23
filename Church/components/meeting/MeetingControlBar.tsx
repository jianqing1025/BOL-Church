import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, ScreenShare, MessageSquare, Users, PhoneOff,
  LayoutGrid, UserSquare2, BookOpen, PlayCircle, Hand, MoreHorizontal, FileVideo, Youtube, Square,
} from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import { overflowKeys, type OverflowKey } from './controlBarItems';
import type { ViewMode } from './VideoStage';

interface MeetingControlBarProps {
  hasVideo: boolean;
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  chatOpen: boolean;
  chatBadge: number;
  membersOpen: boolean;
  bibleOpen: boolean;
  /** Something is in the shared-picture slot: a local file or a room video. */
  videoFileOn: boolean;
  /** Whether this participant is allowed to stop what is in that slot. */
  canStopSharedVideo: boolean;
  onStopSharedVideo: () => void;
  onPickLocalVideo: () => void;
  onPickYouTubeVideo: () => void;
  /** Whether this participant has a hand up. */
  handRaised: boolean;
  /** Host sees "lower all hands"; members do not. */
  isHost: boolean;
  /** Hands currently up in the room; zero hides the host's lower-all item. */
  raisedHands: number;
  showViewToggle: boolean;
  viewMode: ViewMode;
  onToggleView: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleHand: () => void;
  onLowerAllHands: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleMembers: () => void;
  onToggleBible: () => void;
  onLeave: () => void;
}

/**
 * Closes a popup when the next press lands outside it, or on Escape.
 *
 * Both menus on this bar need exactly this, and a second copy would be the
 * kind that quietly stops matching the first.
 */
function useDismissable(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);
  return ref;
}

const MenuPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    role="menu"
    className="absolute bottom-full left-1/2 z-40 mb-3 w-52 -translate-x-1/2 rounded-xl border border-white/10 bg-gray-800 p-1.5 shadow-2xl"
  >
    {children}
  </div>
);

const MenuItem: React.FC<{
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  badge?: number;
  onSelect: () => void;
}> = ({ label, icon, active, badge, onSelect }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onSelect}
    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-white/10 ${
      active ? 'text-blue-300' : 'text-gray-100'
    }`}
  >
    <span className="shrink-0 opacity-85">{icon}</span>
    <span className="truncate">{label}</span>
    {badge && badge > 0 ? (
      <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white">
        {badge > 99 ? '99+' : badge}
      </span>
    ) : null}
  </button>
);

const CircleButton: React.FC<{
  label: string;
  active?: boolean;
  danger?: boolean;
  badge?: number;
  expanded?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, active, danger, badge, expanded, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={expanded === undefined ? active : undefined}
    aria-haspopup={expanded === undefined ? undefined : 'menu'}
    aria-expanded={expanded}
    className={`relative flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors sm:h-12 sm:w-12 ${
      danger
        ? 'bg-red-600 hover:bg-red-700'
        : active
          ? 'bg-blue-600 hover:bg-blue-500'
          : 'bg-gray-700 hover:bg-gray-600'
    }`}
  >
    {children}
    {badge && badge > 0 ? (
      <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-gray-900">
        {badge > 99 ? '99+' : badge}
      </span>
    ) : null}
  </button>
);

/**
 * One row, always: microphone, camera, hand │ Bible, video, more, hang up.
 *
 * Everything else lives behind "more" with a written label rather than an icon
 * alone. A fixed row is what keeps the bar from wrapping onto a second line on
 * a phone, where the stage has no vertical space to spare, and hang up sits at
 * the far edge because it is the one button nobody may press by accident.
 */
export const MeetingControlBar: React.FC<MeetingControlBarProps> = ({
  hasVideo, micOn, camOn, screenOn, chatOpen, chatBadge, membersOpen, bibleOpen,
  videoFileOn, canStopSharedVideo, onStopSharedVideo, onPickLocalVideo, onPickYouTubeVideo,
  handRaised, isHost, raisedHands, showViewToggle, viewMode,
  onToggleView, onToggleMic, onToggleCamera, onToggleHand, onLowerAllHands, onToggleScreenShare,
  onToggleChat, onToggleMembers, onToggleBible, onLeave,
}) => {
  const { t } = useLocalization();
  const [menuOpen, setMenuOpen] = useState(false);
  const [videoMenuOpen, setVideoMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeVideoMenu = useCallback(() => setVideoMenuOpen(false), []);
  const menuRef = useDismissable(menuOpen, closeMenu);
  const videoMenuRef = useDismissable(videoMenuOpen, closeVideoMenu);

  const keys = overflowKeys({ hasVideo, showViewToggle, isHost, raisedHands });

  // A badge hidden inside the menu would never be seen, so the menu button
  // carries whatever its contents are trying to say.
  const hiddenBadges = keys.includes('chat') ? chatBadge : 0;

  const items: Record<OverflowKey, { label: string; icon: React.ReactNode; active?: boolean; badge?: number; onSelect: () => void }> = {
    screenShare: { label: t('meeting.screenShare'), icon: <ScreenShare size={16} />, active: screenOn, onSelect: onToggleScreenShare },
    chat: { label: t('meeting.chat'), icon: <MessageSquare size={16} />, active: chatOpen, badge: chatBadge, onSelect: onToggleChat },
    members: { label: t('meeting.members'), icon: <Users size={16} />, active: membersOpen, onSelect: onToggleMembers },
    view: {
      label: t(viewMode === 'gallery' ? 'meeting.viewSpeakerLong' : 'meeting.viewGalleryLong'),
      icon: viewMode === 'gallery' ? <UserSquare2 size={16} /> : <LayoutGrid size={16} />,
      onSelect: onToggleView,
    },
    lowerAllHands: { label: t('meeting.lowerAllHands'), icon: <Hand size={16} />, onSelect: onLowerAllHands },
  };

  return (
    <div className="relative flex shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-gray-900/80 px-3 py-3 sm:gap-3 sm:px-4">
      {hasVideo && (
        <>
          <CircleButton label={t('meeting.microphone')} active={micOn} onClick={onToggleMic}>
            {micOn ? <Mic size={20} /> : <MicOff size={20} className="text-red-300" />}
          </CircleButton>
          <CircleButton label={t('meeting.camera')} active={camOn} onClick={onToggleCamera}>
            {camOn ? <VideoIcon size={20} /> : <VideoOff size={20} className="text-red-300" />}
          </CircleButton>
          <CircleButton label={t(handRaised ? 'meeting.lowerHand' : 'meeting.raiseHand')} active={handRaised} onClick={onToggleHand}>
            <Hand size={20} className={handRaised ? 'text-amber-200' : undefined} />
          </CircleButton>
          <div role="separator" aria-orientation="vertical" className="h-8 w-px shrink-0 bg-white/30" />
        </>
      )}

      <CircleButton label={t('bible.open')} active={bibleOpen} onClick={onToggleBible}>
        <BookOpen size={20} />
      </CircleButton>

      {hasVideo && (
        <div ref={videoMenuRef} className="relative">
          {videoMenuOpen && (
            <MenuPanel>
              <MenuItem
                label={t('meeting.videoLocal')}
                icon={<FileVideo size={16} />}
                onSelect={() => { setVideoMenuOpen(false); onPickLocalVideo(); }}
              />
              <MenuItem
                label={t('meeting.videoYouTube')}
                icon={<Youtube size={16} />}
                onSelect={() => { setVideoMenuOpen(false); onPickYouTubeVideo(); }}
              />
            </MenuPanel>
          )}
          <CircleButton
            label={t(canStopSharedVideo ? 'meeting.videoFileStop' : 'meeting.videoFile')}
            active={videoFileOn}
            expanded={canStopSharedVideo ? undefined : videoMenuOpen}
            onClick={canStopSharedVideo ? onStopSharedVideo : () => setVideoMenuOpen((v) => !v)}
          >
            {canStopSharedVideo ? <Square size={18} /> : <PlayCircle size={20} />}
          </CircleButton>
        </div>
      )}

      <div ref={menuRef} className="relative">
        {menuOpen && (
          <MenuPanel>
            {keys.map((key) => {
              const item = items[key];
              return (
                <MenuItem
                  key={key}
                  label={item.label}
                  icon={item.icon}
                  active={item.active}
                  badge={item.badge}
                  onSelect={() => { setMenuOpen(false); item.onSelect(); }}
                />
              );
            })}
          </MenuPanel>
        )}
        <CircleButton
          label={t('meeting.more')}
          active={menuOpen}
          badge={menuOpen ? 0 : hiddenBadges}
          expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal size={20} />
        </CircleButton>
      </div>

      <CircleButton label={t('meeting.leave')} danger onClick={onLeave}>
        <PhoneOff size={20} />
      </CircleButton>
    </div>
  );
};

export default MeetingControlBar;
