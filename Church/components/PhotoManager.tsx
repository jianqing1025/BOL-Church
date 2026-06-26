import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Loader2, RefreshCw, Save, Sliders, Trash2 } from 'lucide-react';
import { api, type PhotoUploadSettings } from '../api';
import type { ChurchPhoto } from '../data';
import { useLocalization } from '../hooks/useLocalization';
import { buildPaginationNumbers } from '../utils/pagination';

const YEAR_PATTERN = /^\d{4}$/;

const PhotoManager: React.FC = () => {
  const { t } = useLocalization();
  const [photos, setPhotos] = useState<ChurchPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);

  const [settings, setSettings] = useState<PhotoUploadSettings>({ maxLongEdge: 1600, jpegQuality: 0.82, defaultYear: '', defaultAlbum: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');
  const [newDefaultYear, setNewDefaultYear] = useState('');
  const [newDefaultAlbum, setNewDefaultAlbum] = useState('');

  const loadPhotos = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.adminPhotos();
      setPhotos(response.photos);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    setError('');
    setSettingsNotice('');
    try {
      const payload: PhotoUploadSettings = {
        ...settings,
        defaultYear: (newDefaultYear.trim() || settings.defaultYear).trim(),
        defaultAlbum: (newDefaultAlbum.trim() || settings.defaultAlbum).trim(),
      };
      const saved = await api.adminUpdatePhotoSettings(payload);
      setSettings(saved);
      setNewDefaultYear('');
      setNewDefaultAlbum('');
      setSettingsNotice(t('adminPhotos.defaultsSaved'));
      window.setTimeout(() => setSettingsNotice(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    loadPhotos();
    api.photoSettings().then(setSettings).catch(() => undefined);
  }, []);

  const updateLocal = (id: string, patch: Partial<ChurchPhoto>) => {
    setPhotos(prev => prev.map(photo => photo.id === id ? { ...photo, ...patch } : photo));
  };

  const savePhoto = async (photo: ChurchPhoto) => {
    setSavingId(photo.id);
    setError('');
    try {
      const response = await api.adminUpdatePhoto(photo.id, {
        title: photo.title,
        collection: photo.collection,
        album: photo.album,
        uploaderName: photo.uploaderName ?? '',
      });
      updateLocal(photo.id, response.photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId('');
    }
  };

  const toggleHidden = async (photo: ChurchPhoto) => {
    setSavingId(photo.id);
    setError('');
    try {
      const response = await api.adminUpdatePhoto(photo.id, { hidden: !photo.hidden });
      updateLocal(photo.id, response.photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId('');
    }
  };

  const deletePhoto = async (photo: ChurchPhoto) => {
    if (!confirm(t('adminPhotos.confirmDelete'))) return;
    setSavingId(photo.id);
    setError('');
    try {
      await api.adminDeletePhoto(photo.id);
      setPhotos(prev => prev.filter(item => item.id !== photo.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId('');
    }
  };

  useEffect(() => { setPage(1); }, [pageSize]);

  const totalPages = Math.max(1, Math.ceil(photos.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageEntries = photos.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paginationNumbers = useMemo(() => buildPaginationNumbers(totalPages, safePage), [totalPages, safePage]);

  const existingYears = useMemo(
    () => Array.from(new Set(photos.map(p => (p.collection || '').trim()).filter(y => YEAR_PATTERN.test(y)))).sort((a, b) => Number(b) - Number(a)),
    [photos],
  );
  const existingAlbums = useMemo(
    () => Array.from(new Set(photos.map(p => (p.album || '').trim()).filter(Boolean))).sort(),
    [photos],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('adminPhotos.title')}</h2>
          <p className="text-sm text-gray-600">{t('adminPhotos.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <label htmlFor="photo-page-size">{t('admin.perPageLabel')}</label>
          <select
            id="photo-page-size"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm font-semibold"
          >
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
          <span className="text-gray-500">{t('admin.perPageUnit')}</span>
          <button
            onClick={() => void loadPhotos()}
            className="ml-2 inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {t('adminPhotos.refresh')}
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      {/* Upload defaults */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Sliders size={18} className="text-rose-500" />
          <div>
            <h3 className="text-base font-bold text-gray-900">{t('adminPhotos.defaultsTitle')}</h3>
            <p className="text-xs text-gray-500">{t('adminPhotos.defaultsSubtitle')}</p>
          </div>
        </div>

        {/* Default year + album */}
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">{t('photosPage.year')}</span>
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <select
                value={settings.defaultYear}
                disabled={newDefaultYear.length > 0}
                onChange={(e) => setSettings((s) => ({ ...s, defaultYear: e.target.value }))}
                className="h-10 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">{t('photosPage.all')}</option>
                {existingYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <input
                value={newDefaultYear}
                inputMode="numeric"
                maxLength={4}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setNewDefaultYear(v); if (v) setSettings((s) => ({ ...s, defaultYear: '' })); }}
                placeholder={t('photosPage.orNew')}
                className="h-10 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">{t('photosPage.uploadAlbum')}</span>
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <select
                value={settings.defaultAlbum}
                disabled={newDefaultAlbum.length > 0}
                onChange={(e) => setSettings((s) => ({ ...s, defaultAlbum: e.target.value }))}
                className="h-10 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">{t('photosPage.typeName')}</option>
                {existingAlbums.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <input
                value={newDefaultAlbum}
                onChange={(e) => { setNewDefaultAlbum(e.target.value); if (e.target.value) setSettings((s) => ({ ...s, defaultAlbum: '' })); }}
                placeholder={t('photosPage.orNew')}
                className="h-10 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Compression */}
        <div className="flex flex-col gap-4 border-t border-gray-100 pt-4 sm:flex-row sm:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">{t('photosPage.maxLongEdge')}</span>
            <select
              value={settings.maxLongEdge}
              onChange={(e) => setSettings((s) => ({ ...s, maxLongEdge: Number(e.target.value) }))}
              className="h-10 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-blue-500"
            >
              {[1280, 1600, 1920, 2560, 3840].map((v) => <option key={v} value={v}>{v}px</option>)}
            </select>
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">{t('photosPage.jpegQuality')} · {Math.round(settings.jpegQuality * 100)}%</span>
            <input
              type="range"
              min={0.6}
              max={1}
              step={0.01}
              value={settings.jpegQuality}
              onChange={(e) => setSettings((s) => ({ ...s, jpegQuality: Number(e.target.value) }))}
              className="mt-3 w-full max-w-xs accent-rose-500"
            />
          </label>
          <button
            onClick={() => void saveSettings()}
            disabled={savingSettings}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            {savingSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {t('adminPhotos.save')}
          </button>
          {settingsNotice && <span className="text-sm font-semibold text-emerald-600">{settingsNotice}</span>}
        </div>
      </div>

      <div className="rounded-lg bg-white shadow-sm">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t('adminPhotos.loading')}
          </div>
        ) : photos.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">{t('adminPhotos.empty')}</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pageEntries.map(photo => (
              <div key={photo.id} className="grid gap-4 p-4 lg:grid-cols-[112px_1fr_auto] lg:items-center">
                <img src={photo.src} alt={photo.title} className="h-28 w-28 rounded-md bg-gray-100 object-cover" />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-gray-500">{t('adminPhotos.photoTitle')}</span>
                    <input
                      value={photo.title}
                      onChange={event => updateLocal(photo.id, { title: event.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-gray-500">{t('adminPhotos.collection')}</span>
                    <input
                      value={photo.collection}
                      onChange={event => updateLocal(photo.id, { collection: event.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-gray-500">{t('adminPhotos.album')}</span>
                    <input
                      value={photo.album}
                      onChange={event => updateLocal(photo.id, { album: event.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase text-gray-500">{t('photosPage.uploadedBy')}</span>
                    <input
                      value={photo.uploaderName ?? ''}
                      onChange={event => updateLocal(photo.id, { uploaderName: event.target.value })}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <button
                    onClick={() => void savePhoto(photo)}
                    disabled={savingId === photo.id}
                    className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
                  >
                    {savingId === photo.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {t('adminPhotos.save')}
                  </button>
                  <button
                    onClick={() => void toggleHidden(photo)}
                    disabled={savingId === photo.id}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-400"
                  >
                    {photo.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
                    {photo.hidden ? t('adminPhotos.show') : t('adminPhotos.hide')}
                  </button>
                  <button
                    onClick={() => void deletePhoto(photo)}
                    disabled={savingId === photo.id}
                    className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-gray-300"
                  >
                    <Trash2 size={16} />
                    {t('adminPhotos.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!loading && totalPages > 1 && (
        <nav className="mt-2 flex flex-wrap items-center justify-center gap-1.5" aria-label="pagination">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, safePage - 1))}
            disabled={safePage <= 1}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹ {t('admin.prev')}
          </button>
          {paginationNumbers.map((n, idx) => n === 'gap' ? (
            <span key={`gap-${idx}`} className="px-2 text-gray-400">…</span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              aria-current={n === safePage ? 'page' : undefined}
              className={`min-w-[2.25rem] rounded-md px-2 py-1.5 text-sm font-semibold ${n === safePage ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            disabled={safePage >= totalPages}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('admin.next')} ›
          </button>
          <span className="ml-3 text-xs text-gray-500">
            {t('admin.pageInfo').replace('{page}', String(safePage)).replace('{total}', String(totalPages)).replace('{count}', String(photos.length))}
          </span>
        </nav>
      )}
    </div>
  );
};

export default PhotoManager;
