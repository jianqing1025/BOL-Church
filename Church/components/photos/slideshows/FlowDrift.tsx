import React, { useMemo } from 'react';
import type { ChurchPhoto } from '../../../data';
import { photoSrc, shuffle } from './util';

/** A horizontal row of large photos drifting left, with alternating vertical offset. */
export const FlowDriftSlideshow: React.FC<{ photos: ChurchPhoto[] }> = ({ photos }) => {
  const strip = useMemo(() => {
    const safe = shuffle(photos.slice(0, 60));
    return [...safe, ...safe];
  }, [photos]);

  return (
    <div className="flex h-full w-full items-center overflow-hidden">
      <div className="flex items-center gap-6 px-6" style={{ animation: `ss-drift-x ${Math.max(30, strip.length * 3)}s linear infinite` }}>
        {strip.map((p, i) => (
          <div
            key={i}
            className="h-[70vh] w-[34vw] shrink-0 overflow-hidden rounded-2xl shadow-2xl md:w-[26vw]"
            style={{ transform: `translateY(${i % 2 === 0 ? -20 : 20}px)`, opacity: 0.92 }}
          >
            <img src={photoSrc(p)} alt="" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
};
