
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { GalleryItem, VideoItem } from '../../types';
import { getOptimizedUrl, shuffle } from '../../utils';

// --- CONFIGURATION ---
const GRID_ROWS = 2;
const GRID_COLS = 5;
const TILE_GAP = 4; // px

// Physics / Timing
const SHIFT_DURATION = 900; // ms
const PAUSE_DURATION = 3000; // ms
const MERGE_CHECK_INTERVAL = 2500; // Check for merges every 2.5s
const OVERSHOOT_FACTOR = 1.05; // 5% overshoot

// Easing
const CUBIC_OVERSHOOT = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; 

type TileType = 'standard' | 'wide' | 'double';

interface FlowTileData {
    id: string;
    uId: string; // Unique ID for key
    r: number;
    c: number;
    w: number; // width in units
    h: number; // height in units
    type: TileType;
    media: (GalleryItem | VideoItem)[];
    // Animation State
    offsetX: number; // % of unit
    offsetY: number; // % of unit
    isExiting?: boolean;
    exitEffect?: string;
    isEntering?: boolean;
}

const EXIT_EFFECTS = [
    'exit-fade-out',
    'exit-scale-down',
    'exit-scale-up',
    'exit-slide-top',
    'exit-slide-bottom',
    'exit-slide-left',
    'exit-slide-right',
    'exit-rotate-cw',
    'exit-rotate-ccw',
    'exit-flip-x',
    'exit-flip-y',
    'exit-blur-motion',
    'exit-skew-slide',
    'exit-implode',
    'exit-fly-random'
];

export const FlowDriftSlideshow = ({ 
    items, 
    type,
    onClose 
}: { 
    items: (GalleryItem | VideoItem)[], 
    type: 'photo' | 'video',
    onClose: () => void 
}) => {
    const [tiles, setTiles] = useState<FlowTileData[]>([]);
    const [ready, setReady] = useState(false);
    const [isMuted, setIsMuted] = useState(type === 'video');
    
    // --- Sorting State ---
    const [pools, setPools] = useState({ portrait: [] as (GalleryItem | VideoItem)[], landscape: [] as (GalleryItem | VideoItem)[] });
    const portraitDeck = useRef<(GalleryItem | VideoItem)[]>([]);
    const landscapeDeck = useRef<(GalleryItem | VideoItem)[]>([]);
    const recentHistoryRef = useRef<string[]>([]);

    const animatingRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    // --- 1. SORTING & INITIALIZATION ---
    useEffect(() => {
        if (!items || items.length === 0) return;
        
        let mounted = true;
        const p: (GalleryItem | VideoItem)[] = [];
        const l: (GalleryItem | VideoItem)[] = [];
        let loadedCount = 0;
        
        // Initial simplified separation to prevent empty deck issues
        const pBase = items.filter((_, i) => i % 2 === 0);
        const lBase = items.filter((_, i) => i % 2 !== 0);
        
        // Temporarily set them so we can start if metadata loads slowly
        // But we ideally want accurate ratios.
        // We will do a progressive update.
        
        const checkDone = () => {
            if (!mounted) return;
            // Only update decks if we have meaningful data
            if (p.length + l.length > 0) {
               setPools({ portrait: p, landscape: l });
               // Only shuffle and assign if decks are empty (first run)
               if (portraitDeck.current.length === 0) portraitDeck.current = shuffle([...p]);
               if (landscapeDeck.current.length === 0) landscapeDeck.current = shuffle([...l]);
            }
            
            // Allow start if we have checked enough items or all items
            if (!ready && loadedCount >= Math.min(items.length, 10)) {
                setReady(true);
            }
        };

        const checkLimit = Math.min(items.length, 60); // Don't check thousands
        const subset = items.slice(0, checkLimit);

        subset.forEach(item => {
            const url = type === 'photo' ? (item as GalleryItem).src : (item as VideoItem).video;
            
            if (type === 'video') {
                const vid = document.createElement('video');
                vid.src = url;
                vid.onloadedmetadata = () => {
                    if (vid.videoWidth >= vid.videoHeight) l.push(item); else p.push(item);
                    loadedCount++;
                    checkDone();
                };
                vid.onerror = () => {
                    // Fallback
                    if (Math.random() > 0.5) l.push(item); else p.push(item);
                    loadedCount++;
                    checkDone();
                };
            } else {
                const img = new Image();
                img.src = url;
                img.onload = () => {
                    if (img.naturalWidth >= img.naturalHeight) l.push(item); else p.push(item);
                    loadedCount++;
                    checkDone();
                };
                img.onerror = () => {
                    if (Math.random() > 0.5) l.push(item); else p.push(item);
                    loadedCount++;
                    checkDone();
                };
            }
        });
        
        // Fallback for readiness if things fail
        const timer = setTimeout(() => {
            if (!ready) {
                // If sorting failed/timed out, use heuristic
                setPools({ portrait: pBase, landscape: lBase });
                if (portraitDeck.current.length === 0) portraitDeck.current = shuffle([...pBase]);
                if (landscapeDeck.current.length === 0) landscapeDeck.current = shuffle([...lBase]);
                setReady(true);
            }
        }, 3000);

        return () => { 
            mounted = false; 
            clearTimeout(timer);
        };
    }, [items, type]); // removed ready dependency to avoid loops

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = 0.4;
            audioRef.current.play().catch(() => {});
        }
    }, [ready]);

    const getItemUrl = useCallback((item: GalleryItem | VideoItem) => (
        type === 'photo' ? (item as GalleryItem).src : (item as VideoItem).video
    ), [type]);

    const rememberUsage = useCallback((urls: string[]) => {
        urls.forEach((url) => recentHistoryRef.current.push(url));
        const maxHistory = Math.max(14, Math.min(items.length - 1, Math.floor(items.length * 0.5)));
        while (recentHistoryRef.current.length > maxHistory) recentHistoryRef.current.shift();
    }, [items.length]);

    // --- 2. DECK HELPERS ---
    const getNextMedia = useCallback((
        aspect: 'portrait' | 'landscape',
        count: number = 1,
        currentTiles: FlowTileData[] = [],
        exclusions: Set<string> = new Set()
    ) => {
        const deck = aspect === 'portrait' ? portraitDeck : landscapeDeck;
        const pool = aspect === 'portrait' ? pools.portrait : pools.landscape;
        const onScreen = new Set<string>();
        currentTiles.forEach((tile) => tile.media.forEach((media) => onScreen.add(getItemUrl(media))));
        
        // Fallback Strategy if a specific pool is empty
        let sourceDeck = deck.current;
        let sourcePool = pool;

        // If specific deck is empty, try to refill from pool
        if (sourceDeck.length === 0) {
            if (sourcePool.length > 0) {
                deck.current = shuffle([...sourcePool]);
                sourceDeck = deck.current;
            } else {
                // Critical Fallback: Use the OTHER deck if this one is totally empty
                // e.g. If we need portrait but have none, use landscape
                const otherDeck = aspect === 'portrait' ? landscapeDeck : portraitDeck;
                const otherPool = aspect === 'portrait' ? pools.landscape : pools.portrait;
                
                if (otherDeck.current.length === 0 && otherPool.length > 0) {
                    otherDeck.current = shuffle([...otherPool]);
                }
                sourceDeck = otherDeck.current.length > 0 ? otherDeck.current : items; // Last resort: raw items
            }
        }

        const result: (GalleryItem | VideoItem)[] = [];
        for (let i = 0; i < count; i++) {
            if (sourceDeck.length === 0) {
                 // Refill attempt inside loop
                 if (sourcePool.length > 0) {
                     deck.current = shuffle([...sourcePool]);
                     sourceDeck = deck.current;
                 } else {
                     // Try fallback refill from items
                     sourceDeck = shuffle([...items]);
                 }
            }
            let selection: (GalleryItem | VideoItem) | undefined;

            const pickFromDeck = (candidateDeck: (GalleryItem | VideoItem)[]) => {
                const fresh = candidateDeck.find((item) => {
                    const url = getItemUrl(item);
                    return !onScreen.has(url) && !exclusions.has(url) && !recentHistoryRef.current.includes(url);
                });
                if (fresh) return fresh;

                return candidateDeck.find((item) => {
                    const url = getItemUrl(item);
                    return !onScreen.has(url) && !exclusions.has(url);
                });
            };

            selection = pickFromDeck(sourceDeck);

            if (!selection && sourcePool.length > 0) {
                const reshuffled = shuffle([...sourcePool]);
                if (aspect === 'portrait') portraitDeck.current = reshuffled;
                else landscapeDeck.current = reshuffled;
                sourceDeck = reshuffled;
                selection = pickFromDeck(sourceDeck);
            }

            if (!selection && items.length > 0) {
                selection = items.find((item) => {
                    const url = getItemUrl(item);
                    return !onScreen.has(url) && !exclusions.has(url) && !recentHistoryRef.current.includes(url);
                }) || items.find((item) => {
                    const url = getItemUrl(item);
                    return !onScreen.has(url) && !exclusions.has(url);
                }) || items[Math.floor(Math.random() * items.length)];
            }

            if (selection) {
                const selectedUrl = getItemUrl(selection);
                if (aspect === 'portrait') {
                    portraitDeck.current = portraitDeck.current.filter((item) => getItemUrl(item) !== selectedUrl);
                    sourceDeck = portraitDeck.current;
                } else {
                    landscapeDeck.current = landscapeDeck.current.filter((item) => getItemUrl(item) !== selectedUrl);
                    sourceDeck = landscapeDeck.current;
                }
                result.push(selection);
                onScreen.add(selectedUrl);
                exclusions.add(selectedUrl);
            }
        }
        rememberUsage(result.map((item) => getItemUrl(item)));
        return result;
    }, [pools, items, getItemUrl, rememberUsage]);

    // --- 3. GRID GENERATION ---
    const generateLayout = useCallback(() => {
        const newTiles: FlowTileData[] = [];
        const gridMap = Array(GRID_ROWS).fill(null).map(() => Array(GRID_COLS).fill(false));
        const batchExclusions = new Set<string>();

        for (let r = 0; r < GRID_ROWS; r++) {
            let rowHasWide = false; 
            
            for (let c = 0; c < GRID_COLS; c++) {
                if (gridMap[r][c]) continue;

                let tType: TileType = 'standard';
                let w = 1;
                const rand = Math.random();
                
                // Wide: 30% chance
                if (!rowHasWide && rand > 0.7 && c < GRID_COLS - 1 && !gridMap[r][c+1]) {
                    tType = 'wide';
                    w = 2;
                    rowHasWide = true;
                } 
                // Double: Reduced chance
                else if (rand > 0.85) {
                    tType = 'double';
                }

                gridMap[r][c] = true;
                if (w === 2) gridMap[r][c+1] = true;

                // LOGIC: 
                // Wide -> Landscape
                // Double -> 2x Landscape (Stacked)
                // Standard -> Portrait
                const aspect = tType === 'standard' ? 'portrait' : 'landscape';
                const count = tType === 'double' ? 2 : 1;

                newTiles.push({
                    id: Math.random().toString(36).slice(2),
                    uId: Math.random().toString(36).slice(2),
                    r,
                    c,
                    w,
                    h: 1,
                    type: tType,
                    media: getNextMedia(aspect, count, newTiles, batchExclusions),
                    offsetX: 0,
                    offsetY: 0
                });
            }
        }
        return newTiles;
    }, [getNextMedia]);

    // Initialize Tiles when Ready
    useEffect(() => {
        if (ready && tiles.length === 0) {
            setTiles(generateLayout());
        }
    }, [ready, generateLayout, tiles.length]);

    // --- 4. SHIFT LOGIC ---
    const performShift = useCallback(() => {
        if (animatingRef.current || !ready) return;
        animatingRef.current = true;

        // Mode Selection
        const mode = Math.random();
        
        setTiles(currentTiles => {
            const nextTiles = currentTiles.map(t => ({...t}));
            
            // Mode A: Row Shift (Horizontal Slide) - 35%
            if (mode < 0.35) { 
                const rowIdx = Math.floor(Math.random() * GRID_ROWS);
                const dir = Math.random() > 0.5 ? 1 : -1;
                nextTiles.forEach(t => { if (t.r === rowIdx) t.offsetX = dir * 100 * OVERSHOOT_FACTOR; });
            } 
            // Mode B: Col Shift (Vertical Slide) - 35%
            else if (mode < 0.70) {
                const validCols = [];
                for(let c=0; c<GRID_COLS; c++) {
                    const intersectedByWide = nextTiles.some(t => (t.c === c && t.w > 1) || (t.c < c && t.c + t.w > c));
                    if (!intersectedByWide) validCols.push(c);
                }
                if (validCols.length === 0) {
                    const dirX = Math.random() > 0.5 ? 1 : -1;
                    nextTiles.forEach(t => t.offsetX = dirX * 100 * OVERSHOOT_FACTOR);
                } else {
                    const colIdx = validCols[Math.floor(Math.random() * validCols.length)];
                    const dir = Math.random() > 0.5 ? 1 : -1;
                    nextTiles.filter(t => t.c === colIdx).forEach(t => t.offsetY = dir * 100 * OVERSHOOT_FACTOR);
                }
            }
            // Mode C: Single Tile Refresh - 30%
            else {
                if (nextTiles.length > 0) {
                    const available = nextTiles.filter(t => !t.isExiting);
                    if (available.length > 0) {
                        const target = available[Math.floor(Math.random() * available.length)];
                        target.isExiting = true;
                        target.exitEffect = EXIT_EFFECTS[Math.floor(Math.random() * EXIT_EFFECTS.length)];
                    }
                }
            }
            return nextTiles;
        });

        // Settle & Fill
        setTimeout(() => {
            setTiles(currentTiles => {
                const nextTiles: FlowTileData[] = [];
                const occupied = new Set<string>();

                // 1. Process Surviving Tiles
                currentTiles.forEach(t => {
                    if (t.isExiting) return;

                    let newR = t.r;
                    let newC = t.c;
                    
                    if (t.offsetX > 50) newC += 1;
                    else if (t.offsetX < -50) newC -= 1;
                    
                    if (t.offsetY > 50) newR += 1;
                    else if (t.offsetY < -50) newR -= 1;

                    if (newR >= 0 && newR < GRID_ROWS && newC >= 0 && newC < GRID_COLS) {
                        if (t.w > 1 && newC + 1 >= GRID_COLS) return; // Wide clipped
                        
                        t.r = newR;
                        t.c = newC;
                        t.offsetX = 0;
                        t.offsetY = 0;
                        t.isEntering = false;
                        
                        nextTiles.push(t);
                        occupied.add(`${newR},${newC}`);
                        if (t.w > 1) occupied.add(`${newR},${newC+1}`);
                    }
                });

                // 2. Fill Gaps
                const batchExclusions = new Set<string>();
                for (let r = 0; r < GRID_ROWS; r++) {
                    let rowHasWide = nextTiles.some(t => t.r === r && t.type === 'wide');

                    for (let c = 0; c < GRID_COLS; c++) {
                        if (occupied.has(`${r},${c}`)) continue;

                        let tType: TileType = 'standard';
                        let w = 1;
                        
                        const canFitWide = !rowHasWide && c < GRID_COLS - 1 && !occupied.has(`${r},${c+1}`);
                        
                        if (canFitWide && Math.random() > 0.7) {
                            tType = 'wide';
                            w = 2;
                            rowHasWide = true;
                        } else if (Math.random() > 0.85) {
                            tType = 'double';
                        }

                        // Apply logic
                        const aspect = tType === 'standard' ? 'portrait' : 'landscape';
                        const count = tType === 'double' ? 2 : 1;

                        nextTiles.push({
                            id: Math.random().toString(36).slice(2),
                            uId: Math.random().toString(36).slice(2),
                            r,
                            c,
                            w,
                            h: 1,
                            type: tType,
                            media: getNextMedia(aspect, count, nextTiles, batchExclusions),
                            offsetX: 0,
                            offsetY: 0,
                            isExiting: false,
                            isEntering: true 
                        });

                        occupied.add(`${r},${c}`);
                        if (w === 2) occupied.add(`${r},${c+1}`);
                        if (w === 2) c++; 
                    }
                }

                animatingRef.current = false;
                return nextTiles;
            });
        }, SHIFT_DURATION);

    }, [ready, getNextMedia]);

    // --- 5. AUTOMATIC MERGE MUTATION ---
    useEffect(() => {
        if (!ready) return;

        const attemptMerge = () => {
            if (animatingRef.current) return;
            if (Math.random() > 0.2) return; // 20% probability

            setTiles(prev => {
                const rows: FlowTileData[][] = Array.from({ length: GRID_ROWS }, () => []);
                prev.forEach(t => { if (t.r >= 0 && t.r < GRID_ROWS) rows[t.r].push(t); });
                rows.forEach(r => r.sort((a,b) => a.c - b.c));
                
                const candidates: { t1: FlowTileData, t2: FlowTileData }[] = [];
                
                rows.forEach(row => {
                    if (row.some(t => t.type === 'wide')) return;
                    for(let i=0; i<row.length-1; i++) {
                        const t1 = row[i];
                        const t2 = row[i+1];
                        const areAdjacent = (t1.c + t1.w === t2.c);
                        const areSingle = t1.w === 1 && t2.w === 1; 
                        const areSteady = t1.offsetX === 0 && !t1.isExiting && !t2.isExiting;
                        if (areAdjacent && areSingle && areSteady) candidates.push({ t1, t2 });
                    }
                });
                
                if (candidates.length === 0) return prev;
                
                const target = candidates[Math.floor(Math.random() * candidates.length)];
                animatingRef.current = true; // Lock
                
                // 1. Mark for Exit
                const nextTiles = prev.map(t => {
                    if (t.id === target.t1.id || t.id === target.t2.id) {
                        return { 
                            ...t, 
                            isExiting: true, 
                            exitEffect: EXIT_EFFECTS[Math.floor(Math.random() * EXIT_EFFECTS.length)] 
                        };
                    }
                    return t;
                });

                // 2. Schedule Replacement
                setTimeout(() => {
                    setTiles(current => {
                        const filtered = current.filter(t => t.id !== target.t1.id && t.id !== target.t2.id);
                        
                        const newWide: FlowTileData = {
                            id: Math.random().toString(36).slice(2),
                            uId: Math.random().toString(36).slice(2),
                            r: target.t1.r,
                            c: target.t1.c,
                            w: 2,
                            h: 1,
                            type: 'wide',
                            // Wide must use Landscape
                            media: getNextMedia('landscape', 1, filtered, new Set()),
                            offsetX: 0,
                            offsetY: 0,
                            isExiting: false,
                            isEntering: true
                        };
                        
                        animatingRef.current = false;
                        return [...filtered, newWide];
                    });
                }, 800); 

                return nextTiles;
            });
        };

        const interval = setInterval(attemptMerge, MERGE_CHECK_INTERVAL);
        return () => clearInterval(interval);
    }, [ready, getNextMedia]);

    // --- 6. MAIN LOOP ---
    useEffect(() => {
        if (!ready) return;
        const interval = setInterval(performShift, SHIFT_DURATION + PAUSE_DURATION);
        const to = setTimeout(performShift, 1000);
        return () => {
            clearInterval(interval);
            clearTimeout(to);
        };
    }, [ready, performShift]);

    // --- RENDER ---
    const getTileStyle = (t: FlowTileData): React.CSSProperties => {
        const top = t.r * 50; 
        const left = t.c * 20;
        const width = t.w * 20;
        const height = 50;

        if (t.isExiting) {
            return {
                top: `${top}%`,
                left: `${left}%`,
                width: `${width}%`,
                height: `${height}%`,
                padding: `${TILE_GAP}px`,
                position: 'absolute',
                boxSizing: 'border-box',
                zIndex: 50 
            };
        }

        const transform = `translate3d(${t.offsetX}%, ${t.offsetY}%, 0)`;
        const isMoving = t.offsetX !== 0 || t.offsetY !== 0;
        const transition = isMoving ? `transform ${SHIFT_DURATION}ms ${CUBIC_OVERSHOOT}` : 'none';

        return {
            top: `${top}%`,
            left: `${left}%`,
            width: `${width}%`,
            height: `${height}%`,
            transform, 
            transition,
            padding: `${TILE_GAP}px`,
            position: 'absolute',
            boxSizing: 'border-box'
        };
    };

    const toggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (audioRef.current) {
            audioRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-3xl font-sans overflow-hidden animate-fadeIn select-none">
            <style>{`
                @keyframes scaleUpFade {
                    0% { opacity: 0; transform: scale(0.9); }
                    100% { opacity: 1; transform: scale(1); }
                }
                .animate-appear {
                    animation: scaleUpFade 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
                }
                
                /* Exit Effects - Using !important to ensure override of any residual inline styles */
                .exit-fade-out { opacity: 0 !important; filter: blur(5px) !important; }
                .exit-scale-down { transform: scale(0) !important; opacity: 0 !important; }
                .exit-scale-up { transform: scale(2) !important; opacity: 0 !important; filter: blur(10px) !important; }
                .exit-slide-top { transform: translateY(-150%) !important; opacity: 0 !important; }
                .exit-slide-bottom { transform: translateY(150%) !important; opacity: 0 !important; }
                .exit-slide-left { transform: translateX(-150%) !important; opacity: 0 !important; }
                .exit-slide-right { transform: translateX(150%) !important; opacity: 0 !important; }
                .exit-rotate-cw { transform: rotate(180deg) scale(0) !important; opacity: 0 !important; }
                .exit-rotate-ccw { transform: rotate(-180deg) scale(0) !important; opacity: 0 !important; }
                .exit-flip-x { transform: perspective(500px) rotateX(90deg) !important; opacity: 0 !important; }
                .exit-flip-y { transform: perspective(500px) rotateY(90deg) !important; opacity: 0 !important; }
                .exit-blur-motion { filter: blur(40px) !important; opacity: 0 !important; transform: scale(1.2) !important; }
                .exit-skew-slide { transform: skewX(30deg) translateX(-100%) !important; opacity: 0 !important; }
                .exit-implode { transform: scale(0.1) rotate(45deg) !important; opacity: 0 !important; filter: brightness(0) !important; }
                .exit-fly-random { transform: translate(100px, -100px) rotate(20deg) scale(0.5) !important; opacity: 0 !important; }
            `}</style>

            <div className="absolute top-6 right-6 z-[120] flex gap-4 pointer-events-auto">
                <button onClick={toggleMute} className="text-white/80 bg-black/20 hover:bg-white/20 p-3 rounded-full transition-colors backdrop-blur-md border border-white/10 shadow-xl">
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <button onClick={onClose} className="text-white/80 bg-black/20 hover:bg-white/20 p-3 rounded-full transition-colors backdrop-blur-md border border-white/10 shadow-xl">
                    <X size={20} />
                </button>
            </div>

            <audio ref={audioRef} src="https://res.cloudinary.com/drtve7qyt/video/upload/v1765372845/xqx_mpn0kc.ogg" loop />

            {!ready && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-50">
                    <Loader2 className="animate-spin text-white/50 mb-4" size={48} />
                    <div className="text-white/80 text-sm font-light tracking-[0.2em] animate-pulse">INITIALIZING FLOW...</div>
                </div>
            )}

            <div ref={containerRef} className="absolute inset-0 z-10 w-full h-full">
                {tiles.map(tile => {
                    const renderMedia = (item: GalleryItem | VideoItem) => {
                        if (type === 'photo') {
                            return <img src={getOptimizedUrl((item as GalleryItem).src, 'grid')} className="w-full h-full object-cover" alt="" />;
                        } else {
                            return <video src={(item as VideoItem).video} autoPlay muted loop playsInline className="w-full h-full object-cover" />;
                        }
                    };

                    let animClass = "transition-all duration-700 ease-in-out";
                    if (tile.isExiting && tile.exitEffect) {
                        animClass = `transition-all duration-700 ease-in-out ${tile.exitEffect}`;
                    } else if (tile.isEntering) {
                        animClass = "animate-appear";
                    }

                    return (
                        <div key={tile.uId} style={getTileStyle(tile)} className={animClass}>
                            <div className="w-full h-full relative overflow-hidden rounded-md shadow-2xl border border-white/5 bg-[#111] group">
                                {tile.type === 'double' ? (
                                    <div className="flex flex-col w-full h-full gap-[4px]">
                                        <div className="flex-1 relative overflow-hidden rounded-sm">{renderMedia(tile.media[0])}</div>
                                        <div className="flex-1 relative overflow-hidden rounded-sm">{renderMedia(tile.media[1])}</div>
                                    </div>
                                ) : (
                                    <div className="w-full h-full relative">
                                        {renderMedia(tile.media[0])}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
