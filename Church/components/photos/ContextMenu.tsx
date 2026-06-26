import React, { useEffect, useRef } from 'react';
import { CheckSquare, Download, Heart, Trash2 } from 'lucide-react';

export interface ContextMenuState { id: string; x: number; y: number; }

interface ContextMenuProps {
  state: ContextMenuState;
  isFavorite: boolean;
  canDelete: boolean;
  labels: { favorite: string; download: string; deleteMine: string; select: string };
  onClose: () => void;
  onFavorite: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onSelect: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  state, isFavorite, canDelete, labels, onClose, onFavorite, onDownload, onDelete, onSelect,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', onClose, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); window.removeEventListener('scroll', onClose, true); };
  }, [onClose]);

  const x = Math.min(state.x, window.innerWidth - 180);
  const y = Math.min(state.y, window.innerHeight - 200);
  const row = 'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50';

  return (
    <div ref={ref} className="fixed z-[150] w-44 rounded-xl border border-gray-100 bg-white py-1 shadow-2xl" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => { onFavorite(); onClose(); }} className={row}><Heart size={15} className={isFavorite ? 'fill-rose-500 text-rose-500' : 'text-rose-400'} />{labels.favorite}</button>
      <button type="button" onClick={() => { onDownload(); onClose(); }} className={row}><Download size={15} className="text-green-500" />{labels.download}</button>
      <button type="button" onClick={() => { onSelect(); onClose(); }} className={row}><CheckSquare size={15} className="text-indigo-500" />{labels.select}</button>
      {canDelete && <button type="button" onClick={() => { onDelete(); onClose(); }} className={`${row} text-red-600 hover:bg-red-50`}><Trash2 size={15} className="text-red-500" />{labels.deleteMine}</button>}
    </div>
  );
};
