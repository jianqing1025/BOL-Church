
import React, { useEffect, useRef, useState } from 'react';
import { X, Heart, ChevronLeft, ChevronRight, Trash2, FolderInput, Clapperboard } from 'lucide-react';
import { VideoItem } from '../../types';

interface TheaterOverlayProps {
    items: VideoItem[];
    activeIndex: number;
    onIndexChange: (index: number) => void;
    onClose: () => void;
    onToggleFavorite?: (id: string) => void;
    onMoveCurrent?: (video: VideoItem, index: number) => void;
    onDeleteCurrent?: (video: VideoItem, index: number) => void;
    favorites?: Set<string>;
    actionBusy?: boolean;
    variant?: 'minimal' | 'immersive';
}

const getPlaybackUrl = (video: VideoItem): string => {
    if (video.sourceType === 'local' && video.localFilePath) {
        return `/api/local-media?path=${encodeURIComponent(video.localFilePath)}`;
    }
    return video.video;
};

const TheaterOverlay: React.FC<TheaterOverlayProps> = ({
    items,
    activeIndex,
    onIndexChange,
    onClose,
    onToggleFavorite,
    onMoveCurrent,
    onDeleteCurrent,
    favorites = new Set(),
    actionBusy = false,
    variant = 'minimal'
}) => {
    const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const didSwipe = useRef(false);
    const [isAutoAdvance, setIsAutoAdvance] = useState(false);

    const nextVideo = () => onIndexChange((activeIndex + 1) % items.length);
    const prevVideo = () => onIndexChange((activeIndex - 1 + items.length) % items.length);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        didSwipe.current = false;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null || touchStartY.current === null) return;
        const deltaX = e.changedTouches[0].clientX - touchStartX.current;
        const deltaY = e.changedTouches[0].clientY - touchStartY.current;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        if (Math.max(absX, absY) > 60) {
            didSwipe.current = true;
            const goNext = absX >= absY ? deltaX < 0 : deltaY < 0;
            if (goNext) nextVideo(); else prevVideo();
        }
        touchStartX.current = null;
        touchStartY.current = null;
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextVideo();
            if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   prevVideo();
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeIndex, items.length, onClose]);

    useEffect(() => {
        videoRefs.current.forEach((videoEl, idx) => {
            if (!videoEl) return;
            if (idx === activeIndex) {
                videoEl.muted = false;
                const playPromise = videoEl.play();
                if (playPromise !== undefined) { playPromise.catch(() => {}); }
            } else {
                videoEl.pause();
                videoEl.muted = true;
                videoEl.currentTime = 0;
            }
        });
    }, [activeIndex]);

    const getSlideStyle = (index: number) => {
        const offset = index - activeIndex;
        const isActive = offset === 0;
        const isNearLeft = offset === -1;
        const isNearRight = offset === 1;

        let transform = '', zIndex = 0, opacity = 0, filter = '', pointerEvents = 'none';

        if (isActive) {
            transform = variant === 'immersive' ? 'translateX(0) scale(1) rotateY(0deg)' : 'translateX(0) scale(1) translateZ(0)';
            zIndex = 50; opacity = 1; filter = 'brightness(1)'; pointerEvents = 'auto';
        } else if (isNearLeft) {
            transform = variant === 'immersive' ? 'translateX(-70%) scale(0.8) rotateY(25deg)' : 'translateX(-120%) scale(0.7) rotateY(25deg) translateZ(-100px)';
            zIndex = 10; opacity = variant === 'immersive' ? 0.6 : 0.4; filter = 'brightness(0.3) blur(2px)'; pointerEvents = 'auto';
        } else if (isNearRight) {
            transform = variant === 'immersive' ? 'translateX(70%) scale(0.8) rotateY(-25deg)' : 'translateX(120%) scale(0.7) rotateY(-25deg) translateZ(-100px)';
            zIndex = 10; opacity = variant === 'immersive' ? 0.6 : 0.4; filter = 'brightness(0.3) blur(2px)'; pointerEvents = 'auto';
        } else {
            const direction = offset < 0 ? -1 : 1;
            transform = `translateX(${direction * 300}%) scale(0)`;
            zIndex = 0; opacity = 0;
        }

        return { transform, zIndex, opacity, filter, pointerEvents: pointerEvents as any, transition: 'all 0.6s cubic-bezier(0.25, 1, 0.5, 1)' };
    };

    const currentVideo = items[activeIndex];
    const currentPoster = currentVideo?.thumbSrc || '';

    return (
        <div
            className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center overflow-hidden animate-fadeIn"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div className="absolute inset-0 z-0">
                {currentPoster ? (
                    <img
                        src={currentPoster}
                        alt={currentVideo.title}
                        className="w-full h-full object-cover opacity-30 blur-3xl scale-110"
                    />
                ) : (
                    <div className="w-full h-full bg-slate-900" />
                )}
                <div className="absolute inset-0 bg-black/60"></div>
            </div>

            <div className="absolute top-4 right-4 z-[150] flex items-center gap-4">
                {variant === 'immersive' && (
                    <div className="absolute top-6 left-6 text-white/80 font-bold text-lg drop-shadow-md flex items-center gap-2">
                        <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs uppercase tracking-wider border border-blue-500/30">{currentVideo.category}</span>
                        {activeIndex + 1} / {items.length}
                    </div>
                )}
                {onDeleteCurrent && currentVideo && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDeleteCurrent(currentVideo, activeIndex); }}
                        disabled={actionBusy}
                        className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all disabled:cursor-wait disabled:opacity-60"
                        title="Delete"
                    >
                        <Trash2 size={24} />
                    </button>
                )}
                {onMoveCurrent && currentVideo && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onMoveCurrent(currentVideo, activeIndex); }}
                        disabled={actionBusy}
                        className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all disabled:cursor-wait disabled:opacity-60"
                        title="Move To"
                    >
                        <FolderInput size={24} />
                    </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); if(currentVideo.id && onToggleFavorite) onToggleFavorite(currentVideo.id); }}
                    className={`p-3 rounded-full backdrop-blur-md transition-all ${currentVideo.id && favorites.has(currentVideo.id) ? 'bg-rose-500 text-white shadow-lg' : 'bg-white/10 hover:bg-white/20 text-white'}`} title="Toggle Favorite">
                    <Heart size={24} className={currentVideo.id && favorites.has(currentVideo.id) ? "fill-current" : ""} />
                </button>
                <button onClick={onClose} className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all group">
                    <X size={24} className="group-hover:rotate-90 transition-transform" />
                </button>
            </div>

            {variant === 'minimal' ? (
                <>
                    <button onClick={prevVideo} className="absolute left-0 top-[15%] bottom-[15%] w-[10%] z-[90] flex items-center justify-start pl-4 group hover:bg-white/5 transition-colors focus:outline-none cursor-pointer">
                        <ChevronLeft size={48} className="text-white/30 group-hover:text-white transition-colors" />
                    </button>
                    <button onClick={nextVideo} className="absolute right-0 top-[15%] bottom-[15%] w-[10%] z-[90] flex items-center justify-end pr-4 group hover:bg-white/5 transition-colors focus:outline-none cursor-pointer">
                        <ChevronRight size={48} className="text-white/30 group-hover:text-white transition-colors" />
                    </button>
                </>
            ) : (
                <>
                    <button onClick={prevVideo} className="absolute left-4 md:left-12 z-50 p-4 rounded-full bg-white/5 hover:bg-white/20 backdrop-blur-md text-white transition-all hover:scale-110"><ChevronLeft size={32} /></button>
                    <button onClick={nextVideo} className="absolute right-4 md:right-12 z-50 p-4 rounded-full bg-white/5 hover:bg-white/20 backdrop-blur-md text-white transition-all hover:scale-110"><ChevronRight size={32} /></button>
                </>
            )}

            <div className={`relative w-full flex items-center justify-center perspective-[1500px] z-10 ${variant === 'minimal' ? 'h-full -translate-y-[1%]' : 'h-[70vh]'}`} style={{ perspective: variant === 'minimal' ? '1500px' : '1200px' }}>
                {items.map((video, idx) => {
                    if (Math.abs(idx - activeIndex) > 2) return null;
                    const style = getSlideStyle(idx);
                    const isActive = idx === activeIndex;
                    return (
                        <div key={idx}
                            className={`absolute origin-center transition-all duration-500 ease-out flex flex-col justify-center items-center ${
                                variant === 'minimal'
                                    ? (isActive ? 'inset-0 md:inset-auto md:h-[92vh] md:aspect-video md:max-w-full z-50' : 'h-[60vh] aspect-video z-0 opacity-40')
                                    : 'w-[80%] max-w-[1000px] aspect-video rounded-2xl shadow-2xl bg-black'
                            }`}
                            style={style} onClick={() => onIndexChange(idx)}>
                            <div className={`relative w-full h-full shadow-2xl ${variant === 'immersive' ? 'overflow-hidden rounded-2xl border border-white/10' : ''}`}>
                                {isActive ? (
                                    <video
                                        src={getPlaybackUrl(video)}
                                        poster={video.thumbSrc}
                                        preload="metadata"
                                        className={`w-full h-full ${variant === 'minimal' ? 'object-contain' : 'object-cover'}`}
                                        ref={el => { videoRefs.current[idx] = el; }}
                                        loop={!isAutoAdvance}
                                        onEnded={() => {
                                            if (isAutoAdvance && items.length > 1) {
                                                nextVideo();
                                            }
                                        }}
                                        playsInline
                                        controls
                                        crossOrigin="anonymous"
                                    />
                                ) : video.thumbSrc ? (
                                    <img
                                        src={video.thumbSrc}
                                        alt={video.title}
                                        className={`w-full h-full ${variant === 'minimal' ? 'object-contain bg-black' : 'object-cover'}`}
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-black text-white/60">
                                        <span className="text-sm font-medium">{video.title}</span>
                                    </div>
                                )}
                                {!isActive && <div className="absolute inset-0 bg-black/50 hover:bg-black/20 transition-colors cursor-pointer" />}
                                {variant === 'immersive' && isActive && (
                                    <div className="absolute -bottom-[100%] left-0 w-full h-full opacity-30 pointer-events-none transform scale-y-[-1] blur-sm"
                                        style={{ backgroundImage: video.thumbSrc ? `url(${video.thumbSrc})` : undefined, maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 20%, rgba(0,0,0,0) 80%)', WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 100%)' }} />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {variant === 'minimal' && items.length > 1 && items.length <= 20 && (
                <div className="absolute bottom-16 left-0 w-full flex justify-center gap-1.5 pointer-events-none z-[80] md:hidden">
                    {items.map((_, i) => (
                        <div key={i} className={`rounded-full transition-all duration-300 ${i === activeIndex ? 'w-4 h-1.5 bg-white/80' : 'w-1.5 h-1.5 bg-white/30'}`} />
                    ))}
                </div>
            )}

            {variant === 'minimal' ? (
                <div className="absolute bottom-8 left-0 w-full text-center z-[80] pointer-events-none">
                    <div className="pointer-events-auto flex flex-col items-center gap-3 px-4">
                        <h2 className="text-gray-400 text-sm md:text-base font-medium tracking-wide drop-shadow-md bg-black/40 backdrop-blur-sm inline-block px-4 py-1 rounded-full">{currentVideo.title}</h2>
                        {items.length > 1 && (
                            <button
                                type="button"
                                onClick={() => setIsAutoAdvance((prev) => !prev)}
                                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs md:text-sm font-semibold tracking-wide backdrop-blur-md transition-all ${
                                    isAutoAdvance
                                        ? 'border-cyan-300 bg-cyan-500/20 text-cyan-100 shadow-lg shadow-cyan-900/20'
                                        : 'border-white/15 bg-black/35 text-white/80 hover:bg-white/10 hover:text-white'
                                }`}
                                title={isAutoAdvance ? 'Turn off auto play' : 'Turn on auto play'}
                            >
                                <Clapperboard size={16} />
                                <span>{isAutoAdvance ? 'Auto Play On' : 'Auto Play'}</span>
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="absolute bottom-0 w-full p-8 pb-12 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-40 text-center">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight drop-shadow-lg">{currentVideo.title}</h2>
                    {currentVideo.desc && <p className="text-gray-300 text-lg max-w-2xl mx-auto font-light leading-relaxed drop-shadow-md">{currentVideo.desc}</p>}
                </div>
            )}
        </div>
    );
};

export default TheaterOverlay;
