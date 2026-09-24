import React, { useRef, useState } from 'react';
import { BookOpen, FileVideo, GripVertical, Image as ImageIcon, Pencil, Trash2, Type, Youtube } from 'lucide-react';
import { useLocalization } from '../../../hooks/useLocalization';
import type { AgendaStore } from '../../../meeting/agenda/agendaStore';
import { itemLabel, moveItem, newId, shortTitle } from '../../../meeting/agenda/agendaModel';
import { fetchImageFile, fetchYouTubeTitle, ImageFetchError } from '../../../meeting/agenda/remote';
import { MAX_VIDEO_BYTES, type Agenda, type AgendaItem, type AgendaItemKind } from '../../../meeting/agenda/types';
import { ImageDecodeError, prepareImage } from '../../../meeting/agenda/imageFile';
import { AgendaItemEditor, youTubeFromLink } from './AgendaItemEditor';
import { storeErrorKey, type AgendaSaver } from './useAgendaSaver';

export const KIND_ICON: Record<AgendaItemKind, React.ReactNode> = {
  text: <Type size={16} />,
  image: <ImageIcon size={16} />,
  scripture: <BookOpen size={16} />,
  youtube: <Youtube size={16} />,
  localVideo: <FileVideo size={16} />,
};

export function useItemFallbacks() {
  const { t } = useLocalization();
  return { text: t('meeting.agendaAddText'), image: t('meeting.agendaAddImage'), youtube: 'YouTube', localVideo: t('meeting.agendaVideoLocal') };
}

interface AgendaItemListProps {
  agenda: Agenda;
  store: AgendaStore;
  saver: AgendaSaver;
  /** The agenda as it now stands; the list has already arranged for it to be saved. */
  onChange: (next: Agenda) => void;
  /** Error text to show, already translated; '' for none. */
  message: string;
  onMessage: (text: string) => void;
  /** The meeting's drawer is dark; the home editor is light. */
  dark?: boolean;
  /** An item's fields changed (for refreshing it on screen if it is being shared). */
  onItemEdited?: (item: AgendaItem) => void;
  /** Called before an item is deleted (to stop sharing it first). */
  onBeforeRemove?: (itemId: string) => Promise<void> | void;
  onUsageChange?: () => void;
}

/**
 * The editable list of one agenda's items — shared by the home editor and the
 * meeting drawer, so preparing and adjusting mid-meeting work the same way.
 */
export const AgendaItemList: React.FC<AgendaItemListProps> = ({
  agenda, store, saver, onChange, message, onMessage, dark = false, onItemEdited, onBeforeRemove, onUsageChange,
}) => {
  const { language, t } = useLocalization();
  const fallbacks = useItemFallbacks();
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [videoTab, setVideoTab] = useState<'youtube' | 'local' | null>(null);
  const [imageTab, setImageTab] = useState<'local' | 'online' | null>(null);
  const [link, setLink] = useState('');
  const [imageLink, setImageLink] = useState('');
  const [busy, setBusy] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  const update = (next: Agenda) => {
    onChange(next);
    saver.queue(next);
  };

  const addItem = (item: AgendaItem) => {
    update({ ...agenda, items: [...agenda.items, item] });
    setOpenItemId(item.id);
  };

  const removeItem = async (itemId: string) => {
    await onBeforeRemove?.(itemId);
    saver.discard();
    try {
      onChange(await store.removeItem(agenda, itemId));
      onUsageChange?.();
    } catch (e) { onMessage(t(storeErrorKey(e))); }
  };

  const addFile = async (file: File, kind: 'image' | 'localVideo') => {
    onMessage('');
    try {
      if (kind === 'localVideo' && file.size > MAX_VIDEO_BYTES) { onMessage(t('meeting.agendaVideoTooBig')); return; }
      const blob = kind === 'image' ? await prepareImage(file) : file;
      const title = file.name.replace(/\.[^.]+$/, '');
      // The agenda passed in already carries any unsaved edit, so it goes in with the file.
      saver.discard();
      onChange(await store.addFileItem(agenda, blob, (fileId) => (kind === 'image'
        ? { id: newId(), kind: 'image', title, fileId }
        : { id: newId(), kind: 'localVideo', title, fileId, fileName: file.name, size: file.size })));
      onUsageChange?.();
    } catch (e) {
      onMessage(t(e instanceof ImageDecodeError ? 'meeting.agendaImageInvalid' : storeErrorKey(e)));
    }
  };

  const addYouTube = async () => {
    const pasted = link.trim();
    const parsed = youTubeFromLink(pasted);
    if (!parsed) { onMessage(t('meeting.agendaYouTubeInvalid')); return; }
    setBusy(true);
    const title = await fetchYouTubeTitle(parsed.videoId);
    setBusy(false);
    addItem({ id: newId(), kind: 'youtube', title: title ? shortTitle(title) : 'YouTube', ...parsed, url: pasted });
    setLink('');
    setVideoTab(null);
    onMessage('');
  };

  /**
   * The desktop app keeps a video where it is and remembers its path — no copy,
   * no size limit. The browser has no paths, so there the file is stored.
   */
  const pickLocalVideo = async () => {
    const bridge = window.meetingDesktop?.agenda;
    if (!bridge) { videoInput.current?.click(); return; }
    const picked = await bridge.pickVideo();
    if (!picked) return;
    setVideoTab(null);
    addItem({ id: newId(), kind: 'localVideo', title: picked.name.replace(/\.[^.]+$/, ''), fileId: '', fileName: picked.name, size: picked.size, path: picked.path });
  };

  const addOnlineImage = async () => {
    if (!imageLink.trim()) return;
    setBusy(true);
    try {
      await addFile(await fetchImageFile(imageLink), 'image');
      setImageLink('');
      setImageTab(null);
    } catch (e) {
      onMessage(t(e instanceof ImageFetchError ? 'meeting.agendaImageFetchFailed' : 'meeting.agendaImageInvalid'));
    } finally {
      setBusy(false);
    }
  };

  const row = (open: boolean) => (dark
    ? open ? 'border-blue-400/60 bg-white/10' : 'border-white/10 bg-white/5'
    : open ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white');
  const addButton = `flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm font-medium ${dark
    ? 'border-blue-400/40 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20'
    : 'border-blue-300 bg-blue-50/60 text-blue-700 hover:bg-blue-50'}`;
  const muted = dark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-2">
      {agenda.items.length === 0 && <p className={`py-6 text-center text-sm ${muted}`}>{t('meeting.agendaEmpty')}</p>}
      {agenda.items.map((item, index) => {
        const open = item.id === openItemId;
        return (
          <div key={item.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom.current === null || dragFrom.current === index) return;
              update({ ...agenda, items: moveItem(agenda.items, dragFrom.current, index) });
              dragFrom.current = null;
            }}
            className={`rounded-xl border px-3 py-2.5 ${row(open)}`}>
            <div className="flex items-center gap-2">
              <span draggable onDragStart={() => { dragFrom.current = index; }} title={t('meeting.agendaMove')}
                className={`cursor-grab ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-300 hover:text-gray-500'}`}><GripVertical size={16} /></span>
              <span className={muted}>{KIND_ICON[item.kind]}</span>
              <span className={`min-w-0 flex-1 truncate text-sm ${dark ? 'text-gray-100' : 'text-gray-800'}`}>{itemLabel(item, language, fallbacks)}</span>
              {open ? (
                <button type="button" onClick={() => setOpenItemId(null)}
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700">
                  {t('meeting.agendaDone')}
                </button>
              ) : (
                <button type="button" onClick={() => setOpenItemId(item.id)} aria-label={t('meeting.agendaEdit')}
                  className={`rounded-md px-2 py-1 ${dark ? 'text-gray-400 hover:bg-white/10 hover:text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                  <Pencil size={14} />
                </button>
              )}
              <button type="button" onClick={() => void removeItem(item.id)} aria-label={t('meeting.agendaRemoveItem')}
                className={`rounded-md p-1 ${dark ? 'text-gray-500 hover:bg-red-500/20 hover:text-red-300' : 'text-gray-400 hover:bg-red-50 hover:text-red-600'}`}><Trash2 size={14} /></button>
            </div>
            {open && (
              <div className={dark ? 'mt-3' : 'mt-3 pl-8'}>
                <AgendaItemEditor item={item}
                  onChange={(next) => {
                    update({ ...agenda, items: agenda.items.map((i) => (i.id === next.id ? next : i)) });
                    onItemEdited?.(next);
                  }} />
              </div>
            )}
          </div>
        );
      })}

      {videoTab && (
        <div className={`rounded-xl border p-3 ${dark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
          <div className="mb-2 flex gap-1">
            {(['youtube', 'local'] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setVideoTab(tab)}
                className={`rounded-md px-3 py-1 text-sm ${videoTab === tab ? (dark ? 'bg-white/15 font-semibold text-white' : 'bg-white font-semibold shadow-sm') : muted}`}>
                {t(tab === 'youtube' ? 'meeting.agendaVideoYouTube' : 'meeting.agendaVideoLocal')}
              </button>
            ))}
          </div>
          {videoTab === 'youtube' ? (
            <div className="flex gap-2">
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('meeting.agendaYouTubeLink')}
                onKeyDown={(e) => { if (e.key === 'Enter') void addYouTube(); }}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
              <button type="button" disabled={busy} onClick={() => void addYouTube()} className="rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{t('meeting.agendaDone')}</button>
            </div>
          ) : (
            <button type="button" onClick={() => void pickLocalVideo()} className={addButton}>
              <FileVideo size={16} />{t('meeting.agendaVideoLocal')}
            </button>
          )}
        </div>
      )}

      {imageTab && (
        <div className={`rounded-xl border p-3 ${dark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
          <div className="mb-2 flex gap-1">
            {(['local', 'online'] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setImageTab(tab)}
                className={`rounded-md px-3 py-1 text-sm ${imageTab === tab ? (dark ? 'bg-white/15 font-semibold text-white' : 'bg-white font-semibold shadow-sm') : muted}`}>
                {t(tab === 'local' ? 'meeting.agendaImageLocal' : 'meeting.agendaImageOnline')}
              </button>
            ))}
          </div>
          {imageTab === 'local' ? (
            <button type="button" onClick={() => imageInput.current?.click()} className={addButton}>
              <ImageIcon size={16} />{t('meeting.agendaImagePick')}
            </button>
          ) : (
            <div className="flex gap-2">
              <input value={imageLink} onChange={(e) => setImageLink(e.target.value)} placeholder={t('meeting.agendaImageLink')}
                onKeyDown={(e) => { if (e.key === 'Enter') void addOnlineImage(); }}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
              <button type="button" disabled={busy} onClick={() => void addOnlineImage()}
                className="rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{t('meeting.agendaDone')}</button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" className={addButton} onClick={() => addItem({ id: newId(), kind: 'text', title: '', body: '' })}><Type size={16} />{t('meeting.agendaAddText')}</button>
        <button type="button" className={addButton} onClick={() => { setVideoTab(null); setImageTab(imageTab ? null : 'local'); }}><ImageIcon size={16} />{t('meeting.agendaAddImage')}</button>
        <button type="button" className={addButton} onClick={() => addItem({ id: newId(), kind: 'scripture', bookId: 43, chapter: 3, fromVerse: 16, toVerse: 16 })}><BookOpen size={16} />{t('meeting.agendaAddScripture')}</button>
        <button type="button" className={addButton} onClick={() => { setImageTab(null); setVideoTab(videoTab ? null : 'youtube'); }}><Youtube size={16} />{t('meeting.agendaAddVideo')}</button>
      </div>
      {message && <p className={`text-sm font-medium ${dark ? 'text-red-300' : 'text-red-600'}`} role="alert">{message}</p>}

      <input ref={imageInput} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setImageTab(null); void addFile(f, 'image'); } }} />
      <input ref={videoInput} type="file" accept="video/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setVideoTab(null); void addFile(f, 'localVideo'); } }} />
    </div>
  );
};
