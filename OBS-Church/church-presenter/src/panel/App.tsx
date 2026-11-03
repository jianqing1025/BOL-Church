import {
  BookOpen, ChevronDown, ChevronRight, Eraser, FileText, Film, Image as ImageIcon, Lock, LockOpen,
  MonitorOff, Palette, Pencil, Presentation, Trash2, Type,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { insideObs, sendToHost, type HostToPanel } from '../shared/host';
import { t } from '../shared/i18n';
import { kindName, LAYOUTS, type ItemKind, type LibraryItem, type Look, type SlideRef, type SlideSpec } from '../shared/model';
import { lookOf, slidesOf, type SlideEntry } from '../shared/slides';
import { themeById, themeName } from '../shared/themes';
import { blankItem, ItemEditor } from './ItemEditor';
import { LookPicker } from './LookPicker';
import { pickFile, useDeck } from './store';
import { Thumb } from './Thumb';

const KIND_ICONS: Record<ItemKind, ReactNode> = {
  text: <Type size={15} />,
  scripture: <BookOpen size={15} />,
  image: <ImageIcon size={15} />,
  video: <Film size={15} />,
  ppt: <Presentation size={15} />,
};

type Slides = { key: string; entries: SlideEntry[] | null; error: string | null };

/** What is on screen now. */
type Live =
  | { mode: 'slide'; ref: SlideRef; spec: SlideSpec }
  /** Clear: no slide, only the live video. */
  | { mode: 'clear'; ref: SlideRef | null }
  | { mode: 'black'; ref: SlideRef | null }
  | null;

const SIZE_KEY = 'church-presenter.thumb-size';
const readSize = () => { try { return Number(localStorage.getItem(SIZE_KEY)) || 220; } catch { return 220; } };

const lookText = (look: Look) => `${themeName(themeById(look.themeId))} · ${LAYOUTS.find((l) => l.id === look.layout)?.name ?? ''}`;

export function App() {
  const hostRef = useRef<(message: HostToPanel) => void>(() => undefined);
  const onHost = useCallback((message: HostToPanel) => hostRef.current(message), []);
  const { deck, loaded } = useDeck(onHost);

  const [slides, setSlides] = useState<Record<string, Slides>>({});
  const [live, setLive] = useState<Live>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ item: LibraryItem; isNew: boolean } | null>(null);
  const [lookFor, setLookFor] = useState<'default' | string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [size, setSize] = useState(readSize);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /** Saved with "show": shown as soon as OBS has created it (it gets the source's id then). */
  const showWhenReady = useRef<string | null>(null);
  const main = useRef<HTMLElement>(null);

  useEffect(() => { try { localStorage.setItem(SIZE_KEY, String(size)); } catch { /* ignore */ } }, [size]);

  const allItems = useMemo(() => deck.scenes.flatMap((scene) => scene.items.map((item) => ({ item, sceneId: scene.id }))), [deck]);
  const findItem = (id: string) => allItems.find((entry) => entry.item.id === id);

  // ---------- each item opened into its slides ----------
  useEffect(() => {
    for (const { item, sceneId } of allItems) {
      const key = JSON.stringify([item, lookOf(item, deck.defaultLook), sceneId]);
      if (slides[item.id]?.key === key) continue;
      setSlides((s) => ({ ...s, [item.id]: { key, entries: s[item.id]?.entries ?? null, error: null } }));
      slidesOf(item, deck.defaultLook, sceneId).then(
        (entries) => setSlides((s) => (s[item.id]?.key === key ? { ...s, [item.id]: { key, entries, error: null } } : s)),
        (e: unknown) => setSlides((s) => (s[item.id]?.key === key ? { ...s, [item.id]: { key, entries: [], error: e instanceof Error ? e.message : String(e) } } : s)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, deck.defaultLook]);

  /** Every slide of every scene, in order: paging runs straight through from one scene to the next. */
  const flat = useMemo(() => allItems.flatMap(({ item }) => slides[item.id]?.entries ?? []), [allItems, slides]);

  // ---------- putting things on screen ----------
  const show = useCallback((entry: SlideEntry) => {
    sendToHost({ type: 'show', spec: entry.spec, ref: entry.ref });
    setLive({ mode: 'slide', ref: entry.ref, spec: entry.spec });
    setSelected(entry.ref.itemId);
  }, []);

  // Editing what is on screen updates the screen; a new item saved with "show" goes up once OBS has it.
  useEffect(() => {
    if (showWhenReady.current) {
      const first = slides[showWhenReady.current]?.entries?.[0];
      if (first) { showWhenReady.current = null; show(first); return; }
    }
    if (live?.mode !== 'slide') return;
    const entry = slides[live.ref.itemId]?.entries?.[live.ref.index];
    if (entry && JSON.stringify(entry.spec) !== JSON.stringify(live.spec)) show(entry);
  }, [slides, live, show]);

  /** Clear ('text'): the slide comes off and only the live video shows. Black ('all'): all black. */
  const clear = useCallback((what: 'text' | 'all') => {
    const ref = live?.ref ?? null;
    if (what === 'all') {
      sendToHost({ type: 'show', spec: { kind: 'black' }, ref: null });
      setLive({ mode: 'black', ref });
    } else {
      sendToHost({ type: 'show', spec: { kind: 'blank' }, ref: null });
      setLive({ mode: 'clear', ref });
    }
  }, [live]);

  /** Locked: clicks on the slides do nothing; the arrow keys and a presenter remote still turn them. */
  const [locked, setLocked] = useState(false);

  const nav = useCallback((delta: 1 | -1) => {
    if (!flat.length) return;
    const ref = live?.ref;
    let at = ref ? flat.findIndex((e) => e.ref.itemId === ref.itemId && e.ref.index === ref.index) : -1;
    if (at < 0) {
      // Nothing live yet: start at the selected item, else the scene on screen, else the top.
      let start = flat.findIndex((e) => e.ref.itemId === selected);
      if (start < 0) start = flat.findIndex((e) => e.ref.sceneId === deck.currentScene);
      show(flat[Math.max(0, start)]);
      return;
    }
    // After Clear / Black, the next press brings the same slide back.
    if (live?.mode !== 'slide') { show(flat[at]); return; }
    at += delta;
    if (at >= 0 && at < flat.length) show(flat[at]);
  }, [flat, live, selected, show, deck.currentScene]);

  // ---------- changes, through OBS ----------
  async function add(kind: ItemKind) {
    if (kind === 'ppt' || kind === 'image') {
      // Straight to the file dialog; the editor is for changing it later.
      const path = await pickFile(kind);
      if (!path) return;
      const item = { ...blankItem(kind), path } as LibraryItem;
      item.name = path.replace(/\\/g, '/').split('/').pop()!.replace(/\.[^.]+$/, '');
      showWhenReady.current = null;
      sendToHost({ type: 'save-items', items: [item], sceneId: sceneForNew() });
      return;
    }
    setEditing({ item: blankItem(kind), isNew: true });
  }

  /** New items go into the scene of the selected item, else the scene on screen. */
  function sceneForNew(): string | null {
    return (selected && findItem(selected)?.sceneId) || deck.currentScene || deck.scenes[0]?.id || null;
  }

  function saveEdited(items: LibraryItem[], showNow: boolean, isNew: boolean) {
    setEditing(null);
    sendToHost({ type: 'save-items', items, sceneId: sceneForNew() });
    if (showNow) {
      if (isNew) {
        // OBS creates the source and sends the deck back; the first new item is the one at the end of its scene.
        pendingNewShow.current = { count: allItems.length, sceneId: sceneForNew() };
      } else {
        showWhenReady.current = items[0].id;
      }
    }
  }
  /** Shows the first slide of the item OBS adds next (its id is only known once it exists). */
  const pendingNewShow = useRef<{ count: number; sceneId: string | null } | null>(null);
  useEffect(() => {
    const pending = pendingNewShow.current;
    if (!pending || allItems.length <= pending.count) return;
    pendingNewShow.current = null;
    const known = new Set(Object.keys(slides));
    const fresh = allItems.find(({ item }) => !known.has(item.id)) ?? allItems[allItems.length - 1];
    showWhenReady.current = fresh.item.id;
    setSelected(fresh.item.id);
    requestAnimationFrame(() => document.getElementById(`item-${fresh.item.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems]);

  function remove(id: string) {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    setConfirmDelete(null);
    sendToHost({ type: 'remove-item', id });
    if (selected === id) setSelected(null);
  }

  hostRef.current = (message: HostToPanel) => {
    if (message.type === 'nav') nav(message.delta);
    else if (message.type === 'clear') clear(message.what);
    else if (message.type === 'add') void add(message.kind);
    else if (message.type === 'edit-item') {
      const found = findItem(message.id);
      if (found) { setSelected(message.id); setEditing({ item: found.item, isNew: false }); }
    } else if (message.type === 'edit-look') setLookFor(message.id ?? 'default');
  };

  // The keyboard and USB presenters (they send PageUp / PageDown, arrows, B or ".").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || lookFor) return;
      const target = e.target as Element | null;
      if (target?.closest?.('input, textarea, select')) return;
      const key = e.key;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(key)) { e.preventDefault(); nav(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(key)) { e.preventDefault(); nav(-1); }
      else if (key === 'F1' || key === 'b' || key === 'B' || key === '.') { e.preventDefault(); clear('all'); }
      else if (key === 'F2' || key === 'Escape') { e.preventDefault(); clear('text'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, clear, editing, lookFor]);

  // While the panel has the keyboard it pages itself; OBS's PageUp/PageDown hotkeys
  // (for a presenter used while OBS is in the background) stand down meanwhile.
  useEffect(() => {
    if (!insideObs()) return;
    const report = () => sendToHost({ type: 'focus', focused: document.hasFocus() });
    window.addEventListener('focus', report);
    window.addEventListener('blur', report);
    report();
    return () => {
      window.removeEventListener('focus', report);
      window.removeEventListener('blur', report);
    };
  }, []);

  // Keep the live slide in view.
  useEffect(() => {
    if (live?.mode !== 'slide') return;
    main.current?.querySelector('.thumb.live')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [live]);

  const liveKey = live?.mode === 'slide' ? `${live.ref.itemId}:${live.ref.index}` : null;
  const lookItem = lookFor && lookFor !== 'default' ? findItem(lookFor)?.item ?? null : null;
  const empty = loaded && !allItems.length;

  return (
    <div className="app" style={{ '--thumb': `${size}px` } as React.CSSProperties}>
      <header className="toolbar">
        {!insideObs() && (
          // In OBS these buttons sit under the Sources list.
          <div className="group">
            {(['text', 'scripture', 'image', 'video', 'ppt'] as const).map((kind) => (
              <button key={kind} type="button" className="add" onClick={() => void add(kind)}>
                {KIND_ICONS[kind]}<span>{kindName(kind)}</span>
              </button>
            ))}
          </div>
        )}
        <h1 className="panel-title">{t('panel.title')}</h1>
        <button type="button" className="default-look" onClick={() => setLookFor('default')} title={t('toolbar.defaultLook.tip')}>
          <Palette size={15} /><span>{t('toolbar.defaultLook', { theme: themeName(themeById(deck.defaultLook.themeId)), layout: LAYOUTS.find((l) => l.id === deck.defaultLook.layout)?.name ?? '' })}</span>
        </button>
        <div className="spacer" />
        <label className="size" title={t('toolbar.size')}>
          <input type="range" min={140} max={420} step={10} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
        <div className="group">
          <button type="button" className={locked ? 'on danger' : ''} onClick={() => setLocked((l) => !l)}
            title={t(locked ? 'toolbar.unlock.tip' : 'toolbar.lock.tip')} aria-pressed={locked}>
            {locked ? <Lock size={15} /> : <LockOpen size={15} />}<span>{t('toolbar.lock')}</span>
          </button>
          <button type="button" className={live?.mode === 'clear' ? 'on' : ''} onClick={() => clear('text')} title={t('toolbar.clearText.tip')}>
            <Eraser size={15} /><span>{t('toolbar.clearText')}</span>
          </button>
          <button type="button" className={live?.mode === 'black' ? 'on danger' : ''} onClick={() => clear('all')} title={t('toolbar.blank.tip')}>
            <MonitorOff size={15} /><span>{t('toolbar.blank')}</span>
          </button>
        </div>
      </header>

      <main className={`slides${locked ? ' locked' : ''}`} ref={main}>
        {empty && (
          <div className="welcome">
            <h2>{t('welcome.title')}</h2>
            <p>{t('welcome.body')}</p>
            <p className="muted">{t('welcome.keys')}</p>
          </div>
        )}
        {!empty && deck.scenes.map((scene) => (
          <section key={scene.id} className={`scene${scene.id === deck.currentScene ? ' current' : ''}`}>
            <div className="scene-head">
              <h2>{scene.name}</h2>
              {scene.id === deck.currentScene && <span className="scene-badge">{t('scene.current')}</span>}
            </div>
            {!scene.items.length && <p className="muted scene-empty">{t('scene.empty')}</p>}
            {scene.items.map((item) => {
              const state = slides[item.id];
              const look = lookOf(item, deck.defaultLook);
              const isCollapsed = collapsed.has(item.id);
              return (
                <section key={item.id} id={`item-${item.id}`} className={`item${selected === item.id ? ' selected' : ''}`}>
                  <div className="item-head" onClick={() => setSelected(item.id)}>
                    <button type="button" className="icon" aria-label={t(isCollapsed ? 'item.expand' : 'item.collapse')}
                      onClick={(e) => { e.stopPropagation(); setCollapsed((s) => { const n = new Set(s); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; }); }}>
                      {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <span className="kind">{KIND_ICONS[item.kind]}</span>
                    <h3 onDoubleClick={() => setEditing({ item, isNew: false })}>{item.name || kindName(item.kind)}</h3>
                    {item.kind !== 'ppt' && <span className="look-tag">{lookText(look)}{item.look ? '' : ` ${t('item.default')}`}</span>}
                    <div className="spacer" />
                    {item.kind !== 'ppt' && (
                      <button type="button" className="icon" title={t('item.style')} onClick={(e) => { e.stopPropagation(); setLookFor(item.id); }}><Palette size={15} /></button>
                    )}
                    <button type="button" className="icon" title={t('item.edit')} onClick={(e) => { e.stopPropagation(); setEditing({ item, isNew: false }); }}><Pencil size={15} /></button>
                    <button type="button" className={`icon${confirmDelete === item.id ? ' danger-text' : ''}`} title={t('item.delete')}
                      onBlur={() => setConfirmDelete(null)}
                      onClick={(e) => { e.stopPropagation(); remove(item.id); }}>
                      <Trash2 size={15} />{confirmDelete === item.id && <span>{t('item.deleteConfirm')}</span>}
                    </button>
                  </div>
                  {!isCollapsed && (
                    <div className="grid">
                      {state?.error && <div className="item-error"><FileText size={16} />{state.error}</div>}
                      {!state?.entries && !state?.error && <div className="muted loading">{t('item.loading')}</div>}
                      {state?.entries?.map((entry) => {
                        const key = `${entry.ref.itemId}:${entry.ref.index}`;
                        return (
                          <button type="button" key={key} className={`thumb${liveKey === key ? ' live' : ''}`}
                            onClick={() => { if (!locked) show(entry); }} title={entry.label}>
                            <Thumb spec={entry.spec} />
                            <span className="thumb-label"><b>{entry.ref.index + 1}</b>{entry.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </section>
        ))}
      </main>

      {editing && (
        <ItemEditor item={editing.item} isNew={editing.isNew} defaultLook={deck.defaultLook}
          onSave={(items, showNow) => saveEdited(items, showNow, editing.isNew)} onClose={() => setEditing(null)} />
      )}

      {lookFor && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setLookFor(null); }}>
          <div className="modal wide" role="dialog" aria-label={t('item.style')} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setLookFor(null); }}>
            <header>
              <h3>{lookItem ? t('look.title.item', { name: lookItem.name }) : t('look.title.default')}</h3>
              <div className="spacer" />
              <button type="button" className="primary" onClick={() => setLookFor(null)}>{t('look.done')}</button>
            </header>
            <div className="modal-body">
              {lookItem ? (
                <LookPicker value={lookOf(lookItem, deck.defaultLook)} inherited={!lookItem.look}
                  onChange={(look) => sendToHost({ type: 'save-items', items: [{ ...lookItem, look }], sceneId: null })}
                  onInherit={() => sendToHost({ type: 'save-items', items: [{ ...lookItem, look: undefined }], sceneId: null })} />
              ) : (
                <LookPicker value={deck.defaultLook} onChange={(look) => sendToHost({ type: 'set-default-look', look })} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
