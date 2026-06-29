import React, { useState, useRef } from 'react';
import { Play } from 'lucide-react';
import { VideoItem } from '../../types';

interface VideoCardProps {
    video: VideoItem;
    onClick: () => void;
    forceAspect?: string;
}

const VideoCard: React.FC<VideoCardProps> = ({ video, onClick, forceAspect }) => {
    const [isPortrait, setIsPortrait] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const handleMetadata = () => { if (videoRef.current) { const { videoWidth, videoHeight } = videoRef.current; setIsPortrait(videoHeight > videoWidth); } };
    const aspectClass = forceAspect ? forceAspect : (isPortrait ? 'aspect-[9/16]' : 'aspect-video');
    return (
        <div className="bg-white border border-[#eee] group cursor-pointer hover:shadow-2xl transition-all rounded overflow-hidden" onClick={onClick}>
            <div className={`relative bg-black transition-all duration-500 ${aspectClass}`}>
                <video crossOrigin="anonymous" ref={videoRef} src={video.video} muted loop playsInline onLoadedMetadata={handleMetadata} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                <div className="absolute inset-0 flex items-center justify-center"><div className="bg-brand/80 p-5 rounded-full text-white shadow-lg transform scale-75 group-hover:scale-100 transition-transform"><Play fill="white" size={32} className="ml-1" /></div></div>
                <div className="absolute bottom-4 left-4"><span className="text-[10px] bg-brand/90 text-white px-2 py-1 rounded uppercase font-bold shadow-sm tracking-widest">{video.category}</span></div>
            </div>
            <div className="p-8"><h3 className="text-2xl font-medium text-brand mb-4 leading-tight">{video.title}</h3><p className="text-[#666] text-sm leading-6 mb-4 line-clamp-3">"{video.desc}"</p></div>
        </div>
    );
};

export default VideoCard;