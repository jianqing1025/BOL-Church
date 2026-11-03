import {
  ArrowDown, ArrowUp, BookOpen, Film, Image as ImageIcon, LogOut, Pencil, Plus, Presentation, Settings, Trash2, Type,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { t } from '../shared/i18n';
import { kindName, type SlideSpec, type ItemKind } from '../shared/model';
import { mountCardMedia } from '../shared/cardMedia';
import { App } from '../panel/App';
import { Thumb } from '../panel/Thumb';
import {
  addScene, deleteScene, deleteTemplate, getState, listTemplates, load, loadTemplate, login, logout, moveItem, moveScene,
  removeItem, renameScene, resolveConflict, saveTemplate, selectItem, selectScene, subscribe, token, type TemplateInfo,
} from './cloud';

/**
 * OBS 在線: the church's OBS content on the web — the Scenes and Sources lists on the
 * left (laid out like OBS Church's), the slides in the middle, templates (whole saved
 * setups) and the preview on the right — kept in the same account OBS Church syncs with.
 */

const KIND_ICONS: Record<ItemKind, ReactNode> = {
  text: <Type size={14} />,
  scripture: <BookOpen size={14} />,
  image: <ImageIcon size={14} />,
  video: <Film size={14} />,
  ppt: <Presentation size={14} />,
};

/** Talks to the slide area the way OBS does (window.churchHost). */
const toPanel = (message: Parameters<NonNullable<Window['churchHost']>['receive']>[0]) => window.churchHost?.receive(message);

export function EditorApp() {
  const [signedIn, setSignedIn] = useState(() => !!token());
  if (!signedIn) return <Gate onIn={() => setSignedIn(true)} />;
  return <Editor />;
}

function Gate({ onIn }: { onIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="gate">
      <form className="gate-box" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const failure = await login(password);
        setBusy(false);
        if (failure) setError(failure === 'offline' ? t('editor.web.offline')
          : failure === 'too-many-attempts' ? t('editor.web.tooMany') : t('editor.web.wrong'));
        else onIn();
      }}>
        <h1>{t('editor.web.title')}</h1>
        <p className="muted">{t('editor.web.intro')}</p>
        <input type="password" autoFocus value={password} placeholder={t('editor.web.password')}
          onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy || !password}>{t('editor.web.enter')}</button>
      </form>
    </div>
  );
}

function Editor() {
  const state = useSyncExternalStore(subscribe, getState);
  const previewLayers = useRef<HTMLDivElement>(null);
  const [mediaError, setMediaError] = useState('');
  const [preview, setPreview] = useState<SlideSpec>({ kind: 'blank' });
  const [renaming, setRenaming] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    setMediaError('');
    if (!previewLayers.current) return;
    return mountCardMedia(previewLayers.current, preview.media ?? [], preview.mediaPlayback?.playing ?? false, setMediaError);
  }, [preview]);

  const scenes = state.content.scenes;
  const scene = scenes.find((s) => s.syncId === state.scene) ?? scenes[0];
  const itemIndex = scene?.items.findIndex((item) => item.syncId === state.item) ?? -1;
  const sceneIndex = scenes.findIndex((s) => s.syncId === scene?.syncId);
  useEffect(() => {
    const listener = (event: Event) => setPreview((event as CustomEvent<SlideSpec>).detail);
    window.addEventListener('church-web-preview', listener);
    return () => window.removeEventListener('church-web-preview', listener);
  }, []);
  const saveText = {
    conflict: t('editor.web.conflict'),
    loading: t('editor.web.loading'), saved: t('editor.web.saved'), saving: t('editor.web.saving'),
    error: `${t('editor.web.saveError')} ${state.error ?? ''}`, reloaded: t('editor.web.reloaded'),
  }[state.save];

  return (
    <div className="editor">
      <aside className="editor-side">
        {state.save === 'conflict' && <div className="cloud-conflict">
          <p>{saveText}</p>
          <button onClick={() => void resolveConflict(false)}>{t('editor.web.loadCloud')}</button>
          <button onClick={() => void resolveConflict(true)}>{t('editor.web.keepMine')}</button>
        </div>}
        <header className="editor-brand">
          <strong>{t('editor.web.title')}</strong>
          <span className={`save-state ${state.save}`}>{saveText}</span>
          <button type="button" className="icon" title={t('editor.web.signOut')} onClick={logout}><LogOut size={15} /></button>
        </header>

        {/* Scenes and Sources share the column half and half, each with its toolbar underneath, as in OBS Church. */}
        <section className="side-box">
          <h2 className="side-title">{t('editor.web.scenes')}</h2>
          <ol className="side-list">
            {scenes.map((s) => (
              <li key={s.syncId} className={s.syncId === scene?.syncId ? 'selected' : ''}
                onClick={() => selectScene(s.syncId)} onDoubleClick={() => setRenaming(s.syncId)}>
                {renaming === s.syncId ? (
                  <input autoFocus defaultValue={s.name}
                    onBlur={(e) => { renameScene(s.syncId, e.target.value); setRenaming(null); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }} />
                ) : <span className="name">{s.name}</span>}
              </li>
            ))}
          </ol>
          <div className="side-toolbar" role="toolbar" aria-label={t('editor.web.scenes')}>
            <button title={t('editor.web.addScene')} onClick={() => addScene(t('editor.web.newScene'))}><Plus size={16} /></button>
            <button title={t('item.delete')} disabled={!scene || scenes.length < 2}
              onClick={() => { if (scene && window.confirm(`${t('item.delete')}: ${scene.name}?`)) deleteScene(scene.syncId); }}>
              <Trash2 size={16} />
            </button>
            <button title={t('editor.web.rename')} disabled={!scene} onClick={() => scene && setRenaming(scene.syncId)}><Pencil size={16} /></button>
            <button title={t('editor.web.moveUp')} disabled={!scene || sceneIndex <= 0} onClick={() => scene && moveScene(scene.syncId, -1)}><ArrowUp size={16} /></button>
            <button title={t('editor.web.moveDown')} disabled={!scene || sceneIndex >= scenes.length - 1} onClick={() => scene && moveScene(scene.syncId, 1)}><ArrowDown size={16} /></button>
          </div>
        </section>

        <section className="side-box">
          <h2 className="side-title">{t('editor.web.sources')}</h2>
          <ol className="side-list">
            {scene?.items.map((item) => (
              <li key={item.syncId} className={item.syncId === state.item ? 'selected' : ''}
                onClick={() => selectItem(item.syncId)}
                onDoubleClick={() => toPanel({ type: 'edit-item', id: item.syncId })}>
                <span className="kind">{KIND_ICONS[item.kind]}</span>
                <span className="name">{item.name || kindName(item.kind)}</span>
              </li>
            ))}
            {scene && !scene.items.length && <li className="muted empty">{t('scene.empty')}</li>}
          </ol>
          <div className="add-grid">
            {(['text', 'scripture', 'image', 'video', 'ppt'] as const).map((kind) => (
              <button key={kind} type="button" disabled={!scene} onClick={() => toPanel({ type: 'add', kind })}>{kindName(kind)}</button>
            ))}
            <button type="button" onClick={() => toPanel({ type: 'edit-look', id: null })}>{t('editor.web.style')}</button>
          </div>
          <div className="side-toolbar" role="toolbar" aria-label={t('editor.web.sources')}>
            <button title={t('kind.text')} disabled={!scene} onClick={() => toPanel({ type: 'add', kind: 'text' })}><Plus size={16} /></button>
            <button title={t('item.delete')} disabled={!state.item}
              onClick={() => { if (state.item && window.confirm(t('item.delete') + '?')) removeItem(state.item); }}>
              <Trash2 size={16} />
            </button>
            <button title={t('editor.web.rename')} disabled={!state.item} onClick={() => state.item && toPanel({ type: 'edit-item', id: state.item })}><Settings size={16} /></button>
            <button title={t('editor.web.moveUp')} disabled={itemIndex <= 0} onClick={() => state.item && moveItem(state.item, -1)}><ArrowUp size={16} /></button>
            <button title={t('editor.web.moveDown')} disabled={itemIndex < 0 || itemIndex >= (scene?.items.length ?? 0) - 1}
              onClick={() => state.item && moveItem(state.item, 1)}>
              <ArrowDown size={16} />
            </button>
          </div>
        </section>
      </aside>

      <div className="editor-slides">
        <App web />
      </div>
      <aside className="editor-preview">
        <Templates />
        <h2>{t('editor.web.preview')}</h2>
        <div className="web-media-preview"><Thumb spec={preview} /><div className="web-media-layers" ref={previewLayers} /></div>
        {mediaError && <p className="error">{mediaError}</p>}
      </aside>
    </div>
  );
}

/** Whole setups — every scene and its sources — saved in the account, to load back later. */
function Templates() {
  const [list, setList] = useState<TemplateInfo[] | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try { setList(await listTemplates()); setError(''); } catch (e) { setError(String(e)); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); await refresh(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const chosen = list?.find((template) => template.id === selected) ?? null;
  const load = (id: string) => { if (window.confirm(t('editor.web.templateConfirmLoad'))) void run(() => loadTemplate(id)); };

  return (
    <section className="templates">
      <h2>{t('editor.web.templates')}</h2>
      <p className="muted hint">{t('editor.web.templatesHint')}</p>
      <form className="template-save" onSubmit={(e) => {
        e.preventDefault();
        const clean = name.trim();
        if (clean) void run(async () => { await saveTemplate(clean); setName(''); });
      }}>
        <input value={name} placeholder={t('editor.web.templateName')} maxLength={100} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={busy || !name.trim()}>{t('editor.web.templateSave')}</button>
      </form>
      <ol className="side-list template-list">
        {list?.map((template) => (
          <li key={template.id} className={template.id === selected ? 'selected' : ''}
            onClick={() => setSelected(template.id)} onDoubleClick={() => load(template.id)}>
            <span className="name">{template.name}</span>
            <span className="muted count">{t('editor.web.templateCount', { scenes: template.scenes, items: template.items })}</span>
          </li>
        ))}
        {list && !list.length && <li className="muted empty">{t('editor.web.templateEmpty')}</li>}
      </ol>
      <div className="side-toolbar">
        <button disabled={busy || !chosen} onClick={() => chosen && load(chosen.id)}>{t('editor.web.templateLoad')}</button>
        <button disabled={busy || !chosen} onClick={() => chosen && void run(() => saveTemplate(chosen.name, chosen.id))}>
          {t('editor.web.templateOverwrite')}
        </button>
        <button disabled={busy || !chosen} title={t('editor.web.templateDelete')} onClick={() => {
          if (chosen && window.confirm(t('editor.web.templateConfirmDelete'))) {
            void run(async () => { await deleteTemplate(chosen.id); setSelected(null); });
          }
        }}><Trash2 size={16} /></button>
      </div>
      {error && <p className="error">{t('editor.web.templateError')} {error}</p>}
    </section>
  );
}
