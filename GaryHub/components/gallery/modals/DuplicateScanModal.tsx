
import React, { useState } from 'react';
import { X, FileWarning, FileText, CheckCircle, Download, Film, Loader2, FolderInput, Trash2 } from 'lucide-react';
import { ScanResultGroup, VideoItem, GalleryItem } from '../../../types';
import { getOptimizedUrl } from '../../../utils';
import { exportViaDirectoryPicker, exportViaBrowserDownload } from '../../../services/exportService';

interface DuplicateScanModalProps {
    isOpen: boolean;
    onClose: () => void;
    scanResults: ScanResultGroup[];
    scanType: 'photo' | 'video' | null;
    onDeleteItem?: (id: string) => Promise<void>;
    onMoveSelected?: (ids: string[]) => void;
}

const formatDate = (dateVal: any) => {
    if (!dateVal) return 'Unknown';
    if (dateVal.toDate && typeof dateVal.toDate === 'function') return dateVal.toDate().toLocaleString();
    try { return new Date(dateVal).toLocaleString(); } catch (e) { return 'Invalid Date'; }
};

export const DuplicateScanModal: React.FC<DuplicateScanModalProps> = ({
    isOpen, onClose, scanResults, scanType, onDeleteItem, onMoveSelected,
}) => {
    const [isDownloading, setIsDownloading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectPhase, setSelectPhase] = useState<0 | 1 | 2>(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteProgress, setDeleteProgress] = useState<{ done: number; total: number } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[] } | null>(null);
    const [deleteResult, setDeleteResult] = useState<{ succeeded: number; failed: number } | null>(null);

    if (!isOpen) return null;

    // Flatten all selectable items
    const allItems: any[] = [];
    scanResults.forEach(group => group.items.forEach(item => { if (item.id) allItems.push(item); }));
    const allIds = allItems.map(i => i.id as string);
    const selectedCount = selectedIds.size;
    const totalCount = allIds.length;
    const toggleItem = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const downloadDuplicateReport = () => {
        if (scanResults.length === 0) return;
        const headers = ["Group Size (Bytes)", "File Title", "File URL", "Created At", "Category"];
        const rows: string[] = [];
        scanResults.forEach(group => {
            group.items.forEach(item => {
                const url = 'video' in item ? (item as VideoItem).video : (item as GalleryItem).src;
                rows.push([`"${group.size}"`, `"${item.title.replace(/"/g, '""')}"`, `"${url}"`, `"${formatDate(item.createdAt)}"`, `"${item.category}"`].join(","));
            });
        });
        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.join("\n");
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `${scanType}_duplicates_report.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadSelected = async () => {
        if (selectedCount === 0) return;
        const items = allItems.filter(i => selectedIds.has(i.id));
        if (items.length === 0) return;
        setIsDownloading(true);
        try {
            // @ts-ignore
            if (window.showDirectoryPicker) {
                await exportViaDirectoryPicker(items, scanType || 'video');
            } else {
                await exportViaBrowserDownload(items, scanType || 'video');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsDownloading(false);
        }
    };

    /** Check if a string contains a temp/tmp marker anywhere (case-insensitive) */
    const containsTempMarker = (value?: string): boolean => {
        if (!value) return false;
        return /temp\d*|tmp\d*/i.test(value.trim());
    };

    /** Check if a string contains uncategorized/backup/other marker (case-insensitive) */
    const containsFallbackMarker = (value?: string): boolean => {
        if (!value) return false;
        return /uncategorized|backup|other/i.test(value.trim());
    };

    type DupeItem = { collection?: string; album?: string; category?: string; title?: string; src?: string; id?: string };

    /** Priority 1: temp/tmp in collection, album, or filename */
    const isTempCandidate = (item: DupeItem): boolean => {
        return containsTempMarker(item.collection)
            || containsTempMarker(item.album || item.category)
            || containsTempMarker(item.title);
    };

    /** Priority 2: uncategorized/backup/other in collection, album, or filename */
    const isFallbackCandidate = (item: DupeItem): boolean => {
        return containsFallbackMarker(item.collection)
            || containsFallbackMarker(item.album || item.category)
            || containsFallbackMarker(item.title);
    };

    const handleSelectCycle = () => {
        if (selectPhase === 0) {
            // Auto-select duplicates by priority:
            //  1) temp candidates → select those, keep non-temp
            //  2) fallback candidates (uncategorized/backup/other) → select those, keep rest
            //  3) no markers → keep first item, select the rest
            const dupeIds = new Set<string>();
            scanResults.forEach(group => {
                const itemsWithId = group.items.filter(i => i.id);
                if (itemsWithId.length < 2) return;

                // Priority 1: temp
                const tempItems = itemsWithId.filter(i => isTempCandidate(i));
                const nonTempItems = itemsWithId.filter(i => !isTempCandidate(i));
                if (tempItems.length > 0 && nonTempItems.length > 0) {
                    tempItems.forEach(i => dupeIds.add(i.id as string));
                    return;
                }

                // Priority 2: fallback (uncategorized/backup/other)
                const fallbackItems = itemsWithId.filter(i => isFallbackCandidate(i));
                const nonFallbackItems = itemsWithId.filter(i => !isFallbackCandidate(i));
                if (fallbackItems.length > 0 && nonFallbackItems.length > 0) {
                    fallbackItems.forEach(i => dupeIds.add(i.id as string));
                    return;
                }

                // No markers — original logic: keep first, select rest
                for (let i = 1; i < itemsWithId.length; i++) {
                    dupeIds.add(itemsWithId[i].id as string);
                }
            });
            setSelectedIds(dupeIds);
            setSelectPhase(1);
        } else if (selectPhase === 1) {
            setSelectedIds(new Set(allIds));
            setSelectPhase(2);
        } else {
            setSelectedIds(new Set());
            setSelectPhase(0);
        }
    };

    const requestDelete = (ids: string[]) => {
        if (ids.length === 0 || !onDeleteItem) return;
        setDeleteConfirm({ ids });
    };

    const executeDelete = async () => {
        if (!deleteConfirm || !onDeleteItem) return;
        const { ids } = deleteConfirm;
        setIsDeleting(true);
        setDeleteConfirm(null);
        setDeleteResult(null);
        setDeleteProgress({ done: 0, total: ids.length });

        let succeeded = 0, failed = 0;
        for (let i = 0; i < ids.length; i++) {
            try {
                await onDeleteItem!(ids[i]);
                succeeded++;
            } catch {
                failed++;
            }
            setDeleteProgress({ done: i + 1, total: ids.length });
        }

        setSelectedIds(prev => {
            const next = new Set(prev);
            ids.forEach(id => next.delete(id));
            return next;
        });
        setIsDeleting(false);
        setDeleteProgress(null);
        setDeleteResult({ succeeded, failed });
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <FileWarning className="text-orange-500" /> Duplicate File Detector ({scanType === 'photo' ? 'Photos' : 'Videos'})
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">Found {scanResults.length} group{scanResults.length !== 1 ? 's' : ''} of files with identical sizes in the current list.</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={downloadDuplicateReport} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center gap-2 text-sm font-bold shadow-sm transition-colors">
                            <FileText size={16} /> Download Report (CSV)
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"><X size={24} /></button>
                    </div>
                </div>

                {/* ── Scrollable content ── */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-100 space-y-6">
                    {scanResults.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <CheckCircle size={48} className="text-green-400 mb-2" />
                            <p>No duplicates found!</p>
                        </div>
                    ) : (
                        scanResults.map((group, idx) => (
                            <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Group Size: {group.formattedSize} ({group.items.length} files)</span>
                                </div>
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-50 text-gray-400">
                                            <th className="px-3 py-2 w-10" scope="col" aria-label="Select"></th>
                                            <th className="px-4 py-2 font-medium w-16">Preview</th>
                                            <th className="px-4 py-2 font-medium">Title</th>
                                            <th className="px-4 py-2 font-medium">Created At</th>
                                            <th className="px-4 py-2 font-medium text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.items.map((item: any) => {
                                            const url = scanType === 'photo' ? item.src : item.video;
                                            const isSelected = !!item.id && selectedIds.has(item.id);
                                            return (
                                                <tr key={item.id} className={`border-b border-gray-50 last:border-0 transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                                                    <td className="px-3 py-3">
                                                        {item.id && (
                                                            <input
                                                                type="checkbox"
                                                                title={`Select ${item.title}`}
                                                                checked={isSelected}
                                                                onChange={() => toggleItem(item.id)}
                                                                className="w-4 h-4 rounded cursor-pointer accent-indigo-500"
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {scanType === 'photo' ? (
                                                            <img src={getOptimizedUrl(url, 'party')} className="w-10 h-10 object-cover rounded bg-gray-100" alt="" />
                                                        ) : (
                                                            <div className="w-10 h-10 bg-gray-900 rounded flex items-center justify-center text-gray-500"><Film size={16} /></div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-gray-800 line-clamp-1">
                                                            {item.title}
                                                            {item.sourceType === 'local' && <span className="ml-1.5 px-1.5 py-0.5 text-[9px] font-semibold bg-cyan-100 text-cyan-700 rounded uppercase">Local</span>}
                                                        </div>
                                                        <div className="text-xs text-gray-400 mt-0.5">
                                                            {item.collection || 'Unknown Collection'} \ {item.album || item.category || 'Unknown Album'}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(item.createdAt)}</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <a href={url} download={item.title} target="_blank" rel="noopener noreferrer" className="inline-flex p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Download File">
                                                                <Download size={16} />
                                                            </a>
                                                            {onDeleteItem && item.id && (
                                                                <button type="button" onClick={() => requestDelete([item.id])} disabled={isDeleting} className="inline-flex p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40" title="Delete File">
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ))
                    )}
                </div>

                {/* ── Delete result banner ── */}
                {deleteResult && (
                    <div className={`shrink-0 px-6 py-3 text-sm font-bold flex items-center justify-between ${deleteResult.failed > 0 ? 'bg-yellow-50 text-yellow-800 border-t border-yellow-100' : 'bg-green-50 text-green-800 border-t border-green-100'}`}>
                        <span>
                            {deleteResult.succeeded} item{deleteResult.succeeded !== 1 ? 's' : ''} deleted
                            {deleteResult.failed > 0 ? `, ${deleteResult.failed} failed` : ' successfully'}.
                        </span>
                        <button type="button" onClick={() => setDeleteResult(null)} className="text-gray-400 hover:text-gray-600 ml-4"><X size={16} /></button>
                    </div>
                )}

                {/* ── Footer: Select All + bulk actions ── */}
                {scanResults.length > 0 && (
                    <div className="shrink-0 border-t border-gray-100 px-6 py-4 bg-white flex items-center justify-between">
                        <button
                            type="button"
                            onClick={handleSelectCycle}
                            className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${selectPhase === 0 ? 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'}`}
                        >
                            {selectPhase === 0 ? 'Select Duplicate' : selectPhase === 1 ? 'Select All' : 'Clear'}
                            {selectedCount > 0 && <span className="ml-1.5 text-indigo-600 font-bold">({selectedCount}/{totalCount})</span>}
                        </button>
                        <div className="flex items-center gap-2">
                            {onMoveSelected && (
                                <button
                                    type="button"
                                    disabled={selectedCount === 0}
                                    onClick={() => onMoveSelected([...selectedIds])}
                                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg flex items-center gap-2 text-sm font-bold shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <FolderInput size={16} />
                                    Move{selectedCount > 0 ? ` (${selectedCount})` : ''}
                                </button>
                            )}
                            <button
                                type="button"
                                disabled={selectedCount === 0 || isDownloading}
                                onClick={handleDownloadSelected}
                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-2 text-sm font-bold shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                Download ({selectedCount})
                            </button>
                            {onDeleteItem && (
                                <button
                                    type="button"
                                    disabled={selectedCount === 0 || isDeleting}
                                    onClick={() => requestDelete([...selectedIds])}
                                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center gap-2 text-sm font-bold shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                    {isDeleting && deleteProgress ? `Deleting ${deleteProgress.done} / ${deleteProgress.total}...` : `Delete${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Inline Delete Confirm Overlay ── */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDeleteConfirm(null)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                        <h4 className="text-lg font-bold text-gray-900 mb-2">
                            Delete {deleteConfirm.ids.length} item{deleteConfirm.ids.length !== 1 ? 's' : ''}?
                        </h4>
                        <p className="text-sm text-gray-500 mb-6">This action cannot be undone.</p>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setDeleteConfirm(null)} className="px-5 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">
                                Cancel
                            </button>
                            <button type="button" onClick={executeDelete} className="px-5 py-2.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-colors">
                                Delete {deleteConfirm.ids.length}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
