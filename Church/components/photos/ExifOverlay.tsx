import React from 'react';
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

/**
 * Read-only metadata panel shown on hover (desktop) over a PhotoCard.
 * Pulls camera/EXIF + uploader from the persisted ChurchPhoto record.
 */
export const ExifOverlay: React.FC<{ photo: ChurchPhoto; uploadedByLabel: string }> = React.memo(
  ({ photo, uploadedByLabel }) => {
    const exif = photo.exif;
    const shotAt = fmtDate(photo.shotAt);
    const uploadedAt = fmtDate(photo.createdAt);
    const rows = (
      [
        shotAt ? ['Shot At', shotAt] : null,
        exif?.camera ? ['Camera', exif.camera] : null,
        exif?.lens ? ['Lens', exif.lens] : null,
        exif?.focalLength ? ['Focal', exif.focalLength] : null,
        exif?.aperture ? ['F', exif.aperture] : null,
        exif?.shutter ? ['Shutter', exif.shutter] : null,
        exif?.iso != null ? ['ISO', String(exif.iso)] : null,
        photo.width && photo.height ? ['Pixels', `${photo.width}×${photo.height}`] : null,
        photo.sizeBytes != null ? ['Size', fmtBytes(photo.sizeBytes)] : null,
        photo.uploaderName ? [uploadedByLabel, photo.uploaderName] : null,
        uploadedAt ? ['Upload', uploadedAt] : null,
      ] as ([string, string] | null)[]
    ).filter((r): r is [string, string] => r !== null);

    if (rows.length === 0) return null;
    return (
      <div className="exif-enter pointer-events-none absolute bottom-2 left-2 z-30 w-[38%] min-w-[160px] max-w-[260px] rounded-lg border border-white/[0.06] bg-black/[0.35] px-2.5 py-1.5 text-left shadow-sm backdrop-blur-[2px]">
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
