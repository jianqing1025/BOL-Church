import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Volume2, VolumeX, X } from 'lucide-react';
import { GalleryItem } from '../../types';
import { getOptimizedUrl, shuffle } from '../../utils';
import { StaticTile } from './StaticTile';

type AspectKind = 'portrait' | 'landscape';
type SlidingTileKind = 'single' | 'double' | 'wide';
type CropMode = 'portrait-safe' | 'landscape';

type SlidingTile = {
    id: string;
    kind: SlidingTileKind;
    span: 1 | 2;
    top: GalleryItem;
    bottom?: GalleryItem;
    topCrop: CropMode;
    bottomCrop?: CropMode;
    status: 'idle' | 'slide-out' | 'impact' | 'enter';
    travelUnits: number;
    travelDirection: -1 | 1;
    delayMs?: number;
};

const GRID_COLUMNS = 6;
const GRID_GAP = 12;
const ANIMATION_MS = 520;
const ROW_PATTERNS: SlidingTileKind[][] = [
    ['wide', 'single', 'double', 'single', 'single'],
    ['single', 'double', 'single', 'wide', 'single'],
];

const sharedStyles = `
    .sliding-tiles-shell { --grid-gap: 12px; }
    .sliding-tiles-grid {
        display: grid;
        grid-template-columns: repeat(${GRID_COLUMNS}, minmax(0, 1fr));
        grid-template-rows: repeat(2, minmax(0, 1fr));
        gap: var(--grid-gap);
    }
    .sliding-tile {
        transition: box-shadow 320ms ease, border-color 320ms ease, transform 320ms ease;
        will-change: transform, opacity, filter;
        transform-origin: center center;
    }
    .sliding-tile:hover {
        box-shadow: 0 28px 70px rgba(0, 0, 0, 0.45);
        border-color: rgba(255, 255, 255, 0.22);
    }
    .sliding-tile-impact {
        animation: slidingTileImpact ${ANIMATION_MS}ms cubic-bezier(0.2, 0.82, 0.24, 1) forwards;
        animation-delay: var(--impact-delay, 0ms);
        z-index: 18;
    }
    .sliding-tile-exit {
        animation: slidingTileExit ${ANIMATION_MS}ms cubic-bezier(0.28, 0.84, 0.42, 1) forwards;
        z-index: 24;
    }
    .sliding-tile-enter {
        animation: slidingTileEnter ${ANIMATION_MS}ms cubic-bezier(0.2, 0.82, 0.24, 1) forwards;
        z-index: 20;
    }
    @keyframes slidingTileImpact {
        0% { transform: translate3d(0, 0, 0) scaleX(1); }
        58% { transform: translate3d(calc(var(--travel-px) * var(--travel-dir)), 0, 0) scaleX(0.988); }
        78% { transform: translate3d(calc(var(--travel-px) * var(--travel-dir) - (6px * var(--travel-dir))), 0, 0) scaleX(1.003); }
        100% { transform: translate3d(calc(var(--travel-px) * var(--travel-dir)), 0, 0) scaleX(1); }
    }
    @keyframes slidingTileExit {
        0% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        48% { opacity: 0.84; transform: translate3d(calc(var(--exit-px) * var(--travel-dir) * 0.82), 0, 0) scale(0.988); }
        100% { opacity: 0; transform: translate3d(calc(var(--exit-px) * var(--travel-dir)), 0, 0) scale(0.972); }
    }
    @keyframes slidingTileEnter {
        0% { opacity: 0; transform: translate3d(calc(var(--entry-px) * var(--travel-dir)), 0, 0) scale(1.018) scaleX(1.012); }
        62% { opacity: 1; transform: translate3d(calc(-5px * var(--travel-dir)), 0, 0) scale(0.997) scaleX(0.992); }
        100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) scaleX(1); }
    }
    @media (max-width: 768px) {
        .sliding-tiles-shell { --grid-gap: 8px; }
    }
`;

const makeTileId = () => Math.random().toString(36).slice(2, 11);

const isLandscapeFromExif = (item: GalleryItem): AspectKind | null => {
    const width = item.exif?.width;
    const height = item.exif?.height;
    if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) return null;
    return width >= height ? 'landscape' : 'portrait';
};

const detectAspect = (item: GalleryItem): Promise<AspectKind> => {
    const known = isLandscapeFromExif(item);
    if (known) return Promise.resolve(known);

    return new Promise((resolve) => {
        const image = new Image();
        image.src = item.src;
        image.onload = () => resolve(image.naturalWidth >= image.naturalHeight ? 'landscape' : 'portrait');
        image.onerror = () => resolve('portrait');
    });
};

const getPortraitObjectPosition = (item: GalleryItem): string => {
    const width = item.exif?.width;
    const height = item.exif?.height;
    if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
        const ratio = height / width;
        if (ratio >= 1.75) return 'center 14%';
        if (ratio >= 1.45) return 'center 18%';
    }
    return 'center 22%';
};

const getTileImageProps = (item: GalleryItem, crop: CropMode, kind: SlidingTileKind) => {
    if (crop === 'landscape') {
        const optimizeKind = kind === 'wide' ? 'landscape' : 'blog';
        return {
            src: getOptimizedUrl(item.src, optimizeKind),
            imageStyle: undefined as React.CSSProperties | undefined,
        };
    }

    return {
        src: getOptimizedUrl(item.src, kind === 'wide' ? 'landscape' : 'portrait'),
        imageStyle: {
            objectPosition: getPortraitObjectPosition(item),
        } as React.CSSProperties,
    };
};

const classifyMedia = async (data: GalleryItem[]) => {
    const portrait: GalleryItem[] = [];
    const landscape: GalleryItem[] = [];

    const resolved = await Promise.all(data.map(async (item) => ({
        item,
        aspect: await detectAspect(item),
    })));

    resolved.forEach(({ item, aspect }) => {
        if (aspect === 'landscape') landscape.push(item);
        else portrait.push(item);
    });

    return { portrait, landscape };
};

export const SlidingTilesSlideshow = ({ onClose, galleryData }: { onClose: () => void; galleryData: GalleryItem[] }) => {
    const [rows, setRows] = useState<SlidingTile[][]>([]);
    const [ready, setReady] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [focalContent, setFocalContent] = useState<string | null>(null);
    const [gridWidth, setGridWidth] = useState(0);

    const shellRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const timersRef = useRef<number[]>([]);
    const decksRef = useRef<{ landscape: GalleryItem[]; portrait: GalleryItem[] }>({ landscape: [], portrait: [] });
    const poolsRef = useRef<{ landscape: GalleryItem[]; portrait: GalleryItem[] }>({ landscape: [], portrait: [] });
    const recentHistoryRef = useRef<string[]>([]);
    const isAnimatingRef = useRef(false);

    const clearTimers = useCallback(() => {
        timersRef.current.forEach((timer) => window.clearTimeout(timer));
        timersRef.current = [];
    }, []);

    const rememberUsage = useCallback((url: string) => {
        recentHistoryRef.current.push(url);
        const maxHistory = Math.max(14, Math.min(galleryData.length - 1, Math.floor(galleryData.length * 0.5)));
        while (recentHistoryRef.current.length > maxHistory) recentHistoryRef.current.shift();
    }, [galleryData.length]);

    const getOnScreenUrls = useCallback((currentRows: SlidingTile[][]) => {
        const set = new Set<string>();
        currentRows.forEach((row) => {
            row.forEach((tile) => {
                set.add(tile.top.src);
                if (tile.bottom) set.add(tile.bottom.src);
            });
        });
        return set;
    }, []);

    const refillDeck = useCallback((aspect: AspectKind) => {
        const pool = poolsRef.current[aspect];
        decksRef.current[aspect] = shuffle([...pool]);
    }, []);

    const drawItem = useCallback((
        preferredAspect: AspectKind,
        currentRows: SlidingTile[][],
        exclusions: Set<string>,
        allowFallback = true,
    ): { item: GalleryItem; crop: CropMode } => {
        const tryAspects: AspectKind[] = allowFallback
            ? [preferredAspect, preferredAspect === 'landscape' ? 'portrait' : 'landscape']
            : [preferredAspect];
        const onScreen = getOnScreenUrls(currentRows);

        for (const aspect of tryAspects) {
            if (decksRef.current[aspect].length === 0) refillDeck(aspect);
            const deck = decksRef.current[aspect];
            const candidates = deck.filter((item) => {
                const url = item.src;
                return !onScreen.has(url) && !exclusions.has(url) && !recentHistoryRef.current.includes(url);
            });
            const fallbackCandidates = deck.filter((item) => {
                const url = item.src;
                return !onScreen.has(url) && !exclusions.has(url);
            });
            const selection = candidates[0] || fallbackCandidates[0];

            if (selection) {
                decksRef.current[aspect] = deck.filter((entry) => entry.src !== selection.src);
                rememberUsage(selection.src);
                return {
                    item: selection,
                    crop: aspect === 'landscape' ? 'landscape' : 'portrait-safe',
                };
            }
        }

        const fallback = galleryData.find((item) => !exclusions.has(item.src)) || galleryData[0];
        rememberUsage(fallback.src);
        return {
            item: fallback,
            crop: isLandscapeFromExif(fallback) === 'landscape' ? 'landscape' : 'portrait-safe',
        };
    }, [galleryData, getOnScreenUrls, refillDeck, rememberUsage]);

    const createTile = useCallback((kind: SlidingTileKind, currentRows: SlidingTile[][], exclusions: Set<string>): SlidingTile => {
        if (kind === 'wide') {
            const media = drawItem('landscape', currentRows, exclusions, true);
            exclusions.add(media.item.src);
            return {
                id: makeTileId(),
                kind,
                span: 2,
                top: media.item,
                topCrop: media.crop,
                status: 'idle',
                travelUnits: 1,
                travelDirection: -1,
            };
        }

        if (kind === 'double') {
            const top = drawItem('landscape', currentRows, exclusions, true);
            exclusions.add(top.item.src);
            const bottom = drawItem('landscape', currentRows, exclusions, true);
            exclusions.add(bottom.item.src);
            return {
                id: makeTileId(),
                kind,
                span: 1,
                top: top.item,
                bottom: bottom.item,
                topCrop: top.crop,
                bottomCrop: bottom.crop,
                status: 'idle',
                travelUnits: 1,
                travelDirection: -1,
            };
        }

        const media = drawItem('portrait', currentRows, exclusions, true);
        exclusions.add(media.item.src);
        return {
            id: makeTileId(),
            kind,
            span: 1,
            top: media.item,
            topCrop: media.crop,
            status: 'idle',
            travelUnits: 1,
            travelDirection: -1,
        };
    }, [drawItem]);

    const buildRows = useCallback(() => {
        const nextRows: SlidingTile[][] = [];
        ROW_PATTERNS.forEach((pattern) => {
            const exclusions = new Set<string>();
            const row = pattern.map((kind) => createTile(kind, nextRows, exclusions));
            nextRows.push(row);
        });
        return nextRows;
    }, [createTile]);

    const settleRowAnimations = useCallback((rowIndex: number) => {
        setRows((prevRows) => prevRows.map((row, idx) => idx !== rowIndex
            ? row
            : row.map((tile) => ({ ...tile, status: 'idle', travelUnits: 1, travelDirection: -1, delayMs: 0 }))));
    }, []);

    const triggerRowShift = useCallback((rowIndex?: number, tileIndex?: number) => {
        if (isAnimatingRef.current) return;

        setRows((prevRows) => {
            if (!prevRows.length) return prevRows;

            const targetRowIndex = rowIndex ?? Math.floor(Math.random() * prevRows.length);
            const row = prevRows[targetRowIndex];
            if (!row?.length) return prevRows;

            const availableDirections: Array<-1 | 1> = [];
            if (row.length > 1) {
                if (tileIndex == null || tileIndex < row.length - 1) availableDirections.push(-1);
                if (tileIndex == null || tileIndex > 0) availableDirections.push(1);
            }
            if (!availableDirections.length) return prevRows;

            const desiredDirection = availableDirections[Math.floor(Math.random() * availableDirections.length)];
            const candidateIndices = row
                .map((_, idx) => idx)
                .filter((idx) => desiredDirection === -1 ? idx < row.length - 1 : idx > 0);
            const targetIndex = tileIndex ?? candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
            const removedTile = row[targetIndex];
            if (!removedTile) return prevRows;

            const travelUnits = removedTile.span;
            const nextRows = prevRows.map((currentRow) => [...currentRow]);

            nextRows[targetRowIndex] = row.map((tile, idx) => {
                if (idx === targetIndex) {
                    return { ...tile, status: 'slide-out', travelUnits, travelDirection: desiredDirection, delayMs: 0 };
                }
                if (desiredDirection === -1 && idx > targetIndex) {
                    return {
                        ...tile,
                        status: 'impact',
                        travelUnits,
                        travelDirection: -1,
                        delayMs: Math.min(54, (idx - targetIndex - 1) * 16),
                    };
                }
                if (desiredDirection === 1 && idx < targetIndex) {
                    return {
                        ...tile,
                        status: 'impact',
                        travelUnits,
                        travelDirection: 1,
                        delayMs: Math.min(54, (targetIndex - idx - 1) * 16),
                    };
                }
                return tile;
            });

            isAnimatingRef.current = true;
            setFocalContent(removedTile.top.src);

            const replaceTimer = window.setTimeout(() => {
                setRows((current) => {
                    const updatedRows = current.map((currentRow) => [...currentRow]);
                    const currentRow = updatedRows[targetRowIndex];
                    if (!currentRow) return current;

                    const withoutRemoved = currentRow.filter((_, idx) => idx !== targetIndex);
                    const exclusions = new Set<string>();
                    const newTile = createTile(removedTile.kind, updatedRows, exclusions);
                    newTile.status = 'enter';
                    newTile.travelUnits = travelUnits;
                    newTile.travelDirection = desiredDirection === -1 ? 1 : -1;
                    updatedRows[targetRowIndex] = desiredDirection === -1
                        ? [...withoutRemoved, newTile]
                        : [newTile, ...withoutRemoved];
                    return updatedRows;
                });

                const settleTimer = window.setTimeout(() => {
                    settleRowAnimations(targetRowIndex);
                    isAnimatingRef.current = false;
                }, ANIMATION_MS - 20);
                timersRef.current.push(settleTimer);
            }, ANIMATION_MS - 30);

            timersRef.current.push(replaceTimer);
            return nextRows;
        });
    }, [createTile, settleRowAnimations]);

    useEffect(() => {
        let cancelled = false;
        setReady(false);
        setRows([]);
        clearTimers();
        recentHistoryRef.current = [];

        void classifyMedia(galleryData).then(({ landscape, portrait }) => {
            if (cancelled) return;

            poolsRef.current = {
                landscape: landscape.length ? landscape : galleryData,
                portrait: portrait.length ? portrait : galleryData,
            };
            decksRef.current = {
                landscape: shuffle([...(landscape.length ? landscape : galleryData)]),
                portrait: shuffle([...(portrait.length ? portrait : galleryData)]),
            };

            const initialRows = buildRows();
            setRows(initialRows);
            setFocalContent(initialRows[0]?.[0]?.top?.src || galleryData[0]?.src || null);
            setReady(true);
        });

        return () => {
            cancelled = true;
            clearTimers();
        };
    }, [buildRows, clearTimers, galleryData]);

    useEffect(() => {
        if (!ready || !rows.length) return;
        const interval = window.setInterval(() => triggerRowShift(), 5000);
        return () => window.clearInterval(interval);
    }, [ready, rows.length, triggerRowShift]);

    useEffect(() => {
        if (!audioRef.current) return;
        audioRef.current.volume = 0.58;
        audioRef.current.play().catch(() => {});
    }, []);

    useEffect(() => {
        const node = gridRef.current;
        if (!node) return;
        const update = () => setGridWidth(node.clientWidth);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(node);
        return () => observer.disconnect();
    }, [rows.length]);

    const toggleMute = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (!audioRef.current) return;
        audioRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const backgroundUrl = useMemo(() => focalContent ? getOptimizedUrl(focalContent, 'blog') : null, [focalContent]);

    return (
        <div ref={shellRef} className="fixed inset-0 z-[100] bg-[#050505] animate-fadeIn flex flex-col overflow-hidden sliding-tiles-shell">
            <style>{sharedStyles}</style>
            <audio ref={audioRef} src="https://res.cloudinary.com/drtve7qyt/video/upload/v1765372845/xqx_mpn0kc.ogg" loop />

            {backgroundUrl && (
                <div
                    className="absolute inset-0 z-0 scale-110 transition-all duration-1000"
                    style={{
                        backgroundImage: `radial-gradient(circle at 18% 20%, rgba(255,255,255,0.08), transparent 35%), radial-gradient(circle at 82% 22%, rgba(255,255,255,0.05), transparent 28%), url(${backgroundUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: 'blur(70px) brightness(0.32) saturate(1.1)',
                    }}
                />
            )}

            <div className="absolute inset-0 z-[1] bg-[linear-gradient(135deg,rgba(255,255,255,0.03),transparent_30%,transparent_70%,rgba(255,255,255,0.03))]" />

            <div className="absolute top-6 right-6 z-[20] flex gap-4">
                <button onClick={toggleMute} className="text-white bg-white/10 hover:bg-white/18 p-2 rounded-full transition-colors backdrop-blur-lg border border-white/15 shadow-xl">
                    {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                <button onClick={onClose} className="text-white bg-white/10 hover:bg-white/18 p-2 rounded-full transition-colors backdrop-blur-lg border border-white/15 shadow-xl">
                    <X size={24} />
                </button>
            </div>

            {!ready || !rows.length ? (
                <div className="flex-1 flex flex-col items-center justify-center z-10">
                    <Loader2 className="animate-spin text-white/80 mb-4" size={48} />
                    <div className="text-white text-xl font-light tracking-[0.45em] uppercase">Preparing Sliding Tiles...</div>
                </div>
            ) : (
                <div className="flex-1 w-full h-full p-2 md:p-3 z-10">
                    <div ref={gridRef} className="w-full h-full sliding-tiles-grid">
                        {rows.flatMap((row, rowIndex) => {
                            const rowWidth = gridWidth || (shellRef.current?.clientWidth ? Math.max(0, shellRef.current.clientWidth - 40) : 0);
                            const unitWidth = rowWidth > 0 ? (rowWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS : 0;

                            return row.map((tile, tileIndex) => {
                                const travelPx = Math.max(0, (unitWidth * tile.travelUnits) + (GRID_GAP * tile.travelUnits));
                                const tileClass = tile.status === 'slide-out'
                                    ? 'sliding-tile-exit'
                                    : tile.status === 'impact'
                                        ? 'sliding-tile-impact'
                                        : tile.status === 'enter'
                                            ? 'sliding-tile-enter'
                                            : '';

                                return (
                                    <div
                                        key={tile.id}
                                        onClick={() => triggerRowShift(rowIndex, tileIndex)}
                                        className={`relative w-full h-full rounded-[1.4rem] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md bg-white/[0.045] border border-white/10 cursor-pointer group/tile sliding-tile ${tileClass}`}
                                        style={{
                                            gridRow: rowIndex + 1,
                                            gridColumn: `span ${tile.span}`,
                                            ['--travel-px' as string]: `${travelPx}px`,
                                            ['--travel-dir' as string]: `${tile.travelDirection}`,
                                            ['--exit-px' as string]: `${Math.max(18, Math.min(34, travelPx * 0.34))}px`,
                                            ['--entry-px' as string]: `${Math.max(20, Math.min(42, travelPx * 0.42))}px`,
                                            ['--impact-delay' as string]: `${tile.delayMs || 0}ms`,
                                        }}
                                    >
                                        <div className="absolute inset-0 z-20 pointer-events-none bg-[linear-gradient(145deg,rgba(255,255,255,0.18),transparent_28%,transparent_72%,rgba(255,255,255,0.06))] opacity-70" />
                                        <div className="absolute inset-0 z-20 pointer-events-none bg-black/10 group-hover/tile:bg-black/0 transition-colors duration-500" />

                                        {tile.kind === 'double' ? (
                                            <div className="flex flex-col w-full h-full gap-2 p-[2px] bg-black/15">
                                                <div className="min-h-0 flex-1 relative overflow-hidden rounded-[1rem]">
                                                    {(() => {
                                                        const props = getTileImageProps(tile.top, tile.topCrop, tile.kind);
                                                        return <StaticTile src={props.src} alt="" imageStyle={props.imageStyle} className="h-full rounded-[1rem]" />;
                                                    })()}
                                                </div>
                                                <div className="min-h-0 flex-1 relative overflow-hidden rounded-[1rem]">
                                                    {tile.bottom && (() => {
                                                        const props = getTileImageProps(tile.bottom, tile.bottomCrop || 'portrait-safe', tile.kind);
                                                        return <StaticTile src={props.src} alt="" imageStyle={props.imageStyle} className="h-full rounded-[1rem]" />;
                                                    })()}
                                                </div>
                                            </div>
                                        ) : (
                                            (() => {
                                                const props = getTileImageProps(tile.top, tile.topCrop, tile.kind);
                                                return (
                                                    <StaticTile
                                                        src={props.src}
                                                        alt=""
                                                        imageStyle={props.imageStyle}
                                                        className="h-full rounded-[1.35rem]"
                                                        imageClassName="group-hover/tile:scale-[1.03] transition-transform duration-700"
                                                    />
                                                );
                                            })()
                                        )}
                                    </div>
                                );
                            });
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
