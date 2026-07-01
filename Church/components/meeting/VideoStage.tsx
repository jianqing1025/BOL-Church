import React, { useEffect, useRef } from 'react';
import { Video as VideoIcon } from 'lucide-react';
import type { Participant } from 'livekit-client';
import { LiveKitService } from '../../services/livekitService';
import { useLocalization } from '../../hooks/useLocalization';

/** How many thumbnails to show before collapsing the rest into a +N chip. */
const MAX_THUMBS = 6;

const ParticipantTile: React.FC<{ participant: Participant; large?: boolean }> = ({ participant, large }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return LiveKitService.attachVideo(participant, ref.current);
  }, [participant]);
  return (
    <div className={`relative overflow-hidden rounded-xl bg-black ${large ? 'h-full w-full' : 'aspect-video w-full'}`}>
      <video ref={ref} autoPlay playsInline muted={participant.isLocal} className="h-full w-full object-cover" />
      <span className={`absolute left-2 bottom-1.5 rounded bg-black/40 px-1.5 py-0.5 font-semibold text-white drop-shadow ${large ? 'text-sm' : 'text-xs'}`}>
        {participant.name || participant.identity}
      </span>
    </div>
  );
};

interface VideoStageProps {
  participants: Participant[];
  connecting: boolean;
  error: string;
  onRetry: () => void;
}

/** Active-speaker (large) + thumbnail strip, matching the MeetingPro layout. */
export const VideoStage: React.FC<VideoStageProps> = ({ participants, connecting, error, onRetry }) => {
  const { t } = useLocalization();

  if (participants.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        {error && <p className="max-w-sm text-sm text-red-400">{error}</p>}
        {connecting ? (
          <p className="text-sm text-gray-400">{t('meeting.videoConnecting')}</p>
        ) : (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700"
          >
            <VideoIcon size={18} />
            {t('meeting.joinVideo')}
          </button>
        )}
      </div>
    );
  }

  const [featured, ...rest] = participants;
  const thumbs = rest.slice(0, MAX_THUMBS);
  const overflow = rest.length - thumbs.length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row">
      <div className="min-h-0 flex-1">
        <ParticipantTile participant={featured} large />
      </div>
      {rest.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto md:w-40 md:flex-col md:overflow-y-auto md:overflow-x-visible">
          {thumbs.map((p) => (
            <div key={p.sid || p.identity} className="w-28 shrink-0 md:w-full">
              <ParticipantTile participant={p} />
            </div>
          ))}
          {overflow > 0 && (
            <div className="flex aspect-video w-28 shrink-0 items-center justify-center rounded-xl bg-gray-800 text-sm font-semibold text-gray-300 md:w-full">
              +{overflow}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoStage;
