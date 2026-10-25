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
  /**
   * What the room used to be called. Agendas copied from a room template before
   * the room id was recorded are known only by their note, which holds the name
   * the room had at the time.
   */
  formerNames?: readonly string[];
}

/** What the back office edits about a room; the id is made once and never changes. */
export interface MeetingRoomInput {
  nameZh: string;
  nameEn: string;
  scheduleZh: string;
  scheduleEn: string;
  imageUrl: string;
}

export const MEETING_ROOMS: readonly MeetingRoom[] = [
  {
    id: 'bible-study-1',
    name: { en: 'Joint Group Bible Study', zh: '聯合小組查經' },
    schedule: { en: 'Tuesdays at 7:00 PM', zh: '每週二晚上7:00' },
    imageUrl: '/images/meeting-rooms/bible-study.jpg',
    type: 'bible',
    hasVideo: true,
  },
  {
    id: 'prayer',
    name: { en: 'Harp & Bowl Prayer Meeting', zh: '琴爐卷禱告會' },
    schedule: { en: 'Wednesdays at 7:00 PM', zh: '每週三晚上7:00' },
    imageUrl: '/images/meeting-rooms/prayer.jpg',
    type: 'prayer',
    hasVideo: true,
    formerNames: ['禱告會', 'Prayer Meeting'],
  },
  {
    id: 'coworkers',
    name: { en: 'Co-worker Meeting', zh: '同工會' },
    schedule: { en: 'Schedule to be announced', zh: '時間另行公布' },
    imageUrl: '/images/meeting-rooms/coworkers.jpg',
    type: 'bible',
    hasVideo: true,
  },
  {
    id: 'bible-study-3',
    name: { en: "Sisters' Group Fellowship", zh: '姊妹小組團契' },
    schedule: { en: 'Tuesdays at 7:00 PM', zh: '每週二晚上7:00' },
    imageUrl: '/images/meeting-rooms/sisters.jpg',
    type: 'bible',
    hasVideo: true,
    formerNames: ['姐妹小組查經', "Sisters' Group Bible Study"],
  },
  {
    id: 'bible-study-2',
    name: { en: "Brothers' Group Fellowship", zh: '弟兄小組團契' },
    schedule: { en: 'Tuesdays at 7:00 PM', zh: '每週二晚上7:00' },
    imageUrl: '/images/meeting-rooms/brothers.jpg',
    type: 'bible',
    hasVideo: true,
    formerNames: ['弟兄小組查經', "Brothers' Group Bible Study"],
  },
  {
    id: 'youth',
    name: { en: 'Youth Fellowship', zh: '青少年團契' },
    schedule: { en: 'Schedule to be announced', zh: '時間另行公布' },
    imageUrl: '/images/meeting-rooms/youth.jpg',
    type: 'bible',
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
