import React, { useMemo } from 'react';
import { useLocalization } from '../../../hooks/useLocalization';
import type { AgendaItem } from '../../../meeting/agenda/types';
import { layoutTextSlide } from '../../../meeting/agenda/slideLayout';
import { canvasMeasure } from '../../../meeting/agenda/slideRenderer';
import { parseYouTubeStart, parseYouTubeVideoId } from '../../../meeting/youtube';
import { ScripturePicker } from './ScripturePicker';

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

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
        {tooLong && <p className="text-xs font-medium text-amber-700">{t('meeting.agendaTooLong')}</p>}
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
  return (
    <div className="space-y-2">
      <input className={input} value={item.title} placeholder={t('meeting.agendaItemTitle')}
        onChange={(e) => onChange({ ...item, title: e.target.value })} />
      <label className="flex items-center gap-2 text-sm text-gray-600">
        {t('meeting.agendaStartAt')}
        <input type="number" min={0} className={`${input} w-28`} value={item.startSeconds}
          onChange={(e) => onChange({ ...item, startSeconds: Math.max(0, Number(e.target.value) || 0) })} />
      </label>
    </div>
  );
};

/** Reads a pasted link into a YouTube item's fields, or null when it is not one. */
export function youTubeFromLink(link: string): { videoId: string; startSeconds: number } | null {
  const videoId = parseYouTubeVideoId(link);
  return videoId ? { videoId, startSeconds: parseYouTubeStart(link) ?? 0 } : null;
}
