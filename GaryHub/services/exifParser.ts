import { ExifData } from '../types';

// Module-level cache — persists across renders, never clears during session.
// key: image src URL, value: parsed ExifData or null (null = tried but no data)
const exifCache = new Map<string, ExifData | null>();

async function fetchContentLength(src: string): Promise<number | null> {
    // 1. Performance API (works if server sends Timing-Allow-Origin)
    const baseUrl = src.split('?')[0];
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const entry = entries.find(e => e.name.split('?')[0] === baseUrl);
    if (entry && entry.encodedBodySize > 0) return entry.encodedBodySize;

    // 2. Range: bytes=0-0 — reads Content-Range: bytes 0-0/TOTAL (R2 supports this)
    try {
        const res = await fetch(src, { method: 'GET', headers: { Range: 'bytes=0-0' } });
        const cr = res.headers.get('Content-Range');
        if (cr) {
            const m = cr.match(/\/(\d+)$/);
            if (m) return parseInt(m[1], 10);
        }
    } catch {}

    // 3. HEAD fallback
    try {
        const res = await fetch(src, { method: 'HEAD' });
        const cl = res.headers.get('Content-Length');
        if (cl) {
            const n = parseInt(cl, 10);
            return isNaN(n) ? null : n;
        }
    } catch {}
    return null;
}

/**
 * Lazily fetches and parses EXIF data for a given image URL.
 * Also fetches Content-Length via HEAD to populate sizeBytes.
 * Uses module-level cache so each URL is only fetched once.
 * Silently returns null on any error.
 */
export async function fetchExif(src: string): Promise<ExifData | null> {
    if (exifCache.has(src)) return exifCache.get(src)!;

    // Skip non-HTTP URLs (blob:, data:, relative paths)
    if (!src.startsWith('http')) {
        exifCache.set(src, null);
        return null;
    }

    // For formats that don't embed EXIF, only fetch file size via HEAD.
    const urlPath = src.split('?')[0].toLowerCase();
    const ext = urlPath.split('.').pop() ?? '';
    if (['png', 'gif', 'svg', 'bmp', 'webp'].includes(ext)) {
        const sizeBytes = await fetchContentLength(src);
        const result = sizeBytes != null ? { sizeBytes } : null;
        exifCache.set(src, result);
        return result;
    }

    try {
        // Fetch Content-Length and EXIF in parallel to save time.
        const [sizeBytes, exifr] = await Promise.all([
            fetchContentLength(src),
            import('exifr').then(m => m.default),
        ]);

        // exifr uses Range requests internally — only downloads ~64 KB.
        const raw: Record<string, unknown> | undefined = await exifr.parse(src, {
            tiff: true,
            exif: true,
            gps: false,
            interop: false,
            iptc: false,
            icc: false,
        });

        const data: ExifData = {};

        // File size (always available from HEAD, independent of EXIF)
        if (sizeBytes != null) data.sizeBytes = sizeBytes;

        if (!raw) {
            const result = Object.keys(data).length > 0 ? data : null;
            exifCache.set(src, result);
            return result;
        }

        // Capture time: DateTimeOriginal > DateTimeDigitized > DateTime
        const dt = raw.DateTimeOriginal ?? raw.DateTimeDigitized ?? raw.DateTime;
        if (dt instanceof Date) data.shotAt = dt.toLocaleString();
        else if (typeof dt === 'string') data.shotAt = dt;

        // Camera
        const parts = ([raw.Make, raw.Model] as unknown[]).filter(Boolean).map(String);
        if (parts.length) data.camera = parts.join(' ');

        // Lens
        if (typeof raw.LensModel === 'string') data.lens = raw.LensModel;

        // Focal length
        if (typeof raw.FocalLength === 'number') data.focalLength = `${raw.FocalLength}mm`;

        // Aperture
        if (typeof raw.FNumber === 'number') data.aperture = `f/${raw.FNumber}`;

        // Shutter speed
        if (typeof raw.ExposureTime === 'number') {
            const et = raw.ExposureTime;
            data.shutter = et < 1 ? `1/${Math.round(1 / et)}s` : `${et}s`;
        }

        // ISO
        if (typeof raw.ISO === 'number') data.iso = raw.ISO;

        // Pixel dimensions
        const w = raw.PixelXDimension ?? raw.ImageWidth;
        const h = raw.PixelYDimension ?? raw.ImageHeight;
        if (typeof w === 'number') data.width = w;
        if (typeof h === 'number') data.height = h;

        const result = Object.keys(data).length > 0 ? data : null;
        exifCache.set(src, result);
        return result;
    } catch {
        exifCache.set(src, null);
        return null;
    }
}
