import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Participant } from 'livekit-client';
import { useGridLayout } from '../../hooks/useGridLayout';
import { ParticipantTile } from './ParticipantTile';
import { FadeIn } from './FadeIn';

/** Per-page cap keeps tiles large; the grid then auto-fits 2x2 / 3x3 / 4x4. */
const perPageForWidth = (w: number): number => (w < 640 ? 4 : w < 1024 ? 9 : 16);

interface GalleryViewProps {
  participants: Participant[];
  speaking: Set<string>;
}

export const GalleryView: React.FC<GalleryViewProps> = ({ participants, speaking }) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [perPage, setPerPage] = useState(() => perPageForWidth(typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [page, setPage] = useState(0);

  useEffect(() => {
    const onResize = () => setPerPage(perPageForWidth(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const totalPages = Math.max(1, Math.ceil(participants.length / perPage));
  const safePage = Math.min(page, totalPages - 1);
  useEffect(() => { if (page > totalPages - 1) setPage(totalPages - 1); }, [page, totalPages]);

  const pageItems = participants.slice(safePage * perPage, safePage * perPage + perPage);
  const cols = useGridLayout(gridRef, pageItems.length);
  const rows = Math.max(1, Math.ceil(pageItems.length / cols));

  return (
    <div className="flex h-full flex-col gap-2">
      <div ref={gridRef} className="min-h-0 flex-1">
        <div
          className="grid h-full w-full place-items-stretch gap-3"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {pageItems.map((p) => (
            <FadeIn key={p.sid || p.identity}>
              <ParticipantTile participant={p} speaking={speaking.has(p.identity)} />
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
