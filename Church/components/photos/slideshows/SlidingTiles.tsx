import React, { useMemo } from 'react';
import type { ChurchPhoto } from '../../../data';
import { photoSrc, shuffle } from './util';

/** A continuous filmstrip of portrait tiles sliding horizontally. */
export const SlidingTilesSlideshow: React.FC<{ photos: ChurchPhoto[] }> = ({ photos }) => {
  const strip = useMemo(() => {
    const safe = shuffle(photos.slice(0, 80));
    return [...safe, ...safe];
  }, [photos]);

  return (
    <div className="flex h-full w-full items-center overflow-hidden">
      <div className="flex h-[82vh] items-center gap-3 px-3" style={{ animation: `ss-drift-x ${Math.max(30, strip.length * 2.2)}s linear infinite` }}>
        {strip.map((p, i) => (
          <div key={i} className="h-full w-[22vw] shrink-0 overflow-hidden rounded-xl bg-white/5 shadow-2xl md:w-[16vw]">
            <img src={photoSrc(p)} alt="" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
};
