
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Volume2, VolumeX, Heart, Maximize2, Minimize2, Loader2 } from 'lucide-react';
import { VideoItem } from '../../types';
import { shuffle } from '../../utils';

interface QuadTileProps {
    tileId: string;
    initialVideo: VideoItem;
    getNextVideo: (excludeIds: string[]) => VideoItem;
    activeAudioId: string | null;
    onRequestAudio: (tileId: string) => void;
    onToggleExpand: (tileId: string) => void;
    isExpanded: boolean;
    onToggleFavorite: (id: string) => void;
    favorites: Set<string>;
    getAllOnScreenIds: () => string[];
}

const QuadTile: React.FC<QuadTileProps> = ({ 
    tileId, 
    initialVideo, 
    getNextVideo, 
    activeAudioId, 
    onRequestAudio, 
    onToggleExpand, 
    isExpanded,
    onToggleFavorite,
    favorites,
    getAllOnScreenIds
}) => {
    const [currentVideo, setCurrentVideo] = useState<VideoItem>(initialVideo);
    const [history, setHistory] = useState<VideoItem[]>([]);
    const [isHovered, setIsHovered] = useState(false);
    const [volume, setVolume] = useState(0.8);
    const [progress, setProgress] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Audio & Volume Logic
    const isMuted = activeAudioId !== tileId;
    
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
            if (!isMuted) {
                videoRef.current.volume = volume;
            }
        }
    }, [isMuted, volume]);

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setVolume(val);
        if (!isMuted && videoRef.current) {
            videoRef.current.volume = val;
        }
    };

    const handleToggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isMuted) {
            onRequestAudio(tileId);
        } else {
            onRequestAudio(""); // Mute self
        }
    };

    // Video Lifecycle Logic
    const goToNextVideo = () => {
        setHistory(prev => [...prev, currentVideo]);
        setIsTransitioning(true);

        setTimeout(() => {
            const excludeIds = getAllOnScreenIds();
            const next = getNextVideo(excludeIds);
            setCurrentVideo(next);
            setIsTransitioning(false); 
        }, 500);
    };

    // Interaction Logic (Click vs Double Click)
    const handleClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;

        if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
            clickTimeoutRef.current = null;
            onToggleExpand(tileId);
        } else {
            clickTimeoutRef.current = setTimeout(() => {
                clickTimeoutRef.current = null;
                // Changed from handleGoBack to goToNextVideo for single click action
                goToNextVideo();
            }, 250);
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const dur = videoRef.current.duration;
            if (dur > 0) {
                setProgress((videoRef.current.currentTime / dur) * 100);
            }
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setProgress(val);
        if (videoRef.current && videoRef.current.duration) {
            videoRef.current.currentTime = (val / 100) * videoRef.current.duration;
        }
    };

    const isFav = currentVideo.id ? favorites.has(currentVideo.id) : false;

    // --- STYLING LOGIC ---
    const containerClasses = isExpanded 
        ? 'fixed inset-0 z-[200] w-screen h-screen border-0 rounded-none' 
        : 'relative w-full h-full border-[0.1px] border-white/10 rounded-2xl z-10 overflow-hidden';

    return (
        <div 
            className={`bg-black group transition-all duration-300 ease-in-out shadow-2xl ${containerClasses}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={handleClick}
        >
            <video 
                ref={videoRef}
                src={currentVideo.video}
                className={`w-full h-full object-cover transition-opacity duration-500 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
                autoPlay
                playsInline
                muted={isMuted}
                onEnded={goToNextVideo}
                onTimeUpdate={handleTimeUpdate}
                crossOrigin="anonymous"
            />

            {/* Top Left Controls */}
            <div className={`absolute top-4 left-4 flex flex-col gap-2 transition-opacity duration-300 ${isHovered || !isMuted ? 'opacity-100' : 'opacity-0'}`}>
                
                {/* Audio Control Row */}
                <div className="relative group/audio flex items-center">
                    <button 
                        onClick={handleToggleMute}
                        className={`p-2 rounded-full backdrop-blur-md border border-white/20 transition-all ${!isMuted ? 'bg-white text-black' : 'bg-black/40 text-white hover:bg-white/20'}`}
                        title={isMuted ? "Unmute" : "Mute"}
                    >
                        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>

                    {/* Horizontal Volume Slider (Appears to the right) */}
                    {!isMuted && (
                        <div className="ml-2 opacity-0 group-hover/audio:opacity-100 transition-opacity duration-300">
                            <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center h-10 w-28">
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.05" 
                                    value={volume} 
                                    onChange={handleVolumeChange}
                                    className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Favorite */}
                <div className="flex justify-start">
                    <button 
                        onClick={(e) => { e.stopPropagation(); if(currentVideo.id) onToggleFavorite(currentVideo.id); }}
                        className={`p-2 rounded-full backdrop-blur-md border border-white/20 transition-all ${isFav ? 'bg-rose-500 text-white' : 'bg-black/40 text-white hover:bg-white/20'}`}
                    >
                        <Heart size={20} className={isFav ? "fill-current" : ""} />
                    </button>
                </div>

                {/* Expand/Collapse */}
                <div className="flex justify-start">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onToggleExpand(tileId); }}
                        className="p-2 rounded-full backdrop-blur-md bg-black/40 text-white border border-white/20 hover:bg-white/20 transition-all"
                    >
                        {isExpanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                    </button>
                </div>
            </div>

            {/* Bottom Progress Bar (Hover) */}
            <div className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    step="0.1" 
                    value={progress} 
                    onChange={handleSeek} 
                    onClick={(e) => e.stopPropagation()}
                    className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                />
            </div>
        </div>
    );
};

export const QuadHorizonSlideshow = ({ 
    videosData, 
    onClose,
    favorites,
    onToggleFavorite
}: { 
    videosData: VideoItem[], 
    onClose: () => void,
    favorites: Set<string>,
    onToggleFavorite: (id: string) => void
}) => {
    const [tiles, setTiles] = useState<{ id: string, initialVideo: VideoItem }[]>([]);
    const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
    const [expandedTileId, setExpandedTileId] = useState<string | null>(null);
    const [focalVideo, setFocalVideo] = useState<string | null>(null);

    // Initialize 4 tiles
    useEffect(() => {
        if (videosData.length === 0) return;
        const initial = shuffle([...videosData]).slice(0, 4);
        setTiles(initial.map((v, i) => ({ id: `tile-${i}`, initialVideo: v })));
        if (initial.length > 0) setFocalVideo(initial[0].video);
    }, [videosData]);

    const activeVideoIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (tiles.length > 0) {
            activeVideoIdsRef.current = new Set(tiles.map(t => t.initialVideo.id || ''));
        }
    }, [tiles]);

    const getNextVideo = useCallback((excludeIds: string[] = []): VideoItem => {
        const currentActive = activeVideoIdsRef.current;
        const candidates = videosData.filter(v => v.id && !currentActive.has(v.id));
        
        let selection: VideoItem;
        if (candidates.length === 0) {
            selection = videosData[Math.floor(Math.random() * videosData.length)];
        } else {
            selection = candidates[Math.floor(Math.random() * candidates.length)];
        }

        if (selection.id) activeVideoIdsRef.current.add(selection.id);
        
        // Update background focal video when a new video is picked
        setFocalVideo(selection.video);
        
        return selection;
    }, [videosData]);

    const handleRequestAudio = (tileId: string) => {
        setActiveAudioId(tileId);
    };

    const handleToggleExpand = (tileId: string) => {
        if (expandedTileId === tileId) {
            setExpandedTileId(null);
        } else {
            setExpandedTileId(tileId);
        }
    };

    if (tiles.length === 0) return (
        <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
            <Loader2 className="animate-spin mr-2" /> Loading Quad Horizon...
        </div>
    );

    return (
        <div className="fixed inset-0 z-[100] bg-black animate-fadeIn flex flex-col">
            {/* Dynamic Blurred Background */}
            {focalVideo && ( 
                <div className="absolute inset-0 z-0 transition-all duration-1000 scale-110">
                    <video 
                        crossOrigin="anonymous" 
                        src={focalVideo} 
                        autoPlay 
                        muted 
                        loop 
                        playsInline 
                        className="w-full h-full object-cover" 
                        style={{ filter: 'blur(60px) brightness(0.3)' }} 
                    />
                </div> 
            )}

            <button 
                onClick={onClose} 
                className="absolute top-6 right-6 z-[210] p-2 bg-black/50 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors border border-white/10"
            >
                <X size={24} />
            </button>

            {/* 
               CRITICAL FIX: 
               Added `min-h-0` to the grid container. 
               This forces the grid to stay within the flex parent's height (100vh),
               preventing the rows from overflowing and creating a scrollable 'two column' list.
            */}
            <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-1 p-1 z-10">
                {tiles.map((tile, idx) => (
                    <QuadTile 
                        key={tile.id}
                        tileId={tile.id}
                        initialVideo={tile.initialVideo}
                        activeAudioId={activeAudioId}
                        onRequestAudio={handleRequestAudio}
                        isExpanded={expandedTileId === tile.id}
                        onToggleExpand={handleToggleExpand}
                        getNextVideo={getNextVideo}
                        onToggleFavorite={onToggleFavorite}
                        favorites={favorites}
                        getAllOnScreenIds={() => []} 
                    />
                ))}
            </div>
        </div>
    );
};
