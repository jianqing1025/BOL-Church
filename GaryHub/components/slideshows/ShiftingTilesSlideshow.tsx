import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { GalleryItem, VideoItem, TileData } from '../../types';
import { getOptimizedUrl, shuffle } from '../../utils';
import { StaticTile, VideoStaticTile } from './StaticTile';

type AspectKind = 'portrait' | 'landscape';
type MediaKey = 'src' | 'video';
type SlideMedia = GalleryItem | VideoItem;
type TileKind = 'single' | 'double' | 'wide';
type ShiftDirection = -1 | 1;
type AnimatedTileData = TileData & {
    travelUnits?: number;
    travelDirection?: ShiftDirection;
    delayMs?: number;
};
const GRID_COLUMNS = 5;
const GRID_GAP_PX = 8;
const ANIMATION_MS = 520;

const EXIT_EFFECTS = [
    'exit-fade-out',
    'exit-scale-down',
    'exit-slide-left',
    'exit-slide-right',
    'exit-slide-top',
    'exit-slide-bottom',
    'exit-soft-push',
];

const isGalleryItem = (item: SlideMedia): item is GalleryItem => 'src' in item;

const getMediaUrl = (item: SlideMedia, key: MediaKey) => key === 'src'
    ? (item as GalleryItem).src
    : (item as VideoItem).video;

const getKnownAspect = (item: SlideMedia): AspectKind | null => {
    if (isGalleryItem(item)) {
        const width = item.exif?.width;
        const height = item.exif?.height;
        if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
            return width >= height ? 'landscape' : 'portrait';
        }
    }
    return null;
};

const isTemplatePortraitCandidate = (item: SlideMedia): boolean => {
    if (!isGalleryItem(item)) return true;
    const width = item.exif?.width;
    const height = item.exif?.height;
    if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
        return (height / width) <= 1.75;
    }
    return true;
};

const detectAspect = (item: SlideMedia, key: MediaKey): Promise<AspectKind | null> => {
    const known = getKnownAspect(item);
    if (known) return Promise.resolve(known);

    return new Promise((resolve) => {
        if (key === 'src') {
            const img = new Image();
            img.src = (item as GalleryItem).src;
            img.onload = () => resolve(img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait');
            img.onerror = () => resolve(null);
            return;
        }

        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = (item as VideoItem).video;
        video.onloadedmetadata = () => resolve(video.videoWidth >= video.videoHeight ? 'landscape' : 'portrait');
        video.onerror = () => resolve(null);
    });
};

async function classifyMedia<T extends SlideMedia>(data: T[], key: MediaKey): Promise<{ portrait: T[]; landscape: T[] }> {
    const portrait: T[] = [];
    const landscape: T[] = [];

    const settled = await Promise.all(data.map(async (item) => ({
        item,
        aspect: await detectAspect(item, key),
    })));

    for (const entry of settled) {
        if (entry.aspect === 'landscape') landscape.push(entry.item);
        else portrait.push(entry.item);
    }

    if (portrait.length === 0 && landscape.length > 0) return { portrait: [], landscape };
    if (landscape.length === 0 && portrait.length > 0) return { portrait, landscape: [] };
    return { portrait, landscape };
}

const getOnScreenUrls = (rows: TileData[][], key: MediaKey): Set<string> => {
    const set = new Set<string>();
    rows.forEach((row) => {
        row.forEach((tile) => {
            if (tile.top) set.add(getMediaUrl(tile.top as SlideMedia, key));
            if (tile.bottom) set.add(getMediaUrl(tile.bottom as SlideMedia, key));
        });
    });
    return set;
};

const useTilesShiftingLogic = <T extends SlideMedia>(data: T[], key: MediaKey) => {
    const [rows, setRows] = useState<AnimatedTileData[][]>([]);
    const [ready, setReady] = useState(false);
    const [focalContent, setFocalContent] = useState<string | null>(null);
    const [layoutOpacity, setLayoutOpacity] = useState(1);
    const [gridWidth, setGridWidth] = useState(0);

    const gridRef = useRef<HTMLDivElement | null>(null);
    const pools = useRef({ portrait: [] as T[], landscape: [] as T[] });
    const portraitTemplatePool = useRef([] as T[]);
    const decks = useRef({ portrait: [] as T[], landscape: [] as T[] });
    const portraitTemplateDeck = useRef([] as T[]);
    const usedHistory = useRef<string[]>([]);
    const isAnimating = useRef(false);

    useEffect(() => {
        let cancelled = false;

        setReady(false);
        setRows([]);
        usedHistory.current = [];

        void classifyMedia(data, key).then(({ portrait, landscape }) => {
            if (cancelled) return;

            const nextPortrait = portrait.length > 0 ? portrait : data.filter((_, idx) => idx % 2 === 0);
            const nextLandscape = landscape.length > 0 ? landscape : data.filter((_, idx) => idx % 2 !== 0);

            pools.current = {
                portrait: nextPortrait,
                landscape: nextLandscape,
            };
            portraitTemplatePool.current = key === 'src'
                ? nextPortrait.filter((item) => isTemplatePortraitCandidate(item))
                : nextPortrait;
            decks.current = {
                portrait: shuffle([...nextPortrait]),
                landscape: shuffle([...nextLandscape]),
            };
            portraitTemplateDeck.current = shuffle([...portraitTemplatePool.current]);

            const focalItem = nextLandscape[0] || nextPortrait[0] || data[0] || null;
            setFocalContent(focalItem ? getMediaUrl(focalItem, key) : null);
            setReady(true);
        });

        return () => {
            cancelled = true;
        };
    }, [data, key]);

    const rememberUsage = useCallback((url: string) => {
        usedHistory.current.push(url);
        const maxHistory = Math.max(12, Math.min(data.length - 1, Math.floor(data.length * 0.45)));
        while (usedHistory.current.length > maxHistory) usedHistory.current.shift();
    }, [data.length]);

    const getNextItem = useCallback((
        aspect: AspectKind,
        options: { templateOnly?: boolean } = {},
        currentRows: AnimatedTileData[][] = [],
        batchExclusions: Set<string> = new Set()
    ): T => {
        const wantsTemplate = aspect === 'portrait' && options.templateOnly;
        const primaryPool = wantsTemplate
            ? portraitTemplatePool.current
            : aspect === 'portrait'
                ? pools.current.portrait
                : pools.current.landscape;
        const secondaryPool = aspect === 'portrait' ? pools.current.landscape : pools.current.portrait;
        const activePool = primaryPool.length > 0 ? primaryPool : secondaryPool.length > 0 ? secondaryPool : data;
        const useTemplateDeck = wantsTemplate && primaryPool.length > 0;
        const deckKey: AspectKind = primaryPool.length > 0 ? aspect : secondaryPool.length > 0 ? (aspect === 'portrait' ? 'landscape' : 'portrait') : aspect;
        const activeDeck = useTemplateDeck
            ? portraitTemplateDeck.current
            : decks.current[deckKey];

        const onScreen = getOnScreenUrls(currentRows, key);
        const blocked = (item: T) => {
            const url = getMediaUrl(item, key);
            return onScreen.has(url) || batchExclusions.has(url);
        };

        if (useTemplateDeck && portraitTemplateDeck.current.length === 0) {
            portraitTemplateDeck.current = shuffle([...activePool]);
        } else if (!useTemplateDeck && decks.current[deckKey].length === 0) {
            decks.current[deckKey] = shuffle([...activePool]);
        }

        let candidates = activeDeck.filter((item) => {
            const url = getMediaUrl(item, key);
            return !blocked(item) && !usedHistory.current.includes(url);
        });

        if (candidates.length === 0) {
            candidates = activeDeck.filter((item) => !blocked(item));
        }

        if (candidates.length === 0) {
            if (useTemplateDeck) {
                portraitTemplateDeck.current = shuffle([...activePool]);
                candidates = portraitTemplateDeck.current.filter((item) => !blocked(item));
            } else {
                decks.current[deckKey] = shuffle([...activePool]);
                candidates = decks.current[deckKey].filter((item) => !blocked(item));
            }
        }

        const nextDeck = useTemplateDeck ? portraitTemplateDeck.current : decks.current[deckKey];
        const selection = candidates[0] || nextDeck[0] || activePool[0] || data[0];
        const selectedUrl = getMediaUrl(selection, key);

        if (useTemplateDeck) {
            portraitTemplateDeck.current = portraitTemplateDeck.current.filter((item) => getMediaUrl(item, key) !== selectedUrl);
        } else {
            decks.current[deckKey] = decks.current[deckKey].filter((item) => getMediaUrl(item, key) !== selectedUrl);
        }
        rememberUsage(selectedUrl);
        return selection;
    }, [data, key, rememberUsage]);

    const createTile = useCallback((
        type: 'single' | 'double' | 'wide' | 'ghost',
        currentRows: AnimatedTileData[][],
        batchExclusions: Set<string>
    ): AnimatedTileData => {
        if (type === 'ghost') {
            return { id: Math.random().toString(36).slice(2, 11), type, top: null, status: 'idle', travelUnits: 1, travelDirection: -1, delayMs: 0 };
        }

        if (type === 'wide') {
            const top = getNextItem('landscape', {}, currentRows, batchExclusions);
            batchExclusions.add(getMediaUrl(top, key));
            return { id: Math.random().toString(36).slice(2, 11), type, top, status: 'idle', travelUnits: 1, travelDirection: -1, delayMs: 0 };
        }

        if (type === 'double') {
            const top = getNextItem('portrait', { templateOnly: key === 'src' }, currentRows, batchExclusions);
            batchExclusions.add(getMediaUrl(top, key));
            const bottom = getNextItem('portrait', { templateOnly: key === 'src' }, currentRows, batchExclusions);
            batchExclusions.add(getMediaUrl(bottom, key));
            return { id: Math.random().toString(36).slice(2, 11), type, top, bottom, status: 'idle', travelUnits: 1, travelDirection: -1, delayMs: 0 };
        }

        const top = getNextItem('portrait', { templateOnly: key === 'src' }, currentRows, batchExclusions);
        batchExclusions.add(getMediaUrl(top, key));
        return { id: Math.random().toString(36).slice(2, 11), type, top, status: 'idle', travelUnits: 1, travelDirection: -1, delayMs: 0 };
    }, [getNextItem, key]);

    const buildRow = useCallback((existingRows: AnimatedTileData[][], pattern: TileKind[]): AnimatedTileData[] => {
        const batchExclusions = new Set<string>();
        const row: AnimatedTileData[] = [];
        for (const tileType of pattern) {
            row.push(createTile(tileType, [...existingRows, row], batchExclusions));
            if (tileType === 'wide') {
                row.push(createTile('ghost', [...existingRows, row], batchExclusions));
            }
        }
        return row;
    }, [createTile]);

    const generateLayout = useCallback(() => {
        const templates: [TileKind[], TileKind[]][] = [
            [['wide', 'single', 'single', 'single'], ['double', 'single', 'single', 'wide']],
            [['single', 'double', 'single', 'single', 'double'], ['wide', 'single', 'single', 'single']],
            [['wide', 'single', 'single', 'double'], ['single', 'single', 'single', 'wide']],
            [['double', 'single', 'single', 'wide'], ['single', 'single', 'single', 'single', 'double']],
            [['wide', 'single', 'single', 'double'], ['double', 'single', 'single', 'wide']],
        ];
        const [firstPattern, secondPattern] = templates[Math.floor(Math.random() * templates.length)];
        const firstRow = buildRow([], firstPattern);
        const secondRow = buildRow([firstRow], secondPattern);
        return [firstRow, secondRow];
    }, [buildRow]);

    const finishRefresh = useCallback((r: number, c: number) => {
        setRows((prevRows) => {
            const nextRows = prevRows.map((row) => [...row]);
            const oldTile = nextRows[r]?.[c];
            if (!oldTile || oldTile.type === 'ghost') return prevRows;

            const nextTile = createTile(oldTile.type as 'single' | 'double' | 'wide', nextRows, new Set());
            nextTile.status = 'entering';
            nextTile.travelUnits = 1;
            nextTile.travelDirection = -1;
            nextRows[r][c] = nextTile;
            isAnimating.current = false;
            return nextRows;
        });
    }, [createTile]);

    const settleRow = useCallback((r: number) => {
        setRows((prevRows) => {
            const nextRows = prevRows.map((row) => [...row]);
            const row = nextRows[r];
            if (!row) return prevRows;
            nextRows[r] = row.map((tile) => ({ ...tile, status: 'idle', travelUnits: 1, travelDirection: -1, delayMs: 0 }));
            return nextRows;
        });
    }, []);

    const triggerSwitch = useCallback((r: number, c: number) => {
        setRows((prevRows) => {
            const nextRows = prevRows.map((row) => [...row]);
            const tile = nextRows[r]?.[c];
            if (!tile || tile.type === 'ghost') return prevRows;
            if (tile.status !== 'idle' && tile.status !== 'entering') return prevRows;

            if (tile.top) setFocalContent(getMediaUrl(tile.top as T, key));
            nextRows[r][c] = { ...tile, status: EXIT_EFFECTS[Math.floor(Math.random() * EXIT_EFFECTS.length)] };
            return nextRows;
        });

        window.setTimeout(() => finishRefresh(r, c), 520);
    }, [finishRefresh, key]);

    const getSpan = useCallback((tile: AnimatedTileData | undefined) => tile?.type === 'wide' ? 2 : 1, []);

    const mutateRow = useCallback((rowIndex: number) => {
        if (isAnimating.current) return;

        setRows((prevRows) => {
            const row = prevRows[rowIndex];
            if (!row) return prevRows;
            const candidates = row
                .map((tile, idx) => (tile.type !== 'ghost' ? idx : -1))
                .filter((idx) => idx >= 0);

            if (candidates.length === 0) return prevRows;
            const target = candidates[Math.floor(Math.random() * candidates.length)];
            const nextRows = prevRows.map((currentRow) => [...currentRow]);
            const tile = nextRows[rowIndex][target];
            const span = getSpan(tile);
            const legalDirections: ShiftDirection[] = [];
            if (target + span < row.length) legalDirections.push(-1);
            if (target > 0) legalDirections.push(1);
            if (!legalDirections.length) return prevRows;
            const direction = legalDirections[Math.floor(Math.random() * legalDirections.length)];

            if (tile.top) setFocalContent(getMediaUrl(tile.top as T, key));
            for (let offset = 0; offset < span; offset++) {
                const slotIndex = target + offset;
                if (!nextRows[rowIndex][slotIndex]) continue;
                nextRows[rowIndex][slotIndex] = {
                    ...nextRows[rowIndex][slotIndex],
                    status: EXIT_EFFECTS[Math.floor(Math.random() * EXIT_EFFECTS.length)],
                    travelUnits: span,
                    travelDirection: direction,
                    delayMs: 0,
                };
            }

            if (direction === -1) {
                for (let idx = target + span; idx < row.length; idx++) {
                    if (row[idx]?.type === 'ghost') continue;
                    nextRows[rowIndex][idx] = {
                        ...nextRows[rowIndex][idx],
                        status: 'shift-bounce',
                        travelUnits: span,
                        travelDirection: -1,
                        delayMs: Math.min(64, Math.floor((idx - (target + span)) / 1) * 18),
                    };
                }
            } else {
                for (let idx = target - 1; idx >= 0; idx--) {
                    if (row[idx]?.type === 'ghost') continue;
                    nextRows[rowIndex][idx] = {
                        ...nextRows[rowIndex][idx],
                        status: 'shift-bounce',
                        travelUnits: span,
                        travelDirection: 1,
                        delayMs: Math.min(64, Math.floor(((target - 1) - idx) / 1) * 18),
                    };
                }
            }

            isAnimating.current = true;
            window.setTimeout(() => {
                setRows((currentRows) => {
                    const updatedRows = currentRows.map((currentRow) => [...currentRow]);
                    const currentRow = updatedRows[rowIndex];
                    if (!currentRow) return currentRows;

                    const withoutRemoved = currentRow.filter((_, idx) => idx < target || idx >= target + span);
                    const newTile = createTile(tile.type as 'single' | 'double' | 'wide', updatedRows, new Set());
                    newTile.status = 'entering';
                    newTile.travelUnits = span;
                    newTile.travelDirection = direction === -1 ? 1 : -1;
                    newTile.delayMs = 0;
                    const insertion = newTile.type === 'wide'
                        ? [newTile, createTile('ghost', updatedRows, new Set())]
                        : [newTile];
                    updatedRows[rowIndex] = direction === -1
                        ? [...withoutRemoved, ...insertion]
                        : [...insertion, ...withoutRemoved];
                    return updatedRows;
                });

                window.setTimeout(() => {
                    settleRow(rowIndex);
                    isAnimating.current = false;
                }, ANIMATION_MS - 20);
            }, ANIMATION_MS - 30);
            return nextRows;
        });
    }, [createTile, getSpan, key, settleRow]);

    const mutateBurst = useCallback(() => {
        if (isAnimating.current || rows.length === 0) return;

        if (key !== 'video') {
            mutateRow(Math.floor(Math.random() * rows.length));
            return;
        }

        const burstCount = Math.random() > 0.58 ? 2 : 1;
        const selectedRows = shuffle(rows.map((_, index) => index)).slice(0, Math.min(burstCount, rows.length));
        selectedRows.forEach((rowIndex, index) => {
            window.setTimeout(() => mutateRow(rowIndex), index * 260);
        });
    }, [key, mutateRow, rows]);

    useEffect(() => {
        if (!ready) return;
        setRows(generateLayout());
    }, [ready, generateLayout]);

    useEffect(() => {
        if (!rows.length) return;
        const interval = window.setInterval(() => {
            mutateBurst();
        }, key === 'video' ? 6000 : 5000);
        return () => window.clearInterval(interval);
    }, [key, mutateBurst, rows.length]);

    useEffect(() => {
        const node = gridRef.current;
        if (!node) return;
        const update = () => setGridWidth(node.clientWidth);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => observer.disconnect();
    }, [rows.length]);

    return { rows, focalContent, layoutOpacity, triggerSwitch, ready, gridRef, gridWidth };
};

const sharedStyles = `
    .tile-transition { transition: all 0.52s cubic-bezier(0.22, 1, 0.36, 1); }
    .exit-fade-out { opacity: 0; filter: blur(6px); }
    .exit-scale-down { opacity: 0; transform: scale(0.84); filter: blur(6px); }
    .exit-slide-left { opacity: 0; transform: translateX(-12%); filter: blur(4px); }
    .exit-slide-right { opacity: 0; transform: translateX(12%); filter: blur(4px); }
    .exit-slide-top { opacity: 0; transform: translateY(-10%); filter: blur(4px); }
    .exit-slide-bottom { opacity: 0; transform: translateY(10%); filter: blur(4px); }
    .exit-soft-push { opacity: 0; transform: scale(1.04); filter: blur(8px); }
    .shift-bounce { animation: shiftBounce ${ANIMATION_MS}ms cubic-bezier(0.2, 0.82, 0.24, 1) forwards; animation-delay: var(--impact-delay, 0ms); z-index: 25; }
    .entering { animation: tileEnter ${ANIMATION_MS}ms cubic-bezier(0.2, 0.82, 0.24, 1) forwards; }
    @keyframes shiftBounce {
        0% { transform: translate3d(0, 0, 0) scaleX(1); }
        58% { transform: translate3d(calc(var(--travel-px) * var(--travel-dir)), 0, 0) scaleX(0.988); }
        78% { transform: translate3d(calc(var(--travel-px) * var(--travel-dir) - (6px * var(--travel-dir))), 0, 0) scaleX(1.003); }
        100% { transform: translate3d(calc(var(--travel-px) * var(--travel-dir)), 0, 0) scaleX(1); }
    }
    @keyframes tileEnter {
        0% { opacity: 0; transform: translate3d(calc(var(--entry-px) * var(--travel-dir)), 0, 0) scale(1.018) scaleX(1.012); filter: blur(8px); }
        62% { opacity: 1; transform: translate3d(calc(-5px * var(--travel-dir)), 0, 0) scale(0.997) scaleX(0.992); filter: blur(0); }
        100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) scaleX(1); filter: blur(0); }
    }
`;

export const ShiftingTilesSlideshow = ({ onClose, galleryData }: { onClose: () => void; galleryData: GalleryItem[] }) => {
    const [isMuted, setIsMuted] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const { rows, focalContent, layoutOpacity, triggerSwitch, ready, gridRef, gridWidth } = useTilesShiftingLogic(galleryData, 'src');

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = 0.6;
            audioRef.current.play().catch(() => {});
        }
    }, []);

    const toggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!audioRef.current) return;
        audioRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black animate-fadeIn flex flex-col font-sans overflow-hidden">
            {focalContent && (
                <div
                    className="absolute inset-0 z-0 transition-all duration-1000 scale-110"
                    style={{
                        backgroundImage: `url(${getOptimizedUrl(focalContent, 'blog')})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: 'blur(60px) brightness(0.4)',
                    }}
                />
            )}
            <style>{sharedStyles}</style>
            <audio ref={audioRef} src="https://res.cloudinary.com/drtve7qyt/video/upload/v1765372845/xqx_mpn0kc.ogg" loop />

            <div className="absolute top-6 right-6 z-[110] flex gap-4 pointer-events-auto">
                <button onClick={toggleMute} className="text-white bg-white/10 hover:bg-brand p-2 rounded-full transition-colors backdrop-blur-lg border border-white/20 shadow-xl">
                    {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                <button onClick={onClose} className="text-white bg-white/10 hover:bg-brand p-2 rounded-full transition-colors backdrop-blur-lg border border-white/20 shadow-xl">
                    <X size={24} />
                </button>
            </div>

            {!ready || !rows.length ? (
                <div className="flex-1 flex flex-col items-center justify-center z-10">
                    <Loader2 className="animate-spin text-brand mb-4" size={48} />
                    <div className="text-white text-xl font-light tracking-widest animate-pulse uppercase">Preparing Tiles Shifting...</div>
                </div>
            ) : (
                <div ref={gridRef} className="flex-1 w-full h-full grid grid-cols-5 grid-rows-2 gap-2 bg-transparent p-4 z-10 transition-opacity duration-500 ease-in-out" style={{ opacity: layoutOpacity }}>
                    {rows.flatMap((row, rIdx) => row.map((tile, cIdx) => {
                        if (tile.type === 'ghost') return null;
                        const slotWidth = gridWidth > 0 ? (gridWidth - GRID_GAP_PX * (GRID_COLUMNS - 1)) / GRID_COLUMNS : 0;
                        const travelUnits = tile.travelUnits || 1;
                        const travelPx = Math.max(0, slotWidth * travelUnits + GRID_GAP_PX * travelUnits);
                        return (
                            <div
                                key={tile.id}
                                onClick={() => triggerSwitch(rIdx, cIdx)}
                                className={`relative w-full h-full rounded-xl overflow-hidden shadow-2xl backdrop-blur-md bg-white/5 border border-white/10 tile-transition cursor-pointer group/tile ${tile.status}`}
                                style={{
                                    gridRow: rIdx + 1,
                                    gridColumn: cIdx + 1,
                                    ...(tile.type === 'wide' ? { gridColumn: `${cIdx + 1} / span 2` } : {}),
                                    ['--travel-px' as string]: `${travelPx}px`,
                                    ['--travel-dir' as string]: `${tile.travelDirection || -1}`,
                                    ['--entry-px' as string]: `${Math.max(20, Math.min(42, travelPx * 0.42))}px`,
                                    ['--impact-delay' as string]: `${tile.delayMs || 0}ms`,
                                }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover/tile:opacity-100 transition-opacity duration-500 z-20" />
                                {tile.type === 'double' ? (
                                    <div className="flex flex-col w-full h-full gap-2">
                                        <div className="flex-1 relative overflow-hidden">
                                            <StaticTile src={getOptimizedUrl((tile.top as GalleryItem)?.src || '', 'portrait')} alt="" imageStyle={{ objectPosition: 'center 18%' }} />
                                        </div>
                                        <div className="flex-1 relative overflow-hidden">
                                            {tile.bottom && <StaticTile src={getOptimizedUrl((tile.bottom as GalleryItem)?.src || '', 'portrait')} alt="" imageStyle={{ objectPosition: 'center 18%' }} />}
                                        </div>
                                    </div>
                                ) : (
                                    <StaticTile
                                        src={getOptimizedUrl((tile.top as GalleryItem)?.src || '', tile.type === 'wide' ? 'landscape' : 'portrait')}
                                        alt=""
                                        className="group-hover/tile:scale-105 transition-transform duration-1000"
                                        imageStyle={tile.type === 'wide' ? undefined : { objectPosition: 'center 18%' }}
                                    />
                                )}
                            </div>
                        );
                    }))}
                </div>
            )}
        </div>
    );
};

export const VideoShiftingTilesSlideshow = ({ onClose, videosData }: { onClose: () => void; videosData: VideoItem[] }) => {
    const [isMuted, setIsMuted] = useState(true);
    const audioRef = useRef<HTMLAudioElement>(null);
    const { rows, focalContent, layoutOpacity, triggerSwitch, ready, gridRef, gridWidth } = useTilesShiftingLogic(videosData, 'video');

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = 0.5;
            audioRef.current.play().catch(() => {});
        }
    }, []);

    const toggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!audioRef.current) return;
        audioRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black animate-fadeIn flex flex-col font-sans overflow-hidden">
            {focalContent && (
                <div className="absolute inset-0 z-0 transition-all duration-1000 scale-110">
                    <video crossOrigin="anonymous" src={focalContent} autoPlay muted loop playsInline className="w-full h-full object-cover" style={{ filter: 'blur(60px) brightness(0.3)' }} />
                </div>
            )}
            <style>{sharedStyles}</style>
            <audio ref={audioRef} src="https://res.cloudinary.com/drtve7qyt/video/upload/v1765372845/xqx_mpn0kc.ogg" loop />

            <div className="absolute top-4 right-4 z-[70] flex gap-4 pointer-events-auto">
                <button onClick={toggleMute} className="text-white bg-white/10 hover:bg-brand p-2 rounded-full transition-colors backdrop-blur-lg border border-white/20 shadow-xl">
                    {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                <button onClick={onClose} className="text-white bg-white/10 hover:bg-brand p-2 rounded-full transition-colors backdrop-blur-lg border border-white/20 shadow-xl">
                    <X size={24} />
                </button>
            </div>

            {!ready || !rows.length ? (
                <div className="flex-1 flex flex-col items-center justify-center z-10">
                    <Loader2 className="animate-spin text-brand mb-4" size={48} />
                    <div className="text-white text-xl font-light tracking-widest animate-pulse uppercase">Preparing Tiles Shifting...</div>
                </div>
            ) : (
                <div ref={gridRef} className="flex-1 w-full h-full grid grid-cols-5 grid-rows-2 gap-2 bg-transparent p-4 z-10 transition-opacity duration-500 ease-in-out" style={{ opacity: layoutOpacity }}>
                    {rows.flatMap((row, rIdx) => row.map((tile, cIdx) => {
                        if (tile.type === 'ghost') return null;
                        const slotWidth = gridWidth > 0 ? (gridWidth - GRID_GAP_PX * (GRID_COLUMNS - 1)) / GRID_COLUMNS : 0;
                        const travelUnits = tile.travelUnits || 1;
                        const travelPx = Math.max(0, slotWidth * travelUnits + GRID_GAP_PX * travelUnits);
                        return (
                            <div
                                key={tile.id}
                                onClick={() => triggerSwitch(rIdx, cIdx)}
                                className={`relative w-full h-full rounded-xl overflow-hidden shadow-2xl backdrop-blur-md bg-white/5 border border-white/10 tile-transition cursor-pointer group/tile ${tile.status}`}
                                style={{
                                    gridRow: rIdx + 1,
                                    gridColumn: cIdx + 1,
                                    ...(tile.type === 'wide' ? { gridColumn: `${cIdx + 1} / span 2` } : {}),
                                    ['--travel-px' as string]: `${travelPx}px`,
                                    ['--travel-dir' as string]: `${tile.travelDirection || -1}`,
                                    ['--entry-px' as string]: `${Math.max(20, Math.min(42, travelPx * 0.42))}px`,
                                    ['--impact-delay' as string]: `${tile.delayMs || 0}ms`,
                                }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover/tile:opacity-100 transition-opacity duration-500 z-20" />
                                {tile.type === 'double' ? (
                                    <div className="flex flex-col w-full h-full gap-2">
                                        <div className="flex-1 relative overflow-hidden"><VideoStaticTile src={(tile.top as VideoItem)?.video || ''} /></div>
                                        <div className="flex-1 relative overflow-hidden">{tile.bottom && <VideoStaticTile src={(tile.bottom as VideoItem)?.video || ''} />}</div>
                                    </div>
                                ) : (
                                    <VideoStaticTile src={(tile.top as VideoItem)?.video || ''} className="group-hover/tile:scale-105 transition-transform duration-1000" />
                                )}
                            </div>
                        );
                    }))}
                </div>
            )}
        </div>
    );
};
