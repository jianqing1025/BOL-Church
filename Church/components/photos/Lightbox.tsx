import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Heart, Info, X } from 'lucide-react';
import type { ChurchPhoto } from '../../data';
import { useLocalization } from '../../hooks/useLocalization';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const fmtBytes = (b: number): string => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

interface LightboxProps {
  photos: ChurchPhoto[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
  onDownload: (photo: ChurchPhoto) => void;
}

/** Faithful port of OurStoryHub Lightbox (zoom / pan / swipe / dots) plus a
 *  blurred backdrop of the current photo (background mask) and EXIF panel. */
export const Lightbox: React.FC<LightboxProps> = ({ photos, index, onClose, onNavigate, isFavorite, onToggleFavorite, onDownload }) => {
  const { t } = useLocalization();
  const [internalIndex, setInternalIndex] = useState(index);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const didSwipe = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

  const constrainOffset = useCallback((nextOffset: { x: number; y: number }, nextZoom = zoom) => {
    const viewport = viewportRef.current;
    if (!viewport || !naturalSize.width || !naturalSize.height) return nextOffset;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!vw || !vh) return nextOffset;
    const fitScale = Math.min(vw / naturalSize.width, vh / naturalSize.height);
    const scaledWidth = naturalSize.width * fitScale * nextZoom;
    const scaledHeight = naturalSize.height * fitScale * nextZoom;
    const limitX = Math.max(0, (scaledWidth - vw) / 2);
    const limitY = Math.max(0, (scaledHeight - vh) / 2);
    return { x: clamp(nextOffset.x, -limitX, limitX), y: clamp(nextOffset.y, -limitY, limitY) };
  }, [naturalSize.height, naturalSize.width, zoom]);

  const resetViewport = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setIsDraggingImage(false);
    dragStartRef.current = null;
  }, []);

  useEffect(() => { setInternalIndex(Math.max(0, Math.min(index, Math.max(photos.length - 1, 0)))); }, [index, photos.length]);
  useEffect(() => { resetViewport(); }, [internalIndex, resetViewport]);
  useEffect(() => {
    const handleResize = () => setOffset((prev) => constrainOffset(prev));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [constrainOffset]);

  const goNext = useCallback(() => setInternalIndex((p) => { const n = (p + 1) % photos.length; onNavigate(n); return n; }), [photos.length, onNavigate]);
  const goPrev = useCallback(() => setInternalIndex((p) => { const n = (p - 1 + photos.length) % photos.length; onNavigate(n); return n; }), [photos.length, onNavigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (zoom <= 1.001 && e.key === 'ArrowRight') goNext();
      if (zoom <= 1.001 && e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, onClose, zoom]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; didSwipe.current = false; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) { didSwipe.current = true; if (delta < 0) goNext(); else goPrev(); }
    touchStartX.current = null;
  };
  const handleBackdropClick = () => { if (didSwipe.current) { didSwipe.current = false; return; } onClose(); };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const viewport = viewportRef.current;
    if (!viewport || !naturalSize.width || !naturalSize.height) return;
    const rect = viewport.getBoundingClientRect();
    const cursorX = e.clientX - rect.left - rect.width / 2;
    const cursorY = e.clientY - rect.top - rect.height / 2;
    const direction = e.deltaY < 0 ? 1 : -1;
    const nextZoom = clamp(Number((zoom + direction * ZOOM_STEP).toFixed(3)), MIN_ZOOM, MAX_ZOOM);
    if (nextZoom === zoom) return;
    const zoomRatio = nextZoom / zoom;
    const nextOffset = constrainOffset({ x: (offset.x - cursorX) * zoomRatio + cursorX, y: (offset.y - cursorY) * zoomRatio + cursorY }, nextZoom);
    setZoom(nextZoom);
    setOffset(nextZoom <= 1 ? { x: 0, y: 0 } : nextOffset);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragStartRef.current = { x: e.clientX, y: e.clientY, originX: offset.x, originY: offset.y };
    setIsDraggingImage(true);
    didSwipe.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStartRef.current;
    if (!drag || zoom <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    setOffset(constrainOffset({ x: drag.originX + (e.clientX - drag.x), y: drag.originY + (e.clientY - drag.y) }));
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    e.stopPropagation();
    dragStartRef.current = null;
    setIsDraggingImage(false);
    window.setTimeout(() => { didSwipe.current = false; }, 0);
  };

  const photo = photos[internalIndex];
  if (!photo) return null;
  const fav = isFavorite(photo.id);
  const exif = photo.exif;
  const infoRows = (
    [
      photo.uploaderName ? [t('photosPage.uploadedBy'), photo.uploaderName] : null,
      photo.shotAt ? ['Shot At', new Date(photo.shotAt).toLocaleString()] : null,
      exif?.camera ? ['Camera', exif.camera] : null,
      exif?.lens ? ['Lens', exif.lens] : null,
      exif?.focalLength ? ['Focal', exif.focalLength] : null,
      exif?.aperture ? ['Aperture', exif.aperture] : null,
      exif?.shutter ? ['Shutter', exif.shutter] : null,
      exif?.iso != null ? ['ISO', String(exif.iso)] : null,
      photo.width && photo.height ? ['Pixels', `${photo.width}×${photo.height}`] : null,
      photo.sizeBytes != null ? ['Size', fmtBytes(photo.sizeBytes)] : null,
    ] as ([string, string] | null)[]
  ).filter((r): r is [string, string] => r !== null);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black animate-fadeIn" onClick={handleBackdropClick} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Blurred backdrop (background mask) */}
      <div className="absolute inset-0 z-0 scale-110 transition-all duration-500" style={{ backgroundImage: `url(${photo.thumbSrc || photo.src})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) brightness(0.35)' }} />
      <div className="absolute inset-0 z-0 bg-black/40" />

      <div className="absolute right-4 top-4 z-50 flex items-center gap-3">
        <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(photo.id); }} title={t('photosPage.favorite')} className={`rounded-full p-2.5 transition-all ${fav ? 'bg-rose-500 text-white shadow-lg hover:bg-rose-600' : 'bg-black/30 text-white/70 hover:bg-black/50 hover:text-white'}`}>
          <Heart size={22} className={fav ? 'fill-current' : ''} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDownload(photo); }} title={t('photosPage.download')} className="rounded-full bg-black/30 p-2.5 text-white/70 transition-colors hover:bg-black/50 hover:text-white">
          <Download size={20} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); setShowInfo((v) => !v); }} title={t('photosPage.info')} className={`rounded-full p-2.5 transition-all ${showInfo ? 'bg-white text-gray-900' : 'bg-black/30 text-white/70 hover:bg-black/50 hover:text-white'}`}>
          <Info size={20} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} title={t('photosPage.close')} className="rounded-full bg-black/30 p-2.5 text-white/70 transition-colors hover:bg-black/60 hover:text-white">
          <X size={24} />
        </button>
      </div>

      <button onClick={(e) => { e.stopPropagation(); goPrev(); }} className="absolute left-4 z-40 hidden p-4 text-white/70 hover:text-white md:block"><ChevronLeft size={48} /></button>
      <button onClick={(e) => { e.stopPropagation(); goNext(); }} className="absolute right-4 z-40 hidden p-4 text-white/70 hover:text-white md:block"><ChevronRight size={48} /></button>

      <div
        ref={viewportRef}
        className="relative z-10 h-full w-full touch-none overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ cursor: zoom > 1 ? (isDraggingImage ? 'grabbing' : 'grab') : 'default' }}
      >
        <img
          src={photo.src}
          alt={photo.title || t('photosPage.photoAlt')}
          className="absolute inset-0 h-full w-full select-none object-contain shadow-2xl"
          onLoad={(e) => setNaturalSize({ width: e.currentTarget.naturalWidth || 0, height: e.currentTarget.naturalHeight || 0 })}
          draggable={false}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: 'center center', transition: isDraggingImage ? 'none' : 'transform 120ms ease-out' }}
        />
      </div>

      {showInfo && infoRows.length > 0 && (
        <div className="absolute bottom-16 left-1/2 z-20 w-[min(92vw,520px)] -translate-x-1/2 rounded-xl border border-white/10 bg-black/60 px-5 py-3 backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-1 gap-y-1">
            {infoRows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-x-2">
                <span className="text-[9px] uppercase tracking-wide text-white/45">{label}</span>
                <span className="whitespace-normal break-words text-[11px] font-medium leading-snug text-white/90">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-6 left-0 z-10 w-full px-4 text-center text-sm font-medium text-white/70 drop-shadow-md">
        {photo.title}
      </div>

      {photos.length > 1 && (
        <div className="pointer-events-none absolute bottom-14 left-0 z-10 flex w-full justify-center gap-1.5 md:hidden">
          {photos.length <= 20 && photos.map((_, i) => (
            <div key={i} className={`rounded-full transition-all ${i === internalIndex ? 'h-1.5 w-4 bg-white/80' : 'h-1.5 w-1.5 bg-white/30'}`} />
          ))}
        </div>
      )}
    </div>
  );
};
