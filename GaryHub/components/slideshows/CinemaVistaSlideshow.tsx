
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { VideoItem, TileData } from '../../types';
import { shuffle } from '../../utils';

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

// Internal component for the video tile that handles its own audio state and end events
const SteadyVideoTile = ({ 
    video, 
    isActiveAudio, 
    onToggleMute, 
    onEnded, 
    enableZoom = false,
    className = "" 
}: { 
    video: string, 
    isActiveAudio: boolean, 
    onToggleMute: (e: React.MouseEvent) => void, 
    onEnded: () => void,
    enableZoom?: boolean,
    className?: string 
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = !isActiveAudio;
        }
    }, [isActiveAudio]);

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const current = videoRef.current.currentTime;
            const dur = videoRef.current.duration;
            if (dur > 0 && !isNaN(dur)) {
                setDuration(dur);
                setProgress((current / dur) * 100);
            }
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setProgress(val);
        if (videoRef.current && duration > 0) {
            videoRef.current.currentTime = (val / 100) * duration;
        }
    };

    return (
        // Added 'group' class here to allow controls to show on hover of THIS tile
        <div className={`relative w-full h-full group ${className}`}>
            <video 
                ref={videoRef}
                crossOrigin="anonymous" 
                src={video} 
                autoPlay 
                muted={!isActiveAudio} // Default muted
                loop={false} // Important: must not loop so onEnded fires
                playsInline 
                onEnded={onEnded}
                onTimeUpdate={handleTimeUpdate}
                // Apply scale transform HERE to the video only, so the container/controls don't move and get clipped
                className={`w-full h-full object-cover transition-transform duration-1000 ${enableZoom ? 'group-hover/tile:scale-110' : ''}`} 
            />
            
            {/* Controls Container: Visible on hover of this specific tile (.group) */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-30">
                
                {/* Bottom Gradient for visibility */}
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                
                {/* Audio Control - Top Left (Pointer Events Auto) */}
                <div className="absolute top-3 left-3 pointer-events-auto">
                    <button 
                        onClick={onToggleMute}
                        className="p-2.5 rounded-full backdrop-blur-md bg-black/40 hover:bg-white/20 text-white border border-white/10 shadow-lg transition-transform hover:scale-110"
                        title={isActiveAudio ? "Mute" : "Unmute"}
                    >
                        {isActiveAudio ? <Volume2 size={20} /> : <VolumeX size={20} />}
                    </button>
                </div>

                {/* Progress Bar Container - Bottom (Pointer Events Auto) */}
                <div className="absolute bottom-0 left-0 right-0 h-8 flex items-end pointer-events-auto px-0 pb-0">
                    <div className="relative w-full h-full cursor-pointer group/progress">
                        {/* Background Track */}
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20 backdrop-blur-sm group-hover/progress:h-2 transition-all duration-200"></div>
                        
                        {/* Progress Fill */}
                        <div 
                            className="absolute bottom-0 left-0 h-1.5 bg-brand shadow-[0_0_15px_rgba(0,243,255,0.8)] group-hover/progress:h-2 transition-all duration-200" 
                            style={{ width: `${progress}%` }}
                        >
                            {/* Scrubber Head */}
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover/progress:opacity-100 transition-opacity"></div>
                        </div>
                        
                        {/* Interactive Range Input - Large hit area */}
                        <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            step="0.1"
                            value={progress}
                            onChange={handleSeek}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-40 m-0 p-0 appearance-none"
                            style={{ background: 'transparent' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export const VideoCinemaVistaSlideshow = ({ onClose, videosData }: { onClose: () => void, videosData: VideoItem[] }) => {
    const [rows, setRows] = useState<TileData[][]>([]);
    const [pools, setPools] = useState({ portrait: [] as VideoItem[], landscape: [] as VideoItem[] });
    
    // Audio State: Only one tile can have audio active at a time
    const [activeAudioId, setActiveAudioId] = useState<string | null>(null);

    // Decks for Shuffle Logic
    const portraitDeck = useRef<VideoItem[]>([]);
    const landscapeDeck = useRef<VideoItem[]>([]);
    
    // Counter to track 3x2 tile pattern: Landscape -> Landscape -> Portrait
    const wide3Counter = useRef(0);

    const [ready, setReady] = useState(false);
    const [focalVideo, setFocalVideo] = useState<string | null>(null);
    const [layoutOpacity, setLayoutOpacity] = useState(1);
    
    // Track the last used layout to avoid immediate repetition
    const lastLayoutRef = useRef<number>(-1);

    useEffect(() => {
        let mounted = true; 
        const videos = [...videosData]; 
        if (!videos.length) return;
        
        // Accurate detection of aspect ratio for strict logic
        const p: VideoItem[] = [];
        const l: VideoItem[] = [];
        let loadedCount = 0;

        const finalizePools = () => {
             if (!mounted) return;
             // Ensure we have enough loaded or checked videos
             if (loadedCount >= Math.min(10, videos.length)) {
                 // If detection worked, use p/l. If completely empty (e.g. error), fallback to index split.
                 const finalP = p.length > 0 ? p : videos.filter((_, i) => i % 2 === 0);
                 const finalL = l.length > 0 ? l : videos.filter((_, i) => i % 2 !== 0);
                 
                 setPools({ portrait: finalP, landscape: finalL });
                 portraitDeck.current = shuffle([...finalP]);
                 landscapeDeck.current = shuffle([...finalL]);
                 
                 setReady(true);
                 setFocalVideo(videos[0].video);
             }
        };

        videos.forEach(video => {
            const vid = document.createElement('video'); 
            vid.src = video.video;
            vid.onloadedmetadata = () => { 
                if (vid.videoWidth >= vid.videoHeight) l.push(video); else p.push(video);
                loadedCount++; 
                finalizePools();
            };
            vid.onerror = () => { 
                // Fallback: simple random assignment on error
                if (Math.random() > 0.5) p.push(video); else l.push(video);
                loadedCount++; 
                finalizePools(); 
            };
        });
        
        return () => { mounted = false; };
    }, [videosData]);

    const getNextVideo = useCallback((t: 'portrait' | 'landscape', currentRows: TileData[][] = [], temporaryExclusions: Set<string> = new Set()) => {
        const sourcePool = t === 'portrait' ? pools.portrait : pools.landscape;
        const deckRef = t === 'portrait' ? portraitDeck : landscapeDeck;
        
        if (!sourcePool || sourcePool.length === 0) {
             return videosData[Math.floor(Math.random() * videosData.length)];
        }

        const onScreen = getOnScreenUrls(currentRows, 'video');
        
        const candidateIndex = deckRef.current.findIndex(item => 
            !onScreen.has(item.video) && !temporaryExclusions.has(item.video)
        );

        if (candidateIndex !== -1) {
            const [selection] = deckRef.current.splice(candidateIndex, 1);
            return selection;
        }

        const isBlocked = (item: VideoItem) => onScreen.has(item.video) || temporaryExclusions.has(item.video);
        const available = sourcePool.filter(item => !isBlocked(item));
        const busy = sourcePool.filter(item => isBlocked(item));
        
        deckRef.current = [...shuffle(available), ...busy];
        const [selection] = deckRef.current.splice(0, 1);
        
        return selection || sourcePool[Math.floor(Math.random() * sourcePool.length)];
    }, [pools, videosData]);

    const createTile = useCallback((type: 'single' | 'double' | 'wide' | 'ghost' | 'wing' | 'wide-3' = 'single', currentRows: TileData[][] = []): TileData => {
        const localExclusions = new Set<string>();
        
        // Determine Logic based on Requirements
        let poolType: 'portrait' | 'landscape' = 'portrait'; // Default fallback

        if (type === 'wide-3') {
            // Priority: List Landscape.
            // Pattern: 2 Landscape, then 1 Portrait.
            const count = wide3Counter.current;
            if (count % 3 === 2) {
                poolType = 'portrait';
            } else {
                poolType = 'landscape';
            }
            // Increment for next creation
            wide3Counter.current = count + 1;
        } 
        else if (type === 'wing') {
            // 2x2: Strict Portrait
            poolType = 'portrait';
        }
        else if (type === 'double') {
            // 1x2: Strict Portrait
            poolType = 'portrait';
        }
        else {
            // Single (1x1): Strict Portrait (matches the vertical columns aesthetic)
            poolType = 'portrait';
        }

        // Fetch Top Video
        const top = type !== 'ghost' ? getNextVideo(poolType, currentRows, localExclusions) : null;
        if (top) localExclusions.add(top.video);
        
        // Fetch Bottom Video (Double is 1x2, so bottom is also Portrait)
        const bottom = type === 'double' ? getNextVideo('portrait', currentRows, localExclusions) : null;
        
        const id = Math.random().toString(36).substr(2, 9);
        return { id, type, top, bottom, status: 'idle' };
    }, [getNextVideo]);

    const generateRandomLayout = useCallback(() => {
        // Pick a layout different from the last one to ensure rotation
        let layoutType = Math.floor(Math.random() * 3); // 0, 1, 2
        if (layoutType === lastLayoutRef.current) {
            layoutType = (layoutType + 1) % 3;
        }
        lastLayoutRef.current = layoutType;
        
        const grid: TileData[][] = [[], []];
        
        if (layoutType === 0) {
            // Layout A: Left 3x2 (Hybrid), Right 2x2 (Portrait)
            grid[0] = [
                createTile('wide-3'), createTile('ghost'), createTile('ghost'),
                createTile('wing'), createTile('ghost')
            ];
            grid[1] = [
                createTile('ghost'), createTile('ghost'), createTile('ghost'),
                createTile('ghost'), createTile('ghost')
            ];
        } else if (layoutType === 1) {
            // Layout B: Left 2x2 (Portrait), Right 3x2 (Hybrid)
            grid[0] = [
                createTile('wing'), createTile('ghost'),
                createTile('wide-3'), createTile('ghost'), createTile('ghost')
            ];
            grid[1] = [
                createTile('ghost'), createTile('ghost'),
                createTile('ghost'), createTile('ghost'), createTile('ghost')
            ];
        } else {
            // Layout C: Center 3x2 (Hybrid), Left & Right 1x2 (Portrait Columns)
            grid[0] = [
                createTile('double'), // Span 1 col, 2 rows (Portrait)
                createTile('wide-3'), createTile('ghost'), createTile('ghost'),
                createTile('double')  // Span 1 col, 2 rows (Portrait)
            ];
            grid[1] = [
                createTile('ghost'),
                createTile('ghost'), createTile('ghost'), createTile('ghost'),
                createTile('ghost')
            ];
        }
        
        return grid;
    }, [createTile]);

    // NEW: Function to handle full layout rotation
    const rotateLayout = useCallback(() => {
        setLayoutOpacity(0); // Fade out
        setTimeout(() => {
            setRows(generateRandomLayout()); // Swap structure
            setActiveAudioId(null); // Reset audio state
            setLayoutOpacity(1); // Fade in
        }, 600);
    }, [generateRandomLayout]);

    const triggerSwitch = useCallback((r: number, c: number, tileId: string) => {
        // 1. Check if the video ending is the one holding the Audio Focus
        // Double tiles might have IDs like "123-top" or "123-bottom", while tileId passed here is "123".
        const isAudioActiveForThisTile = activeAudioId && (activeAudioId === tileId || activeAudioId.startsWith(`${tileId}-`));

        // 2. If it is the active audio tile, we trigger a full scene rotation instead of a single tile flip
        if (isAudioActiveForThisTile) {
            rotateLayout();
            return;
        }

        // 3. Otherwise, standard single tile replacement logic (Background tiles)
        setRows(prevRows => {
            if (!prevRows.length) return prevRows; 
            const nextRows = prevRows.map(row => [...row]); 
            let targetIdx = c;
            
            if (!nextRows[r] || !nextRows[r][targetIdx]) return prevRows;
            // Validate that we are switching the correct tile (prevents race conditions)
            if (nextRows[r][targetIdx].id !== tileId) return prevRows;

            if (nextRows[r][targetIdx].status !== 'idle' && nextRows[r][targetIdx].status !== 'entering') return prevRows;

            const videoContent = nextRows[r][targetIdx].top as VideoItem; 
            if (videoContent) setFocalVideo(videoContent.video);
            
            // Turn off audio if this tile was playing (sanity check, though logic above catches the main one)
            // setActiveAudioId(currentId => currentId === tileId ? null : currentId);

            const exitStatus = 'exit-fade-out';
            nextRows[r][targetIdx] = { ...nextRows[r][targetIdx], status: exitStatus };
            return nextRows;
        });
        
        setTimeout(() => {
            setRows(prevRows => {
                if (!prevRows.length) return prevRows;
                const nextRows = prevRows.map(row => [...row]);
                const tileToReplace = nextRows[r][c];

                if (!EXIT_EFFECTS.includes(tileToReplace.status)) return prevRows;

                const typeNeeded = tileToReplace.type; 
                
                // We must use the current full grid state to check for duplicates
                const tempGrid = nextRows.map((row, rIdx) => 
                     row.map((t, cIdx) => (rIdx === r && cIdx === c) ? { ...t, top: null } : t)
                );

                const newTile = createTile(typeNeeded, tempGrid);
                newTile.status = 'entering';
                
                nextRows[r][c] = newTile;
                return nextRows;
            });
        }, 300); // Faster switch time
    }, [createTile, activeAudioId, rotateLayout]);

    // Initial Layout Load
    useEffect(() => { 
        if (ready && rows.length === 0) { 
             setRows(generateRandomLayout());
        } 
    }, [ready, generateRandomLayout, rows.length]);

    // Dynamic Layout Rotation Loop
    useEffect(() => {
        if (!ready) return;
        
        // If a user has enabled audio on a specific tile, we PAUSE the automatic rotation
        // We wait for that specific video to end (handled in triggerSwitch)
        if (activeAudioId) return;

        // Otherwise, rotate every 12 seconds
        const timer = setInterval(() => {
            rotateLayout();
        }, 12000); 
        return () => clearInterval(timer);
    }, [ready, rotateLayout, activeAudioId]); // Added activeAudioId dependency

    const handleToggleMute = (e: React.MouseEvent, tileId: string) => {
        e.stopPropagation();
        setActiveAudioId(current => current === tileId ? null : tileId);
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black animate-fadeIn flex flex-col font-sans overflow-hidden">
             {focalVideo && ( <div className="absolute inset-0 z-0 transition-all duration-1000 scale-110"><video crossOrigin="anonymous" src={focalVideo} autoPlay muted loop playsInline className="w-full h-full object-cover" style={{ filter: 'blur(60px) brightness(0.3)' }} /></div> )}
             <style>{` 
               .tile-transition { transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1); } /* Faster transition (was 0.5s) */
               .exit-fade-out { opacity: 0; filter: blur(5px); }
               .entering { animation: tileEnter 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; } /* Faster enter animation (was 0.5s) */
               @keyframes tileEnter { 
                   0% { opacity: 0; transform: scale(0.8) translateY(30px); filter: blur(15px); } 
                   100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); } 
               } 
             `}</style>
             
            <div className="absolute top-4 right-4 z-[70] flex gap-4 pointer-events-auto">
                <button onClick={onClose} className="text-white bg-white/10 hover:bg-brand p-2 rounded-full transition-colors backdrop-blur-lg border border-white/20 shadow-xl"><X size={24} /></button>
            </div>

            {!ready ? ( <div className="flex-1 flex flex-col items-center justify-center z-10"><Loader2 className="animate-spin text-brand mb-4" size={48} /><div className="text-white text-xl font-light tracking-widest animate-pulse">PREPARING STEADY VIEW...</div></div> ) : (
                <div 
                    className="flex-1 w-full h-full grid grid-cols-5 grid-rows-2 gap-2 bg-transparent p-4 z-10 transition-opacity duration-500 ease-in-out"
                    style={{ opacity: layoutOpacity }}
                >
                    {rows.flatMap((row, rIdx) => row.map((tile, cIdx) => {
                        if (tile.type === 'ghost') return null;
                        
                        let spanStyle: React.CSSProperties = {};
                        if (tile.type === 'wide-3') spanStyle = { gridColumn: 'span 3', gridRow: 'span 2' };
                        else if (tile.type === 'wing') spanStyle = { gridColumn: 'span 2', gridRow: 'span 2' };
                        else if (tile.type === 'double') spanStyle = { gridColumn: 'span 1', gridRow: 'span 2' };

                        return (
                            <div key={tile.id} 
                                 className={`relative w-full h-full rounded-xl overflow-hidden shadow-2xl backdrop-blur-md bg-white/5 border border-white/10 tile-transition group/tile ${tile.status}`}
                                 style={{ 
                                     gridRowStart: rIdx + 1,
                                     gridColumnStart: cIdx + 1,
                                     ...spanStyle
                                 }}
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover/tile:opacity-100 transition-opacity duration-500 z-20 pointer-events-none" />
                                {tile.type === 'double' ? (
                                    <div className="flex flex-col w-full h-full gap-2">
                                        <div className="flex-1 relative overflow-hidden">
                                            <SteadyVideoTile 
                                                video={(tile.top as VideoItem)?.video || ''} 
                                                isActiveAudio={activeAudioId === `${tile.id}-top`}
                                                onToggleMute={(e) => handleToggleMute(e, `${tile.id}-top`)}
                                                onEnded={() => triggerSwitch(rIdx, cIdx, tile.id)}
                                            />
                                        </div>
                                        <div className="flex-1 relative overflow-hidden">
                                            {tile.bottom && (
                                                <SteadyVideoTile 
                                                    video={(tile.bottom as VideoItem)?.video || ''} 
                                                    isActiveAudio={activeAudioId === `${tile.id}-bottom`}
                                                    onToggleMute={(e) => handleToggleMute(e, `${tile.id}-bottom`)}
                                                    onEnded={() => triggerSwitch(rIdx, cIdx, tile.id)}
                                                />
                                            )}
                                        </div>
                                    </div>
                                ) : ( 
                                    <SteadyVideoTile 
                                        video={(tile.top as VideoItem)?.video || ''} 
                                        enableZoom={true} // Enable zoom for single/wing/wide-3 tiles
                                        isActiveAudio={activeAudioId === tile.id}
                                        onToggleMute={(e) => handleToggleMute(e, tile.id)}
                                        onEnded={() => triggerSwitch(rIdx, cIdx, tile.id)}
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
