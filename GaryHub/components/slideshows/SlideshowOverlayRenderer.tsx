import React from 'react';
import { GalleryItem, SlideshowMode, VideoItem } from '../../types';
import { FlowDriftSlideshow } from './FlowDriftSlideshow';
import { PhotoTileSlideshow, VideoTileSlideshow } from './TileSlideshow';
import { ShiftingTilesSlideshow, VideoShiftingTilesSlideshow } from './ShiftingTilesSlideshow';
import { SlidingTilesSlideshow } from './SlidingTilesSlideshow';
import { VideoSlidingTilesSlideshow } from './VideoSlidingTilesSlideshow';
import { PhotoCinemaWingsSlideshow, VideoCinemaWingsSlideshow } from './CinemaWingsSlideshow';
import { VideoCinemaVistaSlideshow } from './CinemaVistaSlideshow';
import { QuadHorizonSlideshow } from './QuadHorizonSlideshow';

export type SlideshowSelection = {
    type: 'photo' | 'video';
    mode: SlideshowMode | 'cascade';
    data: (GalleryItem | VideoItem)[];
};

export const SlideshowOverlayRenderer = ({
    slideshow,
    onClose,
    videoFavorites,
    onToggleVideoFavorite,
}: {
    slideshow: SlideshowSelection | null;
    onClose: () => void;
    videoFavorites?: Set<string>;
    onToggleVideoFavorite?: (id: string) => void;
}) => {
    if (!slideshow) return null;

    return (
        <>
            {slideshow.type === 'photo' && slideshow.mode === 'cascade' && (
                <PhotoTileSlideshow galleryData={slideshow.data as GalleryItem[]} onClose={onClose} />
            )}
            {slideshow.type === 'photo' && (slideshow.mode === 'shifting' || slideshow.mode === 'tiles-shifting') && (
                <ShiftingTilesSlideshow galleryData={slideshow.data as GalleryItem[]} onClose={onClose} />
            )}
            {slideshow.type === 'photo' && slideshow.mode === 'sliding-tiles' && (
                <SlidingTilesSlideshow galleryData={slideshow.data as GalleryItem[]} onClose={onClose} />
            )}
            {slideshow.type === 'photo' && slideshow.mode === 'wings' && (
                <PhotoCinemaWingsSlideshow galleryData={slideshow.data as GalleryItem[]} onClose={onClose} />
            )}
            {slideshow.type === 'photo' && slideshow.mode === 'flow-drift' && (
                <FlowDriftSlideshow items={slideshow.data as GalleryItem[]} type="photo" onClose={onClose} />
            )}

            {slideshow.type === 'video' && slideshow.mode === 'cascade' && (
                <VideoTileSlideshow videosData={slideshow.data as VideoItem[]} onClose={onClose} />
            )}
            {slideshow.type === 'video' && (slideshow.mode === 'standard' || slideshow.mode === 'tiles-shifting') && (
                <VideoShiftingTilesSlideshow videosData={slideshow.data as VideoItem[]} onClose={onClose} />
            )}
            {slideshow.type === 'video' && slideshow.mode === 'sliding-tiles' && (
                <VideoSlidingTilesSlideshow videosData={slideshow.data as VideoItem[]} onClose={onClose} />
            )}
            {slideshow.type === 'video' && slideshow.mode === 'wings' && (
                <VideoCinemaWingsSlideshow videosData={slideshow.data as VideoItem[]} onClose={onClose} />
            )}
            {slideshow.type === 'video' && slideshow.mode === 'vista' && (
                <VideoCinemaVistaSlideshow videosData={slideshow.data as VideoItem[]} onClose={onClose} />
            )}
            {slideshow.type === 'video' && slideshow.mode === 'flow-drift' && (
                <FlowDriftSlideshow items={slideshow.data as VideoItem[]} type="video" onClose={onClose} />
            )}
            {slideshow.type === 'video' && slideshow.mode === 'quad-horizon' && videoFavorites && onToggleVideoFavorite && (
                <QuadHorizonSlideshow
                    videosData={slideshow.data as VideoItem[]}
                    onClose={onClose}
                    favorites={videoFavorites}
                    onToggleFavorite={onToggleVideoFavorite}
                />
            )}
        </>
    );
};

