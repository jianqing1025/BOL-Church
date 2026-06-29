import React, { useEffect, useState } from 'react';
import { FolderInput, Loader2, X } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';

const YEAR_PATTERN = /^\d{4}$/;

interface MovePhotosModalProps {
  isOpen: boolean;
  count: number;
  collections: string[];
  albums: string[];
  defaultYear: string;
  defaultAlbum: string;
  isMoving: boolean;
  onClose: () => void;
  onMove: (payload: { collection: string; album: string }) => void;
}

export const MovePhotosModal: React.FC<MovePhotosModalProps> = ({
  isOpen, count, collections, albums, defaultYear, defaultAlbum, isMoving, onClose, onMove,
}) => {
  const { t } = useLocalization();
  const [collection, setCollection] = useState('All');
  const [newCollection, setNewCollection] = useState('');
  const [album, setAlbum] = useState('');
  const [newAlbum, setNewAlbum] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setCollection(defaultYear && defaultYear !== 'All' ? defaultYear : 'All');
    setNewCollection('');
    setAlbum(defaultAlbum && defaultAlbum !== 'All' && defaultAlbum !== 'Favorites' ? defaultAlbum : '');
    setNewAlbum('');
    setError('');
  }, [isOpen, defaultYear, defaultAlbum]);

  if (!isOpen) return null;

  const year = newCollection || (collection === 'All' ? '' : collection);
  const targetAlbum = newAlbum || album;
  const canMove = YEAR_PATTERN.test(year) && !isMoving;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!YEAR_PATTERN.test(year)) {
      setError(t('photosPage.enterFourDigitYear'));
      return;
    }
    onMove({ collection: year, album: targetAlbum });
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 px-4 py-6" onClick={() => !isMoving && onClose()}>
      <form onSubmit={submit} className="w-full max-w-[512px] rounded-[10px] bg-white p-7 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FolderInput size={22} className="text-rose-500" />
            <h2 className="text-xl font-extrabold text-gray-800">{t('photosPage.moveSelected')}</h2>
          </div>
          <button type="button" onClick={() => !isMoving && onClose()} className="rounded-md p-0.5 text-gray-400 transition-colors hover:text-gray-700" title={t('photosPage.close')}>
            <X size={24} />
          </button>
        </div>

        <p className="mb-5 text-sm text-gray-500">{t('photosPage.moveCount').replace('{count}', String(count))}</p>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-wide text-gray-400" htmlFor="move-photo-year">{t('photosPage.year')}</label>
            <div className="grid grid-cols-[1fr_128px] gap-2">
              <select
                id="move-photo-year"
                value={collection}
                onChange={(event) => setCollection(event.target.value)}
                disabled={newCollection.length > 0}
                className="h-[47px] rounded-lg border border-gray-200 bg-gray-50 px-4 text-base text-gray-700 outline-none transition-colors focus:border-rose-300 disabled:text-gray-400"
              >
                <option value="All">{t('photosPage.all')}</option>
                {collections.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input
                value={newCollection}
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, '').slice(0, 4);
                  setNewCollection(next);
                  if (next) setCollection('All');
                }}
                placeholder={t('photosPage.orNew')}
                className="h-[47px] rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-wide text-gray-400" htmlFor="move-photo-album">{t('photosPage.uploadAlbum')}</label>
            <div className="grid grid-cols-[1fr_128px] gap-2">
              <select
                id="move-photo-album"
                value={album}
                onChange={(event) => setAlbum(event.target.value)}
                disabled={newAlbum.length > 0}
                className="h-[47px] rounded-lg border border-gray-200 bg-gray-50 px-4 text-base text-gray-700 outline-none transition-colors focus:border-rose-300 disabled:text-gray-400"
              >
                <option value="">{t('photosPage.typeName')}</option>
                {albums.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input
                value={newAlbum}
                onChange={(event) => {
                  setNewAlbum(event.target.value);
                  if (event.target.value) setAlbum('');
                }}
                placeholder={t('photosPage.orNew')}
                className="h-[47px] rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</div>}

          <button type="submit" disabled={!canMove} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#dda7ba] text-base font-extrabold text-white shadow-sm transition-colors hover:bg-[#d895ad] disabled:cursor-not-allowed disabled:bg-gray-300">
            {isMoving ? <Loader2 size={18} className="animate-spin" /> : null}
            {t('photosPage.moveSelected')}
          </button>
        </div>
      </form>
    </div>
  );
};
