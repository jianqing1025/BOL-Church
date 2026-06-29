
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Heart, FolderInput, Trash2 } from 'lucide-react';
import { GalleryItem, VideoItem } from '../../types';
import { getOptimizedUrl } from '../../utils';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const Lightbox = ({
    images,
    currentIndex,
    onClose,
    onToggleFavorite,
    favorites,
    onMoveCurrent,
    onDeleteCurrent,
    actionBusy = false,
}: {
    images: GalleryItem[],
    currentIndex: number,
    onClose: () => void,
    onToggleFavorite?: (id: string) => void,
    favorites?: Set<string>,
    onMoveCurrent?: (image: GalleryItem, index: number) => void,
    onDeleteCurrent?: (image: GalleryItem, index: number) => void,
    actionBusy?: boolean,
}) => {
    const [internalIndex, setInternalIndex] = useState(currentIndex);
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
    const [isDraggingImage, setIsDraggingImage] = useState(false);
    const touchStartX = useRef<number | null>(null);
    const didSwipe = useRef(false);
    const viewportRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

    const constrainOffset = useCallback((nextOffset: { x: number; y: number }, nextZoom = zoom) => {
        const viewport = viewportRef.current;
        if (!viewport || !naturalSize.width || !naturalSize.height) {
            return nextOffset;
        }

        const viewportWidth = viewport.clientWidth;
        const viewportHeight = viewport.clientHeight;
        if (!viewportWidth || !viewportHeight) return nextOffset;

        const fitScale = Math.min(viewportWidth / naturalSize.width, viewportHeight / naturalSize.height);
        const baseWidth = naturalSize.width * fitScale;
        const baseHeight = naturalSize.height * fitScale;
        const scaledWidth = baseWidth * nextZoom;
        const scaledHeight = baseHeight * nextZoom;
        const limitX = Math.max(0, (scaledWidth - viewportWidth) / 2);
        const limitY = Math.max(0, (scaledHeight - viewportHeight) / 2);

        return {
            x: clamp(nextOffset.x, -limitX, limitX),
            y: clamp(nextOffset.y, -limitY, limitY),
        };
    }, [naturalSize.height, naturalSize.width, zoom]);

    const resetViewport = useCallback(() => {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setIsDraggingImage(false);
        dragStartRef.current = null;
    }, []);

    useEffect(() => {
        setInternalIndex(Math.max(0, Math.min(currentIndex, Math.max(images.length - 1, 0))));
    }, [currentIndex, images.length]);

    useEffect(() => {
        resetViewport();
    }, [internalIndex, resetViewport]);

    useEffect(() => {
        const handleResize = () => setOffset((prev) => constrainOffset(prev));
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [constrainOffset]);

    const goNext = () => setInternalIndex((p) => (p + 1) % images.length);
    const goPrev = () => setInternalIndex((p) => (p - 1 + images.length) % images.length);

    const handleNext = (e: React.MouseEvent) => { e.stopPropagation(); goNext(); };
    const handlePrev = (e: React.MouseEvent) => { e.stopPropagation(); goPrev(); };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (zoom <= 1.001 && e.key === 'ArrowRight') goNext();
            if (zoom <= 1.001 && e.key === 'ArrowLeft') goPrev();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [images.length, onClose, zoom]);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        didSwipe.current = false;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(delta) > 50) {
            didSwipe.current = true;
            if (delta < 0) goNext(); else goPrev();
        }
        touchStartX.current = null;
    };

    const handleBackdropClick = () => {
        if (didSwipe.current) { didSwipe.current = false; return; }
        onClose();
    };

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
        const nextOffset = constrainOffset({
            x: (offset.x - cursorX) * zoomRatio + cursorX,
            y: (offset.y - cursorY) * zoomRatio + cursorY,
        }, nextZoom);

        setZoom(nextZoom);
        setOffset(nextZoom <= 1 ? { x: 0, y: 0 } : nextOffset);
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (zoom <= 1 || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            originX: offset.x,
            originY: offset.y,
        };
        setIsDraggingImage(true);
        didSwipe.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragStartRef.current;
        if (!drag || zoom <= 1) return;
        e.preventDefault();
        e.stopPropagation();

        const nextOffset = constrainOffset({
            x: drag.originX + (e.clientX - drag.x),
            y: drag.originY + (e.clientY - drag.y),
        });
        setOffset(nextOffset);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragStartRef.current) return;
        e.stopPropagation();
        dragStartRef.current = null;
        setIsDraggingImage(false);
        window.setTimeout(() => { didSwipe.current = false; }, 0);
    };

    const currentImage = images[internalIndex];
    const isFav = currentImage?.id && favorites?.has(currentImage.id);

    return (
        <div
            className="fixed inset-0 z-[100] bg-black flex items-center justify-center animate-fadeIn"
            onClick={handleBackdropClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
                {onDeleteCurrent && currentImage && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDeleteCurrent(currentImage, internalIndex); }}
                        disabled={actionBusy}
                        className="p-2.5 rounded-full transition-all bg-black/30 text-white/70 hover:bg-black/50 hover:text-white disabled:cursor-wait disabled:opacity-60"
                        title="Delete"
                    >
                        <Trash2 size={20} />
                    </button>
                )}
                {onMoveCurrent && currentImage && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onMoveCurrent(currentImage, internalIndex); }}
                        disabled={actionBusy}
                        className="p-2.5 rounded-full transition-all bg-black/30 text-white/70 hover:bg-black/50 hover:text-white disabled:cursor-wait disabled:opacity-60"
                        title="Move To"
                    >
                        <FolderInput size={20} />
                    </button>
                )}
                {onToggleFavorite && currentImage?.id && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleFavorite(currentImage.id!); }}
                        className={`p-2.5 rounded-full transition-all ${
                            isFav ? 'bg-rose-500 text-white shadow-lg hover:bg-rose-600' : 'bg-black/30 text-white/70 hover:bg-black/50 hover:text-white'
                        }`}
                        title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
                    >
                        <Heart size={22} className={isFav ? 'fill-current' : ''} />
                    </button>
                )}
                <button
                    className="text-white/70 hover:text-white z-50 p-2.5 rounded-full bg-black/30 hover:bg-black/60 transition-colors"
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    title="Close"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Desktop arrows */}
            <button onClick={handlePrev} className="absolute left-4 text-white/70 hover:text-white hidden md:block z-40 p-4"><ChevronLeft size={48} /></button>
            <button onClick={handleNext} className="absolute right-4 text-white/70 hover:text-white hidden md:block z-40 p-4"><ChevronRight size={48} /></button>

            {/* Image viewport */}
            <div
                ref={viewportRef}
                className="relative w-full h-full overflow-hidden touch-none"
                onClick={(e) => e.stopPropagation()}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{ cursor: zoom > 1 ? (isDraggingImage ? 'grabbing' : 'grab') : 'default' }}
            >
                <img
                    {...(currentImage.sourceType !== 'local' ? { crossOrigin: 'anonymous' } : {})}
                    src={getOptimizedUrl(currentImage.src, 'blog')}
                    alt={currentImage.title}
                    className="absolute inset-0 w-full h-full object-contain shadow-2xl select-none"
                    onLoad={(e) => {
                        setNaturalSize({
                            width: e.currentTarget.naturalWidth || 0,
                            height: e.currentTarget.naturalHeight || 0,
                        });
                    }}
                    draggable={false}
                    style={{
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                        transformOrigin: 'center center',
                        transition: isDraggingImage ? 'none' : 'transform 120ms ease-out',
                    }}
                />
            </div>

            {/* Title */}
            <div className="absolute bottom-6 left-0 w-full text-center text-white/70 text-sm font-medium drop-shadow-md pointer-events-none px-4">
                {currentImage.title}
            </div>

            {/* Mobile swipe hint dots */}
            {images.length > 1 && (
                <div className="absolute bottom-14 left-0 w-full flex justify-center gap-1.5 pointer-events-none md:hidden">
                    {images.length <= 20 && images.map((_, i) => (
                        <div key={i} className={`rounded-full transition-all ${i === internalIndex ? 'w-4 h-1.5 bg-white/80' : 'w-1.5 h-1.5 bg-white/30'}`} />
                    ))}
                </div>
            )}
        </div>
    );
};

export const VideoLightbox = ({
    videos,
    startIndex,
    onClose,
    onToggleFavorite,
    favorites
}: {
    videos: VideoItem[],
    startIndex: number,
    onClose: () => void,
    onToggleFavorite?: (id: string) => void,
    favorites?: Set<string>
}) => {
    const [currentIndex, setCurrentIndex] = useState(startIndex);
    const handleNext = (e: React.MouseEvent) => { e.stopPropagation(); setCurrentIndex((prev) => (prev + 1) % videos.length); };
    const handlePrev = (e: React.MouseEvent) => { e.stopPropagation(); setCurrentIndex((prev) => (prev - 1 + videos.length) % videos.length); };

    const currentVideo = videos[currentIndex];
    const isFav = currentVideo?.id && favorites?.has(currentVideo.id);

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center animate-fadeIn" onClick={onClose}>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white z-50 p-2 rounded-full bg-black/20 hover:bg-black/40 transition-colors"><X size={32} /></button>

            {/* Favorite Button */}
            {onToggleFavorite && currentVideo?.id && (
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(currentVideo.id!); }}
                    className={`absolute top-4 right-20 p-3 rounded-full transition-all z-50 ${
                        isFav ? 'bg-rose-500 text-white shadow-lg hover:bg-rose-600' : 'bg-black/30 text-white/70 hover:bg-black/50 hover:text-white'
                    }`}
                    title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                >
                    <Heart size={24} className={isFav ? "fill-current" : ""} />
                </button>
            )}

            <button onClick={handlePrev} className="absolute left-4 text-white/70 hover:text-white hidden md:block z-40 p-4"><ChevronLeft size={48} /></button>
            <div className="w-full max-w-6xl aspect-video bg-black shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <video crossOrigin="anonymous" src={currentVideo.video} controls autoPlay className="w-full h-full" />
            </div>
            <div className="absolute bottom-8 left-0 w-full text-center text-white/80 font-medium text-lg drop-shadow-md pointer-events-none px-4">
                {currentVideo.title}
                {currentVideo.desc && <div className="text-sm text-white/60 mt-1 font-light">{currentVideo.desc}</div>}
            </div>
            <button onClick={handleNext} className="absolute right-4 text-white/70 hover:text-white hidden md:block z-40 p-4"><ChevronRight size={48} /></button>
        </div>
    );
};
