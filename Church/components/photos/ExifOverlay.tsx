import React from 'react';
import { api } from '../../api';
import type { ChurchPhoto } from '../../data';

const fmtBytes = (b: number): string => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const fmtDate = (value?: string | number): string => {
  if (value == null) return '';
  const d = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
};

// 列表响应已精简(不含 EXIF),hover 时按需拉取单张详情并缓存,避免大相薄一次性加载 EXIF。
const detailCache = new Map<string, ChurchPhoto>();

/**
 * Read-only metadata panel shown on hover (desktop) over a PhotoCard.
 * Non-EXIF fields come from the slim list record; camera/EXIF is fetched
 * on demand (hover) via the per-photo detail endpoint and cached.
 */
export const ExifOverlay: React.FC<{ photo: ChurchPhoto }> = React.memo(
  ({ photo }) => {
    const [detail, setDetail] = React.useState<ChurchPhoto>(() => detailCache.get(photo.id) ?? photo);

    React.useEffect(() => {
      const cached = detailCache.get(photo.id);
      if (cached) { setDetail(cached); return; }
      if (photo.exif) { setDetail(photo); return; }
      let cancelled = false;
      api.photoDetail(photo.id)
        .then(res => {
          if (cancelled || !res.photo) return;
          detailCache.set(photo.id, res.photo);
          setDetail(res.photo);
        })
        .catch(() => { /* keep slim data */ });
      return () => { cancelled = true; };
    }, [photo, photo.id, photo.exif]);

    const exif = detail.exif;
    const shotAt = fmtDate(detail.shotAt);
    const uploadedAt = fmtDate(detail.createdAt);
    const rows = (
      [
        shotAt ? ['Shot At', shotAt] : null,
        exif?.camera ? ['Camera', exif.camera] : null,
        exif?.lens ? ['Lens', exif.lens] : null,
        exif?.focalLength ? ['Focal', exif.focalLength] : null,
        exif?.aperture ? ['F', exif.aperture] : null,
        exif?.shutter ? ['Shutter', exif.shutter] : null,
        exif?.iso != null ? ['ISO', String(exif.iso)] : null,
        detail.width && detail.height ? ['Pixels', `${detail.width}×${detail.height}`] : null,
        detail.sizeBytes != null ? ['Size', fmtBytes(detail.sizeBytes)] : null,
        uploadedAt ? ['Upload', uploadedAt] : null,
        detail.uploaderName ? ['Upload by', detail.uploaderName] : null,
      ] as ([string, string] | null)[]
    ).filter((r): r is [string, string] => r !== null);

    if (rows.length === 0) return null;
    return (
      <div className="exif-enter pointer-events-none absolute bottom-2 left-2 z-30 w-[46%] min-w-[192px] max-w-[312px] rounded-lg border border-white/[0.06] bg-black/[0.35] px-2.5 py-1.5 text-left shadow-sm backdrop-blur-[2px]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[52px_minmax(0,1fr)] items-baseline gap-x-1.5">
            <span className="text-[8px] uppercase tracking-wide text-white/45">{label}</span>
            <span className="truncate text-[9px] font-medium leading-tight text-white/90">{value}</span>
          </div>
        ))}
      </div>
    );
  }
);
ExifOverlay.displayName = 'ExifOverlay';
