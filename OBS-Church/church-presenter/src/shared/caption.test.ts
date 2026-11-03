import { expect, it } from 'vitest';
import { asCaption } from './caption';

it('keeps captions at the bottom when the main slide uses a custom text box', () => {
  const result = asCaption({ kind: 'text', title: 'Title', paragraphs: ['Verse'], pageLabel: '',
    look: { themeId: 'royal-purple', layout: 'left', textBox: { x: .1, y: .1, w: .4, h: .4 } } });
  expect(result.kind === 'text' && result.look).toEqual({ themeId: 'overlay', layout: 'lowerThird', bandOpacity: .7, textBox: undefined });
  expect(result.media).toEqual([]);
});

it('supports a separate caption frame without changing the main slide', () => {
  const box = { x: .1, y: .7, w: .8, h: .2 };
  const result = asCaption({ kind: 'text', title: '', paragraphs: ['Verse'], pageLabel: '',
    look: { themeId: 'navy', layout: 'center' }, captionTextBox: box, captionOpacity: .5 });
  expect(result.kind === 'text' && result.look.textBox).toEqual(box);
  expect(asCaption({ kind: 'video', look: { themeId: 'navy', layout: 'center' }, url: 'video.mp4', title: '', startSeconds: 0 })).toEqual({ kind: 'blank' });
});
