import { useCallback, useMemo, useRef, useState } from 'react';
import type { UseLiveKit } from './useLiveKit';
import type { RoomVideo } from './useRoomVideo';
import type { Language } from '../types';
import { BibleService } from '../services/bibleService';
import type { HostMessage } from '../meeting/chatProtocol';
import type { AgendaItem } from '../meeting/agenda/types';
import type { AgendaStore } from '../meeting/agenda/agendaStore';
import { neighbourItem, scriptureLabel, scriptureVerseLines } from '../meeting/agenda/agendaModel';
import { canvasMeasure, createSlideCanvas, drawImageSlide, drawScripturePage } from '../meeting/agenda/slideRenderer';
import { layoutScripturePages, layoutTextPages } from '../meeting/agenda/slideLayout';
import { openStoredDeck } from '../meeting/agenda/pptx/pptxDeck';
import { slideTheme } from '../meeting/agenda/slideThemes';
import type { VideoSource } from '../components/meeting/VideoBroadcastBar';

interface PresenterDeps {
  lk: UseLiveKit;
  roomVideo: RoomVideo;
  /** For the passage reference on a scripture slide. */
  language: Language;
  store: AgendaStore;
  /** The room's local-video broadcast, owned by MeetingRoomView. */
  videoFile: VideoSource | null;
  setVideoFile: (file: VideoSource | null) => void;
  onHostCommand: (message: HostMessage) => void;
  /** Bottom-right text on a slide, unless share() is given the agenda's own. */
  footer: string;
  /** Receives a translation key. */
  onError: (key: string) => void;
}

/** How the agenda's slides look: the corner text and the 投影片模板. */
export interface SlideLook { footer: string; theme?: string }

export interface AgendaPresenter {
  /** The item on everyone's screen right now, or null. */
  activeId: string | null;
  /** `look` is the agenda's: its room in the corner (see slideFooter) and its template. */
  share: (item: AgendaItem, look?: SlideLook) => Promise<void>;
  stop: () => Promise<void>;
  /** 上一個／下一個：正在放多頁經文、文字或 PPT 時先翻頁，翻完才換項目。 */
  step: (items: readonly AgendaItem[], delta: 1 | -1, look?: SlideLook) => Promise<void>;
  /** 正在放的這一項分成幾頁、目前第幾頁（從 0 起）；不是多頁時為 null。 */
  page: { index: number; count: number } | null;
  /** 只在目前這一項裡翻頁（不換項目）；到頭或到尾時不動。 */
  turnPage: (delta: 1 | -1) => void;
}

/**
 * Puts one 聚會內容 item at a time in front of the room.
 *
 * What is "active" is re-derived from the channels themselves — the slide
 * track, the broadcast file, the room video, the Bible — rather than trusted
 * from a remembered id, so a dropped connection or someone else taking the
 * slot can never leave a row marked as sharing when it is not.
 */
export function useAgendaPresenter(deps: PresenterDeps): AgendaPresenter {
  const { lk, roomVideo, language, store, videoFile, setVideoFile, onHostCommand, footer: defaultFooter, onError } = deps;
  const [current, setCurrent] = useState<AgendaItem | null>(null);
  // 目前這一項排好的各頁：翻頁時只重畫那一頁，不再重新排版或讀檔
  const [paged, setPaged] = useState<{ itemId: string; count: number; index: number; draw: (index: number) => void } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvas = () => (canvasRef.current ??= createSlideCanvas());

  const activeId = useMemo(() => {
    if (!current) return null;
    switch (current.kind) {
      case 'text':
      case 'image':
      case 'scripture':
      case 'ppt':
        return lk.slideOn ? current.id : null;
      case 'localVideo':
        return videoFile ? current.id : null;
      case 'youtube':
        return roomVideo.videoId === current.videoId ? current.id : null;
      default:
        return null;
    }
  }, [current, lk.slideOn, videoFile, roomVideo.videoId]);

  /** Clears the shared-picture slot of whatever this host put there. */
  const clearSlot = useCallback(async (keep: 'slide' | null) => {
    if (keep !== 'slide' && lk.slideOn) await lk.stopSlide();
    if (videoFile) { setVideoFile(null); await lk.stopVideoFile(); }
    if (roomVideo.videoId !== null && roomVideo.canLead) roomVideo.close();
  }, [lk, videoFile, setVideoFile, roomVideo]);

  const share = useCallback(async (item: AgendaItem, look: SlideLook = { footer: defaultFooter }) => {
    const { footer } = look;
    const theme = slideTheme(look.theme);
    try {
      if (item.kind === 'text' || item.kind === 'image' || item.kind === 'scripture' || item.kind === 'ppt') {
        await clearSlot('slide');
        // A passage is a slide like any other: on the main screen for everyone,
        // leaving each person's own Bible panel alone.
        if (item.kind === 'scripture' || item.kind === 'text') {
          const measure = canvasMeasure(canvas().getContext('2d')!);
          const pages = item.kind === 'scripture'
            ? layoutScripturePages(scriptureLabel(item, language), scriptureVerseLines(item, await BibleService.loadChapter(item.bookId, item.chapter)), measure)
            : layoutTextPages(item.title, item.body, measure);
          const align = item.kind === 'text' ? item.align : undefined;
          const draw = (index: number) => drawScripturePage(canvas(), pages[index], footer, align, theme);
          draw(0);
          setPaged({ itemId: item.id, count: pages.length, index: 0, draw });
        } else if (item.kind === 'ppt') {
          // Each click inside the deck is one page, turned like a passage's.
          const deck = await openStoredDeck(item.fileId, async () => (await store.getFile(item.fileId))?.blob);
          await deck.renderPage(canvas(), 0);
          setPaged({ itemId: item.id, count: deck.pages.length, index: 0, draw: (index) => void deck.renderPage(canvas(), index) });
        } else {
          const file = await store.getFile(item.fileId);
          if (!file) throw new Error('missing');
          const image = await createImageBitmap(file.blob);
          drawImageSlide(canvas(), { image, caption: item.title, footer }, theme);
          image.close();
        }
        if (!lk.slideOn) {
          onHostCommand({ type: 'host', action: 'claimShare' });
          if (!(await lk.startSlide(canvas()))) return;
        }
      } else if (item.kind === 'youtube') {
        await clearSlot(null);
        onHostCommand({ type: 'host', action: 'claimShare' });
        roomVideo.open(item.videoId, item.startSeconds);
      } else if (item.kind === 'localVideo') {
        await clearSlot(null);
        const bridge = window.meetingDesktop?.agenda;
        if (item.path && bridge) {
          // Kept by path, so it can have been moved or renamed since.
          if (!(await bridge.videoExists(item.path))) { onError('meeting.agendaVideoMissing'); return; }
          onHostCommand({ type: 'host', action: 'claimShare' });
          setVideoFile({ name: item.fileName, url: bridge.videoUrl(item.path) });
        } else {
          const file = await store.getFile(item.fileId);
          if (!file) throw new Error('missing');
          onHostCommand({ type: 'host', action: 'claimShare' });
          setVideoFile(new File([file.blob], item.fileName, { type: file.type }));
        }
      }
      setCurrent(item);
    } catch {
      onError('meeting.agendaShareFailed');
    }
    // canvas() reads a ref and is stable in effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSlot, defaultFooter, language, lk, onError, onHostCommand, roomVideo, setVideoFile, store]);

  const stop = useCallback(async () => {
    await clearSlot(null);
    setCurrent(null);
  }, [clearSlot]);

  const page = paged && activeId === paged.itemId && paged.count > 1
    ? { index: paged.index, count: paged.count }
    : null;

  /** 翻到另一頁；翻得過去回傳 true。投影片軌道一直在擷取這張畫布，重畫就是翻頁。 */
  const flip = (delta: 1 | -1): boolean => {
    if (!paged || activeId !== paged.itemId) return false;
    const index = paged.index + delta;
    if (index < 0 || index >= paged.count) return false;
    paged.draw(index);
    setPaged({ ...paged, index });
    return true;
  };

  const turnPage = (delta: 1 | -1) => { flip(delta); };

  const step = useCallback(async (items: readonly AgendaItem[], delta: 1 | -1, look?: SlideLook) => {
    if (flip(delta)) return;
    const next = neighbourItem(items, activeId ?? current?.id ?? null, delta);
    if (next) await share(next, look);
    // canvas() reads a ref and is stable in effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, current, paged, share]);

  return { activeId, share, stop, step, page, turnPage };
}
