import React, { useEffect, useMemo, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { useLocalization } from '../../../hooks/useLocalization';
import { layoutScripturePages, SLIDE_HEIGHT, SLIDE_WIDTH } from '../../../meeting/agenda/slideLayout';
import { canvasMeasure, drawScripturePage } from '../../../meeting/agenda/slideRenderer';
import { SLIDE_THEMES, slideTheme, themeCss, themeName, type SlideTheme } from '../../../meeting/agenda/slideThemes';

const PREVIEW_SCALE = 0.25;

/** One template drawn as a real slide, a quarter size. */
const ThemePreview: React.FC<{ theme: SlideTheme; title: string; verse: string; footer: string }> = ({ theme, title, verse, footer }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const page = layoutScripturePages(title, [verse], canvasMeasure(ctx))[0];
    ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    drawScripturePage(canvas, page, footer, undefined, theme, true);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [theme, title, verse, footer]);
  return (
    <canvas ref={ref} width={SLIDE_WIDTH * PREVIEW_SCALE} height={SLIDE_HEIGHT * PREVIEW_SCALE}
      className="block aspect-video h-auto w-full" style={{ background: theme.overlay ? themeCss(theme) : undefined }} />
  );
};

/**
 * 配置：choose how this 查經資料's slides look. Each template is shown as a
 * real slide; the choice applies to sharing in the meeting and to exporting.
 */
export const ThemePicker: React.FC<{ value?: string; footer: string; onChange: (id: string) => void; onClose: () => void }> = ({ value, footer, onChange, onClose }) => {
  const { language, t } = useLocalization();
  const current = slideTheme(value).id;
  const sample = useMemo(() => ({ title: t('meeting.themeSampleTitle'), verse: t('meeting.themeSampleVerse') }), [t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3 sm:p-6" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div>
            <h3 className="text-base font-bold text-gray-900">{t('meeting.themeTitle')}</h3>
            <p className="text-xs text-gray-500">{t('meeting.themeHint')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('meeting.close')} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={20} /></button>
        </header>
        <div className="grid min-h-0 auto-rows-max grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 sm:gap-4 sm:p-5">
          {SLIDE_THEMES.map((theme) => {
            const selected = theme.id === current;
            return (
              <button key={theme.id} type="button" onClick={() => onChange(theme.id)} aria-pressed={selected}
                className={`flex flex-col overflow-hidden rounded-xl text-left transition ${selected ? 'ring-2 ring-blue-600 ring-offset-2' : 'ring-1 ring-gray-200 hover:ring-gray-400'}`}>
                <ThemePreview theme={theme} title={sample.title} verse={sample.verse} footer={footer} />
                <span className="flex items-center justify-between gap-2 bg-white px-3 py-2 text-sm font-medium text-gray-800">
                  <span className="truncate">{themeName(theme, language)}</span>
                  {selected && <Check size={16} className="shrink-0 text-blue-600" />}
                </span>
              </button>
            );
          })}
        </div>
        {slideTheme(current).overlay && <p className="shrink-0 border-t border-gray-100 px-5 py-2.5 text-xs text-gray-500">{t('meeting.themeOverlayNote')}</p>}
      </div>
    </div>
  );
};
