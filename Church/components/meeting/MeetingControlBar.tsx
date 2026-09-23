import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, ScreenShare, MessageSquare, Users, PhoneOff,
  LayoutGrid, UserSquare2, BookOpen, Play, Hand, FileVideo, Youtube,
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
  onMuteAll: () => void;
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

/**
 * The weight the whole bar is drawn at: a little larger than the label under
 * it, and a lighter stroke than the icon set's default, so seven of them in a
 * row read as one quiet line of controls rather than seven heavy glyphs.
 */
const ICON = { size: 22, strokeWidth: 1.5 } as const;
const MENU_ICON = { size: 16, strokeWidth: 1.5 } as const;

/**
 * Three marks with a ring in the middle.
 *
 * The icon set's own "more" is three solid dots, which at this stroke weight
 * looks heavier than everything beside it. Opening the middle one out into a
 * ring keeps the meaning and matches the line work.
 */
const MoreIcon: React.FC = () => (
  <svg width={ICON.size} height={ICON.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.15" fill="currentColor" />
    <circle cx="12" cy="12" r="2.5" strokeWidth={ICON.strokeWidth} />
    <circle cx="19" cy="12" r="1.15" fill="currentColor" />
  </svg>
);

/**
 * The stop mark, filled.
 *
 * Every other icon here is line work, and this one deliberately is not: an
 * outlined square at this stroke weight reads as an empty box — a checkbox
 * waiting to be ticked — rather than the stop symbol off a tape deck. Filling
 * it is what makes it a control. It is the only solid glyph on the bar, which
 * suits the only button that ends something for the whole room.
 */
const StopIcon: React.FC = () => (
  <svg width={ICON.size} height={ICON.size} viewBox="0 0 24 24" aria-hidden="true">
    <rect x="7" y="7" width="10" height="10" rx="2.5" fill="currentColor" />
  </svg>
);

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

/**
 * One control: the round icon with its word underneath.
 *
 * The caption is two characters wide by design — seven of these plus a divider
 * have to sit on one row of a 360px phone, and the icons carry the state (a
 * struck-through microphone, an amber hand) so the word only has to name the
 * thing. `aria-label` stays the longer, situational wording, which is what a
 * screen reader should hear.
 */
const CircleButton: React.FC<{
  label: string;
  caption: string;
  active?: boolean;
  danger?: boolean;
  badge?: number;
  expanded?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, caption, active, danger, badge, expanded, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={expanded === undefined ? active : undefined}
    aria-haspopup={expanded === undefined ? undefined : 'menu'}
    aria-expanded={expanded}
    className="flex shrink-0 flex-col items-center gap-1"
  >
    <span
      className={`relative flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors sm:h-12 sm:w-12 ${
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
    </span>
    <span className={`text-[10px] font-semibold leading-none sm:text-[11px] ${danger ? 'text-red-300' : 'text-gray-300'}`}>
      {caption}
    </span>
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
  onToggleView, onToggleMic, onToggleCamera, onToggleHand, onLowerAllHands, onMuteAll, onToggleScreenShare,
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
    screenShare: { label: t('meeting.screenShare'), icon: <ScreenShare {...MENU_ICON} />, active: screenOn, onSelect: onToggleScreenShare },
    chat: { label: t('meeting.chat'), icon: <MessageSquare {...MENU_ICON} />, active: chatOpen, badge: chatBadge, onSelect: onToggleChat },
    members: { label: t('meeting.members'), icon: <Users {...MENU_ICON} />, active: membersOpen, onSelect: onToggleMembers },
    view: {
      label: t(viewMode === 'gallery' ? 'meeting.viewSpeakerLong' : 'meeting.viewGalleryLong'),
      icon: viewMode === 'gallery' ? <UserSquare2 {...MENU_ICON} /> : <LayoutGrid {...MENU_ICON} />,
      onSelect: onToggleView,
    },
    lowerAllHands: { label: t('meeting.lowerAllHands'), icon: <Hand {...MENU_ICON} />, onSelect: onLowerAllHands },
    muteAll: { label: t('meeting.muteAll'), icon: <MicOff {...MENU_ICON} />, onSelect: onMuteAll },
  };

  return (
    <div className="relative flex shrink-0 items-end justify-center gap-1.5 border-t border-white/10 bg-gray-900/80 px-2 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
      {hasVideo && (
        <>
          <CircleButton label={t('meeting.microphone')} caption={t('meeting.tagAudio')} active={micOn} onClick={onToggleMic}>
            {micOn ? <Mic {...ICON} /> : <MicOff {...ICON} className="text-red-300" />}
          </CircleButton>
          <CircleButton label={t('meeting.camera')} caption={t('meeting.tagCamera')} active={camOn} onClick={onToggleCamera}>
            {camOn ? <VideoIcon {...ICON} /> : <VideoOff {...ICON} className="text-red-300" />}
          </CircleButton>
          <CircleButton
            label={t(handRaised ? 'meeting.lowerHand' : 'meeting.raiseHand')}
            caption={t(handRaised ? 'meeting.tagLowerHand' : 'meeting.tagHand')}
            active={handRaised}
            onClick={onToggleHand}
          >
            <Hand {...ICON} className={handRaised ? 'text-amber-200' : undefined} />
          </CircleButton>
          <div role="separator" aria-orientation="vertical" className="mb-4 h-7 w-px shrink-0 bg-white/25" />
        </>
      )}

      <CircleButton label={t('bible.open')} caption={t('meeting.tagBible')} active={bibleOpen} onClick={onToggleBible}>
        <BookOpen {...ICON} />
      </CircleButton>

      {hasVideo && (
        <div ref={videoMenuRef} className="relative flex shrink-0">
          {videoMenuOpen && (
            <MenuPanel>
              <MenuItem
                label={t('meeting.videoLocal')}
                icon={<FileVideo {...MENU_ICON} />}
                onSelect={() => { setVideoMenuOpen(false); onPickLocalVideo(); }}
              />
              <MenuItem
                label={t('meeting.videoYouTube')}
                icon={<Youtube {...MENU_ICON} />}
                onSelect={() => { setVideoMenuOpen(false); onPickYouTubeVideo(); }}
              />
            </MenuPanel>
          )}
          <CircleButton
            label={t(canStopSharedVideo ? 'meeting.videoFileStop' : 'meeting.videoFile')}
            caption={t(canStopSharedVideo ? 'meeting.tagStop' : 'meeting.tagVideo')}
            active={videoFileOn}
            expanded={canStopSharedVideo ? undefined : videoMenuOpen}
            onClick={canStopSharedVideo ? onStopSharedVideo : () => setVideoMenuOpen((v) => !v)}
          >
            {/* A bare triangle and a bare square: a play symbol drawn inside a
                circle, sitting inside this round button, was a circle in a circle. */}
            {canStopSharedVideo ? <StopIcon /> : <Play {...ICON} />}
          </CircleButton>
        </div>
      )}

      <div ref={menuRef} className="relative flex shrink-0">
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
          caption={t('meeting.tagMore')}
          active={menuOpen}
          badge={menuOpen ? 0 : hiddenBadges}
          expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreIcon />
        </CircleButton>
      </div>

      <div role="separator" aria-orientation="vertical" className="mb-4 h-7 w-px shrink-0 bg-white/25" />

      <CircleButton label={t('meeting.leave')} caption={t('meeting.tagLeave')} danger onClick={onLeave}>
        <PhoneOff {...ICON} />
      </CircleButton>
    </div>
  );
};

export default MeetingControlBar;
