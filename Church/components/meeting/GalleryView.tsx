import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Participant } from 'livekit-client';
import { ParticipantTile } from './ParticipantTile';
import { FadeIn } from './FadeIn';
import { galleryGrid, galleryPageSize } from './galleryLayout';

interface GalleryViewProps {
  participants: Participant[];
  speaking: Set<string>;
  /** Queue positions of raised hands, by participant identity. */
  handOrders: Map<string, number>;
  /** Host only: ask a participant to put their hand down. */
  onLowerHand?: (identity: string) => void;
}

/** Until the stage has been measured, assume a landscape screen. */
const INITIAL_SIZE = { width: 1280, height: 720 };

export const GalleryView: React.FC<GalleryViewProps> = ({ participants, speaking, handOrders, onLowerHand }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(INITIAL_SIZE);
  const [page, setPage] = useState(0);

  // Measure the stage itself, not the window: opening the chat or Bible drawer
  // narrows it enough to change which layout fits, and a window listener would
  // never hear about that.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const aspect = size.width / size.height;
  const perPage = galleryPageSize(size.width, aspect);

  const totalPages = Math.max(1, Math.ceil(participants.length / perPage));
  const safePage = Math.min(page, totalPages - 1);
  useEffect(() => { if (page > totalPages - 1) setPage(totalPages - 1); }, [page, totalPages]);

  const pageItems = participants.slice(safePage * perPage, safePage * perPage + perPage);
  const { cols, rows } = galleryGrid(pageItems.length, aspect);

  return (
    <div className="flex h-full flex-col gap-2">
      <div ref={stageRef} className="min-h-0 flex-1">
        <div
          className="grid h-full w-full place-items-stretch gap-2 sm:gap-3"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {pageItems.map((p) => (
            <FadeIn key={p.sid || p.identity}>
              <ParticipantTile
                participant={p}
                speaking={speaking.has(p.identity)}
                handOrder={handOrders.get(p.identity)}
                onLowerHand={onLowerHand && (() => onLowerHand(p.identity))}
              />
            </FadeIn>
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-3 text-gray-300">
          <button
            type="button"
            onClick={() => setPage((v) => Math.max(0, v - 1))}
            disabled={safePage === 0}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
            aria-label="previous page"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs tabular-nums">{safePage + 1} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((v) => Math.min(totalPages - 1, v + 1))}
            disabled={safePage >= totalPages - 1}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
            aria-label="next page"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
};

export default GalleryView;
