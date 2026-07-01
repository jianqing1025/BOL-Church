import React from 'react';
import { Mic, MicOff, Video as VideoIcon, VideoOff, ScreenShare, MessageSquare, Users, PhoneOff } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';

interface MeetingControlBarProps {
  hasVideo: boolean;
  micOn: boolean;
  camOn: boolean;
  chatOpen: boolean;
  membersOpen: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleMembers: () => void;
  onLeave: () => void;
}

const CircleButton: React.FC<{
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, active, danger, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors ${
      danger
        ? 'bg-red-600 hover:bg-red-700'
        : active
          ? 'bg-blue-600 hover:bg-blue-500'
          : 'bg-gray-700 hover:bg-gray-600'
    }`}
  >
    {children}
  </button>
);

export const MeetingControlBar: React.FC<MeetingControlBarProps> = ({
  hasVideo, micOn, camOn, chatOpen, membersOpen,
  onToggleMic, onToggleCamera, onToggleScreenShare, onToggleChat, onToggleMembers, onLeave,
}) => {
  const { t } = useLocalization();
  return (
    <div className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 bg-gray-900/80 px-4 py-3">
      {hasVideo && (
        <>
          <CircleButton label={t('meeting.microphone')} active={micOn} onClick={onToggleMic}>
            {micOn ? <Mic size={20} /> : <MicOff size={20} className="text-red-300" />}
          </CircleButton>
          <CircleButton label={t('meeting.camera')} active={camOn} onClick={onToggleCamera}>
            {camOn ? <VideoIcon size={20} /> : <VideoOff size={20} className="text-red-300" />}
          </CircleButton>
          <CircleButton label={t('meeting.screenShare')} onClick={onToggleScreenShare}>
            <ScreenShare size={20} />
          </CircleButton>
        </>
      )}
      <CircleButton label={t('meeting.chat')} active={chatOpen} onClick={onToggleChat}>
        <MessageSquare size={20} />
      </CircleButton>
      <CircleButton label={t('meeting.members')} active={membersOpen} onClick={onToggleMembers}>
        <Users size={20} />
      </CircleButton>
      <CircleButton label={t('meeting.leave')} danger onClick={onLeave}>
        <PhoneOff size={20} />
      </CircleButton>
    </div>
  );
};

export default MeetingControlBar;
