import type { MinistrySubPage } from '../types';

export interface MeetingRoom {
  /** Ministry slug — also the /meeting/{key} route segment. */
  key: MinistrySubPage;
  /** meet.jit.si room name. Carries a fixed random token so the public room
   *  is not casually guessable; changing the token effectively resets it. */
  jitsiRoom: string;
  /** Existing translation key reused for the display title. */
  titleKey: string;
  /** New translation key for the card's short description. */
  descKey: string;
}

export const MEETING_ROOMS: readonly MeetingRoom[] = [
  { key: 'kids',   jitsiRoom: 'BolccopKids-4f7a2c',   titleKey: 'eventsPage.navKids',   descKey: 'meeting.kidsDesc' },
  { key: 'men',    jitsiRoom: 'BolccopMen-9b1e6d',    titleKey: 'eventsPage.navMen',    descKey: 'meeting.menDesc' },
  { key: 'women',  jitsiRoom: 'BolccopWomen-2a8c5f',  titleKey: 'eventsPage.navWomen',  descKey: 'meeting.womenDesc' },
  { key: 'joint',  jitsiRoom: 'BolccopJoint-7d3f19',  titleKey: 'eventsPage.navJoint',  descKey: 'meeting.jointDesc' },
  { key: 'alpha',  jitsiRoom: 'BolccopAlpha-1c6b40',  titleKey: 'eventsPage.navAlpha',  descKey: 'meeting.alphaDesc' },
  { key: 'prayer', jitsiRoom: 'BolccopPrayer-8e5a72', titleKey: 'eventsPage.navPrayer', descKey: 'meeting.prayerDesc' },
] as const;

export const MEETING_ROOM_KEYS: readonly MinistrySubPage[] = MEETING_ROOMS.map(r => r.key);

export function findMeetingRoom(key: string | null | undefined): MeetingRoom | undefined {
  if (!key) return undefined;
  return MEETING_ROOMS.find(r => r.key === key);
}
