import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Participant } from 'livekit-client';
import { ParticipantTile } from './ParticipantTile';
import { FadeIn } from './FadeIn';

/** Fixed arrangement per head-count: 2→side-by-side, 3→row, 4→2x2, 6→3x2, 8→4x2. */
const gridFor = (n: number): { cols: number; rows: number } => {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 3) return { cols: 3, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  if (n <= 8) return { cols: 4, rows: 2 };
  if (n === 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: Math.ceil(n / 4) };
};

/** Per-page cap keeps tiles large on smaller screens; larger meetings paginate. */
const perPageForWidth = (w: number): number => (w < 640 ? 4 : w < 1024 ? 9 : 16);

interface GalleryViewProps {
  participants: Participant[];
  speaking: Set<string>;
}

export const GalleryView: React.FC<GalleryViewProps> = ({ participants, speaking }) => {
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
  const { cols, rows } = gridFor(pageItems.length);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="min-h-0 flex-1">
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
