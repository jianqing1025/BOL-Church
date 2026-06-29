import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Menu as MenuIcon } from 'lucide-react';

type BucketProfile = {
    id: string;
    name: string;
};

type CollectionProfile = {
    id: string;
    name: string;
    path: string;
};

type FlyoutKey = 'bucket' | 'collection' | null;

const rowClassName = 'w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-100';
const flyoutItemClassName = 'w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-100';

export const AppMenuButton: React.FC<{ accent: 'rose' | 'cyan' }> = ({ accent }) => {
    const [open, setOpen] = useState(false);
    const [flyoutOpen, setFlyoutOpen] = useState<FlyoutKey>(null);
    const [buckets, setBuckets] = useState<BucketProfile[]>([]);
    const [activeBucketId, setActiveBucketId] = useState<string | null>(null);
    const [collections, setCollections] = useState<CollectionProfile[]>([]);
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    const accentButtonClass = accent === 'rose'
        ? 'text-gray-600 hover:text-rose-500 hover:bg-rose-50'
        : 'text-gray-600 hover:text-cyan-500 hover:bg-cyan-50';
    const accentTextClass = accent === 'rose' ? 'text-rose-600' : 'text-cyan-600';
    const accentBgClass = accent === 'rose' ? 'bg-rose-50 border-rose-200' : 'bg-cyan-50 border-cyan-200';

    const loadMenuData = async () => {
        const api = window.electronAPI;
        if (!api) return;
        try {
            const tasks: Promise<any>[] = [];
            tasks.push(api.bucket?.list?.() || Promise.resolve([]));
            tasks.push(api.bucket?.getActive?.() || Promise.resolve({ id: null }));
            tasks.push(api.collection?.list?.() || Promise.resolve([]));
            tasks.push(api.collection?.getActive?.() || Promise.resolve({ id: null }));
            const [bucketList, activeBucket, collectionList, activeCollection] = await Promise.all(tasks);
            setBuckets((bucketList || []).map((item: any) => ({ id: item.id, name: item.name })));
            setActiveBucketId(activeBucket?.id ?? null);
            setCollections((collectionList || []).map((item: any) => ({ id: item.id, name: item.name, path: item.path })));
            setActiveCollectionId(activeCollection?.id ?? null);
        } catch (error) {
            console.warn('[app-menu] Failed to load menu data:', error);
        }
    };

    const invoke = async (command: string, payload?: any) => {
        await window.electronAPI?.appMenu?.invoke({ command, payload });
        if (command === 'settings:setBucket') {
            setActiveBucketId(payload?.id ?? null);
        }
        if (command === 'settings:setCollection') {
            setActiveCollectionId(payload?.id ?? null);
        }
        setFlyoutOpen(null);
        setOpen(false);
    };

    useEffect(() => {
        if (!open) return;
        void loadMenuData();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onMouseDown = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setOpen(false);
                setFlyoutOpen(null);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (flyoutOpen) setFlyoutOpen(null);
                else setOpen(false);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open, flyoutOpen]);

    if (!window.electronAPI) return null;

    const renderFlyout = () => {
        if (!flyoutOpen) return null;

        if (flyoutOpen === 'bucket') {
            return (
                <div
                    className="absolute left-full top-0 z-[130] w-[18rem] pl-2"
                    onMouseEnter={() => setFlyoutOpen('bucket')}
                >
                    <div className="rounded-2xl border border-gray-300 bg-white p-2 shadow-2xl">
                    <button type="button" onClick={() => invoke('settings:setBucket', { id: '__none__' })} className={flyoutItemClassName}>
                        <span className="min-w-0 flex-1 text-left">None (Local Only)</span>
                        <span className="flex w-4 shrink-0 items-center justify-center text-gray-500">{activeBucketId === '__none__' || !activeBucketId ? <Check size={14} /> : null}</span>
                    </button>
                    {buckets.map(bucket => (
                        <button key={bucket.id} type="button" onClick={() => invoke('settings:setBucket', { id: bucket.id })} className={flyoutItemClassName}>
                            <span className="min-w-0 flex-1 text-left truncate">{bucket.name}</span>
                            <span className="flex w-4 shrink-0 items-center justify-center text-gray-500">{activeBucketId === bucket.id ? <Check size={14} /> : null}</span>
                        </button>
                    ))}
                    </div>
                </div>
            );
        }

        return (
            <div
                className="absolute left-full top-0 z-[130] w-[20rem] pl-2"
                onMouseEnter={() => setFlyoutOpen('collection')}
            >
                <div className="rounded-2xl border border-gray-300 bg-white p-2 shadow-2xl">
                <button type="button" onClick={() => invoke('settings:setCollection', { id: '__none__' })} className={flyoutItemClassName}>
                    <span className="min-w-0 flex-1 text-left">None</span>
                    <span className="flex w-4 shrink-0 items-center justify-center text-gray-500">{activeCollectionId === '__none__' || !activeCollectionId ? <Check size={14} /> : null}</span>
                </button>
                {collections.map(collection => (
                    <button key={collection.id} type="button" onClick={() => invoke('settings:setCollection', { id: collection.id })} className={flyoutItemClassName} title={collection.path}>
                        <span className="min-w-0 flex-1 text-left truncate">{collection.name}</span>
                        <span className="flex w-4 shrink-0 items-center justify-center text-gray-500">{activeCollectionId === collection.id ? <Check size={14} /> : null}</span>
                    </button>
                ))}
                {collections.length === 0 && (
                    <div className="px-3 py-2 text-left text-sm text-gray-400">No collections yet</div>
                )}
                </div>
            </div>
        );
    };

    return (
        <div ref={rootRef} className="relative flex-shrink-0">
            <button
                type="button"
                onClick={() => {
                    setOpen(v => !v);
                    setFlyoutOpen(null);
                }}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm transition-colors ${accentButtonClass}`}
                title="App menu"
                aria-label="App menu"
            >
                <MenuIcon size={18} />
            </button>
            {open && (
                <div className="absolute left-0 top-full z-[120] mt-2 w-[22rem] rounded-2xl border border-gray-300 bg-white p-2 shadow-2xl">
                    <div className={`rounded-xl border px-3 py-2 ${accentBgClass}`}>
                        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-gray-500">GaryLab GalleryHub</div>
                        <div className={`text-sm font-bold ${accentTextClass}`}>Settings</div>
                    </div>

                    <div className="mt-2 space-y-1">
                        <button type="button" onClick={() => invoke('file:mainMenu')} className={rowClassName}><span>Main Menu</span></button>
                        <button type="button" onClick={() => invoke('file:importFolder')} className={rowClassName}><span>Import Folder</span></button>
                        <button type="button" onClick={() => invoke('view:photoGallery')} className={rowClassName}><span>Photo Library</span></button>
                        <button type="button" onClick={() => invoke('view:videoGallery')} className={rowClassName}><span>Video Library</span></button>
                    </div>

                    <div className="my-2 border-t border-gray-200" />

                    <div className="space-y-1">
                        <div
                            className="relative"
                            onMouseEnter={() => setFlyoutOpen('bucket')}
                        >
                            <button
                                type="button"
                                onClick={() => setFlyoutOpen(prev => prev === 'bucket' ? null : 'bucket')}
                                className={rowClassName}
                            >
                                <span>Switch Bucket</span>
                                <ChevronRight size={15} className="text-gray-400" />
                            </button>
                            {flyoutOpen === 'bucket' && renderFlyout()}
                        </div>
                        <div
                            className="relative"
                            onMouseEnter={() => setFlyoutOpen('collection')}
                        >
                            <button
                                type="button"
                                onClick={() => setFlyoutOpen(prev => prev === 'collection' ? null : 'collection')}
                                className={rowClassName}
                            >
                                <span>Switch Collection</span>
                                <ChevronRight size={15} className="text-gray-400" />
                            </button>
                            {flyoutOpen === 'collection' && renderFlyout()}
                        </div>
                        <button type="button" onClick={() => invoke('settings:manageBuckets')} className={rowClassName}><span>R2+D1 Settings</span></button>
                        <button type="button" onClick={() => invoke('settings:manageCollections')} className={rowClassName}><span>Collection Settings</span></button>
                        <button type="button" onClick={() => invoke('settings:manageCache')} className={rowClassName}><span>Cache Settings</span></button>
                    </div>

                    <div className="my-2 border-t border-gray-200" />

                    <div className="space-y-1">
                        <button type="button" onClick={() => invoke('view:reload')} className={rowClassName}><span>Reload</span></button>
                        <button type="button" onClick={() => invoke('view:forceReload')} className={rowClassName}><span>Force Reload</span></button>
                        <button type="button" onClick={() => invoke('view:toggleDevTools')} className={rowClassName}><span>Toggle DevTools</span></button>
                        <button type="button" onClick={() => invoke('view:toggleFullscreen')} className={rowClassName}><span>Toggle FullScreen</span></button>
                    </div>

                    <div className="my-2 border-t border-gray-200" />

                    <div className="space-y-1">
                        <button type="button" onClick={() => invoke('app:versionInfo')} className={rowClassName}><span>Version</span></button>
                        <button type="button" onClick={() => invoke('window:close')} className={rowClassName}><span>Close</span></button>
                        <button type="button" onClick={() => invoke('file:logout')} className={rowClassName}><span>Logout</span></button>
                    </div>
                </div>
            )}
        </div>
    );
};
