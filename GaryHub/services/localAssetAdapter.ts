/**
 * Adapter: converts LocalAsset records from the Electron IPC layer
 * into GalleryItem / VideoItem objects that the existing UI can consume.
 */
import type { GalleryItem, VideoItem } from '../types';

interface LocalAssetRecord {
  id: number;
  libraryId: number;
  localId: string;
  filePath: string;
  fileName: string;
  fileExt: string;
  mediaType: 'image' | 'video';
  collection: string;
  album: string;
  title: string;
  sizeBytes: number;
  mtime: number;
  hash: string;
  thumbPath: string;
  videoCachePath: string;
  width: number | null;
  height: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Build a URL that the Express server can serve for a local file */
function localMediaUrl(filePath: string): string {
  return `/api/local-media?path=${encodeURIComponent(filePath)}`;
}

/** Convert a local image asset to a GalleryItem */
export function localAssetToGalleryItem(asset: LocalAssetRecord): GalleryItem {
  const thumbSrc = asset.thumbPath
    ? localMediaUrl(asset.thumbPath)
    : localMediaUrl(asset.filePath);

  return {
    id: asset.localId,                   // "local:1:42"
    src: localMediaUrl(asset.filePath),   // Full-size image URL
    thumbSrc: thumbSrc,
    title: asset.title,
    collection: asset.collection,
    album: asset.album,
    category: asset.album,
    createdAt: asset.mtime,
    sizeBytes: asset.sizeBytes,
    exif: {
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
      sizeBytes: asset.sizeBytes,
    },
    sourceType: 'local',
    localAssetId: asset.id,
    localFilePath: asset.filePath,
  };
}

/** Convert a local video asset to a VideoItem */
export function localAssetToVideoItem(asset: LocalAssetRecord): VideoItem {
  const videoSrc = asset.videoCachePath
    ? localMediaUrl(asset.videoCachePath)
    : localMediaUrl(asset.filePath);

  return {
    id: asset.localId,
    video: videoSrc,
    thumbSrc: asset.thumbPath ? localMediaUrl(asset.thumbPath) : undefined,
    title: asset.title,
    desc: '',
    collection: asset.collection,
    album: asset.album,
    category: asset.album,
    createdAt: asset.mtime,
    sizeBytes: asset.sizeBytes,
    sourceType: 'local',
    localAssetId: asset.id,
    localFilePath: asset.filePath,
  };
}

/**
 * Convert an array of local assets to GalleryItem[] + VideoItem[],
 * split by mediaType.
 */
export function convertLocalAssets(
  assets: LocalAssetRecord[],
  options?: { useVideoCache?: boolean; useVideoCovers?: boolean },
): {
  photos: GalleryItem[];
  videos: VideoItem[];
} {
  const photos: GalleryItem[] = [];
  const videos: VideoItem[] = [];

  for (const asset of assets) {
    if (asset.mediaType === 'image') {
      photos.push(localAssetToGalleryItem(asset));
    } else {
      videos.push(localAssetToVideoItem({
        ...asset,
        videoCachePath: options?.useVideoCache ? asset.videoCachePath : '',
        // Always expose an existing local video cover if one is already on disk.
        // The toggle controls generation, not whether an existing cover can be used.
        thumbPath: asset.thumbPath || '',
      }));
    }
  }

  return { photos, videos };
}
