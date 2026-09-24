import { describe, expect, it } from 'vitest';
import { buildRoomTemplate, TEMPLATE_ROOM_IDS } from './templates';

describe('buildRoomTemplate', () => {
  it('lays out seven slides in the agreed order for every room', () => {
    for (const roomId of TEMPLATE_ROOM_IDS) {
      const { agenda, images } = buildRoomTemplate(roomId, new Date(2026, 8, 24));
      expect(agenda.items.map((i) => i.kind)).toEqual(['text', 'scripture', 'youtube', 'youtube', 'image', 'text', 'text']);
      expect(images).toHaveLength(1);
      expect(images[0].itemId).toBe(agenda.items[4].id);
      expect(images[0].url).toMatch(/^https:\/\/images\.unsplash\.com\//);
    }
  });

  it('dates the agenda for the room’s next meeting and names it on the first slide', () => {
    // 2026-09-24 is a Thursday: Tuesday groups meet 9/29, the prayer meeting 9/30.
    const study = buildRoomTemplate('bible-study-1', new Date(2026, 8, 24)).agenda;
    expect(study.date).toBe('2026-09-29');
    const first = study.items[0];
    expect(first.kind === 'text' && first.title).toBe('聯合小組查經');
    expect(first.kind === 'text' && first.body).toContain('2026年9月29日（週二）');
    expect(first.kind === 'text' && first.body).toContain('信望愛靈糧堂');
    expect(buildRoomTemplate('prayer', new Date(2026, 8, 24)).agenda.date).toBe('2026-09-30');
  });

  it('picks two different songs, with titles cut to 20 characters', () => {
    for (let seed = 0; seed < 20; seed++) {
      const random = () => ((seed * 7919 + 13) % 100) / 100;
      const [a, b] = buildRoomTemplate('prayer', new Date(2026, 8, 24), random).agenda.items.slice(2, 4);
      expect(a.kind === 'youtube' && b.kind === 'youtube' && a.videoId !== b.videoId).toBe(true);
      expect(Array.from(a.kind === 'youtube' ? a.title : '').length).toBeLessThanOrEqual(23);
    }
  });

  it('centres the opening and closing slides', () => {
    const items = buildRoomTemplate('bible-study-2', new Date(2026, 8, 24)).agenda.items;
    expect(items[0].kind === 'text' && items[0].align).toBe('center');
    expect(items[6].kind === 'text' && items[6].align).toBe('center');
  });
});

describe('template passages', () => {
  it('only name verses that exist in the imported 和合本', async () => {
    const fs = await import('node:fs');
    const { TEMPLATE_PASSAGES } = await import('./templates');
    for (const p of TEMPLATE_PASSAGES) {
      const book = JSON.parse(fs.readFileSync(`public/bible/${String(p.bookId).padStart(2, '0')}.json`, 'utf8')) as Record<string, string[]>;
      const verses = book[String(p.chapter)];
      expect(verses, `${p.bookId} ${p.chapter}`).toBeDefined();
      expect(p.toVerse).toBeLessThanOrEqual(verses.length);
      expect(p.fromVerse).toBeLessThanOrEqual(p.toVerse);
    }
  });
});
