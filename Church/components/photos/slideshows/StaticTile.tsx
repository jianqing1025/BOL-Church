import React from 'react';

/** Faithful port of OurStoryHub StaticTile (crossOrigin dropped — R2 is same-origin). */
export const StaticTile = ({
  src,
  alt = '',
  className = '',
  imageClassName = '',
  imageStyle,
}: {
  src: string;
  alt?: string;
  className?: string;
  imageClassName?: string;
  imageStyle?: React.CSSProperties;
}) => (
  <div className={`relative h-full w-full overflow-hidden rounded-lg border border-white/10 bg-black/40 backdrop-blur-md ${className}`}>
    <img src={src} alt={alt} className={`h-full w-full object-cover transition-all duration-700 ${imageClassName}`} style={imageStyle} />
    <div className="absolute inset-0 bg-black/10" />
  </div>
);
