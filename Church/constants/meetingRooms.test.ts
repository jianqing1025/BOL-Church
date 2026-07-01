import { describe, it, expect } from 'vitest';
import { MEETING_ROOMS, MEETING_ROOM_KEYS, findMeetingRoom } from './meetingRooms';

describe('MEETING_ROOMS', () => {
  it('defines the six ministry rooms', () => {
    expect(MEETING_ROOM_KEYS).toEqual(['kids', 'men', 'women', 'joint', 'alpha', 'prayer']);
  });
  it('gives every room a unique, non-empty jitsi room name', () => {
    const names = MEETING_ROOMS.map(r => r.jitsiRoom);
    expect(names.every(n => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('findMeetingRoom', () => {
  it('resolves each known ministry slug', () => {
    expect(findMeetingRoom('prayer')?.key).toBe('prayer');
    expect(findMeetingRoom('kids')?.titleKey).toBe('eventsPage.navKids');
  });
  it('returns undefined for unknown or empty slugs', () => {
    expect(findMeetingRoom('nope')).toBeUndefined();
    expect(findMeetingRoom('')).toBeUndefined();
    expect(findMeetingRoom(null)).toBeUndefined();
    expect(findMeetingRoom(undefined)).toBeUndefined();
  });
});
