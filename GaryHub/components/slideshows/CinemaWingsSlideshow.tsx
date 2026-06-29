
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { VideoItem, GalleryItem, TileData } from '../../types';
import { shuffle, getOptimizedUrl } from '../../utils';
import { VideoStaticTile, StaticTile } from './StaticTile';

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

// Helper to get all currently visible URLs to prevent duplicates
const getOnScreenUrls = (rows: TileData[][], key: 'src' | 'video'): Set<string> => {
    const set = new Set<string>();
    rows.forEach(row => {
        row.forEach(tile => {
            // @ts-ignore
            if (tile.top) set.add(tile.top[key]);
            // @ts-ignore
            if (tile.bottom) set.add(tile.bottom[key]);
        });
    });
    return set;
};

// Define valid interactive coordinates for the Wings layout
const WINGS_COORDS = [
    { r: 0, c: 0 }, // Left Wing
    { r: 0, c: 2 }, // Top Single
    { r: 0, c: 3 }, // Right Wing
    { r: 1, c: 2 }  // Bottom Single
];

export const VideoCinemaWingsSlideshow = ({ onClose, videosData }: { onClose: () => void, videosData: VideoItem[] }) => {
    const [rows, setRows] = useState<TileData[][]>([]);
    const [isMuted, setIsMuted] = useState(true);
    const [pools, setPools] = useState({ portrait: [] as VideoItem[], landscape: [] as VideoItem[] });
    
    // Decks for Shuffle Logic
    const portraitDeck = useRef<VideoItem[]>([]);
    const landscapeDeck = useRef<VideoItem[]>([]);

    const [ready, setReady] = useState(false);
    const [focalVideo, setFocalVideo] = useState<string | null>(null);
    const updateQueue = useRef<number[]>([]); 
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        let mounted = true; 
        const videos = [...videosData]; 
        if (!videos.length) return;
        
        // 1. Initial Heuristic Separation (Odd/Even) to ensure FULL coverage immediately
        // This prevents the "small pool" repetition bug by including all videos from the start.
        const hP = videos.filter((_, i) => i % 2 === 0);
        const hL = videos.filter((_, i) => i % 2 !== 0);

        setPools({ portrait: hP, landscape: hL });
        
        // 2. Initialize Decks ONCE
        portraitDeck.current = shuffle([...hP]);
        landscapeDeck.current = shuffle([...hL]);

        let loadedCount = 0;
        let readySet = false;

        const checkReady = () => {
             if (!mounted) return;
             // Start as soon as 5 videos have metadata loaded
             if (!readySet && loadedCount >= Math.min(5, videos.length)) {
                 setReady(true);
                 setFocalVideo(videos[0].video);
                 readySet = true;
             }
        };

        videos.forEach(video => {
            const vid = document.createElement('video'); vid.src = video.video;
            vid.onloadedmetadata = () => { 
                loadedCount++; 
                checkReady();
            };
            vid.onerror = () => { 
                loadedCount++; 
                checkReady(); 
            };
        });
        return () => { mounted = false; };
    }, [videosData]);

    const getNextVideo = useCallback((t: 'portrait' | 'landscape', currentRows: TileData[][] = [], temporaryExclusions: Set<string> = new Set()) => {
        const sourcePool = t === 'portrait' ? pools.portrait : pools.landscape;
        const deckRef = t === 'portrait' ? portraitDeck : landscapeDeck;
        
        // Safety Fallback if pool is empty
        if (!sourcePool || sourcePool.length === 0) {
             return videosData[Math.floor(Math.random() * videosData.length)];
        }

        const onScreen = getOnScreenUrls(currentRows, 'video');
        
        // 1. Try to find the first item in the deck that is NOT on screen and NOT in temporary exclusions
        const candidateIndex = deckRef.current.findIndex(item => 
            !onScreen.has(item.video) && !temporaryExclusions.has(item.video)
        );

        if (candidateIndex !== -1) {
            // Found a valid candidate in the deck
            const [selection] = deckRef.current.splice(candidateIndex, 1);
            return selection;
        }

        // 2. Deck is exhausted or all items in deck are currently blocked.
        // REFILL STRATEGY
        const isBlocked = (item: VideoItem) => onScreen.has(item.video) || temporaryExclusions.has(item.video);
        
        const available = sourcePool.filter(item => !isBlocked(item));
        const busy = sourcePool.filter(item => isBlocked(item));
        
        // Create new shuffled deck
        deckRef.current = [...shuffle(available), ...busy];

        // Try popping again from the new deck
        const [selection] = deckRef.current.splice(0, 1);
        
        return selection || sourcePool[Math.floor(Math.random() * sourcePool.length)];
    }, [pools, videosData]);

    const createTile = useCallback((type: 'single' | 'double' | 'wide' | 'ghost' | 'wing' | 'wide-3' = 'single', currentRows: TileData[][] = []): TileData => {
        const localExclusions = new Set<string>();
        const poolType = (type === 'wide' || type === 'wing' || type === 'double' || type === 'wide-3') ? 'landscape' : 'portrait';
        
        const top = type !== 'ghost' ? getNextVideo(poolType, currentRows, localExclusions) : null;
        if (top) localExclusions.add(top.video);
        
        const bottom = type === 'double' ? getNextVideo('landscape', currentRows, localExclusions) : null;
        
        return { id: Math.random().toString(36).substr(2, 9), type, top, bottom, status: 'idle' };
    }, [getNextVideo]);

    const generateWingsGrid = useCallback(() => {
        const r0: TileData[] = [
            createTile('wing'), createTile('ghost'), createTile('single'), createTile('wing'), createTile('ghost')
        ];
        const r1: TileData[] = [
            createTile('ghost'), createTile('ghost'), createTile('single'), createTile('ghost'), createTile('ghost')
        ];
        return [r0, r1];
    }, [createTile]);

    const triggerSwitch = useCallback((r: number, c: number) => {
        setRows(prevRows => {
            if (!prevRows.length) return prevRows; 
            const nextRows = prevRows.map(row => [...row]); 
            let targetIdx = c;
            
            if (!nextRows[r] || !nextRows[r][targetIdx]) return prevRows;
            if (nextRows[r][targetIdx].type === 'ghost') return prevRows;
            
            if (nextRows[r][targetIdx].status !== 'idle' && nextRows[r][targetIdx].status !== 'entering') return prevRows;

            const videoContent = nextRows[r][targetIdx].top as VideoItem; if (videoContent) setFocalVideo(videoContent.video);
            
            const exitStatus = 'exit-fade-out';
            
            nextRows[r][targetIdx] = { ...nextRows[r][targetIdx], status: exitStatus };
            return nextRows;
        });
        
        setTimeout(() => {
            setRows(prevRows => {
                if (!prevRows.length) return prevRows;
                const nextRows = prevRows.map(r => [...r]);
                const tileToReplace = nextRows[r][c];

                if (!EXIT_EFFECTS.includes(tileToReplace.status)) return prevRows;

                const typeNeeded = tileToReplace.type; 
                
                const tempGrid = nextRows.map((row, rIdx) => 
                     row.map((t, cIdx) => (rIdx === r && cIdx === c) ? { ...t, top: null } : t)
                );

                const newTile = createTile(typeNeeded, tempGrid);
                newTile.status = 'entering';
                
                nextRows[r][c] = newTile;
                return nextRows;
            });
        }, 500);
    }, [createTile]);

    useEffect(() => { 
        if (ready && rows.length === 0) { 
             setRows(generateWingsGrid());
        } 
    }, [ready, generateWingsGrid, rows.length]);
    
    useEffect(() => { if (audioRef.current) { audioRef.current.volume = 0.5; audioRef.current.play().catch(() => {}); } }, [ready]);
    const toggleMute = (e: React.MouseEvent) => { e.stopPropagation(); if (audioRef.current) { audioRef.current.muted = !isMuted; setIsMuted(!isMuted); } };
    
    useEffect(() => { 
        if (rows.length === 0) return; 
        const processRotation = () => {
            if (updateQueue.current.length < 2) {
                const indices = [0, 1, 2, 3];
                for (let i = indices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }
                updateQueue.current = indices;
            }

            const idx1 = updateQueue.current.pop();
            const idx2 = updateQueue.current.pop();
            
            if (idx1 !== undefined) {
                const c1 = WINGS_COORDS[idx1];
                triggerSwitch(c1.r, c1.c);
            }
            if (idx2 !== undefined) {
                const c2 = WINGS_COORDS[idx2];
                setTimeout(() => {
                    triggerSwitch(c2.r, c2.c);
                }, 200);
            }
        };

        const interval = setInterval(processRotation, 6000); 
        return () => clearInterval(interval); 
    }, [rows.length, triggerSwitch]);

    return (
        <div className="fixed inset-0 z-[60] bg-black animate-fadeIn flex flex-col font-sans overflow-hidden">
             {focalVideo && ( <div className="absolute inset-0 z-0 transition-all duration-1000 scale-110"><video crossOrigin="anonymous" src={focalVideo} autoPlay muted loop playsInline className="w-full h-full object-cover" style={{ filter: 'blur(60px) brightness(0.3)' }} /></div> )}
             <style>{` 
               .tile-transition { transition: all 0.5s cubic-bezier(0.25, 1, 0.5, 1); }
               .exit-fade-out { opacity: 0; filter: blur(5px); }
               .entering { animation: tileEnter 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; } 
               @keyframes tileEnter { 
                   0% { opacity: 0; transform: scale(0.8) translateY(30px); filter: blur(15px); } 
                   100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); } 
               } 
             `}</style>
             <audio ref={audioRef} src="https://res.cloudinary.com/drtve7qyt/video/upload/v1765372845/xqx_mpn0kc.ogg" loop />
            <div className="absolute top-4 right-4 z-[70] flex gap-4 pointer-events-auto">
                <button onClick={toggleMute} className="text-white bg-white/10 hover:bg-brand p-2 rounded-full transition-colors backdrop-blur-lg border border-white/20 shadow-xl">{isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}</button>
                <button onClick={onClose} className="text-white bg-white/10 hover:bg-brand p-2 rounded-full transition-colors backdrop-blur-lg border border-white/20 shadow-xl"><X size={24} /></button>
            </div>
            {!ready ? ( <div className="flex-1 flex flex-col items-center justify-center z-10"><Loader2 className="animate-spin text-brand mb-4" size={48} /><div className="text-white text-xl font-light tracking-widest animate-pulse">PREPARING CINEMATIC VIEW...</div></div> ) : (
                <div className="flex-1 w-full h-full grid grid-cols-5 grid-rows-2 gap-2 bg-transparent p-4 z-10">
                    {rows.flatMap((row, rIdx) => row.map((tile, cIdx) => {
                        if (tile.type === 'ghost') return null;
                        
                        let spanStyle = {};
                        if (tile.type === 'wing') spanStyle = { gridColumn: 'span 2', gridRow: 'span 2' };

                        return (
                            <div key={tile.id} 
                                 onClick={() => triggerSwitch(rIdx, cIdx)} 
                                 className={`relative w-full h-full rounded-xl overflow-hidden shadow-2xl backdrop-blur-md bg-white/5 border border-white/10 tile-transition cursor-pointer group/tile ${tile.status}`}
                                 style={{ 
                                     gridRowStart: rIdx + 1,
                                     gridColumnStart: cIdx + 1,
                                     ...spanStyle
                                 }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover/tile:opacity-100 transition-opacity duration-500 z-20" />
                                {tile.type === 'double' ? (
                                    <div className="flex flex-col w-full h-full gap-2">
                                        <div className="flex-1 relative overflow-hidden"><VideoStaticTile src={(tile.top as VideoItem)?.video || ''} /></div>
                                        <div className="flex-1 relative overflow-hidden">{tile.bottom && (<VideoStaticTile src={(tile.bottom as VideoItem)?.video || ''} />)}</div>
                                    </div>
                                ) : ( <VideoStaticTile src={(tile.top as VideoItem)?.video || ''} className="group-hover/tile:scale-105 transition-transform duration-1000" /> )}
                            </div>
                        );
                    }))}
                </div>
            )}
        </div>
    );
};

export const PhotoCinemaWingsSlideshow = ({ onClose, galleryData }: { onClose: () => void, galleryData: GalleryItem[] }) => {
    const [rows, setRows] = useState<TileData[][]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [pools, setPools] = useState({ portrait: [] as GalleryItem[], landscape: [] as GalleryItem[] });
    
    // Decks for Shuffle Logic
    const portraitDeck = useRef<GalleryItem[]>([]);
    const landscapeDeck = useRef<GalleryItem[]>([]);
    
    const [ready, setReady] = useState(false);
    const [focalSrc, setFocalSrc] = useState<string | null>(null);
    const updateQueue = useRef<number[]>([]); 
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        let mounted = true; 
        const items = [...galleryData]; 
        if (!items.length) return;
        
        // 1. Initial Heuristic Separation
        const hP = items.filter((_, i) => i % 2 === 0);
        const hL = items.filter((_, i) => i % 2 !== 0);
        
        setPools({ portrait: hP, landscape: hL });
        
        // 2. Initialize Decks ONCE with full lists
        portraitDeck.current = shuffle([...hP]);
        landscapeDeck.current = shuffle([...hL]);
        
        // 3. Load first 15 to check readiness, but DO NOT RESET DECKS inside the loop
        let loadedCount = 0;
        let readySet = false;
        
        const initLoad = items.slice(0, 15);
        
        initLoad.forEach(item => {
            const img = new Image(); img.src = item.src;
            const check = () => { 
                if (!mounted) return; 
                loadedCount++; 
                if (!readySet && loadedCount >= Math.min(5, initLoad.length)) {
                    setReady(true);
                    setFocalSrc(items[0].src);
                    readySet = true;
                }
            };
            img.onload = check;
            img.onerror = check;
        });
        
        return () => { mounted = false; };
    }, [galleryData]);

    const getNextImage = useCallback((t: 'portrait' | 'landscape', currentRows: TileData[][] = [], temporaryExclusions: Set<string> = new Set()) => {
        const sourcePool = t === 'portrait' ? pools.portrait : pools.landscape;
        const deckRef = t === 'portrait' ? portraitDeck : landscapeDeck;
        
        if (!sourcePool || sourcePool.length === 0) {
             return galleryData[Math.floor(Math.random() * galleryData.length)];
        }
        
        const onScreen = getOnScreenUrls(currentRows, 'src');

        // 1. Try to find candidate in current deck
        const candidateIndex = deckRef.current.findIndex(item => 
            !onScreen.has(item.src) && !temporaryExclusions.has(item.src)
        );

        if (candidateIndex !== -1) {
            const [selection] = deckRef.current.splice(candidateIndex, 1);
            return selection;
        }

        // 2. Refill Deck
        const isBlocked = (item: GalleryItem) => onScreen.has(item.src) || temporaryExclusions.has(item.src);
        const available = sourcePool.filter(item => !isBlocked(item));
        const busy = sourcePool.filter(item => isBlocked(item));
        
        deckRef.current = [...shuffle(available), ...busy];
        
        const [selection] = deckRef.current.splice(0, 1);
        return selection || sourcePool[Math.floor(Math.random() * sourcePool.length)];
    }, [pools, galleryData]);

    const createTile = useCallback((type: 'single' | 'double' | 'wide' | 'ghost' | 'wing' | 'wide-3' = 'single', currentRows: TileData[][] = []): TileData => {
        const localExclusions = new Set<string>();
        const poolType = (type === 'wide' || type === 'wing' || type === 'double' || type === 'wide-3') ? 'landscape' : 'portrait';
        
        const top = type !== 'ghost' ? getNextImage(poolType, currentRows, localExclusions) : null;
        if (top) localExclusions.add(top.src);
        
        const bottom = type === 'double' ? getNextImage('landscape', currentRows, localExclusions) : null;
        
        return { id: Math.random().toString(36).substr(2, 9), type, top, bottom, status: 'idle' };
    }, [getNextImage]);

    const generateWingsGrid = useCallback(() => {
        const r0: TileData[] = [
            createTile('wing'), createTile('ghost'), createTile('single'), createTile('wing'), createTile('ghost')
        ];
        const r1: TileData[] = [
            createTile('ghost'), createTile('ghost'), createTile('single'), createTile('ghost'), createTile('ghost')
        ];
        return [r0, r1];
    }, [createTile]);

    const triggerSwitch = useCallback((r: number, c: number) => {
        setRows(prevRows => {
            if (!prevRows.length) return prevRows; 
            const nextRows = prevRows.map(row => [...row]); 
            let targetIdx = c;
            
            if (!nextRows[r] || !nextRows[r][targetIdx]) return prevRows;
            if (nextRows[r][targetIdx].type === 'ghost') return prevRows;
            
            if (nextRows[r][targetIdx].status !== 'idle' && nextRows[r][targetIdx].status !== 'entering') return prevRows;

            const imgContent = nextRows[r][targetIdx].top as GalleryItem; if (imgContent) setFocalSrc(imgContent.src);
            
            const exitStatus = 'exit-fade-out';
            
            nextRows[r][targetIdx] = { ...nextRows[r][targetIdx], status: exitStatus };
            return nextRows;
        });
        
        setTimeout(() => {
            setRows(prevRows => {
                if (!prevRows.length) return prevRows;
                const nextRows = prevRows.map(r => [...r]);
                const tileToReplace = nextRows[r][c];

                if (!EXIT_EFFECTS.includes(tileToReplace.status)) return prevRows;

                const typeNeeded = tileToReplace.type; 
                
                const tempGrid = nextRows.map((row, rIdx) => 
                     row.map((t, cIdx) => (rIdx === r && cIdx === c) ? { ...t, top: null } : t)
                );

                const newTile = createTile(typeNeeded, tempGrid);
                newTile.status = 'entering';
                
                nextRows[r][c] = newTile;
                return nextRows;
            });
        }, 500);
    }, [createTile]);

    useEffect(() => { 
        if (ready && rows.length === 0) { 
             setRows(generateWingsGrid());
        } 
    }, [ready, generateWingsGrid, rows.length]);
    
    useEffect(() => { if (audioRef.current) { audioRef.current.volume = 0.5; audioRef.current.play().catch(() => {}); } }, [ready]);
    const toggleMute = (e: React.MouseEvent) => { e.stopPropagation(); if (audioRef.current) { audioRef.current.muted = !isMuted; setIsMuted(!isMuted); } };
    
    useEffect(() => { 
        if (rows.length === 0) return; 
        const processRotation = () => {
            if (updateQueue.current.length < 2) {
                const indices = [0, 1, 2, 3];
                for (let i = indices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }
                updateQueue.current = indices;
            }

            const idx1 = updateQueue.current.pop();
            const idx2 = updateQueue.current.pop();
            
            if (idx1 !== undefined) {
                const c1 = WINGS_COORDS[idx1];
                triggerSwitch(c1.r, c1.c);
            }
            if (idx2 !== undefined) {
                const c2 = WINGS_COORDS[idx2];
                setTimeout(() => {
                    triggerSwitch(c2.r, c2.c);
                }, 200);
            }
        };

        const interval = setInterval(processRotation, 6000); 
        return () => clearInterval(interval); 
    }, [rows.length, triggerSwitch]);

    return (
        <div className="fixed inset-0 z-[60] bg-black animate-fadeIn flex flex-col font-sans overflow-hidden">
             {focalSrc && ( <div className="absolute inset-0 z-0 transition-all duration-1000 scale-110" style={{ backgroundImage: `url(${getOptimizedUrl(focalSrc, 'blog')})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) brightness(0.3)' }} /> )}
             <style>{` 
               .tile-transition { transition: all 0.5s cubic-bezier(0.25, 1, 0.5, 1); }
               .exit-fade-out { opacity: 0; filter: blur(5px); }
               .entering { animation: tileEnter 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; } 
               @keyframes tileEnter { 
                   0% { opacity: 0; transform: scale(0.8) translateY(30px); filter: blur(15px); } 
                   100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); } 
               } 
             `}</style>
             <audio ref={audioRef} src="https://res.cloudinary.com/drtve7qyt/video/upload/v1765372845/xqx_mpn0kc.ogg" loop />
            <div className="absolute top-4 right-4 z-[70] flex gap-4 pointer-events-auto">
                <button onClick={toggleMute} className="text-white bg-white/10 hover:bg-brand p-2 rounded-full transition-colors backdrop-blur-lg border border-white/20 shadow-xl">{isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}</button>
                <button onClick={onClose} className="text-white bg-white/10 hover:bg-brand p-2 rounded-full transition-colors backdrop-blur-lg border border-white/20 shadow-xl"><X size={24} /></button>
            </div>
            {!ready ? ( <div className="flex-1 flex flex-col items-center justify-center z-10"><Loader2 className="animate-spin text-brand mb-4" size={48} /><div className="text-white text-xl font-light tracking-widest animate-pulse">PREPARING CINEMATIC VIEW...</div></div> ) : (
                <div className="flex-1 w-full h-full grid grid-cols-5 grid-rows-2 gap-2 bg-transparent p-4 z-10">
                    {rows.flatMap((row, rIdx) => row.map((tile, cIdx) => {
                        if (tile.type === 'ghost') return null;
                        
                        let spanStyle = {};
                        if (tile.type === 'wing') spanStyle = { gridColumn: 'span 2', gridRow: 'span 2' };

                        return (
                            <div key={tile.id} 
                                 onClick={() => triggerSwitch(rIdx, cIdx)} 
                                 className={`relative w-full h-full rounded-xl overflow-hidden shadow-2xl backdrop-blur-md bg-white/5 border border-white/10 tile-transition cursor-pointer group/tile ${tile.status}`}
                                 style={{ 
                                     gridRowStart: rIdx + 1,
                                     gridColumnStart: cIdx + 1,
                                     ...spanStyle
                                 }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover/tile:opacity-100 transition-opacity duration-500 z-20" />
                                {tile.type === 'double' ? (
                                    <div className="flex flex-col w-full h-full gap-2">
                                        <div className="flex-1 relative overflow-hidden"><StaticTile src={getOptimizedUrl((tile.top as GalleryItem)?.src || '', 'landscape')} alt="" /></div>
                                        <div className="flex-1 relative overflow-hidden">{tile.bottom && (<StaticTile src={getOptimizedUrl((tile.bottom as GalleryItem)?.src || '', 'landscape')} alt="" />)}</div>
                                    </div>
                                ) : ( <StaticTile src={getOptimizedUrl((tile.top as GalleryItem)?.src || '', 'portrait')} alt="" className="group-hover/tile:scale-105 transition-transform duration-1000" /> )}
                            </div>
                        );
                    }))}
                </div>
            )}
        </div>
    );
};
