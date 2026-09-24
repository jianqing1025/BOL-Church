import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Video as VideoIcon, RotateCcw } from 'lucide-react';
import type { Participant } from 'livekit-client';
import { LiveKitService } from '../../services/livekitService';
import { handOrders, orderByRaisedHand } from '../../meeting/raisedHands';
import { useTimedNotice } from '../../hooks/useTimedNotice';
import { useLocalization } from '../../hooks/useLocalization';
import { GalleryView } from './GalleryView';
import { SpeakerView } from './SpeakerView';
import { ScreenShareView } from './ScreenShareView';
import { SelfViewPiP } from './SelfViewPiP';
import { RoomVideoView } from './RoomVideoView';
import { emptySpeakerFocus, nextSpeakerFocus, SPEAKER_TICK_MS, type SpeakerFocus } from './speakerFocus';
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
  /** The meeting dropped and is rejoining by itself. */
  reconnecting?: boolean;
  error: string;
  /** Bumped on every report, so the banner reappears for a repeated error. */
  errorSeq: number;
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
  participants, activeSpeakerIds, viewMode, isHost, onLowerHand, roomVideo, connecting, reconnecting = false, error, errorSeq, onRetry, onRetryMedia,
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

  // Who is on the big tile in speaker view. Re-evaluated on a short timer as
  // well as on every speaker change, because the rule is about how long
  // somebody has been talking — see speakerFocus for why both are needed.
  const remoteIds = remotes.map((r) => r.identity).join(',');
  const [focus, setFocus] = useState<SpeakerFocus>(emptySpeakerFocus);
  const activeRef = useRef(activeSpeakerIds);
  activeRef.current = activeSpeakerIds;
  const remoteIdsRef = useRef(remoteIds);
  remoteIdsRef.current = remoteIds;

  useEffect(() => {
    const evaluate = () => setFocus((prev) => nextSpeakerFocus(prev, {
      activeIds: activeRef.current,
      presentIds: remoteIdsRef.current ? remoteIdsRef.current.split(',') : [],
      now: Date.now(),
    }));
    evaluate();
    const id = window.setInterval(evaluate, SPEAKER_TICK_MS);
    return () => window.clearInterval(id);
  }, [activeSpeakerIds, remoteIds]);

  const featuredId = focus.featuredId;
  const setFeaturedId = useCallback((identity: string) => {
    // Picking somebody from the strip is a deliberate choice; it takes effect
    // at once and then the rule carries on from there.
    setFocus((prev) => ({ ...prev, featuredId: identity, candidateId: null }));
  }, []);

  // Pin a participant into the main area while someone is screen sharing.
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  useEffect(() => { if (!sharer) setPinnedId(null); }, [sharer]);

  // The banner sits over people's faces, so it says its piece and goes.
  const showError = useTimedNotice(error ? `${errorSeq}:${error}` : null);

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
      {showError && (
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
      {reconnecting && (
        <div className="absolute inset-x-0 top-2 z-30 flex justify-center" role="status">
          <div className="flex items-center gap-2 rounded-full bg-amber-500/95 px-4 py-1.5 text-sm font-semibold text-gray-900 shadow-lg">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-900/30 border-t-gray-900" />
            {t('meeting.reconnecting')}
          </div>
        </div>
      )}
      {/* Floating self-view only in speaker mode; in gallery/screen you are a tile. */}
      {speakerMode && local && <SelfViewPiP participant={local} handOrder={hands.get(local.identity)} />}
    </div>
  );
};

export default VideoStage;
