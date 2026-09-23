import React, { useEffect, useState } from 'react';
import { Video as VideoIcon, RotateCcw } from 'lucide-react';
import type { Participant } from 'livekit-client';
import { LiveKitService } from '../../services/livekitService';
import { handOrders, orderByRaisedHand } from '../../meeting/raisedHands';
import { useLocalization } from '../../hooks/useLocalization';
import { GalleryView } from './GalleryView';
import { SpeakerView } from './SpeakerView';
import { ScreenShareView } from './ScreenShareView';
import { SelfViewPiP } from './SelfViewPiP';
import { RoomVideoView } from './RoomVideoView';
import type { RoomVideo } from '../../hooks/useRoomVideo';
import { RoomAudio } from './RoomAudio';

export type ViewMode = 'gallery' | 'speaker';

interface VideoStageProps {
  participants: Participant[];
  activeSpeakerIds: string[];
  viewMode: ViewMode;
  /** Host only: hand badges become buttons that put a hand down. */
  isHost: boolean;
  onLowerHand: (identity: string) => void;
  /** The YouTube video the room is watching together, if any. */
  roomVideo: RoomVideo;
  connecting: boolean;
  error: string;
  onRetry: () => void;
  /** Ask for the camera and mic again from this button's own press. */
  onRetryMedia: () => void;
}

/**
 * Google-Meet-style stage. Chooses the layout automatically: a shared screen
 * takes over; otherwise Gallery (default) or Speaker view. The local participant
 * is excluded from the main layout and shown as a floating self-view instead.
 */
export const VideoStage: React.FC<VideoStageProps> = ({
  participants, activeSpeakerIds, viewMode, isHost, onLowerHand, roomVideo, connecting, error, onRetry, onRetryMedia,
}) => {
  const { t } = useLocalization();
  // Raised hands first, so the six tiles a phone can fit are the six that
  // matter. Every layout below draws a subset; this decides which subset.
  const ordered = orderByRaisedHand(participants);
  const hands = handOrders(participants);
  const lowerHand = isHost ? onLowerHand : undefined;
  const local = ordered.find((p) => p.isLocal);
  const remotes = ordered.filter((p) => !p.isLocal);
  const sharer = ordered.find((p) => LiveKitService.isScreenSharing(p));
  const speaking = new Set(activeSpeakerIds);

  // Track the featured speaker (speaker view) with a preference for the current
  // dominant remote speaker, falling back to the previous / first participant.
  const remoteIds = remotes.map((r) => r.identity).join(',');
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  useEffect(() => {
    const ids = remoteIds ? remoteIds.split(',') : [];
    const active = activeSpeakerIds.find((id) => ids.includes(id));
    setFeaturedId((prev) => (active || (prev && ids.includes(prev) ? prev : ids[0]) || null));
  }, [activeSpeakerIds, remoteIds]);

  // Pin a participant into the main area while someone is screen sharing.
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  useEffect(() => { if (!sharer) setPinnedId(null); }, [sharer]);

  // Not connected yet: connecting spinner / retry button / error.
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

  const featured = remotes.find((r) => r.identity === featuredId) ?? remotes[0];
  // A shared screen and a room video should never both be on — claiming the
  // slot closes the other — but if they somehow are, the live screen wins.
  const watching = !sharer && roomVideo.videoId !== null;
  const speakerMode = !sharer && !watching && viewMode === 'speaker' && !!featured;

  let main: React.ReactNode;
  if (sharer) {
    // Screen fills the stage; every other video (including self) sits on the rail.
    main = (
      <ScreenShareView
        sharer={sharer}
        others={ordered.filter((p) => p !== sharer)}
        speaking={speaking}
        handOrders={hands}
        onLowerHand={lowerHand}
        pinnedId={pinnedId}
        onPin={setPinnedId}
      />
    );
  } else if (watching && roomVideo.videoId) {
    main = (
      <RoomVideoView
        videoId={roomVideo.videoId}
        startSeconds={roomVideo.startSeconds}
        leader={roomVideo.leader}
        canLead={roomVideo.canLead}
        onReport={roomVideo.report}
        participants={ordered}
        speaking={speaking}
        handOrders={hands}
        onLowerHand={lowerHand}
      />
    );
  } else if (speakerMode) {
    main = (
      <SpeakerView
        featured={featured}
        others={remotes.filter((p) => p !== featured)}
        speaking={speaking}
        handOrders={hands}
        onLowerHand={lowerHand}
        onSelect={(p) => setFeaturedId(p.identity)}
      />
    );
  } else {
    // Gallery shows everyone, including yourself, with fixed per-count grids.
    main = <GalleryView participants={ordered} speaking={speaking} handOrders={hands} onLowerHand={lowerHand} />;
  }

  return (
    <div className="relative h-full min-h-0">
      {/* Outside {main} on purpose: every layout below draws a different subset
          of the room, and none of them may decide who is audible. */}
      <RoomAudio participants={participants} />
      {main}
      {/* Camera/mic trouble happens after joining, when the stage is already
          showing participants — without this banner the failure is invisible. */}
      {error && (
        <div className="absolute inset-x-2 top-2 z-20 flex flex-wrap items-center justify-center gap-2 rounded-lg bg-red-950/90 px-3 py-2 text-center ring-1 ring-red-500/40">
          <p className="text-sm text-red-100">{error}</p>
          <button
            type="button"
            onClick={onRetryMedia}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-bold text-red-900 transition-colors hover:bg-red-100"
          >
            <RotateCcw size={13} />
            {t('meeting.retryMedia')}
          </button>
        </div>
      )}
      {/* Floating self-view only in speaker mode; in gallery/screen you are a tile. */}
      {speakerMode && local && <SelfViewPiP participant={local} handOrder={hands.get(local.identity)} />}
    </div>
  );
};

export default VideoStage;
