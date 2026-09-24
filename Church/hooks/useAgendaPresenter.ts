import { useCallback, useMemo, useRef, useState } from 'react';
import type { UseLiveKit } from './useLiveKit';
import type { RoomVideo } from './useRoomVideo';
import type { BibleSync } from './useBibleSync';
import type { HostMessage } from '../meeting/chatProtocol';
import type { AgendaItem } from '../meeting/agenda/types';
import type { AgendaStore } from '../meeting/agenda/agendaStore';
import { neighbourItem } from '../meeting/agenda/agendaModel';
import { createSlideCanvas, drawImageSlide, drawTextSlide } from '../meeting/agenda/slideRenderer';

interface PresenterDeps {
  lk: UseLiveKit;
  roomVideo: RoomVideo;
  bible: BibleSync;
  store: AgendaStore;
  /** The room's local-video broadcast, owned by MeetingRoomView. */
  videoFile: File | null;
  setVideoFile: (file: File | null) => void;
  onHostCommand: (message: HostMessage) => void;
  /** Bottom-right text on every slide. */
  footer: string;
  /** Receives a translation key. */
  onError: (key: string) => void;
}

export interface AgendaPresenter {
  /** The item on everyone's screen right now, or null. */
  activeId: string | null;
  share: (item: AgendaItem) => Promise<void>;
  stop: () => Promise<void>;
  step: (items: readonly AgendaItem[], delta: 1 | -1) => Promise<void>;
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
  const { lk, roomVideo, bible, store, videoFile, setVideoFile, onHostCommand, footer, onError } = deps;
  const [current, setCurrent] = useState<AgendaItem | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvas = () => (canvasRef.current ??= createSlideCanvas());

  const activeId = useMemo(() => {
    if (!current) return null;
    switch (current.kind) {
      case 'text':
      case 'image':
        return lk.slideOn ? current.id : null;
      case 'localVideo':
        return videoFile ? current.id : null;
      case 'youtube':
        return roomVideo.videoId === current.videoId ? current.id : null;
      case 'scripture':
        return bible.open && bible.highlight?.bookId === current.bookId && bible.highlight.chapter === current.chapter
          && bible.highlight.from === current.fromVerse ? current.id : null;
      default:
        return null;
    }
  }, [current, lk.slideOn, videoFile, roomVideo.videoId, bible.open, bible.highlight]);

  /** Clears the shared-picture slot of whatever this host put there. */
  const clearSlot = useCallback(async (keep: 'slide' | null) => {
    if (keep !== 'slide' && lk.slideOn) await lk.stopSlide();
    if (videoFile) { setVideoFile(null); await lk.stopVideoFile(); }
    if (roomVideo.videoId !== null && roomVideo.canLead) roomVideo.close();
  }, [lk, videoFile, setVideoFile, roomVideo]);

  const share = useCallback(async (item: AgendaItem) => {
    try {
      if (item.kind === 'scripture') {
        await clearSlot(null);
        bible.selectChapter(item.bookId, item.chapter, { from: item.fromVerse, to: item.toVerse });
      } else if (item.kind === 'text' || item.kind === 'image') {
        await clearSlot('slide');
        if (item.kind === 'text') {
          drawTextSlide(canvas(), { title: item.title, body: item.body, footer });
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
        const file = await store.getFile(item.fileId);
        if (!file) throw new Error('missing');
        onHostCommand({ type: 'host', action: 'claimShare' });
        setVideoFile(new File([file.blob], item.fileName, { type: file.type }));
      }
      setCurrent(item);
    } catch {
      onError('meeting.agendaShareFailed');
    }
    // canvas() reads a ref and is stable in effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bible, clearSlot, footer, lk, onError, onHostCommand, roomVideo, setVideoFile, store]);

  const stop = useCallback(async () => {
    if (current?.kind === 'scripture') bible.close();
    await clearSlot(null);
    setCurrent(null);
  }, [bible, clearSlot, current]);

  const step = useCallback(async (items: readonly AgendaItem[], delta: 1 | -1) => {
    const next = neighbourItem(items, activeId ?? current?.id ?? null, delta);
    if (next) await share(next);
  }, [activeId, current, share]);

  return { activeId, share, stop, step };
}
