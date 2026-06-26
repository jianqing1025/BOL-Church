import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ChurchPhoto } from '../../../data';
import type { SlideshowMode } from '../types';
import { CascadeSlideshow } from './Cascade';
import { TilesShiftingSlideshow } from './TilesShifting';
import { SlidingTilesSlideshow } from './SlidingTiles';
import { CinemaWingsSlideshow } from './CinemaWings';
import { FlowDriftSlideshow } from './FlowDrift';

const MODE_LABEL: Record<SlideshowMode, string> = {
  'cascade': 'Cascade',
  'tiles-shifting': 'Tiles Shifting',
  'sliding-tiles': 'Sliding Tiles',
  'wings': 'Cinema Wings',
  'flow-drift': 'Flow Drift',
};

/** Shared keyframes for every slideshow engine (injected once). */
const SlideshowStyles = () => (
  <style>{`
    @keyframes ss-scroll-y { 0% { transform: translateY(0); } 100% { transform: translateY(-33.33%); } }
    @keyframes ss-drift-x { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
    @keyframes ss-fade { from { opacity: 0; } to { opacity: 1; } }
  `}</style>
);

export const SlideshowOverlay: React.FC<{
  mode: SlideshowMode;
  photos: ChurchPhoto[];
  onClose: () => void;
}> = ({ mode, photos, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black" onClick={onClose}>
      <SlideshowStyles />
      <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute right-6 top-6 z-[110] rounded-full bg-white/10 p-2 text-white backdrop-blur-md transition-colors hover:bg-white/25" title="Close">
        <X size={24} />
      </button>
      <div className="h-full w-full" onClick={(e) => e.stopPropagation()}>
        {mode === 'cascade' && <CascadeSlideshow photos={photos} />}
        {mode === 'tiles-shifting' && <TilesShiftingSlideshow photos={photos} />}
        {mode === 'sliding-tiles' && <SlidingTilesSlideshow photos={photos} />}
        {mode === 'wings' && <CinemaWingsSlideshow photos={photos} />}
        {mode === 'flow-drift' && <FlowDriftSlideshow photos={photos} />}
      </div>
      <div className="pointer-events-none absolute bottom-6 left-1/2 z-[110] -translate-x-1/2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white backdrop-blur-md">
        {MODE_LABEL[mode]}
      </div>
    </div>
  );
};
