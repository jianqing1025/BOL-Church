import { useCallback, useMemo, useRef, useState } from 'react';
import type { UseLiveKit } from './useLiveKit';
import type { RoomVideo } from './useRoomVideo';
import type { Language } from '../types';
import { BibleService } from '../services/bibleService';
import type { HostMessage } from '../meeting/chatProtocol';
import type { AgendaItem } from '../meeting/agenda/types';
import type { AgendaStore } from '../meeting/agenda/agendaStore';
import { neighbourItem, scriptureSlide } from '../meeting/agenda/agendaModel';
import { createSlideCanvas, drawImageSlide, drawTextSlide } from '../meeting/agenda/slideRenderer';
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

export interface AgendaPresenter {
  /** The item on everyone's screen right now, or null. */
  activeId: string | null;
  /** `footer` names the agenda's room in the slide's corner (see slideFooter). */
  share: (item: AgendaItem, footer?: string) => Promise<void>;
  stop: () => Promise<void>;
  step: (items: readonly AgendaItem[], delta: 1 | -1, footer?: string) => Promise<void>;
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvas = () => (canvasRef.current ??= createSlideCanvas());

  const activeId = useMemo(() => {
    if (!current) return null;
    switch (current.kind) {
      case 'text':
      case 'image':
      case 'scripture':
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

  const share = useCallback(async (item: AgendaItem, footer = defaultFooter) => {
    try {
      if (item.kind === 'text' || item.kind === 'image' || item.kind === 'scripture') {
        await clearSlot('slide');
        // A passage is a slide like any other: on the main screen for everyone,
        // leaving each person's own Bible panel alone.
        if (item.kind === 'scripture') {
          const verses = await BibleService.loadChapter(item.bookId, item.chapter);
          drawTextSlide(canvas(), { ...scriptureSlide(item, verses, language), footer });
        } else if (item.kind === 'text') {
          drawTextSlide(canvas(), { title: item.title, body: item.body, footer, align: item.align });
        } else {
          const file = await store.getFile(item.fileId);
          if (!file) throw new Error('missing');
          const image = await createImageBitmap(file.blob);
          drawImageSlide(canvas(), { image, caption: item.title, footer });
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

  const step = useCallback(async (items: readonly AgendaItem[], delta: 1 | -1, footer?: string) => {
    const next = neighbourItem(items, activeId ?? current?.id ?? null, delta);
    if (next) await share(next, footer);
  }, [activeId, current, share]);

  return { activeId, share, stop, step };
}
