import React, { useMemo, useState, useEffect } from 'react';
import { Loader2, Lock, LogOut, X } from 'lucide-react';

// --- Local Imports ---
import { AppConfig, GalleryItem, VideoItem } from './types';
import { getOptimizedUrl, precacheVideo, precacheImage } from './utils';
import ConfirmModal from './components/common/ConfirmModal';
import { BucketSettingsModal } from './components/common/BucketSettingsModal';
import { CollectionSettingsModal } from './components/common/CollectionSettingsModal';
import { CacheSettingsModal } from './components/common/CacheSettingsModal';
import { VersionInfoModal } from './components/common/VersionInfoModal';
import { SlideshowOverlayRenderer, SlideshowSelection } from './components/slideshows/SlideshowOverlayRenderer';

// Pages
import HomePage from './pages/HomePage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import { GalleryPage } from './pages/GalleryPage';
import GuestbookPage from './pages/GuestbookPage';

const DEFAULT_CONFIG: AppConfig = {
    countdownDate: "2010-10-05T09:30",
    heroImages: [],
    galleryTitle: "Photo Gallery",
    gallerySubtitle: "Our favorite moments",
    quoteText: "",
    quoteImage: "",
    accessPassword: "1005",
    localImports: [
        { id: 'default-1', label: 'Load Local Folder', category: 'Local', type: 'video' }
    ],
    photoCategories: ['Moments', 'Featured', 'Portrait', 'Landscape'],
    videoCategories: ['Beauty', 'Spicy', 'Intimate']
};

// Delete a file from R2 storage via server proxy (best-effort)
const deleteR2File = async (fileUrl: string) => {
    try {
        if (!fileUrl || fileUrl.startsWith('/') || fileUrl.startsWith('blob:') || fileUrl.includes('cloudinary.com')) return;
        const key = new URL(fileUrl).pathname.substring(1);
        if (!key) return;
        await fetch('/api/delete-r2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
        });
    } catch (e) {
        console.warn("R2 delete failed, continuing with DB delete:", e);
    }
};

const App = () => {
    const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
    const slideshowWindowToken = searchParams.get('slideshowToken');
    const isStandaloneSlideshowWindow = searchParams.get('slideshowWindow') === '1' && !!slideshowWindowToken;
    const [currentPage, setCurrentPage] = useState('home');
    const [overlayOpen, setOverlayOpen] = useState(false);
    const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_CONFIG);
    const [galleryData, setGalleryData] = useState<GalleryItem[]>([]);
    const [videosData, setVideosData] = useState<VideoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [authChecked, setAuthChecked] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [standaloneSlideshow, setStandaloneSlideshow] = useState<SlideshowSelection | null>(null);
    const [standaloneSlideshowLoading, setStandaloneSlideshowLoading] = useState(isStandaloneSlideshowWindow);
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const apiFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const resp = await fetch(input, { credentials: 'same-origin', ...(init || {}) });
        if (resp.status === 401) {
            setIsAuthenticated(false);
            setCurrentPage('home');
            setIsAdminLoggedIn(false);
            throw new Error('Authentication required');
        }
        return resp;
    };

    const refreshGalleryData = async () => {
        try {
            const galleryResp = await apiFetch('/api/gallery');
            if (galleryResp.status === 503) {
                // D1 not configured (local-only mode) — just clear remote data
                setGalleryData([]);
                return;
            }
            const galleryJson = await galleryResp.json();
            if (!galleryResp.ok) {
                throw new Error(galleryJson.error || 'Failed to refresh photos');
            }
            setGalleryData(galleryJson.items || []);
        } catch (e: any) {
            console.warn('[refresh] Gallery refresh skipped:', e.message);
            // Don't throw — caller should not see errors in local-only mode
        }
    };

    // Admin Login State
    const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
    const [showAdminLogin, setShowAdminLogin] = useState(false);
    const [adminPin, setAdminPin] = useState('');
    const [adminPinError, setAdminPinError] = useState('');

    // Modal State
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'danger' | 'info' | 'success';
        onConfirm?: () => void;
        isAlert?: boolean;
        confirmText?: string;
    }>({ isOpen: false, title: '', message: '', type: 'info' });

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const resp = await fetch('/api/me', { credentials: 'same-origin' });
                const json = await resp.json();
                setIsAuthenticated(!!json.authenticated);
            } catch {
                setIsAuthenticated(false);
            } finally {
                setAuthChecked(true);
            }
        };
        checkAuth();
    }, []);

    // Load Data from D1 via server API
    useEffect(() => {
        const fetchData = async () => {
            if (!authChecked || !isAuthenticated) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const [configResp, galleryResp, videosResp] = await Promise.allSettled([
                    apiFetch('/api/config'),
                    apiFetch('/api/gallery'),
                    apiFetch('/api/videos'),
                ]);

                // Config — skip on 503 (local-only mode)
                if (configResp.status === 'fulfilled' && configResp.value.ok) {
                    const configJson = await configResp.value.json();
                    if (configJson.data) {
                        let loadedConfig = { ...DEFAULT_CONFIG, ...configJson.data };
                        if (!Array.isArray(loadedConfig.localImports)) loadedConfig.localImports = DEFAULT_CONFIG.localImports;
                        if (!Array.isArray(loadedConfig.photoCategories)) loadedConfig.photoCategories = DEFAULT_CONFIG.photoCategories;
                        if (!Array.isArray(loadedConfig.videoCategories)) loadedConfig.videoCategories = DEFAULT_CONFIG.videoCategories;
                        setAppConfig(loadedConfig);
                    }
                }

                // Gallery — empty on 503
                if (galleryResp.status === 'fulfilled' && galleryResp.value.ok) {
                    const galleryJson = await galleryResp.value.json();
                    setGalleryData(galleryJson.items || []);
                } else {
                    setGalleryData([]);
                }

                // Videos — empty on 503
                if (videosResp.status === 'fulfilled' && videosResp.value.ok) {
                    const videosJson = await videosResp.value.json();
                    setVideosData(videosJson.items || []);
                } else {
                    setVideosData([]);
                }

            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [authChecked, isAuthenticated]);

    // --- Caching Logic ---
    useEffect(() => {
        if (videosData.length === 0) return;
        const startBackgroundCaching = async () => {
          for (const video of videosData) {
            await precacheVideo(video.video);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        };
        const timer = setTimeout(() => { startBackgroundCaching(); }, 3000);
        return () => clearTimeout(timer);
    }, [videosData]);

    useEffect(() => {
        if ((galleryData.length === 0) || loading) return;
        const startImageCaching = async () => {
           for (const item of galleryData) {
               const gridUrl = getOptimizedUrl(item.src, 'grid');
               await precacheImage(gridUrl);
               await new Promise(r => setTimeout(r, 50));
           }
        };
        const timer = setTimeout(() => startImageCaching(), 2000);
        return () => clearTimeout(timer);
    }, [galleryData, appConfig, loading]);

    // --- Handlers ---
    const handleUpdateConfig = async (newConfig: AppConfig) => {
        await apiFetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newConfig)
        });
        setAppConfig(newConfig);
    };

    const handleAddCategory = async (type: 'photo' | 'video', newCat: string) => {
        if (!newCat) return;
        const key = type === 'photo' ? 'photoCategories' : 'videoCategories';
        const currentList: string[] = (appConfig as any)[key] || [];
        if (currentList.includes(newCat)) return;
        await handleUpdateConfig({ ...appConfig, [key]: [...currentList, newCat] });
    };

    const handleDeleteCategory = async (type: 'photo' | 'video', catToDelete: string) => {
        setModalConfig({
            isOpen: true,
            title: `Delete Category?`,
            message: `Are you sure you want to remove "${catToDelete}"? Items in this category will not be deleted, but the filter will be removed.`,
            type: 'danger',
            confirmText: 'Delete',
            onConfirm: async () => {
                const key = type === 'photo' ? 'photoCategories' : 'videoCategories';
                const currentList: string[] = (appConfig as any)[key] || [];
                await handleUpdateConfig({ ...appConfig, [key]: currentList.filter((c: string) => c !== catToDelete) });
                setModalConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const handleAddGallery = async (item: Omit<GalleryItem, 'id'>) => {
        const resp = await apiFetch('/api/gallery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || 'Failed to save to database');
        setGalleryData(prev => [{ id: json.id, ...item, createdAt: json.createdAt }, ...prev]);
    };

    const handleUpdateGallery = async (id: string, item: Partial<GalleryItem>) => {
        // Local library assets (id = "local:1:42")
        if (id.startsWith('local:') && window.electronAPI?.localLibrary) {
            const parsed = await window.electronAPI.localLibrary.parseId({ localId: id });
            if (parsed && item.collection && item.album) {
                const results = await window.electronAPI.localLibrary.moveItems({
                    assetIds: [parsed.assetId],
                    collection: item.collection,
                    album: item.album,
                });
                const r = results[0];
                if (r && !r.success) throw new Error(r.error || 'Move failed');
            }
            return;
        }
        // Legacy local items (blob-based)
        if (id.startsWith('local-')) {
            setGalleryData(prev => prev.map(g => g.id === id ? { ...g, ...item } : g));
            return;
        }
        await apiFetch(`/api/gallery/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
        });
        setGalleryData(prev => prev.map(g => g.id === id ? { ...g, ...item } : g));
    };

    const handleDeleteGallery = async (id: string) => {
        // Local library assets
        if (id.startsWith('local:') && window.electronAPI?.localLibrary) {
            const parsed = await window.electronAPI.localLibrary.parseId({ localId: id });
            if (parsed) {
                const results = await window.electronAPI.localLibrary.deleteItems({ assetIds: [parsed.assetId] });
                const r = results[0];
                if (r && !r.success) throw new Error(r.error || 'Delete failed');
            }
            return;
        }
        const item = galleryData.find(i => i.id === id);
        if (id.startsWith('local-')) {
            setGalleryData(prev => prev.filter(i => i.id !== id));
            return;
        }
        if (item?.src) await deleteR2File(item.src);
        await apiFetch(`/api/gallery/${id}`, { method: 'DELETE' });
        setGalleryData(prev => prev.filter(i => i.id !== id));
    };

    const handleAddVideo = async (item: Omit<VideoItem, 'id'>) => {
        const resp = await apiFetch('/api/videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || 'Failed to save to database');
        setVideosData(prev => [{ id: json.id, ...item, createdAt: json.createdAt }, ...prev]);
    };

    const handleUpdateVideo = async (id: string, item: Partial<VideoItem>) => {
        // Local library assets
        if (id.startsWith('local:') && window.electronAPI?.localLibrary) {
            const parsed = await window.electronAPI.localLibrary.parseId({ localId: id });
            if (parsed && item.collection && item.album) {
                const results = await window.electronAPI.localLibrary.moveItems({
                    assetIds: [parsed.assetId],
                    collection: item.collection,
                    album: item.album,
                });
                const r = results[0];
                if (r && !r.success) throw new Error(r.error || 'Move failed');
            }
            return;
        }
        if (id.startsWith('local-')) {
            setVideosData(prev => prev.map(v => v.id === id ? { ...v, ...item } : v));
            return;
        }
        await apiFetch(`/api/videos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
        });
        setVideosData(prev => prev.map(v => v.id === id ? { ...v, ...item } : v));
    };

    const handleDeleteVideo = async (id: string) => {
        // Local library assets
        if (id.startsWith('local:') && window.electronAPI?.localLibrary) {
            const parsed = await window.electronAPI.localLibrary.parseId({ localId: id });
            if (parsed) {
                const results = await window.electronAPI.localLibrary.deleteItems({ assetIds: [parsed.assetId] });
                const r = results[0];
                if (r && !r.success) throw new Error(r.error || 'Delete failed');
            }
            return;
        }
        const item = videosData.find(v => v.id === id);
        if (id.startsWith('local-')) {
            setVideosData(prev => prev.filter(v => v.id !== id));
            return;
        }
        if (item?.video) await deleteR2File(item.video);
        await apiFetch(`/api/videos/${id}`, { method: 'DELETE' });
        setVideosData(prev => prev.filter(v => v.id !== id));
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginPassword.trim()) {
            setLoginError('Password is required.');
            return;
        }
        setIsLoggingIn(true);
        setLoginError('');
        try {
            const resp = await fetch('/api/login', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: loginPassword })
            });
            const json = await resp.json();
            if (!resp.ok) throw new Error(json.error || 'Login failed');
            setIsAuthenticated(true);
            setLoginPassword('');
        } catch (error: any) {
            setLoginError(error?.message || 'Login failed');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleSiteLogout = async () => {
        try {
            await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
        } finally {
            setIsAuthenticated(false);
            setIsAdminLoggedIn(false);
            setCurrentPage('home');
            setGalleryData([]);
            setVideosData([]);
        }
    };

    // Listen for native Electron menu events
    const [showBucketSettings, setShowBucketSettings] = useState(false);
    const [showCollectionSettings, setShowCollectionSettings] = useState(false);
    const [showCacheSettings, setShowCacheSettings] = useState(false);
    const [showVersionInfo, setShowVersionInfo] = useState(false);
    const [, setActiveCollection] = useState<{ id: string | null; name: string; path: string }>({
        id: null,
        name: 'None',
        path: '',
    });

    // Apply active bucket config on startup and when switched via native menu
    const applyBucketConfig = async (isStartup = false) => {
        const api = (window as any).electronAPI;
        if (!api?.bucket) return;
        const { id } = await api.bucket.getActive();
        if (id === '__none__' || !id) {
            await fetch('/api/switch-bucket', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ __none__: true }),
            });
            if (!isStartup) { window.location.reload(); }
        } else {
            const config = await api.bucket.getActiveConfig();
            if (config) {
                await fetch('/api/switch-bucket', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(config),
                });
                if (!isStartup) { window.location.reload(); }
            }
        }
    };

    useEffect(() => {
        if (!isStandaloneSlideshowWindow || !slideshowWindowToken || !window.electronAPI?.slideshow) {
            setStandaloneSlideshowLoading(false);
            return;
        }

        let mounted = true;
        window.electronAPI.slideshow.getPayload({ token: slideshowWindowToken }).then((payload) => {
            if (!mounted) return;
            setStandaloneSlideshow(payload || null);
            setStandaloneSlideshowLoading(false);
        }).catch(() => {
            if (!mounted) return;
            setStandaloneSlideshow(null);
            setStandaloneSlideshowLoading(false);
        });

        return () => {
            mounted = false;
        };
    }, [isStandaloneSlideshowWindow, slideshowWindowToken]);

    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api) return;

        // Apply active bucket on startup (data loaded separately by fetchData effect)
        applyBucketConfig(true);
        api.collection?.getActive?.().then((result: any) => {
            const collection = result?.collection;
            setActiveCollection({
                id: result?.id ?? null,
                name: collection?.name || 'None',
                path: collection?.path || '',
            });
        }).catch(() => {});

        const unsubs = [
            api.onMenuLogout?.(() => handleSiteLogout()),
            api.onMenuMainMenu?.(() => setCurrentPage('home')),
            api.onMenuOpenBucketSettings?.(() => setShowBucketSettings(true)),
            api.onMenuOpenCollectionSettings?.(() => setShowCollectionSettings(true)),
            api.onMenuOpenCacheSettings?.(() => setShowCacheSettings(true)),
            api.onMenuOpenVersionInfo?.(() => setShowVersionInfo(true)),
            api.onBucketChanged?.(() => applyBucketConfig()),
            api.onCollectionChanged?.((data: any) => setActiveCollection({
                id: data?.id ?? null,
                name: data?.name || 'None',
                path: data?.path || '',
            })),
            api.onMenuViewPhotoGallery?.(() => setCurrentPage('photos')),
            api.onMenuViewVideoGallery?.(() => setCurrentPage('videos')),
        ];
        return () => { unsubs.forEach((u: any) => u?.()); };
    }, []);

    const handleCloseStandaloneSlideshow = async () => {
        await window.electronAPI?.slideshow?.closeWindow?.();
        window.close();
    };

    const handleAddLocalVideos = async (targetCategory?: string) => {
        const categoryToUse = targetCategory && targetCategory !== 'All' ? targetCategory : 'Local';
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = 'video/*';
            input.onchange = (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (!files || files.length === 0) return;
                const newLocalVideos: VideoItem[] = [];
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const url = URL.createObjectURL(file);
                    newLocalVideos.push({
                        id: `local-${file.name}-${Date.now()}-${i}`,
                        title: file.name.replace(/\.[^/.]+$/, ""),
                        video: url,
                        desc: 'Loaded from local file',
                        category: categoryToUse,
                        collection: 'Collection',
                        sizeBytes: file.size,
                    });
                }
                if (newLocalVideos.length > 0) setVideosData(prev => [...newLocalVideos, ...prev]);
            };
            input.click();
        } catch (err) {
            console.log("File picker cancelled or failed:", err);
        }
    };

    const handleAddLocalPhotos = async (targetCategory?: string) => {
        const categoryToUse = targetCategory && targetCategory !== 'All' ? targetCategory : 'Local';
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = 'image/*';
            input.onchange = (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (!files || files.length === 0) return;
                const newLocalPhotos: GalleryItem[] = [];
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const url = URL.createObjectURL(file);
                    newLocalPhotos.push({
                        id: `local-${file.name}-${Date.now()}-${i}`,
                        title: file.name.replace(/\.[^/.]+$/, ""),
                        src: url,
                        category: categoryToUse,
                        collection: 'Collection',
                        sizeBytes: file.size,
                        createdAt: new Date()
                    });
                }
                if (newLocalPhotos.length > 0) setGalleryData(prev => [...newLocalPhotos, ...prev]);
            };
            input.click();
        } catch (err) {
            console.log("File picker cancelled or failed:", err);
        }
    };

    // --- RECURSIVE FOLDER IMPORT ---
    const handleAddLocalFolder = async (type: 'photo' | 'video', _targetCategory?: string) => {
        const newItems: any[] = [];
        try {
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                // @ts-ignore
                input.webkitdirectory = true;
                input.multiple = true;

                input.onchange = (e) => {
                    const files = (e.target as HTMLInputElement).files;
                    if (files) {
                        for (let i = 0; i < files.length; i++) {
                            const file = files[i];
                            if (file.name.startsWith('.')) continue;

                            const relativePath: string = (file as any).webkitRelativePath || file.name;
                            const parts = relativePath.split('/');
                            const collection = parts.length >= 3 ? parts[1] : 'Collection';
                            const album      = parts.length >= 4 ? parts[2] : 'Moments';

                            const title = file.name.replace(/\.[^/.]+$/, '');
                            if (type === 'photo' && file.type.startsWith('image/')) {
                                newItems.push({
                                    id: `local-${file.name}-${Date.now()}-${i}`,
                                    title,
                                    src: URL.createObjectURL(file),
                                    collection,
                                    album,
                                    category: album,
                                    sizeBytes: file.size,
                                    createdAt: new Date(),
                                });
                            } else if (type === 'video' && file.type.startsWith('video/')) {
                                newItems.push({
                                    id: `local-${file.name}-${Date.now()}-${i}`,
                                    title,
                                    video: URL.createObjectURL(file),
                                    desc: 'Local Folder Import',
                                    collection,
                                    album,
                                    category: album,
                                    sizeBytes: file.size,
                                    createdAt: new Date(),
                                });
                            }
                        }
                    }
                    if (newItems.length > 0) {
                        const collections = [...new Set(newItems.map((x: any) => x.collection as string))];
                        if (type === 'photo') setGalleryData(prev => [...newItems, ...prev]);
                        else setVideosData(prev => [...newItems, ...prev]);
                        setModalConfig({
                            isOpen: true,
                            title: 'Import Complete',
                            message: `Imported ${newItems.length} file${newItems.length !== 1 ? 's' : ''} into ${collections.join(', ')}.`,
                            type: 'success',
                            isAlert: true,
                        });
                    } else {
                        setModalConfig({ isOpen: true, title: 'No Files', message: 'No matching files found in the selected folder.', type: 'info', isAlert: true });
                    }
                    resolve(null);
                };
                input.click();
            });

        } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error(e);
                setModalConfig({ isOpen: true, title: 'Import Failed', message: e.message, type: 'danger', isAlert: true });
            }
        }
    };

    const handleAdminLogin = () => {
        if (adminPin === appConfig.accessPassword || adminPin === '1005') {
            setIsAdminLoggedIn(true);
            setShowAdminLogin(false);
            setAdminPin('');
            setAdminPinError('');
            setCurrentPage('admin');
        } else {
            setAdminPinError('Incorrect PIN. Please try again.');
        }
    };

    const handleAdminLogout = () => {
        setIsAdminLoggedIn(false);
        setCurrentPage('home');
    };

    if (!authChecked) return (
        <div className="auth-loading-bg">
            <Loader2 className="animate-spin auth-loading-spinner" size={20} />
        </div>
    );

    if (isStandaloneSlideshowWindow) {
        if (standaloneSlideshowLoading) {
            return (
                <div className="auth-loading-bg">
                    <Loader2 className="animate-spin auth-loading-spinner" size={20} />
                </div>
            );
        }

        if (!standaloneSlideshow) {
            return (
                <div className="auth-loading-bg text-white flex flex-col gap-3 items-center justify-center">
                    <div className="text-sm tracking-[0.18em] uppercase opacity-70">Slideshow Payload Unavailable</div>
                </div>
            );
        }

        return (
            <SlideshowOverlayRenderer
                slideshow={standaloneSlideshow}
                onClose={handleCloseStandaloneSlideshow}
                videoFavorites={new Set<string>()}
                onToggleVideoFavorite={() => {}}
            />
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="auth-bg">
                <div className="auth-card">
                    <div className="auth-card-shimmer" />
                    <div className="mb-8 text-center">
                        <div className="auth-icon-wrap">
                            <Lock size={18} />
                        </div>
                        <h1 className="auth-title">ImageHub</h1>
                        <p className="auth-subtitle">Private — enter access key</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-3">
                        <input
                            id="login-password"
                            type="password"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="auth-input"
                            placeholder="Access key"
                            autoFocus
                        />
                        {loginError && <p className="auth-error">{loginError}</p>}
                        <button type="submit" disabled={isLoggingIn} className="auth-btn">
                            {isLoggingIn ? 'Verifying…' : 'Enter'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (loading) return (
        <div className="auth-loading-bg">
            <Loader2 className="animate-spin auth-loading-spinner" size={20} />
        </div>
    );

    return (
        <div className={`font-sans text-[#666] antialiased ${currentPage === 'home' ? 'landing-body' : 'bg-gray-50 h-screen overflow-hidden flex flex-col relative selection:bg-rose-500 selection:text-white'}`}>

            <ConfirmModal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                onConfirm={modalConfig.onConfirm}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                confirmText={modalConfig.isAlert ? 'OK' : 'Confirm'}
                isAlert={modalConfig.isAlert}
            />

            {/* Bucket Settings Modal */}
            <BucketSettingsModal isOpen={showBucketSettings} onClose={() => setShowBucketSettings(false)} />
            <CollectionSettingsModal isOpen={showCollectionSettings} onClose={() => setShowCollectionSettings(false)} />
            <CacheSettingsModal isOpen={showCacheSettings} onClose={() => setShowCacheSettings(false)} />
            <VersionInfoModal isOpen={showVersionInfo} onClose={() => setShowVersionInfo(false)} />

            {/* Admin Login Popup */}
            {showAdminLogin && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md animate-fadeIn" onClick={() => { setShowAdminLogin(false); setAdminPin(''); setAdminPinError(''); }}>
                    <div className="bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl max-w-sm w-full relative border border-white/50" onClick={e => e.stopPropagation()}>
                        <button type="button" title="Close" onClick={() => { setShowAdminLogin(false); setAdminPin(''); setAdminPinError(''); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"><X size={24} /></button>
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4"><Lock size={32} className="text-rose-500" /></div>
                            <h3 className="text-2xl font-bold text-gray-800">Admin Access</h3>
                        </div>
                        <div className="space-y-4">
                            <input
                                type="password"
                                placeholder="Enter PIN"
                                value={adminPin}
                                onChange={e => { setAdminPin(e.target.value); setAdminPinError(''); }}
                                onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 text-center text-lg tracking-widest"
                                autoFocus
                            />
                            {adminPinError && <p className="text-red-500 text-sm text-center">{adminPinError}</p>}
                            <button type="button" onClick={handleAdminLogin} className="w-full py-3 px-4 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-all font-medium">
                                Login
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Main Content (Home) --- */}
            {currentPage === 'home' && (
                <HomePage
                    onNavigate={setCurrentPage}
                    isAdminLoggedIn={isAdminLoggedIn}
                    onAdminClick={() => isAdminLoggedIn ? setCurrentPage('admin') : setShowAdminLogin(true)}
                />
            )}

            {/* GalleryPage acts as the Hub (Library Hub) */}
            {currentPage === 'gallery' && (
                <GalleryPage
                    galleryData={galleryData}
                    videosData={videosData}
                    onRefreshPhotos={refreshGalleryData}
                    onBack={() => setCurrentPage('home')}
                    onAddLocalPhotos={handleAddLocalPhotos}
                    onAddLocalVideos={handleAddLocalVideos}
                    onAddGalleryItem={handleAddGallery}
                    onAddVideoItem={handleAddVideo}
                    onDeleteGalleryItem={handleDeleteGallery}
                    onDeleteVideoItem={handleDeleteVideo}
                    onOverlayChange={setOverlayOpen}
                    onUpdateGalleryItem={handleUpdateGallery}
                    onUpdateVideoItem={handleUpdateVideo}
                    onAddLocalPhotoFolder={(cat) => handleAddLocalFolder('photo', cat)}
                    onAddLocalVideoFolder={(cat) => handleAddLocalFolder('video', cat)}
                    localImports={appConfig.localImports || []}
                    customPhotoCategories={appConfig.photoCategories || []}
                    customVideoCategories={appConfig.videoCategories || []}
                    onAddPhotoCategory={(cat) => handleAddCategory('photo', cat)}
                    onAddVideoCategory={(cat) => handleAddCategory('video', cat)}
                    onDeletePhotoCategory={(cat) => handleDeleteCategory('photo', cat)}
                    onDeleteVideoCategory={(cat) => handleDeleteCategory('video', cat)}
                />
            )}

            {/* Route: Photos Only */}
            {currentPage === 'photos' && (
                <GalleryPage
                    onlyPhotos={true}
                    galleryData={galleryData}
                    videosData={videosData}
                    onRefreshPhotos={refreshGalleryData}
                    onBack={() => setCurrentPage('home')}
                    onAddLocalPhotos={handleAddLocalPhotos}
                    onAddLocalVideos={handleAddLocalVideos}
                    onAddGalleryItem={handleAddGallery}
                    onAddVideoItem={handleAddVideo}
                    onDeleteGalleryItem={handleDeleteGallery}
                    onDeleteVideoItem={handleDeleteVideo}
                    onUpdateGalleryItem={handleUpdateGallery}
                    onUpdateVideoItem={handleUpdateVideo}
                    onAddLocalPhotoFolder={(cat) => handleAddLocalFolder('photo', cat)}
                    onAddLocalVideoFolder={(cat) => handleAddLocalFolder('video', cat)}
                    localImports={appConfig.localImports || []}
                    customPhotoCategories={appConfig.photoCategories || []}
                    customVideoCategories={appConfig.videoCategories || []}
                    onAddPhotoCategory={(cat) => handleAddCategory('photo', cat)}
                    onAddVideoCategory={(cat) => handleAddCategory('video', cat)}
                    onDeletePhotoCategory={(cat) => handleDeleteCategory('photo', cat)}
                    onDeleteVideoCategory={(cat) => handleDeleteCategory('video', cat)}
                    onOverlayChange={setOverlayOpen}
                />
            )}

            {/* Route: Videos Only */}
            {currentPage === 'videos' && (
                <GalleryPage
                    onlyVideos={true}
                    galleryData={galleryData}
                    videosData={videosData}
                    onRefreshPhotos={refreshGalleryData}
                    onBack={() => setCurrentPage('home')}
                    onAddLocalPhotos={handleAddLocalPhotos}
                    onAddLocalVideos={handleAddLocalVideos}
                    onAddGalleryItem={handleAddGallery}
                    onAddVideoItem={handleAddVideo}
                    onDeleteGalleryItem={handleDeleteGallery}
                    onDeleteVideoItem={handleDeleteVideo}
                    onUpdateGalleryItem={handleUpdateGallery}
                    onUpdateVideoItem={handleUpdateVideo}
                    onAddLocalPhotoFolder={(cat) => handleAddLocalFolder('photo', cat)}
                    onAddLocalVideoFolder={(cat) => handleAddLocalFolder('video', cat)}
                    localImports={appConfig.localImports || []}
                    customPhotoCategories={appConfig.photoCategories || []}
                    customVideoCategories={appConfig.videoCategories || []}
                    onAddPhotoCategory={(cat) => handleAddCategory('photo', cat)}
                    onAddVideoCategory={(cat) => handleAddCategory('video', cat)}
                    onDeletePhotoCategory={(cat) => handleDeleteCategory('photo', cat)}
                    onDeleteVideoCategory={(cat) => handleDeleteCategory('video', cat)}
                    onOverlayChange={setOverlayOpen}
                />
            )}

            {currentPage === 'guestbook' && <GuestbookPage galleryData={galleryData} onNavigate={setCurrentPage} />}

            {currentPage === 'admin' && (
                <AdminDashboardPage
                    galleryData={galleryData}
                    videosData={videosData}
                    appConfig={appConfig}
                    onBack={() => setCurrentPage('home')}
                    onLogout={handleAdminLogout}
                    onAddGallery={handleAddGallery}
                    onUpdateGallery={handleUpdateGallery}
                    onDeleteGallery={handleDeleteGallery}
                    onAddVideo={handleAddVideo}
                    onUpdateVideo={handleUpdateVideo}
                    onDeleteVideo={handleDeleteVideo}
                    onUpdateConfig={handleUpdateConfig}
                />
            )}
        </div>
    );
};

export default App;
