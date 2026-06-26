import React, { useEffect, useState } from 'react';
import type { ChurchPhoto } from '../../../data';

/** Cycles through `photos` on an interval, fading each new image in over black. */
export const CrossfadeTile: React.FC<{
  photos: ChurchPhoto[];
  interval: number;
  delay?: number;
  className?: string;
}> = ({ photos, interval, delay = 0, className = '' }) => {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (photos.length <= 1) return;
    let intervalId = 0;
    const startId = window.setTimeout(() => {
      intervalId = window.setInterval(() => setIdx((i) => (i + 1) % photos.length), interval);
    }, delay);
    return () => { window.clearTimeout(startId); window.clearInterval(intervalId); };
  }, [photos.length, interval, delay]);

  const photo = photos[idx % photos.length];
  if (!photo) return null;
  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <img key={idx} src={photo.src} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ animation: 'ss-fade 1.2s ease' }} />
    </div>
  );
};
