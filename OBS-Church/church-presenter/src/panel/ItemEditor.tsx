import { FolderOpen, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadChapter, scriptureLabel } from '../shared/bible';
import { baseName, youTubeId } from '../shared/files';
import { t } from '../shared/i18n';
import { kindName, type LibraryItem, type Look } from '../shared/model';
import { parseReferences, type Reference } from '../shared/reference';
import { lookOf } from '../shared/slides';
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

  /* A video's name: its YouTube title, or the file's name — unless typed in by hand. */
  const nameTyped = useRef(!isNew && draft.name.trim() !== '');
  const videoUrl = draft.kind === 'video' ? draft.url.trim() : '';
  useEffect(() => {
    if (draft.kind !== 'video' || nameTyped.current || !videoUrl) return;
    let cancelled = false;
    const id = youTubeId(videoUrl);
    if (!id) {
      const file = baseName(videoUrl.split(/[?#]/)[0]).replace(/\.[^.]+$/, '');
      if (file) set({ name: decodeURIComponent(file) });
      return;
    }
    const timer = window.setTimeout(() => {
      fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`)
        .then((res) => (res.ok ? res.json() : null))
        .then((info: { title?: string } | null) => {
          if (!cancelled && !nameTyped.current && info?.title) set({ name: info.title });
        })
        .catch(() => undefined);
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]);

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
    if (draft.kind === 'video' && !draft.url.trim()) { setError(t('editor.needVideo')); return; }
    if (draft.kind === 'ppt' && !draft.path) { setError(t('editor.needPpt')); return; }
    const fallback = draft.kind === 'video' ? (youTubeId(draft.url) ? 'YouTube' : baseName(draft.url)) : baseName(draft.kind === 'image' || draft.kind === 'ppt' ? draft.path : '');
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
                  <label>{t('editor.videoUrl')}
                    <div className="row">
                      <input ref={(el) => { first.current = el; }} value={draft.url} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => set({ url: e.target.value, fileHash: undefined })} />
                      <button type="button" className="chip" onClick={async () => { const url = await pickFile('video'); if (url) set({ url, fileHash: undefined }); }}><FolderOpen size={14} />{t('editor.chooseFile')}</button>
                    </div>
                  </label>
                  <label>{t('editor.startAt')}<input type="number" min={0} value={draft.startSeconds} onChange={(e) => set({ startSeconds: Math.max(0, Number(e.target.value) || 0) })} /></label>
                  <label>{t('editor.name')}<input value={draft.name} placeholder={t('editor.name.hint')} onChange={(e) => { nameTyped.current = e.target.value.trim() !== ''; set({ name: e.target.value }); }} /></label>
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
