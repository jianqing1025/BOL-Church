import React, { useEffect } from 'react';
import type { ChurchPhoto } from '../../../data';
import type { SlideshowMode } from '../types';
import { CascadeSlideshow } from './Cascade';
import { TilesShiftingSlideshow } from './TilesShifting';
import { SlidingTilesSlideshow } from './SlidingTiles';
import { CinemaWingsSlideshow } from './CinemaWings';
import { FlowDriftSlideshow } from './FlowDrift';

/**
 * Dispatcher mirroring OurStoryHub's SlideshowOverlayRenderer (photo modes only).
 * Each engine renders its own full-screen overlay + close button.
 */
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

  if (!photos.length) return null;

  return (
    <>
      {mode === 'cascade' && <CascadeSlideshow photos={photos} onClose={onClose} />}
      {mode === 'tiles-shifting' && <TilesShiftingSlideshow photos={photos} onClose={onClose} />}
      {mode === 'sliding-tiles' && <SlidingTilesSlideshow photos={photos} onClose={onClose} />}
      {mode === 'wings' && <CinemaWingsSlideshow photos={photos} onClose={onClose} />}
      {mode === 'flow-drift' && <FlowDriftSlideshow photos={photos} onClose={onClose} />}
    </>
  );
};
