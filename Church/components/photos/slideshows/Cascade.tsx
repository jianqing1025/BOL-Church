import React, { useMemo } from 'react';
import type { ChurchPhoto } from '../../../data';
import { intoColumns, photoSrc, shuffle } from './util';

/** Vertical scrolling columns (alternating direction), seamless loop. */
export const CascadeSlideshow: React.FC<{ photos: ChurchPhoto[] }> = ({ photos }) => {
  const cols = 5;
  const columns = useMemo(() => {
    const safe = photos.slice(0, 100);
    return intoColumns(shuffle([...safe, ...safe]), cols);
  }, [photos]);

  return (
    <div className="flex h-full w-full gap-2 overflow-hidden p-2">
      {columns.map((col, i) => (
        <div
          key={i}
          className="flex flex-1 flex-col gap-2"
          style={{ animation: `ss-scroll-y ${30 + i * 5}s linear infinite`, animationDirection: i % 2 === 0 ? 'normal' : 'reverse' }}
        >
          {[...col, ...col, ...col].map((p, idx) => (
            <div key={`${i}-${idx}`} className="aspect-[3/4] w-full shrink-0 overflow-hidden rounded-lg bg-gray-900">
              <img src={photoSrc(p)} alt="" className="h-full w-full object-cover opacity-80 transition-opacity hover:opacity-100" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
