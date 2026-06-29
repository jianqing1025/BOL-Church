
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Play, FolderOpen, Plus, LayoutTemplate, Film, Grid2x2, Image as ImageIcon, CloudUpload, Minus, Maximize2, Minimize2, Heart, LayoutDashboard, ZoomIn, ZoomOut, Download, Trash2, Expand, Shrink, CheckSquare, Copy, FolderInput, FileWarning, Loader2, X, Waves, CheckCircle, RefreshCw, MoreVertical, Info, ArrowUpDown } from 'lucide-react';
import { GalleryItem, ExifData, SlideshowMode, SortField, SortDir } from '../../types';
import { getOptimizedUrl } from '../../utils';
import { fetchExif } from '../../services/exifParser';
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

// ─── EXIF overlay ─────────────────────────────────────────────────────────────
const fmtBytes = (b: number): string => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const ExifOverlay: React.FC<{ img: GalleryItem; exif: ExifData | null }> = React.memo(({ img, exif }) => {
    const formatCreatedAt = (ca: any): string => {
        if (!ca) return '';
        try {
            if (typeof ca.toDate === 'function') return ca.toDate().toLocaleString();
            if (typeof ca.toMillis === 'function') return new Date(ca.toMillis()).toLocaleString();
            if (ca instanceof Date) return ca.toLocaleString();
        } catch {}
        return '';
    };
    const uploadedAt = formatCreatedAt(img.createdAt);
    const rows = (
        [
            exif?.shotAt       ? ['Shot At', exif.shotAt]                       : null,
            exif?.camera       ? ['Camera',  exif.camera]                       : null,
            exif?.lens         ? ['Lens',    exif.lens]                         : null,
            exif?.focalLength  ? ['Focal',   exif.focalLength]                  : null,
            exif?.aperture     ? ['F',       exif.aperture]                     : null,
            exif?.shutter      ? ['Shutter', exif.shutter]                      : null,
            exif?.iso != null  ? ['ISO',     String(exif.iso)]                  : null,
            exif?.width && exif?.height ? ['Pixels', `${exif.width}×${exif.height}`] : null,
            (exif?.sizeBytes ?? img.sizeBytes) != null ? ['Size', fmtBytes((exif?.sizeBytes ?? img.sizeBytes)!)] : null,
            img.title          ? ['Title',   img.title]                         : null,
            uploadedAt         ? ['Upload',  uploadedAt]                        : null,
        ] as ([string, string] | null)[]
    ).filter((r): r is [string, string] => r !== null);

    if (rows.length === 0) return null;
    return (
        <div className="absolute bottom-2 left-2 z-30 w-[38%] min-w-[180px] max-w-[260px] rounded-lg border border-white/[0.06] bg-black/[0.05] px-2.5 py-1.5 pointer-events-none shadow-sm backdrop-blur-[1px] exif-enter text-left">
            {rows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[48px_minmax(0,1fr)] items-baseline gap-x-1.5">
                    <span className="text-[8px] uppercase tracking-wide text-white/45">{label}</span>
                    <span className="truncate text-[9px] font-medium leading-tight text-white/90">{value}</span>
                </div>
            ))}
        </div>
    );
});
ExifOverlay.displayName = 'ExifOverlay';

// ─── PhotoCard ────────────────────────────────────────────────────────────────
interface PhotoCardProps {
    img: GalleryItem;
    idx: number;
    viewMode: 'square' | 'masonry';
    gridDisplayMode?: GridDisplayMode;
    isSelectMode: boolean;
    isSelected: boolean;
    isDeleteMode: boolean;
    isFav: boolean;
    onToggleSelection: (id: string) => void;
    onItemClick: (idx: number, id: string) => void;
    onToggleFavorite: (id: string) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    onContextMenu?: (id: string, x: number, y: number) => void;
}

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

const PhotoCard: React.FC<PhotoCardProps> = React.memo(({
    img, idx, viewMode, gridDisplayMode = 'fill', isSelectMode, isSelected, isDeleteMode, isFav,
    onToggleSelection, onItemClick, onToggleFavorite, onDelete, onContextMenu,
}) => {
    const [isHovered, setIsHovered] = useState(false);
    const [exif, setExif] = useState<ExifData | null>(img.exif ?? null);
    const triedRef = useRef(false);

    const handleMouseEnter = useCallback(async () => {
        setIsHovered(true);
        if (!triedRef.current && img.src) {
            triedRef.current = true;
            const result = await fetchExif(img.src);
            if (result) setExif(prev => ({ ...result, ...(prev ?? {}) }));
        }
    }, [img.src]);

    const handleMouseLeave = useCallback(() => setIsHovered(false), []);

    const sq = viewMode === 'square';
    const showRatioPreview = sq && gridDisplayMode === 'ratio';
    const imageSrc = showRatioPreview
        ? getOptimizedUrl(img.src, 'masonry')
        : (sq ? (img.thumbSrc || getOptimizedUrl(img.src, 'grid')) : getOptimizedUrl(img.src, 'masonry'));
    return (
        <div
            data-photo-id={img.id || undefined}
            className={sq
                ? `relative aspect-square cursor-pointer group overflow-hidden ${showRatioPreview ? 'rounded-xl border border-gray-200/80 bg-white shadow-sm' : ''} ${isSelected ? 'ring-4 ring-indigo-500 z-10' : ''}`
                : `break-inside-avoid relative cursor-pointer group overflow-hidden rounded-xl shadow-sm mb-4 ${isSelected ? 'ring-4 ring-indigo-500' : ''}`}
            onClick={() => { if (isSelectMode && img.id) onToggleSelection(img.id); else if (img.id) onItemClick(idx, img.id); }}
            onContextMenu={(e) => { if (img.id && onContextMenu) { e.preventDefault(); e.stopPropagation(); onContextMenu(img.id, e.clientX, e.clientY); } }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {showRatioPreview ? (
                <>
                    <div className={`absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-gray-100 transition-colors ${isSelectMode ? '' : 'group-hover:from-rose-50 group-hover:to-white'}`} />
                    <img
                        {...(img.sourceType !== 'local' ? { crossOrigin: 'anonymous' } : {})}
                        src={imageSrc}
                        loading="lazy"
                        className={`absolute inset-0 w-full h-full object-contain p-2 transition-transform duration-500 ${isSelected ? 'scale-95' : isSelectMode ? '' : 'group-hover:scale-[1.03]'}`}
                        alt=""
                    />
                </>
            ) : (
                <>
                    <img {...(img.sourceType !== 'local' ? { crossOrigin: 'anonymous' } : {})} src={imageSrc} loading="lazy"
                        className={sq
                            ? `w-full h-full object-cover transition-transform duration-500 ${isSelectMode ? '' : 'group-hover:scale-110'} ${isSelected ? 'scale-90' : ''}`
                            : `w-full h-auto object-cover transition-transform duration-500 ${isSelectMode ? '' : 'group-hover:scale-105'} ${isSelected ? 'scale-95' : ''}`}
                        alt="" />
                    {sq && <div className={`absolute inset-0 bg-black/0 transition-colors ${isSelectMode ? '' : 'group-hover:bg-black/20'}`} />}
                </>
            )}
            {isSelectMode && <div className={`absolute top-2 right-2 p-1 rounded-full transition-all z-20 ${isSelected ? 'bg-indigo-500 text-white' : 'bg-black/30 text-white/50 border border-white/50'}`}><CheckCircle size={20} className={isSelected ? 'fill-indigo-500 text-white' : ''} /></div>}
            {!isSelectMode && <button type="button" onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (img.id) onToggleFavorite(img.id); }} title={isFav ? 'Remove favorite' : 'Add favorite'} className={`absolute ${sq ? 'top-1.5 right-1.5' : 'top-2 right-2'} p-1.5 rounded-full backdrop-blur-md transition-all z-10 ${isFav ? 'bg-rose-500 text-white shadow-sm' : 'bg-black/20 text-white/70 hover:bg-black/40 opacity-0 group-hover:opacity-100'}`}><Heart size={14} className={isFav ? 'fill-current' : ''} /></button>}
            {isDeleteMode && !isSelectMode && img.id && (<button type="button" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(img.id!, e); }} title="Delete" className={`absolute ${sq ? 'top-1.5 left-1.5' : 'top-2 left-2'} w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md hover:bg-red-700 hover:scale-110 transition-all z-20`}><Minus size={14} strokeWidth={4} /></button>)}
            {img.sourceType === 'local' && !isSelectMode && <div className="absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded bg-black/50 backdrop-blur-sm text-[9px] font-semibold text-cyan-300 uppercase tracking-wider pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">Local</div>}
            {isHovered && !isSelectMode && <ExifOverlay img={img} exif={exif} />}
        </div>
    );
});
PhotoCard.displayName = 'PhotoCard';

interface PhotoLibraryProps {
    items: GalleryItem[];
    // Two-level navigation
    collections: string[];
    selectedCollection: string;
    onSetCollection: (c: string) => void;
    albums: string[];           // album names only (no All/Favorites)
    filter: string;             // 'All' | 'Favorites' | albumName
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
    // Selection Actions
    onOpenActionModal: (type: 'move' | 'copy') => void;
    onDownloadSelected: () => void;
    onBulkDeleteSelected: () => void;
    onClearSelection: () => void;
    onSelectAll: (ids: string[]) => void;
    onAddToSelection?: (ids: string[]) => void;
    hideLayoutToggle?: boolean;
    onFolderInfo?: () => void;
    sortField: SortField;
    sortDir: SortDir;
    onSetSortField: (f: SortField) => void;
    onSetSortDir: (d: SortDir) => void;
    scanProgress?: number | null;
    thumbnailProgress?: number | null;
    hasMoreItems?: boolean;
    isLoadingMore?: boolean;
    onLoadMore?: () => void;
}

const normalizeFilterLabel = (value: string): string => {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (key === 'all') return 'All';
    if (key === 'favorites') return 'Favorites';
    return trimmed;
};

const dedupeFilterOptions = (values: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const trimmed = value?.trim();
        if (!trimmed) continue;

        const label = normalizeFilterLabel(trimmed);
        const key = label.toLowerCase();
        if (seen.has(key)) continue;

        seen.add(key);
        result.push(label);
    }

    return result;
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

export const PhotoLibrary: React.FC<PhotoLibraryProps> = ({
    items, collections, selectedCollection, onSetCollection, albums, filter, onSetFilter,
    albumCountLabel, albumCount,
    viewMode, onSetViewMode, gridDisplayMode, onSetGridDisplayMode, columns, onSetColumns,
    isSelectMode, onToggleSelectMode, selectedIds, onToggleSelection,
    isDeleteMode, onToggleDeleteMode, favorites, onToggleFavorite,
    onItemClick, onDelete, onItemContextMenu, onHeaderImport, onGridImport, onAddManual,
    onRefresh, isRefreshing, onScanDuplicates, isScanning, onExport, onSlideshow,
    menuOpen, onToggleMenu,
    isFullscreen, onToggleFullscreen, layoutMode, onToggleLayout,
    onOpenActionModal, onDownloadSelected, onBulkDeleteSelected, onClearSelection, onSelectAll,
    onAddToSelection, hideLayoutToggle, onFolderInfo,
    sortField, sortDir, onSetSortField, onSetSortDir, scanProgress, thumbnailProgress,
    hasMoreItems, isLoadingMore, onLoadMore,
}) => {
    const collectionFilters = dedupeFilterOptions(collections);
    const albumFilters = dedupeFilterOptions(['All', 'Favorites', ...albums]);
    const isCompact = useBreakpoint();
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const [albumOverflowOpen, setAlbumOverflowOpen] = useState(false);
    const [sortMenuOpen, setSortMenuOpen] = useState(false);
    const sortMenuRef = useRef<HTMLDivElement>(null);
    const collectionRef = useRef<HTMLDivElement>(null);
    const toggleGridView = useCallback(() => {
        if (viewMode !== 'square') {
            onSetViewMode('square');
            return;
        }
        onSetGridDisplayMode(gridDisplayMode === 'fill' ? 'ratio' : 'fill');
    }, [gridDisplayMode, onSetGridDisplayMode, onSetViewMode, viewMode]);
    const gridModeLabel = gridDisplayMode === 'fill' ? 'Fill' : 'Ratio';
    const gridModeTitle = viewMode === 'square' ? `Grid: ${gridModeLabel}` : 'Square grid';

    // ── Drag-select (iPhone-style swipe multi-select, square view only) ──────
    // pointerdown records start position; only enters drag mode after moving
    // beyond a threshold (5px). Single clicks pass through to PhotoCard's onClick.
    const gridRef = useRef<HTMLDivElement>(null);
    const dragState = useRef<{ active: boolean; started: boolean; startIdx: number; startX: number; startY: number; pointerId: number }>({ active: false, started: false, startIdx: -1, startX: 0, startY: 0, pointerId: -1 });
    const suppressClickUntil = useRef(0); // timestamp — suppress clicks briefly after drag-select ends
    const dragIds = useRef<Set<string>>(new Set());
    const [dragVisualIds, setDragVisualIds] = useState<Set<string>>(new Set());
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const autoScrollTimer = useRef<number | null>(null);
    const DRAG_THRESHOLD = 5;

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        if (!hasMoreItems || isLoadingMore || !onLoadMore) return;
        const el = e.currentTarget;
        const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceToBottom < 800) {
            onLoadMore();
        }
    }, [hasMoreItems, isLoadingMore, onLoadMore]);

    const getPhotoIndexFromPoint = useCallback((x: number, y: number): number => {
        const el = document.elementFromPoint(x, y);
        if (!el) return -1;
        const card = (el as HTMLElement).closest('[data-photo-id]');
        if (!card) return -1;
        const id = card.getAttribute('data-photo-id');
        return items.findIndex(i => i.id === id);
    }, [items]);

    const idsInRange = useCallback((startIdx: number, endIdx: number): Set<string> => {
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        const result = new Set<string>();
        for (let i = lo; i <= hi && i < items.length; i++) {
            const id = items[i].id;
            if (id) result.add(id);
        }
        return result;
    }, [items]);

    const handleDragPointerDown = useCallback((e: React.PointerEvent) => {
        if (!isSelectMode || viewMode !== 'square' || !onAddToSelection) return;
        if (e.button !== 0) return; // left button only
        const idx = getPhotoIndexFromPoint(e.clientX, e.clientY);
        if (idx < 0) return;

        // Record start — don't preventDefault yet, let click through for single taps
        dragState.current = { active: true, started: false, startIdx: idx, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
    }, [isSelectMode, viewMode, onAddToSelection, getPhotoIndexFromPoint]);

    const handleDragPointerMove = useCallback((e: React.PointerEvent) => {
        const s = dragState.current;
        if (!s.active) return;

        // Check if we've moved past the threshold to enter real drag mode
        if (!s.started) {
            const dx = e.clientX - s.startX;
            const dy = e.clientY - s.startY;
            if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;

            // Crossed threshold — enter drag mode, capture pointer, suppress future clicks
            s.started = true;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

            const rangeIds = idsInRange(s.startIdx, s.startIdx);
            dragIds.current = rangeIds;
            setDragVisualIds(rangeIds);
        }

        e.preventDefault();

        const idx = getPhotoIndexFromPoint(e.clientX, e.clientY);
        if (idx >= 0) {
            const rangeIds = idsInRange(s.startIdx, idx);
            if (rangeIds.size !== dragIds.current.size) {
                dragIds.current = rangeIds;
                setDragVisualIds(rangeIds);
            }
        }

        // Auto-scroll near edges
        const container = scrollContainerRef.current;
        if (container) {
            const rect = container.getBoundingClientRect();
            const edgeZone = 60;
            const distTop = e.clientY - rect.top;
            const distBottom = rect.bottom - e.clientY;

            if (autoScrollTimer.current) { cancelAnimationFrame(autoScrollTimer.current); autoScrollTimer.current = null; }

            if (distTop < edgeZone && distTop > 0) {
                const speed = Math.max(2, (edgeZone - distTop) / 3);
                const scroll = () => { if (!dragState.current.started) return; container.scrollTop -= speed; autoScrollTimer.current = requestAnimationFrame(scroll); };
                autoScrollTimer.current = requestAnimationFrame(scroll);
            } else if (distBottom < edgeZone && distBottom > 0) {
                const speed = Math.max(2, (edgeZone - distBottom) / 3);
                const scroll = () => { if (!dragState.current.started) return; container.scrollTop += speed; autoScrollTimer.current = requestAnimationFrame(scroll); };
                autoScrollTimer.current = requestAnimationFrame(scroll);
            }
        }
    }, [getPhotoIndexFromPoint, idsInRange]);

    const handleDragPointerUp = useCallback((e: React.PointerEvent) => {
        const s = dragState.current;
        if (!s.active) return;

        const wasDrag = s.started;
        dragState.current = { active: false, started: false, startIdx: -1, startX: 0, startY: 0, pointerId: -1 };

        if (autoScrollTimer.current) { cancelAnimationFrame(autoScrollTimer.current); autoScrollTimer.current = null; }

        if (wasDrag && dragIds.current.size > 0 && onAddToSelection) {
            onAddToSelection([...dragIds.current]);
            // Mark to suppress the click event that fires right after pointerup
            suppressClickUntil.current = Date.now() + 100;
        }
        dragIds.current = new Set();
        setDragVisualIds(new Set());
    }, [onAddToSelection]);

    /** Capture click on the grid — suppress if it fires right after a drag-select */
    const handleGridClickCapture = useCallback((e: React.MouseEvent) => {
        if (Date.now() < suppressClickUntil.current) {
            e.stopPropagation();
            e.preventDefault();
        }
    }, []);

    // Scroll active collection chip into view when selection changes
    useEffect(() => {
        const el = collectionRef.current;
        if (!el) return;
        const active = el.querySelector('[data-active-col="true"]') as HTMLElement | null;
        if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }, [selectedCollection]);

    // Close sort menu on click-outside or Escape
    useEffect(() => {
        if (!sortMenuOpen) return;
        const onClickOutside = (e: MouseEvent) => {
            if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setSortMenuOpen(false);
        };
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSortMenuOpen(false); };
        document.addEventListener('mousedown', onClickOutside);
        document.addEventListener('keydown', onEsc);
        return () => { document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('keydown', onEsc); };
    }, [sortMenuOpen]);

    // Lock body scroll when a sheet is open
    useEffect(() => {
        if (moreMenuOpen || albumOverflowOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [moreMenuOpen, albumOverflowOpen]);

    return (
        <div ref={scrollContainerRef} onScroll={handleScroll} className={`flex-col border-r border-gray-200 bg-white relative transition-all duration-300 ease-in-out overflow-y-auto ${layoutMode === 'video-full' ? 'hidden' : 'flex-1 flex'} ${isFullscreen ? 'fixed inset-0 z-50 w-full h-full' : ''}`}>
            {/* ── Toolbar ── */}
            {!isFullscreen && (
                <div className="sticky top-0 z-20 bg-white/70 backdrop-blur-md shadow-sm">
                    {isCompact ? (
                        /* ── COMPACT TOOLBAR (mobile / tablet) ── */
                        <>
                            <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
                                {/* Left: icon + title (fixed) */}
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <AppMenuButton accent="rose" />
                                    <ImageIcon size={17} className="text-rose-500" />
                                    <h2 className="font-bold text-sm text-gray-800">Photos</h2>
                                </div>
                                {/* Middle: collection chips — inline horizontal scroll */}
                                {collectionFilters.length > 0 && (
                                    <div
                                        ref={collectionRef}
                                        className="flex-1 min-w-0 overflow-x-auto flex items-center gap-1.5"
                                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', flexWrap: 'nowrap' }}
                                        onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}
                                    >
                                        {collectionFilters.map(c => (
                                            <button type="button" key={c}
                                                data-active-col={selectedCollection === c}
                                                onClick={() => onSetCollection(c)}
                                                className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide whitespace-nowrap transition-all ${selectedCollection === c ? 'bg-rose-500 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:bg-rose-50 hover:border-rose-200'}`}>
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {/* Right: status badges + zoom + more (fixed) */}
                                <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
                                    {isDeleteMode && (
                                        <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded mr-1">DEL</span>
                                    )}
                                    {isSelectMode && (
                                        <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded mr-1">
                                            {selectedIds.size > 0 ? `${selectedIds.size}✓` : 'SEL'}
                                        </span>
                                    )}
                                    <button type="button" onClick={() => onSetColumns(Math.max(1, columns - 1))} className="p-2 text-gray-500 hover:text-rose-500 rounded-lg transition-colors" title="Zoom In"><ZoomIn size={17} /></button>
                                    <button type="button" onClick={() => onSetColumns(Math.min(40, columns + 1))} className="p-2 text-gray-500 hover:text-rose-500 rounded-lg transition-colors" title="Zoom Out"><ZoomOut size={17} /></button>
                                    <button type="button" onClick={() => setMoreMenuOpen(true)}
                                        className={`p-2 rounded-lg transition-colors ${moreMenuOpen ? 'text-rose-500 bg-rose-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
                                        title="More options">
                                        <MoreVertical size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Album filter — single-row scroll */}
                            <div className="relative border-b border-gray-100">
                                <div className="px-3 py-1.5 pr-24 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
                                    {albumFilters.map(cat => cat === 'Favorites' ? (
                                        <button type="button" key="Favorites" onClick={() => onSetFilter('Favorites')}
                                            title="Favorites" aria-label="Favorites"
                                            className={`flex-shrink-0 flex items-center justify-center px-2 py-1 rounded-md transition-all ${filter === 'Favorites' ? 'bg-rose-500 text-white shadow-sm' : 'bg-rose-50 text-rose-400 border border-rose-200 hover:bg-rose-100'}`}>
                                            <Heart size={13} className={filter === 'Favorites' ? 'fill-current' : ''} />
                                        </button>
                                    ) : (
                                        <button type="button" key={cat} onClick={() => onSetFilter(cat)}
                                            className={`flex-shrink-0 flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide whitespace-nowrap transition-all ${filter === cat ? 'bg-rose-500 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:border-rose-200'}`}>
                                            {cat}
                                        </button>
                                    ))}
                                    <button type="button" onClick={() => setAlbumOverflowOpen(true)}
                                        className="flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold text-gray-400 border border-gray-200 bg-white whitespace-nowrap hover:bg-gray-50 transition-colors">
                                        ···
                                    </button>
                                </div>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                                    <div className="rounded-md border border-rose-100 bg-rose-50/95 px-2.5 py-1 text-[11px] font-bold text-rose-600 shadow-sm whitespace-nowrap inline-flex items-center gap-1.5">
                                        {typeof scanProgress === 'number' && scanProgress < 100 && <ProgressRing progress={scanProgress} colorClass="text-sky-500" />}
                                        {typeof thumbnailProgress === 'number' && thumbnailProgress < 100 && <ProgressRing progress={thumbnailProgress} colorClass="text-rose-500" />}
                                        {albumCountLabel}: {albumCount}
                                    </div>
                                </div>
                                {/* Right-fade hint */}
                                <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white/95 to-transparent pointer-events-none" />
                            </div>
                        </>
                    ) : (
                        /* ── DESKTOP TOOLBAR (existing) ── */
                        <>
                            <div className="px-4 py-1.5 border-b border-gray-100 flex items-center gap-3">
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <AppMenuButton accent="rose" />
                                    <ImageIcon size={20} className="text-rose-500" />
                                    <h2 className="font-bold text-lg text-gray-800">Photos</h2>
                                </div>
                                {/* Collection chips — inline horizontal scroll */}
                                {collectionFilters.length > 0 && (
                                    <div
                                        ref={collectionRef}
                                        className="flex-1 min-w-0 overflow-x-auto flex items-center gap-2"
                                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', flexWrap: 'nowrap' }}
                                        onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}
                                    >
                                        {collectionFilters.map(c => (
                                            <button type="button" key={c}
                                                data-active-col={selectedCollection === c}
                                                onClick={() => onSetCollection(c)}
                                                className={`flex-shrink-0 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-all ${selectedCollection === c ? 'bg-rose-500 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:border-rose-200'}`}>
                                                {c}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                                    <div className="flex items-center gap-0 bg-gray-100 rounded-md p-0.5 mr-0.5">
                                        <button type="button" onClick={() => onSetColumns(Math.max(1, columns - 1))} className="p-1.5 text-gray-500 hover:text-rose-500 transition-colors" title="Zoom In"><ZoomIn size={16} /></button>
                                        <button type="button" onClick={() => onSetColumns(Math.min(40, columns + 1))} className="p-1.5 text-gray-500 hover:text-rose-500 transition-colors" title="Zoom Out"><ZoomOut size={16} /></button>
                                    </div>
                                    <div className="flex items-center gap-0 bg-gray-100 rounded-md p-0.5 mr-1">
                                        <button type="button" onClick={toggleGridView} className={`p-1.5 rounded-md transition-all ${viewMode === 'square' ? 'bg-white text-rose-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title={gridModeTitle}><GridModeIcon mode={viewMode === 'square' ? gridDisplayMode : 'fill'} size={16} /></button>
                                        <button type="button" onClick={() => onSetViewMode('masonry')} className={`p-1.5 rounded-md transition-all ${viewMode === 'masonry' ? 'bg-white text-rose-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`} title="Masonry grid"><LayoutDashboard size={16} /></button>
                                    </div>
                                    <div className="flex items-center gap-0.5 mr-1 border-r border-gray-200 pr-1">
                                        <button type="button" onClick={onRefresh} disabled={isRefreshing} className={`p-1.5 rounded-md transition-all ${isRefreshing ? 'text-sky-500 bg-sky-50' : 'text-gray-500 hover:text-sky-500 hover:bg-sky-50'}`} title={isRefreshing ? 'Refreshing photos...' : 'Refresh photos'}>
                                            {isRefreshing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                                        </button>
                                        <button type="button" onClick={onScanDuplicates} disabled={isScanning} className={`p-1.5 rounded-md transition-all ${isScanning ? 'text-orange-400 animate-pulse' : 'text-gray-500 hover:text-orange-500 hover:bg-orange-50'}`} title="Scan Duplicates">
                                            {isScanning ? <Loader2 size={18} className="animate-spin" /> : <FileWarning size={18} />}
                                        </button>
                                        <div ref={sortMenuRef} className="relative">
                                            <button type="button" onClick={() => setSortMenuOpen(o => !o)} title="Sort" className={`inline-flex items-center justify-center w-7 h-7 rounded transition-all border ${sortMenuOpen ? 'bg-indigo-500 text-white shadow-sm border-indigo-500' : 'text-gray-500 hover:text-indigo-500 hover:bg-indigo-50 border-gray-200'}`}>
                                                <ArrowUpDown size={18} />
                                            </button>
                                            {sortMenuOpen && (
                                                <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-fadeIn">
                                                    <div className="px-3 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sort By</div>
                                                    {([
                                                        { f: 'shotAt' as SortField, label: 'Shot Date' },
                                                        { f: 'uploadedAt' as SortField, label: 'Upload Date' },
                                                        { f: 'sizeBytes' as SortField, label: 'File Size' },
                                                    ]).map(({ f, label }) => (
                                                        <button key={f} type="button" onClick={() => onSetSortField(f)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center">
                                                            <span className="w-5 flex-shrink-0 text-indigo-500 text-xs font-bold">{sortField === f ? '✓' : ''}</span>
                                                            <span>{label}</span>
                                                        </button>
                                                    ))}
                                                    <div className="my-1 border-t border-gray-100" />
                                                    <div className="px-3 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Order</div>
                                                    {([
                                                        { d: 'desc' as SortDir, label: 'Descending' },
                                                        { d: 'asc' as SortDir, label: 'Ascending' },
                                                    ]).map(({ d, label }) => (
                                                        <button key={d} type="button" onClick={() => onSetSortDir(d)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center">
                                                            <span className="w-5 flex-shrink-0 text-indigo-500 text-xs font-bold">{sortDir === d ? '✓' : ''}</span>
                                                            <span>{label}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <button type="button" onClick={isSelectMode && selectedIds.size > 0 ? onDownloadSelected : onExport} className={`p-1.5 rounded-md transition-all ${isSelectMode && selectedIds.size > 0 ? 'bg-green-500 text-white shadow-sm hover:bg-green-600' : 'text-gray-500 hover:text-rose-500 hover:bg-rose-50'}`} title={isSelectMode && selectedIds.size > 0 ? 'Download selected' : 'Export All'}><Download size={18} /></button>
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
                                                    onSelectAll(items.filter((i: GalleryItem) => !!i.id).map((i: GalleryItem) => i.id as string));
                                                } else {
                                                    onToggleSelectMode();
                                                }
                                            }}
                                            className={`p-1.5 rounded-md transition-all ${isSelectMode ? 'bg-indigo-500 text-white shadow-sm' : 'text-gray-500 hover:text-indigo-500 hover:bg-indigo-50'}`}
                                        ><CheckSquare size={18} /></button>
                                    </div>
                                    <button type="button" onClick={onAddManual} className="inline-flex items-center justify-center w-7 h-7 bg-white hover:bg-gray-100 text-gray-600 rounded transition-colors border border-gray-200 shadow-sm" title="Upload"><CloudUpload size={18} /></button>
                                    <button type="button" onClick={onHeaderImport} className="inline-flex items-center justify-center w-7 h-7 bg-white hover:bg-gray-100 text-gray-600 rounded transition-colors border border-gray-200 shadow-sm" title="Import folder"><FolderOpen size={18} /></button>
                                    {onFolderInfo && <button type="button" onClick={onFolderInfo} className="inline-flex items-center justify-center w-7 h-7 bg-white hover:bg-gray-100 text-gray-600 rounded transition-colors border border-gray-200 shadow-sm" title="Collection info"><Info size={18} /></button>}
                                    <div className="relative">
                                        <button type="button" onClick={onToggleMenu} className="inline-flex items-center justify-center w-7 h-7 bg-rose-500 text-white rounded hover:bg-rose-600 transition-colors shadow-sm" title="Slideshow">
                                            <Play size={16} className="fill-current" />
                                        </button>
                                        {menuOpen && (
                                            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-fadeIn">
                                                <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50 mb-1">Select Mode</div>
                                                <button type="button" onClick={() => onSlideshow('cascade')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Film size={14} /> Cascade</button>
                                                <button type="button" onClick={() => onSlideshow('tiles-shifting')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Grid2x2 size={14} /> Tiles Shifting</button>
                                                <button type="button" onClick={() => onSlideshow('sliding-tiles')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Grid2x2 size={14} /> Sliding Tiles</button>
                                                <button type="button" onClick={() => onSlideshow('wings')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><LayoutTemplate size={14} /> Cinema Wings</button>
                                                <button type="button" onClick={() => onSlideshow('flow-drift')} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><Waves size={14} /> Flow Drift</button>
                                            </div>
                                        )}
                                    </div>
                                    <button type="button" onClick={onToggleFullscreen} className="inline-flex items-center justify-center w-7 h-7 bg-gray-800 text-white rounded hover:bg-black transition-colors shadow-sm" title="Fullscreen"><Expand size={16} /></button>
                                    {!hideLayoutToggle && (
                                        <button type="button" onClick={onToggleLayout} className={`p-1.5 rounded-full transition-colors border shadow-sm ${layoutMode === 'photo-full' ? 'bg-rose-500 text-white border-rose-600' : 'bg-white hover:bg-gray-100 text-gray-600 border-gray-200'}`} title="Toggle layout">
                                            {layoutMode === 'photo-full' ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {/* Desktop album filter chips */}
                            <div className="px-4 py-1.5 border-b border-gray-100 flex items-center gap-3">
                                <div className="flex-1 min-w-0 overflow-x-auto flex items-center gap-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', flexWrap: 'nowrap' }} onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
                                    {albumFilters.map(cat => cat === 'Favorites' ? (
                                        <button type="button" key="Favorites" onClick={() => onSetFilter('Favorites')}
                                            title="Favorites" aria-label="Favorites"
                                            className={`flex-shrink-0 flex items-center justify-center px-2.5 py-1 rounded-md transition-all ${filter === 'Favorites' ? 'bg-rose-500 text-white shadow-md' : 'bg-rose-50 text-rose-400 border border-rose-200 hover:bg-rose-100'}`}>
                                            <Heart size={14} className={filter === 'Favorites' ? 'fill-current' : ''} />
                                        </button>
                                    ) : (
                                        <button type="button" key={cat} onClick={() => onSetFilter(cat)}
                                            className={`flex-shrink-0 flex items-center px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-all ${filter === cat ? 'bg-rose-500 text-white shadow-md' : 'bg-white text-gray-500 border border-gray-200 hover:border-rose-200'}`}>
                                            <span>{cat}</span>
                                        </button>
                                    ))}
                                </div>
                                <div className="flex-shrink-0 rounded-md border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600 shadow-sm whitespace-nowrap inline-flex items-center gap-1.5">
                                    {typeof scanProgress === 'number' && scanProgress < 100 && <ProgressRing progress={scanProgress} colorClass="text-sky-500" />}
                                    {typeof thumbnailProgress === 'number' && thumbnailProgress < 100 && <ProgressRing progress={thumbnailProgress} colorClass="text-rose-500" />}
                                    {albumCountLabel}: {albumCount}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Grid ── */}
            <div className="p-1 bg-gray-50 flex flex-col">
                {!(items.length === 0 && (filter === 'All' || filter === 'Favorites')) && (
                    viewMode === 'square' ? (
                        <div
                            ref={gridRef}
                            className={`grid gap-1 ${isSelectMode && onAddToSelection ? 'touch-none select-none' : ''}`}
                            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                            onPointerDown={handleDragPointerDown}
                            onPointerMove={handleDragPointerMove}
                            onPointerUp={handleDragPointerUp}
                            onPointerCancel={handleDragPointerUp}
                            onClickCapture={handleGridClickCapture}
                        >
                            {items.map((img, idx) => (
                                <PhotoCard key={img.id || idx} img={img} idx={idx} viewMode="square" gridDisplayMode={gridDisplayMode}
                                    isSelectMode={isSelectMode} isSelected={img.id ? (selectedIds.has(img.id) || dragVisualIds.has(img.id)) : false}
                                    isDeleteMode={isDeleteMode} isFav={img.id ? favorites.has(img.id) : false}
                                    onToggleSelection={onToggleSelection} onItemClick={onItemClick}
                                    onToggleFavorite={onToggleFavorite} onDelete={onDelete}
                                    onContextMenu={onItemContextMenu} />
                            ))}
                            {filter !== 'Favorites' && (filter !== 'All' || items.length > 0) && !isSelectMode && (
                                <div onClick={onGridImport} className="relative aspect-square cursor-pointer group overflow-hidden bg-gray-100 border-2 border-dashed border-gray-200 hover:border-rose-300 hover:bg-rose-50 transition-all flex flex-col items-center justify-center gap-1">
                                    <Plus size={24} className="text-gray-300 group-hover:text-rose-400 transition-colors" />
                                    <span className="text-[10px] uppercase font-bold text-gray-400 group-hover:text-rose-400">Add</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="gap-4 px-2 py-4 space-y-4" style={{ columnCount: columns }}>
                            {items.map((img, idx) => (
                                <PhotoCard key={img.id || idx} img={img} idx={idx} viewMode="masonry"
                                    isSelectMode={isSelectMode} isSelected={img.id ? selectedIds.has(img.id) : false}
                                    isDeleteMode={isDeleteMode} isFav={img.id ? favorites.has(img.id) : false}
                                    onToggleSelection={onToggleSelection} onItemClick={onItemClick}
                                    onToggleFavorite={onToggleFavorite} onDelete={onDelete}
                                    onContextMenu={onItemContextMenu} />
                            ))}
                            {filter !== 'Favorites' && (filter !== 'All' || items.length > 0) && !isSelectMode && (
                                <div onClick={onGridImport} className="break-inside-avoid relative w-full aspect-square cursor-pointer group overflow-hidden bg-gray-100 border-2 border-dashed border-gray-200 hover:border-rose-300 hover:bg-rose-50 transition-all flex flex-col items-center justify-center gap-1 rounded-xl mb-4">
                                    <Plus size={24} className="text-gray-300 group-hover:text-rose-400 transition-colors" />
                                    <span className="text-xs uppercase font-bold text-gray-400 group-hover:text-rose-400">Add</span>
                                </div>
                            )}
                        </div>
                    )
                )}
                {items.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-gray-800 gap-4 py-96">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center"><ImageIcon size={24} className="opacity-20" /></div>
                        {filter === 'Favorites' && <p className="text-xs">No favorites yet.</p>}
                        {filter === 'All' && <button type="button" onClick={onHeaderImport} className="mt-1 px-4 py-2 bg-rose-500 text-white text-sm font-bold rounded-full shadow hover:bg-rose-600 transition-colors flex items-center gap-2"><FolderOpen size={16} /> Import Folder</button>}
                    </div>
                )}
                {(hasMoreItems || isLoadingMore) && filter === 'All' && (
                    <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                        {isLoadingMore ? <Loader2 size={16} className="animate-spin text-rose-500" /> : <div className="h-2 w-2 rounded-full bg-gray-300" />}
                        <span>{isLoadingMore ? 'Loading more photos...' : 'Scroll to load more'}</span>
                    </div>
                )}
            </div>

            {isFullscreen && (
                <button type="button" onClick={onToggleFullscreen} title="Exit fullscreen" className="fixed bottom-6 right-6 z-[100] p-4 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-all shadow-xl border border-white/20 group"><Shrink size={24} className="group-hover:scale-90 transition-transform" /></button>
            )}

            {isSelectMode && selectedIds.size > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 bg-white/95 backdrop-blur-md border border-gray-200 p-2 rounded-2xl shadow-2xl animate-fadeIn">
                    <div className="px-3 text-sm font-bold text-gray-600 border-r border-gray-200 mr-1">{selectedIds.size} Selected</div>
                    <button type="button" onClick={() => onOpenActionModal('copy')} className="flex flex-col items-center justify-center p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all gap-1 min-w-[60px]"><Copy size={18} /><span className="text-[9px] uppercase font-bold tracking-wide">Copy To</span></button>
                    <button type="button" onClick={() => onOpenActionModal('move')} className="flex flex-col items-center justify-center p-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all gap-1 min-w-[60px]"><FolderInput size={18} /><span className="text-[9px] uppercase font-bold tracking-wide">Move To</span></button>
                    <button type="button" onClick={onDownloadSelected} className="flex flex-col items-center justify-center p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all gap-1 min-w-[60px]"><Download size={18} /><span className="text-[9px] uppercase font-bold tracking-wide">Download</span></button>
                    <button type="button" onClick={onBulkDeleteSelected} className="flex flex-col items-center justify-center p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all gap-1 min-w-[60px]"><Trash2 size={18} /><span className="text-[9px] uppercase font-bold tracking-wide">Delete</span></button>
                    <button type="button" onClick={onClearSelection} className="flex flex-col items-center justify-center p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all gap-1 ml-1" title="Clear selection"><X size={18} /></button>
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
                            <span className="font-bold text-gray-800 text-sm">Photos Options</span>
                            <button type="button" onClick={() => setMoreMenuOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X size={18} /></button>
                        </div>
                        <div className="overflow-y-auto flex-1 pb-safe">
                            <div className="px-4 pt-3 pb-1">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">View</div>
                                <button type="button"
                                    onClick={() => { if (viewMode === 'square') { onSetGridDisplayMode(gridDisplayMode === 'fill' ? 'ratio' : 'fill'); } else { onSetViewMode('square'); } setMoreMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                                    {viewMode === 'square'
                                        ? <GridModeIcon mode={gridDisplayMode === 'fill' ? 'ratio' : 'fill'} size={18} className="text-rose-500" />
                                        : <GridModeIcon mode="fill" size={18} className="text-rose-500" />}
                                    <span>{viewMode === 'square' ? `Switch to ${gridDisplayMode === 'fill' ? 'Ratio' : 'Fill'} Grid` : 'Switch to Square Grid'}</span>
                                    <span className="ml-auto text-xs text-gray-400">{viewMode === 'square' ? `Grid ${gridModeLabel}` : 'Square'}</span>
                                </button>
                                <button type="button"
                                    onClick={() => { onSetViewMode('masonry'); setMoreMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                                    <LayoutDashboard size={18} className="text-rose-500" />
                                    <span>Switch to Masonry</span>
                                    <span className="ml-auto text-xs text-gray-400">Masonry</span>
                                </button>
                            </div>
                            <div className="px-4 pt-1 pb-1">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1 border-t border-gray-100 pt-3">Actions</div>
                                <button type="button" onClick={() => { onRefresh(); setMoreMenuOpen(false); }} disabled={isRefreshing}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-sm text-gray-700 transition-colors disabled:opacity-50">
                                    {isRefreshing ? <Loader2 size={18} className="animate-spin text-sky-500" /> : <RefreshCw size={18} className="text-sky-500" />}
                                    <span>Refresh Photos</span>
                                </button>
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
                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors ${isSelectMode ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' : 'text-gray-700 hover:bg-gray-50'}`}>
                                    <CheckSquare size={18} className="text-indigo-500" />
                                    <span>{!isSelectMode ? 'Select Mode' : selectedIds.size < items.filter(i => !!i.id).length ? 'Select All' : 'Exit Select Mode'}</span>
                                    {isSelectMode && <span className="ml-auto text-xs font-bold text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded">ON</span>}
                                </button>
                                <button type="button" onClick={() => { onAddManual(); setMoreMenuOpen(false); }}
                                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                                    <CloudUpload size={18} className="text-blue-500" />
                                    <span>Upload Photos</span>
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
                                    { id: 'cascade',    label: 'Cascade',       Icon: Film },
                                    { id: 'tiles-shifting', label: 'Tiles Shifting', Icon: Grid2x2 },
                                    { id: 'sliding-tiles', label: 'Sliding Tiles', Icon: Grid2x2 },
                                    { id: 'wings',      label: 'Cinema Wings',   Icon: LayoutTemplate },
                                    { id: 'flow-drift', label: 'Flow Drift',     Icon: Waves },
                                ] as const).map(({ id, label, Icon }) => (
                                    <button type="button" key={id}
                                        onClick={() => { onSlideshow(id as any); setMoreMenuOpen(false); }}
                                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-rose-50 hover:text-rose-600 text-sm text-gray-700 transition-colors">
                                        <Icon size={18} className="text-rose-400" />
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
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors ${layoutMode === 'photo-full' ? 'text-rose-600 bg-rose-50 hover:bg-rose-100' : 'text-gray-700 hover:bg-gray-50'}`}>
                                        {layoutMode === 'photo-full' ? <Minimize2 size={18} className="text-rose-500" /> : <Maximize2 size={18} className="text-gray-600" />}
                                        <span>{layoutMode === 'photo-full' ? 'Restore Split View' : 'Expand Photos'}</span>
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
                                    className={`flex items-center justify-center px-3 py-2 rounded-xl transition-all ${filter === 'Favorites' ? 'bg-rose-500 text-white shadow-sm' : 'bg-rose-50 text-rose-400 border border-rose-200 hover:bg-rose-100'}`}>
                                    <Heart size={16} className={filter === 'Favorites' ? 'fill-current' : ''} />
                                </button>
                            ) : (
                                <button type="button" key={cat}
                                    onClick={() => { onSetFilter(cat); setAlbumOverflowOpen(false); }}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${filter === cat ? 'bg-rose-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
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
