import { FolderOpen, ListVideo, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadChapter, scriptureLabel } from '../shared/bible';
import { baseName, youTubeId } from '../shared/files';
import { t } from '../shared/i18n';
import { kindName, type LibraryItem, type Look, type VideoEntry } from '../shared/model';
import { parseReferences, type Reference } from '../shared/reference';
import { lookOf, videosOf } from '../shared/slides';
import { fetchPlaylist, fetchVideoTitle, isPlaylistLink, watchUrl, youTubeListId } from '../shared/youtube';
import { LookPicker } from './LookPicker';
import { ScripturePicker } from './ScripturePicker';
import { draftId, pickFile } from './store';

/** Add or edit one item. Scripture can take several references at once; each becomes its own item. */
export function ItemEditor({ item, isNew, defaultLook, onSave, onClose }: {
  item: LibraryItem;
  isNew: boolean;
  defaultLook: Look;
  /** `show`: put the first slide on screen right away. */
  onSave: (items: LibraryItem[], show: boolean) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<LibraryItem>(item);
  const [tab, setTab] = useState<'content' | 'look'>('content');
  const [quick, setQuick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const look = lookOf(draft, defaultLook);
  const first = useRef<HTMLElement | null>(null);

  useEffect(() => { first.current?.focus(); }, []);

  /* A video item's videos, one card each. The section's name follows the video's title (one video)
   * or the playlist's (several) — unless typed in by hand; so does each video's title. */
  const nameTyped = useRef(!isNew && draft.name.trim() !== '');
  const [videos, setVideos] = useState<VideoRow[]>(() => item.kind === 'video'
    ? videosOf(item).map((video) => ({ ...video, key: draftId(), titleTyped: !isNew && video.title.trim() !== '' }))
    : []);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [playlistBusy, setPlaylistBusy] = useState(false);
  useEffect(() => {
    if (draft.kind !== 'video' || nameTyped.current) return;
    const title = videos.length > 1 ? playlistTitle || videos[0]?.title : videos[0]?.title;
    if (title && title !== draft.name) set({ name: title });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, playlistTitle]);

  const patchVideo = (key: string, patch: Partial<VideoRow>) =>
    setVideos((list) => list.map((video) => (video.key === key ? { ...video, ...patch } : video)));

  /** Every video of the playlist, in place of the row that named it. */
  async function addPlaylist(key: string, listId: string) {
    setPlaylistBusy(true);
    setError(null);
    try {
      const playlist = await fetchPlaylist(listId);
      const rows: VideoRow[] = playlist.videos.map((video) => ({
        kind: 'video', url: watchUrl(video.id), startSeconds: 0, title: video.title, key: draftId(), titleTyped: false,
      }));
      if (rows.length) {
        setVideos((list) => {
          const at = list.findIndex((video) => video.key === key);
          const next = [...list];
          if (at < 0) next.push(...rows);
          else next.splice(at, 1, ...rows);
          return next;
        });
      }
      setPlaylistTitle(playlist.title);
    } catch (e) {
      setError(`${t('editor.playlistError')} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPlaylistBusy(false);
    }
  }

  /* A changed link: a playlist link brings in all its videos; otherwise the video's title is looked up. */
  const videoKeys = videos.map((video) => `${video.key}=${video.url.trim()}`).join('|');
  useEffect(() => {
    if (draft.kind !== 'video') return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      for (const video of videos) {
        const url = video.url.trim();
        if (!url) continue;
        const listId = youTubeListId(url);
        if (listId && isPlaylistLink(url)) { void addPlaylist(video.key, listId); continue; }
        if (video.titleTyped || video.title) continue;
        if (!youTubeId(url)) {
          const file = baseName(url.split(/[?#]/)[0]).replace(/\.[^.]+$/, '');
          if (file) patchVideo(video.key, { title: decodeURIComponent(file) });
          continue;
        }
        void fetchVideoTitle(url).then((title) => {
          if (!cancelled && title) setVideos((list) => list.map((row) =>
            row.key === video.key && !row.titleTyped && row.url.trim() === url ? { ...row, title } : row));
        });
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoKeys]);

  const quickRefs = useMemo(() => parseReferences(quick), [quick]);

  const set = (patch: Partial<LibraryItem>) => setDraft((d) => ({ ...d, ...patch } as LibraryItem));

  async function save(show: boolean) {
    setError(null);
    if (draft.kind === 'scripture') {
      // A typed reference wins over the dropdowns; each becomes its own item.
      const version = draft.version ?? 'cuv';
      const refs: Reference[] = quick.trim() ? quickRefs : [draft];
      if (!refs.length) { setError(t('editor.notReadable')); return; }
      try {
        const items = await Promise.all(refs.map(async (ref, i) => {
          const verses = await loadChapter(ref.bookId, ref.chapter, version);
          const fromVerse = Math.min(ref.fromVerse, verses.length);
          const toVerse = Math.min(Math.max(ref.toVerse, fromVerse), verses.length);
          return {
            ...draft, ...ref, version, fromVerse, toVerse,
            id: i === 0 ? draft.id : draftId(),
            name: scriptureLabel(ref.bookId, ref.chapter, fromVerse, toVerse, version),
          } as LibraryItem;
        }));
        onSave(items, show);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    if (draft.kind === 'text') {
      const name = draft.name.trim() || draft.title.trim() || draft.body.trim().split('\n')[0]?.slice(0, 30) || kindName('text');
      onSave([{ ...draft, name }], show);
      return;
    }
    if (draft.kind === 'image' && !draft.path) { setError(t('editor.needImage')); return; }
    if (draft.kind === 'video') {
      const list = videos.filter((video) => video.url.trim() && !isPlaylistLink(video.url.trim()))
        .map(({ key: _key, titleTyped: _typed, ...video }): VideoEntry => ({
          ...video, url: video.url.trim(), title: video.title.trim() || (youTubeId(video.url) ? 'YouTube' : baseName(video.url)),
        }));
      if (!list.length) { setError(t('editor.needVideo')); return; }
      const [head, ...rest] = list;
      const name = draft.name.trim() || (rest.length ? playlistTitle : '') || head.title;
      onSave([{
        ...draft, name, url: head.url, startSeconds: head.startSeconds, fileHash: head.fileHash,
        videoTitle: rest.length ? head.title : undefined, playlist: rest.length ? rest : undefined,
      }], show);
      return;
    }
    if (draft.kind === 'ppt' && !draft.path) { setError(t('editor.needPpt')); return; }
    const fallback = baseName(draft.kind === 'image' || draft.kind === 'ppt' ? draft.path : '');
    onSave([{ ...draft, name: draft.name.trim() || fallback.replace(/\.[^.]+$/, '') }], show);
  }

  const title = t(isNew ? 'editor.add' : 'editor.edit', { kind: kindName(draft.kind) });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label={title}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save(false);
        }}>
        <header>
          <h3>{title}</h3>
          <div className="tabs">
            <button type="button" className={tab === 'content' ? 'on' : ''} onClick={() => setTab('content')}>{t('editor.content')}</button>
            {draft.kind !== 'ppt' && <button type="button" className={tab === 'look' ? 'on' : ''} onClick={() => setTab('look')}>{t('editor.look')}</button>}
          </div>
          <button type="button" className="icon" aria-label={t('editor.close')} onClick={onClose}><X size={18} /></button>
        </header>

        <div className="modal-body">
          {tab === 'look' ? (
            <LookPicker value={look} inherited={!draft.look}
              onChange={(next: Look) => set({ look: next })}
              onInherit={() => set({ look: undefined })} />
          ) : (
            <div className="form">
              {draft.kind === 'text' && (
                <>
                  <label>{t('editor.name')}<input value={draft.name} placeholder={t('editor.name.hint')} onChange={(e) => set({ name: e.target.value })} /></label>
                  <label>{t('editor.title')}<input ref={(el) => { first.current = el; }} value={draft.title} placeholder={t('editor.title.hint')} onChange={(e) => set({ title: e.target.value })} /></label>
                  <label>{t('editor.body')}
                    <textarea rows={12} value={draft.body} onChange={(e) => set({ body: e.target.value })} placeholder={t('editor.body.hint')} />
                  </label>
                </>
              )}

              {draft.kind === 'scripture' && (
                <>
                  <ScripturePicker
                    value={{ bookId: draft.bookId, chapter: draft.chapter, fromVerse: draft.fromVerse, toVerse: draft.toVerse, version: draft.version ?? 'cuv' }}
                    onChange={(choice) => set(choice)} />
                  <label>{t('editor.orType')}
                    <input ref={(el) => { first.current = el; }} value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={t('editor.orType.hint')} />
                  </label>
                  {quick.trim() && (
                    <p className="muted">
                      {quickRefs.length
                        ? t('editor.willAdd', {
                          n: quickRefs.length,
                          list: quickRefs.map((r) => scriptureLabel(r.bookId, r.chapter, r.fromVerse, r.toVerse, draft.version ?? 'cuv').replace(/–999$/, '')).join(', '),
                        })
                        : t('editor.unreadable')}
                    </p>
                  )}
                  <p className="muted">{t('editor.scriptureNote')}</p>
                </>
              )}

              {draft.kind === 'image' && (
                <>
                  <FileRow label={t('editor.image')} path={draft.path} onPick={async () => { const path = await pickFile('image'); if (path) set({ path, fileHash: undefined }); }} />
                  <label>{t('editor.name')}<input value={draft.name} placeholder={baseName(draft.path)} onChange={(e) => set({ name: e.target.value })} /></label>
                  <label className="check"><input type="checkbox" checked={draft.fill} onChange={(e) => set({ fill: e.target.checked })} />{t('editor.fill')}</label>
                </>
              )}

              {draft.kind === 'video' && (
                <>
                  <label>{t('editor.name')}<input value={draft.name} placeholder={t('editor.name.hint')} onChange={(e) => { nameTyped.current = e.target.value.trim() !== ''; set({ name: e.target.value }); }} /></label>
                  <div className="video-rows">
                    <span className="video-rows-head">{t('editor.videos')}</span>
                    {videos.map((video, i) => {
                      const url = video.url.trim();
                      const listId = youTubeListId(url);
                      const changeUrl = (next: string) => patchVideo(video.key, {
                        url: next, fileHash: undefined, fileName: undefined, title: video.titleTyped ? video.title : '',
                      });
                      return (
                        <div key={video.key} className="video-row">
                          <span className="video-n">{i + 1}</span>
                          <div className="video-fields">
                            <div className="row">
                              <input ref={i === 0 ? (el) => { first.current = el; } : undefined} value={video.url}
                                placeholder={t('editor.videoUrlHint')} aria-label={t('editor.videoUrl')}
                                onChange={(e) => changeUrl(e.target.value)} />
                              <button type="button" className="chip" onClick={async () => { const picked = await pickFile('video'); if (picked) changeUrl(picked); }}>
                                <FolderOpen size={14} />{t('editor.chooseFile')}
                              </button>
                            </div>
                            <div className="row">
                              <input value={video.title} placeholder={t('editor.videoTitle')} aria-label={t('editor.videoTitle')}
                                onChange={(e) => patchVideo(video.key, { title: e.target.value, titleTyped: e.target.value.trim() !== '' })} />
                              <input className="video-start" type="number" min={0} value={video.startSeconds} title={t('editor.startAt')} aria-label={t('editor.startAt')}
                                onChange={(e) => patchVideo(video.key, { startSeconds: Math.max(0, Number(e.target.value) || 0) })} />
                            </div>
                            {listId && !isPlaylistLink(url) && (
                              <button type="button" className="chip" disabled={playlistBusy} onClick={() => void addPlaylist(video.key, listId)}>
                                <ListVideo size={14} />{t('editor.addPlaylist')}
                              </button>
                            )}
                          </div>
                          <button type="button" className="icon" title={t('editor.removeVideo')} disabled={videos.length < 2}
                            onClick={() => setVideos((list) => list.filter((row) => row.key !== video.key))}><Trash2 size={15} /></button>
                        </div>
                      );
                    })}
                    <button type="button" className="chip add-video" onClick={() => setVideos((list) => [...list, {
                      kind: 'video', url: '', startSeconds: 0, title: '', key: draftId(), titleTyped: false,
                    }])}><Plus size={14} />{t('editor.addVideo')}</button>
                    {playlistBusy && <p className="muted">{t('editor.playlistLoading')}</p>}
                  </div>
                  <p className="muted">{t('editor.playlistNote')}</p>
                  <p className="muted">{t('editor.videoNote')}</p>
                </>
              )}

              {draft.kind === 'ppt' && (
                <>
                  <FileRow label={t('editor.pptFile')} path={draft.path} onPick={async () => { const path = await pickFile('ppt'); if (path) set({ path, fileHash: undefined }); }} />
                  <label>{t('editor.name')}<input value={draft.name} placeholder={baseName(draft.path)} onChange={(e) => set({ name: e.target.value })} /></label>
                  <p className="muted">{t('editor.pptNote')}</p>
                </>
              )}
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </div>

        <footer>
          <button type="button" onClick={onClose}>{t('editor.cancel')}</button>
          <button type="button" onClick={() => void save(true)}>{t(isNew ? 'editor.addShow' : 'editor.saveShow')}</button>
          <button type="button" className="primary" onClick={() => void save(false)}>{t(isNew ? 'editor.addOnly' : 'editor.save')}</button>
        </footer>
      </div>
    </div>
  );
}

/** A video in the editor: its entry, a key for React, and whether its title was typed in by hand. */
type VideoRow = VideoEntry & { key: string; titleTyped: boolean };

function FileRow({ label, path, onPick }: { label: string; path: string; onPick: () => void }) {
  return (
    <label>{label}
      <div className="row">
        <input readOnly value={path} placeholder={t('editor.notChosen')} title={path} />
        <button type="button" className="chip" onClick={onPick}><FolderOpen size={14} />{t('editor.choose')}</button>
      </div>
    </label>
  );
}

/** A fresh item of each kind. */
export function blankItem(kind: LibraryItem['kind']): LibraryItem {
  const base = { id: draftId(), name: '' };
  switch (kind) {
    case 'text': return { ...base, kind, title: '', body: '' };
    case 'scripture': return { ...base, kind, bookId: 43, chapter: 3, fromVerse: 16, toVerse: 16, version: 'cuv' };
    case 'image': return { ...base, kind, path: '', fill: false };
    case 'video': return { ...base, kind, url: '', startSeconds: 0 };
    case 'ppt': return { ...base, kind, path: '', pages: 0 };
  }
}
