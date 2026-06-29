import React, { useEffect, useState } from 'react';
import { Check, Edit2, FolderOpen, Plus, Star, Trash2, X } from 'lucide-react';

type CollectionProfile = {
    id: string;
    name: string;
    path: string;
    createdAt: number;
    updatedAt: number;
};

const EMPTY_FORM = {
    name: '',
    path: '',
};

export const CollectionSettingsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
}> = ({ isOpen, onClose }) => {
    const [collections, setCollections] = useState<CollectionProfile[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const api = window.electronAPI?.collection;

    const loadCollections = async () => {
        if (!api) return;
        const [list, active] = await Promise.all([api.list(), api.getActive()]);
        setCollections(list);
        setActiveId(active.id);
    };

    useEffect(() => {
        if (isOpen) {
            void loadCollections();
        }
    }, [isOpen]);

    const handleNew = () => {
        setEditingId('new');
        setForm(EMPTY_FORM);
        setError(null);
    };

    const handleEdit = (collection: CollectionProfile) => {
        setEditingId(collection.id);
        setForm({ name: collection.name, path: collection.path });
        setError(null);
    };

    const handleBrowse = async () => {
        const nextPath = await window.electronAPI?.pickDirectory({ title: 'Select Collection Path' });
        if (nextPath) {
            setForm(prev => ({ ...prev, path: nextPath }));
        }
    };

    const handleSave = async () => {
        if (!api) return;
        if (!form.name.trim()) {
            setError('Collection name is required.');
            return;
        }
        if (!form.path.trim()) {
            setError('Collection path is required.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            if (editingId === 'new') {
                await api.add({ name: form.name.trim(), path: form.path.trim() });
            } else if (editingId) {
                await api.update({ id: editingId, updates: { name: form.name.trim(), path: form.path.trim() } });
            }
            setEditingId(null);
            setForm(EMPTY_FORM);
            await loadCollections();
        } catch (e: any) {
            setError(e.message || 'Failed to save collection.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (collection: CollectionProfile) => {
        if (!api) return;
        if (!confirm(`Delete collection "${collection.name}"?`)) return;
        await api.delete({ id: collection.id });
        await loadCollections();
    };

    const handleSetActive = async (id: string) => {
        if (!api) return;
        await api.setActive({ id });
        setActiveId(id);
    };

    if (!isOpen) return null;

    if (editingId) {
        return (
            <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55">
                <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
                    <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                        <h2 className="text-lg font-bold text-slate-900">
                            {editingId === 'new' ? 'Add Collection' : 'Edit Collection'}
                        </h2>
                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-700">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-4 px-6 py-5">
                        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Collection Name</label>
                            <input
                                value={form.name}
                                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                                placeholder="e.g. GaryHub Main"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">Collection Path</label>
                            <div className="flex gap-2">
                                <input
                                    value={form.path}
                                    onChange={(e) => setForm(prev => ({ ...prev, path: e.target.value }))}
                                    className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                                    placeholder="D:\\Library\\Collections\\GaryHub"
                                />
                                <button
                                    type="button"
                                    onClick={handleBrowse}
                                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                >
                                    <FolderOpen size={16} />
                                    Browse
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-6 py-4">
                        <button onClick={() => setEditingId(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100">Cancel</button>
                        <button onClick={handleSave} disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:bg-slate-400">
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55">
            <div className="flex max-h-[82vh] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <h2 className="text-lg font-bold text-slate-900">Collection Settings</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {!api ? (
                        <div className="px-6 py-10 text-center text-sm text-slate-500">Collection management requires the desktop version.</div>
                    ) : collections.length === 0 ? (
                        <div className="px-6 py-10 text-center text-sm text-slate-400">No collections configured yet.</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {collections.map((collection) => (
                                <div key={collection.id} className={`group flex items-center gap-3 px-6 py-3 ${collection.id === activeId ? 'bg-cyan-50/70' : 'hover:bg-slate-50'}`}>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-sm font-semibold text-slate-900">{collection.name}</span>
                                            {collection.id === activeId && (
                                                <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-cyan-700">Active</span>
                                            )}
                                        </div>
                                        <div className="mt-0.5 truncate text-xs text-slate-500">{collection.path}</div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                        {collection.id !== activeId && (
                                            <button onClick={() => handleSetActive(collection.id)} className="rounded p-1.5 text-slate-400 transition hover:bg-cyan-50 hover:text-cyan-600" title="Set as active">
                                                <Star size={14} />
                                            </button>
                                        )}
                                        <button onClick={() => handleEdit(collection)} className="rounded p-1.5 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600" title="Edit">
                                            <Edit2 size={14} />
                                        </button>
                                        <button onClick={() => handleDelete(collection)} className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600" title="Delete">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    {collection.id === activeId && <Check size={16} className="shrink-0 text-cyan-600" />}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="rounded-b-2xl border-t border-slate-200 bg-slate-50 px-6 py-3">
                    <button onClick={handleNew} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500">
                        <Plus size={16} />
                        Add Collection
                    </button>
                </div>
            </div>
        </div>
    );
};
