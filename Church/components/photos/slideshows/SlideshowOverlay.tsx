import React, { useEffect, useRef } from 'react';
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Run once on open: lock scroll, enter native fullscreen, restore on close.
  useEffect(() => {
    const enterFullscreen = () => {
      if (document.fullscreenElement) return;
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Best-effort immediate fullscreen (works when launched with a user gesture,
    // e.g. the "Current Window" path).
    enterFullscreen();
    // A popup opened programmatically on another display has no user activation,
    // so requestFullscreen is blocked on load. Fall back to the first user gesture
    // inside the slideshow window (a single click/keypress flips it to fullscreen).
    const onGesture = () => enterFullscreen();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      document.body.style.overflow = prevOverflow;
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

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
