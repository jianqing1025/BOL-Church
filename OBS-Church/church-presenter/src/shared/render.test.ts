import { describe, expect, it, vi } from 'vitest';
import { drawSlide } from './render';
import type { Look } from './model';

vi.mock('@church/meeting/agenda/pptx/pptxDeck', () => ({ PptxDeck: {} }));

function canvas() {
  const fills: string[] = [];
  const ctx = {
    fillStyle: '',
    save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn(),
    translate: vi.fn(), scale: vi.fn(), fillText: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 20 }),
    fillRect: () => fills.push(ctx.fillStyle),
  };
  return { ctx, fills, element: { width: 1920, height: 1080, getContext: () => ctx } as unknown as HTMLCanvasElement };
}

async function render(look: Partial<Look>) {
  const target = canvas();
  await drawSlide(target.element, {
    kind: 'text', look: { themeId: 'overlay', layout: 'lowerThird', ...look },
    title: '', paragraphs: ['Amazing grace'], pageLabel: '',
  });
  return target;
}

describe('lower third and text frame rendering', () => {
  it('uses a 70% mask by default and accepts fully transparent or opaque masks', async () => {
    expect((await render({})).fills).toContain('rgba(0, 0, 0, 0.7)');
    expect((await render({ bandOpacity: 0 })).fills).toContain('rgba(0, 0, 0, 0)');
    expect((await render({ bandOpacity: 1 })).fills).toContain('rgba(0, 0, 0, 1)');
  });

  it('moves and resizes the text independently of the caption mask', async () => {
    const { ctx } = await render({ textBox: { x: .1, y: .5, w: .5, h: .2 } });
    expect(ctx.translate).toHaveBeenCalledWith(192, 540);
    expect(ctx.scale).toHaveBeenCalledWith(960 / 1520, 216 / 230);
    expect(ctx.translate).toHaveBeenCalledWith(-200, -790);
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('fits long main-slide text inside the lower third instead of drawing below the screen', async () => {
    const target = canvas();
    await drawSlide(target.element, { kind: 'text', look: { themeId: 'overlay', layout: 'lowerThird' },
      title: 'Reference', paragraphs: Array(20).fill('A long scripture passage'), pageLabel: '' });
    const scale = target.ctx.scale.mock.calls[0];
    expect(scale[0]).toBeGreaterThan(0);
    expect(scale[0]).toBeLessThan(1);
    expect(scale[1]).toBe(scale[0]);
  });
});
