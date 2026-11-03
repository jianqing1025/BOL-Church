import type { Look, SlideSpec } from './model';

/** The caption feed has its own text frame, independent of the slide's layout. */
export function asCaption(spec: SlideSpec & { captionOpacity?: number; captionTextBox?: Look['textBox'] }): SlideSpec {
  if (spec.kind !== 'text') return { kind: 'blank' };
  const box = spec.captionTextBox;
  return { ...spec, media: [], look: {
    themeId: 'overlay', layout: 'lowerThird', bandOpacity: spec.captionOpacity ?? .7,
    textBox: box && Number.isFinite(box.w) && Number.isFinite(box.h) ? box : undefined,
  } };
}
