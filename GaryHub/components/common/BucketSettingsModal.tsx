
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Check, Eye, EyeOff, Star } from 'lucide-react';

interface BucketProfile {
    id: string;
    name: string;
    r2AccountId: string;
    r2AccessKeyId: string;
    r2SecretAccessKey: string;
    r2Bucket: string;
    r2PublicUrl: string;
    d1AccountId: string;
    d1DatabaseId: string;
    d1ApiToken: string;
    createdAt: number;
    updatedAt: number;
}

const EMPTY_FORM: Omit<BucketProfile, 'id' | 'createdAt' | 'updatedAt'> = {
    name: '', r2AccountId: '', r2AccessKeyId: '', r2SecretAccessKey: '',
    r2Bucket: '', r2PublicUrl: '', d1AccountId: '', d1DatabaseId: '', d1ApiToken: '',
};

const FIELDS: { key: keyof typeof EMPTY_FORM; label: string; sensitive?: boolean; placeholder?: string }[] = [
    { key: 'name', label: 'Profile Name', placeholder: 'e.g. Production' },
    { key: 'r2AccountId', label: 'R2 Account ID', sensitive: true },
    { key: 'r2AccessKeyId', label: 'R2 Access Key ID', sensitive: true },
    { key: 'r2SecretAccessKey', label: 'R2 Secret Access Key', sensitive: true },
    { key: 'r2Bucket', label: 'R2 Bucket Name', placeholder: 'e.g. imagehub1028' },
    { key: 'r2PublicUrl', label: 'R2 Public URL', placeholder: 'https://pub-xxx.r2.dev' },
    { key: 'd1AccountId', label: 'D1 Account ID', sensitive: true },
    { key: 'd1DatabaseId', label: 'D1 Database ID', sensitive: true },
    { key: 'd1ApiToken', label: 'D1 API Token', sensitive: true },
];

export const BucketSettingsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
}> = ({ isOpen, onClose }) => {
    const [profiles, setProfiles] = useState<BucketProfile[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null); // null = list view, 'new' = create, id = edit
    const [form, setForm] = useState(EMPTY_FORM);
    const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const api = (window as any).electronAPI?.bucket;

    const loadProfiles = async () => {
        if (!api) return;
        const [list, active] = await Promise.all([api.list(), api.getActive()]);
        setProfiles(list);
        setActiveId(active.id);
    };

    useEffect(() => {
        if (isOpen) loadProfiles();
    }, [isOpen]);

    const handleEdit = (profile: BucketProfile) => {
        setForm({
            name: profile.name, r2AccountId: profile.r2AccountId, r2AccessKeyId: profile.r2AccessKeyId,
            r2SecretAccessKey: profile.r2SecretAccessKey, r2Bucket: profile.r2Bucket, r2PublicUrl: profile.r2PublicUrl,
            d1AccountId: profile.d1AccountId, d1DatabaseId: profile.d1DatabaseId, d1ApiToken: profile.d1ApiToken,
        });
        setEditingId(profile.id);
        setError(null);
    };

    const handleNew = () => {
        setForm({ ...EMPTY_FORM });
        setEditingId('new');
        setError(null);
    };

    const handleSave = async () => {
        if (!api) return;
        if (!form.name.trim()) { setError('Profile name is required'); return; }
        setSaving(true);
        setError(null);
        try {
            if (editingId === 'new') {
                await api.add(form);
            } else if (editingId) {
                await api.update({ id: editingId, updates: form });
            }
            setEditingId(null);
            await loadProfiles();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!api) return;
        if (!confirm(`Delete bucket profile "${name}"?`)) return;
        await api.delete({ id });
        await loadProfiles();
    };

    const handleSetActive = async (id: string) => {
        if (!api) return;
        await api.setActive({ id });
        setActiveId(id);
    };

    if (!isOpen) return null;

    const maskValue = (val: string) => val ? val.slice(0, 4) + '•'.repeat(Math.min(val.length - 4, 20)) : '';

    // ─── Edit / Create Form ──────────────────────────────────────────────────

    if (editingId) {
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
                    <div className="flex items-center justify-between px-6 py-4 border-b">
                        <h2 className="text-lg font-bold text-gray-800">
                            {editingId === 'new' ? 'Add Bucket Profile' : 'Edit Bucket Profile'}
                        </h2>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                    </div>
                    <div className="px-6 py-4 space-y-3">
                        {error && <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}
                        {FIELDS.map(f => (
                            <div key={f.key}>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{f.label}</label>
                                <div className="relative">
                                    <input
                                        type={f.sensitive && !showSecrets[f.key] ? 'password' : 'text'}
                                        value={form[f.key]}
                                        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                        placeholder={f.placeholder || ''}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent pr-10"
                                    />
                                    {f.sensitive && (
                                        <button
                                            type="button"
                                            onClick={() => setShowSecrets(prev => ({ ...prev, [f.key]: !prev[f.key] }))}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showSecrets[f.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
                        <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                        <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-400 rounded-lg transition-colors">
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Profile List ────────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
                    <h2 className="text-lg font-bold text-gray-800">R2 + D1 Settings</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {!api ? (
                        <div className="px-6 py-8 text-center text-gray-500 text-sm">Bucket management requires the desktop version.</div>
                    ) : profiles.length === 0 ? (
                        <div className="px-6 py-8 text-center text-gray-400 text-sm">No bucket profiles yet.</div>
                    ) : (
                        <div className="divide-y">
                            {profiles.map(p => (
                                <div key={p.id} className={`px-6 py-3 flex items-center gap-3 group ${p.id === activeId ? 'bg-cyan-50' : 'hover:bg-gray-50'}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm text-gray-800">{p.name}</span>
                                            {p.id === activeId && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-cyan-100 text-cyan-700 rounded uppercase">Active</span>}
                                        </div>
                                        <div className="text-xs text-gray-400 truncate mt-0.5">
                                            {p.r2Bucket} &middot; {maskValue(p.r2AccessKeyId)}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        {p.id !== activeId && (
                                            <button onClick={() => handleSetActive(p.id)} className="p-1.5 text-gray-400 hover:text-cyan-500 rounded hover:bg-cyan-50 transition-colors" title="Set as active">
                                                <Star size={14} />
                                            </button>
                                        )}
                                        <button onClick={() => handleEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-500 rounded hover:bg-blue-50 transition-colors" title="Edit">
                                            <Edit2 size={14} />
                                        </button>
                                        <button onClick={() => handleDelete(p.id, p.name)} className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors" title="Delete">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="px-6 py-3 border-t bg-gray-50 shrink-0 rounded-b-xl">
                    <button onClick={handleNew} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors">
                        <Plus size={16} /> Add New Bucket
                    </button>
                </div>
            </div>
        </div>
    );
};
