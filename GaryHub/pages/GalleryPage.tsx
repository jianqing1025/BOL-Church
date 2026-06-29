
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, X, Loader2, CloudUpload, CheckCircle, AlertCircle, AlertTriangle, HardDrive, Info, FolderOpen, RefreshCw, Trash2, FolderInput, Copy, Download, Heart } from 'lucide-react';
import { uploadFilesToR2, FileUploadStatus, UploadImageSettings, getOptimizedThumbnailUrl, type CloudThumbnailSettings } from '../utils';
import { GalleryItem, VideoItem, LocalImportConfig, SlideshowMode, ScanResultGroup, SortField, SortDir } from '../types';
import { SlideshowOverlayRenderer, SlideshowSelection } from '../components/slideshows/SlideshowOverlayRenderer';
import { Lightbox } from '../components/common/Lightboxes';
import TheaterOverlay from '../components/common/TheaterOverlay';
import ConfirmModal from '../components/common/ConfirmModal';
import { ContextMenu, ContextMenuItem } from '../components/common/ContextMenu';
import { PhotoLibrary } from '../components/gallery/PhotoLibrary';
import { VideoLibrary } from '../components/gallery/VideoLibrary';
import { DuplicateScanModal } from '../components/gallery/modals/DuplicateScanModal';
import { BulkActionModal } from '../components/gallery/modals/BulkActionModal';
import { exportViaDirectoryPicker, exportViaBrowserDownload } from '../services/exportService';
import { isElectron } from '../utils';
import { convertLocalAssets } from '../services/localAssetAdapter';

// ── Sort helper (outside component for stable reference) ─────────────────────
const toMs = (ca: any): number => {
    if (!ca) return 0;
    if (typeof ca === 'number') return ca;
    if (typeof ca === 'string') { const t = new Date(ca).getTime(); return isNaN(t) ? 0 : t; }
    if (typeof ca.toMillis === 'function') return ca.toMillis();
    if (typeof ca.toDate === 'function') return ca.toDate().getTime();
    if (ca instanceof Date) return ca.getTime();
    return 0;
};

const fmtBytes = (b: number): string => {
    if (!Number.isFinite(b) || b <= 0) return '0 B';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const scanPhaseLabel = (phase?: string): string => {
    switch (phase) {
        case 'scanning': return 'Scanning files...';
        case 'hashing': return 'Processing files...';
        case 'thumbnails': return 'Generating thumbnails...';
        case 'video-transcode': return 'Building video cache...';
        case 'indexing': return 'Indexing...';
        case 'done': return 'Done';
        default: return 'Preparing...';
    }
};

const STRUCTURE_MAX_VISIBLE_ROWS = 15;
const STRUCTURE_ROW_HEIGHT_REM = 2.25;
const PHOTO_UPLOAD_LONG_EDGE_OPTIONS = [1280, 1600, 1920, 2560, 3840] as const;
const PHOTO_UPLOAD_QUALITY_OPTIONS = [0.8, 0.85, 0.90, 0.92, 0.95, 0.97, 1] as const;

type CollectionStructureRow = {
    collection: string;
    album: string;
    count: number;
    sizeBytes: number;
};

type CollectionInfoSection = {
    id: string;
    title: string;
    subtitle?: string;
    totalFiles: number;
    totalPhotos: number;
    totalVideos: number;
    totalSizeBytes: number;
    structure: CollectionStructureRow[];
    actions?: React.ReactNode;
};

function sortGalleryItems<T extends GalleryItem>(items: T[], field: SortField, dir: SortDir): T[] {
    return [...items].sort((a, b) => {
        let cmp = 0;
        switch (field) {
            case 'uploadedAt':
                cmp = toMs(a.createdAt) - toMs(b.createdAt);
                break;
            case 'shotAt': {
                const aMs = a.exif?.shotAt ? (new Date(a.exif.shotAt).getTime() || toMs(a.createdAt)) : toMs(a.createdAt);
                const bMs = b.exif?.shotAt ? (new Date(b.exif.shotAt).getTime() || toMs(b.createdAt)) : toMs(b.createdAt);
                cmp = aMs - bMs;
                break;
            }
            case 'sizeBytes':
                if (a.sizeBytes == null && b.sizeBytes == null) cmp = 0;
                else if (a.sizeBytes == null) cmp = 1;
                else if (b.sizeBytes == null) cmp = -1;
                else cmp = a.sizeBytes - b.sizeBytes;
                break;
        }
        if (dir === 'desc') cmp = -cmp;
        if (cmp === 0) cmp = toMs(b.createdAt) - toMs(a.createdAt);
        return cmp;
    });
}

// ── Normalization (outside component for stable reference) ────────────────────
const normalizePhoto = (item: GalleryItem): GalleryItem & { collection: string; album: string } => ({
    ...item,
    collection: sanitizeFacetLabel(item.collection, 'Yuxin'),
    album: sanitizeFacetLabel(item.album || item.category, 'Uncategorized'),
});

const normalizeVideo = (item: VideoItem): VideoItem & { collection: string; album: string } => ({
    ...item,
    collection: sanitizeFacetLabel(item.collection, 'Yuxin'),
    album: sanitizeFacetLabel(item.album || item.category, 'Uncategorized'),
});

const RESERVED_FILTER_KEYS = new Set(['all', 'favorites']);

const normalizeFacetKey = (value?: string | null): string => (value || '').trim().toLowerCase();
const isReservedFacetLabel = (value?: string | null): boolean => RESERVED_FILTER_KEYS.has(normalizeFacetKey(value));

const sanitizeFacetLabel = (value: string | undefined | null, fallback: string): string => {
    const trimmed = value?.trim();
    if (!trimmed) return fallback;
    return RESERVED_FILTER_KEYS.has(trimmed.toLowerCase()) ? fallback : trimmed;
};

const validateFacetInput = (label: string, value: string): string | null => {
    if (!value.trim()) return `${label} name is required.`;
    if (isReservedFacetLabel(value)) return `"${value.trim()}" is reserved and cannot be used as a ${label.toLowerCase()} name.`;
    return null;
};

const uniqueFacetValues = (values: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const trimmed = value.trim();
        if (!trimmed) continue;

        const key = normalizeFacetKey(trimmed);
        if (RESERVED_FILTER_KEYS.has(key) || seen.has(key)) continue;

        seen.add(key);
        result.push(trimmed);
    }

    return result.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

function partitionSlideshowData<T>(items: T[], parts: number): T[][] {
    if (parts <= 1) return [items];
    const buckets = Array.from({ length: parts }, () => [] as T[]);
    const shuffled = [...items];

    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    shuffled.forEach((item, index) => {
        buckets[index % parts].push(item);
    });

    return buckets.map((bucket, index) => bucket.length > 0 ? bucket : [shuffled[index % Math.max(1, shuffled.length)]]);
}

export const GalleryPage = ({
    onBack,
    galleryData,
    videosData,
    onRefreshPhotos,
    onAddLocalPhotos,
    onAddLocalVideos,
    onAddGalleryItem,
    onAddVideoItem,
    onDeleteGalleryItem,
    onDeleteVideoItem,
    onUpdateGalleryItem,
    onUpdateVideoItem,
    onAddLocalPhotoFolder,
    onAddLocalVideoFolder,
    localImports = [],
    customPhotoCategories = [],
    customVideoCategories = [],
    onAddPhotoCategory,
    onAddVideoCategory,
    onDeletePhotoCategory,
    onDeleteVideoCategory,
    onlyPhotos = false,
    onlyVideos = false,
    onOverlayChange,
}: {
    onBack: () => void;
    galleryData: GalleryItem[];
    videosData: VideoItem[];
    onRefreshPhotos?: () => Promise<void>;
    onAddLocalPhotos: (cat?: string) => void;
    onAddLocalVideos: (cat?: string) => void;
    onAddGalleryItem?: (item: Omit<GalleryItem, 'id'>) => Promise<void>;
    onAddVideoItem?: (item: Omit<VideoItem, 'id'>) => Promise<void>;
    onDeleteGalleryItem?: (id: string) => Promise<void>;
    onDeleteVideoItem?: (id: string) => Promise<void>;
    onUpdateGalleryItem?: (id: string, item: Partial<GalleryItem>) => Promise<void>;
    onUpdateVideoItem?: (id: string, item: Partial<VideoItem>) => Promise<void>;
    onAddLocalPhotoFolder?: (cat?: string) => void;
    onAddLocalVideoFolder?: (cat?: string) => void;
    localImports: LocalImportConfig[];
    customPhotoCategories?: string[];
    customVideoCategories?: string[];
    onAddPhotoCategory?: (newCat: string) => void;
    onAddVideoCategory?: (newCat: string) => void;
    onDeletePhotoCategory?: (cat: string) => void;
    onDeleteVideoCategory?: (cat: string) => void;
    onlyPhotos?: boolean;
    onlyVideos?: boolean;
    onOverlayChange?: (open: boolean) => void;
}) => {
    useEffect(() => { window.scrollTo(0, 0); }, []);

    // ── Layout ────────────────────────────────────────────────────────────────
    const [layoutMode, setLayoutMode] = useState<'split' | 'photo-full' | 'video-full'>(
        onlyPhotos ? 'photo-full' : (onlyVideos ? 'video-full' : 'split')
    );
    const [photoViewMode, setPhotoViewMode] = useState<'square' | 'masonry'>('square');
    const [videoViewMode, setVideoViewMode] = useState<'square' | 'masonry'>('square');
    const [photoGridDisplayMode, setPhotoGridDisplayMode] = useState<'fill' | 'ratio'>('fill');
    const [videoGridDisplayMode, setVideoGridDisplayMode] = useState<'fill' | 'ratio'>('fill');
    const [photoSortField, setPhotoSortField] = useState<SortField>('shotAt');
    const [photoSortDir, setPhotoSortDir] = useState<SortDir>('desc');
    const [isPhotoFullscreen, setIsPhotoFullscreen] = useState(false);
    const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
    const [photoColumns, setPhotoColumns] = useState(() => window.innerWidth < 640 ? 3 : 5);
    const [videoColumns, setVideoColumns] = useState(() => window.innerWidth < 640 ? 3 : 10);

    // ── Local library assets ─────────────────────────────────────────────────
    const [showFolderInfo, setShowFolderInfo] = useState(false);
    const folderInfoRef = React.useRef<HTMLDivElement>(null);
    const [localPhotos, setLocalPhotos] = useState<GalleryItem[]>([]);
    const [localVideos, setLocalVideos] = useState<VideoItem[]>([]);
    const [localVideoThumbVersionMap, setLocalVideoThumbVersionMap] = useState<Record<number, number>>({});
    const [cloudPhotoCacheMap, setCloudPhotoCacheMap] = useState<Record<string, { src: string; thumbSrc: string }>>({});
    const [cloudThumbSettings, setCloudThumbSettings] = useState<CloudThumbnailSettings>({ longEdge: 960, quality: 85 });
    const [localVideoCacheOptions, setLocalVideoCacheOptions] = useState({ enabled: false, thumbnailEnabled: false });
    const [activeBucketCacheKey, setActiveBucketCacheKey] = useState<string | null>(null);
    const [activeCollectionConfig, setActiveCollectionConfig] = useState<{ id: string | null; name: string; path: string }>({
        id: null,
        name: 'None',
        path: '',
    });
    const [activeLocalLibraryId, setActiveLocalLibraryId] = useState<number | null>(null);
    const [isSwitchingCollection, setIsSwitchingCollection] = useState(false);
    const [isCancellingCollection, setIsCancellingCollection] = useState(false);
    const [collectionScanProgress, setCollectionScanProgress] = useState<{ phase?: string; total: number; current: number; currentFile?: string } | null>(null);
    const [thumbnailProgress, setThumbnailProgress] = useState<number | null>(null);
    const [videoCacheProgress, setVideoCacheProgress] = useState<number | null>(null);
    const [scanRingProgress, setScanRingProgress] = useState<number | null>(null);
    const [localAssetTotal, setLocalAssetTotal] = useState(0);
    const activeLocalLibraryIdRef = React.useRef<number | null>(null);
    const collectionSwitchTokenRef = React.useRef(0);
    const localAssetRefreshTimerRef = React.useRef<number | null>(null);

    useEffect(() => {
        activeLocalLibraryIdRef.current = activeLocalLibraryId;
    }, [activeLocalLibraryId]);

    useEffect(() => {
        if (!isElectron() || !window.electronAPI?.cloudCache) return;

        let mounted = true;
        const loadCacheConfig = async () => {
            try {
                const config = await window.electronAPI!.cloudCache.getConfig();
                if (mounted) {
                    setCloudThumbSettings(config.cloudThumbnail);
                    setLocalVideoCacheOptions({
                        enabled: Boolean(config.localVideo?.enabled),
                        thumbnailEnabled: Boolean(config.localVideo?.thumbnailEnabled),
                    });
                }
            } catch (error) {
                console.warn('[cloud-cache] Failed to read thumbnail settings:', error);
            }
        };

        void loadCacheConfig();
        const handleConfigChanged = (event: Event) => {
            const detail = (event as CustomEvent<{ cloudThumbnail?: CloudThumbnailSettings; localVideo?: { enabled?: boolean; thumbnailEnabled?: boolean } }>).detail;
            if (mounted) {
                setCloudPhotoCacheMap({});
                void loadLocalAssets(activeLocalLibraryIdRef.current);
            }
            if (mounted && detail?.cloudThumbnail) {
                setCloudThumbSettings(detail.cloudThumbnail);
                setLocalVideoCacheOptions(prev => ({
                    enabled: typeof detail?.localVideo?.enabled === 'boolean' ? Boolean(detail.localVideo.enabled) : prev.enabled,
                    thumbnailEnabled: typeof detail?.localVideo?.thumbnailEnabled === 'boolean' ? Boolean(detail.localVideo.thumbnailEnabled) : prev.thumbnailEnabled,
                }));
            } else {
                void loadCacheConfig();
            }
        };
        window.addEventListener('galleryhub:cache-config-changed', handleConfigChanged);

        return () => {
            mounted = false;
            window.removeEventListener('galleryhub:cache-config-changed', handleConfigChanged);
        };
    }, []);

    const loadLocalAssets = async (libraryId?: number | null) => {
        const api = window.electronAPI?.localLibrary;
        if (!api) return null;
        try {
            const targetLibraryId = libraryId === undefined ? activeLocalLibraryIdRef.current : libraryId;
            if (!targetLibraryId) {
                setLocalPhotos([]);
                setLocalVideos([]);
                setLocalAssetTotal(0);
                return { assets: [], photos: [], videos: [] };
            }
            const assets = await api.getAssets({ libraryId: targetLibraryId });
            const { photos, videos } = convertLocalAssets(assets, {
                useVideoCache: localVideoCacheOptions.enabled,
                useVideoCovers: localVideoCacheOptions.thumbnailEnabled,
            });
            setLocalPhotos(photos);
            setLocalVideos(videos);
            setLocalAssetTotal(assets.length);
            return { assets, photos, videos };
        } catch (e) {
            console.warn('[local] Failed to load local assets:', e);
            return null;
        }
    };

    const scheduleLocalAssetRefresh = React.useCallback((libraryId: number) => {
        if (localAssetRefreshTimerRef.current !== null) {
            window.clearTimeout(localAssetRefreshTimerRef.current);
        }
        localAssetRefreshTimerRef.current = window.setTimeout(() => {
            localAssetRefreshTimerRef.current = null;
            void loadLocalAssets(libraryId);
        }, 140);
    }, [loadLocalAssets]);

    useEffect(() => {
        if (isElectron()) loadLocalAssets();
    }, [localVideoCacheOptions.enabled, localVideoCacheOptions.thumbnailEnabled]);

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.bucket) return;

        let mounted = true;
        const loadActiveBucket = async () => {
            try {
                const active = await api.bucket.getActive();
                const profile = active?.profile;
                const nextCacheKey = profile?.r2Bucket?.trim() || null;
                if (mounted) {
                    setActiveBucketCacheKey(nextCacheKey);
                }
            } catch (error) {
                console.warn('[cloud-cache] Failed to read active bucket:', error);
            }
        };

        void loadActiveBucket();
        const unsubscribe = api.onBucketChanged?.(() => {
            void loadActiveBucket();
            setCloudPhotoCacheMap({});
        });

        return () => {
            mounted = false;
            unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.collection) return;

        let mounted = true;
        const loadActiveCollection = async () => {
            try {
                const result = await api.collection!.getActive();
                const collection = result?.collection;
                if (mounted) {
                    setActiveCollectionConfig({
                        id: result?.id ?? null,
                        name: collection?.name || 'None',
                        path: collection?.path || '',
                    });
                }
            } catch (error) {
                console.warn('[collection] Failed to read active collection:', error);
            }
        };

        void loadActiveCollection();
        const unsubscribe = api.onCollectionChanged?.((data) => {
            setActiveCollectionConfig({
                id: data?.id ?? null,
                name: data?.name || 'None',
                path: data?.path || '',
            });
        });

        return () => {
            mounted = false;
            unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        const api = window.electronAPI?.localLibrary;
        if (!api || !isElectron()) return;

        let cancelled = false;
        const syncSelectedCollection = async () => {
            const switchToken = ++collectionSwitchTokenRef.current;
            setIsSwitchingCollection(true);
            setIsCancellingCollection(false);
            setLocalPhotos([]);
            setLocalVideos([]);
            setFolderInfoError(null);
            setThumbnailProgress(null);
            setVideoCacheProgress(null);
            setScanRingProgress(null);
            setLocalAssetTotal(0);

            if (!activeCollectionConfig.path || activeCollectionConfig.id === '__none__') {
                setActiveLocalLibraryId(null);
                if (!cancelled && switchToken === collectionSwitchTokenRef.current) {
                    await loadLocalAssets(null);
                    setIsSwitchingCollection(false);
                }
                return;
            }

            try {
                const result = await api.syncPath({
                    rootPath: activeCollectionConfig.path,
                    name: activeCollectionConfig.name,
                });
                if (cancelled || switchToken !== collectionSwitchTokenRef.current) return;
                if (result?.error || !result?.library?.id) {
                    setFolderInfoError(result?.error || 'Failed to load selected collection.');
                    setIsSwitchingCollection(false);
                    return;
                }
                if (result?.canceled) {
                    setIsSwitchingCollection(false);
                    setIsCancellingCollection(false);
                    return;
                }
                setActiveLocalLibraryId(result.library.id);
                await loadLocalAssets(result.library.id);
                await loadFolderInfo(result.library.id);
            } catch (error: any) {
                if (!cancelled && switchToken === collectionSwitchTokenRef.current) {
                    setFolderInfoError(error?.message || 'Failed to load selected collection.');
                }
            } finally {
                if (!cancelled && switchToken === collectionSwitchTokenRef.current) {
                    setIsSwitchingCollection(false);
                    setIsCancellingCollection(false);
                }
            }
        };

        void syncSelectedCollection();
        return () => {
            cancelled = true;
        };
    }, [activeCollectionConfig]);

    useEffect(() => {
        const api = window.electronAPI?.localLibrary;
        if (!api) return;
        const unsubscribe = api.onScanProgress((data) => {
            if (data.background) {
                if (data.phase === 'thumbnails' && data.libraryId === activeLocalLibraryIdRef.current) {
                    setThumbnailProgress(data.total > 0 ? (data.current / data.total) * 100 : 0);
                } else if (data.phase === 'video-transcode' && data.libraryId === activeLocalLibraryIdRef.current) {
                    setVideoCacheProgress(data.total > 0 ? (data.current / data.total) * 100 : 0);
                } else if (data.phase === 'done' && data.libraryId === activeLocalLibraryIdRef.current) {
                    setThumbnailProgress(null);
                    setVideoCacheProgress(null);
                }
                return;
            }
            setCollectionScanProgress({
                phase: data.phase,
                total: data.total ?? 0,
                current: data.current ?? 0,
                currentFile: data.currentFile,
            });
            if (data.phase === 'done' || data.canceled) {
                setScanRingProgress(null);
            } else if ((data.total ?? 0) > 0) {
                setScanRingProgress((data.current / data.total) * 100);
            } else {
                setScanRingProgress(8);
            }
            if (data.phase === 'done' || data.canceled) {
                setTimeout(() => setCollectionScanProgress(null), 600);
            }
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        const api = window.electronAPI?.localLibrary;
        if (!api?.onThumbnailsUpdated) return;
        const unsubscribe = api.onThumbnailsUpdated(async (data) => {
            if (data.libraryId !== activeLocalLibraryIdRef.current) return;
            setThumbnailProgress(null);
            scheduleLocalAssetRefresh(data.libraryId);
        });
        return unsubscribe;
    }, [scheduleLocalAssetRefresh]);

    useEffect(() => {
        const api = window.electronAPI?.localLibrary as any;
        if (!api?.onVideoCacheUpdated) return;
        const unsubscribe = api.onVideoCacheUpdated(async (data: { libraryId: number; incremental?: boolean }) => {
            if (data.libraryId !== activeLocalLibraryIdRef.current) return;
            if (!data.incremental) {
                setVideoCacheProgress(null);
            }
            scheduleLocalAssetRefresh(data.libraryId);
        });
        return unsubscribe;
    }, [scheduleLocalAssetRefresh]);

    useEffect(() => {
        return () => {
            if (localAssetRefreshTimerRef.current !== null) {
                window.clearTimeout(localAssetRefreshTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const api = window.electronAPI?.localLibrary;
        if (!api?.onLibraryUpdated) return;
        const unsubscribe = api.onLibraryUpdated(async (data) => {
            if (data.libraryId !== activeLocalLibraryIdRef.current) return;
            setLocalAssetTotal(data.totalAssets ?? 0);
            await loadFolderInfo(data.libraryId);
        });
        return unsubscribe;
    }, []);

    // Listen for native menu Import Folder
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.onMenuImportFolder) return;
        const unsub = api.onMenuImportFolder(() => handleLocalImport());
        return () => { unsub?.(); };
    }, []);

    // Listen for native menu View → Photo Gallery / Video Gallery
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.onMenuViewPhotoGallery) return;
        const unsubPhoto = api.onMenuViewPhotoGallery(() => setLayoutMode('photo-full'));
        const unsubVideo = api.onMenuViewVideoGallery(() => setLayoutMode('video-full'));
        return () => { unsubPhoto?.(); unsubVideo?.(); };
    }, []);

    // ── Local library info for Folder Info popover ────────────────────────────
    const [localLibraries, setLocalLibraries] = useState<any[]>([]);
    const [localStatsMap, setLocalStatsMap] = useState<Record<number, any>>({});
    const [localCollectionsMap, setLocalCollectionsMap] = useState<Record<number, any[]>>({});

    const loadFolderInfo = async (libraryId?: number | null) => {
        const api = window.electronAPI?.localLibrary;
        if (!api) return;
        try {
            const allLibs = await api.list();
            const targetLibraryId = libraryId === undefined ? activeLocalLibraryIdRef.current : libraryId;
            const libs = targetLibraryId ? allLibs.filter((lib: any) => lib.id === targetLibraryId) : [];
            setLocalLibraries(libs);
            const stats: Record<number, any> = {};
            const cols: Record<number, any[]> = {};
            for (const lib of libs) {
                stats[lib.id] = await api.stats({ id: lib.id });
                cols[lib.id] = await api.getCollections({ libraryId: lib.id });
            }
            setLocalStatsMap(stats);
            setLocalCollectionsMap(cols);
        } catch {}
    };

    const handleFolderInfo = () => {
        if (showFolderInfo) {
            setShowFolderInfo(false);
        } else {
            loadFolderInfo();
            setShowFolderInfo(true);
        }
    };

    const [isLocalImporting, setIsLocalImporting] = useState(false);

    const handleLocalImport = async () => {
        const api = window.electronAPI?.localLibrary;
        const shellApi = window.electronAPI;
        if (!api || !shellApi || isLocalImporting) return;
        setIsLocalImporting(true);
        try {
            const rootPath = await shellApi.pickDirectory({ title: 'Select Folder to Import' });
            if (!rootPath) return;

            const folderName = rootPath.split(/[\\/]/).filter(Boolean).pop() || 'Imported Folder';
            const result = await api.syncPath({ rootPath, name: folderName });

            if (result?.canceled) return;
            if (result?.error || !result?.library?.id) {
                const message = result?.error || 'Failed to import the selected folder.';
                setFolderInfoError(message);
                setConfirmConfig({
                    isOpen: true,
                    title: 'Import Failed',
                    message,
                    type: 'danger',
                    isAlert: true,
                });
                return;
            }

            const libraryId = result.library.id;
            setActiveCollectionConfig({
                id: rootPath,
                name: result.library.name || folderName,
                path: rootPath,
            });
            setActiveLocalLibraryId(libraryId);
            const loaded = await loadLocalAssets(libraryId);
            await loadFolderInfo(libraryId);
            setFolderInfoError(null);

            const photoCollections = loaded ? [...new Set(loaded.photos.map(item => item.collection).filter(Boolean))] : [];
            const videoCollections = loaded ? [...new Set(loaded.videos.map(item => item.collection).filter(Boolean))] : [];
            setPhotoSelectedCollection(photoCollections.length === 1 ? photoCollections[0] : 'All');
            setPhotoFilter('All');
            setVideoSelectedCollection(videoCollections.length === 1 ? videoCollections[0] : 'All');
            setVideoFilter('All');

            const collectionApi = shellApi.collection;
            if (collectionApi) {
                const existingCollections = await collectionApi.list();
                const existingCollection = existingCollections.find((collection) => collection.path === rootPath);
                if (!existingCollection) {
                    await collectionApi.add({
                    name: result.library.name || folderName,
                    path: rootPath,
                    });
                }
            }

            setConfirmConfig({
                isOpen: true,
                title: loaded && loaded.videos.length === 0 && loaded.photos.length === 0 ? 'No Media Found' : 'Folder Imported',
                message: loaded && loaded.videos.length === 0 && loaded.photos.length === 0
                    ? `No supported photo or video files were found in ${result.library.name || folderName}.`
                    : loaded && loaded.videos.length === 0
                        ? `Loaded ${result.library.name || folderName}, but no videos were found in this folder.`
                        : `Loaded ${result.library.name || folderName} with ${loaded.videos.length} video${loaded.videos.length !== 1 ? 's' : ''}.`,
                type: loaded && loaded.videos.length === 0 && loaded.photos.length === 0 ? 'info' : 'success',
                isAlert: true,
            });
        } catch (e: any) {
            console.error('Import failed:', e);
            setFolderInfoError(e?.message || 'Failed to import the selected folder.');
            setConfirmConfig({
                isOpen: true,
                title: 'Import Failed',
                message: e?.message || 'Failed to import the selected folder.',
                type: 'danger',
                isAlert: true,
            });
        } finally {
            setIsLocalImporting(false);
        }
    };

    const [folderInfoBusy, setFolderInfoBusy] = useState<number | null>(null);
    const [folderInfoError, setFolderInfoError] = useState<string | null>(null);

    const handleOpenFolder = (rootPath: string) => {
        window.electronAPI?.showInFolder(rootPath);
    };

    const handleRescanLibrary = async (libId: number) => {
        const api = window.electronAPI?.localLibrary;
        if (!api || folderInfoBusy !== null) return;
        setFolderInfoBusy(libId);
        setFolderInfoError(null);
        try {
            const report = await api.checkConsistency({ id: libId });
            if (!report) { setFolderInfoError('Library not found'); return; }
            const totalDiffs = report.missing.length + report.newFiles.length + report.modified.length + report.moved.length;
            if (totalDiffs > 0) {
                await api.repairConsistency({ libraryId: libId, report });
            }
            await loadLocalAssets(libId === activeLocalLibraryIdRef.current ? libId : undefined);
            await loadFolderInfo(libId === activeLocalLibraryIdRef.current ? libId : undefined);
        } catch (e: any) {
            setFolderInfoError(e.message);
        } finally {
            setFolderInfoBusy(null);
        }
    };

    const handleRemoveLibrary = async (lib: any) => {
        const api = window.electronAPI?.localLibrary;
        if (!api || folderInfoBusy !== null) return;
        if (!confirm(`Remove "${lib.name}" from index?\n\nYour files on disk will NOT be deleted.`)) return;
        setFolderInfoBusy(lib.id);
        try {
            await api.delete({ id: lib.id });
            await loadLocalAssets(lib.id === activeLocalLibraryIdRef.current ? null : undefined);
            await loadFolderInfo(lib.id === activeLocalLibraryIdRef.current ? null : undefined);
        } catch (e: any) {
            setFolderInfoError(e.message);
        } finally {
            setFolderInfoBusy(null);
        }
    };

    // ── Slideshow ─────────────────────────────────────────────────────────────
    const [activeSlideshow, setActiveSlideshow] = useState<{ type: 'photo' | 'video'; mode: SlideshowMode | 'cascade'; data: any[] } | null>(null);
    const [slideshowDisplayPicker, setSlideshowDisplayPicker] = useState<{
        open: boolean;
        displays: Array<{ id: number; label: string; isPrimary: boolean; bounds: { x: number; y: number; width: number; height: number } }>;
        pending: SlideshowSelection | null;
    }>({ open: false, displays: [], pending: null });

    // ── Photo state ───────────────────────────────────────────────────────────
    const [photoSelectedCollection, setPhotoSelectedCollection] = useState('All');
    const [photoFilter, setPhotoFilter] = useState('All');
    const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
    const [photoLightboxIndex, setPhotoLightboxIndex] = useState(-1);
    const [isPhotoLightboxActionBusy, setIsPhotoLightboxActionBusy] = useState(false);
    const lightboxMoveContextRef = useRef<{ itemId: string; nextIndex: number; remainingCount: number } | null>(null);
    const [photoItemDeleteMode, setPhotoItemDeleteMode] = useState(false);
    const [photoFavorites, setPhotoFavorites] = useState<Set<string>>(new Set());
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isPhotoRefreshing, setIsPhotoRefreshing] = useState(false);
    const [isVideoRefreshing, setIsVideoRefreshing] = useState(false);
    const [visibleVideoLocalAssetIds, setVisibleVideoLocalAssetIds] = useState<number[]>([]);

    // ── Video state ───────────────────────────────────────────────────────────
    const [videoSelectedCollection, setVideoSelectedCollection] = useState('All');
    const [videoFilter, setVideoFilter] = useState('All');
    const [videoMenuOpen, setVideoMenuOpen] = useState(false);
    const [videoItemDeleteMode, setVideoItemDeleteMode] = useState(false);
    const [videoFavorites, setVideoFavorites] = useState<Set<string>>(new Set());
    const [isVideoSelectMode, setIsVideoSelectMode] = useState(false);
    const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
    const [isVideoLightboxActionBusy, setIsVideoLightboxActionBusy] = useState(false);
    const videoLightboxMoveContextRef = useRef<{ itemId: string; nextIndex: number; remainingCount: number } | null>(null);

    // ── Duplicate scan ────────────────────────────────────────────────────────
    const [isScanning, setIsScanning] = useState(false);
    const [scanResults, setScanResults] = useState<ScanResultGroup[]>([]);
    const [scanType, setScanType] = useState<'photo' | 'video' | null>(null);
    const [showScanModal, setShowScanModal] = useState(false);

    // ── Theater mode ──────────────────────────────────────────────────────────
    const [videoTheaterMode, setVideoTheaterMode] = useState(false);
    const [activeVideoIndex, setActiveVideoIndex] = useState(0);

    // ── Notify parent when any overlay opens/closes ───────────────────────────
    useEffect(() => {
        onOverlayChange?.(photoLightboxIndex >= 0 || videoTheaterMode || !!activeSlideshow);
    }, [photoLightboxIndex, videoTheaterMode, activeSlideshow]);

    // ── Bulk action modal ─────────────────────────────────────────────────────
    const [actionModal, setActionModal] = useState<{ isOpen: boolean; type: 'move' | 'copy' | null }>({ isOpen: false, type: null });

    // ── Right-click context menu ─────────────────────────────────────────────
    const [contextMenu, setContextMenu] = useState<{ id: string; kind: 'photo' | 'video'; x: number; y: number } | null>(null);

    // ── Confirm/alert modal ───────────────────────────────────────────────────
    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'danger' | 'info' | 'success';
        onConfirm?: () => void;
        isAlert?: boolean;
        confirmText?: string;
        extraAction?: { label: string; onClick: () => void; icon?: React.ReactNode };
    }>({ isOpen: false, title: '', message: '', type: 'danger' });

    // ── Photo upload modal ────────────────────────────────────────────────────
    const photoFileInputRef = useRef<HTMLInputElement>(null);
    const [showPhotoUploadModal, setShowPhotoUploadModal] = useState(false);
    const [photoUploadFiles, setPhotoUploadFiles] = useState<File[]>([]);
    const [photoFilePreviews, setPhotoFilePreviews] = useState<string[]>([]);
    const [photoUploadCollection, setPhotoUploadCollection] = useState('Collection');
    const [photoCustomCollectionInput, setPhotoCustomCollectionInput] = useState('');
    const [photoUploadAlbum, setPhotoUploadAlbum] = useState('');
    const [photoCustomAlbumInput, setPhotoCustomAlbumInput] = useState('');
    const [photoUploadStatuses, setPhotoUploadStatuses] = useState<FileUploadStatus[]>([]);
    const [isPhotoUploading, setIsPhotoUploading] = useState(false);
    const [photoUploadResult, setPhotoUploadResult] = useState<{ type: 'success' | 'partial' | 'error'; title: string; message: string } | null>(null);
    const [photoUploadFormError, setPhotoUploadFormError] = useState<string | null>(null);
    const [photoUploadImageSettings, setPhotoUploadImageSettings] = useState<UploadImageSettings>({
        resizeEnabled: true,
        maxLongEdge: 1920,
        jpegQuality: 0.93,
    });

    const openPhotoUploadModal = () => {
        const defaultCol = photoSelectedCollection !== 'All' ? photoSelectedCollection : (photoCollectionOptions[0] || 'Collection');
        const defaultAlb = (photoFilter !== 'All' && photoFilter !== 'Favorites') ? photoFilter : '';
        setPhotoUploadCollection(defaultCol);
        setPhotoCustomCollectionInput('');
        setPhotoUploadAlbum(defaultAlb);
        setPhotoCustomAlbumInput('');
        setPhotoUploadFormError(null);
        setPhotoUploadFiles([]);
        setPhotoFilePreviews([]);
        setPhotoUploadStatuses([]);
        setPhotoUploadImageSettings({ resizeEnabled: true, maxLongEdge: 1920, jpegQuality: 0.93 });
        setShowPhotoUploadModal(true);
    };

    const handlePhotoCloudUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (photoUploadFiles.length === 0 || !onAddGalleryItem) return;
        const finalCollection = (photoCustomCollectionInput.trim() || photoUploadCollection).trim();
        const finalAlbum = (photoCustomAlbumInput.trim() || photoUploadAlbum || albumsForPhotoUploadCol[0] || '').trim();
        const collectionError = validateFacetInput('Collection', finalCollection);
        if (collectionError) { setPhotoUploadFormError(collectionError); return; }
        const albumError = validateFacetInput('Album', finalAlbum);
        if (albumError) { setPhotoUploadFormError(albumError); return; }
        setPhotoUploadFormError(null);
        setIsPhotoUploading(true);
        try {
            const statuses = await uploadFilesToR2(
                photoUploadFiles,
                (index, status) => setPhotoUploadStatuses(prev => { const n = [...prev]; n[index] = status; return n; }),
                3,
                { collection: finalCollection, category: finalAlbum, imageSettings: photoUploadImageSettings }
            );
            const successfulItems = statuses.filter(s => s.status === 'complete' && s.secureUrl).map(s => ({
                src: s.secureUrl!,
                title: s.file.name.replace(/\.[^/.]+$/, ''),
                category: finalAlbum,
                collection: finalCollection,
                album: finalAlbum,
                sizeBytes: s.sizeBytes ?? s.file.size,
                ...(s.exif && { exif: s.exif }),
            }));
            let dbSaveFailures = 0;
            if (successfulItems.length > 0) {
                const dbResults = await Promise.allSettled(successfulItems.map(item => onAddGalleryItem!(item)));
                dbSaveFailures = dbResults.filter(r => r.status === 'rejected').length;
                setPhotoSelectedCollection(finalCollection);
                setPhotoFilter(finalAlbum);
            }
            const failedCount = statuses.filter(s => s.status === 'error').length;
            setPhotoUploadFiles([]);
            setPhotoUploadStatuses([]);
            setPhotoCustomCollectionInput('');
            setPhotoCustomAlbumInput('');
            setShowPhotoUploadModal(false);
            const savedCount = successfulItems.length - dbSaveFailures;
            if (failedCount > 0 && successfulItems.length === 0) {
                setPhotoUploadResult({ type: 'error', title: 'Upload Failed', message: `All ${failedCount} file(s) failed to upload.` });
            } else if (failedCount > 0 || dbSaveFailures > 0) {
                setPhotoUploadResult({ type: 'partial', title: 'Upload Completed with Errors', message: `${savedCount} saved, ${failedCount + dbSaveFailures} failed.` });
            } else {
                setPhotoUploadResult({ type: 'success', title: 'Upload Complete', message: `Successfully uploaded ${successfulItems.length} photo(s) to ${finalCollection} / ${finalAlbum}.` });
            }
        } catch (error: any) {
            setShowPhotoUploadModal(false);
            setPhotoUploadResult({ type: 'error', title: 'Upload Failed', message: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsPhotoUploading(false);
        }
    };

    // ── Video upload modal ────────────────────────────────────────────────────
    const videoFileInputRef = useRef<HTMLInputElement>(null);
    const [showVideoUploadModal, setShowVideoUploadModal] = useState(false);
    const [videoUploadFiles, setVideoUploadFiles] = useState<File[]>([]);
    const [videoUploadTitle, setVideoUploadTitle] = useState('');
    const [videoUploadDesc, setVideoUploadDesc] = useState('');
    const [videoUploadCollection, setVideoUploadCollection] = useState('Collection');
    const [videoCustomCollectionInput, setVideoCustomCollectionInput] = useState('');
    const [videoUploadAlbum, setVideoUploadAlbum] = useState('');
    const [videoCustomAlbumInput, setVideoCustomAlbumInput] = useState('');
    const [videoUploadStatuses, setVideoUploadStatuses] = useState<FileUploadStatus[]>([]);
    const [isVideoUploadRunning, setIsVideoUploadRunning] = useState(false);
    const [videoUploadResult, setVideoUploadResult] = useState<{ type: 'success' | 'partial' | 'error'; title: string; message: string } | null>(null);
    const [videoUploadFormError, setVideoUploadFormError] = useState<string | null>(null);

    const openVideoUploadModal = () => {
        const defaultCol = videoSelectedCollection !== 'All' ? videoSelectedCollection : (videoCollectionOptions[0] || 'Collection');
        const defaultAlb = (videoFilter !== 'All' && videoFilter !== 'Favorites') ? videoFilter : '';
        setVideoUploadCollection(defaultCol);
        setVideoCustomCollectionInput('');
        setVideoUploadAlbum(defaultAlb);
        setVideoCustomAlbumInput('');
        setVideoUploadFormError(null);
        setVideoUploadFiles([]);
        setVideoUploadTitle('');
        setVideoUploadDesc('');
        setVideoUploadStatuses([]);
        setShowVideoUploadModal(true);
    };

    const handleVideoCloudUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (videoUploadFiles.length === 0 || !onAddVideoItem) return;
        const finalCollection = (videoCustomCollectionInput.trim() || videoUploadCollection).trim();
        const finalAlbum = (videoCustomAlbumInput.trim() || videoUploadAlbum || albumsForVideoUploadCol[0] || '').trim();
        const collectionError = validateFacetInput('Collection', finalCollection);
        if (collectionError) { setVideoUploadFormError(collectionError); return; }
        const albumError = validateFacetInput('Album', finalAlbum);
        if (albumError) { setVideoUploadFormError(albumError); return; }
        setVideoUploadFormError(null);
        setIsVideoUploadRunning(true);
        try {
            const statuses = await uploadFilesToR2(
                videoUploadFiles,
                (index, status) => setVideoUploadStatuses(prev => { const n = [...prev]; n[index] = status; return n; }),
                3,
                { collection: finalCollection, category: finalAlbum }
            );
            const successfulItems = statuses.filter(s => s.status === 'complete' && s.secureUrl).map((s, idx) => ({
                video: s.secureUrl!,
                title: (videoUploadTitle.trim() && videoUploadFiles.length === 1) ? videoUploadTitle.trim() : s.file.name.replace(/\.[^/.]+$/, '') || `Video ${idx + 1}`,
                desc: videoUploadDesc.trim() || 'Uploaded video',
                category: finalAlbum,
                collection: finalCollection,
                album: finalAlbum,
            }));
            let dbSaveFailures = 0;
            if (successfulItems.length > 0) {
                const dbResults = await Promise.allSettled(successfulItems.map(item => onAddVideoItem!(item)));
                dbSaveFailures = dbResults.filter(r => r.status === 'rejected').length;
                setVideoSelectedCollection(finalCollection);
                setVideoFilter(finalAlbum);
            }
            const failedCount = statuses.filter(s => s.status === 'error').length;
            setVideoUploadFiles([]);
            setVideoUploadStatuses([]);
            setVideoUploadTitle('');
            setVideoUploadDesc('');
            setVideoCustomCollectionInput('');
            setVideoCustomAlbumInput('');
            setShowVideoUploadModal(false);
            const savedCount = successfulItems.length - dbSaveFailures;
            if (failedCount > 0 && successfulItems.length === 0) {
                setVideoUploadResult({ type: 'error', title: 'Upload Failed', message: `All ${failedCount} upload(s) failed.` });
            } else if (failedCount > 0 || dbSaveFailures > 0) {
                setVideoUploadResult({ type: 'partial', title: 'Upload Completed with Errors', message: `${savedCount} saved, ${failedCount + dbSaveFailures} failed.` });
            } else {
                setVideoUploadResult({ type: 'success', title: 'Upload Complete', message: `${successfulItems.length} video(s) uploaded to ${finalCollection} / ${finalAlbum}.` });
            }
        } catch (error: any) {
            setShowVideoUploadModal(false);
            setVideoUploadResult({ type: 'error', title: 'Upload Failed', message: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsVideoUploadRunning(false);
        }
    };

    // ── Add URL modal ─────────────────────────────────────────────────────────
    const [addUrlModal, setAddUrlModal] = useState<{
        type: 'photo' | 'video';
        url: string;
        title: string;
        collection: string;
        album: string;
    } | null>(null);

    // ── Load favorites ────────────────────────────────────────────────────────
    useEffect(() => {
        try {
            const pf = localStorage.getItem('my_photo_favorites');
            if (pf) setPhotoFavorites(new Set(JSON.parse(pf)));
        } catch (e) {}
        try {
            const vf = localStorage.getItem('my_video_favorites');
            if (vf) setVideoFavorites(new Set(JSON.parse(vf)));
        } catch (e) {}
    }, []);

    // ── Favorites handlers ────────────────────────────────────────────────────
    const togglePhotoFavorite = (id: string) => {
        const next = new Set(photoFavorites);
        if (next.has(id)) next.delete(id); else next.add(id);
        setPhotoFavorites(next);
        localStorage.setItem('my_photo_favorites', JSON.stringify([...next]));
    };
    const toggleVideoFavorite = (id: string) => {
        const next = new Set(videoFavorites);
        if (next.has(id)) next.delete(id); else next.add(id);
        setVideoFavorites(next);
        localStorage.setItem('my_video_favorites', JSON.stringify([...next]));
    };

    // ── Derived: normalized + two-level (merges remote + local) ──────────────
    const normalizedPhotos = [
        ...galleryData.map(p => {
            const normalized = normalizePhoto({ ...p, sourceType: p.sourceType || 'remote' });
            const cached = cloudPhotoCacheMap[p.src];
            return cached
                ? { ...normalized, src: cached.src, thumbSrc: cached.thumbSrc }
                : { ...normalized, thumbSrc: getOptimizedThumbnailUrl(normalized.src, cloudThumbSettings) };
        }),
        ...localPhotos.map(p => normalizePhoto(p)),
    ];
    const normalizedVideos = [
        ...videosData.map(v => normalizeVideo({ ...v, sourceType: v.sourceType || 'remote' })),
        ...localVideos.map(v => {
            const normalized = normalizeVideo(v);
            const localAssetId = normalized.localAssetId;
            const version = typeof localAssetId === 'number' ? localVideoThumbVersionMap[localAssetId] : undefined;
            if (version && normalized.thumbSrc) {
                const separator = normalized.thumbSrc.includes('?') ? '&' : '?';
                return { ...normalized, thumbSrc: `${normalized.thumbSrc}${separator}v=${version}` };
            }
            return normalized;
        }),
    ];

    useEffect(() => {
        if (!isElectron() || !window.electronAPI?.cloudCache || galleryData.length === 0 || !activeBucketCacheKey) return;

        let cancelled = false;
        const pending = new Set<string>();
        const remotePhotos = galleryData.filter(photo => !!photo.src);
        const concurrency = 2;
        let cursor = 0;

        const localMediaUrl = (filePath: string) => `/api/local-media?path=${encodeURIComponent(filePath)}`;

        const worker = async () => {
            while (!cancelled && cursor < remotePhotos.length) {
                const item = remotePhotos[cursor++];
                if (!item?.src || cloudPhotoCacheMap[item.src] || pending.has(item.src)) continue;

                pending.add(item.src);
                try {
                    const result = await window.electronAPI!.cloudCache.ensurePhoto({
                        url: item.src,
                        bucket: activeBucketCacheKey,
                        collection: item.collection,
                        album: item.album || item.category,
                        title: item.title,
                    });
                    if (!cancelled) {
                        setCloudPhotoCacheMap(prev => (
                            prev[item.src]
                                ? prev
                                : {
                                    ...prev,
                                    [item.src]: {
                                        src: localMediaUrl(result.originalPath),
                                        thumbSrc: localMediaUrl(result.thumbPath),
                                    },
                                }
                        ));
                    }
                } catch (error) {
                    console.warn('[cloud-cache] Failed to cache photo:', item.title || item.src, error);
                } finally {
                    pending.delete(item.src);
                }
            }
        };

        const workers = Array.from({ length: Math.min(concurrency, remotePhotos.length) }, () => worker());
        void Promise.all(workers);

        return () => {
            cancelled = true;
        };
    }, [galleryData, cloudPhotoCacheMap, activeBucketCacheKey]);

    const photoCollections = ['All', ...uniqueFacetValues(normalizedPhotos.map(i => i.collection))];
    const videoCollections = ['All', ...uniqueFacetValues(normalizedVideos.map(v => v.collection))];

    // ── Upload modal derived ──────────────────────────────────────────────────
    const photoCollectionOptions = photoCollections.filter(c => c !== 'All');
    const albumsForPhotoUploadCol = Array.from(new Set(
        normalizedPhotos
            .filter(i => normalizeFacetKey(i.collection) === normalizeFacetKey(photoUploadCollection))
            .map(i => i.album)
    )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const videoCollectionOptions = videoCollections.filter(c => c !== 'All');
    const albumsForVideoUploadCol = Array.from(new Set(
        normalizedVideos
            .filter(v => normalizeFacetKey(v.collection) === normalizeFacetKey(videoUploadCollection))
            .map(v => v.album)
    )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const currentPhotoItems = photoSelectedCollection === 'All'
        ? normalizedPhotos
        : normalizedPhotos.filter(i => normalizeFacetKey(i.collection) === normalizeFacetKey(photoSelectedCollection));
    const currentVideoItems = videoSelectedCollection === 'All'
        ? normalizedVideos
        : normalizedVideos.filter(v => normalizeFacetKey(v.collection) === normalizeFacetKey(videoSelectedCollection));

    const photoAlbums = uniqueFacetValues(currentPhotoItems.map(i => i.album));
    const videoAlbums = uniqueFacetValues(currentVideoItems.map(v => v.album));

    const photoCollectionAlbums = normalizedPhotos.map(i => ({ collection: i.collection, album: i.album }));
    const videoCollectionAlbums = normalizedVideos.map(v => ({ collection: v.collection, album: v.album }));

    const filteredPhotosUnsorted = photoFilter === 'All'
        ? currentPhotoItems
        : photoFilter === 'Favorites'
            ? currentPhotoItems.filter(i => i.id && photoFavorites.has(i.id))
            : currentPhotoItems.filter(i => normalizeFacetKey(i.album) === normalizeFacetKey(photoFilter));
    const filteredPhotos = sortGalleryItems(filteredPhotosUnsorted, photoSortField, photoSortDir);

    const filteredVideos = videoFilter === 'All'
        ? currentVideoItems
        : videoFilter === 'Favorites'
            ? currentVideoItems.filter(v => v.id && videoFavorites.has(v.id))
            : currentVideoItems.filter(v => normalizeFacetKey(v.album) === normalizeFacetKey(videoFilter));

    const photoAlbumCountLabel = photoFilter === 'All' ? 'All Photos' : photoFilter === 'Favorites' ? 'Favorite Photos' : 'Photos';
    const videoAlbumCountLabel = videoFilter === 'All' ? 'All Videos' : videoFilter === 'Favorites' ? 'Favorite Videos' : 'Videos';
    const effectivePhotoAlbumCount = filteredPhotos.length;

    const remotePhotos = normalizedPhotos.filter(i => i.sourceType !== 'local');
    const remoteVideos = normalizedVideos.filter(v => v.sourceType !== 'local');

    const cloudStructureMap = new Map<string, CollectionStructureRow>();
    for (const item of [...remotePhotos, ...remoteVideos]) {
        const key = `${normalizeFacetKey(item.collection)}__${normalizeFacetKey(item.album)}`;
        const existing = cloudStructureMap.get(key);
        if (existing) {
            existing.count += 1;
            existing.sizeBytes += item.sizeBytes ?? 0;
        } else {
            cloudStructureMap.set(key, {
                collection: item.collection,
                album: item.album,
                count: 1,
                sizeBytes: item.sizeBytes ?? 0,
            });
        }
    }

    const cloudSection: CollectionInfoSection | null = (remotePhotos.length + remoteVideos.length) > 0 ? {
        id: 'cloud',
        title: 'Cloud',
        subtitle: 'Remote assets',
        totalFiles: remotePhotos.length + remoteVideos.length,
        totalPhotos: remotePhotos.length,
        totalVideos: remoteVideos.length,
        totalSizeBytes: [...remotePhotos, ...remoteVideos].reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
        structure: [...cloudStructureMap.values()].sort((a, b) => {
            const byCollection = a.collection.localeCompare(b.collection, undefined, { sensitivity: 'base' });
            return byCollection !== 0 ? byCollection : a.album.localeCompare(b.album, undefined, { sensitivity: 'base' });
        }),
    } : null;

    const localSections: CollectionInfoSection[] = localLibraries.map(lib => {
        const stats = localStatsMap[lib.id];
        const structure = ((localCollectionsMap[lib.id] || []) as CollectionStructureRow[]).slice().sort((a, b) => {
            const byCollection = a.collection.localeCompare(b.collection, undefined, { sensitivity: 'base' });
            return byCollection !== 0 ? byCollection : a.album.localeCompare(b.album, undefined, { sensitivity: 'base' });
        });

        return {
            id: `local-${lib.id}`,
            title: lib.name,
            subtitle: lib.rootPath,
            totalFiles: stats?.totalAssets ?? structure.reduce((sum, row) => sum + row.count, 0),
            totalPhotos: stats?.totalImages ?? 0,
            totalVideos: stats?.totalVideos ?? 0,
            totalSizeBytes: stats?.totalSizeBytes ?? structure.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0),
            structure,
            actions: (
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-200">
                    <button onClick={() => handleOpenFolder(lib.rootPath)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg transition-colors" title="Open in Explorer">
                        <FolderOpen size={13} /> Open
                    </button>
                    <button onClick={() => handleRescanLibrary(lib.id)} disabled={folderInfoBusy !== null} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-cyan-700 hover:bg-cyan-50 rounded-lg transition-colors disabled:opacity-30" title="Rescan">
                        <RefreshCw size={13} className={folderInfoBusy === lib.id ? 'animate-spin' : ''} /> {folderInfoBusy === lib.id ? 'Scanning...' : 'Rescan'}
                    </button>
                    <button onClick={() => handleRemoveLibrary(lib)} disabled={folderInfoBusy !== null} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30" title="Remove from index">
                        <Trash2 size={13} /> Remove
                    </button>
                </div>
            ),
        };
    });

    const hasLocalCollectionInfo = localSections.length > 0;
    const hasCloudCollectionInfo = !!cloudSection;

    useEffect(() => {
        if (photoSelectedCollection !== 'All' && !photoCollections.includes(photoSelectedCollection)) {
            setPhotoSelectedCollection('All');
            setPhotoFilter('All');
        }
    }, [photoCollections, photoSelectedCollection]);

    useEffect(() => {
        if (photoFilter !== 'All' && photoFilter !== 'Favorites' && !photoAlbums.includes(photoFilter)) {
            setPhotoFilter('All');
        }
    }, [photoAlbums, photoFilter]);

    useEffect(() => {
        if (videoSelectedCollection !== 'All' && !videoCollections.includes(videoSelectedCollection)) {
            setVideoSelectedCollection('All');
            setVideoFilter('All');
        }
    }, [videoCollections, videoSelectedCollection]);

    useEffect(() => {
        if (videoFilter !== 'All' && videoFilter !== 'Favorites' && !videoAlbums.includes(videoFilter)) {
            setVideoFilter('All');
        }
    }, [videoAlbums, videoFilter]);

    useEffect(() => {
        const validPhotoIds = new Set(normalizedPhotos.map(i => i.id).filter(Boolean) as string[]);
        setSelectedIds(prev => {
            const next = new Set([...prev].filter(id => validPhotoIds.has(id)));
            return next.size === prev.size ? prev : next;
        });
        setPhotoFavorites(prev => {
            const next = new Set([...prev].filter(id => validPhotoIds.has(id)));
            if (next.size !== prev.size) {
                localStorage.setItem('my_photo_favorites', JSON.stringify([...next]));
                return next;
            }
            return prev;
        });
    }, [normalizedPhotos]);

    useEffect(() => {
        const validVideoIds = new Set(normalizedVideos.map(v => v.id).filter(Boolean) as string[]);
        setSelectedVideoIds(prev => {
            const next = new Set([...prev].filter(id => validVideoIds.has(id)));
            return next.size === prev.size ? prev : next;
        });
        setVideoFavorites(prev => {
            const next = new Set([...prev].filter(id => validVideoIds.has(id)));
            if (next.size !== prev.size) {
                localStorage.setItem('my_video_favorites', JSON.stringify([...next]));
                return next;
            }
            return prev;
        });
    }, [normalizedVideos]);

    const handleRefreshPhotos = async () => {
        if (!onRefreshPhotos || isPhotoRefreshing) return;
        setIsPhotoRefreshing(true);
        try {
            await onRefreshPhotos();
        } catch (error: any) {
            setConfirmConfig({
                isOpen: true,
                title: 'Refresh Failed',
                message: error?.message || 'Could not reload photos from server.',
                type: 'danger',
                isAlert: true,
            });
        } finally {
            setIsPhotoRefreshing(false);
        }
    };

    const handleRefreshVisibleVideos = async () => {
        if (isVideoRefreshing || !window.electronAPI?.localLibrary) return;

        const assetIds = Array.from(new Set(visibleVideoLocalAssetIds.filter((id) => Number.isInteger(id) && id > 0)));
        if (assetIds.length === 0) return;

        setIsVideoRefreshing(true);
        try {
            const result = await window.electronAPI.localLibrary.refreshVideoThumbnails({ assetIds });
            const version = Date.now();
            setLocalVideoThumbVersionMap((prev) => {
                const next = { ...prev };
                for (const assetId of result.assetIds) next[assetId] = version;
                return next;
            });
            await loadLocalAssets(activeLocalLibraryIdRef.current);
        } catch (error: any) {
            setConfirmConfig({
                isOpen: true,
                title: 'Refresh Failed',
                message: error?.message || 'Could not rebuild visible video thumbnails.',
                type: 'danger',
                isAlert: true,
            });
        } finally {
            setIsVideoRefreshing(false);
        }
    };

    const buildExportCompleteConfig = (count: number, directoryPath: string | null) => ({
        isOpen: true,
        title: 'Export Complete',
        message: `Saved ${count} files.`,
        type: 'success' as const,
        isAlert: true,
        extraAction: directoryPath
            ? {
                label: 'Open Folder',
                onClick: () => { void window.electronAPI?.openPath?.(directoryPath); },
                icon: <FolderOpen size={16} />,
            }
            : undefined,
    });

    // ── Duplicate scan ────────────────────────────────────────────────────────
    const getItemUrl = (item: GalleryItem | VideoItem, type: 'photo' | 'video'): string =>
        type === 'photo' ? (item as GalleryItem).src : (item as VideoItem).video;

    const getDeclaredItemSize = (item: GalleryItem | VideoItem): number => {
        const declaredSize = (item as GalleryItem | VideoItem).sizeBytes;
        return typeof declaredSize === 'number' && declaredSize > 0 ? declaredSize : 0;
    };

    const parseContentRangeSize = (value: string | null): number => {
        if (!value) return 0;
        const match = value.match(/\/(\d+)$/);
        return match ? Number(match[1]) : 0;
    };

    const fetchContentLength = async (url: string): Promise<number> => {
        const init: RequestInit = url.startsWith('/api/local-media')
            ? { method: 'HEAD' }
            : { method: 'HEAD', mode: 'cors' };

        const res = await fetch(url, init);
        const header = res.headers.get('content-length');
        return header ? parseInt(header, 10) : 0;
    };

    const fetchBlobSize = async (url: string): Promise<number> => {
        const res = await fetch(url, url.startsWith('/api/local-media') ? undefined : { mode: 'cors' });
        const blob = await res.blob();
        return blob.size;
    };

    const resolveDuplicateScanSize = async (item: GalleryItem | VideoItem, type: 'photo' | 'video'): Promise<number> => {
        const declaredSize = getDeclaredItemSize(item);
        if (declaredSize > 0) return declaredSize;

        const url = getItemUrl(item, type);
        if (!url) return 0;

        if (url.startsWith('blob:')) {
            const blob = await (await fetch(url)).blob();
            return blob.size;
        }

        try {
            const headSize = await fetchContentLength(url);
            if (headSize > 0) return headSize;
        } catch (error) {
            console.warn(`HEAD size lookup failed for ${item.title}`, error);
        }

        // Some hosts omit or hide content-length, so fall back to fetching the blob.
        try {
            const blobSize = await fetchBlobSize(url);
            if (blobSize > 0) return blobSize;
        } catch (error) {
            console.warn(`Blob size lookup failed for ${item.title}`, error);
        }

        try {
            const res = await fetch(url, url.startsWith('/api/local-media') ? undefined : { mode: 'cors' });
            const contentRangeSize = parseContentRangeSize(res.headers.get('content-range'));
            if (contentRangeSize > 0) return contentRangeSize;
            const contentLength = res.headers.get('content-length');
            return contentLength ? parseInt(contentLength, 10) : 0;
        } catch (error) {
            console.warn(`Final size lookup failed for ${item.title}`, error);
            return 0;
        }
    };

    const handleScanDuplicates = async (type: 'photo' | 'video') => {
        const items = type === 'photo' ? filteredPhotos : filteredVideos;
        if (items.length === 0) {
            setConfirmConfig({ isOpen: true, title: 'Nothing to Scan', message: `No ${type}s in the current view.`, type: 'info', isAlert: true });
            return;
        }
        setIsScanning(true);
        setScanType(type);
        setScanResults([]);
        const sizeMap = new Map<number, (VideoItem | GalleryItem)[]>();
        try {
            for (const item of items) {
                try {
                    const size = await resolveDuplicateScanSize(item, type);
                    if (size > 0) {
                        if (!sizeMap.has(size)) sizeMap.set(size, []);
                        sizeMap.get(size)!.push(item);
                    }
                } catch (e) {
                    console.warn(`Could not check size for ${item.title}`, e);
                }
            }
            const duplicates: ScanResultGroup[] = [];
            sizeMap.forEach((groupItems, size) => {
                if (groupItems.length > 1) duplicates.push({ size, formattedSize: `${size.toLocaleString()} bytes`, items: groupItems });
            });
            duplicates.sort((a, b) => b.size - a.size);
            setScanResults(duplicates);
            setShowScanModal(true);
        } catch (err) {
            console.error(err);
            setConfirmConfig({ isOpen: true, title: 'Scan Failed', message: 'An error occurred during duplicate scan.', type: 'danger', isAlert: true });
        } finally {
            setIsScanning(false);
        }
    };

    // ── Theater mode ──────────────────────────────────────────────────────────
    const openTheater = (index: number) => {
        videoLightboxMoveContextRef.current = null;
        setIsVideoLightboxActionBusy(false);
        setActiveVideoIndex(index);
        setVideoTheaterMode(true);
    };
    const closeTheater = () => {
        videoLightboxMoveContextRef.current = null;
        setIsVideoLightboxActionBusy(false);
        setVideoTheaterMode(false);
    };

    // ── Selection ─────────────────────────────────────────────────────────────
    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };
    const toggleVideoSelection = (id: string) => {
        const next = new Set(selectedVideoIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedVideoIds(next);
    };
    const clearSelection = () => {
        setSelectedIds(new Set()); setIsSelectMode(false);
        setSelectedVideoIds(new Set()); setIsVideoSelectMode(false);
    };

    // ── Bulk action ───────────────────────────────────────────────────────────
    const openActionModal = (type: 'move' | 'copy') => setActionModal({ isOpen: true, type });
    const closeActionModal = () => {
        setActionModal({ isOpen: false, type: null });
        lightboxMoveContextRef.current = null;
        setIsPhotoLightboxActionBusy(false);
        videoLightboxMoveContextRef.current = null;
        setIsVideoLightboxActionBusy(false);
    };

    const handleCancelCollectionLoad = async () => {
        if (!window.electronAPI?.localLibrary || isCancellingCollection) return;
        setIsCancellingCollection(true);
        collectionSwitchTokenRef.current += 1;
        try {
            await window.electronAPI.localLibrary.cancelCurrentScan();
        } catch {}
        setActiveLocalLibraryId(null);
        setLocalPhotos([]);
        setLocalVideos([]);
        setIsSwitchingCollection(false);
        setIsCancellingCollection(false);
    };

    const computeNextLightboxIndex = (currentIndex: number, total: number): number => {
        if (total <= 1) return -1;
        return currentIndex >= total - 1 ? total - 2 : currentIndex;
    };

    const finalizePhotoLightboxAdvance = (currentIndex: number, total: number) => {
        const nextIndex = computeNextLightboxIndex(currentIndex, total);
        setPhotoLightboxIndex(nextIndex);
    };

    const executeBulkAction = async (
        collection: string,
        album: string,
        options?: { preserveFolderStructure?: boolean },
        onProgress?: (done: number, total: number) => void,
    ) => {
        const isVideoAction = isVideoSelectMode;
        const idsToProcess = isVideoAction ? selectedVideoIds : selectedIds;
        if (idsToProcess.size === 0) return;

        let succeeded = 0, failed = 0;
        let hasLocalItems = false;

        if (isVideoAction) {
            const allVideos = [...videosData, ...localVideos];
            const items = allVideos.filter(v => v.id && selectedVideoIds.has(v.id));
            hasLocalItems = items.some(v => v.id?.startsWith('local:'));
            const localTargets = items.filter(v => v.id?.startsWith('local:'));
            const remoteTargets = items.filter(v => !v.id?.startsWith('local:'));
            const totalTargets = localTargets.length + remoteTargets.length;
            let processed = 0;
            onProgress?.(0, totalTargets);

            if (localTargets.length > 0 && window.electronAPI?.localLibrary && actionModal.type === 'move') {
                const parsedIds = (await Promise.all(
                    localTargets.map(v => window.electronAPI!.localLibrary.parseId({ localId: v.id! })),
                )).filter((parsed): parsed is { libraryId: number; assetId: number } => Boolean(parsed));

                if (parsedIds.length > 0) {
                    const moveResults = await window.electronAPI.localLibrary.moveItems({
                        assetIds: parsedIds.map(parsed => parsed.assetId),
                        collection,
                        album,
                        preserveFolderStructure: Boolean(options?.preserveFolderStructure),
                    });
                    for (const result of moveResults) {
                        if (result.success) succeeded++;
                        else failed++;
                    }
                }

                processed += localTargets.length;
                onProgress?.(processed, totalTargets);
            }

            if (localTargets.length > 0 && window.electronAPI?.localLibrary && actionModal.type === 'copy') {
                const parsedIds = (await Promise.all(
                    localTargets.map(v => window.electronAPI!.localLibrary.parseId({ localId: v.id! })),
                )).filter((parsed): parsed is { libraryId: number; assetId: number } => Boolean(parsed));

                if (parsedIds.length > 0) {
                    const copyResults = await window.electronAPI.localLibrary.copyItems({
                        assetIds: parsedIds.map(parsed => parsed.assetId),
                        collection,
                        album,
                        preserveFolderStructure: Boolean(options?.preserveFolderStructure),
                    });
                    for (const result of copyResults) {
                        if (result.success) succeeded++;
                        else failed++;
                    }
                }

                processed += localTargets.length;
                onProgress?.(processed, totalTargets);
            }

            for (let i = 0; i < remoteTargets.length; i++) {
                try {
                    const v = remoteTargets[i];
                    if (actionModal.type === 'copy' && onAddVideoItem) {
                        await onAddVideoItem({ video: v.video, title: v.title, desc: v.desc, category: album, collection, album });
                    } else if (actionModal.type === 'move' && onUpdateVideoItem && v.id) {
                        await onUpdateVideoItem(v.id, { collection, album, category: album });
                    }
                    succeeded++;
                } catch { failed++; }
                processed += 1;
                onProgress?.(processed, totalTargets);
            }
        } else {
            const allPhotos = [...galleryData, ...localPhotos];
            const items = allPhotos.filter(i => i.id && selectedIds.has(i.id));
            hasLocalItems = items.some(i => i.id?.startsWith('local:'));
            const localTargets = items.filter(i => i.id?.startsWith('local:'));
            const remoteTargets = items.filter(i => !i.id?.startsWith('local:'));
            const totalTargets = localTargets.length + remoteTargets.length;
            let processed = 0;
            onProgress?.(0, totalTargets);

            if (localTargets.length > 0 && window.electronAPI?.localLibrary && actionModal.type === 'move') {
                const parsedIds = (await Promise.all(
                    localTargets.map(item => window.electronAPI!.localLibrary.parseId({ localId: item.id! })),
                )).filter((parsed): parsed is { libraryId: number; assetId: number } => Boolean(parsed));

                if (parsedIds.length > 0) {
                    const moveResults = await window.electronAPI.localLibrary.moveItems({
                        assetIds: parsedIds.map(parsed => parsed.assetId),
                        collection,
                        album,
                        preserveFolderStructure: Boolean(options?.preserveFolderStructure),
                    });
                    for (const result of moveResults) {
                        if (result.success) succeeded++;
                        else failed++;
                    }
                }

                processed += localTargets.length;
                onProgress?.(processed, totalTargets);
            }

            if (localTargets.length > 0 && window.electronAPI?.localLibrary && actionModal.type === 'copy') {
                const parsedIds = (await Promise.all(
                    localTargets.map(item => window.electronAPI!.localLibrary.parseId({ localId: item.id! })),
                )).filter((parsed): parsed is { libraryId: number; assetId: number } => Boolean(parsed));

                if (parsedIds.length > 0) {
                    const copyResults = await window.electronAPI.localLibrary.copyItems({
                        assetIds: parsedIds.map(parsed => parsed.assetId),
                        collection,
                        album,
                        preserveFolderStructure: Boolean(options?.preserveFolderStructure),
                    });
                    for (const result of copyResults) {
                        if (result.success) succeeded++;
                        else failed++;
                    }
                }

                processed += localTargets.length;
                onProgress?.(processed, totalTargets);
            }

            for (let i = 0; i < remoteTargets.length; i++) {
                try {
                    const item = remoteTargets[i];
                    if (actionModal.type === 'copy' && onAddGalleryItem) {
                        await onAddGalleryItem({ src: item.src, title: item.title, category: album, collection, album });
                    } else if (actionModal.type === 'move' && onUpdateGalleryItem && item.id) {
                        await onUpdateGalleryItem(item.id, { collection, album, category: album });
                    }
                    succeeded++;
                } catch { failed++; }
                processed += 1;
                onProgress?.(processed, totalTargets);
            }
        }

        // Reload local assets if any local items were affected
        if (hasLocalItems) await loadLocalAssets();

        setActionModal({ isOpen: false, type: null });
        clearSelection();

        if (actionModal.type === 'move' && lightboxMoveContextRef.current && succeeded > 0) {
            const { nextIndex, remainingCount } = lightboxMoveContextRef.current;
            lightboxMoveContextRef.current = null;
            setIsPhotoLightboxActionBusy(false);
            setPhotoLightboxIndex(remainingCount <= 0 ? -1 : nextIndex);
        } else if (actionModal.type === 'move' && videoLightboxMoveContextRef.current && succeeded > 0) {
            const { nextIndex, remainingCount } = videoLightboxMoveContextRef.current;
            videoLightboxMoveContextRef.current = null;
            setIsVideoLightboxActionBusy(false);
            if (remainingCount <= 0) {
                closeTheater();
            } else {
                setActiveVideoIndex(nextIndex);
            }
        } else if (lightboxMoveContextRef.current) {
            lightboxMoveContextRef.current = null;
            setIsPhotoLightboxActionBusy(false);
        } else if (videoLightboxMoveContextRef.current) {
            videoLightboxMoveContextRef.current = null;
            setIsVideoLightboxActionBusy(false);
        }

        if (failed > 0) {
            setConfirmConfig({ isOpen: true, title: 'Partial Success', message: `${succeeded} item${succeeded !== 1 ? 's' : ''} ${actionModal.type === 'move' ? 'moved' : 'copied'}, ${failed} failed.`, type: 'info', isAlert: true });
        } else if (succeeded > 0) {
            setConfirmConfig({ isOpen: true, title: 'Done', message: `${succeeded} item${succeeded !== 1 ? 's' : ''} ${actionModal.type === 'move' ? 'moved' : 'copied'} to "${collection} / ${album}".`, type: 'success', isAlert: true });
        }
    };

    // ── Transfer to local folder ────────────────────────────────────────────
    const executeTransfer = async (args: {
        targetDir: string;
        album: string;
        resizePicture: boolean;
        maxLongEdge: number;
        jpegQuality: number;
        loadToLibrary: boolean;
        preserveFolderStructure?: boolean;
    }, onProgress?: (done: number, total: number) => void) => {
        if (!isElectron() || !window.electronAPI?.transfer) return;
        const isVideoTransfer = isVideoSelectMode;
        const idsToProcess = isVideoTransfer ? selectedVideoIds : selectedIds;
        if (idsToProcess.size === 0) return;

        // Collect source paths for selected items
        const allItems = isVideoTransfer
            ? [...videosData, ...localVideos] as (GalleryItem | VideoItem)[]
            : [...galleryData, ...localPhotos] as (GalleryItem | VideoItem)[];
        const sourcePaths: { id: string; filePath: string; relativePath?: string }[] = [];
        const remoteItems: (GalleryItem | VideoItem)[] = [];

        for (const item of allItems) {
            if (!item.id || !idsToProcess.has(item.id)) continue;
            if ((item as any).localFilePath) {
                const localFilePath = (item as any).localFilePath as string;
                const relativePath = args.preserveFolderStructure && activeCollectionConfig.path
                    ? localFilePath.startsWith(activeCollectionConfig.path)
                        ? localFilePath.slice(activeCollectionConfig.path.length).replace(/^\\+/, '')
                        : undefined
                    : undefined;
                sourcePaths.push({ id: item.id, filePath: localFilePath, relativePath });
            } else {
                const url = (item as any).src || (item as any).video;
                if (url) remoteItems.push(item);
            }
        }

        // For remote items, download first to a temp location then transfer
        // For now, we only support local files for transfer
        if (sourcePaths.length === 0 && remoteItems.length > 0) {
            setConfirmConfig({ isOpen: true, title: 'Transfer', message: 'Transfer currently supports local files only. Select local photos to transfer.', type: 'info', isAlert: true });
            return;
        }

        try {
            const isResize = args.resizePicture;
            const total = sourcePaths.length;
            const allResults: { id: string; success: boolean; destPath?: string; error?: string }[] = [];
            onProgress?.(0, total);

            // Process one file at a time for real progress
            for (let i = 0; i < total; i++) {
                const batch = await window.electronAPI.transfer.execute({
                    sourcePaths: [sourcePaths[i]],
                    targetDir: args.targetDir,
                    album: args.album,
                    maxLongEdge: isResize ? args.maxLongEdge : 99999,
                    jpegQuality: isResize ? args.jpegQuality : 1.0,
                    copyOnly: isResize,
                    preserveFolderStructure: args.preserveFolderStructure,
                });
                allResults.push(...batch);
                onProgress?.(i + 1, total);
            }

            const succeeded = allResults.filter(r => r.success).length;
            const failed = allResults.filter(r => !r.success).length;

            // Only remove from index if original was moved (not resize/copy)
            if (!isResize) {
                const successIds = allResults.filter(r => r.success).map(r => r.id);
                if (successIds.length > 0) {
                    for (const id of successIds) {
                        if (id.startsWith('local:')) {
                            try {
                                const parsed = await window.electronAPI.localLibrary.parseId({ localId: id });
                                if (parsed) {
                                    await window.electronAPI.localLibrary.removeAssets({ assetIds: [parsed.assetId] });
                                }
                            } catch {}
                        }
                    }
                }
            }

            // Optionally load target as local library
            if (args.loadToLibrary && window.electronAPI.localLibrary) {
                try {
                    await window.electronAPI.localLibrary.importDirectory();
                } catch {}
            }

            // Reload local assets
            await loadLocalAssets();

            setActionModal({ isOpen: false, type: null });
            clearSelection();

            if (failed > 0) {
                setConfirmConfig({ isOpen: true, title: isResize ? 'Partial Resize' : 'Partial Transfer', message: `${succeeded} ${isResize ? 'resized' : 'transferred'}, ${failed} failed.`, type: 'info', isAlert: true });
            } else if (succeeded > 0) {
                setConfirmConfig({ isOpen: true, title: isResize ? 'Resize Complete' : 'Transfer Complete', message: isResize ? `Successfully resized and transferred ${succeeded} picture${succeeded !== 1 ? 's' : ''}.` : `${succeeded} photo${succeeded !== 1 ? 's' : ''} transferred to "${args.album ? `${args.targetDir}/${args.album}` : args.targetDir}".`, type: 'success', isAlert: true });
            }
        } catch (e: any) {
            setConfirmConfig({ isOpen: true, title: 'Transfer Failed', message: e.message || 'Unknown error', type: 'error', isAlert: true });
        }
    };

    // ── Duplicate scan actions ────────────────────────────────────────────────
    const handleDuplicateDeleteItem = async (id: string): Promise<void> => {
        if (scanType === 'video') {
            if (onDeleteVideoItem) await onDeleteVideoItem(id);
        } else {
            if (onDeleteGalleryItem) await onDeleteGalleryItem(id);
        }
        if (id.startsWith('local:')) await loadLocalAssets();
    };

    const handleDuplicateMoveSelected = (ids: string[]) => {
        if (ids.length === 0) return;
        if (scanType === 'video') {
            setSelectedVideoIds(new Set(ids));
            setIsVideoSelectMode(true);
        } else {
            setSelectedIds(new Set(ids));
            setIsSelectMode(true);
        }
        setShowScanModal(false);
        openActionModal('move');
    };

    // ── Bulk delete selected ──────────────────────────────────────────────────
    const handleBulkDeleteSelected = () => {
        const isVideo = isVideoSelectMode;
        const ids = isVideo ? selectedVideoIds : selectedIds;
        if (ids.size === 0) return;
        const count = ids.size;
        const hasLocal = [...ids].some(id => id.startsWith('local:'));
        const msg = hasLocal
            ? `Delete ${count} selected item${count > 1 ? 's' : ''}? Local files will be moved to the Recycle Bin.`
            : `Permanently delete ${count} selected item${count > 1 ? 's' : ''}? This cannot be undone.`;
        setConfirmConfig({
            isOpen: true,
            title: `Delete ${count} ${isVideo ? 'Video' : 'Photo'}${count > 1 ? 's' : ''}`,
            message: msg,
            type: 'danger',
            confirmText: `Delete ${count}`,
            onConfirm: async () => {
                setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                const deleteHandler = isVideo ? onDeleteVideoItem : onDeleteGalleryItem;
                if (!deleteHandler) return;
                const idsArr = [...ids];
                const results = await Promise.allSettled(idsArr.map(id => deleteHandler(id)));
                if (hasLocal) await loadLocalAssets();
                const failed = results.filter(r => r.status === 'rejected').length;
                const succeeded = results.filter(r => r.status === 'fulfilled').length;
                clearSelection();
                if (failed > 0) {
                    setConfirmConfig({ isOpen: true, title: 'Partial Success', message: `${succeeded} deleted, ${failed} failed.`, type: 'info', isAlert: true });
                }
            }
        });
    };

    // ── Download ──────────────────────────────────────────────────────────────
    const handleDownloadSelected = async () => {
        if (isVideoSelectMode) {
            const items = videosData.filter(v => v.id && selectedVideoIds.has(v.id));
            if (items.length > 0) await handleExportVideos(items);
        } else {
            const items = galleryData.filter(i => i.id && selectedIds.has(i.id));
            if (items.length > 0) await handleExportPhotos(items);
        }
        clearSelection();
    };

    // ── Fullscreen ────────────────────────────────────────────────────────────
    const toggleBrowserFullscreen = (target: 'photo' | 'video') => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => {
                if (target === 'photo') { setIsPhotoFullscreen(true); setLayoutMode('photo-full'); }
                else { setIsVideoFullscreen(true); setLayoutMode('video-full'); }
            }).catch(err => {
                setConfirmConfig({ isOpen: true, title: 'Fullscreen Error', message: err.message, type: 'danger', isAlert: true });
            });
        } else {
            document.exitFullscreen();
            setIsPhotoFullscreen(false); setIsVideoFullscreen(false);
            if (!onlyPhotos && !onlyVideos) setLayoutMode('split');
        }
    };
    useEffect(() => {
        const handler = () => { if (!document.fullscreenElement) { setIsPhotoFullscreen(false); setIsVideoFullscreen(false); } };
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    // ── Export ────────────────────────────────────────────────────────────────
    const handleExportPhotos = async (targetItems?: GalleryItem[] | any) => {
        const items = Array.isArray(targetItems) ? targetItems : filteredPhotos;
        if (items.length === 0) return;
        // @ts-ignore
        const hasDirPicker = !!window.showDirectoryPicker || (!!window.electronAPI?.pickDirectory && !!window.electronAPI?.export?.saveItems);
        setConfirmConfig({
            isOpen: true, title: 'Export Photos', message: `Export ${items.length} photos?${!hasDirPicker ? ' They will download individually.' : ''}`, type: 'info',
            onConfirm: async () => {
                setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                if (hasDirPicker) {
                    try {
                        const result = await exportViaDirectoryPicker(items, 'photo');
                        if (result.count > 0) setConfirmConfig(buildExportCompleteConfig(result.count, result.directoryPath));
                    } catch { await exportViaBrowserDownload(items, 'photo'); }
                } else { await exportViaBrowserDownload(items, 'photo'); }
            }
        });
    };
    const handleExportVideos = async (targetItems?: VideoItem[] | any) => {
        const items = Array.isArray(targetItems) ? targetItems : filteredVideos;
        if (items.length === 0) return;
        // @ts-ignore
        const hasDirPicker = !!window.showDirectoryPicker || (!!window.electronAPI?.pickDirectory && !!window.electronAPI?.export?.saveItems);
        setConfirmConfig({
            isOpen: true, title: 'Export Videos', message: `Export ${items.length} videos?${!hasDirPicker ? ' They will download individually.' : ''}`, type: 'info',
            onConfirm: async () => {
                setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                if (hasDirPicker) {
                    try {
                        const result = await exportViaDirectoryPicker(items, 'video');
                        if (result.count > 0) setConfirmConfig(buildExportCompleteConfig(result.count, result.directoryPath));
                    } catch { await exportViaBrowserDownload(items, 'video'); }
                } else { await exportViaBrowserDownload(items, 'video'); }
            }
        });
    };

    // ── Slideshow ─────────────────────────────────────────────────────────────
    const handleStartSlideshow = async (type: 'photo' | 'video', mode: SlideshowMode | 'cascade') => {
        const data = type === 'photo' ? filteredPhotos : filteredVideos;
        if (data.length === 0) {
            setConfirmConfig({ isOpen: true, title: 'No Items', message: 'No items available for slideshow.', type: 'info', isAlert: true });
            return;
        }
        const nextSelection: SlideshowSelection = { type, mode, data };
        setPhotoMenuOpen(false);
        setVideoMenuOpen(false);

        if (isElectron() && window.electronAPI?.slideshow) {
            try {
                const displays = await window.electronAPI.slideshow.listDisplays();
                if (displays.length > 1) {
                    setSlideshowDisplayPicker({ open: true, displays, pending: nextSelection });
                    return;
                }
            } catch (error) {
                console.warn('[slideshow] Failed to read displays:', error);
            }
        }

        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(console.error);
        setActiveSlideshow(nextSelection);
    };
    const handleCloseSlideshow = () => {
        setActiveSlideshow(null);
        if (document.fullscreenElement) document.exitFullscreen().catch(console.error);
    };

    const handleLaunchSlideshowOnCurrentScreen = () => {
        if (!slideshowDisplayPicker.pending) return;
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(console.error);
        setActiveSlideshow(slideshowDisplayPicker.pending);
        setSlideshowDisplayPicker({ open: false, displays: [], pending: null });
    };

    const handleLaunchSlideshowOnDisplay = async (displayId: number) => {
        const pending = slideshowDisplayPicker.pending;
        if (!pending || !window.electronAPI?.slideshow) return;
        const result = await window.electronAPI.slideshow.openWindow({ displayId, payload: pending });
        if (!result?.success) {
            setConfirmConfig({
                isOpen: true,
                title: 'Unable To Open Slideshow',
                message: result?.error || 'Failed to open slideshow on the selected display.',
                type: 'danger',
                isAlert: true,
            });
            return;
        }
        setSlideshowDisplayPicker({ open: false, displays: [], pending: null });
    };

    const handleLaunchSlideshowOnAllDisplays = async () => {
        const pending = slideshowDisplayPicker.pending;
        if (!pending || !window.electronAPI?.slideshow) return;

        const displays = slideshowDisplayPicker.displays;
        const partitions = partitionSlideshowData(pending.data, displays.length);
        const payloads = displays.map((display, index) => ({
            displayId: display.id,
            payload: {
                ...pending,
                data: partitions[index],
            },
        }));

        const result = await window.electronAPI.slideshow.openAllWindows({ payloads });
        if (!result?.success) {
            setConfirmConfig({
                isOpen: true,
                title: 'Unable To Open Multi-Screen Slideshow',
                message: result?.error || 'Failed to launch slideshow on all displays.',
                type: 'danger',
                isAlert: true,
            });
            return;
        }

        setSlideshowDisplayPicker({ open: false, displays: [], pending: null });
    };

    // ── Add manual URL ────────────────────────────────────────────────────────
    const handleAddManualUrl = (type: 'photo' | 'video') => {
        const collection = type === 'photo' ? photoSelectedCollection : videoSelectedCollection;
        const currentFilter = type === 'photo' ? photoFilter : videoFilter;
        const currentAlbums = type === 'photo' ? photoAlbums : videoAlbums;
        const album = (currentFilter !== 'All' && currentFilter !== 'Favorites') ? currentFilter : (currentAlbums[0] || '');
        setAddUrlModal({ type, url: '', title: '', collection, album });
    };

    const confirmAddUrl = async () => {
        if (!addUrlModal || !addUrlModal.url.trim() || !addUrlModal.title.trim()) return;
        const { type, url, title } = addUrlModal;
        const collection = addUrlModal.collection.trim();
        const album = addUrlModal.album.trim();
        const collectionError = validateFacetInput('Collection', collection);
        if (collectionError) {
            setConfirmConfig({ isOpen: true, title: 'Invalid Collection', message: collectionError, type: 'danger', isAlert: true });
            return;
        }
        const albumError = validateFacetInput('Album', album);
        if (albumError) {
            setConfirmConfig({ isOpen: true, title: 'Invalid Album', message: albumError, type: 'danger', isAlert: true });
            return;
        }
        try {
            if (type === 'photo' && onAddGalleryItem) {
                await onAddGalleryItem({ src: url.trim(), title: title.trim(), category: album, collection, album });
            } else if (type === 'video' && onAddVideoItem) {
                await onAddVideoItem({ video: url.trim(), title: title.trim(), desc: 'Manual Import', category: album, collection, album });
            }
            setAddUrlModal(null);
            setConfirmConfig({ isOpen: true, title: 'Saved', message: 'Item added successfully.', type: 'success', isAlert: true });
        } catch (e: any) {
            setConfirmConfig({ isOpen: true, title: 'Error', message: 'Failed: ' + e.message, type: 'danger', isAlert: true });
        }
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const handlePhotoItemDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const isLocal = id.startsWith('local-') || id.startsWith('local:');
        if (isLocal) {
            const msg = id.startsWith('local:') ? 'Move this photo to the Recycle Bin?' : 'Remove this photo?';
            setConfirmConfig({
                isOpen: true, title: 'Delete Photo', message: msg, type: 'danger', confirmText: 'Delete',
                onConfirm: async () => {
                    if (onDeleteGalleryItem) await onDeleteGalleryItem(id);
                    if (id.startsWith('local:')) await loadLocalAssets();
                    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                }
            });
        } else {
            setConfirmConfig({
                isOpen: true, title: 'Delete Photo', message: 'Remove this photo from the library? This cannot be undone.', type: 'danger', confirmText: 'Delete',
                onConfirm: async () => { if (onDeleteGalleryItem) await onDeleteGalleryItem(id); setConfirmConfig(prev => ({ ...prev, isOpen: false })); }
            });
        }
    };

    const handlePhotoLightboxMove = (image: GalleryItem, index: number) => {
        if (!image.id) return;
        const remainingCount = filteredPhotos.length - 1;
        lightboxMoveContextRef.current = {
            itemId: image.id,
            nextIndex: computeNextLightboxIndex(index, filteredPhotos.length),
            remainingCount,
        };
        setIsPhotoLightboxActionBusy(true);
        setSelectedIds(new Set([image.id]));
        setIsSelectMode(true);
        openActionModal('move');
    };

    const handlePhotoLightboxDelete = (image: GalleryItem, index: number) => {
        if (!image.id || !onDeleteGalleryItem) return;
        setIsPhotoLightboxActionBusy(true);
        void (async () => {
            try {
                await onDeleteGalleryItem(image.id!);
                if (image.id!.startsWith('local:')) {
                    await loadLocalAssets();
                }
                finalizePhotoLightboxAdvance(index, filteredPhotos.length);
            } catch (error: any) {
                setConfirmConfig({
                    isOpen: true,
                    title: 'Delete Failed',
                    message: error?.message || 'Failed to delete the current photo.',
                    type: 'danger',
                    isAlert: true,
                });
            } finally {
                setIsPhotoLightboxActionBusy(false);
            }
        })();
    };

    const handleVideoLightboxMove = (video: VideoItem, index: number) => {
        if (!video.id) return;
        const remainingCount = filteredVideos.length - 1;
        videoLightboxMoveContextRef.current = {
            itemId: video.id,
            nextIndex: computeNextLightboxIndex(index, filteredVideos.length),
            remainingCount,
        };
        setSelectedVideoIds(new Set([video.id]));
        setIsVideoSelectMode(true);
        openActionModal('move');
    };

    const handleVideoLightboxDelete = (video: VideoItem, index: number) => {
        if (!video.id || !onDeleteVideoItem) return;
        setIsVideoLightboxActionBusy(true);
        void (async () => {
            try {
                await onDeleteVideoItem(video.id);
                if (video.id.startsWith('local:')) {
                    await loadLocalAssets();
                }
                if (filteredVideos.length <= 1) {
                    closeTheater();
                } else {
                    setActiveVideoIndex(computeNextLightboxIndex(index, filteredVideos.length));
                }
            } catch (error: any) {
                setConfirmConfig({
                    isOpen: true,
                    title: 'Delete Failed',
                    message: error?.message || 'Failed to delete the current video.',
                    type: 'danger',
                    isAlert: true,
                });
            } finally {
                setIsVideoLightboxActionBusy(false);
            }
        })();
    };

    const handleVideoItemDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const isLocal = id.startsWith('local-') || id.startsWith('local:');
        if (isLocal) {
            const msg = id.startsWith('local:') ? 'Move this video to the Recycle Bin?' : 'Remove this video?';
            setConfirmConfig({
                isOpen: true, title: 'Delete Video', message: msg, type: 'danger', confirmText: 'Delete',
                onConfirm: async () => {
                    if (onDeleteVideoItem) await onDeleteVideoItem(id);
                    if (id.startsWith('local:')) await loadLocalAssets();
                    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
                }
            });
        } else {
            setConfirmConfig({
                isOpen: true, title: 'Delete Video', message: 'Remove this video from the library? This cannot be undone.', type: 'danger', confirmText: 'Delete',
                onConfirm: async () => { if (onDeleteVideoItem) await onDeleteVideoItem(id); setConfirmConfig(prev => ({ ...prev, isOpen: false })); }
            });
        }
    };

    // ── Single-item context-menu actions ─────────────────────────────────────
    const openSingleItemAction = (kind: 'photo' | 'video', id: string, type: 'move' | 'copy') => {
        if (kind === 'video') {
            setSelectedVideoIds(new Set([id]));
            setIsVideoSelectMode(true);
        } else {
            setSelectedIds(new Set([id]));
            setIsSelectMode(true);
        }
        openActionModal(type);
    };

    const handleSingleItemDownload = async (kind: 'photo' | 'video', id: string) => {
        if (kind === 'video') {
            const item = [...videosData, ...localVideos].find(v => v.id === id);
            if (item) await handleExportVideos([item]);
        } else {
            const item = [...galleryData, ...localPhotos].find(p => p.id === id);
            if (item) await handleExportPhotos([item]);
        }
    };

    const buildContextMenuItems = (kind: 'photo' | 'video', id: string): ContextMenuItem[] => {
        const isFav = kind === 'video' ? videoFavorites.has(id) : photoFavorites.has(id);
        return [
            {
                key: 'move',
                label: 'Move to...',
                icon: <FolderInput size={14} className="text-orange-500" />,
                onClick: () => openSingleItemAction(kind, id, 'move'),
            },
            {
                key: 'copy',
                label: 'Copy to...',
                icon: <Copy size={14} className="text-blue-500" />,
                onClick: () => openSingleItemAction(kind, id, 'copy'),
            },
            {
                key: 'download',
                label: 'Download',
                icon: <Download size={14} className="text-emerald-500" />,
                onClick: () => { void handleSingleItemDownload(kind, id); },
            },
            {
                key: 'favorite',
                label: isFav ? 'Remove from favorites' : 'Add to favorites',
                icon: <Heart size={14} className={isFav ? 'fill-rose-500 text-rose-500' : 'text-rose-500'} />,
                onClick: () => {
                    if (kind === 'video') toggleVideoFavorite(id);
                    else togglePhotoFavorite(id);
                },
            },
            {
                key: 'delete',
                label: 'Delete',
                icon: <Trash2 size={14} />,
                variant: 'danger',
                onClick: () => {
                    const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
                    if (kind === 'video') void handleVideoItemDelete(id, fakeEvent);
                    else void handlePhotoItemDelete(id, fakeEvent);
                },
            },
        ];
    };

    const handleItemContextMenu = (kind: 'photo' | 'video') => (id: string, x: number, y: number) => {
        setContextMenu({ id, kind, x, y });
    };

    return (
        <div className="h-screen bg-gray-50 flex flex-col font-sans overflow-hidden animate-fadeIn relative">
            {isSwitchingCollection && (
                <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/25 backdrop-blur-[2px]">
                    <div className="flex items-center gap-4 rounded-2xl border border-white/60 bg-white/95 px-5 py-4 shadow-2xl">
                        <Loader2 size={18} className="animate-spin text-cyan-600" />
                        <div
                            className="min-w-[220px]"
                            style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif' }}
                        >
                            <div className="text-sm font-semibold text-slate-800">{isCancellingCollection ? 'Cancelling scan...' : 'Loading collection'}</div>
                            <div className="mt-1 text-xs text-slate-500">You can stop this at any time.</div>
                            <div className="mt-4 w-full">
                                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                                    <span>{scanPhaseLabel(collectionScanProgress?.phase)}</span>
                                    <span>{collectionScanProgress && collectionScanProgress.total > 0 ? `${collectionScanProgress.current}/${collectionScanProgress.total}` : ''}</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/90">
                                    <div
                                        className={`h-full rounded-full bg-cyan-500 transition-all duration-200 ${collectionScanProgress && collectionScanProgress.total <= 0 ? 'animate-pulse' : ''}`}
                                        style={{
                                            width: collectionScanProgress && collectionScanProgress.total > 0
                                                ? `${Math.max(3, Math.min(100, (collectionScanProgress.current / collectionScanProgress.total) * 100))}%`
                                                : '28%',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleCancelCollectionLoad}
                            disabled={isCancellingCollection}
                            className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
                        >
                            {isCancellingCollection ? 'Cancelling...' : 'Stop Scan'}
                        </button>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
                type={confirmConfig.type}
                confirmText={confirmConfig.isAlert ? 'OK' : 'Confirm'}
                isAlert={confirmConfig.isAlert}
                extraAction={confirmConfig.extraAction}
            />

            <DuplicateScanModal
                isOpen={showScanModal}
                onClose={() => setShowScanModal(false)}
                scanResults={scanResults}
                scanType={scanType}
                onDeleteItem={handleDuplicateDeleteItem}
                onMoveSelected={handleDuplicateMoveSelected}
            />

            <BulkActionModal
                isOpen={actionModal.isOpen}
                onClose={closeActionModal}
                actionType={actionModal.type}
                onConfirm={executeBulkAction}
                onTransfer={isElectron() ? executeTransfer : undefined}
                existingCollections={isVideoSelectMode ? videoCollections : photoCollections}
                collectionAlbums={isVideoSelectMode ? videoCollectionAlbums : photoCollectionAlbums}
                selectedCount={isVideoSelectMode ? selectedVideoIds.size : selectedIds.size}
                defaultCollection={isVideoSelectMode ? videoSelectedCollection : photoSelectedCollection}
                defaultAlbum={isVideoSelectMode ? (videoFilter !== 'All' && videoFilter !== 'Favorites' ? videoFilter : videoAlbums[0] || '') : (photoFilter !== 'All' && photoFilter !== 'Favorites' ? photoFilter : photoAlbums[0] || '')}
            />

            <ContextMenu
                items={contextMenu ? buildContextMenuItems(contextMenu.kind, contextMenu.id) : []}
                position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
                onClose={() => setContextMenu(null)}
            />

            {/* ── Photo Upload Modal ── */}
            {showPhotoUploadModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => !isPhotoUploading && setShowPhotoUploadModal(false)}>
                    <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-lg w-full relative border border-gray-100 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => !isPhotoUploading && setShowPhotoUploadModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30" disabled={isPhotoUploading} title="Close"><X size={24} /></button>
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2"><CloudUpload size={24} className="text-rose-500" /> Upload Photos</h3>
                        <form onSubmit={handlePhotoCloudUpload} className="space-y-4">
                            {/* File picker */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Select Images</label>
                                <input ref={photoFileInputRef} type="file" accept="image/*" multiple aria-label="Select images to upload" onChange={e => { const files = Array.from(e.target.files || []) as File[]; setPhotoUploadFiles(files); setPhotoUploadStatuses([]); setPhotoFilePreviews(files.map(f => URL.createObjectURL(f))); }} disabled={isPhotoUploading} className="hidden" />
                                <div onClick={() => !isPhotoUploading && photoFileInputRef.current?.click()} className={`flex items-center gap-3 px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:bg-rose-50 hover:border-rose-300 transition-all ${isPhotoUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    <span className="px-3 py-1 bg-rose-100 text-rose-600 text-xs font-semibold rounded-full whitespace-nowrap">Choose Files</span>
                                    <span className="text-sm text-gray-500 truncate">{photoUploadFiles.length === 0 ? 'No files selected' : photoUploadFiles.length === 1 ? photoUploadFiles[0].name : `${photoUploadFiles.length} files selected`}</span>
                                </div>
                            </div>
                            {/* Thumbnail preview strip */}
                            {photoFilePreviews.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto py-2">
                                    {photoFilePreviews.map((preview, i) => (
                                        <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                                            <img src={preview} className="w-full h-full object-cover" alt="" />
                                            {photoUploadStatuses[i] && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                                    {photoUploadStatuses[i].status === 'uploading' && <span className="text-white text-[10px] font-bold">{photoUploadStatuses[i].progress}%</span>}
                                                    {photoUploadStatuses[i].status === 'complete' && <CheckCircle size={16} className="text-green-400" />}
                                                    {photoUploadStatuses[i].status === 'error' && <X size={16} className="text-red-400" />}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {/* Collection */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Collection</label>
                                <div className="flex gap-2">
                                    <select title="Select collection" value={photoCustomCollectionInput ? '' : photoUploadCollection} onChange={e => { const nc = e.target.value; const na = Array.from(new Set(normalizedPhotos.filter(i => i.collection.toLowerCase() === nc.toLowerCase()).map(i => i.album))).sort(); setPhotoUploadCollection(nc); setPhotoCustomCollectionInput(''); setPhotoUploadAlbum(na[0] || ''); setPhotoCustomAlbumInput(''); }} disabled={isPhotoUploading || !!photoCustomCollectionInput} className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none disabled:opacity-50">
                                        {(photoCollectionOptions.length > 0 ? photoCollectionOptions : ['Collection']).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <input type="text" value={photoCustomCollectionInput} onChange={e => { setPhotoCustomCollectionInput(e.target.value); setPhotoUploadAlbum(''); setPhotoCustomAlbumInput(''); }} disabled={isPhotoUploading} placeholder="...or new" className="w-32 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none text-sm" />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">Reserved names: All, Favorites</p>
                                {photoCustomCollectionInput.trim() && <p className="text-[10px] text-rose-500 mt-1">New collection "{photoCustomCollectionInput.trim()}" will be created</p>}
                            </div>
                            {/* Album */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Album</label>
                                <div className="flex gap-2">
                                    <select title="Select album" value={photoCustomAlbumInput ? '' : photoUploadAlbum} onChange={e => { setPhotoUploadAlbum(e.target.value); setPhotoCustomAlbumInput(''); }} disabled={isPhotoUploading || !!photoCustomAlbumInput || albumsForPhotoUploadCol.length === 0} className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none disabled:opacity-50">
                                        {albumsForPhotoUploadCol.map(a => <option key={a} value={a}>{a}</option>)}
                                        {albumsForPhotoUploadCol.length === 0 && <option value="" disabled>Type a name →</option>}
                                    </select>
                                    <input type="text" value={photoCustomAlbumInput} onChange={e => setPhotoCustomAlbumInput(e.target.value)} disabled={isPhotoUploading} placeholder="...or new" className="w-32 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none text-sm" />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">Reserved names: All, Favorites</p>
                                {photoCustomAlbumInput.trim() && <p className="text-[10px] text-rose-500 mt-1">New album "{photoCustomAlbumInput.trim()}" will be created</p>}
                                {!photoCustomAlbumInput && albumsForPhotoUploadCol.length === 0 && <p className="text-[10px] text-orange-400 mt-1">No albums yet — type a name to create one</p>}
                            </div>
                            <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4">
                                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                                    <input
                                        type="checkbox"
                                        checked={photoUploadImageSettings.resizeEnabled}
                                        onChange={e => setPhotoUploadImageSettings(prev => ({ ...prev, resizeEnabled: e.target.checked }))}
                                        disabled={isPhotoUploading}
                                        className="w-4 h-4 rounded border-gray-300 text-rose-500 focus:ring-rose-400"
                                    />
                                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">Resize before upload</span>
                                </label>
                                <p className="mt-1 text-[11px] text-gray-500">
                                    Off: upload original file untouched. On: resize and encode to JPEG on the server.
                                </p>
                                {photoUploadImageSettings.resizeEnabled && (
                                    <div className="mt-3 grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Max Long Edge</label>
                                            <select
                                                title="Max long edge"
                                                value={photoUploadImageSettings.maxLongEdge}
                                                onChange={e => setPhotoUploadImageSettings(prev => ({ ...prev, maxLongEdge: Number(e.target.value) }))}
                                                disabled={isPhotoUploading}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none text-sm"
                                            >
                                                {PHOTO_UPLOAD_LONG_EDGE_OPTIONS.map(v => <option key={v} value={v}>{v}px</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">JPEG Quality</label>
                                            <select
                                                title="JPEG quality"
                                                value={photoUploadImageSettings.jpegQuality}
                                                onChange={e => setPhotoUploadImageSettings(prev => ({ ...prev, jpegQuality: Number(e.target.value) }))}
                                                disabled={isPhotoUploading}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none text-sm"
                                            >
                                                {PHOTO_UPLOAD_QUALITY_OPTIONS.map(v => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Per-file progress */}
                            {isPhotoUploading && photoUploadStatuses.length > 0 && (
                                <div className="py-2 space-y-1.5 max-h-40 overflow-y-auto">
                                    {photoUploadStatuses.map((s, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <span className="text-[10px] text-gray-500 w-24 truncate">{s.file.name}</span>
                                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                <div className={`h-full transition-all duration-300 ${s.status === 'error' ? 'bg-red-500' : 'bg-rose-500'}`} style={{ width: `${s.progress}%` }} />
                                            </div>
                                            <span className="text-[10px] text-gray-400 w-8 text-right">
                                                {s.status === 'complete' ? <CheckCircle size={12} className="text-green-500 inline" /> : s.status === 'error' ? <X size={12} className="text-red-500 inline" /> : `${s.progress}%`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {photoUploadFormError && <p className="flex items-center gap-1.5 text-xs text-red-500 font-medium"><AlertCircle size={13} /> {photoUploadFormError}</p>}
                            <button type="submit" disabled={isPhotoUploading || photoUploadFiles.length === 0} className="w-full py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-all shadow-lg disabled:opacity-50 flex justify-center items-center gap-2">
                                {isPhotoUploading ? <><Loader2 className="animate-spin" size={18} /> Uploading {photoUploadStatuses.filter(s => s.status === 'complete').length}/{photoUploadFiles.length}...</> : `Upload ${photoUploadFiles.length || ''} Photo${photoUploadFiles.length !== 1 ? 's' : ''}`}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Photo Upload Result Modal ── */}
            {photoUploadResult && (
                <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={() => setPhotoUploadResult(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center border border-gray-100" onClick={e => e.stopPropagation()}>
                        {photoUploadResult.type === 'success' && <CheckCircle size={40} className="text-green-500 mx-auto mb-3" />}
                        {photoUploadResult.type === 'partial' && <AlertTriangle size={40} className="text-yellow-500 mx-auto mb-3" />}
                        {photoUploadResult.type === 'error' && <AlertCircle size={40} className="text-red-500 mx-auto mb-3" />}
                        <h4 className="text-lg font-bold text-gray-800 mb-2">{photoUploadResult.title}</h4>
                        <p className="text-sm text-gray-500 mb-6">{photoUploadResult.message}</p>
                        <button type="button" onClick={() => setPhotoUploadResult(null)} className="px-6 py-2 bg-rose-500 text-white font-semibold rounded-xl hover:bg-rose-600 transition-colors">OK</button>
                    </div>
                </div>
            )}

            {/* ── Video Upload Modal ── */}
            {showVideoUploadModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => !isVideoUploadRunning && setShowVideoUploadModal(false)}>
                    <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-lg w-full relative border border-gray-100 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => !isVideoUploadRunning && setShowVideoUploadModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30" disabled={isVideoUploadRunning} title="Close"><X size={24} /></button>
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2"><CloudUpload size={24} className="text-rose-500" /> Upload Video</h3>
                        <form onSubmit={handleVideoCloudUpload} className="space-y-4">
                            {/* File picker */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Select Video</label>
                                <input ref={videoFileInputRef} type="file" accept="video/*" multiple aria-label="Select video to upload" onChange={e => { setVideoUploadFiles(Array.from(e.target.files || [])); setVideoUploadStatuses([]); }} disabled={isVideoUploadRunning} className="hidden" />
                                <div onClick={() => !isVideoUploadRunning && videoFileInputRef.current?.click()} className={`flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-rose-50 hover:border-rose-300 transition-all ${isVideoUploadRunning ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <span className="px-3 py-1 bg-rose-100 text-rose-600 text-xs font-semibold rounded-full shrink-0">Choose File</span>
                                    <span className="text-sm text-gray-500 truncate">{videoUploadFiles.length === 0 ? 'No files selected' : videoUploadFiles.length === 1 ? videoUploadFiles[0].name : `${videoUploadFiles.length} files selected`}</span>
                                </div>
                            </div>
                            {/* Title */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Title (optional, single upload)</label>
                                <input type="text" value={videoUploadTitle} onChange={e => setVideoUploadTitle(e.target.value)} disabled={isVideoUploadRunning} placeholder="e.g. Dance Night" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none" />
                            </div>
                            {/* Description */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Description</label>
                                <input type="text" value={videoUploadDesc} onChange={e => setVideoUploadDesc(e.target.value)} disabled={isVideoUploadRunning} placeholder="Short description..." className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none" />
                            </div>
                            {/* Collection */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Collection</label>
                                <div className="flex gap-2">
                                    <select title="Select collection" value={videoCustomCollectionInput ? '' : videoUploadCollection} onChange={e => { const nc = e.target.value; const na = Array.from(new Set(normalizedVideos.filter(v => v.collection.toLowerCase() === nc.toLowerCase()).map(v => v.album))).sort(); setVideoUploadCollection(nc); setVideoCustomCollectionInput(''); setVideoUploadAlbum(na[0] || ''); setVideoCustomAlbumInput(''); }} disabled={isVideoUploadRunning || !!videoCustomCollectionInput} className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none disabled:opacity-50">
                                        {(videoCollectionOptions.length > 0 ? videoCollectionOptions : ['Collection']).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <input type="text" value={videoCustomCollectionInput} onChange={e => { setVideoCustomCollectionInput(e.target.value); setVideoUploadAlbum(''); setVideoCustomAlbumInput(''); }} disabled={isVideoUploadRunning} placeholder="...or new" className="w-32 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none text-sm" />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">Reserved names: All, Favorites</p>
                                {videoCustomCollectionInput.trim() && <p className="text-[10px] text-rose-500 mt-1">New collection "{videoCustomCollectionInput.trim()}" will be created</p>}
                            </div>
                            {/* Album */}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Album</label>
                                <div className="flex gap-2">
                                    <select title="Select album" value={videoCustomAlbumInput ? '' : videoUploadAlbum} onChange={e => { setVideoUploadAlbum(e.target.value); setVideoCustomAlbumInput(''); }} disabled={isVideoUploadRunning || !!videoCustomAlbumInput || albumsForVideoUploadCol.length === 0} className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none disabled:opacity-50">
                                        {albumsForVideoUploadCol.map(a => <option key={a} value={a}>{a}</option>)}
                                        {albumsForVideoUploadCol.length === 0 && <option value="" disabled>Type a name →</option>}
                                    </select>
                                    <input type="text" value={videoCustomAlbumInput} onChange={e => setVideoCustomAlbumInput(e.target.value)} disabled={isVideoUploadRunning} placeholder="...or new" className="w-32 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rose-400 focus:outline-none text-sm" />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">Reserved names: All, Favorites</p>
                                {videoCustomAlbumInput.trim() && <p className="text-[10px] text-rose-500 mt-1">New album "{videoCustomAlbumInput.trim()}" will be created</p>}
                                {!videoCustomAlbumInput && albumsForVideoUploadCol.length === 0 && <p className="text-[10px] text-orange-400 mt-1">No albums yet — type a name to create one</p>}
                            </div>
                            {/* Progress */}
                            {isVideoUploadRunning && (
                                <div className="py-2">
                                    <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Uploading...</span><span>{videoUploadStatuses.filter(s => s.status === 'complete').length}/{videoUploadFiles.length}</span></div>
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div className="bg-rose-500 h-full transition-all duration-300" style={{ width: `${videoUploadFiles.length > 0 ? (videoUploadStatuses.filter(s => s.status === 'complete').length / videoUploadFiles.length) * 100 : 0}%` }} />
                                    </div>
                                </div>
                            )}
                            {videoUploadFormError && <p className="flex items-center gap-1.5 text-xs text-red-500 font-medium"><AlertCircle size={13} /> {videoUploadFormError}</p>}
                            <button type="submit" disabled={isVideoUploadRunning || videoUploadFiles.length === 0} className="w-full py-3 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-all shadow-lg disabled:opacity-50 flex justify-center items-center gap-2">
                                {isVideoUploadRunning ? <><Loader2 className="animate-spin" size={18} /> Uploading {videoUploadStatuses.filter(s => s.status === 'complete').length}/{videoUploadFiles.length}...</> : `Upload ${videoUploadFiles.length || ''} Video${videoUploadFiles.length !== 1 ? 's' : ''}`}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Video Upload Result Modal ── */}
            {videoUploadResult && (
                <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn" onClick={() => setVideoUploadResult(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center border border-gray-100" onClick={e => e.stopPropagation()}>
                        {videoUploadResult.type === 'success' && <CheckCircle size={40} className="text-green-500 mx-auto mb-3" />}
                        {videoUploadResult.type === 'partial' && <AlertTriangle size={40} className="text-yellow-500 mx-auto mb-3" />}
                        {videoUploadResult.type === 'error' && <AlertCircle size={40} className="text-red-500 mx-auto mb-3" />}
                        <h4 className="text-lg font-bold text-gray-800 mb-2">{videoUploadResult.title}</h4>
                        <p className="text-sm text-gray-500 mb-6">{videoUploadResult.message}</p>
                        <button type="button" onClick={() => setVideoUploadResult(null)} className="px-6 py-2 bg-rose-500 text-white font-semibold rounded-xl hover:bg-rose-600 transition-colors">OK</button>
                    </div>
                </div>
            )}

            {/* ── Add URL inline modal ── */}
            {addUrlModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn" onClick={() => setAddUrlModal(null)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-lg font-bold text-gray-800">Add {addUrlModal.type === 'photo' ? 'Photo' : 'Video'} URL</h3>
                            <button type="button" onClick={() => setAddUrlModal(null)} title="Close" className="text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">URL</label>
                                <input type="url" value={addUrlModal.url} onChange={e => setAddUrlModal(s => s && ({ ...s, url: e.target.value }))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:outline-none" placeholder="https://..." autoFocus />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Title</label>
                                <input type="text" value={addUrlModal.title} onChange={e => setAddUrlModal(s => s && ({ ...s, title: e.target.value }))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:outline-none" placeholder="My title" />
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Collection</label>
                                    <input type="text" value={addUrlModal.collection} onChange={e => setAddUrlModal(s => s && ({ ...s, collection: e.target.value }))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:outline-none" title="Collection name" placeholder="e.g. Yuxin" />
                                    <p className="text-[10px] text-gray-400 mt-1">Reserved names: All, Favorites</p>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Album</label>
                                    <input type="text" value={addUrlModal.album} onChange={e => setAddUrlModal(s => s && ({ ...s, album: e.target.value }))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:outline-none" title="Album name" placeholder="e.g. Inbox" />
                                    <p className="text-[10px] text-gray-400 mt-1">Reserved names: All, Favorites</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-5">
                            <button type="button" onClick={() => setAddUrlModal(null)} className="px-4 py-2 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                            <button type="button" onClick={confirmAddUrl} disabled={!addUrlModal.url.trim() || !addUrlModal.title.trim()} className="px-4 py-2 bg-rose-500 text-white font-bold rounded-xl hover:bg-rose-600 transition-colors disabled:opacity-40">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Slideshows overlay ── */}
            <SlideshowOverlayRenderer
                slideshow={activeSlideshow}
                onClose={handleCloseSlideshow}
                videoFavorites={videoFavorites}
                onToggleVideoFavorite={toggleVideoFavorite}
            />

            {slideshowDisplayPicker.open && (
                <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4" onClick={() => setSlideshowDisplayPicker({ open: false, displays: [], pending: null })}>
                    <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl border border-gray-200 p-6" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Choose Slideshow Screen</h3>
                                <p className="text-sm text-gray-500 mt-1">Multi-monitor detected. Pick where the slideshow should open.</p>
                            </div>
                            <button type="button" onClick={() => setSlideshowDisplayPicker({ open: false, displays: [], pending: null })} className="text-gray-400 hover:text-gray-700 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <button type="button" onClick={handleLaunchSlideshowOnCurrentScreen} className="w-full text-left rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-100 transition-colors px-4 py-4">
                                <div className="font-bold text-rose-700">Current Window</div>
                                <div className="text-sm text-rose-600 mt-1">Play inside the current GalleryHub window.</div>
                            </button>
                            <button type="button" onClick={handleLaunchSlideshowOnAllDisplays} className="w-full text-left rounded-2xl border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 transition-colors px-4 py-4">
                                <div className="font-bold text-cyan-700">All Displays</div>
                                <div className="text-sm text-cyan-600 mt-1">Open a separate fullscreen slideshow on every monitor with different content partitions.</div>
                            </button>
                            {slideshowDisplayPicker.displays.map((display) => (
                                <button
                                    type="button"
                                    key={display.id}
                                    onClick={() => handleLaunchSlideshowOnDisplay(display.id)}
                                    className="w-full text-left rounded-2xl border border-gray-200 hover:border-cyan-300 hover:bg-cyan-50 transition-colors px-4 py-4"
                                >
                                    <div className="font-bold text-gray-900">{display.label}</div>
                                    <div className="text-sm text-gray-500 mt-1">
                                        {display.bounds.width} x {display.bounds.height} at ({display.bounds.x}, {display.bounds.y})
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Lightbox ── */}
            {photoLightboxIndex >= 0 && <Lightbox images={filteredPhotos} currentIndex={photoLightboxIndex} onClose={() => setPhotoLightboxIndex(-1)} onToggleFavorite={togglePhotoFavorite} favorites={photoFavorites} onMoveCurrent={handlePhotoLightboxMove} onDeleteCurrent={handlePhotoLightboxDelete} actionBusy={isPhotoLightboxActionBusy} />}

            {/* ── Theater overlay ── */}
            {videoTheaterMode && filteredVideos.length > 0 && (
                <TheaterOverlay
                    items={filteredVideos}
                    activeIndex={activeVideoIndex}
                    onIndexChange={setActiveVideoIndex}
                    onClose={closeTheater}
                    onToggleFavorite={toggleVideoFavorite}
                    onMoveCurrent={handleVideoLightboxMove}
                    onDeleteCurrent={handleVideoLightboxDelete}
                    favorites={videoFavorites}
                    actionBusy={isVideoLightboxActionBusy}
                    variant="minimal"
                />
            )}

            {/* ── Split-screen layout ── */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

                {/* Photos */}
                <PhotoLibrary
                    items={filteredPhotos}
                    collections={photoCollections}
                    selectedCollection={photoSelectedCollection}
                    onSetCollection={(c) => { setPhotoSelectedCollection(c); setPhotoFilter('All'); }}
                    albums={photoAlbums}
                    filter={photoFilter}
                    onSetFilter={setPhotoFilter}
                    albumCountLabel={photoAlbumCountLabel}
                    albumCount={effectivePhotoAlbumCount}
                    viewMode={photoViewMode}
                    onSetViewMode={setPhotoViewMode}
                    gridDisplayMode={photoGridDisplayMode}
                    onSetGridDisplayMode={setPhotoGridDisplayMode}
                    columns={photoColumns}
                    onSetColumns={setPhotoColumns}
                    isSelectMode={isSelectMode}
                    onToggleSelectMode={() => { setIsSelectMode(!isSelectMode); setPhotoItemDeleteMode(false); if (isSelectMode) setSelectedIds(new Set()); }}
                    selectedIds={selectedIds}
                    onToggleSelection={toggleSelection}
                    isDeleteMode={photoItemDeleteMode}
                    onToggleDeleteMode={() => { setPhotoItemDeleteMode(!photoItemDeleteMode); setIsSelectMode(false); }}
                    favorites={photoFavorites}
                    onToggleFavorite={togglePhotoFavorite}
                    onItemClick={(idx) => setPhotoLightboxIndex(idx)}
                    onDelete={handlePhotoItemDelete}
                    onItemContextMenu={handleItemContextMenu('photo')}
                    onHeaderImport={isElectron() ? handleLocalImport : () => onAddLocalPhotoFolder ? onAddLocalPhotoFolder(photoFilter === 'Favorites' ? undefined : photoFilter) : onAddLocalPhotos(photoFilter === 'Favorites' ? undefined : photoFilter)}
                    onGridImport={() => onAddLocalPhotos(photoFilter)}
                    onAddManual={openPhotoUploadModal}
                    onRefresh={handleRefreshPhotos}
                    isRefreshing={isPhotoRefreshing}
                    onScanDuplicates={() => handleScanDuplicates('photo')}
                    isScanning={isScanning && scanType === 'photo'}
                    onExport={handleExportPhotos}
                    onSlideshow={(mode) => handleStartSlideshow('photo', mode)}
                    menuOpen={photoMenuOpen}
                    onToggleMenu={() => { setPhotoMenuOpen(!photoMenuOpen); if (!photoMenuOpen) setVideoMenuOpen(false); }}
                    isFullscreen={isPhotoFullscreen}
                    onToggleFullscreen={() => toggleBrowserFullscreen('photo')}
                    layoutMode={layoutMode}
                    onToggleLayout={() => setLayoutMode(layoutMode === 'photo-full' ? 'split' : 'photo-full')}
                    onOpenActionModal={openActionModal}
                    onDownloadSelected={handleDownloadSelected}
                    onBulkDeleteSelected={handleBulkDeleteSelected}
                    onClearSelection={clearSelection}
                    onSelectAll={(ids) => setSelectedIds(new Set(ids))}
                    onAddToSelection={(ids) => setSelectedIds(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; })}
                    hideLayoutToggle={onlyPhotos || onlyVideos}
                    onFolderInfo={isElectron() ? handleFolderInfo : undefined}
                    sortField={photoSortField}
                    sortDir={photoSortDir}
                    onSetSortField={setPhotoSortField}
                    onSetSortDir={setPhotoSortDir}
                    scanProgress={scanRingProgress}
                    thumbnailProgress={thumbnailProgress}
                />

                {/* Videos */}
                {!onlyPhotos && (
                    <VideoLibrary
                        variant="panel"
                        items={filteredVideos}
                        collections={videoCollections}
                        selectedCollection={videoSelectedCollection}
                        onSetCollection={(c) => { setVideoSelectedCollection(c); setVideoFilter('All'); }}
                        albums={videoAlbums}
                        filter={videoFilter}
                        onSetFilter={setVideoFilter}
                        albumCountLabel={videoAlbumCountLabel}
                        albumCount={filteredVideos.length}
                        viewMode={videoViewMode}
                        onSetViewMode={setVideoViewMode}
                        gridDisplayMode={videoGridDisplayMode}
                        onSetGridDisplayMode={setVideoGridDisplayMode}
                        columns={videoColumns}
                        onSetColumns={setVideoColumns}
                        isSelectMode={isVideoSelectMode}
                        onToggleSelectMode={() => { setIsVideoSelectMode(!isVideoSelectMode); setVideoItemDeleteMode(false); if (isVideoSelectMode) setSelectedVideoIds(new Set()); }}
                        selectedIds={selectedVideoIds}
                        onToggleSelection={toggleVideoSelection}
                        isDeleteMode={videoItemDeleteMode}
                        onToggleDeleteMode={() => { setVideoItemDeleteMode(!videoItemDeleteMode); setIsVideoSelectMode(false); }}
                        favorites={videoFavorites}
                        onToggleFavorite={toggleVideoFavorite}
                        onItemClick={(idx) => openTheater(idx)}
                        onDelete={handleVideoItemDelete}
                        onItemContextMenu={handleItemContextMenu('video')}
                        onHeaderImport={isElectron() ? handleLocalImport : () => onAddLocalVideoFolder ? onAddLocalVideoFolder(videoFilter === 'Favorites' ? undefined : videoFilter) : onAddLocalVideos(videoFilter === 'Favorites' ? undefined : videoFilter)}
                        onGridImport={isElectron() ? handleLocalImport : () => onAddLocalVideoFolder ? onAddLocalVideoFolder(videoFilter === 'Favorites' ? undefined : videoFilter) : onAddLocalVideos(videoFilter)}
                        onAddManual={openVideoUploadModal}
                        onRefresh={handleRefreshVisibleVideos}
                        isRefreshing={isVideoRefreshing}
                        onScanDuplicates={() => handleScanDuplicates('video')}
                        isScanning={isScanning && scanType === 'video'}
                        onExport={handleExportVideos}
                        onSlideshow={(mode) => handleStartSlideshow('video', mode)}
                        menuOpen={videoMenuOpen}
                        onToggleMenu={() => { setVideoMenuOpen(!videoMenuOpen); if (!videoMenuOpen) setPhotoMenuOpen(false); }}
                        isFullscreen={isVideoFullscreen}
                        onToggleFullscreen={() => toggleBrowserFullscreen('video')}
                        layoutMode={layoutMode}
                        onToggleLayout={() => setLayoutMode(layoutMode === 'video-full' ? 'split' : 'video-full')}
                        onOpenActionModal={openActionModal}
                        onDownloadSelected={handleDownloadSelected}
                        onBulkDeleteSelected={handleBulkDeleteSelected}
                        onClearSelection={clearSelection}
                        onSelectAll={(ids) => setSelectedVideoIds(new Set(ids))}
                        onAddToSelection={(ids) => setSelectedVideoIds(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; })}
                        onBack={onBack}
                        hideLayoutToggle={onlyPhotos || onlyVideos}
                        onFolderInfo={isElectron() ? handleFolderInfo : undefined}
                        scanProgress={scanRingProgress}
                        videoCacheProgress={videoCacheProgress}
                        onVisibleLocalAssetIdsChange={setVisibleVideoLocalAssetIds}
                    />
                )}
            </div>

            {/* ── Collection Info Popover ── */}
            {showFolderInfo && (
                <>
                    <div className="fixed inset-0 z-50 bg-black/15 backdrop-blur-[2px]" onClick={() => setShowFolderInfo(false)} />
                    <div ref={folderInfoRef} className="fixed top-14 right-4 z-50 w-[min(92vw,50rem)] max-h-[78vh] overflow-y-auto rounded-3xl shadow-2xl border border-slate-200 bg-white/96 backdrop-blur-xl">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white/96 sticky top-0 z-10">
                            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wider">
                                <HardDrive size={14} className="text-cyan-600" />
                                Collection Info
                            </div>
                            <button onClick={() => setShowFolderInfo(false)} className="text-slate-500 hover:text-slate-800 transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        {folderInfoError && (
                            <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                                <X size={14} className="shrink-0 mt-0.5 cursor-pointer" onClick={() => setFolderInfoError(null)} />
                                {folderInfoError}
                            </div>
                        )}
                        {!hasLocalCollectionInfo && !hasCloudCollectionInfo ? (
                            <div className="px-5 py-10 text-center text-slate-500 text-sm">No collection data available yet.</div>
                        ) : (
                            <div className={`grid gap-5 p-5 ${hasLocalCollectionInfo && hasCloudCollectionInfo ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
                                {hasLocalCollectionInfo && (
                                    <div className="space-y-4 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Local</div>
                                            <div className="text-xs text-slate-500">{localSections.length} {localSections.length === 1 ? 'library' : 'libraries'}</div>
                                        </div>
                                        {localSections.map(section => (
                                            <div key={section.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                                                <div className="text-base text-slate-900 font-bold truncate">{section.title}</div>
                                                {section.subtitle && <div className="text-[11px] text-slate-500 truncate mt-1 font-mono">{section.subtitle}</div>}
                                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                                    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                                                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Files</div>
                                                        <div className="mt-1 text-sm font-bold text-slate-900">{section.totalFiles}</div>
                                                    </div>
                                                    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                                                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Size</div>
                                                        <div className="mt-1 text-sm font-bold text-slate-900">{fmtBytes(section.totalSizeBytes)}</div>
                                                    </div>
                                                    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                                                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Photos</div>
                                                        <div className="mt-1 text-sm font-bold text-rose-600">{section.totalPhotos}</div>
                                                    </div>
                                                    <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                                                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Videos</div>
                                                        <div className="mt-1 text-sm font-bold text-cyan-600">{section.totalVideos}</div>
                                                    </div>
                                                </div>
                                                {section.structure.length > 0 && (
                                                    <div className="mt-4">
                                                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-bold">Structure</div>
                                                        <div
                                                            className="overflow-y-auto rounded-xl border border-slate-200 bg-white"
                                                            style={{
                                                                maxHeight: `${STRUCTURE_MAX_VISIBLE_ROWS * STRUCTURE_ROW_HEIGHT_REM}rem`,
                                                                scrollbarGutter: 'stable',
                                                            }}
                                                        >
                                                            {section.structure.map((row, i) => (
                                                                <div key={`${section.id}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2 text-xs border-b last:border-b-0 border-slate-100">
                                                                    <span className="text-slate-700 truncate">
                                                                        {row.collection !== section.title && <span className="text-slate-400">{row.collection} / </span>}
                                                                        {row.album}
                                                                    </span>
                                                                    <span className="text-slate-500 tabular-nums whitespace-nowrap">{fmtBytes(row.sizeBytes)}</span>
                                                                    <span className="text-slate-900 tabular-nums font-semibold whitespace-nowrap">{row.count}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {section.actions}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {hasCloudCollectionInfo && cloudSection && (
                                    <div className="space-y-4 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Cloud</div>
                                            <div className="text-xs text-slate-500">Remote assets</div>
                                        </div>
                                        <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
                                            <div className="text-base text-slate-900 font-bold">{cloudSection.title}</div>
                                            {cloudSection.subtitle && <div className="text-[11px] text-slate-500 mt-1">{cloudSection.subtitle}</div>}
                                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                                <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Files</div>
                                                    <div className="mt-1 text-sm font-bold text-slate-900">{cloudSection.totalFiles}</div>
                                                </div>
                                                <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Size</div>
                                                    <div className="mt-1 text-sm font-bold text-slate-900">{fmtBytes(cloudSection.totalSizeBytes)}</div>
                                                </div>
                                                <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Photos</div>
                                                    <div className="mt-1 text-sm font-bold text-rose-600">{cloudSection.totalPhotos}</div>
                                                </div>
                                                <div className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Videos</div>
                                                    <div className="mt-1 text-sm font-bold text-cyan-600">{cloudSection.totalVideos}</div>
                                                </div>
                                            </div>
                                            {cloudSection.structure.length > 0 && (
                                                <div className="mt-4">
                                                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-bold">Structure</div>
                                                    <div
                                                        className="overflow-y-auto rounded-xl border border-slate-200 bg-white"
                                                        style={{
                                                            maxHeight: `${STRUCTURE_MAX_VISIBLE_ROWS * STRUCTURE_ROW_HEIGHT_REM}rem`,
                                                            scrollbarGutter: 'stable',
                                                        }}
                                                    >
                                                        {cloudSection.structure.map((row, i) => (
                                                            <div key={`cloud-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2 text-xs border-b last:border-b-0 border-slate-100">
                                                                <span className="text-slate-700 truncate">
                                                                    <span className="text-slate-400">{row.collection} / </span>
                                                                    {row.album}
                                                                </span>
                                                                <span className="text-slate-500 tabular-nums whitespace-nowrap">{fmtBytes(row.sizeBytes)}</span>
                                                                <span className="text-slate-900 tabular-nums font-semibold whitespace-nowrap">{row.count}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
