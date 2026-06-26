import React, { useMemo } from 'react';
import type { ChurchPhoto } from '../../../data';
import { CrossfadeTile } from './CrossfadeTile';
import { shuffle } from './util';

/** A 3×3 grid of tiles, each independently cross-fading through its own subset. */
export const TilesShiftingSlideshow: React.FC<{ photos: ChurchPhoto[] }> = ({ photos }) => {
  const groups = useMemo(() => {
    const safe = shuffle(photos.slice(0, 120));
    const n = 9;
    return Array.from({ length: n }, (_, i) => safe.filter((_, k) => k % n === i));
  }, [photos]);

  return (
    <div className="grid h-full w-full grid-cols-2 gap-2 p-3 sm:grid-cols-3">
      {groups.map((g, i) => (
        <CrossfadeTile key={i} photos={g.length ? g : photos.slice(0, 1)} interval={3000} delay={i * 280} className="rounded-xl shadow-xl" />
      ))}
    </div>
  );
};
