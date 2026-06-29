
/**
 * Check if the app is running inside Electron desktop shell.
 * Use this to conditionally enable desktop-only features (local file ops, etc.)
 */
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && !!window.electronAPI;
};

export interface R2UploadResult {
    secureUrl: string;
    sizeBytes?: number;
    exif?: { shotAt?: string; camera?: string; lens?: string; focalLength?: string; aperture?: string; shutter?: string; iso?: number; width?: number; height?: number; };
}

export interface UploadImageSettings {
    resizeEnabled: boolean;
    maxLongEdge: number;
    jpegQuality: number;
}

export interface UploadRequestOptions {
    collection?: string;
    category?: string;
    imageSettings?: UploadImageSettings;
}

export interface CloudThumbnailSettings {
    longEdge: number;
    quality: number;
}

// --- Cloudflare R2 Upload Utility (Server-side Proxy) ---
export const uploadFileToR2 = async (
    file: File,
    onProgress?: (percent: number) => void,
    options?: UploadRequestOptions
): Promise<R2UploadResult> => {
    // 1. Extract EXIF from original file first (compression strips EXIF)
    let exif: R2UploadResult['exif'] | undefined;
    if (file.type.startsWith('image/')) {
        try {
            const exifr = await import('exifr');
            const raw = await exifr.parse(file, { tiff: true, exif: true, gps: false });
            if (raw) {
                exif = {
                    shotAt: raw.DateTimeOriginal ? new Date(raw.DateTimeOriginal).toISOString() : undefined,
                    camera: [raw.Make, raw.Model].filter(Boolean).join(' ') || undefined,
                    lens: raw.LensModel || undefined,
                    focalLength: raw.FocalLength ? `${raw.FocalLength}mm` : undefined,
                    aperture: raw.FNumber ? `f/${raw.FNumber}` : undefined,
                    shutter: raw.ExposureTime ? `1/${Math.round(1 / raw.ExposureTime)}s` : undefined,
                    iso: raw.ISO ?? raw.ISOSpeedRatings ?? undefined,
                    width: raw.ExifImageWidth ?? raw.ImageWidth ?? undefined,
                    height: raw.ExifImageHeight ?? raw.ImageHeight ?? undefined,
                };
            }
        } catch { /* EXIF extraction is best-effort */ }
    }

    const formData = new FormData();
    formData.append('file', file);
    if (options?.collection) formData.append('collection', options.collection);
    if (options?.category) formData.append('category', options.category);
    if (file.type.startsWith('image/') && options?.imageSettings) {
        formData.append('resizeEnabled', String(options.imageSettings.resizeEnabled));
        formData.append('maxLongEdge', String(options.imageSettings.maxLongEdge));
        formData.append('jpegQuality', String(options.imageSettings.jpegQuality));
    }

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload-r2');

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && onProgress) {
                const percent = Math.round((event.loaded / event.total) * 100);
                onProgress(percent);
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.secureUrl) {
                        resolve({ secureUrl: response.secureUrl, sizeBytes: response.sizeBytes, exif: response.exif ?? exif });
                    } else {
                        reject(new Error("Missing secureUrl in response"));
                    }
                } catch (e) {
                    reject(new Error("Invalid JSON response"));
                }
            } else {
                try {
                    const errorResponse = JSON.parse(xhr.responseText);
                    reject(new Error(errorResponse.error || xhr.statusText || "Upload request failed"));
                } catch (e) {
                    reject(new Error(xhr.statusText || "Upload request failed"));
                }
            }
        };

        xhr.onerror = () => reject(new Error('Network error during upload to server proxy'));
        xhr.send(formData);
    });
};

// --- Batch R2 Upload with Concurrency Control ---
export interface FileUploadStatus {
    file: File;
    progress: number;
    status: 'pending' | 'uploading' | 'complete' | 'error';
    secureUrl?: string;
    sizeBytes?: number;
    exif?: R2UploadResult['exif'];
    error?: string;
}

export const uploadFilesToR2 = async (
    files: File[],
    onFileProgress: (index: number, status: FileUploadStatus) => void,
    concurrency: number = 3,
    options?: UploadRequestOptions
): Promise<FileUploadStatus[]> => {
    const statuses: FileUploadStatus[] = files.map(file => ({
        file, progress: 0, status: 'pending'
    }));

    let nextIndex = 0;

    const uploadNext = async (): Promise<void> => {
        while (nextIndex < files.length) {
            const i = nextIndex++;
            statuses[i].status = 'uploading';
            onFileProgress(i, { ...statuses[i] });

            try {
                const result = await uploadFileToR2(files[i], (percent) => {
                    statuses[i].progress = percent;
                    onFileProgress(i, { ...statuses[i] });
                }, options);
                statuses[i].status = 'complete';
                statuses[i].secureUrl = result.secureUrl;
                statuses[i].sizeBytes = result.sizeBytes;
                statuses[i].exif = result.exif;
                statuses[i].progress = 100;
            } catch (err: any) {
                statuses[i].status = 'error';
                statuses[i].error = err.message;
            }
            onFileProgress(i, { ...statuses[i] });
        }
    };

    const workers = Array.from(
        { length: Math.min(concurrency, files.length) },
        () => uploadNext()
    );
    await Promise.all(workers);

    return statuses;
};

export const getOptimizedThumbnailUrl = (
    url: string,
    settings: CloudThumbnailSettings = { longEdge: 960, quality: 85 },
) => {
    if (!url) return '';
    if (url.startsWith('/') || url.startsWith('blob:') || !url.includes('cloudinary.com')) return url;

    const params = `c_limit,w_${settings.longEdge},q_${settings.quality},f_auto,dpr_auto`;
    return url.replace('/upload/', `/upload/${params}/`);
};

export const getOptimizedUrl = (
    url: string,
    type: 'party' | 'blog' | 'portrait' | 'landscape' | 'grid' | 'masonry' | 'full' = 'blog',
    thumbSettings?: CloudThumbnailSettings,
) => {
    if (!url) return '';
    if (url.startsWith('/') || url.startsWith('blob:') || !url.includes('cloudinary.com')) return url;

    let params = '';
    const baseParams = 'f_auto,q_auto:best,dpr_auto';
    switch (type) {
        case 'party': params = `c_thumb,g_face,w_600,h_600,z_0.7,${baseParams}`; break;
        case 'blog': params = `c_fill,g_auto,w_1200,h_900,${baseParams}`; break;
        case 'portrait': params = `c_fill,g_faces:auto,w_800,h_1200,${baseParams}`; break;
        case 'landscape': params = `c_fill,g_faces:auto,w_1000,h_750,${baseParams}`; break;
        case 'grid': return getOptimizedThumbnailUrl(url, thumbSettings);
        case 'masonry': params = `c_limit,w_600,${baseParams}`; break;
        case 'full': params = `c_limit,w_1920,h_1920,${baseParams}`; break;
        default: params = `c_fill,g_auto,${baseParams}`;
    }
    return url.replace('/upload/', `/upload/${params}/`);
};

/** Only return 'anonymous' for Cloudinary URLs; blob/same-origin stay undefined. */
export const getMediaCrossOrigin = (url: string): 'anonymous' | undefined => {
    if (!url) return undefined;
    return url.includes('cloudinary.com') ? 'anonymous' : undefined;
};

export const shuffle = <T,>(array: T[]): T[] => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const normalizeCloudinaryUrl = (input: string): string => {
  try {
    const u = new URL(input);
    if (u.hostname !== 'res.cloudinary.com') return input;

    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 4) return input;

    const [cloud, assetType, upload, ...rest] = parts;
    if (upload !== 'upload') return input;

    const normalizedRest = rest[0] && /^v\d+$/.test(rest[0]) ? rest.slice(1) : rest;

    u.pathname = `/${cloud}/${assetType}/upload/${normalizedRest.join('/')}`;
    return u.toString();
  } catch (e) {
    return input;
  }
};

export const precacheVideo = async (videoUrl: string) => {
  if (!('caches' in window)) return;
  if (videoUrl.startsWith('/') || videoUrl.startsWith('blob:')) return;

  try {
    const cacheName = 'cloudinary-videos-cache';
    const canonicalKey = normalizeCloudinaryUrl(videoUrl);
    const cache = await caches.open(cacheName);
    const match = await cache.match(canonicalKey);
    if (match) return;

    const response = await fetch(videoUrl, {
      method: 'GET',
      headers: { 'Range': '' },
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit'
    });

    if (response.status === 200) {
      await cache.put(canonicalKey, response);
    }
  } catch (e) {
    // console.error('Precache error:', e);
  }
};

export const precacheImage = async (imageUrl: string) => {
  if (!('caches' in window)) return;
  if (imageUrl.startsWith('/') || imageUrl.startsWith('blob:')) return;

  try {
    const cacheName = 'cloudinary-images-cache';
    const canonicalKey = normalizeCloudinaryUrl(imageUrl);
    const cache = await caches.open(cacheName);
    const match = await cache.match(canonicalKey);
    if (match) return;
    
    const response = await fetch(imageUrl, {
      method: 'GET',
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit'
    });

    if (response.status === 200) {
      await cache.put(canonicalKey, response);
    }
  } catch (e) {
    // console.error('Image precache error:', e);
  }
};
