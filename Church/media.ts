export type MediaKind = 'hero' | 'event';

export type MediaSlot = {
  key: string;
  label: string;
  hint: string;
  placeholder: string;
  width: number;
  height: number;
  index: number;
};

export const defaultHeroSlides: MediaSlot[] = [
  {
    key: 'hero.image1',
    label: 'Hero Slide 1',
    hint: 'Homepage background',
    placeholder: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=2673',
    width: 1920,
    height: 1080,
    index: 1,
  },
  {
    key: 'hero.image2',
    label: 'Hero Slide 2',
    hint: 'Homepage background',
    placeholder: 'https://images.unsplash.com/photo-1478147427282-58a87a120781?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=3870',
    width: 1920,
    height: 1080,
    index: 2,
  },
  {
    key: 'hero.image3',
    label: 'Hero Slide 3',
    hint: 'Homepage background',
    placeholder: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=2670',
    width: 1920,
    height: 1080,
    index: 3,
  },
];

export const defaultEventCards: MediaSlot[] = [
  {
    key: 'events.event1.image',
    label: 'Event Card 1',
    hint: 'Joint group fellowship',
    placeholder: 'https://images.unsplash.com/photo-1630467355731-963887fa179a?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=2670',
    width: 800,
    height: 600,
    index: 1,
  },
  {
    key: 'events.event2.image',
    label: 'Event Card 2',
    hint: "Sisters' group",
    placeholder: 'https://images.unsplash.com/photo-1501060380799-184ae00cf089?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=2670',
    width: 800,
    height: 600,
    index: 2,
  },
  {
    key: 'events.event3.image',
    label: 'Event Card 3',
    hint: 'Sunday worship',
    placeholder: 'https://images.unsplash.com/photo-1509021436665-8f07dbf5bf1d?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=2274',
    width: 800,
    height: 600,
    index: 3,
  },
  {
    key: 'events.event4.image',
    label: 'Event Card 4',
    hint: 'Prayer meeting',
    placeholder: 'https://images.unsplash.com/photo-1600288480699-0b0d8a456dd8?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=2670',
    width: 800,
    height: 600,
    index: 4,
  },
];

function slotFromKey(kind: MediaKind, key: string, index: number): MediaSlot {
  if (kind === 'hero') {
    return {
      key,
      label: `Hero Slide ${index}`,
      hint: 'Homepage background',
      placeholder: defaultHeroSlides[(index - 1) % defaultHeroSlides.length]?.placeholder ?? defaultHeroSlides[0].placeholder,
      width: 1920,
      height: 1080,
      index,
    };
  }

  return {
    key,
    label: `Event Card ${index}`,
    hint: 'Homepage event card',
    placeholder: defaultEventCards[(index - 1) % defaultEventCards.length]?.placeholder ?? defaultEventCards[0].placeholder,
    width: 800,
    height: 600,
    index,
  };
}

export function mediaKey(kind: MediaKind, index: number): string {
  return kind === 'hero' ? `hero.image${index}` : `events.event${index}.image`;
}

export function mediaIndex(kind: MediaKind, key: string): number | null {
  const pattern = kind === 'hero' ? /^hero\.image(\d+)$/ : /^events\.event(\d+)\.image$/;
  const match = key.match(pattern);
  return match ? Number(match[1]) : null;
}

export function buildMediaSlots(kind: MediaKind, images: Record<string, string>): MediaSlot[] {
  const defaults = kind === 'hero' ? defaultHeroSlides : defaultEventCards;
  const defaultByKey = new Map(defaults.map(slot => [slot.key, slot]));
  const dynamicSlots = Object.keys(images)
    .map(key => ({ key, index: mediaIndex(kind, key) }))
    .filter((item): item is { key: string; index: number } => Boolean(item.index))
    .map(({ key, index }) => defaultByKey.get(key) ?? slotFromKey(kind, key, index));

  const merged = new Map(defaults.map(slot => [slot.key, slot]));
  for (const slot of dynamicSlots) {
    merged.set(slot.key, slot);
  }

  return Array.from(merged.values()).sort((left, right) => left.index - right.index);
}

export function nextMediaKey(kind: MediaKind, images: Record<string, string>): string {
  const defaultMax = kind === 'hero' ? defaultHeroSlides.length : defaultEventCards.length;
  const existingMax = Math.max(
    defaultMax,
    ...Object.keys(images).map(key => mediaIndex(kind, key) ?? 0)
  );
  return mediaKey(kind, existingMax + 1);
}
