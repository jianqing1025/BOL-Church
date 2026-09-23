import React, { useEffect, useRef } from 'react';
import { Hand, MicOff } from 'lucide-react';
import { Track, type Participant } from 'livekit-client';
import { LiveKitService } from '../../services/livekitService';
import { isHostParticipant } from '../../meeting/participantFlags';
import { connectionTrouble, type ConnectionTrouble } from '../../meeting/connectionQuality';
import { useLocalization } from '../../hooks/useLocalization';
import { ScreenSharePanZoom } from './ScreenSharePanZoom';

const initials = (label: string): string => label.trim().slice(0, 2).toUpperCase() || '?';

interface ParticipantTileProps {
  participant: Participant;
  /** Highlight ring when this participant is the active speaker. */
  speaking?: boolean;
  /** object-fit for the video. Screen shares use `contain`, cameras `cover`. */
  fit?: 'cover' | 'contain';
  /** Wrap the video in the pan/zoom viewport (used for the main screen share). */
  zoomable?: boolean;
  /** Larger avatar for big tiles. */
  large?: boolean;
  /** Queue position of this participant's raised hand; absent when it is down. */
  handOrder?: number;
  /** Host only: tapping the hand badge puts this participant's hand down. */
  onLowerHand?: () => void;
  onClick?: () => void;
  className?: string;
}

/**
 * Three bars, the weak ones hollow.
 *
 * Only drawn for a connection in difficulty. A meter on every tile in a room
 * that is working is decoration, and decoration is what people learn to stop
 * seeing — including on the day it turns red.
 */
const SignalBars: React.FC<{ trouble: ConnectionTrouble; label: string }> = ({ trouble, label }) => {
  const lost = trouble === 'lost';
  const colour = lost ? 'text-red-400' : 'text-amber-300';
  const lit = lost ? 0 : 1;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`pointer-events-none absolute bottom-1.5 right-2 z-10 flex items-end gap-[2px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] ${colour}`}
    >
      {[3, 6, 9].map((height, i) => (
        <span
          key={height}
          style={{ height }}
          className={`w-[3px] rounded-[1px] ${i < lit ? 'bg-current' : 'border border-current bg-transparent'}`}
        />
      ))}
    </span>
  );
};

/**
 * The queue position of a raised hand. A host gets it as a button - tapping it
 * asks that participant to put their hand down - and everyone else as a plain
 * marker, so nobody is offered a control that would do nothing.
 */
const HandBadge: React.FC<{ order: number; label: string; onLower?: () => void }> = ({ order, label, onLower }) => {
  // No disc behind it: at the size the control bar uses, the icon reads on its
  // own, and a drop shadow keeps it legible over a bright frame of video.
  const shape = 'absolute right-2 top-2 z-10 flex items-center gap-1 text-amber-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]';
  const content = <><Hand size={20} />{order > 0 && <span className="text-sm font-bold leading-none">{order}</span>}</>;
  if (!onLower) return <span className={`${shape} pointer-events-none`} aria-label={label}>{content}</span>;
  return (
    <button
      type="button"
      aria-label={label}
      className={`${shape} transition-colors hover:text-amber-200`}
      onClick={(e) => { e.stopPropagation(); onLower(); }}
    >
      {content}
    </button>
  );
};

/**
 * One participant's video, with an initials avatar when the camera is off, a
 * name label, mic-muted indicator, and an active-speaker ring. Recomputes the
 * track each render because LiveKit mutates participant objects in place — the
 * attach effect keys on the track so it re-runs on publish.
 *
 * Deliberately silent: sound is played by RoomAudio, above the layout, so that
 * a tile this viewer's layout happens not to draw is still heard.
 */
export const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant, speaking, fit = 'cover', zoomable, large, handOrder, onLowerHand, onClick, className = '',
}) => {
  const { t } = useLocalization();
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoTrack = LiveKitService.videoTrack(participant);
  const label = participant.name || participant.identity;
  const hosting = isHostParticipant(participant);
  const trouble = connectionTrouble(participant);
  const muted = !participant.isMicrophoneEnabled;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoTrack) return;
    videoTrack.attach(el);
    return () => { try { videoTrack.detach(el); } catch { /* ignore */ } };
  }, [videoTrack]);

  const video = (
    <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
  );

  return (
    <div
      onClick={onClick}
      className={`group relative h-full w-full overflow-hidden rounded-2xl bg-gray-800 ring-2 transition-[box-shadow,transform] duration-300 ${
        speaking ? 'ring-blue-400' : handOrder !== undefined ? 'ring-amber-400' : 'ring-transparent'
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {videoTrack ? (
        videoTrack.source === Track.Source.ScreenShare && zoomable ? (
          <ScreenSharePanZoom>{video}</ScreenSharePanZoom>
        ) : video
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gray-800">
          <span className={`flex items-center justify-center rounded-full bg-gray-600 font-bold text-gray-100 ${large ? 'h-24 w-24 text-3xl' : 'h-12 w-12 text-base'}`}>
            {initials(label)}
          </span>
        </div>
      )}
      {hosting && (
        <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-md bg-blue-600/90 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
          Host
        </span>
      )}

      {handOrder !== undefined && (
        <HandBadge
          order={handOrder}
          label={`${t(onLowerHand ? 'meeting.lowerHand' : 'meeting.raiseHand')}: ${label}`}
          onLower={onLowerHand}
        />
      )}

      {trouble && (
        <SignalBars
          trouble={trouble}
          label={`${t(trouble === 'lost' ? 'meeting.connectionLost' : 'meeting.connectionPoor')}: ${label}`}
        />
      )}

      <div className="pointer-events-none absolute bottom-1.5 left-2 flex items-center gap-1.5 rounded-md bg-black/45 px-1.5 py-0.5">
        {muted && <MicOff size={13} className="text-red-300" />}
        <span className={`font-semibold text-white ${large ? 'text-sm' : 'text-xs'}`}>{label}</span>
      </div>
    </div>
  );
};

export default ParticipantTile;
