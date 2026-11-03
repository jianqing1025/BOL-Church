import { useEffect, useRef, useState } from 'react';
import { insideObs, onHostMessage, sendToHost, setDevHost, type HostToPanel, type PanelToHost } from '../shared/host';
import { t } from '../shared/i18n';
import { emptyDeck, kindName, newId, type Deck, type LibraryItem } from '../shared/model';

/**
 * The deck: OBS's scenes and their items. Inside OBS, OBS owns it (the items are
 * "Church Slides" sources) and sends it whenever it changes; the panel asks for
 * changes and waits for the new deck. Outside OBS (developing in a browser) this
 * file plays OBS: one scene, kept in localStorage.
 */

const pendingPicks = new Map<string, (path: string | null) => void>();

/** Asks OBS for a file (it opens Windows' own dialog, so the full path comes back). */
export function pickFile(kind: 'ppt' | 'image' | 'video'): Promise<string | null> {
  if (!insideObs()) {
    return Promise.resolve(window.prompt(t('editor.prompt', { kind: kindName(kind) }))?.trim() || null);
  }
  const requestId = newId();
  return new Promise((resolve) => {
    pendingPicks.set(requestId, resolve);
    sendToHost({ type: 'pick-file', requestId, kind });
  });
}

// ---------- the stand-in host for development ----------

const DEV_KEY = 'church-presenter.deck';

function demoDeck(): Deck {
  return {
    currentScene: 'scene-1',
    defaultLook: { themeId: 'art-dawn-cross', layout: 'center' },
    scenes: [
      {
        id: 'scene-1', name: 'Welcome', items: [
          { id: 'demo-welcome', kind: 'text', name: 'Welcome', title: 'Sunday Worship', body: 'Welcome to Sunday worship\n\nPlease silence your phone', look: { themeId: 'midnight-gold', layout: 'center' } },
          { id: 'demo-song', kind: 'text', name: 'Amazing Grace', title: 'Amazing Grace', body: 'Amazing grace, how sweet the sound\nThat saved a wretch like me\n\nI once was lost, but now am found\nWas blind, but now I see', look: { themeId: 'art-stained-glass', layout: 'lyrics' } },
        ],
      },
      {
        id: 'scene-2', name: 'Sermon', items: [
          { id: 'demo-john', kind: 'scripture', name: 'John 3:16–18', bookId: 43, chapter: 3, fromVerse: 16, toVerse: 18, version: 'kjv' },
          { id: 'demo-ps', kind: 'scripture', name: '詩篇 23:1–6', bookId: 19, chapter: 23, fromVerse: 1, toVerse: 6, look: { themeId: 'art-living-water', layout: 'scripture' } },
        ],
      },
    ],
  };
}

function devHost(deliver: (message: HostToPanel) => void) {
  let deck: Deck;
  try {
    const saved = localStorage.getItem(DEV_KEY);
    deck = new URLSearchParams(location.search).has('demo') ? demoDeck() : saved ? (JSON.parse(saved) as Deck) : emptyDeck();
  } catch {
    deck = emptyDeck();
  }
  if (!deck.scenes.length) deck.scenes.push({ id: 'scene-1', name: 'Scene', items: [] });
  deck.currentScene ??= deck.scenes[0].id;

  const publish = () => {
    try { localStorage.setItem(DEV_KEY, JSON.stringify(deck)); } catch { /* full */ }
    deliver({ type: 'deck', deck: structuredClone(deck) });
  };

  return (message: PanelToHost) => {
    switch (message.type) {
      case 'panel-ready':
        publish();
        break;
      case 'save-items': {
        for (const item of message.items) {
          const scene = deck.scenes.find((s) => s.items.some((i) => i.id === item.id));
          if (scene) scene.items = scene.items.map((i) => (i.id === item.id ? item : i));
          else (deck.scenes.find((s) => s.id === (message.sceneId ?? deck.currentScene)) ?? deck.scenes[0]).items.push(item);
        }
        publish();
        break;
      }
      case 'remove-item':
        for (const scene of deck.scenes) scene.items = scene.items.filter((i) => i.id !== message.id);
        publish();
        break;
      case 'set-default-look':
        deck.defaultLook = message.look;
        publish();
        break;
      case 'show':
        if (message.ref?.sceneId && message.ref.sceneId !== deck.currentScene) {
          deck.currentScene = message.ref.sceneId;
          publish();
        }
        break;
      default:
        break;
    }
  };
}

// ---------- the hook ----------

export function useDeck(onHost: (message: HostToPanel) => void): { deck: Deck; loaded: boolean } {
  const [deck, setDeck] = useState<Deck>(emptyDeck);
  const [loaded, setLoaded] = useState(false);
  const onHostRef = useRef(onHost);
  onHostRef.current = onHost;

  useEffect(() => {
    const receive = (message: HostToPanel) => {
      if (message.type === 'deck') {
        setDeck(message.deck);
        setLoaded(true);
      } else if (message.type === 'file-picked') {
        pendingPicks.get(message.requestId)?.(message.path);
        pendingPicks.delete(message.requestId);
      } else {
        onHostRef.current(message);
      }
    };
    const off = onHostMessage(receive);
    if (!insideObs()) setDevHost(devHost((message) => setTimeout(() => receive(message), 0)));
    sendToHost({ type: 'panel-ready' });
    return off;
  }, []);

  return { deck, loaded };
}

/** Items OBS has not created yet get a temporary id; OBS replaces it with the source's. */
export const draftId = () => `new-${newId()}`;

export type { LibraryItem };
