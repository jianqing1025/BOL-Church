
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, FolderOpen, Plus, LayoutTemplate, Film, Grid2x2, CloudUpload, Minus, Maximize2, Minimize2, Heart, LayoutDashboard, ZoomIn, ZoomOut, Download, Trash2, Expand, Shrink, CheckSquare, Copy, FolderInput, FileWarning, Loader2, X, Waves, CheckCircle, ArrowLeft, LayoutGrid, MoreVertical, Info, RefreshCw } from 'lucide-react';
import { VideoItem, SlideshowMode } from '../../types';
import { AppMenuButton } from '../common/AppMenuButton';

type GridDisplayMode = 'fill' | 'ratio';

// ─── Breakpoint hook ───────────────────────────────────────────────────────────
function useBreakpoint() {
    const [isCompact, setIsCompact] = useState(() => window.innerWidth < 1024);
    useEffect(() => {
        const fn = () => setIsCompact(window.innerWidth < 1024);
        window.addEventListener('resize', fn);
        return () => window.removeEventListener('resize', fn);
    }, []);
    return isCompact;
}

interface VideoLibraryProps {
    variant?: 'panel' | 'mobile';
    items: VideoItem[];
    // Two-level navigation
    collections: string[];
    selectedCollection: string;
    onSetCollection: (c: string) => void;
    albums: string[];           // album names only (no All/Favorites)
    filter: string;
    onSetFilter: (filter: string) => void;
    albumCountLabel: string;
    albumCount: number;
    viewMode: 'square' | 'masonry';
    onSetViewMode: (mode: 'square' | 'masonry') => void;
    gridDisplayMode: GridDisplayMode;
    onSetGridDisplayMode: (mode: GridDisplayMode) => void;
    columns: number;
    onSetColumns: (cols: number) => void;
    isSelectMode: boolean;
    onToggleSelectMode: () => void;
    selectedIds: Set<string>;
    onToggleSelection: (id: string) => void;
    isDeleteMode: boolean;
    onToggleDeleteMode: () => void;
    favorites: Set<string>;
    onToggleFavorite: (id: string) => void;
    onItemClick: (index: number, id: string) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    onItemContextMenu?: (id: string, x: number, y: number) => void;
    onHeaderImport: () => void;
    onGridImport: () => void;
    onAddManual: () => void;
    onRefresh: () => void;
    isRefreshing: boolean;
    onScanDuplicates: () => void;
    isScanning: boolean;
    onExport: () => void;
    onSlideshow: (mode: SlideshowMode | 'cascade') => void;
    menuOpen: boolean;
    onToggleMenu: () => void;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    layoutMode: 'split' | 'photo-full' | 'video-full';
    onToggleLayout: () => void;
    onBack?: () => void;
    // Selection Actions
    onOpenActionModal: (type: 'move' | 'copy') => void;
    onDownloadSelected: () => void;
    onBulkDeleteSelected: () => void;
    onClearSelection: () => void;
    onSelectAll: (ids: string[]) => void;
    hideLayoutToggle?: boolean;
    onFolderInfo?: () => void;
    onAddToSelection?: (ids: string[]) => void;
    scanProgress?: number | null;
    videoCacheProgress?: number | null;
    onVisibleLocalAssetIdsChange?: (ids: number[]) => void;
}

const fmtBytes = (b: number): string => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatCreatedAt = (value: any): string => {
    if (!value) return '';
    try {
        if (typeof value.toDate === 'function') return value.toDate().toLocaleString();
        if (typeof value.toMillis === 'function') return new Date(value.toMillis()).toLocaleString();
        if (value instanceof Date) return value.toLocaleString();
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return date.toLocaleString();
    } catch {}
    return '';
};

const formatFolderTail = (filePath?: string): string => {
    if (!filePath) return '';
    const normalized = filePath.replace(/\//g, '\\');
    const parts = normalized.split('\\').filter(Boolean);
    if (parts.length <= 1) return '';
    const folderParts = parts.slice(0, -1);
    if (folderParts.length === 0) return '';
    const tail = folderParts.slice(-3).join('\\');
    return folderParts.length > 3 ? `..\\${tail}` : tail;
};

const VideoMetaOverlay: React.FC<{ video: import('../../types').VideoItem }> = React.memo(({ video }) => {
    const rows = (
        [
            video.sizeBytes != null ? ['Size', fmtBytes(video.sizeBytes)] : null,
            formatCreatedAt(video.createdAt) ? ['Created', formatCreatedAt(video.createdAt)] : null,
            formatFolderTail(video.localFilePath) ? ['Folder', formatFolderTail(video.localFilePath)] : null,
        ] as ([string, string] | null)[]
    ).filter((row): row is [string, string] => row !== null);

    if (rows.length === 0) return null;

    return (
        <div className="absolute bottom-2 left-2 z-30 w-[42%] min-w-[190px] max-w-[280px] rounded-lg border border-white/[0.06] bg-black/[0.18] px-2.5 py-1.5 pointer-events-none shadow-sm backdrop-blur-[2px] text-left">
            {rows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[52px_minmax(0,1fr)] items-baseline gap-x-1.5">
                    <span className="text-[8px] uppercase tracking-wide text-white/45">{label}</span>
                    <span className="truncate text-[9px] font-medium leading-tight text-white/90">{value}</span>
                </div>
            ))}
        </div>
    );
});
VideoMetaOverlay.displayName = 'VideoMetaOverlay';

const openVideoInFolder = async (event: React.MouseEvent, filePath?: string) => {
    event.stopPropagation();
    if (!filePath) return;
    try {
        await window.electronAPI?.showInFolder(filePath);
    } catch {}
};

const ProgressRing: React.FC<{ progress: number; colorClass: string }> = ({ progress, colorClass }) => {
    const size = 14;
    const stroke = 2;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const safeProgress = Math.max(0, Math.min(100, progress));
    const dashOffset = circumference * (1 - safeProgress / 100);

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={`flex-shrink-0 ${colorClass}`}>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth={stroke} />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
        </svg>
    );
};

const GridModeIcon: React.FC<{ mode: GridDisplayMode; size?: number; className?: string }> = ({ mode, size = 16, className = '' }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
        {mode === 'fill' ? (
            <>
                {[1.5, 6.25, 11].flatMap((x) => [1.5, 6.25, 11].map((y) => (
                    <rect key={`${x}-${y}`} x={x} y={y} width="3.5" height="3.5" rx="0.9" fill="currentColor" />
                )))}
            </>
        ) : (
            <>
                {[0.75, 5.5, 10.25].flatMap((x) => [0.75, 5.5, 10.25].map((y) => (
                    <rect key={`frame-${x}-${y}`} x={x} y={y} width="5" height="5" rx="1.1" stroke="currentColor" strokeWidth="1" opacity="0.45" />
                )))}
                <rect x="1.7" y="2.85" width="3.1" height="1.7" rx="0.85" fill="currentColor" />
                <rect x="6.95" y="1.95" width="1.7" height="3.45" rx="0.85" fill="currentColor" />
                <rect x="11.15" y="2.7" width="3.3" height="1.95" rx="0.9" fill="currentColor" />
                <rect x="2.4" y="6.95" width="1.7" height="3.4" rx="0.85" fill="currentColor" />
                <rect x="6.45" y="7.8" width="4.15" height="1.7" rx="0.85" fill="currentColor" />
                <rect x="12" y="6.8" width="1.7" height="3.4" rx="0.85" fill="currentColor" />
                <rect x="1.65" y="12.1" width="3.4" height="1.7" rx="0.85" fill="currentColor" />
                <rect x="7.05" y="11.35" width="1.7" height="3.15" rx="0.85" fill="currentColor" />
                <rect x="10.95" y="12.15" width="3.55" height="1.7" rx="0.85" fill="currentColor" />
            </>
        )}
    </svg>
);

const generatedVideoPosterCache = new Map<string, string>();

const VideoCard: React.FC<{
    video: import('../../types').VideoItem;
    idx: number;
    scrollRootEl: HTMLDivElement | null;
    viewMode: 'square' | 'masonry';
    gridDisplayMode?: GridDisplayMode;
    isSelectMode: boolean;
    isSelected: boolean;
    isDeleteMode: boolean;
    isFav: boolean;
    onItemClick: (idx: number, id: string) => void;
    onToggleSelection: (id: string) => void;
    onToggleFavorite: (id: string) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    onContextMenu?: (id: string, x: number, y: number) => void;
}> = ({ video, idx, scrollRootEl, viewMode, gridDisplayMode = 'fill', isSelectMode, isSelected, isDeleteMode, isFav, onItemClick, onToggleSelection, onToggleFavorite, onDelete, onContextMenu }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const previewVideoRef = useRef<HTMLVideoElement>(null);
    const frameVideoRef = useRef<HTMLVideoElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [isNearViewport, setIsNearViewport] = useState(false);
    const [isPreviewReady, setIsPreviewReady] = useState(false);
    const posterCacheKey = video.id || video.video;
    const [generatedPosterSrc, setGeneratedPosterSrc] = useState(() => generatedVideoPosterCache.get(posterCacheKey) || '');
    const sq = viewMode === 'square';
    const showRatioPreview = sq && gridDisplayMode === 'ratio';

    const posterSrc = (() => {
        if (video.thumbSrc) return video.thumbSrc;
        if (video.video.includes('cloudinary.com') && video.video.includes('/video/upload/')) {
            const thumbUrl = video.video
                .replace('/video/upload/', '/video/upload/so_0,w_800,h_800,c_fill,q_auto,f_jpg/')
                .replace(/\.[^/.]+$/, '.jpg');
            return thumbUrl;
        }
        return '';
    })();
    const ratioPosterSrc = (() => {
        if (video.video.includes('cloudinary.com') && video.video.includes('/video/upload/')) {
            return video.video
                .replace('/video/upload/', '/video/upload/so_0,c_limit,w_900,q_auto,f_jpg/')
                .replace(/\.[^/.]+$/, '.jpg');
        }
        return posterSrc;
    })();
    const effectivePosterSrc = posterSrc || generatedPosterSrc;
    const effectiveRatioPosterSrc = ratioPosterSrc || generatedPosterSrc;
    const shouldPreview = isHovered;
    const shouldPrimeFrame = isNearViewport && !effectivePosterSrc && !effectiveRatioPosterSrc;
    const shouldMountPreviewVideo = isNearViewport || isHovered;
    const shouldMountFrameVideo = shouldPrimeFrame && !shouldPreview;

    useEffect(() => {
        const cachedPoster = generatedVideoPosterCache.get(posterCacheKey) || '';
        setGeneratedPosterSrc(cachedPoster);
        setIsPreviewReady(false);
        setIsHovered(false);
    }, [posterCacheKey]);

    useEffect(() => {
        const node = rootRef.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            ([entry]) => setIsNearViewport(entry.isIntersecting),
            { root: scrollRootEl, rootMargin: '300px 0px', threshold: 0.01 },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [scrollRootEl]);

    const capturePosterFrame = (element: HTMLVideoElement | null) => {
        if (!element || !element.videoWidth || !element.videoHeight) return;
        if (generatedVideoPosterCache.has(posterCacheKey)) {
            const cachedPoster = generatedVideoPosterCache.get(posterCacheKey) || '';
            if (cachedPoster) {
                setGeneratedPosterSrc(cachedPoster);
            }
            return;
        }

        try {
            const canvas = document.createElement('canvas');
            canvas.width = element.videoWidth;
            canvas.height = element.videoHeight;
            const context = canvas.getContext('2d');
            if (!context) return;
            context.drawImage(element, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            generatedVideoPosterCache.set(posterCacheKey, dataUrl);
            setGeneratedPosterSrc(dataUrl);
        } catch {}
    };

    const tryStartPreviewPlayback = () => {
        const element = previewVideoRef.current;
        if (!element || !shouldPreview) return;
        const playPromise = element.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {});
        }
    };

    useEffect(() => {
        const element = previewVideoRef.current;
        if (!element || !shouldMountPreviewVideo) return;

        if (shouldPreview) {
            if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                setIsPreviewReady(true);
            }
            tryStartPreviewPlayback();
            return;
        }

        element.pause();
        element.currentTime = 0;
    }, [shouldMountPreviewVideo, shouldPreview]);

    useEffect(() => {
        const element = frameVideoRef.current;
        if (!element || !shouldMountFrameVideo) return;

        const primeFrame = async () => {
            try {
                element.pause();
                if (element.readyState >= 1) {
                    element.currentTime = 0.1;
                }
            } catch {}
        };

        void primeFrame();
    }, [shouldMountFrameVideo, video.video]);

    useEffect(() => {
        if (!shouldMountPreviewVideo) {
            setIsPreviewReady(false);
        }
    }, [shouldMountPreviewVideo]);

    return (
        <div
            ref={rootRef}
            data-video-id={video.id || undefined}
            className={sq
                ? `relative aspect-square cursor-pointer group rounded-xl overflow-hidden ${showRatioPreview ? 'border border-gray-200/80 bg-white shadow-sm' : 'bg-black'} ${isSelected ? 'ring-4 ring-cyan-500 z-10' : ''}`
                : `break-inside-avoid relative bg-black cursor-pointer group rounded-xl overflow-hidden shadow-sm mb-4 ${isSelected ? 'ring-4 ring-cyan-500' : ''}`}
            onDragStart={(e) => e.preventDefault()}
            onClick={() => { if (isSelectMode && video.id) onToggleSelection(video.id); else if (video.id) onItemClick(idx, video.id); }}
            onContextMenu={(e) => { if (video.id && onContextMenu) { e.preventDefault(); e.stopPropagation(); onContextMenu(video.id, e.clientX, e.clientY); } }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {showRatioPreview ? (
                <>
                    <div className={`absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-gray-100 transition-colors ${isSelectMode ? '' : 'group-hover:from-cyan-50 group-hover:to-white'}`} />
                    {effectiveRatioPosterSrc ? (
                        <img
                            src={effectiveRatioPosterSrc}
                            alt={video.title}
                            loading="lazy"
                            draggable={false}
                            className={`absolute inset-0 w-full h-full object-contain p-2 transition-transform duration-500 ${isSelected ? 'scale-95' : isSelectMode ? '' : 'group-hover:scale-[1.03]'}`}
                        />
                    ) : (
                        <div className={`absolute inset-0 flex h-full w-full items-center justify-center p-2 text-center text-xs font-medium text-gray-500 transition-transform duration-500 ${isSelected ? 'scale-95' : isSelectMode ? '' : 'group-hover:scale-[1.03]'}`}>
                            {video.title}
                        </div>
                    )}
                    {shouldMountPreviewVideo && (
                        <video
                            ref={previewVideoRef}
                            src={video.video}
                            muted
                            loop
                            playsInline
                            draggable={false}
                            preload={shouldPreview ? 'auto' : 'metadata'}
                            crossOrigin="anonymous"
                            onLoadedData={(event) => {
                                setIsPreviewReady(true);
                                if (!effectivePosterSrc && !effectiveRatioPosterSrc) {
                                    capturePosterFrame(event.currentTarget);
                                }
                                tryStartPreviewPlayback();
                            }}
                            onCanPlay={() => {
                                setIsPreviewReady(true);
                                tryStartPreviewPlayback();
                            }}
                            onPlaying={() => setIsPreviewReady(true)}
                            onWaiting={() => setIsPreviewReady(false)}
                            onStalled={() => setIsPreviewReady(false)}
                            className={`absolute inset-0 w-full h-full object-contain p-2 transition-opacity duration-200 ${shouldPreview && isPreviewReady ? 'opacity-100' : 'opacity-0'} pointer-events-none`}
                        />
                    )}
                    {shouldMountFrameVideo && (
                        <video
                            ref={frameVideoRef}
                            src={video.video}
                            muted
                            playsInline
                            draggable={false}
                            preload="auto"
                            crossOrigin="anonymous"
                            onLoadedData={(event) => capturePosterFrame(event.currentTarget)}
                            onSeeked={(event) => capturePosterFrame(event.currentTarget)}
                            className="absolute pointer-events-none opacity-0 w-0 h-0"
                            aria-hidden="true"
                        />
                    )}
                </>
            ) : effectivePosterSrc && (
                <img
                    src={effectivePosterSrc}
                    alt={video.title}
                    loading="lazy"
                    draggable={false}
                    className={`absolute inset-0 w-full h-full object-cover transition-all duration-200 ${shouldPreview && isPreviewReady ? 'opacity-0' : 'opacity-100'} ${isSelectMode ? '' : 'group-hover:scale-105'} ${isSelected ? (sq ? 'scale-90' : 'scale-95') : ''}`}
                />
            )}
            {!showRatioPreview && shouldMountPreviewVideo && (
                <video
                    ref={previewVideoRef}
                    src={video.video}
                    muted
                    loop
                    playsInline
                    draggable={false}
                    preload={shouldPreview ? 'auto' : 'metadata'}
                    crossOrigin="anonymous"
                    onLoadedData={(event) => {
                        setIsPreviewReady(true);
                        if (!effectivePosterSrc && !effectiveRatioPosterSrc) {
                            capturePosterFrame(event.currentTarget);
                        }
                        tryStartPreviewPlayback();
                    }}
                    onCanPlay={() => {
                        setIsPreviewReady(true);
                        tryStartPreviewPlayback();
                    }}
                    onPlaying={() => setIsPreviewReady(true)}
                    onWaiting={() => setIsPreviewReady(false)}
                    onStalled={() => setIsPreviewReady(false)}
                    className={`absolute inset-0 ${sq ? 'w-full h-full object-cover' : 'w-full h-full object-cover'} transition-opacity duration-200 ${shouldPreview && isPreviewReady ? 'opacity-100' : 'opacity-0'} ${isSelected ? (sq ? 'scale-90' : 'scale-95') : ''} pointer-events-none`}
                />
            )}
            {!showRatioPreview && shouldMountFrameVideo && (
                <video
                    ref={frameVideoRef}
                    src={video.video}
                    muted
                    playsInline
                    draggable={false}
                    preload="auto"
                    crossOrigin="anonymous"
                    onLoadedData={(event) => capturePosterFrame(event.currentTarget)}
                    onSeeked={(event) => capturePosterFrame(event.currentTarget)}
                    className="absolute pointer-events-none opacity-0 w-0 h-0"
                    aria-hidden="true"
                />
            )}
            {!isSelectMode && !isDeleteMode && !shouldPreview && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className={`rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center shadow-lg ${sq ? 'w-10 h-10' : 'w-8 h-8'}`}>
                        <Play size={sq ? 16 : 13} className="text-white fill-white ml-0.5" />
                    </div>
                </div>
            )}
            {!showRatioPreview && !effectivePosterSrc && !(shouldPreview && isPreviewReady) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black text-center text-xs font-medium text-white/70">
                    <span className="px-3">{video.title}</span>
                </div>
            )}
            {isHovered && <VideoMetaOverlay video={video} />}
            {isSelectMode && <div className={`absolute top-2 right-2 p-1 rounded-full transition-all z-20 ${isSelected ? 'bg-cyan-500 text-white' : 'bg-black/30 text-white/50 border border-white/50'}`}><CheckCircle size={20} className={isSelected ? 'fill-cyan-500 text-white' : ''} /></div>}
            {!isSelectMode && <button type="button" onClick={(e) => { e.stopPropagation(); if (video.id) onToggleFavorite(video.id); }} title={isFav ? 'Remove favorite' : 'Add favorite'} className={`absolute top-1.5 right-1.5 p-1.5 rounded-full backdrop-blur-md transition-all z-10 ${isFav ? 'bg-cyan-500 text-white shadow-sm' : 'bg-black/20 text-white/70 hover:bg-black/40 opacity-0 group-hover:opacity-100'}`}><Heart size={14} className={isFav ? 'fill-current' : ''} /></button>}
            {isDeleteMode && !isSelectMode && video.id && (<button type="button" onClick={(e) => onDelete(video.id!, e)} title="Delete" className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md hover:bg-red-700 hover:scale-110 transition-all z-20"><Minus size={14} strokeWidth={4} /></button>)}
            {video.sourceType === 'local' && video.localFilePath && (
                <button
                    type="button"
                    onClick={(event) => { void openVideoInFolder(event, video.localFilePath); }}
                    onMouseDown={(event) => event.stopPropagation()}
                    title="Show this file in folder"
                    className="absolute bottom-1.5 right-1.5 z-20 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-cyan-200 shadow-sm backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 hover:bg-black/75 hover:text-white focus:opacity-100"
                >
                    <FolderOpen size={12} />
                    <span>Local</span>
                </button>
            )}
        </div>
    );
};

export const VideoLibrary: React.FC<VideoLibraryProps> = ({
    variant = 'panel',
    items, collections, selectedCollection, onSetCollection, albums, filter, onSetFilter,
    albumCountLabel, albumCount,
    viewMode, onSetViewMode, gridDisplayMode, onSetGridDisplayMode, columns, onSetColumns,
    isSelectMode, onToggleSelectMode, selectedIds, onToggleSelection,
    isDeleteMode, onToggleDeleteMode, favorites, onToggleFavorite,
    onItemClick, onDelete, onItemContextMenu, onHeaderImport, onGridImport, onAddManual,
    onScanDuplicates, isScanning, onExport, onSlideshow,
    menuOpen, onToggleMenu,
    isFullscreen, onToggleFullscreen, layoutMode, onToggleLayout,
    onOpenActionModal, onDownloadSelected, onBulkDeleteSelected, onClearSelection, onSelectAll,
    onBack, hideLayoutToggle, onFolderInfo, onAddToSelection, scanProgress, videoCacheProgress,
    onRefresh, isRefreshing, onVisibleLocalAssetIdsChange,
}) => {
    const albumFilters = ['All', 'Favorites', ...albums.filter(a => a && a !== 'All' && a !== 'Favorites')];
    const isCompact = useBreakpoint();
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const [albumOverflowOpen, setAlbumOverflowOpen] = useState(false);
    const collectionRef = useRef<HTMLDivElement>(null);
    const videoScrollRef = useRef<HTMLDivElement>(null);
    const [scrollRootEl, setScrollRootEl] = useState<HTMLDivElement | null>(null);
    const toggleGridView = useCallback(() => {
        if (viewMode !== 'square') {
            onSetViewMode('square');
            return;
        }
        onSetGridDisplayMode(gridDisplayMode === 'fill' ? 'ratio' : 'fill');
    }, [gridDisplayMode, onSetGridDisplayMode, onSetViewMode, viewMode]);
    const gridModeLabel = gridDisplayMode === 'fill' ? 'Fill' : 'Ratio';
    const gridModeTitle = viewMode === 'square' ? `Grid: ${gridModeLabel}` : 'Square grid';

    // ── Drag-select (square view only) ───────────────────────────────────────
    const gridRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const vDragState = useRef<{ active: boolean; started: boolean; startIdx: number; startX: number; startY: number; pointerId: number }>({ active: false, started: false, startIdx: -1, startX: 0, startY: 0, pointerId: -1 });
    const vDragIds = useRef<Set<string>>(new Set());
    const [vDragVisual, setVDragVisual] = useState<Set<string>>(new Set());
    const vAutoScroll = useRef<number | null>(null);
    const vSuppressClick = useRef(0);
    const VDRAG_THRESHOLD = 5;

    const reportVisibleLocalAssetIds = useCallback(() => {
        if (!onVisibleLocalAssetIdsChange) return;
        const root = scrollContainerRef.current;
        if (!root) {
            onVisibleLocalAssetIdsChange([]);
            return;
        }

        const rootRect = root.getBoundingClientRect();
        const localAssetByVideoId = new Map(
            items
                .filter((item) => item.id && typeof item.localAssetId === 'number')
                .map((item) => [item.id as string, item.localAssetId as number]),
        );
        const nextIds: number[] = [];

        root.querySelectorAll<HTMLElement>('[data-video-id]').forEach((node) => {
            const rect = node.getBoundingClientRect();
            const intersects = rect.bottom > rootRect.top && rect.top < rootRect.bottom && rect.right > rootRect.left && rect.left < rootRect.right;
            if (!intersects) return;
            const videoId = node.dataset.videoId;
            if (!videoId) return;
            const localAssetId = localAssetByVideoId.get(videoId);
            if (typeof localAssetId === 'number') nextIds.push(localAssetId);
        });

        onVisibleLocalAssetIdsChange(Array.from(new Set(nextIds)));
    }, [items, onVisibleLocalAssetIdsChange]);

    useEffect(() => {
        if (!onVisibleLocalAssetIdsChange) return;

        const root = scrollContainerRef.current;
        if (!root) {
            onVisibleLocalAssetIdsChange([]);
            return;
        }

        let rafId = 0;
        const schedule = () => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = window.requestAnimationFrame(() => {
                rafId = 0;
                reportVisibleLocalAssetIds();
            });
        };

        schedule();
        root.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);

        return () => {
            root.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [columns, filter, onVisibleLocalAssetIdsChange, reportVisibleLocalAssetIds, selectedCollection, viewMode]);

    const getVideoIndexFromPoint = useCallback((x: number, y: number): number => {
        const el = document.elementFromPoint(x, y);
        if (!el) return -1;
        const card = (el as HTMLElement).closest('[data-video-id]');
        if (!card) return -1;
        const id = card.getAttribute('data-video-id');
        return items.findIndex(i => i.id === id);
    }, [items]);

    const videoIdsInRange = useCallback((a: number, b: number): Set<string> => {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const r = new Set<string>();
        for (let i = lo; i <= hi && i < items.length; i++) { const id = items[i].id; if (id) r.add(id); }
        return r;
    }, [items]);

    const onVDragDown = useCallback((e: React.PointerEvent) => {
        if (!isSelectMode || viewMode !== 'square' || !onAddToSelection) return;
        if (e.button !== 0) return;
        const idx = getVideoIndexFromPoint(e.clientX, e.clientY);
        if (idx < 0) return;
        vDragState.current = { active: true, started: false, startIdx: idx, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
    }, [isSelectMode, viewMode, onAddToSelection, getVideoIndexFromPoint]);

    const onVDragMove = useCallback((e: React.PointerEvent) => {
        const s = vDragState.current;
        if (!s.active) return;

        if (!s.started) {
            const dx = e.clientX - s.startX;
            const dy = e.clientY - s.startY;
            if (Math.abs(dx) < VDRAG_THRESHOLD && Math.abs(dy) < VDRAG_THRESHOLD) return;
            s.started = true;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

            const r = videoIdsInRange(s.startIdx, s.startIdx);
            vDragIds.current = r;
            setVDragVisual(r);
        }

        e.preventDefault();

        const idx = getVideoIndexFromPoint(e.clientX, e.clientY);
        if (idx >= 0) {
            const r = videoIdsInRange(s.startIdx, idx);
            if (r.size !== vDragIds.current.size) {
                vDragIds.current = r;
                setVDragVisual(r);
            }
        }

        const container = scrollContainerRef.current;
        if (container) {
            const rect = container.getBoundingClientRect();
            const ez = 60;
            const dt = e.clientY - rect.top;
            const db = rect.bottom - e.clientY;
            if (vAutoScroll.current) { cancelAnimationFrame(vAutoScroll.current); vAutoScroll.current = null; }
            if (dt < ez && dt > 0) {
                const sp = Math.max(2, (ez - dt) / 3);
                const fn = () => {
                    if (!vDragState.current.started) return;
                    container.scrollTop -= sp;
                    vAutoScroll.current = requestAnimationFrame(fn);
                };
                vAutoScroll.current = requestAnimationFrame(fn);
            } else if (db < ez && db > 0) {
                const sp = Math.max(2, (ez - db) / 3);
                const fn = () => {
                    if (!vDragState.current.started) return;
                    container.scrollTop += sp;
                    vAutoScroll.current = requestAnimationFrame(fn);
                };
                vAutoScroll.current = requestAnimationFrame(fn);
            }
        }
    }, [getVideoIndexFromPoint, videoIdsInRange]);

    const onVDragUp = useCallback((e: React.PointerEvent) => {
        const s = vDragState.current;
        if (!s.active) return;
        const wasDrag = s.started;
        vDragState.current = { active: false, started: false, startIdx: -1, startX: 0, startY: 0, pointerId: -1 };
        if (vAutoScroll.current) { cancelAnimationFrame(vAutoScroll.current); vAutoScroll.current = null; }
        if (wasDrag && vDragIds.current.size > 0 && onAddToSelection) {
            onAddToSelection([...vDragIds.current]);
            vSuppressClick.current = Date.now() + 100;
        }
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        vDragIds.current = new Set();
        setVDragVisual(new Set());
    }, [onAddToSelection]);

    const onVGridClick = useCallback((e: React.MouseEvent) => { if (Date.now() < vSuppressClick.current) { e.stopPropagation(); e.preventDefault(); } }, []);

    // Scroll active collection chip into view when selection changes
    useEffect(() => {
        const el = collectionRef.current;
        if (!el) return;
        const active = el.querySelector('[data-active-col="true"]') as HTMLElement | null;
        if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }, [selectedCollection]);

    // Lock body scroll when a sheet is open
    useEffect(() => {
        if (moreMenuOpen || albumOverflowOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [moreMenuOpen, albumOverflowOpen]);

    // ── MOBILE VARIANT ──────────────────────────────────────────────────────────
    if (variant === 'mobile') {
        return (
            <div className="h-full bg-white flex flex-col font-sans">
                <div className="bg-white/95 backdrop-blur-xl border-b border-gray-100 z-50 pt-safe-top">
                    <div className="px-4 py-1.5 flex justify-between items-center">
                        <button type="button" onClick={onBack} className="flex items-center gap-1 text-cyan-500 hover:text-cyan-600 transition-colors text-lg">
                            <ArrowLeft size={22} /> <span>Home</span>
                        </button>
                        <span className="font-bold text-lg text-black">Videos</span>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-1">
                                <button type="button" onClick={() => onSetColumns(Math.max(1, columns - 1))} className="p-1.5 text-gray-500 hover:text-cyan-500 transition-colors" title="Zoom In"><ZoomIn size={16} /></button>
                                <button type="button" onClick={() => onSetColumns(Math.min(48, columns + 1))} className="p-1.5 text-gray-500 hover:text-cyan-500 transition-colors" title="Zoom Out"><ZoomOut size={16} /></button>
                            </div>
                            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mr-2">
                                <button type="button" onClick={toggleGridView} className={`p-1.5 rounded-md transition-all ${viewMode === 'square' ? 'bg-white text-cyan-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title={gridModeTitle}><GridModeIcon mode={viewMode === 'square' ? gridDisplayMode : 'fill'} size={18} /></button>
                                <button type="button" onClick={() => onSetViewMode('masonry')} className={`p-1.5 rounded-md transition-all ${viewMode === 'masonry' ? 'bg-white text-cyan-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Masonry grid"><LayoutDashboard size={18} /></button>
                            </div>
                            <button type="button" onClick={onAddManual} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors" title="Upload"><CloudUpload size={18} /></button>
                            <button type="button" onClick={onHeaderImport} className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors" title="Import Folder"><FolderOpen size={18} /></button>
                            <div className="relative ml-2">
                                <button type="button" onClick={onToggleMenu} className="w-8 h-8 rounded-full bg-cyan-500 text-white flex items-center justify-center hover:bg-cyan-600 transition-colors shadow-md" title="Slideshow"><Play size={16} className="fill-current" /></button>
                                {menuOpen && (
                                    <div className="absolute right-0 mt-2 w-56 bg-white/90 backdrop-blur-xl rounded-xl shadow-2xl z-50 border border-gray-200/50 py-2 origin-top-right animate-fadeIn">
                                        <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Play Slideshow</div>
                                        {[
                                            { id: 'tiles-shifting', label: 'Tiles Shifting', icon: Grid2x2 },
                                            { id: 'sliding-tiles', label: 'Sliding Tiles', icon: Grid2x2 },
                                            { id: 'wings', label: 'Cinema Wings', icon: LayoutTemplate },
                                            { id: 'vista', label: 'Cinema Vista', icon: LayoutTemplate },
                                            { id: 'flow-drift', label: 'Flow Drift', icon: Waves },
                                            { id: 'quad-horizon', label: 'Quad Horizon', icon: LayoutGrid },
                                        ].map(opt => (
                                            <button type="button" key={opt.id} className="w-full text-left px-4 py-3 text-sm text-gray-800 hover:bg-gray-100 flex items-center gap-3" onClick={() => onSlideshow(opt.id as any)}>
                                                <opt.icon size={16} className="text-cyan-500" /> {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    {/* Collection chips — single-line scroll */}
                    {collections.length > 0 && (
                        <div
                            ref={collectionRef}
                            className="px-4 py-1.5 flex gap-1.5 overflow-x-auto border-b border-gray-100"
                            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', flexWrap: 'nowrap' }}
                            onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}
                        >
                            {collections.map(c => (
                                <button type="button" key={c}
                                    data-active-col={selectedCollection === c}
                                    onClick={() => onSetCollection(c)}
                                    className={`flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-all ${selectedCollection === c ? 'bg-cyan-500 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:border-cyan-200'}`}>
                                    {c}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Album chips */}
                    <div className="px-4 pb-[15px] flex flex-wrap gap-2 items-center">
                        {albumFilters.map(cat => cat === 'Favorites' ? (
                            <button type="button" key="Favorites" onClick={() => onSetFilter('Favorites')}
                                title="Favorites" aria-label="Favorites"
                                className={`flex items-center justify-center px-3 py-1.5 rounded-full transition-all ${filter === 'Favorites' ? 'bg-cyan-500 text-white shadow-md' : 'bg-cyan-50 text-cyan-400 border border-cyan-200 hover:bg-cyan-100'}`}>
                                <Heart size={14} className={filter === 'Favorites' ? 'fill-current' : ''} />
                            </button>
                        ) : (
                            <button type="button" key={cat} onClick={() => onSetFilter(cat)} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${filter === cat ? 'bg-black text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                <span>{cat}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div
                    ref={(node) => {
                        scrollContainerRef.current = node;
                        videoScrollRef.current = node;
                        setScrollRootEl(node);
                    }}
                    className="flex-1 overflow-y-auto bg-white p-0.5"
                >
                    {viewMode === 'square' ? (
                        <div
                            ref={gridRef}
                            className={`grid gap-1 ${isSelectMode && onAddToSelection ? 'touch-none select-none' : ''}`}
                            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                            onDragStart={(e) => e.preventDefault()}
                            onPointerDown={onVDragDown}
                            onPointerMove={onVDragMove}
                            onPointerUp={onVDragUp}
                            onPointerCancel={onVDragUp}
                            onClickCapture={onVGridClick}
                        >
                            {items.map((video, idx) => {
                                const isFav = video.id ? favorites.has(video.id) : false;
                                const isSelected = video.id ? (selectedIds.has(video.id) || vDragVisual.has(video.id)) : false;
                                return (
                                    <VideoCard
                                        key={video.id || video.video || idx}
                                        video={video}
                                        idx={idx}
                                        scrollRootEl={scrollRootEl}
                                        viewMode="square"
                                        gridDisplayMode={gridDisplayMode}
                                        isSelectMode={isSelectMode}
                                        isSelected={isSelected}
                                        isDeleteMode={isDeleteMode}
                                        isFav={isFav}
                                        onItemClick={onItemClick}
                                        onToggleSelection={onToggleSelection}
                                        onToggleFavorite={onToggleFavorite}
                                        onDelete={onDelete}
                                        onContextMenu={onItemContextMenu}
                                    />
                                );
                            })}
                            {filter !== 'Favorites' && (filter !== 'All' || items.length > 0) && !isSelectMode && (
                                <div onClick={onGridImport} className="relative aspect-video cursor-pointer group overflow-hidden bg-gray-50 border-2 border-dashed border-gray-200 hover:border-cyan-300 hover:bg-cyan-50 transition-all flex flex-col items-center justify-center gap-1 rounded-md">
                                    <Plus size={24} className="text-gray-300 group-hover:text-cyan-400 transition-colors" />
                                    <span className="text-[10px] uppercase font-bold text-gray-400 group-hover:text-cyan-400">Add</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="gap-4 p-4 pb-20 space-y-4" style={{ columnCount: columns }}>
                            {items.map((video, idx) => {
                                const isFav = video.id ? favorites.has(video.id) : false;
                                const isSelected = video.id ? selectedIds.has(video.id) : false;
                                return (
                                    <VideoCard
                                        key={video.id || video.video || idx}
                                        video={video}
                                        idx={idx}
                                        scrollRootEl={scrollRootEl}
                                        viewMode="masonry"
                                        isSelectMode={isSelectMode}
                                        isSelected={isSelected}
                                        isDeleteMode={isDeleteMode}
                                        isFav={isFav}
                                        onItemClick={onItemClick}
                                        onToggleSelection={onToggleSelection}
                                        onToggleFavorite={onToggleFavorite}
                                        onDelete={onDelete}
                                        onContextMenu={onItemContextMenu}
                                    />
                                );
                            })}
                            {filter !== 'Favorites' && (filter !== 'All' || items.length > 0) && !isSelectMode && (
                                <div onClick={onGridImport} className="break-inside-avoid relative w-full aspect-video cursor-pointer group overflow-hidden bg-white border-2 border-dashed border-gray-200 hover:border-cyan-300 hover:bg-cyan-50 transition-all flex flex-col items-center justify-center gap-1 rounded-xl mb-4">
                                    <Plus size={24} className="text-gray-300 group-hover:text-cyan-400 transition-colors" />
                                    <span className="text-xs uppercase font-bold text-gray-400 group-hover:text-cyan-400">Add</span>
                                </div>
                            )}
                        </div>
                    )}
                    {items.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4 pt-20">
                            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center"><Film size={24} className="opacity-20" /></div>
                            {filter === 'Favorites' && <p className="text-xs">No favorites yet.</p>}
                            {filter === 'All' && <button type="button" onClick={onGridImport} className="mt-1 px-4 py-2 bg-cyan-500 text-white text-sm font-bold rounded-full shadow hover:bg-cyan-600 transition-colors flex items-center gap-2"><Plus size={16} /> Import Folder</button>}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── DESKTOP PANEL VARIANT ───────────────────────────────────────────────────
    return (
        <div
            ref={(node) => {
                scrollContainerRef.current = node;
                videoScrollRef.current = node;
                setScrollRootEl(node);
            }}
            className={`flex-col bg-gray-50 relative transition-all duration-300 ease-in-out overflow-y-auto ${layoutMode === 'photo-full' ? 'hidden' : 'flex-1 flex'} ${isFullscreen ? 'fixed inset-0 z-50 w-full h-full' : ''}`}
        >
            {!isFullscreen && (
                <div className="sticky top-0 z-20 bg-white/70 backdrop-blur-md shadow-sm">
                    {isCompact ? (
                        /* ── COMPACT TOOLBAR (mobile / tablet) ── */
                        <>
                            <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <AppMenuButton accent="cyan" />
                                    <Film size={17} className="text-cyan-500" />
                                    <h2 className="font-bold text-sm text-gray-800">Videos</h2>
                                </div>
                                {collections.length > 0 && (
                                    <div ref={collectionRef} className="flex-1 min-w-0 overflow-x-auto flex items-center gap-1.5" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', flexWrap: 'nowrap' }} onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
                                        {collections.map(c => (
                                            <button type="button" key={c} data-active-col={selectedCollection === c} onClick={() => onSetCollection(c)} className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide whitespace-nowrap transition-all ${selectedCollection === c ? 'bg-cyan-500 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:bg-cyan-50 hover:border-cyan-200'}`}>{c}</button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
                                    {isDeleteMode && <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded mr-1">DEL</span>}
                                    {isSelectMode && <span className="text-[10px] font-bold text-cyan-500 bg-cyan-50 px-1.5 py-0.5 rounded mr-1">{selectedIds.size > 0 ? `${selectedIds.size}✓` : 'SEL'}</span>}
                                    <button type="button" onClick={() => onSetColumns(Math.max(1, columns - 1))} className="p-2 text-gray-500 hover:text-cyan-500 rounded-lg transition-colors" title="Zoom In"><ZoomIn size={17} /></button>
                                    <button type="button" onClick={() => onSetColumns(Math.min(48, columns + 1))} className="p-2 text-gray-500 hover:text-cyan-500 rounded-lg transition-colors" title="Zoom Out"><ZoomOut size={17} /></button>
                                    <button type="button" onClick={onRefresh} disabled={isRefreshing} className={`p-2 rounded-lg transition-colors ${isRefreshing ? 'text-sky-500 bg-sky-50' : 'text-gray-500 hover:text-sky-500 hover:bg-sky-50'}`} title={isRefreshing ? 'Refreshing visible video thumbnails...' : 'Refresh visible video thumbnails'}>
                                        {isRefreshing ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                                    </button>
                                    <button type="button" onClick={() => setMoreMenuOpen(true)} className={`p-2 rounded-lg transition-colors ${moreMenuOpen ? 'text-cyan-500 bg-cyan-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`} title="More options"><MoreVertical size={18} /></button>
                                </div>
                            </div>
                            <div className="relative border-b border-gray-200">
                                <div className="px-3 py-1.5 pr-24 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
                                    {albumFilters.map(cat => cat === 'Favorites' ? (
                                        <button type="button" key="Favorites" onClick={() => onSetFilter('Favorites')} title="Favorites" aria-label="Favorites" className={`flex-shrink-0 flex items-center justify-center px-2 py-1 rounded-md transition-all ${filter === 'Favorites' ? 'bg-cyan-500 text-white shadow-sm' : 'bg-cyan-50 text-cyan-400 border border-cyan-200 hover:bg-cyan-100'}`}><Heart size={13} className={filter === 'Favorites' ? 'fill-current' : ''} /></button>
                                    ) : (
                                        <button type="button" key={cat} onClick={() => onSetFilter(cat)} className={`flex-shrink-0 flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide whitespace-nowrap transition-all ${filter === cat ? 'bg-cyan-500 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:border-cyan-200'}`}>{cat}</button>
                                    ))}
                                    <button type="button" onClick={() => setAlbumOverflowOpen(true)} className="flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold text-gray-400 border border-gray-200 bg-white whitespace-nowrap hover:bg-gray-50 transition-colors">···</button>
                                </div>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                                    <div className="rounded-md border border-cyan-100 bg-cyan-50/95 px-2.5 py-1 text-[11px] font-bold text-cyan-600 shadow-sm whitespace-nowrap inline-flex items-center gap-1.5">
                                        {typeof scanProgress === 'number' && scanProgress < 100 && <ProgressRing progress={scanProgress} colorClass="text-sky-500" />}
                                        {typeof videoCacheProgress === 'number' && videoCacheProgress < 100 && <ProgressRing progress={videoCacheProgress} colorClass="text-cyan-500" />}
                                        {albumCountLabel}: {albumCount}
                                    </div>
                                </div>
                                <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white/95 to-transparent pointer-events-none" />
                            </div>
                        </>
                    ) : (
                        /* ── DESKTOP TOOLBAR (existing) ── */
                        <>
                            <div className="px-4 py-1.5 border-b border-gray-200 flex items-center gap-3">
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <AppMenuButton accent="cyan" />
                                    <Film size={20} className="text-cyan-500" />
                                    <h2 className="font-bold text-lg text-gray-800">Videos</h2>
                                </div>
                                {collections.length > 0 && (
                                    <div ref={collectionRef} className="flex-1 min-w-0 overflow-x-auto flex items-center gap-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', flexWrap: 'nowrap' }} onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
                                        {collections.map(c => (
                                            <button type="button" key={c} data-active-col={selectedCollection === c} onClick={() => onSetCollection(c)} className={`flex-shrink-0 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-all ${selectedCollection === c ? 'bg-cyan-500 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:border-cyan-200'}`}>{c}</button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                                    <div className="flex items-center gap-0 bg-gray-100 rounded-md p-0.5 mr-0.5">
                                        <button type="button" onClick={() => onSetColumns(Math.max(1, columns - 1))} className="p-1.5 text-gray-500 hover:text-cyan-500 transition-colors" title="Zoom In"><ZoomIn size={16} /></button>
                                        <button type="button" onClick={() => onSetColumns(Math.min(48, columns + 1))} className="p-1.5 text-gray-500 hover:text-cyan-500 transition-colors" title="Zoom Out"><ZoomOut size={16} /></button>
                                    </div>
                                    <div className="flex items-center gap-0 bg-gray-100 rounded-md p-0.5 mr-1">
                                        <button type="button" onClick={toggleGridView} className={`p-1.5 rounded-md transition-all ${viewMode === 'square' ? 'bg-white text-cyan-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title={gridModeTitle}><GridModeIcon mode={viewMode === 'square' ? gridDisplayMode : 'fill'} size={16} /></button>
                                        <button type="button" onClick={() => onSetViewMode('masonry')} className={`p-1.5 rounded-md transition-all ${viewMode === 'masonry' ? 'bg-white text-cyan-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Masonry grid"><LayoutDashboard size={16} /></button>
                                    </div>
                                    <div className="flex items-center gap-0.5 mr-1 border-r border-gray-200 pr-1">
                                        <button type="button" onClick={onRefresh} disabled={isRefreshing} className={`p-1.5 rounded-md transition-all ${isRefreshing ? 'text-sky-500 bg-sky-50' : 'text-gray-500 hover:text-sky-500 hover:bg-sky-50'}`} title={isRefreshing ? 'Refreshing visible video thumbnails...' : 'Refresh visible video thumbnails'}>
                                            {isRefreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                                        </button>
                                        <button type="button" onClick={onScanDuplicates} disabled={isScanning} className={`p-1.5 rounded-md transition-all ${isScanning ? 'text-orange-400 animate-pulse' : 'text-gray-500 hover:text-orange-500 hover:bg-orange-50'}`} title="Scan Duplicates">
                                            {isScanning ? <Loader2 size={18} className="animate-spin" /> : <FileWarning size={18} />}
                                        </button>
                                        <button type="button" onClick={isSelectMode && selectedIds.size > 0 ? onDownloadSelected : onExport} className={`p-1.5 rounded-md transition-all ${isSelectMode && selectedIds.size > 0 ? 'bg-green-500 text-white shadow-sm hover:bg-green-600' : 'text-gray-500 hover:text-cyan-500 hover:bg-cyan-50'}`} title={isSelectMode && selectedIds.size > 0 ? 'Download selected' : 'Export All'}><Download size={18} /></button>
                                        <button type="button" onClick={isSelectMode && selectedIds.size > 0 ? onBulkDeleteSelected : onToggleDeleteMode} className={`p-1.5 rounded-md transition-all ${isSelectMode && selectedIds.size > 0 ? 'bg-red-500 text-white shadow-sm hover:bg-red-600' : isDeleteMode ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500 hover:text-red-500 hover:bg-red-50'}`} title={isSelectMode && selectedIds.size > 0 ? 'Delete selected' : 'Delete mode'}><Trash2 size={18} /></button>
                                        {isSelectMode && selectedIds.size > 0 && (
                                            <button type="button" onClick={() => onOpenActionModal('move')} className="p-1.5 rounded-md transition-all bg-orange-500 text-white shadow-sm hover:bg-orange-600" title="Move selected to..."><FolderInput size={18} /></button>
                                        )}
                                        <button
                                            type="button"
                                            title={!isSelectMode ? 'Enter select mode' : selectedIds.size < items.filter(i => !!i.id).length ? 'Select all' : 'Exit select mode'}
                                            onClick={() => {
                                                if (!isSelectMode) {
                                                    onToggleSelectMode();
                                                } else if (selectedIds.size < items.filter(i => !!i.id).length) {
                                                    onSelectAll(items.filter((i: VideoItem) => !!i.id).map((i: VideoItem) => i.id as string));
                                                } else {
                                                    onToggleSelectMode();
                                                }
                                            }}
                                            className={`p-1.5 rounded-md transition-all ${isSelectMode ? 'bg-cyan-500 text-white shadow-sm' : 'text-gray-500 hover:text-cyan-500 hover:bg-cyan-50'}`}
                                        ><CheckSquare size={18} /></button>
                                    </div>
                                    <button type="button" onClick={onAddManual} className="inline-flex items-center justify-center w-7 h-7 bg-white hover:bg-gray-100 text-gray-600 rounded transition-colors border border-gray-200 shadow-sm" title="Upload"><CloudUpload size={18} /></button>
                                    <button type="button" onClick={onHeaderImport} className="inline-flex items-center justify-center w-7 h-7 bg-white hover:bg-gray-100 text-gray-600 rounded transition-colors border border-gray-200 shadow-sm" title="Import folder"><FolderOpen size={18} /></button>
                                    {onFolderInfo && <button type="button" onClick={onFolderInfo} className="inline-flex items-center justify-center w-7 h-7 bg-white hover:bg-gray-100 text-gray-600 rounded transition-colors border border-gray-200 shadow-sm" title="Collection info"><Info size={18} /></button>}
                                    <div className="relative">
                                        <button type="button" onClick={onToggleMenu} className="inline-flex items-center justify-center w-7 h-7 bg-cyan-500 text-white rounded hover:bg-cyan-600 transition-colors shadow-sm" title="Slideshow">
                                            <Play size={16} className="fill-current" />
                                        </button>
                                        {menuOpen && (
                                            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-fadeIn">
                                                <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50 mb-1">Select Mode</div>
                                                <button type="button" onClick={() => onSlideshow('tiles-shifting')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-cyan-50 flex items-center gap-2"><Grid2x2 size={14} /> Tiles Shifting</button>
                                                <button type="button" onClick={() => onSlideshow('sliding-tiles')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-cyan-50 flex items-center gap-2"><Grid2x2 size={14} /> Sliding Tiles</button>
                                                <button type="button" onClick={() => onSlideshow('wings')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-cyan-50 flex items-center gap-2"><LayoutTemplate size={14} /> Cinema Wings</button>
                                                <button type="button" onClick={() => onSlideshow('vista')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-cyan-50 flex items-center gap-2"><LayoutTemplate size={14} /> Cinema Vista</button>
                                                <button type="button" onClick={() => onSlideshow('flow-drift')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-cyan-50 flex items-center gap-2"><Waves size={14} /> Flow Drift</button>
                                                <button type="button" onClick={() => onSlideshow('quad-horizon')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-cyan-50 flex items-center gap-2"><LayoutGrid size={14} /> Quad Horizon</button>
                                            </div>
                                        )}
                                    </div>
                                    <button type="button" onClick={onToggleFullscreen} className="inline-flex items-center justify-center w-7 h-7 bg-gray-800 text-white rounded hover:bg-black transition-colors shadow-sm" title="Fullscreen"><Expand size={16} /></button>
                                    {!hideLayoutToggle && (
                                        <button type="button" onClick={onToggleLayout} className={`p-1.5 rounded-full transition-colors border shadow-sm ${layoutMode === 'video-full' ? 'bg-cyan-500 text-white border-cyan-600' : 'bg-white hover:bg-gray-100 text-gray-600 border-gray-200'}`} title="Toggle layout">
                                            {layoutMode === 'video-full' ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {/* Desktop album filter chips */}
                            <div className="px-4 py-1.5 border-b border-gray-200 flex items-center gap-3">
                                <div className="flex-1 min-w-0 overflow-x-auto flex items-center gap-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', flexWrap: 'nowrap' }} onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
                                    {albumFilters.map(cat => cat === 'Favorites' ? (
                                        <button type="button" key="Favorites" onClick={() => onSetFilter('Favorites')} title="Favorites" aria-label="Favorites" className={`flex-shrink-0 flex items-center justify-center px-2.5 py-1 rounded-md transition-all ${filter === 'Favorites' ? 'bg-cyan-500 text-white shadow-md' : 'bg-cyan-50 text-cyan-400 border border-cyan-200 hover:bg-cyan-100'}`}><Heart size={14} className={filter === 'Favorites' ? 'fill-current' : ''} /></button>
                                    ) : (
                                        <button type="button" key={cat} onClick={() => onSetFilter(cat)} className={`flex-shrink-0 flex items-center px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-all ${filter === cat ? 'bg-cyan-500 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:border-cyan-200'}`}><span>{cat}</span></button>
                                    ))}
                                </div>
                                <div className="flex-shrink-0 rounded-md border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-600 shadow-sm whitespace-nowrap inline-flex items-center gap-1.5">
                                    {typeof scanProgress === 'number' && scanProgress < 100 && <ProgressRing progress={scanProgress} colorClass="text-sky-500" />}
                                    {typeof videoCacheProgress === 'number' && videoCacheProgress < 100 && <ProgressRing progress={videoCacheProgress} colorClass="text-cyan-500" />}
                                    {albumCountLabel}: {albumCount}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Grid ── */}
            <div className="p-1 bg-gray-100 relative flex flex-col">
                {!(items.length === 0 && (filter === 'All' || filter === 'Favorites')) && (
                    viewMode === 'square' ? (
                        <div
                            ref={gridRef}
                            className={`grid gap-1 ${isSelectMode && onAddToSelection ? 'touch-none select-none' : ''}`}
                            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                            onDragStart={(e) => e.preventDefault()}
                            onPointerDown={onVDragDown}
                            onPointerMove={onVDragMove}
                            onPointerUp={onVDragUp}
                            onPointerCancel={onVDragUp}
                            onClickCapture={onVGridClick}
                        >
                            {items.map((video, idx) => {
                                const isFav = video.id ? favorites.has(video.id) : false;
                                const isSelected = video.id ? (selectedIds.has(video.id) || vDragVisual.has(video.id)) : false;
                                return (
                                    <VideoCard key={video.id || video.video || idx} video={video} idx={idx} scrollRootEl={scrollRootEl} viewMode="square" gridDisplayMode={gridDisplayMode} isSelectMode={isSelectMode} isSelected={isSelected} isDeleteMode={isDeleteMode} isFav={isFav} onItemClick={onItemClick} onToggleSelection={onToggleSelection} onToggleFavorite={onToggleFavorite} onDelete={onDelete} onContextMenu={onItemContextMenu} />
                                );
                            })}
                            {filter !== 'Favorites' && (filter !== 'All' || items.length > 0) && !isSelectMode && (
                                <div onClick={onGridImport} className="relative aspect-video cursor-pointer group overflow-hidden bg-white border-2 border-dashed border-gray-200 hover:border-cyan-300 hover:bg-cyan-50 transition-all flex flex-col items-center justify-center gap-1 rounded-md">
                                    <Plus size={24} className="text-gray-300 group-hover:text-cyan-400 transition-colors" />
                                    <span className="text-[10px] uppercase font-bold text-gray-400 group-hover:text-cyan-400">Add</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="gap-4 px-2 py-4 space-y-4" style={{ columnCount: columns }}>
                            {items.map((video, idx) => {
                                const isFav = video.id ? favorites.has(video.id) : false;
                                const isSelected = video.id ? selectedIds.has(video.id) : false;
                                return (
                                    <VideoCard key={video.id || video.video || idx} video={video} idx={idx} scrollRootEl={scrollRootEl} viewMode="masonry" isSelectMode={isSelectMode} isSelected={isSelected} isDeleteMode={isDeleteMode} isFav={isFav} onItemClick={onItemClick} onToggleSelection={onToggleSelection} onToggleFavorite={onToggleFavorite} onDelete={onDelete} onContextMenu={onItemContextMenu} />
                                );
                            })}
                            {filter !== 'Favorites' && (filter !== 'All' || items.length > 0) && !isSelectMode && (
                                <div onClick={onGridImport} className="break-inside-avoid relative w-full aspect-video cursor-pointer group overflow-hidden bg-white border-2 border-dashed border-gray-200 hover:border-cyan-300 hover:bg-cyan-50 transition-all flex flex-col items-center justify-center gap-1 rounded-xl mb-4">
                                    <Plus size={24} className="text-gray-300 group-hover:text-cyan-400 transition-colors" />
                                    <span className="text-xs uppercase font-bold text-gray-400 group-hover:text-cyan-400">Add</span>
                                </div>
                            )}
                        </div>
                    )
                )}
                {items.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-gray-400 gap-4 py-96">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center"><Film size={24} className="opacity-20" /></div>
                        {filter === 'Favorites' && <p className="text-xs">No favorites yet.</p>}
                        {filter === 'All' && <button type="button" onClick={onGridImport} className="mt-1 px-4 py-2 bg-cyan-500 text-white text-sm font-bold rounded-full shadow hover:bg-cyan-600 transition-colors flex items-center gap-2"><Plus size={16} /> Import Folder</button>}
                    </div>
                )}
            </div>

            {isFullscreen && (
                <button type="button" onClick={onToggleFullscreen} title="Exit fullscreen" className="fixed bottom-6 right-6 z-[100] p-4 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-all shadow-xl border border-white/20 group"><Shrink size={24} className="group-hover:scale-90 transition-transform" /></button>
            )}

            {isSelectMode && selectedIds.size > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 bg-white/95 backdrop-blur-md border border-gray-200 p-2 rounded-2xl shadow-2xl animate-fadeIn">
                    <div className="px-3 text-sm font-bold text-gray-600 border-r border-gray-200 mr-1">{selectedIds.size} Selected</div>
                    <button type="button" onClick={() => onOpenActionModal('copy')} className="flex flex-col items-center justify-center p-2 text-gray-600 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-all gap-1 min-w-[60px]"><Copy size={18} /><span className="text-[9px] uppercase font-bold tracking-wide">Copy To</span></button>
                    <button type="button" onClick={() => onOpenActionModal('move')} className="flex flex-col items-center justify-center p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all gap-1 min-w-[60px]"><FolderInput size={18} /><span className="text-[9px] uppercase font-bold tracking-wide">Move To</span></button>
                    <button type="button" onClick={onDownloadSelected} className="flex flex-col items-center justify-center p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all gap-1 min-w-[60px]"><Download size={18} /><span className="text-[9px] uppercase font-bold tracking-wide">Download</span></button>
                    <button type="button" onClick={onBulkDeleteSelected} className="flex flex-col items-center justify-center p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all gap-1 min-w-[60px]"><Trash2 size={18} /><span className="text-[9px] uppercase font-bold tracking-wide">Delete</span></button>
                    <button type="button" onClick={onClearSelection} title="Clear selection" className="flex flex-col items-center justify-center p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all gap-1 ml-1"><X size={18} /></button>
                </div>
            )}

            {/* ── More Menu Bottom Sheet (compact only) ── */}
            {moreMenuOpen && isCompact && (
                <>
                    <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm" onClick={() => setMoreMenuOpen(false)} />
                    <div className="fixed bottom-0 left-0 right-0 z-[201] bg-white rounded-t-2xl shadow-2xl flex flex-col" style={{ maxHeight: '78vh' }}>
                        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                            <div className="w-10 h-1 bg-gray-200 rounded-full" />
                        </div>
                        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 flex-shrink-0">
                            <span className="font-bold text-gray-800 text-sm">Videos Options</span>
                            <button type="button" onClick={() => setMoreMenuOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X size={18} /></button>
                        </div>
                        <div className="overflow-y-auto flex-1 pb-safe">
                            <div className="px-4 pt-3 pb-1">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">View</div>
                                <button type="button"
                                    onClick={() => { if (viewMode === 'square') { onSetGridDisplayMode(gridDisplayMode === 'fill' ? 'ratio' : 'fill'); } else { onSetViewMode('square'); } setMoreMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                                    {viewMode === 'square' ? <GridModeIcon mode={gridDisplayMode === 'fill' ? 'ratio' : 'fill'} size={18} className="text-cyan-500" /> : <GridModeIcon mode="fill" size={18} className="text-cyan-500" />}
                                    <span>{viewMode === 'square' ? `Switch to ${gridDisplayMode === 'fill' ? 'Ratio' : 'Fill'} Grid` : 'Switch to Square Grid'}</span>
                                    <span className="ml-auto text-xs text-gray-400">{viewMode === 'square' ? `Grid ${gridModeLabel}` : 'Square'}</span>
                                </button>
                                <button type="button"
                                    onClick={() => { onSetViewMode('masonry'); setMoreMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                                    <LayoutDashboard size={18} className="text-cyan-500" />
                                    <span>Switch to Masonry</span>
                                    <span className="ml-auto text-xs text-gray-400">Masonry</span>
                                </button>
                            </div>
                            <div className="px-4 pt-1 pb-1">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 border-t border-gray-100 pt-3">Actions</div>
                                <button type="button" onClick={() => { onScanDuplicates(); setMoreMenuOpen(false); }} disabled={isScanning}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-sm text-gray-700 transition-colors disabled:opacity-50">
                                    {isScanning ? <Loader2 size={18} className="animate-spin text-orange-400" /> : <FileWarning size={18} className="text-orange-500" />}
                                    <span>Scan Duplicates</span>
                                </button>
                                <button type="button" onClick={() => { (isSelectMode && selectedIds.size > 0 ? onDownloadSelected : onExport)(); setMoreMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                                    <Download size={18} className="text-green-500" />
                                    <span>{isSelectMode && selectedIds.size > 0 ? 'Download Selected' : 'Export All'}</span>
                                </button>
                                <button type="button" onClick={() => { onToggleDeleteMode(); setMoreMenuOpen(false); }}
                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors ${isDeleteMode ? 'text-red-600 bg-red-50 hover:bg-red-100' : 'text-gray-700 hover:bg-gray-50'}`}>
                                    <Trash2 size={18} className="text-red-500" />
                                    <span>{isDeleteMode ? 'Exit Delete Mode' : 'Delete Mode'}</span>
                                    {isDeleteMode && <span className="ml-auto text-xs font-bold text-red-500 bg-red-100 px-1.5 py-0.5 rounded">ON</span>}
                                </button>
                                <button type="button"
                                    onClick={() => {
                                        if (!isSelectMode) { onToggleSelectMode(); }
                                        else if (selectedIds.size < items.filter(i => !!i.id).length) { onSelectAll(items.filter(i => !!i.id).map(i => i.id as string)); }
                                        else { onToggleSelectMode(); }
                                        setMoreMenuOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors ${isSelectMode ? 'text-cyan-600 bg-cyan-50 hover:bg-cyan-100' : 'text-gray-700 hover:bg-gray-50'}`}>
                                    <CheckSquare size={18} className="text-cyan-500" />
                                    <span>{!isSelectMode ? 'Select Mode' : selectedIds.size < items.filter(i => !!i.id).length ? 'Select All' : 'Exit Select Mode'}</span>
                                    {isSelectMode && <span className="ml-auto text-xs font-bold text-cyan-500 bg-cyan-100 px-1.5 py-0.5 rounded">ON</span>}
                                </button>
                                <button type="button" onClick={() => { onAddManual(); setMoreMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                                    <CloudUpload size={18} className="text-blue-500" />
                                    <span>Upload Videos</span>
                                </button>
                                <button type="button" onClick={() => { onHeaderImport(); setMoreMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                                    <FolderOpen size={18} className="text-yellow-600" />
                                    <span>Import Folder</span>
                                </button>
                            </div>
                            <div className="px-4 pt-1 pb-1">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 border-t border-gray-100 pt-3">Slideshow</div>
                                {([
                                    { id: 'tiles-shifting', label: 'Tiles Shifting', Icon: Grid2x2 },
                                    { id: 'sliding-tiles', label: 'Sliding Tiles', Icon: Grid2x2 },
                                    { id: 'wings',        label: 'Cinema Wings',   Icon: LayoutTemplate },
                                    { id: 'vista',        label: 'Cinema Vista',   Icon: LayoutTemplate },
                                    { id: 'flow-drift',   label: 'Flow Drift',     Icon: Waves },
                                    { id: 'quad-horizon', label: 'Quad Horizon',   Icon: LayoutGrid },
                                ] as const).map(({ id, label, Icon }) => (
                                    <button type="button" key={id}
                                        onClick={() => { onSlideshow(id as any); setMoreMenuOpen(false); }}
                                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-cyan-50 hover:text-cyan-600 text-sm text-gray-700 transition-colors">
                                        <Icon size={18} className="text-cyan-400" />
                                        <span>{label}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="px-4 pt-1 pb-6">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 border-t border-gray-100 pt-3">Display</div>
                                <button type="button" onClick={() => { onToggleFullscreen(); setMoreMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                                    <Expand size={18} className="text-gray-600" />
                                    <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
                                </button>
                                {!hideLayoutToggle && (
                                    <button type="button" onClick={() => { onToggleLayout(); setMoreMenuOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors ${layoutMode === 'video-full' ? 'text-cyan-600 bg-cyan-50 hover:bg-cyan-100' : 'text-gray-700 hover:bg-gray-50'}`}>
                                        {layoutMode === 'video-full' ? <Minimize2 size={18} className="text-cyan-500" /> : <Maximize2 size={18} className="text-gray-600" />}
                                        <span>{layoutMode === 'video-full' ? 'Restore Split View' : 'Expand Videos'}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ── Album Overflow Bottom Sheet (compact only) ── */}
            {albumOverflowOpen && isCompact && (
                <>
                    <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm" onClick={() => setAlbumOverflowOpen(false)} />
                    <div className="fixed bottom-0 left-0 right-0 z-[201] bg-white rounded-t-2xl shadow-2xl">
                        <div className="flex justify-center pt-3 pb-1">
                            <div className="w-10 h-1 bg-gray-200 rounded-full" />
                        </div>
                        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                            <span className="font-bold text-gray-800 text-sm">Albums</span>
                            <button type="button" onClick={() => setAlbumOverflowOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X size={18} /></button>
                        </div>
                        <div className="px-4 py-3 flex flex-wrap gap-2 max-h-64 overflow-y-auto pb-6">
                            {albumFilters.map(cat => cat === 'Favorites' ? (
                                <button type="button" key="Favorites"
                                    onClick={() => { onSetFilter('Favorites'); setAlbumOverflowOpen(false); }}
                                    title="Favorites" aria-label="Favorites"
                                    className={`flex items-center justify-center px-3 py-2 rounded-xl transition-all ${filter === 'Favorites' ? 'bg-cyan-500 text-white shadow-sm' : 'bg-cyan-50 text-cyan-400 border border-cyan-200 hover:bg-cyan-100'}`}>
                                    <Heart size={16} className={filter === 'Favorites' ? 'fill-current' : ''} />
                                </button>
                            ) : (
                                <button type="button" key={cat}
                                    onClick={() => { onSetFilter(cat); setAlbumOverflowOpen(false); }}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${filter === cat ? 'bg-cyan-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
