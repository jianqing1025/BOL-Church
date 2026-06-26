import React, { useCallback, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Plus, Search } from 'lucide-react';
import type { ChurchPhoto } from '../../data';
import { PhotoCard } from './PhotoCard';
import type { GridDisplayMode, ViewMode } from './types';

interface PhotoGridProps {
  items: ChurchPhoto[];
  viewMode: ViewMode;
  gridDisplayMode: GridDisplayMode;
  columns: number;
  filter: string;
  isSelectMode: boolean;
  selectedIds: Set<string>;
  isDeleteMode: boolean;
  favorites: Set<string>;
  uploaderId: string;
  deletingId: string;
  labels: { photoAlt: string; favorite: string; deleteMine: string; uploadedBy: string; add: string; empty: string };
  onToggleSelection: (id: string) => void;
  onAddToSelection: (ids: string[]) => void;
  onItemClick: (idx: number, id: string) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (photo: ChurchPhoto) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  onAddTile: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

const DRAG_THRESHOLD = 5;

export const PhotoGrid: React.FC<PhotoGridProps> = ({
  items, viewMode, gridDisplayMode, columns, filter, isSelectMode, selectedIds, isDeleteMode,
  favorites, uploaderId, deletingId, labels, onToggleSelection, onAddToSelection, onItemClick,
  onToggleFavorite, onDelete, onContextMenu, onAddTile, hasMore, isLoadingMore,
}) => {
  const dragState = useRef({ active: false, started: false, startIdx: -1, startX: 0, startY: 0 });
  const dragIds = useRef<Set<string>>(new Set());
  const suppressClickUntil = useRef(0);
  const autoScrollRaf = useRef<number | null>(null);
  const [dragVisualIds, setDragVisualIds] = useState<Set<string>>(new Set());

  const indexFromPoint = useCallback((x: number, y: number): number => {
    const el = document.elementFromPoint(x, y);
    const card = (el as HTMLElement | null)?.closest('[data-photo-id]');
    if (!card) return -1;
    return items.findIndex((p) => p.id === card.getAttribute('data-photo-id'));
  }, [items]);

  const idsInRange = useCallback((a: number, b: number): Set<string> => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const out = new Set<string>();
    for (let i = lo; i <= hi && i < items.length; i++) out.add(items[i].id);
    return out;
  }, [items]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isSelectMode || viewMode !== 'square' || e.button !== 0) return;
    const idx = indexFromPoint(e.clientX, e.clientY);
    if (idx < 0) return;
    dragState.current = { active: true, started: false, startIdx: idx, startX: e.clientX, startY: e.clientY };
  }, [isSelectMode, viewMode, indexFromPoint]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = dragState.current;
    if (!s.active) return;
    if (!s.started) {
      if (Math.abs(e.clientX - s.startX) < DRAG_THRESHOLD && Math.abs(e.clientY - s.startY) < DRAG_THRESHOLD) return;
      s.started = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const init = idsInRange(s.startIdx, s.startIdx);
      dragIds.current = init;
      setDragVisualIds(init);
    }
    e.preventDefault();
    const idx = indexFromPoint(e.clientX, e.clientY);
    if (idx >= 0) {
      const range = idsInRange(s.startIdx, idx);
      if (range.size !== dragIds.current.size) {
        dragIds.current = range;
        setDragVisualIds(range);
      }
    }
    // Auto-scroll the window near top/bottom edges
    const edge = 80;
    if (autoScrollRaf.current) { cancelAnimationFrame(autoScrollRaf.current); autoScrollRaf.current = null; }
    const fromTop = e.clientY;
    const fromBottom = window.innerHeight - e.clientY;
    if (fromTop < edge) {
      const speed = Math.max(2, (edge - fromTop) / 4);
      const step = () => { if (!dragState.current.started) return; window.scrollBy(0, -speed); autoScrollRaf.current = requestAnimationFrame(step); };
      autoScrollRaf.current = requestAnimationFrame(step);
    } else if (fromBottom < edge) {
      const speed = Math.max(2, (edge - fromBottom) / 4);
      const step = () => { if (!dragState.current.started) return; window.scrollBy(0, speed); autoScrollRaf.current = requestAnimationFrame(step); };
      autoScrollRaf.current = requestAnimationFrame(step);
    }
  }, [indexFromPoint, idsInRange]);

  const onPointerUp = useCallback(() => {
    const s = dragState.current;
    if (!s.active) return;
    const wasDrag = s.started;
    dragState.current = { active: false, started: false, startIdx: -1, startX: 0, startY: 0 };
    if (autoScrollRaf.current) { cancelAnimationFrame(autoScrollRaf.current); autoScrollRaf.current = null; }
    if (wasDrag && dragIds.current.size > 0) {
      onAddToSelection([...dragIds.current]);
      suppressClickUntil.current = Date.now() + 120;
    }
    dragIds.current = new Set();
    setDragVisualIds(new Set());
  }, [onAddToSelection]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (Date.now() < suppressClickUntil.current) { e.stopPropagation(); e.preventDefault(); }
  }, []);

  const showAddTile = filter !== 'Favorites' && !isSelectMode;

  if (items.length === 0) {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3 text-gray-500">
        {filter === 'Favorites' ? <Search className="h-8 w-8 text-gray-300" /> : <ImageIcon className="h-8 w-8 text-gray-300" />}
        <p className="text-sm font-semibold">{labels.empty}</p>
      </div>
    );
  }

  return (
    <>
      {viewMode === 'square' ? (
        <div
          className={`grid gap-1 bg-gray-50 p-1 ${isSelectMode ? 'touch-none select-none' : ''}`}
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClickCapture={onClickCapture}
        >
          {items.map((photo, idx) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              idx={idx}
              viewMode="square"
              gridDisplayMode={gridDisplayMode}
              isSelectMode={isSelectMode}
              isSelected={selectedIds.has(photo.id) || dragVisualIds.has(photo.id)}
              isDeleteMode={isDeleteMode}
              isFav={favorites.has(photo.id)}
              canDelete={photo.uploaderId === uploaderId}
              isDeleting={deletingId === photo.id}
              photoAlt={labels.photoAlt}
              favoriteLabel={labels.favorite}
              deleteLabel={labels.deleteMine}
              uploadedByLabel={labels.uploadedBy}
              onToggleSelection={onToggleSelection}
              onItemClick={onItemClick}
              onToggleFavorite={onToggleFavorite}
              onDelete={onDelete}
              onContextMenu={onContextMenu}
            />
          ))}
          {showAddTile && (
            <button type="button" onClick={onAddTile} className="group relative flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden border-2 border-dashed border-gray-200 bg-gray-100 transition-all hover:border-rose-300 hover:bg-rose-50">
              <Plus size={24} className="text-gray-300 group-hover:text-rose-400" />
              <span className="text-[10px] font-bold uppercase text-gray-400 group-hover:text-rose-400">{labels.add}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 px-2 py-4" style={{ columnCount: Math.max(1, Math.min(8, columns)) }}>
          {items.map((photo, idx) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              idx={idx}
              viewMode="masonry"
              isSelectMode={isSelectMode}
              isSelected={selectedIds.has(photo.id)}
              isDeleteMode={isDeleteMode}
              isFav={favorites.has(photo.id)}
              canDelete={photo.uploaderId === uploaderId}
              isDeleting={deletingId === photo.id}
              photoAlt={labels.photoAlt}
              favoriteLabel={labels.favorite}
              deleteLabel={labels.deleteMine}
              uploadedByLabel={labels.uploadedBy}
              onToggleSelection={onToggleSelection}
              onItemClick={onItemClick}
              onToggleFavorite={onToggleFavorite}
              onDelete={onDelete}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}

      {(hasMore || isLoadingMore) && (
        <div className="flex items-center justify-center gap-2 bg-gray-50 py-6 text-sm text-gray-500">
          {isLoadingMore ? <Loader2 size={16} className="animate-spin text-rose-500" /> : <span className="h-2 w-2 rounded-full bg-gray-300" />}
        </div>
      )}
    </>
  );
};
