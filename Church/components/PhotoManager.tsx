import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { ChurchPhoto } from '../data';
import { useLocalization } from '../hooks/useLocalization';

const PhotoManager: React.FC = () => {
  const { t } = useLocalization();
  const [photos, setPhotos] = useState<ChurchPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

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

  useEffect(() => {
    loadPhotos();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('adminPhotos.title')}</h2>
          <p className="text-sm text-gray-600">{t('adminPhotos.subtitle')}</p>
        </div>
        <button
          onClick={() => void loadPhotos()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {t('adminPhotos.refresh')}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

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
            {photos.map(photo => (
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
    </div>
  );
};

export default PhotoManager;
