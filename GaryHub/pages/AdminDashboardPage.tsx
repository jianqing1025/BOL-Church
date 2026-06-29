
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Settings, Plus, Trash2, MessageSquare, RefreshCw, Check, Clock, KeyRound, FolderOpen, Loader2, Save, Image as ImageIconLucide, Type, X, Video, Camera, LogOut, Pencil, UploadCloud, FileText, FileWarning, Download, ExternalLink, FolderInput } from 'lucide-react';
import { AppConfig, GalleryItem, VideoItem, GuestMessage, ScanResultGroup } from '../types';
import { FirebaseService } from '../firebase';
import { getOptimizedUrl } from '../utils';
import { exportViaDirectoryPicker, exportViaBrowserDownload } from '../services/exportService';

// Helper for safe date formatting
const formatDate = (dateVal: any) => {
    if (!dateVal) return 'Unknown';
    // Handle Firebase Timestamp
    if (dateVal.toDate && typeof dateVal.toDate === 'function') {
        return dateVal.toDate().toLocaleString();
    }
    // Handle JS Date or string
    try {
        return new Date(dateVal).toLocaleString();
    } catch (e) {
        return 'Invalid Date';
    }
};

const AdminDashboardPage = ({ 
    galleryData, 
    videosData, 
    appConfig,
    onBack, 
    onLogout,
    onAddGallery, 
    onUpdateGallery,
    onDeleteGallery, 
    onAddVideo, 
    onUpdateVideo,
    onDeleteVideo,
    onUpdateConfig
}: { 
    galleryData: GalleryItem[], 
    videosData: VideoItem[], 
    appConfig: AppConfig,
    onBack: () => void,
    onLogout: () => void,
    onAddGallery: (item: Omit<GalleryItem, 'id'>) => Promise<void>,
    onUpdateGallery: (id: string, item: Partial<GalleryItem>) => Promise<void>,
    onDeleteGallery: (id: string) => Promise<void>,
    onAddVideo: (item: Omit<VideoItem, 'id'>) => Promise<void>,
    onUpdateVideo: (id: string, item: Partial<VideoItem>) => Promise<void>,
    onDeleteVideo: (id: string) => Promise<void>,
    onUpdateConfig: (config: AppConfig) => Promise<void>
}) => {
    const [activeTab, setActiveTab] = useState<'photos' | 'videos' | 'guestbook' | 'settings' | 'import'>('photos');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [guestbookMessages, setGuestbookMessages] = useState<GuestMessage[]>([]);
    const topRef = useRef<HTMLDivElement>(null);
    
    // Config State
    const [localConfig, setLocalConfig] = useState<AppConfig>(appConfig);
    const [configSaved, setConfigSaved] = useState(false);
    const [newHeroUrl, setNewHeroUrl] = useState('');
    
    // New Import Preset State
    const [newImportLabel, setNewImportLabel] = useState('');
    const [newImportCategory, setNewImportCategory] = useState('Beauty');
    const [newImportType, setNewImportType] = useState<'photo' | 'video'>('photo');

    // Photo Form State
    const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
    const [photoUrl, setPhotoUrl] = useState('');
    const [photoTitle, setPhotoTitle] = useState('');
    const [photoCategory, setPhotoCategory] = useState('Moments');

    // Video Form State
    const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
    const [videoUrl, setVideoUrl] = useState('');
    const [videoTitle, setVideoTitle] = useState('');
    const [videoDesc, setVideoDesc] = useState('');
    const [videoCategory, setVideoCategory] = useState('Beauty');

    // Bulk Import State
    const [bulkBaseUrl, setBulkBaseUrl] = useState('/media/');
    const [bulkFilenames, setBulkFilenames] = useState('');
    const [bulkCategory, setBulkCategory] = useState('Moments');
    const [bulkType, setBulkType] = useState<'photo' | 'video'>('photo');

    // --- Duplicate Detection State ---
    const [isScanningDuplicates, setIsScanningDuplicates] = useState(false);
    const [scanProgress, setScanProgress] = useState(0);
    const [duplicateResults, setDuplicateResults] = useState<ScanResultGroup<VideoItem>[]>([]);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [isDownloadingDuplicates, setIsDownloadingDuplicates] = useState(false);

    useEffect(() => {
        if (activeTab === 'guestbook') {
            loadMessages();
        }
    }, [activeTab]);

    const scrollToTop = () => {
        topRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const loadMessages = async () => {
        const msgs = await FirebaseService.fetchMessages();
        setGuestbookMessages(msgs);
    };

    const handleApproveMessage = async (id: string) => {
        await FirebaseService.approveMessage(id);
        loadMessages();
    };

    const handleDeleteMessage = async (id: string) => {
        if (confirm("Permanently delete this message?")) {
            await FirebaseService.deleteMessage(id);
            loadMessages();
        }
    };

    // --- Photo Logic ---
    const handleAddOrUpdatePhoto = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!photoUrl || !photoTitle) return;
        setIsSubmitting(true);
        try {
            if (editingPhotoId) {
                await onUpdateGallery(editingPhotoId, { src: photoUrl, title: photoTitle, category: photoCategory });
                alert('Photo updated successfully!');
                setEditingPhotoId(null);
            } else {
                await onAddGallery({ src: photoUrl, title: photoTitle, category: photoCategory });
                alert('Photo added successfully!');
            }
            setPhotoUrl(''); setPhotoTitle('');
        } finally { setIsSubmitting(false); }
    };

    const startEditPhoto = (item: GalleryItem) => {
        setEditingPhotoId(item.id!);
        setPhotoUrl(item.src);
        setPhotoTitle(item.title);
        setPhotoCategory(item.category);
        scrollToTop();
    };

    const cancelEditPhoto = () => {
        setEditingPhotoId(null);
        setPhotoUrl('');
        setPhotoTitle('');
    };

    // --- Video Logic ---
    const handleAddOrUpdateVideo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!videoUrl || !videoTitle) return;
        setIsSubmitting(true);
        try {
            if (editingVideoId) {
                await onUpdateVideo(editingVideoId, { video: videoUrl, title: videoTitle, desc: videoDesc, category: videoCategory });
                alert('Video updated successfully!');
                setEditingVideoId(null);
            } else {
                await onAddVideo({ video: videoUrl, title: videoTitle, desc: videoDesc, category: videoCategory });
                alert('Video added successfully!');
            }
            setVideoUrl(''); setVideoTitle(''); setVideoDesc('');
        } finally { setIsSubmitting(false); }
    };

    const startEditVideo = (item: VideoItem) => {
        setEditingVideoId(item.id!);
        setVideoUrl(item.video);
        setVideoTitle(item.title);
        setVideoDesc(item.desc);
        setVideoCategory(item.category);
        scrollToTop();
    };

    const cancelEditVideo = () => {
        setEditingVideoId(null);
        setVideoUrl('');
        setVideoTitle('');
        setVideoDesc('');
    };

    // --- Duplicate Detection Logic ---
    const handleScanDuplicates = async () => {
        if (!videosData || videosData.length === 0) {
            alert("No videos to scan.");
            return;
        }
        
        setIsScanningDuplicates(true);
        setScanProgress(0);
        setDuplicateResults([]);
        
        const sizeMap = new Map<number, VideoItem[]>();
        let processed = 0;

        // Helper to format bytes
        const formatBytes = (bytes: number, decimals = 2) => {
            if (!+bytes) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
        };

        try {
            for (const video of videosData) {
                try {
                    // HEAD request to get file size
                    const response = await fetch(video.video, { method: 'HEAD', mode: 'cors' });
                    const lengthHeader = response.headers.get('content-length');
                    
                    if (lengthHeader) {
                        const size = parseInt(lengthHeader, 10);
                        if (!sizeMap.has(size)) {
                            sizeMap.set(size, []);
                        }
                        sizeMap.get(size)?.push(video);
                    } else {
                        // If no content-length (e.g. Opaque response), group by '0' or separate bucket
                        // For now we skip or treat as unknown.
                    }
                } catch (e) {
                    console.warn(`Could not fetch metadata for ${video.title}`, e);
                }
                
                processed++;
                setScanProgress(Math.round((processed / videosData.length) * 100));
            }

            // Filter for groups with > 1 item
            const duplicates: ScanResultGroup<VideoItem>[] = [];
            
            sizeMap.forEach((items, size) => {
                if (items.length > 1) {
                    duplicates.push({
                        size: size,
                        formattedSize: formatBytes(size),
                        items: items
                    });
                }
            });

            // Sort by size descending (largest wastes most space)
            duplicates.sort((a, b) => b.size - a.size);

            setDuplicateResults(duplicates);
            setShowDuplicateModal(true);

        } catch (err) {
            console.error(err);
            alert("Scan failed. Check console for details.");
        } finally {
            setIsScanningDuplicates(false);
        }
    };

    const downloadCSVReport = () => {
        if (duplicateResults.length === 0) return;
        
        const headers = ["Group Size", "File Title", "Video URL", "Created At", "Category"];
        const rows: string[] = [];
        
        duplicateResults.forEach(group => {
            group.items.forEach(item => {
                rows.push([
                    `"${group.formattedSize}"`,
                    `"${item.title.replace(/"/g, '""')}"`, // Escape quotes
                    `"${item.video}"`,
                    `"${formatDate(item.createdAt)}"`,
                    `"${item.category}"`
                ].join(","));
            });
        });

        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `duplicates_report_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadAllDuplicates = async () => {
        if (duplicateResults.length === 0) return;
        
        const allItems: VideoItem[] = [];
        duplicateResults.forEach(group => {
            group.items.forEach(item => allItems.push(item));
        });

        if (allItems.length === 0) return;

        if (!confirm(`Download ${allItems.length} duplicate videos? \n\nTip: A directory picker will open if supported to save all files at once.`)) return;

        setIsDownloadingDuplicates(true);
        try {
            // @ts-ignore
            if (window.showDirectoryPicker) {
                await exportViaDirectoryPicker(allItems, 'video');
            } else {
                await exportViaBrowserDownload(allItems, 'video');
            }
        } catch (e) {
            console.error(e);
            alert("Download failed.");
        } finally {
            setIsDownloadingDuplicates(false);
        }
    };

    // --- Bulk Import Logic ---
    const handleBulkImport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!bulkFilenames || !bulkBaseUrl) return;
        if (!window.confirm(`About to import items. Proceed?`)) return;
        
        setIsSubmitting(true);
        try {
            const files = bulkFilenames.split('\n').map(s => s.trim()).filter(s => s && s.length > 0);
            let count = 0;
            const baseUrl = bulkBaseUrl.endsWith('/') ? bulkBaseUrl : `${bulkBaseUrl}/`;

            for (const filename of files) {
                // Ignore weird system files
                if (filename.toLowerCase() === 'thumbs.db' || filename.startsWith('.')) continue;

                const fullUrl = `${baseUrl}${filename}`;
                const title = filename.replace(/\.[^/.]+$/, ""); // remove extension

                if (bulkType === 'photo') {
                    await onAddGallery({
                        src: fullUrl,
                        title: title,
                        category: bulkCategory
                    });
                } else {
                    await onAddVideo({
                        video: fullUrl,
                        title: title,
                        desc: 'Local Library Import',
                        category: bulkCategory
                    });
                }
                count++;
                // Small delay to prevent UI freezing or rate limiting
                if (count % 20 === 0) await new Promise(r => setTimeout(r, 50));
            }
            alert(`Successfully imported ${count} items into '${bulkCategory}'!`);
            setBulkFilenames('');
        } catch (err: any) {
            console.error(err);
            alert(`Error during bulk import: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveConfig = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onUpdateConfig(localConfig);
            setConfigSaved(true);
            setTimeout(() => setConfigSaved(false), 3000);
        } catch (error: any) {
            console.error("Error saving config:", error);
            alert(`Failed to save settings: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const addHeroImage = () => {
        if (newHeroUrl && !localConfig.heroImages.includes(newHeroUrl)) {
            setLocalConfig({
                ...localConfig,
                heroImages: [...localConfig.heroImages, newHeroUrl]
            });
            setNewHeroUrl('');
        }
    };

    const removeHeroImage = (urlToRemove: string) => {
        setLocalConfig({
            ...localConfig,
            heroImages: localConfig.heroImages.filter(url => url !== urlToRemove)
        });
    };

    // Manage Local Import Presets
    const addImportPreset = () => {
        if (newImportLabel) {
            const newPreset = { 
                id: Date.now().toString(), 
                label: newImportLabel, 
                category: newImportCategory,
                type: newImportType
            };
            setLocalConfig({
                ...localConfig,
                localImports: [...(localConfig.localImports || []), newPreset]
            });
            setNewImportLabel('');
        }
    };

    const removeImportPreset = (id: string) => {
        setLocalConfig({
            ...localConfig,
            localImports: (localConfig.localImports || []).filter(p => p.id !== id)
        });
    };

    return (
        <div className="min-h-screen bg-gray-50 animate-fadeIn font-sans pb-20">
            {/* Duplicates Modal */}
            {showDuplicateModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn" onClick={() => setShowDuplicateModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                    <FileWarning className="text-orange-500" /> Duplicate File Detector
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">Found {duplicateResults.length} groups of files with identical file sizes.</p>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={handleDownloadAllDuplicates} 
                                    disabled={isDownloadingDuplicates}
                                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-2 text-sm font-bold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isDownloadingDuplicates ? <Loader2 size={16} className="animate-spin" /> : <FolderInput size={16} />} 
                                    Download All Files
                                </button>
                                <button onClick={downloadCSVReport} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center gap-2 text-sm font-bold shadow-sm transition-colors">
                                    <FileText size={16} /> Download Report (CSV)
                                </button>
                                <button onClick={() => setShowDuplicateModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"><X size={24} /></button>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 bg-gray-100 space-y-6">
                            {duplicateResults.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                    <Check size={48} className="text-green-400 mb-2" />
                                    <p>No duplicates found based on file size!</p>
                                </div>
                            ) : (
                                duplicateResults.map((group, idx) => (
                                    <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                                            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Group Size: {group.formattedSize} ({group.items.length} files)</span>
                                        </div>
                                        <table className="w-full text-left text-sm">
                                            <thead>
                                                <tr className="border-b border-gray-50 text-gray-400">
                                                    <th className="px-4 py-2 font-medium">Title</th>
                                                    <th className="px-4 py-2 font-medium">Created At</th>
                                                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.items.map(item => (
                                                    <tr key={item.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                                                        <td className="px-4 py-3">
                                                            <div className="font-bold text-gray-800">{item.title}</div>
                                                            <div className="text-xs text-gray-400 truncate max-w-[300px]">{item.video}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                                                            {formatDate(item.createdAt)}
                                                        </td>
                                                        <td className="px-4 py-3 text-right flex justify-end gap-2">
                                                            <a 
                                                                href={item.video} 
                                                                download 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" 
                                                                title="Download File"
                                                            >
                                                                <Download size={16} />
                                                            </a>
                                                            <button 
                                                                onClick={() => { if(confirm('Delete this video?')) onDeleteVideo(item.id!); }}
                                                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    <div ref={topRef} className="flex items-center gap-4">
                         <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors">
                            <ArrowLeft size={20} /> <span className="font-medium hidden sm:inline">Back</span>
                        </button>
                         <h1 className="text-xl font-bold text-gray-800 uppercase tracking-widest flex items-center gap-2 border-l border-gray-200 pl-4">
                            <Settings size={24} className="text-brand" /> <span className="hidden sm:inline">Dashboard</span>
                        </h1>
                    </div>
                   
                    <div className="flex items-center gap-4">
                         <div className="hidden md:flex gap-1">
                            {['photos', 'videos', 'guestbook', 'settings', 'import'].map(tab => (
                                 <button 
                                    key={tab}
                                    onClick={() => setActiveTab(tab as any)} 
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${activeTab === tab ? 'bg-brand text-white shadow-md' : 'text-gray-400 hover:bg-gray-100'}`}
                                 >
                                    {tab}
                                 </button>
                            ))}
                         </div>
                         <button onClick={onLogout} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-red-50 text-gray-600 hover:text-red-500 rounded-lg transition-colors text-sm font-medium">
                            <LogOut size={16} /> <span className="hidden sm:inline">Log Out</span>
                        </button>
                    </div>
                </div>
                {/* Mobile Tab Bar */}
                <div className="md:hidden container mx-auto px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
                     {['photos', 'videos', 'guestbook', 'settings', 'import'].map(tab => (
                         <button 
                            key={tab}
                            onClick={() => setActiveTab(tab as any)} 
                            className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${activeTab === tab ? 'bg-brand text-white' : 'bg-white text-gray-400 border border-gray-100'}`}
                         >
                            {tab}
                         </button>
                    ))}
                </div>
            </nav>

            <div className="container mx-auto px-4 py-8">
                {activeTab === 'photos' && (
                    <div className="max-w-6xl mx-auto space-y-12">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    {editingPhotoId ? <Pencil size={20} className="text-brand" /> : <Plus size={20} className="text-brand" />} 
                                    {editingPhotoId ? 'Edit Photo' : 'Add New Photo'}
                                </span>
                                {editingPhotoId && (
                                    <button onClick={cancelEditPhoto} className="text-xs text-gray-400 hover:text-gray-600 underline">Cancel Edit</button>
                                )}
                            </h2>
                            <form onSubmit={handleAddOrUpdatePhoto} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Photo URL</label>
                                    <input type="url" required value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none" placeholder="https://..." />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Title</label>
                                    <input type="text" required value={photoTitle} onChange={e => setPhotoTitle(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none" placeholder="Memorable moment" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Category</label>
                                    <select value={photoCategory} onChange={e => setPhotoCategory(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none">
                                        <option>Moments</option>
                                        <option>Featured</option>
                                        <option>Portrait</option>
                                        <option>Landscape</option>
                                        {/* Dynamic categories from config if any */}
                                        {(appConfig.photoCategories || []).map(c => !['Moments','Featured','Portrait','Landscape'].includes(c) && <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-4 flex justify-end gap-2">
                                    {editingPhotoId && <button type="button" onClick={cancelEditPhoto} className="px-6 py-2 bg-gray-100 text-gray-600 font-bold rounded-lg hover:bg-gray-200 transition-all">Cancel</button>}
                                    <button type="submit" disabled={isSubmitting} className="px-8 py-2 bg-brand text-white font-bold rounded-lg hover:bg-brand-dark transition-all shadow-md disabled:opacity-50">
                                        {isSubmitting ? 'Saving...' : editingPhotoId ? 'Update Photo' : 'Add Photo'}
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div>
                            <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center justify-between">
                                Existing Photos <span className="text-sm font-normal text-gray-400">{galleryData.length} items</span>
                            </h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                {galleryData.map(item => (
                                    <div key={item.id} className={`group relative aspect-[3/4] rounded-lg overflow-hidden shadow-sm transition-all ${editingPhotoId === item.id ? 'ring-4 ring-brand scale-95' : 'bg-gray-200'}`}>
                                        <img crossOrigin="anonymous" src={getOptimizedUrl(item.src, 'grid')} className="w-full h-full object-cover" alt={item.title} />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center gap-2">
                                            <p className="text-white text-xs font-bold line-clamp-2">{item.title}</p>
                                            <div className="flex gap-2">
                                                <button onClick={() => startEditPhoto(item)} className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors shadow-lg" title="Edit">
                                                    <Pencil size={14} />
                                                </button>
                                                <button onClick={() => { if(confirm('Delete photo?')) onDeleteGallery(item.id!) }} className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg" title="Delete">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'videos' && (
                    <div className="max-w-6xl mx-auto space-y-12">
                         <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    {editingVideoId ? <Pencil size={20} className="text-brand" /> : <Plus size={20} className="text-brand" />} 
                                    {editingVideoId ? 'Edit Video Story' : 'Add New Video Story'}
                                </h2>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={handleScanDuplicates} 
                                        disabled={isScanningDuplicates}
                                        className="px-4 py-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 border border-orange-200"
                                    >
                                        {isScanningDuplicates ? <Loader2 size={16} className="animate-spin" /> : <FileWarning size={16} />}
                                        {isScanningDuplicates ? `Scanning ${scanProgress}%` : 'Scan Duplicates'}
                                    </button>
                                    {editingVideoId && (
                                        <button onClick={cancelEditVideo} className="text-xs text-gray-400 hover:text-gray-600 underline">Cancel Edit</button>
                                    )}
                                </div>
                            </div>
                            <form onSubmit={handleAddOrUpdateVideo} className="grid grid-cols-1 md:grid-cols-6 gap-4">
                                <div className="md:col-span-4">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Video URL (MP4 Link)</label>
                                    <input type="url" required value={videoUrl} onChange={e => setVideoUrl(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none" placeholder="https://..." />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Title</label>
                                    <input type="text" required value={videoTitle} onChange={e => setVideoTitle(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none" placeholder="Chapter name" />
                                </div>
                                <div className="md:col-span-4">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Description</label>
                                    <input type="text" required value={videoDesc} onChange={e => setVideoDesc(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none" placeholder="Short caption..." />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Category</label>
                                    <select value={videoCategory} onChange={e => setVideoCategory(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none">
                                        <option>Beauty</option>
                                        <option>Spicy</option>
                                        <option>Intimate</option>
                                        {/* Dynamic categories */}
                                        {(appConfig.videoCategories || []).map(c => !['Beauty','Spicy','Intimate'].includes(c) && <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-6 flex justify-end gap-2">
                                    {editingVideoId && <button type="button" onClick={cancelEditVideo} className="px-6 py-2 bg-gray-100 text-gray-600 font-bold rounded-lg hover:bg-gray-200 transition-all">Cancel</button>}
                                    <button type="submit" disabled={isSubmitting} className="px-8 py-2 bg-brand text-white font-bold rounded-lg hover:bg-brand-dark transition-all shadow-md disabled:opacity-50">
                                        {isSubmitting ? 'Saving...' : editingVideoId ? 'Update Video' : 'Add Video'}
                                    </button>
                                </div>
                            </form>
                        </div>

                        <div>
                            <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center justify-between">
                                Existing Videos <span className="text-sm font-normal text-gray-400">{videosData.length} items</span>
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {videosData.map(item => (
                                    <div key={item.id} className={`group relative aspect-video rounded-lg overflow-hidden shadow-sm transition-all ${editingVideoId === item.id ? 'ring-4 ring-brand scale-95' : 'bg-black'}`}>
                                        <video crossOrigin="anonymous" src={item.video} className="w-full h-full object-cover opacity-60" muted />
                                        <div className="absolute inset-0 group-hover:bg-black/40 transition-all flex flex-col items-center justify-center p-4 text-center">
                                            <p className="text-white text-xs font-bold mb-1 line-clamp-1">{item.title}</p>
                                            <p className="text-white/70 text-[10px] mb-3 line-clamp-1">{item.category}</p>
                                            <div className="flex gap-2">
                                                 <button onClick={() => startEditVideo(item)} className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors shadow-lg" title="Edit">
                                                    <Pencil size={14} />
                                                </button>
                                                <button onClick={() => { if(confirm('Delete video?')) onDeleteVideo(item.id!) }} className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg" title="Delete">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'guestbook' && (
                    <div className="max-w-4xl mx-auto space-y-8">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><MessageSquare size={20} className="text-brand" /> Guestbook Messages</h2>
                            <button onClick={loadMessages} className="p-2 text-gray-500 hover:text-brand transition-colors bg-gray-50 rounded-full hover:bg-gray-100"><RefreshCw size={20} /></button>
                        </div>

                        <div className="space-y-4">
                            {guestbookMessages.length === 0 ? (
                                <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">No messages found.</div>
                            ) : (
                                guestbookMessages.map(msg => (
                                    <div key={msg.id} className={`bg-white p-6 rounded-xl shadow-sm border transition-all ${msg.approved ? 'border-gray-100' : 'border-yellow-200 bg-yellow-50/30'}`}>
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg uppercase ${msg.approved ? 'bg-brand/10 text-brand' : 'bg-yellow-100 text-yellow-600'}`}>{msg.name.charAt(0)}</div>
                                                <div>
                                                    <h4 className="font-bold text-gray-800">{msg.name}</h4>
                                                    <div className="flex items-center gap-2 text-xs text-gray-500"><span>{msg.email}</span><span>•</span><span>{msg.date}</span></div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                {!msg.approved && (
                                                    <button onClick={() => handleApproveMessage(msg.id)} className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-xs font-bold uppercase tracking-wider shadow-sm">
                                                        <Check size={14} /> Approve
                                                    </button>
                                                )}
                                                <button onClick={() => handleDeleteMessage(msg.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-gray-600 italic leading-relaxed pl-4 border-l-2 border-gray-100">{msg.content}</p>
                                        {!msg.approved && <div className="mt-3 flex items-center gap-2 text-xs text-yellow-600 font-medium bg-yellow-100/50 px-3 py-1 rounded-full w-fit"><Clock size={12} /> Pending Approval</div>}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="max-w-4xl mx-auto space-y-8">
                        {/* Countdown Config */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                             <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2"><Clock size={20} className="text-brand" /> Date & Timer</h2>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Event Date</label>
                                    <input 
                                        type="datetime-local" 
                                        required 
                                        value={localConfig.countdownDate} 
                                        onChange={e => setLocalConfig({...localConfig, countdownDate: e.target.value})} 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">Controls the main countdown timer.</p>
                                </div>
                             </div>
                        </div>

                         {/* Access Control Config */}
                         <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                             <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2"><KeyRound size={20} className="text-brand" /> Site Security</h2>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Site Access Password</label>
                                    <input 
                                        type="text" 
                                        required 
                                        value={localConfig.accessPassword} 
                                        onChange={e => setLocalConfig({...localConfig, accessPassword: e.target.value})} 
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none"
                                        placeholder="e.g. 1005"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">Visitors must enter this to see the site.</p>
                                </div>
                             </div>
                        </div>

                        {/* Local Import Shortcuts Config */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                             <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2"><FolderOpen size={20} className="text-brand" /> Local Folder Shortcuts</h2>
                             <p className="text-sm text-gray-500 mb-4">Create buttons in your galleries that allow you to quickly load files from a local folder. The Label acts as the folder path reminder.</p>
                             
                             <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                                    <div className="md:col-span-5">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Folder Path / Label</label>
                                        <input 
                                            type="text" 
                                            value={newImportLabel} 
                                            onChange={e => setNewImportLabel(e.target.value)} 
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none text-sm"
                                            placeholder="e.g. D:\Photos\Wedding"
                                        />
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Target Page</label>
                                        <select 
                                            value={newImportType} 
                                            onChange={e => setNewImportType(e.target.value as 'photo'|'video')} 
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none text-sm"
                                        >
                                            <option value="photo">Photo Gallery</option>
                                            <option value="video">Video Gallery</option>
                                        </select>
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Category Filter</label>
                                        <select 
                                            value={newImportCategory} 
                                            onChange={e => setNewImportCategory(e.target.value)} 
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none text-sm"
                                        >
                                            <option>Beauty</option>
                                            <option>Spicy</option>
                                            <option>Intimate</option>
                                            <option>Featured</option>
                                            <option>Local</option>
                                            {/* Dynamic categories */}
                                            {(appConfig.photoCategories || []).map(c => !['Beauty','Spicy','Intimate','Featured','Local'].includes(c) && <option key={c}>{c}</option>)}
                                            {(appConfig.videoCategories || []).map(c => !['Beauty','Spicy','Intimate','Featured','Local'].includes(c) && <option key={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="md:col-span-1">
                                        <button onClick={addImportPreset} type="button" className="w-full py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors flex justify-center items-center shadow-sm"><Plus size={20} /></button>
                                    </div>
                                </div>
                             </div>

                             <div className="space-y-2 mt-4">
                                {(localConfig.localImports || []).map((preset) => (
                                    <div key={preset.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
                                                {preset.type === 'video' ? <Video size={18} /> : <Camera size={18} />}
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm text-gray-800 break-all">{preset.label}</div>
                                                <div className="flex gap-2 text-xs text-gray-400 uppercase tracking-wide">
                                                    <span className="bg-gray-100 px-2 py-0.5 rounded">{preset.type === 'video' ? 'Video Gallery' : 'Photo Gallery'}</span>
                                                    <span>Category: {preset.category}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => removeImportPreset(preset.id)} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-full transition-colors"><Trash2 size={16} /></button>
                                    </div>
                                ))}
                                {(!localConfig.localImports || localConfig.localImports.length === 0) && (
                                    <div className="text-center text-xs text-gray-400 py-4 italic">No local import buttons configured. Add one above.</div>
                                )}
                             </div>
                        </div>

                        {/* Hero Slider Config */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                             <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2"><ImageIconLucide size={20} className="text-brand" /> Homepage Hero Slider</h2>
                             <div className="space-y-4">
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={newHeroUrl} 
                                        onChange={e => setNewHeroUrl(e.target.value)} 
                                        placeholder="Add image URL (https://...)" 
                                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none"
                                    />
                                    <button onClick={addHeroImage} type="button" className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-black transition-colors"><Plus size={20} /></button>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {localConfig.heroImages.map((url, idx) => (
                                        <div key={idx} className="relative group aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                                            <img crossOrigin="anonymous" src={url} alt={`Hero ${idx}`} className="w-full h-full object-cover" />
                                            <button 
                                                onClick={() => removeHeroImage(url)} 
                                                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                             </div>
                        </div>

                        {/* Text Content Config */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                             <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2"><Type size={20} className="text-brand" /> Page Content</h2>
                             <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Gallery Title</label>
                                        <input type="text" value={localConfig.galleryTitle} onChange={e => setLocalConfig({...localConfig, galleryTitle: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Gallery Subtitle</label>
                                        <input type="text" value={localConfig.gallerySubtitle} onChange={e => setLocalConfig({...localConfig, gallerySubtitle: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none" />
                                    </div>
                                </div>
                                <div className="border-t border-gray-100 pt-6">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Footer Quote Text</label>
                                    <textarea rows={2} value={localConfig.quoteText} onChange={e => setLocalConfig({...localConfig, quoteText: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Footer Quote Background URL</label>
                                    <input type="text" value={localConfig.quoteImage} onChange={e => setLocalConfig({...localConfig, quoteImage: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none" />
                                </div>
                             </div>
                        </div>

                        <div className="sticky bottom-4 flex justify-end">
                            <button onClick={handleSaveConfig} disabled={isSubmitting} className="px-8 py-3 bg-brand text-white font-bold rounded-full hover:bg-brand-dark transition-all shadow-xl disabled:opacity-50 flex items-center gap-2 transform hover:scale-105">
                                {isSubmitting ? <Loader2 className="animate-spin" /> : <Save size={20} />} 
                                {configSaved ? 'Saved Successfully!' : 'Save All Changes'}
                            </button>
                        </div>
                    </div>
                )}
                
                {activeTab === 'import' && (
                    <div className="max-w-4xl mx-auto space-y-8">
                         <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                             <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2"><UploadCloud size={20} className="text-brand" /> Bulk Import from IIS/Server</h2>
                             <p className="text-sm text-gray-500 mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                This tool allows you to permanently add hundreds of files served by your local IIS or a static file server.
                                <br/><br/>
                                <strong>How to use:</strong>
                                <ul className="list-disc ml-5 mt-2 space-y-1">
                                    <li>Ensure your photos are in a folder mapped to an IIS Virtual Directory (e.g. <code>http://localhost:8080/photos/</code>).</li>
                                    <li>Open Command Prompt in that folder and run: <code>dir /b &gt; list.txt</code></li>
                                    <li>Copy the filenames from <code>list.txt</code> and paste them below.</li>
                                </ul>
                             </p>
                             
                             <form onSubmit={handleBulkImport} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Base URL (Virtual Directory)</label>
                                        <input 
                                            type="text" 
                                            required 
                                            value={bulkBaseUrl} 
                                            onChange={e => setBulkBaseUrl(e.target.value)} 
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none font-mono text-sm"
                                            placeholder="e.g. /media/ or http://localhost:8080/photos/"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">Must end with a slash '/'.</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Content Type</label>
                                            <select 
                                                value={bulkType} 
                                                onChange={e => setBulkType(e.target.value as 'photo'|'video')} 
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none"
                                            >
                                                <option value="photo">Photos</option>
                                                <option value="video">Videos</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Target Category</label>
                                            <select 
                                                value={bulkCategory} 
                                                onChange={e => setBulkCategory(e.target.value)} 
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none"
                                            >
                                                <option>Moments</option>
                                                <option>Featured</option>
                                                <option>Portrait</option>
                                                <option>Landscape</option>
                                                <option>Beauty</option>
                                                <option>Spicy</option>
                                                <option>Intimate</option>
                                                {(appConfig.photoCategories || []).map(c => !['Moments','Featured','Portrait','Landscape','Beauty','Spicy','Intimate'].includes(c) && <option key={c}>{c}</option>)}
                                                {(appConfig.videoCategories || []).map(c => !['Moments','Featured','Portrait','Landscape','Beauty','Spicy','Intimate'].includes(c) && <option key={c}>{c}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Filenames (One per line)</label>
                                    <div className="relative">
                                        <FileText className="absolute left-3 top-3 text-gray-300" size={18} />
                                        <textarea 
                                            required 
                                            rows={12}
                                            value={bulkFilenames} 
                                            onChange={e => setBulkFilenames(e.target.value)} 
                                            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand focus:outline-none transition-all font-mono text-xs leading-relaxed" 
                                            placeholder={`IMG_001.jpg\nIMG_002.jpg\nIMG_003.jpg\n...`} 
                                        />
                                    </div>
                                    <div className="flex justify-between items-center mt-2">
                                        <p className="text-xs text-gray-400">Total lines: {bulkFilenames.split('\n').filter(l => l.trim()).length}</p>
                                        <button type="submit" disabled={isSubmitting} className="px-8 py-3 bg-brand text-white font-bold rounded-lg hover:bg-brand-dark transition-all shadow-md disabled:opacity-50 flex items-center gap-2">
                                            {isSubmitting ? <Loader2 className="animate-spin" /> : <UploadCloud size={20} />} 
                                            Process Bulk Import
                                        </button>
                                    </div>
                                </div>
                             </form>
                         </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboardPage;
