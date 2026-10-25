import { describe, expect, it } from 'vitest';
import { combineTones, toneBehind, toneOfColor, type SurfaceStyle } from './backdropTone';

describe('toneOfColor', () => {
  it('calls white and pale tints light, and black and deep colours dark', () => {
    expect(toneOfColor('rgb(255, 255, 255)')).toBe('light');
    expect(toneOfColor('rgb(239, 246, 255)')).toBe('light');
    expect(toneOfColor('rgb(17, 24, 39)')).toBe('dark');
    expect(toneOfColor('rgb(30, 64, 175)')).toBe('dark');
  });

  it('has no opinion about a colour you can mostly see through', () => {
    expect(toneOfColor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(toneOfColor('rgba(255, 255, 255, 0.2)')).toBeNull();
    expect(toneOfColor('transparent')).toBeNull();
    expect(toneOfColor('rgba(17, 24, 39, 0.9)')).toBe('dark');
  });
});

const plain = (backgroundColor: string, extra: Partial<SurfaceStyle> = {}): SurfaceStyle =>
  ({ tagName: 'DIV', backgroundColor, backgroundImage: 'none', ...extra });

describe('toneBehind', () => {
  it('reads the first surface that actually paints something', () => {
    expect(toneBehind([plain('rgba(0, 0, 0, 0)'), plain('rgb(255, 255, 255)'), plain('rgb(0, 0, 0)')])).toBe('light');
    expect(toneBehind([plain('rgba(0, 0, 0, 0)'), plain('rgb(17, 24, 39)')])).toBe('dark');
  });

  it('treats a photo — a background image or an <img> — as dark', () => {
    expect(toneBehind([plain('rgba(0, 0, 0, 0)', { backgroundImage: 'url("/hero.jpg")' })])).toBe('dark');
    expect(toneBehind([plain('rgba(0, 0, 0, 0)', { tagName: 'IMG' })])).toBe('dark');
  });

  it('looks past a gradient, which may be light or dark, to what is under it', () => {
    expect(toneBehind([plain('rgba(0, 0, 0, 0)', { backgroundImage: 'linear-gradient(rgb(0,0,0), rgba(0,0,0,0))' }), plain('rgb(255, 255, 255)')])).toBe('light');
  });

  it('assumes the white page when nothing paints', () => {
    expect(toneBehind([])).toBe('light');
  });
});

describe('combineTones', () => {
  it('calls the backdrop dark only when every part of it is dark', () => {
    expect(combineTones(['dark', 'dark', 'dark'])).toBe('dark');
    // Straddling a white section and a dark footer: dark glass reads on both.
    expect(combineTones(['light', 'dark', 'dark'])).toBe('light');
    expect(combineTones([])).toBe('light');
  });
});
