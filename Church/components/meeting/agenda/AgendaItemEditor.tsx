import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalization } from '../../../hooks/useLocalization';
import type { AgendaItem, YouTubeItem } from '../../../meeting/agenda/types';
import { shortTitle } from '../../../meeting/agenda/agendaModel';
import { fetchYouTubeTitle } from '../../../meeting/agenda/remote';
import { layoutTextSlide } from '../../../meeting/agenda/slideLayout';
import { canvasMeasure } from '../../../meeting/agenda/slideRenderer';
import { parseYouTubeStart, parseYouTubeVideoId } from '../../../meeting/youtube';
import { ScripturePicker } from './ScripturePicker';

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

/** The fields of one item, edited in place in its row. Every change saves. */
export const AgendaItemEditor: React.FC<{ item: AgendaItem; onChange: (next: AgendaItem) => void }> = ({ item, onChange }) => {
  const { t } = useLocalization();

  // Measured with the slide's own font, so the warning matches what the room will see.
  const tooLong = useMemo(() => {
    if (item.kind !== 'text') return false;
    const ctx = document.createElement('canvas').getContext('2d');
    return ctx ? layoutTextSlide(item.title, item.body, canvasMeasure(ctx)).overflow : false;
  }, [item]);

  if (item.kind === 'text') {
    return (
      <div className="space-y-2">
        <input className={input} value={item.title} placeholder={t('meeting.agendaItemTitle')}
          onChange={(e) => onChange({ ...item, title: e.target.value })} />
        <textarea className={`${input} min-h-28`} value={item.body} placeholder={t('meeting.agendaItemBody')}
          onChange={(e) => onChange({ ...item, body: e.target.value })} />
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-gray-500">
          <input type="checkbox" checked={item.align === 'center'} className="h-4 w-4 accent-blue-600"
            onChange={(e) => onChange({ ...item, align: e.target.checked ? 'center' : undefined })} />
          {t('meeting.agendaCenter')}
        </label>
        {tooLong && <p className="text-xs font-medium text-amber-600">{t('meeting.agendaTooLong')}</p>}
      </div>
    );
  }
  if (item.kind === 'image' || item.kind === 'localVideo') {
    return (
      <input className={input} value={item.title} placeholder={t('meeting.agendaItemTitle')}
        onChange={(e) => onChange({ ...item, title: e.target.value })} />
    );
  }
  if (item.kind === 'scripture') {
    return <ScripturePicker value={item} onChange={(range) => onChange({ ...item, ...range })} />;
  }
  return <YouTubeFields item={item} onChange={onChange} />;
};

/** Reads a pasted link into a YouTube item's fields, or null when it is not one. */
export function youTubeFromLink(link: string): { videoId: string; startSeconds: number } | null {
  const videoId = parseYouTubeVideoId(link);
  return videoId ? { videoId, startSeconds: parseYouTubeStart(link) ?? 0 } : null;
}

/**
 * A YouTube item's link, title and start time. The link is kept as typed while
 * it is being edited; once it reads as a YouTube link, the video, the start
 * time and — from YouTube — the title (first 20 characters) follow it.
 */
const YouTubeFields: React.FC<{ item: YouTubeItem; onChange: (next: AgendaItem) => void }> = ({ item, onChange }) => {
  const { t } = useLocalization();
  const [link, setLink] = useState(item.url ?? `https://www.youtube.com/watch?v=${item.videoId}`);
  const latest = useRef({ item, onChange });
  latest.current = { item, onChange };
  const parsed = youTubeFromLink(link);

  useEffect(() => {
    if (!parsed || (parsed.videoId === item.videoId && parsed.startSeconds === item.startSeconds && link === item.url)) return;
    const next = { ...item, ...parsed, url: link };
    onChange(next);
    if (parsed.videoId === item.videoId) return;
    let cancelled = false;
    void fetchYouTubeTitle(parsed.videoId).then((title) => {
      if (cancelled || !title) return;
      const current = latest.current.item;
      if (current.videoId === parsed.videoId) latest.current.onChange({ ...current, title: shortTitle(title) });
    });
    return () => { cancelled = true; };
    // Driven by the link alone; the item it produces must not re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  return (
    <div className="space-y-2">
      <input className={input} value={link} placeholder={t('meeting.agendaYouTubeLink')} onChange={(e) => setLink(e.target.value)} />
      {link.trim() && !parsed && <p className="text-xs font-medium text-red-500">{t('meeting.agendaYouTubeInvalid')}</p>}
      <input className={input} value={item.title} placeholder={t('meeting.agendaItemTitle')}
        onChange={(e) => onChange({ ...item, title: e.target.value })} />
      <label className="flex items-center gap-2 text-sm text-gray-500">
        {t('meeting.agendaStartAt')}
        <input type="number" min={0} className={`${input} w-28`} value={item.startSeconds}
          onChange={(e) => onChange({ ...item, startSeconds: Math.max(0, Number(e.target.value) || 0) })} />
      </label>
    </div>
  );
};
