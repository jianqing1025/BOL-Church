import React, { useMemo } from 'react';
import type { ChurchPhoto } from '../../../data';
import { CrossfadeTile } from './CrossfadeTile';
import { shuffle } from './util';

/** Large center stage cross-fading, flanked by two columns of smaller wings. */
export const CinemaWingsSlideshow: React.FC<{ photos: ChurchPhoto[] }> = ({ photos }) => {
  const { center, left, right } = useMemo(() => {
    const s = shuffle(photos.slice(0, 90));
    const pick = (mod: number) => s.filter((_, i) => i % 5 === mod);
    return {
      center: pick(0).length ? pick(0) : s,
      left: [1, 2].map(pick),
      right: [3, 4].map(pick),
    };
  }, [photos]);

  return (
    <div className="grid h-full w-full grid-cols-[0.5fr_1.6fr_0.5fr] items-center gap-3 p-3">
      <div className="hidden h-[84vh] flex-col gap-3 md:flex">
        {left.map((g, i) => <CrossfadeTile key={i} photos={g.length ? g : center} interval={4200} delay={i * 500} className="min-h-0 flex-1 rounded-lg opacity-70" />)}
      </div>
      <CrossfadeTile photos={center} interval={3500} className="col-span-3 h-[84vh] rounded-2xl shadow-2xl md:col-span-1" />
      <div className="hidden h-[84vh] flex-col gap-3 md:flex">
        {right.map((g, i) => <CrossfadeTile key={i} photos={g.length ? g : center} interval={4200} delay={i * 500 + 250} className="min-h-0 flex-1 rounded-lg opacity-70" />)}
      </div>
    </div>
  );
};
