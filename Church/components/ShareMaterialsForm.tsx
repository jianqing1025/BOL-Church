import React, { useRef, useState } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { api, SHARED_MAX_BYTES, uploadSharedFile, type SharedFile } from '../api';

/** The coming Sunday (today, if it is Sunday), as YYYY-MM-DD in local time. */
function nextSunday(): string {
  const day = new Date();
  day.setDate(day.getDate() + ((7 - day.getDay()) % 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

const formatSize = (bytes: number) =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;

const inputClass = 'w-full bg-gray-100 border-gray-200 rounded-lg p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

/**
 * 資料上傳: anyone can send the church team materials for a Sunday — files (videos, PPT…, up to
 * 100 MB each, streamed straight to storage), links and a note. Staff collect them under 共享資料.
 */
const ShareMaterialsForm = () => {
  const { t } = useLocalization();
  const [form, setForm] = useState({ name: '', contact: '', sunday: nextSunday(), note: '', links: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const change = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [e.target.name]: e.target.value });

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const tooLarge = Array.from(list).filter(file => file.size > SHARED_MAX_BYTES);
    setError(tooLarge.map(file => t('shareMaterials.tooLarge').replace('{name}', file.name)).join(' '));
    setFiles(current => [...current, ...Array.from(list).filter(file => file.size <= SHARED_MAX_BYTES)]);
    if (picker.current) picker.current.value = '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const links = form.links.split(/\s+/).map(link => link.trim()).filter(Boolean);
    if (!files.length && !links.length && !form.note.trim()) {
      setError(t('shareMaterials.needSomething'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const uploaded: SharedFile[] = [];
      for (const file of files) {
        uploaded.push(await uploadSharedFile(file, share =>
          setProgress(t('shareMaterials.uploading').replace('{name}', file.name).replace('{pct}', String(Math.round(share * 100))))));
      }
      setProgress(t('shareMaterials.sending'));
      await api.submitSharedMaterial({ name: form.name, contact: form.contact, sunday: form.sunday, note: form.note, links, files: uploaded });
      setDone(true);
      setForm({ name: form.name, contact: form.contact, sunday: nextSunday(), note: '', links: '' });
      setFiles([]);
    } catch (err) {
      setError(`${t('shareMaterials.failed')} ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <div className="bg-white p-8 sm:p-12 rounded-2xl shadow-lg max-w-4xl mx-auto border border-gray-100">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('shareMaterials.title')}</h2>
      <p className="text-gray-600 mb-8">{t('shareMaterials.subtitle')}</p>
      {done ? (
        <div className="bg-green-50 text-green-800 p-6 rounded-lg text-center">
          <h3 className="text-xl font-bold mb-2">{t('shareMaterials.successTitle')}</h3>
          <p>{t('shareMaterials.successBody')}</p>
          <button type="button" onClick={() => setDone(false)} className="mt-4 text-sm underline">{t('shareMaterials.another')}</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <input required type="text" name="name" value={form.name} onChange={change} maxLength={100}
              placeholder={t('shareMaterials.name')} aria-label={t('shareMaterials.name')} className={inputClass} />
            <input type="text" name="contact" value={form.contact} onChange={change} maxLength={200}
              placeholder={t('shareMaterials.contact')} aria-label={t('shareMaterials.contact')} className={inputClass} />
          </div>
          <label className="block text-sm font-semibold text-gray-700">
            {t('shareMaterials.sunday')}
            <input type="date" name="sunday" value={form.sunday} onChange={change} className={`${inputClass} mt-2 sm:w-64`} />
          </label>
          <textarea name="note" value={form.note} onChange={change} rows={4} maxLength={5000}
            placeholder={t('shareMaterials.note')} aria-label={t('shareMaterials.note')} className={inputClass} />
          <textarea name="links" value={form.links} onChange={change} rows={3}
            placeholder={t('shareMaterials.links')} aria-label={t('shareMaterials.links')} className={inputClass} />
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">{t('shareMaterials.files')}</p>
            <input ref={picker} type="file" multiple className="hidden" onChange={e => addFiles(e.target.files)}
              accept="video/*,audio/*,image/*,.ppt,.pptx,.pps,.ppsx,.key,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" />
            <button type="button" disabled={busy} onClick={() => picker.current?.click()}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-200 disabled:opacity-50">
              {t('shareMaterials.choose')}
            </button>
            {files.length > 0 && (
              <ul className="mt-4 space-y-2">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center gap-3 text-sm text-gray-700">
                    <span className="flex-1 truncate">{file.name}</span>
                    <span className="text-gray-400">{formatSize(file.size)}</span>
                    <button type="button" disabled={busy} className="text-red-600 hover:underline disabled:opacity-50"
                      onClick={() => setFiles(current => current.filter((_, i) => i !== index))}>{t('shareMaterials.remove')}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {progress && <p className="text-sm text-blue-700">{progress}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full sm:w-auto bg-gray-900 text-white font-bold py-4 px-8 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
            {busy ? t('shareMaterials.sending') : t('shareMaterials.submit')}
          </button>
        </form>
      )}
    </div>
  );
};

export default ShareMaterialsForm;
