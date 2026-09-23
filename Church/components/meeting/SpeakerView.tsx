import React from 'react';
import type { Participant } from 'livekit-client';
import { ParticipantTile } from './ParticipantTile';
import { FadeIn } from './FadeIn';

interface SpeakerViewProps {
  featured: Participant;
  others: Participant[];
  speaking: Set<string>;
  onSelect: (p: Participant) => void;
  /** Queue positions of raised hands, by participant identity. */
  handOrders: Map<string, number>;
  /** Host only: ask a participant to put their hand down. */
  onLowerHand?: (identity: string) => void;
}

/** Active speaker enlarged; the rest as a thumbnail strip along the bottom. */
export const SpeakerView: React.FC<SpeakerViewProps> = ({ featured, others, speaking, handOrders, onLowerHand, onSelect }) => (
  <div className="flex h-full min-h-0 flex-col gap-3">
    <div className="min-h-0 flex-1">
      {/* Keyed so a speaker change fades the new tile in. */}
      <FadeIn key={featured.sid || featured.identity}>
        <ParticipantTile
          participant={featured}
          speaking={speaking.has(featured.identity)}
          handOrder={handOrders.get(featured.identity)}
          onLowerHand={onLowerHand && (() => onLowerHand(featured.identity))}
          large
        />
      </FadeIn>
    </div>
    {others.length > 0 && (
      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
        {others.map((p) => (
          <div key={p.sid || p.identity} className="aspect-video w-28 shrink-0 sm:w-36">
            <ParticipantTile
              participant={p}
              speaking={speaking.has(p.identity)}
              handOrder={handOrders.get(p.identity)}
              onLowerHand={onLowerHand && (() => onLowerHand(p.identity))}
              onClick={() => onSelect(p)}
            />
          </div>
        ))}
      </div>
    )}
  </div>
);

export default SpeakerView;
