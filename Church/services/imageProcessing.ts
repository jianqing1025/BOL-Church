import exifr from 'exifr';
import type { ChurchPhotoExif } from '../data';

/**
 * Client-side image processing.
 *
 * The Church backend runs on Cloudflare Workers, which cannot run `sharp`, so
 * all resizing / thumbnail generation / EXIF extraction happens in the browser
 * before upload. The Worker only stores the resulting blobs + metadata.
 */

export interface ExtractedExif extends ChurchPhotoExif {
  shotAt?: string;
  width?: number;
  height?: number;
}

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface ResizeOptions {
  maxLongEdge: number;
  quality: number; // 0..1
}

export interface ThumbnailOptions {
  longEdge: number;
  quality: number; // 0..1
}

const isImage = (file: File): boolean => file.type.startsWith('image/');

/** Parse EXIF from the original file (resizing strips it, so read it first). */
export async function extractExif(file: File): Promise<ExtractedExif | null> {
  if (!isImage(file)) return null;
  try {
    const raw: Record<string, unknown> | undefined = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: false,
    });
    if (!raw) return null;

    const exif: ExtractedExif = {};

    const dt = raw.DateTimeOriginal ?? raw.DateTimeDigitized ?? raw.DateTime;
    if (dt) {
      const d = dt instanceof Date ? dt : new Date(String(dt));
      if (!Number.isNaN(d.getTime())) exif.shotAt = d.toISOString();
    }

    const camera = [raw.Make, raw.Model].filter(Boolean).map(String).join(' ').trim();
    if (camera) exif.camera = camera;
    if (typeof raw.LensModel === 'string' && raw.LensModel.trim()) exif.lens = raw.LensModel.trim();
    if (typeof raw.FocalLength === 'number') exif.focalLength = `${raw.FocalLength}mm`;
    if (typeof raw.FNumber === 'number') exif.aperture = `f/${raw.FNumber}`;
    if (typeof raw.ExposureTime === 'number') {
      exif.shutter = raw.ExposureTime < 1 ? `1/${Math.round(1 / raw.ExposureTime)}s` : `${raw.ExposureTime}s`;
    }
    const iso = (raw.ISO ?? raw.ISOSpeedRatings) as unknown;
    if (typeof iso === 'number') exif.iso = iso;

    const w = (raw.ExifImageWidth ?? raw.ImageWidth) as unknown;
    const h = (raw.ExifImageHeight ?? raw.ImageHeight) as unknown;
    if (typeof w === 'number') exif.width = w;
    if (typeof h === 'number') exif.height = h;

    return Object.keys(exif).length > 0 ? exif : null;
  } catch {
    return null;
  }
}

type DrawableSource = ImageBitmap | HTMLImageElement;

/** Decode a file into a drawable source, applying EXIF orientation when possible. */
async function loadSource(file: File): Promise<DrawableSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* fall through to <img> */
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image decode failed'));
    };
    img.src = url;
  });
}

function sourceSize(source: DrawableSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  }
  return { width: source.width, height: source.height };
}

function releaseSource(source: DrawableSource): void {
  if ('close' in source && typeof source.close === 'function') source.close();
}

/** Scale `source` so its longest edge ≤ maxLongEdge (never upscales) and encode JPEG. */
async function renderToJpeg(source: DrawableSource, maxLongEdge: number, quality: number): Promise<ProcessedImage> {
  const { width: srcW, height: srcH } = sourceSize(source);
  const longest = Math.max(srcW, srcH) || 1;
  const scale = maxLongEdge > 0 && longest > maxLongEdge ? maxLongEdge / longest : 1;
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(source, 0, 0, width, height);

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', Math.max(0.5, Math.min(1, quality)))
  );
  if (!blob) throw new Error('Canvas encoding failed');
  return { blob, width, height };
}

/** Resize + recompress the main image. */
export async function resizeImage(file: File, opts: ResizeOptions): Promise<ProcessedImage> {
  const source = await loadSource(file);
  try {
    const maxLongEdge = Math.max(512, Math.min(7680, Math.round(opts.maxLongEdge) || 1920));
    return await renderToJpeg(source, maxLongEdge, opts.quality);
  } finally {
    releaseSource(source);
  }
}

/** Generate a small JPEG thumbnail. */
export async function makeThumbnail(file: File, opts: ThumbnailOptions): Promise<Blob> {
  const source = await loadSource(file);
  try {
    const longEdge = Math.max(160, Math.min(2048, Math.round(opts.longEdge) || 960));
    const { blob } = await renderToJpeg(source, longEdge, opts.quality);
    return blob;
  } finally {
    releaseSource(source);
  }
}

/** Read intrinsic dimensions without recompressing (used when resize is disabled). */
export async function getDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!isImage(file)) return null;
  try {
    const source = await loadSource(file);
    try {
      return sourceSize(source);
    } finally {
      releaseSource(source);
    }
  } catch {
    return null;
  }
}
