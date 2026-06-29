
import React, { useState, useEffect } from 'react';
import { X, Volume2, VolumeX } from 'lucide-react';
import { GalleryItem, VideoItem } from '../../types';
import { getOptimizedUrl, shuffle } from '../../utils';

const getVideoThumbnailUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('cloudinary.com') && url.includes('/video/upload/')) {
        // Transform Cloudinary Video URL to an Image Thumbnail URL
        // w_400,h_600 matches the aspect ratio roughly or ensures good quality for tiles
        let newUrl = url.replace('/video/upload/', '/video/upload/so_0,w_400,h_600,c_fill,q_auto,f_jpg/');
        // Replace extension with .jpg
        return newUrl.replace(/\.[^/.]+$/, ".jpg");
    }
    return url;
};

export const PhotoTileSlideshow = ({ galleryData, onClose }: { galleryData: GalleryItem[], onClose: () => void }) => {
    const cols = 5;
    const [columns, setColumns] = useState<GalleryItem[][]>([]);
    
    useEffect(() => {
        // Limit total items to prevent DOM explosion on large galleries
        const safeData = galleryData.slice(0, 100); 
        const shuffled = shuffle([...safeData, ...safeData]); 
        const newCols: GalleryItem[][] = Array.from({ length: cols }, () => []);
        shuffled.forEach((item, i) => {
            newCols[i % cols].push(item);
        });
        setColumns(newCols);
    }, [galleryData]);

    return (
        <div className="fixed inset-0 z-[100] bg-black flex gap-2 p-2 overflow-hidden animate-fadeIn">
            <button onClick={onClose} className="absolute top-6 right-6 z-[110] text-white bg-black/20 hover:bg-brand p-2 rounded-full backdrop-blur-md transition-colors"><X size={24} /></button>
            {columns.map((col, i) => (
                <div key={i} className="flex-1 flex flex-col gap-2 animate-scroll-vertical" style={{ animationDuration: `${30 + i * 5}s`, animationDirection: i % 2 === 0 ? 'normal' : 'reverse' }}>
                    {[...col, ...col, ...col].map((img, idx) => (
                        <div key={`${i}-${idx}`} className="w-full aspect-[3/4] rounded-lg overflow-hidden relative shrink-0 bg-gray-900">
                             <img crossOrigin="anonymous" src={getOptimizedUrl(img.src, 'grid')} className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity" alt="" />
                        </div>
                    ))}
                </div>
            ))}
            <style>{`
                @keyframes scroll-vertical {
                    0% { transform: translateY(0); }
                    100% { transform: translateY(-50%); }
                }
                .animate-scroll-vertical {
                    animation: scroll-vertical linear infinite;
                }
            `}</style>
        </div>
    );
};

export const VideoTileSlideshow = ({ videosData, onClose }: { videosData: VideoItem[], onClose: () => void }) => {
    const cols = 5;
    const [columns, setColumns] = useState<VideoItem[][]>([]);
    // Muted state kept for compatibility, though autoplay is removed for stability
    const [isMuted, setIsMuted] = useState(true);

    useEffect(() => {
        // Limit processing to prevent memory crash
        const safeData = videosData.slice(0, 60); 
        const shuffled = shuffle([...safeData, ...safeData]); 
        const newCols: VideoItem[][] = Array.from({ length: cols }, () => []);
        shuffled.forEach((item, i) => {
            newCols[i % cols].push(item);
        });
        setColumns(newCols);
    }, [videosData]);

    return (
        <div className="fixed inset-0 z-[100] bg-black flex gap-2 p-2 overflow-hidden animate-fadeIn">
            <div className="absolute top-6 right-6 z-[110] flex gap-4">
                 <button onClick={() => setIsMuted(!isMuted)} className="text-white bg-black/20 hover:bg-brand p-2 rounded-full backdrop-blur-md transition-colors border border-white/10 hidden">
                    {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                <button onClick={onClose} className="text-white bg-black/20 hover:bg-brand p-2 rounded-full backdrop-blur-md transition-colors border border-white/10">
                    <X size={24} />
                </button>
            </div>
            
            {columns.map((col, i) => (
                <div key={i} className="flex-1 flex flex-col gap-2 animate-scroll-vertical" style={{ animationDuration: `${30 + i * 5}s`, animationDirection: i % 2 === 0 ? 'normal' : 'reverse' }}>
                    {/* Render triple the list for seamless loop */}
                    {[...col, ...col, ...col].map((video, idx) => {
                        const thumbUrl = getVideoThumbnailUrl(video.video);
                        const isImage = thumbUrl.includes('.jpg');

                        return (
                            <div key={`${i}-${idx}`} className="w-full aspect-[9/16] rounded-lg overflow-hidden relative shrink-0 border border-white/10 bg-gray-800">
                                 <div className="w-full h-full relative group">
                                    {isImage ? (
                                        <img 
                                            src={thumbUrl} 
                                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                            alt={video.title}
                                            crossOrigin="anonymous"
                                        />
                                    ) : (
                                        <video 
                                            src={video.video} 
                                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" 
                                            // CRITICAL FIX: Removed autoPlay to prevent browser crash with many videos
                                            // autoPlay 
                                            muted={true} 
                                            playsInline 
                                            crossOrigin="anonymous"
                                            // Attempt to show first frame
                                            onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0; }}
                                        />
                                    )}
                                    {/* Optional: Play icon overlay to indicate it's a video context, even if showing static */}
                                    {!isImage && <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-50 transition-opacity"><Volume2 size={24} className="text-white"/></div>}
                                 </div>
                            </div>
                        );
                    })}
                </div>
            ))}
            <style>{`
                @keyframes scroll-vertical {
                    0% { transform: translateY(0); }
                    100% { transform: translateY(-33.33%); }
                }
                .animate-scroll-vertical {
                    animation: scroll-vertical linear infinite;
                }
                /* Hide scrollbars just in case */
                ::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
};

export default PhotoTileSlideshow;
