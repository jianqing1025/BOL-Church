import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

export const VersionInfoModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
}> = ({ isOpen, onClose }) => {
    const [appInfo, setAppInfo] = useState<{ version: string; platform: string } | null>(null);
    const [updateInfo, setUpdateInfo] = useState<{ message: string; latestVersion: string; updateAvailable: boolean } | null>(null);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        window.electronAPI?.getAppInfo().then((info) => {
            setAppInfo({ version: info.version, platform: info.platform });
        }).catch(() => {});
    }, [isOpen]);

    const handleCheckUpdates = async () => {
        setChecking(true);
        try {
            const result = await window.electronAPI?.checkForUpdates();
            if (result) {
                setUpdateInfo({
                    message: result.message,
                    latestVersion: result.latestVersion,
                    updateAvailable: result.updateAvailable,
                });
            }
        } finally {
            setChecking(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/55">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <h2 className="text-lg font-bold text-slate-900">Version</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
                </div>
                <div className="space-y-4 px-6 py-5">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-sm font-semibold text-slate-900">GaryLab GalleryHub</div>
                        <div className="mt-1 text-xs text-slate-500">Version {appInfo?.version || '...'}</div>
                        <div className="mt-1 text-xs text-slate-500">Copyright © 2024-2026 GaryLab. All rights reserved.</div>
                    </div>
                    <button
                        type="button"
                        onClick={handleCheckUpdates}
                        disabled={checking}
                        className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:bg-slate-400"
                    >
                        <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
                        Check Update
                    </button>
                    {updateInfo && (
                        <div className={`rounded-xl border px-4 py-3 text-sm ${updateInfo.updateAvailable ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                            <div>{updateInfo.message}</div>
                            <div className="mt-1 text-xs opacity-80">Latest available version: {updateInfo.latestVersion}</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
