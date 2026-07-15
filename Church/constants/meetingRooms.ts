import type { Language } from '../types';

export type MeetingRoomType = 'bible' | 'prayer';

export interface MeetingRoomText {
  en: string;
  zh: string;
}

export interface MeetingRoom {
  /** Whitelist key, route/selection id, and LiveKit room suffix. */
  id: string;
  /** Localized display name. */
  name: MeetingRoomText;
  /** Short schedule/description shown on room cards. */
  schedule: MeetingRoomText;
  /** Homepage-style card image. */
  imageUrl: string;
  type: MeetingRoomType;
  hasVideo: boolean;
}

export const MEETING_ROOMS: readonly MeetingRoom[] = [
  {
    id: 'bible-study-1',
    name: { en: 'Joint Group Bible Study', zh: '聯合小組查經' },
    schedule: { en: 'Tuesdays at 7:00 PM', zh: '每週二晚上7:00' },
    imageUrl: 'https://images.unsplash.com/photo-1630467355731-963887fa179a?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=1200',
    type: 'bible',
    hasVideo: true,
  },
  {
    id: 'bible-study-2',
    name: { en: "Brothers' Group Bible Study", zh: '弟兄小組查經' },
    schedule: { en: 'Tuesdays at 7:00 PM', zh: '每週二晚上7:00' },
    imageUrl: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=1200',
    type: 'bible',
    hasVideo: true,
  },
  {
    id: 'bible-study-3',
    name: { en: "Sisters' Group Bible Study", zh: '姐妹小組查經' },
    schedule: { en: 'Tuesdays at 7:00 PM', zh: '每週二晚上7:00' },
    imageUrl: 'https://images.unsplash.com/photo-1501060380799-184ae00cf089?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=1200',
    type: 'bible',
    hasVideo: true,
  },
  {
    id: 'prayer',
    name: { en: 'Prayer Meeting', zh: '禱告會' },
    schedule: { en: 'Wednesdays at 7:00 PM', zh: '每週三晚上7:00' },
    imageUrl: 'https://images.unsplash.com/photo-1600288480699-0b0d8a456dd8?ixlib=rb-4.1.0&auto=format&fit=crop&q=80&w=1200',
    type: 'prayer',
    hasVideo: true,
  },
] as const;

export const MEETING_ROOM_IDS: readonly string[] = MEETING_ROOMS.map((r) => r.id);

export function localizeMeetingRoomText(text: MeetingRoomText, language: Language): string {
  return text[language];
}

export function findMeetingRoom(id: string | null | undefined): MeetingRoom | undefined {
  if (!id) return undefined;
  return MEETING_ROOMS.find((r) => r.id === id);
}

export function livekitRoomName(id: string): string {
  return `bolccop-${id}`;
}
