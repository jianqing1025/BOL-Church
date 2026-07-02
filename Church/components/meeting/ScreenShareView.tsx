import React from 'react';
import { MonitorUp } from 'lucide-react';
import type { Participant } from 'livekit-client';
import { useLocalization } from '../../hooks/useLocalization';
import { ParticipantTile } from './ParticipantTile';

interface ScreenShareViewProps {
  sharer: Participant;
  others: Participant[];
  speaking: Set<string>;
  /** Identity of a participant pinned into the main area, or null for the screen. */
  pinnedId: string | null;
  onPin: (id: string | null) => void;
}

/**
 * Shared screen fills ~80% of the stage; participants sit in a thumbnail rail
 * (right on desktop, bottom on mobile). Clicking a thumbnail pins that person
 * into the main area; the screen thumbnail switches back.
 */
export const ScreenShareView: React.FC<ScreenShareViewProps> = ({ sharer, others, speaking, pinnedId, onPin }) => {
  const { t } = useLocalization();
  const pinned = pinnedId ? others.find((p) => p.identity === pinnedId) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:flex-row">
      <div className="min-h-0 flex-1">
        {pinned
          ? <ParticipantTile participant={pinned} speaking={speaking.has(pinned.identity)} large />
          : <ParticipantTile participant={sharer} fit="contain" zoomable large />}
      </div>

      <div className="flex shrink-0 gap-2 overflow-x-auto md:w-44 md:flex-col md:overflow-x-visible md:overflow-y-auto">
        {/* Screen thumbnail — click to return to the shared screen. */}
        <button
          type="button"
          onClick={() => onPin(null)}
          aria-label={t('meeting.backToShare')}
          className={`relative flex aspect-video w-28 shrink-0 items-center justify-center rounded-2xl bg-gray-800 text-gray-300 ring-2 transition-colors md:w-full ${
            pinnedId ? 'ring-transparent hover:bg-gray-700' : 'ring-blue-400'
          }`}
        >
          <MonitorUp size={22} />
        </button>
        {others.map((p) => (
          <div key={p.sid || p.identity} className="aspect-video w-28 shrink-0 md:w-full">
            <ParticipantTile
              participant={p}
              speaking={speaking.has(p.identity)}
              onClick={() => onPin(p.identity)}
              className={pinnedId === p.identity ? 'ring-blue-400' : ''}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScreenShareView;
