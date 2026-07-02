import React, { useEffect, useState } from 'react';
import { Video as VideoIcon } from 'lucide-react';
import type { Participant } from 'livekit-client';
import { LiveKitService } from '../../services/livekitService';
import { useLocalization } from '../../hooks/useLocalization';
import { GalleryView } from './GalleryView';
import { SpeakerView } from './SpeakerView';
import { ScreenShareView } from './ScreenShareView';
import { SelfViewPiP } from './SelfViewPiP';

export type ViewMode = 'gallery' | 'speaker';

interface VideoStageProps {
  participants: Participant[];
  activeSpeakerIds: string[];
  viewMode: ViewMode;
  connecting: boolean;
  error: string;
  onRetry: () => void;
}

/**
 * Google-Meet-style stage. Chooses the layout automatically: a shared screen
 * takes over; otherwise Gallery (default) or Speaker view. The local participant
 * is excluded from the main layout and shown as a floating self-view instead.
 */
export const VideoStage: React.FC<VideoStageProps> = ({
  participants, activeSpeakerIds, viewMode, connecting, error, onRetry,
}) => {
  const { t } = useLocalization();
  const local = participants.find((p) => p.isLocal);
  const remotes = participants.filter((p) => !p.isLocal);
  const sharer = participants.find((p) => LiveKitService.isScreenSharing(p));
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
  const speakerMode = !sharer && viewMode === 'speaker' && !!featured;

  let main: React.ReactNode;
  if (sharer) {
    // Screen fills the stage; every other video (including self) sits on the rail.
    main = (
      <ScreenShareView
        sharer={sharer}
        others={participants.filter((p) => p !== sharer)}
        speaking={speaking}
        pinnedId={pinnedId}
        onPin={setPinnedId}
      />
    );
  } else if (speakerMode) {
    main = (
      <SpeakerView
        featured={featured}
        others={remotes.filter((p) => p !== featured)}
        speaking={speaking}
        onSelect={(p) => setFeaturedId(p.identity)}
      />
    );
  } else {
    // Gallery shows everyone, including yourself, with fixed per-count grids.
    main = <GalleryView participants={participants} speaking={speaking} />;
  }

  return (
    <div className="relative h-full min-h-0">
      {main}
      {/* Floating self-view only in speaker mode; in gallery/screen you are a tile. */}
      {speakerMode && local && <SelfViewPiP participant={local} />}
    </div>
  );
};

export default VideoStage;
