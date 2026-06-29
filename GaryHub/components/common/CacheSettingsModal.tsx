import React, { useEffect, useState } from 'react';
import { FolderOpen, Loader2, MoveRight, RefreshCcw, Save, ShieldCheck, X } from 'lucide-react';

const LONG_EDGE_OPTIONS = [400, 600, 960, 1280, 1920, 2560, 3840];
const QUALITY_OPTIONS = [75, 80, 85, 90, 95, 97, 100];
const VIDEO_RESOLUTION_OPTIONS = [240, 320, 480, 720, 1080, 2560];
const VIDEO_BITRATE_OPTIONS = [0.5, 1.5, 2.5, 5.0, 7.5, 10];
const VIDEO_MODE_OPTIONS = [
    { value: 'custom', label: 'Custom' },
    { value: 'match-source', label: 'Match Source' },
    { value: 'preserve-quality', label: 'Preserve Quality' },
] as const;
const VIDEO_FORMAT_OPTIONS = [
    { value: 'all', label: 'All', buttonClassName: 'w-[60px]' },
    { value: 'skip-mp4', label: 'Skip MP4', buttonClassName: 'w-[84px]' },
    { value: 'mp4-only', label: 'MP4 only', buttonClassName: 'w-[84px]' },
] as const;

type CacheTab = 'picture' | 'video' | 'sync-file' | 'sync-date';
type VideoFormatMode = 'all' | 'skip-mp4' | 'mp4-only';
type CacheSyncDirection = 'cache-to-collection' | 'collection-to-cache';
type CacheSyncKeepRule = 'smaller' | 'larger';
type CacheSyncPreview = {
    direction: CacheSyncDirection;
    keepRule: CacheSyncKeepRule;
    resolvedSourcePath: string;
    resolvedTargetPath: string;
    copyCount: number;
    replaceCount: number;
    skipCount: number;
    deleteLegacyCount: number;
    items: Array<{
        action: 'copy' | 'replace' | 'skip';
        reason: string;
        sourcePath: string;
        targetPath: string;
        matchedPath?: string;
        deletePath?: string;
        sourceSizeBytes: number;
        targetSizeBytes?: number;
        relativePath: string;
    }>;
    errors: string[];
};
type DateSyncPreview = {
    resolvedSourcePath: string;
    resolvedTargetPath: string;
    syncDate: boolean;
    syncExif: boolean;
    matchedCount: number;
    skippedCount: number;
    exifUpdatedCount: number;
    dateUpdatedCount: number;
    mediaMetadataUpdatedCount: number;
    items: Array<{
        action: 'sync' | 'skip';
        mediaType: 'image' | 'video';
        sourcePath?: string;
        targetPath: string;
        reason: string;
        relativePath: string;
        syncDate: boolean;
        syncExif: boolean;
    }>;
    errors: string[];
};
type DateSyncLogEntry = {
    level: 'info' | 'error';
    text: string;
};
type SyncLogEntry = {
    level: 'info' | 'error';
    text: string;
};

export const CacheSettingsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
}> = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState<CacheTab>('picture');
    const [cacheRoot, setCacheRoot] = useState('');
    const [localThumbEnabled, setLocalThumbEnabled] = useState(false);
    const [localLongEdge, setLocalLongEdge] = useState(960);
    const [localQuality, setLocalQuality] = useState(85);
    const [cloudThumbEnabled, setCloudThumbEnabled] = useState(false);
    const [cloudLongEdge, setCloudLongEdge] = useState(960);
    const [cloudQuality, setCloudQuality] = useState(85);
    const [videoCacheEnabled, setVideoCacheEnabled] = useState(false);
    const [videoMode, setVideoMode] = useState<'custom' | 'match-source' | 'preserve-quality'>('custom');
    const [videoAllowUpscale, setVideoAllowUpscale] = useState(false);
    const [videoSkipMp4, setVideoSkipMp4] = useState(false);
    const [videoMp4Only, setVideoMp4Only] = useState(false);
    const [videoMp4BitrateThresholdEnabled, setVideoMp4BitrateThresholdEnabled] = useState(true);
    const [videoMp4BitrateThresholdMbps, setVideoMp4BitrateThresholdMbps] = useState('5');
    const [videoMinDurationEnabled, setVideoMinDurationEnabled] = useState(true);
    const [videoMinDurationSec, setVideoMinDurationSec] = useState('2');
    const [videoResolution, setVideoResolution] = useState(720);
    const [videoBitratePreset, setVideoBitratePreset] = useState('2.5');
    const [videoBitrateInput, setVideoBitrateInput] = useState('2.5');
    const [videoThumbEnabled, setVideoThumbEnabled] = useState(false);
    const [videoThumbLongEdge, setVideoThumbLongEdge] = useState(600);
    const [videoThumbQuality, setVideoThumbQuality] = useState(85);
    const [syncDirection, setSyncDirection] = useState<CacheSyncDirection>('cache-to-collection');
    const [syncKeepRule, setSyncKeepRule] = useState<CacheSyncKeepRule>('smaller');
    const [syncSourcePath, setSyncSourcePath] = useState('');
    const [syncTargetPath, setSyncTargetPath] = useState('');
    const [syncDeleteSourceFile, setSyncDeleteSourceFile] = useState(false);
    const [syncPreview, setSyncPreview] = useState<CacheSyncPreview | null>(null);
    const [syncPreviewing, setSyncPreviewing] = useState(false);
    const [syncRunning, setSyncRunning] = useState(false);
    const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
    const [dateSyncSourcePath, setDateSyncSourcePath] = useState('');
    const [dateSyncTargetPath, setDateSyncTargetPath] = useState('');
    const [dateSyncEnabled, setDateSyncEnabled] = useState(true);
    const [dateSyncExifEnabled, setDateSyncExifEnabled] = useState(true);
    const [dateSyncPreview, setDateSyncPreview] = useState<DateSyncPreview | null>(null);
    const [dateSyncPreviewing, setDateSyncPreviewing] = useState(false);
    const [dateSyncRunning, setDateSyncRunning] = useState(false);
    const [dateSyncLogs, setDateSyncLogs] = useState<DateSyncLogEntry[]>([]);
    const [saving, setSaving] = useState(false);
    const [migrating, setMigrating] = useState(false);
    const [rebuilding, setRebuilding] = useState(false);
    const [checkingCache, setCheckingCache] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const videoFormatMode: VideoFormatMode = videoMp4Only ? 'mp4-only' : videoSkipMp4 ? 'skip-mp4' : 'all';

    useEffect(() => {
        if (!isOpen) return;
        window.electronAPI?.cloudCache.getConfig().then((config) => {
            setActiveTab('picture');
            setCacheRoot(config.cacheRoot);
            setLocalThumbEnabled(Boolean(config.localThumbnail.enabled));
            setLocalLongEdge(config.localThumbnail.longEdge);
            setLocalQuality(config.localThumbnail.quality);
            setCloudThumbEnabled(Boolean(config.cloudThumbnail.enabled));
            setCloudLongEdge(config.cloudThumbnail.longEdge);
            setCloudQuality(config.cloudThumbnail.quality);
            setVideoCacheEnabled(Boolean(config.localVideo?.enabled));
            setVideoMode(config.localVideo?.mode || 'custom');
            setVideoAllowUpscale(Boolean(config.localVideo?.allowUpscale));
            setVideoSkipMp4(Boolean(config.localVideo?.skipMp4));
            setVideoMp4Only(Boolean(config.localVideo?.mp4Only));
            setVideoMp4BitrateThresholdEnabled(config.localVideo?.mp4BitrateThresholdEnabled !== false);
            setVideoMp4BitrateThresholdMbps(String(config.localVideo?.mp4BitrateThresholdMbps ?? 5));
            setVideoMinDurationEnabled(config.localVideo?.minDurationEnabled !== false);
            setVideoMinDurationSec(String(config.localVideo?.minDurationSec ?? 2));
            setVideoResolution(config.localVideo?.resolution || 720);
            const customBitrate = config.localVideo?.customBitrateMbps;
            const presetBitrate = config.localVideo?.bitrateMbps || 2.5;
            if (typeof customBitrate === 'number' && customBitrate > 0) {
                setVideoBitratePreset('custom');
                setVideoBitrateInput(String(customBitrate));
            } else {
                setVideoBitratePreset(String(presetBitrate));
                setVideoBitrateInput(String(presetBitrate));
            }
            setVideoThumbEnabled(Boolean(config.localVideo?.thumbnailEnabled));
            setVideoThumbLongEdge(config.localVideo?.thumbnailLongEdge || 600);
            setVideoThumbQuality(config.localVideo?.thumbnailQuality || 85);
            setSyncDirection('cache-to-collection');
            setSyncKeepRule('smaller');
            setSyncSourcePath('');
            setSyncTargetPath('');
            setSyncDeleteSourceFile(false);
            setSyncPreview(null);
            setSyncLogs([]);
            setDateSyncSourcePath('');
            setDateSyncTargetPath('');
            setDateSyncEnabled(true);
            setDateSyncExifEnabled(true);
            setDateSyncPreview(null);
            setDateSyncLogs([]);
            setMessage(null);
        }).catch(() => {});
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const unsubscribe = window.electronAPI?.cacheSync.onProgress((data) => {
            const level: 'info' | 'error' = data.phase === 'error' ? 'error' : 'info';
            const prefix = data.total > 0 ? `[${data.current}/${data.total}] ` : '';
            setSyncLogs((current) => {
                const next = [...current, { level, text: `${prefix}${data.message}` }];
                return next.slice(-200);
            });
        });
        return () => {
            unsubscribe?.();
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const unsubscribe = window.electronAPI?.dateSync.onProgress((data) => {
            const level: 'info' | 'error' = data.phase === 'error' ? 'error' : 'info';
            const prefix = data.total > 0 ? `[${data.current}/${data.total}] ` : '';
            setDateSyncLogs((current) => {
                const next = [...current, { level, text: `${prefix}${data.message}` }];
                return next.slice(-200);
            });
        });
        return () => {
            unsubscribe?.();
        };
    }, [isOpen]);

    const handleBrowse = async () => {
        const dir = await window.electronAPI?.pickDirectory({ title: 'Select Cache Folder' });
        if (dir) setCacheRoot(dir);
    };

    const applyVideoFormatMode = (nextMode: VideoFormatMode) => {
        setVideoSkipMp4(nextMode === 'skip-mp4');
        setVideoMp4Only(nextMode === 'mp4-only');
    };

    const browseSyncPath = async (field: 'source' | 'target') => {
        const dir = await window.electronAPI?.pickDirectory({ title: field === 'source' ? 'Select Source Folder' : 'Select Target Folder' });
        if (!dir) return;
        if (field === 'source') {
            setSyncSourcePath(dir);
        } else {
            setSyncTargetPath(dir);
        }
    };

    const browseDateSyncPath = async (field: 'source' | 'target') => {
        const dir = await window.electronAPI?.pickDirectory({ title: field === 'source' ? 'Select Source Folder' : 'Select Target Folder' });
        if (!dir) return;
        if (field === 'source') {
            setDateSyncSourcePath(dir);
        } else {
            setDateSyncTargetPath(dir);
        }
    };

    const getVideoBitratePayload = () => {
        const manualValue = Number(videoBitrateInput);
        const isCustom = videoBitratePreset === 'custom';
        const fallback = 2.5;
        if (isCustom) {
            return {
                bitrateMbps: fallback,
                customBitrateMbps: Number.isFinite(manualValue) && manualValue > 0 ? manualValue : fallback,
            };
        }
        const presetValue = Number(videoBitratePreset);
        return {
            bitrateMbps: Number.isFinite(presetValue) && presetValue > 0 ? presetValue : fallback,
            customBitrateMbps: null,
        };
    };

    const handleSave = async () => {
        if (!cacheRoot.trim()) return;
        setSaving(true);
        try {
            const videoBitrate = getVideoBitratePayload();
            const minDurationSec = Number(videoMinDurationSec);
            const mp4BitrateThresholdMbps = Number(videoMp4BitrateThresholdMbps);
            const nextConfig = await window.electronAPI?.cloudCache.setConfig({
                cacheRoot: cacheRoot.trim(),
                localThumbnail: { enabled: localThumbEnabled, longEdge: localLongEdge, quality: localQuality },
                cloudThumbnail: { enabled: cloudThumbEnabled, longEdge: cloudLongEdge, quality: cloudQuality },
                localVideo: {
                    enabled: videoCacheEnabled,
                    mode: videoMode,
                    allowUpscale: videoAllowUpscale,
                    skipMp4: videoSkipMp4,
                    mp4Only: videoMp4Only,
                    mp4BitrateThresholdEnabled: videoMp4BitrateThresholdEnabled,
                    mp4BitrateThresholdMbps: Number.isFinite(mp4BitrateThresholdMbps) && mp4BitrateThresholdMbps > 0 ? mp4BitrateThresholdMbps : 5,
                    minDurationEnabled: videoMinDurationEnabled,
                    minDurationSec: Number.isFinite(minDurationSec) && minDurationSec >= 0 ? minDurationSec : 2,
                    resolution: videoResolution,
                    bitrateMbps: videoBitrate.bitrateMbps,
                    customBitrateMbps: videoBitrate.customBitrateMbps,
                    thumbnailEnabled: videoThumbEnabled,
                    thumbnailLongEdge: videoThumbLongEdge,
                    thumbnailQuality: videoThumbQuality,
                },
            });
            if (nextConfig) {
                window.dispatchEvent(new CustomEvent('galleryhub:cache-config-changed', { detail: nextConfig }));
            }
            setMessage('Cache settings updated. Run Repair Missing to fill absent video cache without touching existing files, or Rebuild to refresh everything.');
        } finally {
            setSaving(false);
        }
    };

    const handleMigrate = async () => {
        setMigrating(true);
        try {
            const result = await window.electronAPI?.cloudCache.repairMissingLocalVideoCache();
            if (!result) {
                setMessage('Repair Missing did not return a result.');
                return;
            }
            window.dispatchEvent(new CustomEvent('galleryhub:cache-config-changed'));
            setMessage(`Repair Missing completed: ${result.videosTranscoded} transcoded, ${result.videosCopied} copied, ${result.videosRemuxed} remuxed, ${result.relinked} relinked, ${result.skipped} already cached, ${result.missingSources} missing sources${result.errors.length ? `, ${result.errors.length} errors` : ''}.`);
        } finally {
            setMigrating(false);
        }
    };

    const handleCheckCache = async () => {
        setCheckingCache(true);
        try {
            const result = await window.electronAPI?.cloudCache.verifyLocalVideoCache();
            if (!result) {
                setMessage('Cache check did not return a result.');
                return;
            }
            const errorSummary = result.errors.length > 0 ? ` ${result.errors.slice(0, 3).join(' | ')}${result.errors.length > 3 ? ` | +${result.errors.length - 3} more` : ''}` : '';
            setMessage(`Cache check completed: ${result.checked} checked, ${result.playable} playable, ${result.corrupt} corrupt, ${result.missingCacheFiles} missing cache files.${errorSummary}`);
        } finally {
            setCheckingCache(false);
        }
    };

    const handleOpenCacheFolder = async () => {
        if (!cacheRoot.trim()) return;
        await window.electronAPI?.openPath(cacheRoot.trim());
    };

    const openFolderPath = async (targetPath?: string) => {
        const nextPath = targetPath?.trim();
        if (!nextPath) return;
        await window.electronAPI?.openPath(nextPath);
    };

    const handleRebuild = async () => {
        setRebuilding(true);
        try {
            const result = await window.electronAPI?.cloudCache.rebuildStructure();
            if (!result) {
                setMessage('Cache rebuild did not return a result.');
                return;
            }

            const localSummary = `${result.localThumbnails.regenerated} local thumbnails regenerated, ${result.localThumbnails.relinked} relinked, ${result.localThumbnails.missingThumbs} missing thumbs skipped`;
            const videoSummary = `${result.localVideoCache.videosTranscoded} videos transcoded, ${result.localVideoCache.videosCopied} copied, ${result.localVideoCache.videosRemuxed} remuxed, ${result.localVideoCache.thumbnailsGenerated} video covers generated`;
            const cloudSummary = result.cloudCache.targetBucket
                ? `${result.cloudCache.normalizedFiles} cloud cache files normalized, ${result.cloudCache.regeneratedThumbs} thumbnails regenerated for ${result.cloudCache.targetBucket}`
                : 'cloud cache skipped because no active bucket is selected';
            window.dispatchEvent(new CustomEvent('galleryhub:cache-config-changed'));
            setMessage(`Cache rebuild completed: ${localSummary}; ${videoSummary}; ${cloudSummary}.`);
        } finally {
            setRebuilding(false);
        }
    };

    const handlePreviewSync = async () => {
        setSyncPreviewing(true);
        setSyncLogs([]);
        try {
            const result = await window.electronAPI?.cacheSync.preview({
                direction: syncDirection,
                keepRule: syncKeepRule,
                sourcePath: syncSourcePath.trim() || undefined,
                targetPath: syncTargetPath.trim() || undefined,
                deleteSourceFile: syncDeleteSourceFile,
            });
            setSyncPreview(result || null);
            setMessage(null);
        } finally {
            setSyncPreviewing(false);
        }
    };

    const handleRunSync = async () => {
        setSyncRunning(true);
        setSyncLogs([]);
        try {
            const result = await window.electronAPI?.cacheSync.execute({
                direction: syncDirection,
                keepRule: syncKeepRule,
                sourcePath: syncSourcePath.trim() || undefined,
                targetPath: syncTargetPath.trim() || undefined,
                deleteSourceFile: syncDeleteSourceFile,
            });
            setSyncPreview(result || null);
            if (result) {
                setMessage(`Sync completed: ${result.copyCount} copies, ${result.replaceCount} replacements, ${result.skipCount} skipped, ${result.deleteLegacyCount} legacy MOV/MKV deletions${syncDeleteSourceFile ? ', source files removed after successful sync' : ''}.`);
            }
        } finally {
            setSyncRunning(false);
        }
    };

    const handlePreviewDateSync = async () => {
        setDateSyncPreviewing(true);
        setDateSyncLogs([]);
        try {
            const result = await window.electronAPI?.dateSync.preview({
                sourcePath: dateSyncSourcePath.trim() || undefined,
                targetPath: dateSyncTargetPath.trim() || undefined,
                syncDate: dateSyncEnabled,
                syncExif: dateSyncExifEnabled,
            });
            setDateSyncPreview(result || null);
            setMessage(null);
        } finally {
            setDateSyncPreviewing(false);
        }
    };

    const handleRunDateSync = async () => {
        setDateSyncRunning(true);
        setDateSyncLogs([]);
        try {
            const result = await window.electronAPI?.dateSync.execute({
                sourcePath: dateSyncSourcePath.trim() || undefined,
                targetPath: dateSyncTargetPath.trim() || undefined,
                syncDate: dateSyncEnabled,
                syncExif: dateSyncExifEnabled,
            });
            setDateSyncPreview(result || null);
            if (result) {
                setMessage(`Date sync completed: ${result.dateUpdatedCount} date updates, ${result.exifUpdatedCount} EXIF updates, ${result.mediaMetadataUpdatedCount} video metadata refreshes.`);
            }
        } finally {
            setDateSyncRunning(false);
        }
    };

    const renderResultPathRow = (label: string, value: string) => (
        <div className="grid gap-3 border-t border-slate-200 px-4 py-3 md:grid-cols-[72px_minmax(0,1fr)_72px] md:items-start">
            <div className="text-sm font-semibold text-slate-900">{label}</div>
            <div className="min-w-0 break-all text-sm text-slate-700">{value}</div>
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={() => openFolderPath(value)}
                    disabled={!value.trim()}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
                >
                    Open
                </button>
            </div>
        </div>
    );

    const formatFileSize = (sizeBytes?: number) => {
        if (!Number.isFinite(sizeBytes) || typeof sizeBytes !== 'number' || sizeBytes < 0) return '—';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let value = sizeBytes;
        let unitIndex = 0;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
        }
        const digits = unitIndex === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
        return `${value.toFixed(digits)} ${units[unitIndex]}`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/55">
            <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Cache Settings</h2>
                        <p className="mt-1 text-xs text-slate-500">Picture and video cache options are managed separately.</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
                </div>
                <div className="space-y-4 px-6 py-5">
                    <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Cache Folder</label>
                        <div className="flex gap-2">
                            <input
                                value={cacheRoot}
                                onChange={(e) => setCacheRoot(e.target.value)}
                                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                            />
                            <button type="button" onClick={handleBrowse} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                                <FolderOpen size={16} />
                                Browse
                            </button>
                        </div>
                    </div>

                    <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-100 p-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab('picture')}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'picture' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Picture
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('video')}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'video' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Video
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('sync-file')}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'sync-file' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Sync File
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('sync-date')}
                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'sync-date' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Sync Date
                        </button>
                    </div>

                    {activeTab === 'picture' && (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-900">Local Thumbnails</h3>
                                        <p className="mt-1 text-xs text-slate-500">Used for local library photos in the gallery.</p>
                                    </div>
                                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={localThumbEnabled}
                                            onChange={(e) => setLocalThumbEnabled(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                        />
                                        <span>Enable</span>
                                    </label>
                                </div>
                                <div className={`mt-4 space-y-3 ${localThumbEnabled ? '' : 'opacity-50'}`}>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Longest Edge</label>
                                        <select value={localLongEdge} onChange={(e) => setLocalLongEdge(Number(e.target.value))} disabled={!localThumbEnabled} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100">
                                            {LONG_EDGE_OPTIONS.map(option => <option key={`local-edge-${option}`} value={option}>{option}px</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">JPEG Quality</label>
                                        <select value={localQuality} onChange={(e) => setLocalQuality(Number(e.target.value))} disabled={!localThumbEnabled} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100">
                                            {QUALITY_OPTIONS.map(option => <option key={`local-quality-${option}`} value={option}>{option}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-900">Cloud Thumbnails</h3>
                                        <p className="mt-1 text-xs text-slate-500">Used for cached cloud photos with long-edge resizing and JPEG quality control.</p>
                                    </div>
                                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={cloudThumbEnabled}
                                            onChange={(e) => setCloudThumbEnabled(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                        />
                                        <span>Enable</span>
                                    </label>
                                </div>
                                <div className={`mt-4 space-y-3 ${cloudThumbEnabled ? '' : 'opacity-50'}`}>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Longest Edge</label>
                                        <select value={cloudLongEdge} onChange={(e) => setCloudLongEdge(Number(e.target.value))} disabled={!cloudThumbEnabled} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100">
                                            {LONG_EDGE_OPTIONS.map(option => <option key={`cloud-edge-${option}`} value={option}>{option}px</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">JPEG Quality</label>
                                        <select value={cloudQuality} onChange={(e) => setCloudQuality(Number(e.target.value))} disabled={!cloudThumbEnabled} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100">
                                            {QUALITY_OPTIONS.map(option => <option key={`cloud-quality-${option}`} value={option}>{option}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'video' && (
                        <div className="space-y-4">
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
                                <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-900">Video Cache</h3>
                                        <p className="mt-1 text-xs text-slate-500">Transcode local videos into cached MP4 files for smoother playback and better compatibility.</p>
                                    </div>
                                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={videoCacheEnabled}
                                            onChange={(e) => setVideoCacheEnabled(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                        />
                                        <span>Enable</span>
                                    </label>
                                </div>
                                <div className={`mt-4 space-y-3 ${videoCacheEnabled ? '' : 'opacity-50'}`}>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Mode</label>
                                        <select
                                            value={videoMode}
                                            onChange={(e) => setVideoMode(e.target.value as 'custom' | 'match-source' | 'preserve-quality')}
                                            disabled={!videoCacheEnabled}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100"
                                        >
                                            {VIDEO_MODE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                        </select>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {videoMode === 'custom' && 'Manually control output resolution and bitrate.'}
                                            {videoMode === 'match-source' && 'Keep source resolution and try to match source bitrate as closely as possible.'}
                                            {videoMode === 'preserve-quality' && 'Keep source resolution and re-encode with a high-quality CRF profile.'}
                                        </p>
                                    </div>
                                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                                            <p className="min-w-0 text-sm font-semibold text-slate-900">Allow upscale</p>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={videoAllowUpscale}
                                                onClick={() => setVideoAllowUpscale((value) => !value)}
                                                disabled={!videoCacheEnabled || videoMode !== 'custom'}
                                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${videoAllowUpscale ? 'bg-cyan-500' : 'bg-slate-300'} disabled:cursor-not-allowed disabled:opacity-50`}
                                            >
                                                <span
                                                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${videoAllowUpscale ? 'translate-x-5' : 'translate-x-1'}`}
                                                />
                                            </button>
                                        </div>
                                        <div className="border-t border-slate-200 px-4 py-3">
                                            <div className="grid grid-cols-[60px_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
                                                <span className="text-sm font-semibold text-slate-900">Format</span>
                                                <div className="flex flex-nowrap justify-start gap-2">
                                                    {VIDEO_FORMAT_OPTIONS.map((option) => {
                                                        const active = videoFormatMode === option.value;
                                                        return (
                                                            <button
                                                                key={option.value}
                                                                type="button"
                                                                onClick={() => applyVideoFormatMode(option.value)}
                                                                disabled={!videoCacheEnabled}
                                                                className={`${option.buttonClassName} shrink-0 whitespace-nowrap rounded-xl border px-3 py-2 text-center text-sm font-semibold transition ${active ? 'border-slate-900 bg-slate-100 text-slate-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-50`}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="border-t border-slate-200 px-4 py-3">
                                            <div className="grid grid-cols-[minmax(0,1fr)_36px_60px_28px] items-center gap-x-3 gap-y-1">
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">Min duration</p>
                                                    <p className="mt-0.5 text-xs text-slate-500">Skip shorter videos</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={videoMinDurationEnabled}
                                                    onClick={() => setVideoMinDurationEnabled((value) => !value)}
                                                    disabled={!videoCacheEnabled}
                                                    className={`relative inline-flex h-6 w-9 shrink-0 items-center rounded-full transition ${videoMinDurationEnabled ? 'bg-cyan-500' : 'bg-slate-300'} disabled:cursor-not-allowed disabled:opacity-50`}
                                                >
                                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${videoMinDurationEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                                                </button>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.1"
                                                    value={videoMinDurationSec}
                                                    onChange={(e) => setVideoMinDurationSec(e.target.value)}
                                                    disabled={!videoCacheEnabled || !videoMinDurationEnabled}
                                                    className="w-[60px] rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100"
                                                />
                                                <span className="text-sm font-medium text-slate-700">s</span>

                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">Min bitrate (MP4)</p>
                                                    <p className="mt-0.5 text-xs text-slate-500">Legacy MP4 threshold</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={videoMp4BitrateThresholdEnabled}
                                                    onClick={() => setVideoMp4BitrateThresholdEnabled((value) => !value)}
                                                    disabled={!videoCacheEnabled || videoFormatMode !== 'mp4-only'}
                                                    className={`relative inline-flex h-6 w-9 shrink-0 items-center rounded-full transition ${videoMp4BitrateThresholdEnabled ? 'bg-cyan-500' : 'bg-slate-300'} disabled:cursor-not-allowed disabled:opacity-50`}
                                                >
                                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${videoMp4BitrateThresholdEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                                                </button>
                                                <input
                                                    type="number"
                                                    min="0.1"
                                                    step="0.1"
                                                    value={videoMp4BitrateThresholdMbps}
                                                    onChange={(e) => setVideoMp4BitrateThresholdMbps(e.target.value)}
                                                    disabled={!videoCacheEnabled || videoFormatMode !== 'mp4-only' || !videoMp4BitrateThresholdEnabled}
                                                    className="w-[60px] rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100"
                                                />
                                                <span className="text-sm font-medium text-slate-700">Mbps</span>
                                            </div>
                                        </div>
                                        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
                                            <p className="text-xs text-slate-500">Short clips are skipped. Videos at or below the selected output bitrate are copied when already MP4, or remuxed to MP4 when possible before falling back to transcoding.</p>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Resolution</label>
                                        <select
                                            value={videoResolution}
                                            onChange={(e) => setVideoResolution(Number(e.target.value))}
                                            disabled={!videoCacheEnabled || videoMode !== 'custom'}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100"
                                        >
                                            {VIDEO_RESOLUTION_OPTIONS.map(option => <option key={`video-resolution-${option}`} value={option}>{option}p</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Bitrate Preset</label>
                                        <select
                                            value={videoBitratePreset}
                                            onChange={(e) => {
                                                const next = e.target.value;
                                                setVideoBitratePreset(next);
                                                if (next !== 'custom') {
                                                    setVideoBitrateInput(next);
                                                }
                                            }}
                                            disabled={!videoCacheEnabled || videoMode !== 'custom'}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100"
                                        >
                                            {VIDEO_BITRATE_OPTIONS.map(option => <option key={`video-bitrate-${option}`} value={String(option)}>{option} Mbps</option>)}
                                            <option value="custom">Custom</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Bitrate (Mbps)</label>
                                        <input
                                            type="number"
                                            min="0.1"
                                            step="0.1"
                                            value={videoBitrateInput}
                                            onChange={(e) => setVideoBitrateInput(e.target.value)}
                                            disabled={!videoCacheEnabled || videoMode !== 'custom'}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100"
                                        />
                                        <p className="mt-1 text-xs text-slate-500">
                                            {videoMode === 'custom'
                                                ? 'Preset values are available, and you can also manually enter any bitrate.'
                                                : 'Disabled for source-matched and preserve-quality modes.'}
                                        </p>
                                    </div>
                                </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-sm font-semibold text-slate-900">Video Cover</h3>
                                            <p className="mt-1 text-xs text-slate-500">Generate static cover images for videos. Disabled by default.</p>
                                        </div>
                                        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={videoThumbEnabled}
                                                onChange={(e) => setVideoThumbEnabled(e.target.checked)}
                                                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                            />
                                            <span>Enable</span>
                                        </label>
                                    </div>
                                    <div className={`mt-4 space-y-3 ${videoThumbEnabled ? '' : 'opacity-50'}`}>
                                        <div>
                                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Longest Edge</label>
                                            <select
                                                value={videoThumbLongEdge}
                                                onChange={(e) => setVideoThumbLongEdge(Number(e.target.value))}
                                                disabled={!videoThumbEnabled}
                                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100"
                                            >
                                                {LONG_EDGE_OPTIONS.map(option => <option key={`video-thumb-edge-${option}`} value={option}>{option}px</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">JPEG Quality</label>
                                            <select
                                                value={videoThumbQuality}
                                                onChange={(e) => setVideoThumbQuality(Number(e.target.value))}
                                                disabled={!videoThumbEnabled}
                                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100"
                                            >
                                                {QUALITY_OPTIONS.map(option => <option key={`video-thumb-quality-${option}`} value={option}>{option}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}

                    {activeTab === 'sync-file' && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-900">Cache / Collection Sync</h3>
                                    <p className="mt-1 text-xs text-slate-500">Preview and sync cached videos with the active collection using safer copy-first rules.</p>
                                </div>
                            </div>

                            <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Sync Direction</label>
                                    <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1">
                                        <button
                                            type="button"
                                            onClick={() => setSyncDirection('cache-to-collection')}
                                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${syncDirection === 'cache-to-collection' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            Cache to Collection
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSyncDirection('collection-to-cache')}
                                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${syncDirection === 'collection-to-cache' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            Collection to Cache
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Keep Rule</label>
                                    <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1">
                                        <button
                                            type="button"
                                            onClick={() => setSyncKeepRule('smaller')}
                                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${syncKeepRule === 'smaller' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            Keep Smaller
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSyncKeepRule('larger')}
                                            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${syncKeepRule === 'larger' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            Keep Larger
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 grid gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Source</label>
                                    <div className="flex gap-2">
                                        <input
                                            value={syncSourcePath}
                                            onChange={(e) => setSyncSourcePath(e.target.value)}
                                            placeholder="Leave empty to use the active collection or cache root"
                                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                                        />
                                        <button type="button" onClick={() => browseSyncPath('source')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                                            Browse
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Target</label>
                                    <div className="flex gap-2">
                                        <input
                                            value={syncTargetPath}
                                            onChange={(e) => setSyncTargetPath(e.target.value)}
                                            placeholder="Leave empty to use the active collection or cache root"
                                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                                        />
                                        <button type="button" onClick={() => browseSyncPath('target')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                                            Browse
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-4">
                                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={syncDeleteSourceFile}
                                        onChange={(e) => setSyncDeleteSourceFile(e.target.checked)}
                                        className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                    />
                                    <span>Delete Source File</span>
                                </label>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={handlePreviewSync}
                                    disabled={syncPreviewing || syncRunning}
                                    className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:bg-slate-400"
                                >
                                    {syncPreviewing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                                    Preview
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRunSync}
                                    disabled={syncPreviewing || syncRunning}
                                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:bg-slate-400"
                                >
                                    {syncRunning ? <Loader2 size={16} className="animate-spin" /> : <MoveRight size={16} />}
                                    Run Sync
                                </button>
                            </div>

                            {syncPreview && (
                                <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="grid gap-3 border-b border-slate-200 px-4 pb-3 md:grid-cols-4 xl:grid-cols-5">
                                        <div className="text-sm font-semibold text-slate-900">Matches: <span className="font-medium text-slate-700">{syncPreview.copyCount + syncPreview.replaceCount}</span></div>
                                        <div className="text-sm font-semibold text-slate-900">Skipped: <span className="font-medium text-slate-700">{syncPreview.skipCount}</span></div>
                                        <div className="text-sm font-semibold text-slate-900">Copies: <span className="font-medium text-slate-700">{syncPreview.copyCount}</span></div>
                                        <div className="text-sm font-semibold text-slate-900">Replaced: <span className="font-medium text-slate-700">{syncPreview.replaceCount}</span></div>
                                        <div className="text-sm font-semibold text-slate-900">Legacy deleted: <span className="font-medium text-slate-700">{syncPreview.deleteLegacyCount}</span></div>
                                    </div>

                                    {renderResultPathRow('Source:', syncPreview.resolvedSourcePath)}
                                    {renderResultPathRow('Target:', syncPreview.resolvedTargetPath)}

                                    {syncPreview.errors.length > 0 && (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                            {syncPreview.errors.join(' | ')}
                                        </div>
                                    )}

                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preview Items</p>
                                        <div className="mt-2 max-h-56 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            {syncPreview.items.length === 0 ? (
                                                <p className="text-sm text-slate-500">No matching video actions were found for the current rules.</p>
                                            ) : syncPreview.items.map((item, index) => (
                                                <div key={`${item.relativePath}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="font-semibold uppercase tracking-wide text-slate-900">{item.action}</span>
                                                        <span className="truncate text-slate-500">{item.relativePath}</span>
                                                    </div>
                                                    <p className="mt-1 text-slate-500">{item.reason}</p>
                                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                                                        <span>Source: {formatFileSize(item.sourceSizeBytes)}</span>
                                                        <span>Target: {formatFileSize(item.targetSizeBytes)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Log</p>
                                <div className="mt-2 max-h-56 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    {syncLogs.length === 0 ? (
                                        <p className="text-sm text-slate-500">No log output yet.</p>
                                    ) : syncLogs.map((entry, index) => (
                                        <div
                                            key={`${entry.text}-${index}`}
                                            className={`rounded-lg border px-3 py-2 text-xs ${entry.level === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-700'}`}
                                        >
                                            {entry.text}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'sync-date' && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-900">Sync Date</h3>
                                    <p className="mt-1 text-xs text-slate-500">Copy source file dates to cache files, and optionally copy EXIF into cached JPEG images.</p>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-4">
                                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={dateSyncEnabled}
                                        onChange={(e) => setDateSyncEnabled(e.target.checked)}
                                        className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                    />
                                    <span>Sync Date</span>
                                </label>
                                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={dateSyncExifEnabled}
                                        onChange={(e) => setDateSyncExifEnabled(e.target.checked)}
                                        className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                    />
                                    <span>Sync EXIF</span>
                                </label>
                            </div>

                            <div className="mt-4 grid gap-3">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Source</label>
                                    <div className="flex gap-2">
                                        <input
                                            value={dateSyncSourcePath}
                                            onChange={(e) => setDateSyncSourcePath(e.target.value)}
                                            placeholder="Leave empty to use the active collection"
                                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                                        />
                                        <button type="button" onClick={() => browseDateSyncPath('source')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                                            Browse
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Target</label>
                                    <div className="flex gap-2">
                                        <input
                                            value={dateSyncTargetPath}
                                            onChange={(e) => setDateSyncTargetPath(e.target.value)}
                                            placeholder="Leave empty to use the local cache root"
                                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                                        />
                                        <button type="button" onClick={() => browseDateSyncPath('target')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                                            Browse
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={handlePreviewDateSync}
                                    disabled={dateSyncPreviewing || dateSyncRunning}
                                    className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:bg-slate-400"
                                >
                                    {dateSyncPreviewing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                                    Preview
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRunDateSync}
                                    disabled={dateSyncPreviewing || dateSyncRunning || (!dateSyncEnabled && !dateSyncExifEnabled)}
                                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:bg-slate-400"
                                >
                                    {dateSyncRunning ? <Loader2 size={16} className="animate-spin" /> : <MoveRight size={16} />}
                                    Run Sync
                                </button>
                            </div>

                            {dateSyncPreview && (
                                <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="grid gap-3 border-b border-slate-200 px-4 pb-3 md:grid-cols-4 xl:grid-cols-5">
                                        <div className="text-sm font-semibold text-slate-900">Matches: <span className="font-medium text-slate-700">{dateSyncPreview.matchedCount}</span></div>
                                        <div className="text-sm font-semibold text-slate-900">Skipped: <span className="font-medium text-slate-700">{dateSyncPreview.skippedCount}</span></div>
                                        <div className="text-sm font-semibold text-slate-900">Date updated: <span className="font-medium text-slate-700">{dateSyncPreview.dateUpdatedCount}</span></div>
                                        <div className="text-sm font-semibold text-slate-900">Media created: <span className="font-medium text-slate-700">{dateSyncPreview.mediaMetadataUpdatedCount}</span></div>
                                        <div className="text-sm font-semibold text-slate-900">EXIF updated: <span className="font-medium text-slate-700">{dateSyncPreview.exifUpdatedCount}</span></div>
                                    </div>

                                    {renderResultPathRow('Source:', dateSyncPreview.resolvedSourcePath)}
                                    {renderResultPathRow('Target:', dateSyncPreview.resolvedTargetPath)}

                                    {dateSyncPreview.errors.length > 0 && (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                            {dateSyncPreview.errors.join(' | ')}
                                        </div>
                                    )}

                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preview Items</p>
                                        <div className="mt-2 max-h-56 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            {dateSyncPreview.items.length === 0 ? (
                                                <p className="text-sm text-slate-500">No matching date-sync actions were found for the current paths.</p>
                                            ) : dateSyncPreview.items.map((item, index) => (
                                                <div key={`${item.relativePath}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="font-semibold uppercase tracking-wide text-slate-900">{item.action}</span>
                                                        <span className="truncate text-slate-500">{item.relativePath}</span>
                                                    </div>
                                                    <p className="mt-1 text-slate-500">{item.reason}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Log</p>
                                <div className="mt-2 max-h-56 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    {dateSyncLogs.length === 0 ? (
                                        <p className="text-sm text-slate-500">No log output yet.</p>
                                    ) : dateSyncLogs.map((entry, index) => (
                                        <div
                                            key={`${entry.text}-${index}`}
                                            className={`rounded-lg border px-3 py-2 text-xs ${entry.level === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-700'}`}
                                        >
                                            {entry.text}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                        <button type="button" onClick={handleOpenCacheFolder} disabled={saving || migrating || rebuilding || checkingCache || !cacheRoot.trim()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400">
                            <FolderOpen size={16} />
                            Open
                        </button>

                        <div className="flex flex-wrap justify-end gap-2">
                            <button type="button" onClick={handleMigrate} disabled={saving || migrating || rebuilding || checkingCache} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:bg-slate-400">
                                {migrating ? <Loader2 size={16} className="animate-spin" /> : <MoveRight size={16} />}
                                Repair Missing
                            </button>
                            <button type="button" onClick={handleCheckCache} disabled={saving || migrating || rebuilding || checkingCache} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:bg-slate-400">
                                {checkingCache ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                                Check Cache
                            </button>
                            <button type="button" onClick={handleRebuild} disabled={saving || migrating || rebuilding || checkingCache} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:bg-slate-400">
                                {rebuilding ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                                Rebuild
                            </button>
                            <button type="button" onClick={handleSave} disabled={saving || migrating || rebuilding || checkingCache} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:bg-slate-400">
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Save
                            </button>
                        </div>
                    </div>
                    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
                </div>
            </div>
        </div>
    );
};
