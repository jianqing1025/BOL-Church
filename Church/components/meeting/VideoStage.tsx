import React, { useEffect, useRef } from 'react';
import { Video as VideoIcon } from 'lucide-react';
import { Track, type Participant } from 'livekit-client';
import { LiveKitService } from '../../services/livekitService';
import { useLocalization } from '../../hooks/useLocalization';
import { ScreenSharePanZoom } from './ScreenSharePanZoom';

/** How many thumbnails to show before collapsing the rest into a +N chip. */
const MAX_THUMBS = 6;

const initials = (label: string): string => label.trim().slice(0, 2).toUpperCase() || '?';

const ParticipantTile: React.FC<{ participant: Participant; large?: boolean }> = ({ participant, large }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Recomputed every render (participant objects are mutated in place by
  // LiveKit, so we cannot rely on reference changes). The attach effects key on
  // the track object, so they re-run whenever a track is published/subscribed.
  const videoTrack = LiveKitService.videoTrack(participant);
  const audioTrack = LiveKitService.audioTrack(participant);
  const isScreenShare = videoTrack?.source === Track.Source.ScreenShare;
  const label = participant.name || participant.identity;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoTrack) return;
    videoTrack.attach(el);
    return () => { try { videoTrack.detach(el); } catch { /* ignore */ } };
  }, [videoTrack]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioTrack) return;
    audioTrack.attach(el);
    return () => { try { audioTrack.detach(el); } catch { /* ignore */ } };
  }, [audioTrack]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-black ${large ? 'h-full w-full' : 'aspect-video w-full'}`}>
      {videoTrack ? (
        large && isScreenShare ? (
          <ScreenSharePanZoom>
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
          </ScreenSharePanZoom>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full ${isScreenShare ? 'object-contain' : 'object-cover'}`} />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gray-800">
          <span className={`flex items-center justify-center rounded-full bg-gray-600 font-bold text-gray-100 ${large ? 'h-24 w-24 text-3xl' : 'h-12 w-12 text-base'}`}>
            {initials(label)}
          </span>
        </div>
      )}
      {audioTrack && <audio ref={audioRef} autoPlay />}
      <span className={`absolute left-2 bottom-1.5 rounded bg-black/40 px-1.5 py-0.5 font-semibold text-white drop-shadow ${large ? 'text-sm' : 'text-xs'}`}>
        {label}
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

  // An active screen share takes the big tile for everyone; otherwise the first
  // participant (local) is featured.
  const sharer = participants.find((p) => LiveKitService.isScreenSharing(p));
  const featured = sharer ?? participants[0];
  const rest = participants.filter((p) => p !== featured);
  const thumbs = rest.slice(0, MAX_THUMBS);
  const overflow = rest.length - thumbs.length;

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3 md:flex-row">
      {error && (
        <p className="absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded bg-red-900/80 px-3 py-1 text-xs text-red-100">{error}</p>
      )}
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
