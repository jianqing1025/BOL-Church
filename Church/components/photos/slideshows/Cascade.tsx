import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { ChurchPhoto } from '../../../data';
import { imgUrl, shuffle } from './util';

/** Faithful port of OurStoryHub PhotoTileSlideshow (cascade): 5 columns scrolling
 *  vertically in alternating directions, seamless loop. */
export const CascadeSlideshow = ({ photos, onClose }: { photos: ChurchPhoto[]; onClose: () => void }) => {
  const cols = 5;
  const [columns, setColumns] = useState<ChurchPhoto[][]>([]);

  useEffect(() => {
    const safeData = photos.slice(0, 100);
    const shuffled = shuffle([...safeData, ...safeData]);
    const newCols: ChurchPhoto[][] = Array.from({ length: cols }, () => []);
    shuffled.forEach((item, i) => { newCols[i % cols].push(item); });
    setColumns(newCols);
  }, [photos]);

  return (
    <div className="fixed inset-0 z-[100] flex gap-2 overflow-hidden bg-black p-2 animate-fadeIn">
      <button onClick={onClose} className="absolute right-6 top-6 z-[110] rounded-full bg-black/20 p-2 text-white backdrop-blur-md transition-colors hover:bg-rose-500"><X size={24} /></button>
      {columns.map((col, i) => (
        <div key={i} className="flex flex-1 flex-col gap-2 animate-cascade-y" style={{ animationDuration: `${30 + i * 5}s`, animationDirection: i % 2 === 0 ? 'normal' : 'reverse' }}>
          {[...col, ...col, ...col].map((img, idx) => (
            <div key={`${i}-${idx}`} className="relative aspect-[3/4] w-full shrink-0 overflow-hidden rounded-lg bg-gray-900">
              <img src={imgUrl(img, 'grid')} className="h-full w-full object-cover opacity-80 transition-opacity hover:opacity-100" alt="" />
            </div>
          ))}
        </div>
      ))}
      <style>{`
        @keyframes cascadeScrollY { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
        .animate-cascade-y { animation-name: cascadeScrollY; animation-timing-function: linear; animation-iteration-count: infinite; }
      `}</style>
    </div>
  );
};
