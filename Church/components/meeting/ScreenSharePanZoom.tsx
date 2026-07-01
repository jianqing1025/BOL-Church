import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const MIN_SCALE = 1;
const MAX_SCALE = 5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const touchDist = (t: React.TouchList) =>
  Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

/**
 * Wraps a screen-share video so it can be zoomed (pinch / wheel / buttons) and
 * dragged (touch or mouse) when zoomed in. Defaults to fit-the-whole-screen so
 * nothing is cropped on narrow (mobile) viewports.
 */
export const ScreenSharePanZoom: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const scaleRef = useRef(1);
  const gesture = useRef({ mode: 'none' as 'none' | 'pan' | 'pinch', x: 0, y: 0, dist: 0 }).current;

  useEffect(() => { scaleRef.current = scale; }, [scale]);

  const zoomBy = (ratio: number) => setScale((s) => {
    const next = clamp(s * ratio, MIN_SCALE, MAX_SCALE);
    if (next === 1) { setTx(0); setTy(0); }
    return next;
  });
  const reset = () => { setScale(1); setTx(0); setTy(0); };
  const panBy = (dx: number, dy: number) => {
    if (scaleRef.current <= 1) return;
    setTx((v) => v + dx);
    setTy((v) => v + dy);
  };

  const onWheel = (e: React.WheelEvent) => zoomBy(e.deltaY < 0 ? 1.1 : 0.9);

  // Mouse drag (pointer events; touch is handled by the touch* handlers below).
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    gesture.mode = 'pan'; gesture.x = e.clientX; gesture.y = e.clientY;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || gesture.mode !== 'pan') return;
    panBy(e.clientX - gesture.x, e.clientY - gesture.y);
    gesture.x = e.clientX; gesture.y = e.clientY;
  };
  const endPointer = (e: React.PointerEvent) => { if (e.pointerType !== 'touch') gesture.mode = 'none'; };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length >= 2) { gesture.mode = 'pinch'; gesture.dist = touchDist(e.touches); }
    else { gesture.mode = 'pan'; gesture.x = e.touches[0].clientX; gesture.y = e.touches[0].clientY; }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (gesture.mode === 'pinch' && e.touches.length >= 2) {
      const d = touchDist(e.touches);
      if (gesture.dist > 0) zoomBy(d / gesture.dist);
      gesture.dist = d;
    } else if (gesture.mode === 'pan' && e.touches.length === 1) {
      const tt = e.touches[0];
      panBy(tt.clientX - gesture.x, tt.clientY - gesture.y);
      gesture.x = tt.clientX; gesture.y = tt.clientY;
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) { gesture.mode = 'none'; return; }
    gesture.mode = 'pan'; gesture.x = e.touches[0].clientX; gesture.y = e.touches[0].clientY;
  };

  const btn = 'flex h-8 w-8 items-center justify-center rounded-md bg-black/50 text-white hover:bg-black/70';

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ touchAction: 'none' }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={reset}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="h-full w-full origin-center will-change-transform"
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'default' }}
      >
        {children}
      </div>
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <button type="button" className={btn} aria-label="zoom in" onClick={() => zoomBy(1.25)}><ZoomIn size={16} /></button>
        <button type="button" className={btn} aria-label="zoom out" onClick={() => zoomBy(0.8)}><ZoomOut size={16} /></button>
        <button type="button" className={btn} aria-label="reset zoom" onClick={reset}><Maximize2 size={16} /></button>
      </div>
    </div>
  );
};

export default ScreenSharePanZoom;
