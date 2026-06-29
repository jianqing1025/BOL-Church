
import React from 'react';

export const StaticTile = ({
    src,
    alt,
    className = "",
    imageClassName = "",
    imageStyle,
}: {
    src: string,
    alt: string,
    className?: string,
    imageClassName?: string,
    imageStyle?: React.CSSProperties,
}) => (
    <div className={`relative w-full h-full overflow-hidden bg-black/40 backdrop-blur-md rounded-lg border border-white/10 ${className}`}>
        <img crossOrigin="anonymous" src={src} alt={alt} className={`w-full h-full object-cover transition-all duration-700 ${imageClassName}`} style={imageStyle} />
        <div className="absolute inset-0 bg-black/10"></div>
    </div>
);

export const VideoStaticTile = ({ src, className = "" }: { src: string, className?: string }) => (
    <div className={`relative w-full h-full overflow-hidden bg-black/40 backdrop-blur-md rounded-lg border border-white/10 ${className}`}><video crossOrigin="anonymous" src={src} autoPlay muted loop playsInline className="w-full h-full object-cover transition-all duration-700" /><div className="absolute inset-0 bg-black/10"></div></div>
);
