import React, { useEffect, useRef } from 'react';
import { MicOff } from 'lucide-react';
import { Track, type Participant } from 'livekit-client';
import { LiveKitService } from '../../services/livekitService';
import { ScreenSharePanZoom } from './ScreenSharePanZoom';

const initials = (label: string): string => label.trim().slice(0, 2).toUpperCase() || '?';

/**
 * One <audio> element per remote audio track. A participant can publish more
 * than one — their microphone plus the soundtrack of a video they are playing
 * for the room — and attaching them all is what keeps a broadcast video from
 * arriving silently.
 */
const TrackAudio: React.FC<{ track: Track }> = ({ track }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => { try { track.detach(el); } catch { /* ignore */ } };
  }, [track]);
  return <audio ref={ref} autoPlay />;
};

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
  onClick?: () => void;
  className?: string;
}

/**
 * One participant's video, with audio playback, an initials avatar when the
 * camera is off, a name label, mic-muted indicator, and an active-speaker ring.
 * Recomputes the tracks each render because LiveKit mutates participant objects
 * in place — the attach effects key on the track so they re-run on publish.
 */
export const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant, speaking, fit = 'cover', zoomable, large, onClick, className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoTrack = LiveKitService.videoTrack(participant);
  const audioTracks = LiveKitService.audioTracks(participant);
  const label = participant.name || participant.identity;
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
        speaking ? 'ring-blue-400' : 'ring-transparent'
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
      {audioTracks.map((track) => <TrackAudio key={track.sid ?? track.mediaStreamID} track={track} />)}

      <div className="pointer-events-none absolute bottom-1.5 left-2 flex items-center gap-1.5 rounded-md bg-black/45 px-1.5 py-0.5">
        {muted && <MicOff size={13} className="text-red-300" />}
        <span className={`font-semibold text-white ${large ? 'text-sm' : 'text-xs'}`}>{label}</span>
      </div>
    </div>
  );
};

export default ParticipantTile;
