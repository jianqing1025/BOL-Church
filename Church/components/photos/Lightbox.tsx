import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Heart, Info, X } from 'lucide-react';
import type { ChurchPhoto } from '../../data';
import { useLocalization } from '../../hooks/useLocalization';

interface LightboxProps {
  photos: ChurchPhoto[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
  onDownload: (photo: ChurchPhoto) => void;
}

const fmtBytes = (b: number): string => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

export const Lightbox: React.FC<LightboxProps> = ({
  photos, index, onClose, onNavigate, isFavorite, onToggleFavorite, onDownload,
}) => {
  const { t } = useLocalization();
  const [showInfo, setShowInfo] = useState(false);
  const photo = photos[index];

  const go = useCallback((delta: number) => {
    if (photos.length === 0) return;
    const next = (index + delta + photos.length) % photos.length;
    onNavigate(next);
  }, [index, photos.length, onNavigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  if (!photo) return null;
  const fav = isFavorite(photo.id);
  const exif = photo.exif;
  const infoRows = (
    [
      photo.uploaderName ? [t('photosPage.uploadedBy'), photo.uploaderName] : null,
      photo.shotAt ? ['Shot At', new Date(photo.shotAt).toLocaleString()] : null,
      exif?.camera ? ['Camera', exif.camera] : null,
      exif?.lens ? ['Lens', exif.lens] : null,
      exif?.focalLength ? ['Focal', exif.focalLength] : null,
      exif?.aperture ? ['Aperture', exif.aperture] : null,
      exif?.shutter ? ['Shutter', exif.shutter] : null,
      exif?.iso != null ? ['ISO', String(exif.iso)] : null,
      photo.width && photo.height ? ['Pixels', `${photo.width}×${photo.height}`] : null,
      photo.sizeBytes != null ? ['Size', fmtBytes(photo.sizeBytes)] : null,
    ] as ([string, string] | null)[]
  ).filter((r): r is [string, string] => r !== null);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 p-4" onClick={onClose}>
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleFavorite(photo.id); }} title={t('photosPage.favorite')} className={`rounded-full p-2 backdrop-blur-md transition-colors ${fav ? 'bg-rose-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>
          <Heart size={20} className={fav ? 'fill-current' : ''} />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDownload(photo); }} title={t('photosPage.download')} className="rounded-full bg-white/10 p-2 text-white backdrop-blur-md transition-colors hover:bg-white/20">
          <Download size={20} />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setShowInfo((v) => !v); }} title={t('photosPage.info')} className={`rounded-full p-2 backdrop-blur-md transition-colors ${showInfo ? 'bg-white text-gray-900' : 'bg-white/10 text-white hover:bg-white/20'}`}>
          <Info size={20} />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} title={t('photosPage.close')} className="rounded-full bg-white/10 p-2 text-white backdrop-blur-md transition-colors hover:bg-white/20">
          <X size={20} />
        </button>
      </div>

      {photos.length > 1 && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur-md transition-colors hover:bg-white/20">
            <ChevronLeft size={26} />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur-md transition-colors hover:bg-white/20">
            <ChevronRight size={26} />
          </button>
        </>
      )}

      <img
        src={photo.src}
        alt={photo.title || t('photosPage.photoAlt')}
        className="max-h-[88vh] max-w-[94vw] object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {showInfo && infoRows.length > 0 && (
        <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-xl border border-white/10 bg-black/60 px-5 py-3 backdrop-blur-md" onClick={(e) => e.stopPropagation()}>
          {photo.title && <div className="mb-1 text-sm font-bold text-white">{photo.title}</div>}
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
            {infoRows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-x-2">
                <span className="text-[9px] uppercase tracking-wide text-white/45">{label}</span>
                <span className="truncate text-[11px] font-medium text-white/90">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="absolute bottom-2 right-4 z-10 text-xs font-semibold text-white/60">{index + 1} / {photos.length}</div>
    </div>
  );
};
