import React, { useCallback, useState } from 'react';
import { CheckCircle, Heart, Loader2, Maximize2, Minus, Trash2 } from 'lucide-react';
import type { ChurchPhoto } from '../../data';
import { ExifOverlay } from './ExifOverlay';
import type { GridDisplayMode, ViewMode } from './types';

interface PhotoCardProps {
  photo: ChurchPhoto;
  idx: number;
  viewMode: ViewMode;
  gridDisplayMode?: GridDisplayMode;
  isSelectMode: boolean;
  isSelected: boolean;
  isDeleteMode: boolean;
  isFav: boolean;
  canDelete: boolean;
  isDeleting: boolean;
  photoAlt: string;
  favoriteLabel: string;
  deleteLabel: string;
  uploadedByLabel: string;
  onToggleSelection: (id: string) => void;
  onItemClick: (idx: number, id: string) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (photo: ChurchPhoto) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
}

/** Square grid uses the small thumbnail; ratio/masonry use the full image. */
const pickSrc = (photo: ChurchPhoto, square: boolean, ratio: boolean): string => {
  if (square && !ratio && photo.thumbSrc) return photo.thumbSrc;
  return photo.src;
};

export const PhotoCard: React.FC<PhotoCardProps> = React.memo(
  ({
    photo, idx, viewMode, gridDisplayMode = 'fill', isSelectMode, isSelected, isDeleteMode,
    isFav, canDelete, isDeleting, photoAlt, favoriteLabel, deleteLabel, uploadedByLabel,
    onToggleSelection, onItemClick, onToggleFavorite, onDelete, onContextMenu,
  }) => {
    const [isHovered, setIsHovered] = useState(false);
    const sq = viewMode === 'square';
    const showRatio = sq && gridDisplayMode === 'ratio';
    const src = pickSrc(photo, sq, showRatio);

    const handleClick = useCallback(() => {
      if (isSelectMode) onToggleSelection(photo.id);
      else onItemClick(idx, photo.id);
    }, [isSelectMode, onToggleSelection, onItemClick, photo.id, idx]);

    return (
      <div
        data-photo-id={photo.id}
        onClick={handleClick}
        onContextMenu={(e) => {
          if (onContextMenu) {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(photo.id, e.clientX, e.clientY);
          }
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="button"
        tabIndex={0}
        className={
          sq
            ? `group relative aspect-square cursor-pointer overflow-hidden ${showRatio ? 'rounded-xl border border-gray-200/80 bg-white shadow-sm' : 'bg-gray-100'} ${isSelected ? 'z-10 ring-4 ring-indigo-500' : ''}`
            : `group relative mb-4 cursor-pointer break-inside-avoid overflow-hidden rounded-xl bg-gray-100 shadow-sm ${isSelected ? 'ring-4 ring-indigo-500' : ''}`
        }
      >
        <img
          src={src}
          alt={photo.title || photoAlt}
          loading="lazy"
          className={
            showRatio
              ? `h-full w-full object-contain p-2 transition-transform duration-500 ${isSelectMode ? '' : 'group-hover:scale-[1.03]'}`
              : sq
                ? `h-full w-full object-cover transition-transform duration-500 ${isSelectMode ? '' : 'group-hover:scale-110'}`
                : `h-auto w-full object-cover transition-transform duration-500 ${isSelectMode ? '' : 'group-hover:scale-105'}`
          }
        />
        {sq && <span className={`absolute inset-0 bg-black/0 transition-colors ${isSelectMode ? '' : 'group-hover:bg-black/15'}`} />}

        {isSelectMode && (
          <span className={`absolute right-2 top-2 z-20 rounded-full p-1 ${isSelected ? 'bg-indigo-500 text-white' : 'border border-white/50 bg-black/30 text-white/70'}`}>
            <CheckCircle size={20} className={isSelected ? 'fill-indigo-500 text-white' : ''} />
          </span>
        )}

        {!isSelectMode && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(photo.id); }}
            title={favoriteLabel}
            className={`absolute right-2 top-2 z-10 rounded-full p-1.5 text-white shadow-sm backdrop-blur-md transition-opacity ${isFav ? 'bg-rose-500' : 'bg-black/25 opacity-0 group-hover:opacity-100'}`}
          >
            <Heart size={14} className={isFav ? 'fill-current' : ''} />
          </button>
        )}

        {isDeleteMode && !isSelectMode && canDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(photo); }}
            disabled={isDeleting}
            title={deleteLabel}
            className="absolute left-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition-all hover:scale-110 hover:bg-red-700 disabled:bg-gray-400"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Minus size={14} strokeWidth={4} />}
          </button>
        )}

        {!isDeleteMode && !isSelectMode && canDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(photo); }}
            disabled={isDeleting}
            title={deleteLabel}
            className="absolute bottom-2 left-2 z-10 rounded-full bg-red-500 p-1.5 text-white opacity-0 shadow-sm backdrop-blur-md transition-opacity group-hover:opacity-100 disabled:bg-gray-400"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        )}

        {sq && !isSelectMode && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/35 p-1.5 text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
            <Maximize2 size={14} />
          </span>
        )}

        {isHovered && !isSelectMode && <ExifOverlay photo={photo} uploadedByLabel={uploadedByLabel} />}
      </div>
    );
  }
);
PhotoCard.displayName = 'PhotoCard';
