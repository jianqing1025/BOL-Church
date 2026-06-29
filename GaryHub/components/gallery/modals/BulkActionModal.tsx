
import React, { useState, useEffect } from 'react';
import { X, Copy, FolderInput, Loader2, FolderOpen, ArrowRightLeft } from 'lucide-react';
import { isElectron } from '../../../utils';

const RESERVED_FILTER_KEYS = new Set(['all', 'favorites']);
const isReservedFacetLabel = (value: string): boolean => RESERVED_FILTER_KEYS.has(value.trim().toLowerCase());
const ROOT_ALBUM_OPTION = '/';
const normalizeAlbumSelection = (value: string): string => value.trim() === ROOT_ALBUM_OPTION ? 'Uncategorized' : value.trim();
const toAlbumOptionValue = (value: string): string => value.trim() === 'Uncategorized' ? ROOT_ALBUM_OPTION : value;

const TRANSFER_HISTORY_KEY = 'galleryhub:transfer-history';
const MAX_TRANSFER_HISTORY = 8;

function getTransferHistory(): string[] {
    try { return JSON.parse(localStorage.getItem(TRANSFER_HISTORY_KEY) || '[]'); } catch { return []; }
}
function pushTransferHistory(dir: string) {
    const list = getTransferHistory().filter(d => d !== dir);
    list.unshift(dir);
    localStorage.setItem(TRANSFER_HISTORY_KEY, JSON.stringify(list.slice(0, MAX_TRANSFER_HISTORY)));
}

interface BulkActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    actionType: 'move' | 'copy' | null;
    onConfirm: (
        collection: string,
        album: string,
        options?: { preserveFolderStructure?: boolean },
        onProgress?: (done: number, total: number) => void,
    ) => Promise<void>;
    onTransfer?: (args: {
        targetDir: string;
        album: string;
        resizePicture: boolean;
        maxLongEdge: number;
        jpegQuality: number;
        loadToLibrary: boolean;
        preserveFolderStructure?: boolean;
    }, onProgress?: (done: number, total: number) => void) => Promise<void>;
    existingCollections: string[];
    collectionAlbums: Array<{ collection: string; album: string }>;
    selectedCount: number;
    defaultCollection?: string;
    defaultAlbum?: string;
}

const LONG_EDGE_OPTIONS = [3840, 2560, 1920, 1280];
const QUALITY_OPTIONS = [1.00, 0.95, 0.90, 0.85, 0.80];

export const BulkActionModal: React.FC<BulkActionModalProps> = ({
    isOpen,
    onClose,
    actionType,
    onConfirm,
    onTransfer,
    existingCollections,
    collectionAlbums,
    selectedCount,
    defaultCollection = '',
    defaultAlbum = '',
}) => {
    // ─── Tab state ──────────────────────────────────────────────────────────
    const [tab, setTab] = useState<'move' | 'transfer'>('move');

    // ─── Move state ─────────────────────────────────────────────────────────
    const [targetCollection, setTargetCollection] = useState(defaultCollection);
    const [customCollection, setCustomCollection] = useState('');
    const [targetAlbum, setTargetAlbum] = useState(defaultAlbum);
    const [customAlbum, setCustomAlbum] = useState('');
    const [preserveFolderStructure, setPreserveFolderStructure] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // ─── Transfer state ─────────────────────────────────────────────────────
    const [transferDir, setTransferDir] = useState('');
    const [transferHistory, setTransferHistory] = useState<string[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [transferSubfolders, setTransferSubfolders] = useState<string[]>([]);
    const [transferAlbum, setTransferAlbum] = useState('');
    const [transferCustomAlbum, setTransferCustomAlbum] = useState('');
    const [resizePicture, setResizePicture] = useState(false);
    const [maxLongEdge, setMaxLongEdge] = useState(2560);
    const [jpegQuality, setJpegQuality] = useState(0.90);
    const [loadToLibrary, setLoadToLibrary] = useState(false);
    const [isLoadingSubfolders, setIsLoadingSubfolders] = useState(false);

    const availableCollections = existingCollections.filter(c => !isReservedFacetLabel(c));
    const initialCollection = !isReservedFacetLabel(defaultCollection)
        ? defaultCollection
        : (availableCollections[0] || '');
    const [wasOpen, setWasOpen] = useState(false);
    const availableAlbums = Array.from(new Set(
        collectionAlbums
            .filter(item => item.collection.trim().toLowerCase() === targetCollection.trim().toLowerCase())
            .map(item => item.album)
            .filter(album => album && !isReservedFacetLabel(album))
    )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const albumOptions = Array.from(new Set([ROOT_ALBUM_OPTION, ...availableAlbums.map(toAlbumOptionValue)]));

    useEffect(() => {
        if (isOpen && !wasOpen) {
            setTab('move');
            setTargetCollection(initialCollection);
            setCustomCollection('');
            setTargetAlbum(defaultAlbum ? toAlbumOptionValue(defaultAlbum) : ROOT_ALBUM_OPTION);
            setCustomAlbum('');
            setPreserveFolderStructure(false);
            setError(null);
            setProgress(null);
            const hist = getTransferHistory();
            setTransferHistory(hist);
            setTransferDir(hist[0] || '');
            setShowHistory(false);
            setTransferSubfolders([]);
            setTransferAlbum('');
            setTransferCustomAlbum('');
            setResizePicture(false);
            setMaxLongEdge(2560);
            setJpegQuality(0.90);
            setLoadToLibrary(false);
        }
        setWasOpen(isOpen);
    }, [isOpen, wasOpen, initialCollection, defaultAlbum]);

    useEffect(() => {
        if (!isOpen || customCollection.trim()) return;

        const currentIsValid = albumOptions.some(album =>
            normalizeAlbumSelection(album).toLowerCase() === normalizeAlbumSelection(targetAlbum).toLowerCase()
        );
        if (currentIsValid) return;

        const normalizedDefaultAlbum = normalizeAlbumSelection(defaultAlbum);
        const defaultMatchesCollection = normalizedDefaultAlbum
            && collectionAlbums.some(item =>
                item.collection.trim().toLowerCase() === targetCollection.trim().toLowerCase()
                && item.album.trim().toLowerCase() === normalizedDefaultAlbum.toLowerCase()
            );

        setTargetAlbum(defaultMatchesCollection
            ? toAlbumOptionValue(normalizedDefaultAlbum)
            : ROOT_ALBUM_OPTION);
    }, [isOpen, customCollection, targetCollection, defaultAlbum, targetAlbum, collectionAlbums, albumOptions]);

    // Load subfolders when transferDir changes
    useEffect(() => {
        if (!transferDir || !isElectron()) return;
        let cancelled = false;
        setIsLoadingSubfolders(true);
        window.electronAPI!.transfer.listSubfolders(transferDir).then(folders => {
            if (cancelled) return;
            setTransferSubfolders(folders);
            setTransferAlbum(folders[0] || '');
            setIsLoadingSubfolders(false);
        }).catch(() => { if (!cancelled) setIsLoadingSubfolders(false); });
        return () => { cancelled = true; };
    }, [transferDir]);

    if (!isOpen || !actionType) return null;

    // ─── Move logic ─────────────────────────────────────────────────────────
    const finalCollection = (customCollection.trim() || targetCollection).trim();
    const finalAlbum = customAlbum.trim() || normalizeAlbumSelection(targetAlbum);
    const canConfirmMove = !!finalCollection && !!finalAlbum;

    const handleConfirmMove = async () => {
        if (!canConfirmMove) { setError('Please select a destination collection and album.'); return; }
        if (isReservedFacetLabel(finalCollection)) { setError(`"${finalCollection}" is reserved and cannot be used as a collection name.`); return; }
        if (isReservedFacetLabel(finalAlbum)) { setError(`"${finalAlbum}" is reserved and cannot be used as an album name.`); return; }
        setIsProcessing(true);
        setError(null);
        setProgress(null);
        try {
            await onConfirm(
                finalCollection,
                finalAlbum,
                { preserveFolderStructure },
                (done, total) => setProgress({ done, total }),
            );
        } finally {
            setIsProcessing(false);
            setProgress(null);
        }
    };

    // ─── Transfer logic ─────────────────────────────────────────────────────
    const finalTransferAlbum = (transferCustomAlbum.trim() || transferAlbum).trim();
    const canConfirmTransfer = !!transferDir;

    const handlePickFolder = async () => {
        if (!isElectron()) return;
        const dir = await window.electronAPI!.pickDirectory({ title: 'Select target folder for transfer' });
        if (dir) setTransferDir(dir);
    };

    const handleConfirmTransfer = async () => {
        if (!canConfirmTransfer || !onTransfer) { setError('Please select a target folder.'); return; }
        setIsProcessing(true);
        setError(null);
        setProgress(null);
        try {
            await onTransfer({
                targetDir: transferDir,
                album: finalTransferAlbum,
                resizePicture,
                maxLongEdge,
                jpegQuality,
                loadToLibrary,
                preserveFolderStructure,
            }, (done, total) => setProgress({ done, total }));
            pushTransferHistory(transferDir);
        } finally {
            setIsProcessing(false);
            setProgress(null);
        }
    };

    const isCopy = actionType === 'copy';
    const showTransferTab = isElectron() && onTransfer && !isCopy;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn" onClick={() => !isProcessing && onClose()}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => { e.stopPropagation(); setShowHistory(false); }}>
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        {isCopy
                            ? <><Copy size={20} className="text-blue-500" /> Copy Items</>
                            : tab === 'transfer'
                                ? <><ArrowRightLeft size={20} className="text-purple-500" /> Transfer Items</>
                                : <><FolderInput size={20} className="text-orange-500" /> Move Items</>
                        }
                    </h3>
                    <button type="button" onClick={onClose} disabled={isProcessing} title="Close" className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30"><X size={24} /></button>
                </div>

                {/* Tabs */}
                {showTransferTab && (
                    <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
                        <button
                            type="button"
                            onClick={() => { setTab('move'); setError(null); }}
                            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${tab === 'move' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <FolderInput size={14} className="inline mr-1.5 -mt-0.5" />Move
                        </button>
                        <button
                            type="button"
                            onClick={() => { setTab('transfer'); setError(null); }}
                            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-bold transition-all ${tab === 'transfer' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <ArrowRightLeft size={14} className="inline mr-1.5 -mt-0.5" />Transfer
                        </button>
                    </div>
                )}

                <p className="text-gray-600 mb-4 text-sm">
                    {tab === 'transfer' ? 'Transfer' : isCopy ? 'Copy' : 'Move'} <span className="font-bold text-gray-900">{selectedCount}</span> selected item{selectedCount !== 1 ? 's' : ''}{tab === 'transfer' ? ' to local folder:' : ' to:'}
                </p>

                {/* ════════ Move Tab ════════ */}
                {tab === 'move' && (
                    <>
                        <div className="mb-4">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Destination Collection</label>
                            <div className="flex gap-2">
                                <select
                                    title="Select destination collection"
                                    value={customCollection ? '' : targetCollection}
                                    onChange={e => { setTargetCollection(e.target.value); setCustomCollection(''); setCustomAlbum(''); }}
                                    disabled={isProcessing || !!customCollection || availableCollections.length === 0}
                                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none disabled:opacity-50 text-sm"
                                >
                                    {availableCollections.length === 0 && <option value="" disabled>Type a name →</option>}
                                    {availableCollections.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <input
                                    type="text"
                                    value={customCollection}
                                    onChange={e => { setCustomCollection(e.target.value); setTargetAlbum(''); setCustomAlbum(''); }}
                                    disabled={isProcessing}
                                    placeholder="...or new"
                                    className="w-28 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none text-sm"
                                />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">Reserved names: All, Favorites</p>
                        </div>
                        <div className="mb-5">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Destination Album</label>
                            <div className="flex gap-2">
                                <select
                                    title="Select destination album"
                                    value={customAlbum ? '' : targetAlbum}
                                    onChange={e => { setTargetAlbum(e.target.value); setCustomAlbum(''); }}
                                    disabled={isProcessing || !!customAlbum || !!customCollection.trim() || albumOptions.length === 0}
                                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none disabled:opacity-50 text-sm"
                                >
                                    {albumOptions.length === 0 && <option value="" disabled>Type a name →</option>}
                                    {albumOptions.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                                <input
                                    type="text"
                                    value={customAlbum}
                                    onChange={e => setCustomAlbum(e.target.value)}
                                    disabled={isProcessing}
                                    placeholder="...or new"
                                    className="w-28 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none text-sm"
                                />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">Reserved names: All, Favorites</p>
                        </div>

                        <div className="mb-5 rounded-xl border border-orange-100 bg-orange-50/60 p-4">
                            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                                <input
                                    type="checkbox"
                                    checked={preserveFolderStructure}
                                    onChange={e => setPreserveFolderStructure(e.target.checked)}
                                    disabled={isProcessing}
                                    className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                                />
                                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">Preserve folder structure</span>
                            </label>
                            <p className="mt-1 text-[11px] text-gray-500">
                                {isCopy
                                    ? 'Copy selected local files under the destination while keeping their original subfolder layout.'
                                    : 'Move selected local files under the new destination while keeping their original subfolder layout.'}
                            </p>
                        </div>
                    </>
                )}

                {/* ════════ Transfer Tab ════════ */}
                {tab === 'transfer' && (
                    <>
                        {/* Target folder with history */}
                        <div className="mb-4 relative">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Target Folder</label>
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <input
                                        type="text"
                                        value={transferDir}
                                        onChange={e => { setTransferDir(e.target.value); setShowHistory(false); }}
                                        onFocus={() => { if (transferHistory.length > 0) setShowHistory(true); }}
                                        disabled={isProcessing}
                                        placeholder="Select or type a path..."
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none text-sm font-mono text-xs"
                                    />
                                    {showHistory && transferHistory.length > 0 && (
                                        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50 max-h-48 overflow-y-auto">
                                            <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase">Recent</div>
                                            {transferHistory.map((h, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => { setTransferDir(h); setShowHistory(false); }}
                                                    className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-purple-50 truncate ${h === transferDir ? 'text-purple-600 bg-purple-50/50' : 'text-gray-600'}`}
                                                >
                                                    {h}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { handlePickFolder(); setShowHistory(false); }}
                                    disabled={isProcessing}
                                    className="px-3 py-2 bg-purple-50 border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
                                    title="Browse..."
                                >
                                    <FolderOpen size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Album (subfolder) */}
                        <div className="mb-4">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Album / Subfolder <span className="font-normal normal-case text-gray-300">(optional)</span></label>
                            <div className="flex gap-2">
                                <select
                                    title="Select subfolder"
                                    value={transferCustomAlbum ? '' : transferAlbum}
                                    onChange={e => { setTransferAlbum(e.target.value); setTransferCustomAlbum(''); }}
                                    disabled={isProcessing || !!transferCustomAlbum || transferSubfolders.length === 0}
                                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none disabled:opacity-50 text-sm"
                                >
                                    {isLoadingSubfolders && <option value="">Loading...</option>}
                                    {!isLoadingSubfolders && transferSubfolders.length === 0 && <option value="" disabled>Type a name →</option>}
                                    {transferSubfolders.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                                <input
                                    type="text"
                                    value={transferCustomAlbum}
                                    onChange={e => setTransferCustomAlbum(e.target.value)}
                                    disabled={isProcessing}
                                    placeholder="...or new"
                                    className="w-28 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none text-sm"
                                />
                            </div>
                        </div>

                        {/* Resize checkbox + conditional params */}
                        <label className="flex items-center gap-2.5 mb-3 cursor-pointer select-none group">
                            <input
                                type="checkbox"
                                checked={resizePicture}
                                onChange={e => setResizePicture(e.target.checked)}
                                disabled={isProcessing}
                                className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-400"
                            />
                            <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">Resize picture</span>
                        </label>
                        {resizePicture && (
                            <div className="grid grid-cols-2 gap-3 mb-4 ml-6 pl-1 border-l-2 border-purple-100">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Max Long Edge</label>
                                    <select
                                        title="Max long edge"
                                        value={maxLongEdge}
                                        onChange={e => setMaxLongEdge(Number(e.target.value))}
                                        disabled={isProcessing}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none text-sm"
                                    >
                                        {LONG_EDGE_OPTIONS.map(v => <option key={v} value={v}>{v}px</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">JPEG Quality</label>
                                    <select
                                        title="JPEG quality"
                                        value={jpegQuality}
                                        onChange={e => setJpegQuality(Number(e.target.value))}
                                        disabled={isProcessing}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none text-sm"
                                    >
                                        {QUALITY_OPTIONS.map(v => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="mb-4 rounded-xl border border-purple-100 bg-purple-50/50 p-4">
                            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                                <input
                                    type="checkbox"
                                    checked={preserveFolderStructure}
                                    onChange={e => setPreserveFolderStructure(e.target.checked)}
                                    disabled={isProcessing}
                                    className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-400"
                                />
                                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">Preserve folder structure</span>
                            </label>
                            <p className="mt-1 text-[11px] text-gray-500">
                                Transfer selected local files under the destination while keeping their original subfolder layout.
                            </p>
                        </div>

                        {/* Load to library checkbox */}
                        <label className="flex items-center gap-2.5 mb-4 cursor-pointer select-none group">
                            <input
                                type="checkbox"
                                checked={loadToLibrary}
                                onChange={e => setLoadToLibrary(e.target.checked)}
                                disabled={isProcessing}
                                className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-400"
                            />
                            <span className="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">Load target folder to library after transfer</span>
                        </label>
                    </>
                )}

                {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

                {/* Footer */}
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} disabled={isProcessing} className="px-5 py-2.5 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50">
                        Cancel
                    </button>
                    {tab === 'move' ? (
                        <button
                            onClick={handleConfirmMove}
                            disabled={!canConfirmMove || isProcessing}
                            className={`px-5 py-2.5 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 ${
                                !canConfirmMove || isProcessing
                                    ? 'bg-gray-300 cursor-not-allowed'
                                    : isCopy ? 'bg-blue-500 hover:bg-blue-600' : 'bg-orange-500 hover:bg-orange-600'
                            }`}
                        >
                            {isProcessing
                                ? <><Loader2 size={16} className="animate-spin" /> {progress ? `${isCopy ? 'Copying' : 'Moving'} ${progress.done} / ${progress.total}...` : 'Processing...'}</>
                                : `${isCopy ? 'Copy' : 'Move'} ${selectedCount}`
                            }
                        </button>
                    ) : (
                        <button
                            onClick={handleConfirmTransfer}
                            disabled={!canConfirmTransfer || isProcessing}
                            className={`px-5 py-2.5 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2 ${
                                !canConfirmTransfer || isProcessing
                                    ? 'bg-gray-300 cursor-not-allowed'
                                    : 'bg-purple-500 hover:bg-purple-600'
                            }`}
                        >
                            {isProcessing
                                ? <><Loader2 size={16} className="animate-spin" /> {progress ? `${resizePicture ? 'Resizing' : 'Transferring'} ${progress.done} / ${progress.total}...` : 'Preparing...'}</>
                                : `Transfer ${selectedCount}`
                            }
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
