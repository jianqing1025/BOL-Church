import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, CloudUpload, Loader2, X } from 'lucide-react';
import { api } from '../../api';
import type { ChurchPhoto } from '../../data';
import { useLocalization } from '../../hooks/useLocalization';
import { useAdmin } from '../../hooks/useAdmin';
import { extractExif, getDimensions, makeThumbnail, resizeImage } from '../../services/imageProcessing';

const YEAR_PATTERN = /^\d{4}$/;
const UPLOADER_NAME_KEY = 'bolccop-photo-uploader-name';
const THUMB_LONG_EDGE = 960;
const THUMB_QUALITY = 0.8;
const CONCURRENCY = 3;
const DEFAULT_MAX_LONG_EDGE = 1600;
const DEFAULT_JPEG_QUALITY = 0.82;

type FileStage = 'pending' | 'processing' | 'uploading' | 'done' | 'error';
interface FileStatus { stage: FileStage; error?: string; }

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: string[];
  albums: string[];
  uploaderId: string;
  defaultYear: string;
  defaultAlbum: string;
  defaultMaxLongEdge?: number;
  defaultJpegQuality?: number;
  onUploaded: (photos: ChurchPhoto[]) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen, onClose, collections, albums, uploaderId, defaultYear, defaultAlbum,
  defaultMaxLongEdge, defaultJpegQuality, onUploaded,
}) => {
  const { t } = useLocalization();
  const { currentUser } = useAdmin();
  const canEditResize = Boolean(currentUser); // only logged-in admins may change compression
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [queue, setQueue] = useState<File[]>([]);
  const [uploadCollection, setUploadCollection] = useState('All');
  const [newCollection, setNewCollection] = useState('');
  const [uploadAlbum, setUploadAlbum] = useState('');
  const [newAlbum, setNewAlbum] = useState('');
  const [uploaderName, setUploaderName] = useState(() => localStorage.getItem(UPLOADER_NAME_KEY) || '');
  const [resizeEnabled, setResizeEnabled] = useState(true);
  const [maxLongEdge, setMaxLongEdge] = useState(defaultMaxLongEdge ?? DEFAULT_MAX_LONG_EDGE);
  const [jpegQuality, setJpegQuality] = useState(defaultJpegQuality ?? DEFAULT_JPEG_QUALITY);
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setUploadCollection(defaultYear && YEAR_PATTERN.test(defaultYear) ? defaultYear : 'All');
    setNewCollection('');
    setUploadAlbum(defaultAlbum && defaultAlbum !== 'All' && defaultAlbum !== 'Favorites' ? defaultAlbum : '');
    setNewAlbum('');
    setError('');
    setResizeEnabled(true);
    setMaxLongEdge(defaultMaxLongEdge ?? DEFAULT_MAX_LONG_EDGE);
    setJpegQuality(defaultJpegQuality ?? DEFAULT_JPEG_QUALITY);
  }, [isOpen, defaultYear, defaultAlbum, defaultMaxLongEdge, defaultJpegQuality]);

  const year = newCollection || (uploadCollection === 'All' ? '' : uploadCollection);
  const album = newAlbum || uploadAlbum;
  const canSubmit = queue.length > 0 && YEAR_PATTERN.test(year) && !uploading;
  const doneCount = useMemo(() => statuses.filter(s => s.stage === 'done').length, [statuses]);

  const reset = () => {
    setQueue([]);
    setStatuses([]);
    setNewCollection('');
    setNewAlbum('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processOne = async (file: File): Promise<ChurchPhoto> => {
    const exif = await extractExif(file);

    let mainBlob: Blob = file;
    let fileName = file.name;
    let width = exif?.width;
    let height = exif?.height;
    if (resizeEnabled) {
      const resized = await resizeImage(file, { maxLongEdge, quality: jpegQuality });
      mainBlob = resized.blob;
      width = resized.width;
      height = resized.height;
      fileName = file.name.replace(/\.[^.]+$/, '') + '.jpg'; // canvas re-encodes to JPEG
    } else if (!width || !height) {
      const dims = await getDimensions(file);
      if (dims) { width = dims.width; height = dims.height; }
    }

    let thumb: Blob | null = null;
    try {
      thumb = await makeThumbnail(file, { longEdge: THUMB_LONG_EDGE, quality: THUMB_QUALITY });
    } catch { thumb = null; }

    const response = await api.uploadPhoto({
      file: mainBlob,
      fileName,
      title: file.name.replace(/\.[^.]+$/, ''),
      collection: year,
      album,
      uploaderId,
      uploaderName: uploaderName.trim() || undefined,
      thumb,
      width,
      height,
      shotAt: exif?.shotAt,
      camera: exif?.camera,
      lens: exif?.lens,
      focalLength: exif?.focalLength,
      aperture: exif?.aperture,
      shutter: exif?.shutter,
      iso: exif?.iso,
    });
    return response.photo;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      if (!YEAR_PATTERN.test(year)) setError(t('photosPage.enterFourDigitYear'));
      return;
    }
    setUploading(true);
    setError('');
    localStorage.setItem(UPLOADER_NAME_KEY, uploaderName.trim());

    const files = queue;
    const next: FileStatus[] = files.map(() => ({ stage: 'pending' }));
    setStatuses(next);
    const created: ChurchPhoto[] = [];

    let cursor = 0;
    const setStage = (i: number, stage: FileStage, err?: string) => {
      next[i] = { stage, error: err };
      setStatuses([...next]);
    };

    const worker = async () => {
      while (cursor < files.length) {
        const i = cursor++;
        try {
          setStage(i, 'processing');
          const photo = await processOne(files[i]);
          setStage(i, 'done');
          created.push(photo);
        } catch (err) {
          setStage(i, 'error', err instanceof Error ? err.message : String(err));
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker()));

    setUploading(false);
    if (created.length > 0) {
      onUploaded(created);
      reset();
      onClose();
    } else {
      setError(t('photosPage.empty'));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 px-4 py-6" onClick={() => !uploading && onClose()}>
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-[512px] overflow-y-auto rounded-[10px] bg-white p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CloudUpload size={22} className="text-rose-500" />
            <h2 className="text-xl font-extrabold text-gray-800">{t('photosPage.uploadPhotos')}</h2>
          </div>
          <button type="button" onClick={() => !uploading && onClose()} className="rounded-md p-0.5 text-gray-400 transition-colors hover:text-gray-700" title={t('photosPage.close')}>
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          {/* File picker */}
          <div>
            <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-gray-400">{t('photosPage.selectImages')}</div>
            <div className="flex items-center gap-4">
              <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full bg-rose-50 px-5 text-sm font-bold text-rose-500 transition-colors hover:bg-rose-100">
                {t('photosPage.chooseFiles')}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    const picked = (e.target.files ? Array.from(e.target.files) : []) as File[];
                    setQueue(picked.filter((f) => f.type.startsWith('image/')));
                    setStatuses([]);
                  }}
                />
              </label>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-600">
                {queue.length === 0
                  ? t('photosPage.noFileChosen')
                  : `${queue.length} ${t(queue.length === 1 ? 'photosPage.fileSelected' : 'photosPage.filesSelected')}`}
              </span>
            </div>
          </div>

          {/* Uploader name */}
          <div>
            <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-wide text-gray-400" htmlFor="photo-uploader-name">
              {t('photosPage.uploadedBy')}
            </label>
            <input
              id="photo-uploader-name"
              value={uploaderName}
              maxLength={80}
              onChange={(e) => setUploaderName(e.target.value)}
              placeholder={t('photosPage.uploaderPlaceholder')}
              className="h-[47px] w-full rounded-lg border border-gray-200 bg-gray-50 px-4 text-base text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-rose-300"
            />
          </div>

          {/* Year */}
          <div>
            <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-wide text-gray-400" htmlFor="photo-upload-collection">{t('photosPage.year')}</label>
            <div className="grid grid-cols-[1fr_128px] gap-2">
              <select
                id="photo-upload-collection"
                value={uploadCollection}
                onChange={(e) => setUploadCollection(e.target.value)}
                disabled={newCollection.length > 0}
                className="h-[47px] rounded-lg border border-gray-200 bg-gray-50 px-4 text-base text-gray-700 outline-none transition-colors focus:border-rose-300 disabled:text-gray-400"
              >
                <option value="All">{t('photosPage.all')}</option>
                {collections.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                value={newCollection}
                inputMode="numeric"
                maxLength={4}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setNewCollection(v);
                  if (v) setUploadCollection('All');
                }}
                placeholder={t('photosPage.orNew')}
                className="h-[47px] rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* Album */}
          <div>
            <label className="mb-2 block text-[10px] font-extrabold uppercase tracking-wide text-gray-400" htmlFor="photo-upload-album">{t('photosPage.uploadAlbum')}</label>
            <div className="grid grid-cols-[1fr_128px] gap-2">
              <select
                id="photo-upload-album"
                value={uploadAlbum}
                onChange={(e) => setUploadAlbum(e.target.value)}
                disabled={newAlbum.length > 0}
                className="h-[47px] rounded-lg border border-gray-200 bg-gray-50 px-4 text-base text-gray-700 outline-none transition-colors focus:border-rose-300 disabled:text-gray-400"
              >
                <option value="">{t('photosPage.typeName')}</option>
                {albums.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <input
                value={newAlbum}
                onChange={(e) => { setNewAlbum(e.target.value); if (e.target.value) setUploadAlbum(''); }}
                placeholder={t('photosPage.orNew')}
                className="h-[47px] rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* Resize controls — only logged-in admins can change them */}
          <div className={`rounded-xl border border-gray-100 bg-gray-50 p-3 ${canEditResize ? '' : 'opacity-60'}`}>
            <label className={`flex items-center gap-2 ${canEditResize ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
              <input type="checkbox" checked={resizeEnabled} disabled={!canEditResize} onChange={(e) => setResizeEnabled(e.target.checked)} className="h-4 w-4 accent-rose-500 disabled:cursor-not-allowed" />
              <span className="text-sm font-semibold text-gray-700">{t('photosPage.resizeBeforeUpload')}</span>
              {!canEditResize && <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-gray-400">{t('photosPage.adminOnly')}</span>}
            </label>
            {resizeEnabled && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">{t('photosPage.maxLongEdge')}</span>
                  <select value={maxLongEdge} disabled={!canEditResize} onChange={(e) => setMaxLongEdge(Number(e.target.value))} className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-rose-300 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400">
                    {[1280, 1600, 1920, 2560, 3840].map((v) => <option key={v} value={v}>{v}px</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">{t('photosPage.jpegQuality')} · {Math.round(jpegQuality * 100)}%</span>
                  <input type="range" min={0.6} max={1} step={0.01} value={jpegQuality} disabled={!canEditResize} onChange={(e) => setJpegQuality(Number(e.target.value))} className="mt-2 w-full accent-rose-500 disabled:cursor-not-allowed" />
                </label>
              </div>
            )}
          </div>

          {/* Per-file progress */}
          {uploading && statuses.length > 0 && (
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-gray-100 p-2">
              <div className="px-1 text-[11px] font-bold text-gray-500">{t('photosPage.uploadingCount')}: {doneCount}/{statuses.length}</div>
              {queue.map((file, i) => {
                const s = statuses[i] ?? { stage: 'pending' as FileStage };
                return (
                  <div key={i} className="flex items-center gap-2 px-1 text-xs">
                    <span className="w-4 flex-shrink-0">
                      {s.stage === 'done' ? <CheckCircle size={14} className="text-emerald-500" />
                        : s.stage === 'error' ? <X size={14} className="text-red-500" />
                        : (s.stage === 'processing' || s.stage === 'uploading') ? <Loader2 size={14} className="animate-spin text-rose-500" />
                        : <span className="block h-2.5 w-2.5 rounded-full bg-gray-300" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-gray-600">{file.name}</span>
                    <span className="flex-shrink-0 text-[10px] uppercase text-gray-400">
                      {s.stage === 'error' ? s.error : t(s.stage === 'done' ? 'photosPage.upload' : 'photosPage.processing')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {error && <div className="text-center text-sm font-semibold text-red-600">{error}</div>}

          <button type="submit" disabled={!canSubmit} className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#dda7ba] text-base font-extrabold text-white shadow-sm transition-colors hover:bg-[#d895ad] disabled:cursor-not-allowed disabled:bg-gray-300">
            {uploading ? <Loader2 size={18} className="animate-spin" /> : null}
            {t('photosPage.uploadPhotos')}
          </button>
        </div>
      </form>
    </div>
  );
};
