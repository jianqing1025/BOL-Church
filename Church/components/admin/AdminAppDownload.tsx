import React, { useEffect, useState } from 'react';
import { useLocalization } from '../../hooks/useLocalization';

type Manifest = { version: string; file: string; size: number };

const BASE = '/api/admin/desktop/';

/**
 * 總覽頁的「BOLCCOP Admin 桌面版」下載卡。安裝檔只給登入的管理者下載；
 * 還沒上傳（沒有 latest.json）時整張卡不顯示。
 */
const AdminAppDownload: React.FC = () => {
  const { t } = useLocalization();
  const [manifest, setManifest] = useState<Manifest | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE}latest.json`, { credentials: 'same-origin', cache: 'no-store' })
      .then(response => (response.ok ? (response.json() as Promise<Manifest>) : null))
      .then(data => { if (!cancelled && data?.file) setManifest(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!manifest) return null;
  return (
    <div className="flex h-full flex-col rounded-lg bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <img src="/admin-icon.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-gray-900">{t('admin.adminAppTitle')}</h2>
          <p className="text-sm text-gray-500">{t('admin.adminAppSubtitle')}</p>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-gray-500">{t('admin.adminAppHint')}</p>
      <div className="mt-auto pt-5">
        <a href={`${BASE}${encodeURIComponent(manifest.file)}`} download
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-bold text-white shadow-md shadow-purple-600/20 hover:bg-purple-700">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
          {t('admin.adminAppDownload')}
        </a>
        <p className="mt-1.5 text-center text-xs text-gray-400">v{manifest.version} · {Math.round(manifest.size / 1024 / 1024)} MB · Windows 10/11</p>
      </div>
    </div>
  );
};

export default AdminAppDownload;
