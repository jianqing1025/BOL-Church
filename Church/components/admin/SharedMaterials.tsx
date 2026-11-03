import React, { useEffect, useState } from 'react';
import { useLocalization } from '../../hooks/useLocalization';
import { api, type SharedMaterial } from '../../api';

const formatSize = (bytes: number) =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;

/** 共享資料: what people sent in through 資料上傳 — download, open, mark collected, delete. */
const SharedMaterials = () => {
  const { t } = useLocalization();
  const [items, setItems] = useState<SharedMaterial[] | null>(null);
  const [onlyNew, setOnlyNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setItems((await api.adminSharedMaterials()).items);
      setError('');
    } catch {
      setError(t('shareMaterials.loadFailed'));
    }
  };
  useEffect(() => { void load(); }, []);

  const setStatus = async (item: SharedMaterial, status: SharedMaterial['status']) => {
    const updated = await api.adminSetSharedMaterialStatus(item.id, status);
    setItems(current => current?.map(i => (i.id === item.id ? updated : i)) ?? null);
  };

  const remove = async (item: SharedMaterial) => {
    if (confirmDelete !== item.id) { setConfirmDelete(item.id); return; }
    setConfirmDelete(null);
    await api.adminDeleteSharedMaterial(item.id);
    setItems(current => current?.filter(i => i.id !== item.id) ?? null);
  };

  const shown = (items ?? []).filter(item => !onlyNew || item.status === 'new');
  const newCount = (items ?? []).filter(item => item.status === 'new').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-2xl font-bold text-gray-900">{t('shareMaterials.adminTitle')}</h2>
          <p className="text-sm text-gray-500">{t('shareMaterials.adminSubtitle')}</p>
        </div>
        <div className="flex rounded-lg bg-gray-100 p-1 text-sm">
          <button type="button" onClick={() => setOnlyNew(false)}
            className={`rounded-md px-3 py-1.5 ${!onlyNew ? 'bg-white shadow-sm font-semibold' : 'text-gray-600'}`}>{t('shareMaterials.showAll')} ({items?.length ?? 0})</button>
          <button type="button" onClick={() => setOnlyNew(true)}
            className={`rounded-md px-3 py-1.5 ${onlyNew ? 'bg-white shadow-sm font-semibold' : 'text-gray-600'}`}>{t('shareMaterials.showNew')} ({newCount})</button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items && !shown.length && <div className="rounded-lg bg-white p-8 text-center text-gray-500 shadow-sm">{t('shareMaterials.empty')}</div>}
      {shown.map(item => (
        <div key={item.id} className={`rounded-lg bg-white p-5 shadow-sm border-l-4 ${item.status === 'new' ? 'border-blue-500' : 'border-gray-200'}`}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-lg font-bold text-gray-900">{item.name}</span>
            {item.contact && <span className="text-sm text-gray-600">{item.contact}</span>}
            {item.sunday && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{t('shareMaterials.forSunday').replace('{date}', item.sunday)}</span>}
            {item.status === 'collected' && <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">{t('shareMaterials.collected')}</span>}
            <span className="ml-auto text-xs text-gray-400">{new Date(item.createdAt).toLocaleString()}</span>
          </div>
          {item.note && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{item.note}</p>}
          {item.links.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {item.links.map(link => (
                <li key={link} className="truncate"><a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{link}</a></li>
              ))}
            </ul>
          )}
          {item.files.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100 text-sm">
              {item.files.map(file => (
                <li key={file.key} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 truncate text-gray-800">{file.name}</span>
                  <span className="text-gray-400">{formatSize(file.size)}</span>
                  <a href={api.sharedFileUrl(file)} className="font-semibold text-blue-600 hover:underline">{t('shareMaterials.download')}</a>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <button type="button" onClick={() => void setStatus(item, item.status === 'new' ? 'collected' : 'new')}
              className="rounded-lg bg-gray-900 px-3 py-1.5 font-semibold text-white hover:bg-gray-700">
              {item.status === 'new' ? t('shareMaterials.markCollected') : t('shareMaterials.markNew')}
            </button>
            <button type="button" onClick={() => void remove(item)} onBlur={() => setConfirmDelete(null)}
              className={`rounded-lg px-3 py-1.5 font-semibold ${confirmDelete === item.id ? 'bg-red-600 text-white' : 'bg-gray-100 text-red-600 hover:bg-gray-200'}`}>
              {confirmDelete === item.id ? t('shareMaterials.deleteConfirm') : t('shareMaterials.delete')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SharedMaterials;
