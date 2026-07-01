import { describe, it, expect } from 'vitest';
import { MEETING_ROOMS, MEETING_ROOM_IDS, findMeetingRoom, livekitRoomName } from './meetingRooms';

describe('MEETING_ROOMS', () => {
  it('defines the five rooms with unique ids', () => {
    expect(MEETING_ROOM_IDS).toEqual(['lobby', 'bible-study-1', 'bible-study-2', 'bible-study-3', 'prayer']);
    expect(new Set(MEETING_ROOM_IDS).size).toBe(5);
  });
  it('marks only lobby as no-video', () => {
    expect(findMeetingRoom('lobby')?.hasVideo).toBe(false);
    for (const id of ['bible-study-1', 'bible-study-2', 'bible-study-3', 'prayer']) {
      expect(findMeetingRoom(id)?.hasVideo).toBe(true);
    }
  });
});

describe('findMeetingRoom', () => {
  it('resolves known ids and rejects the rest', () => {
    expect(findMeetingRoom('prayer')?.name).toBe('医治祷告');
    expect(findMeetingRoom('nope')).toBeUndefined();
    expect(findMeetingRoom('')).toBeUndefined();
    expect(findMeetingRoom(null)).toBeUndefined();
    expect(findMeetingRoom(undefined)).toBeUndefined();
  });
});

describe('livekitRoomName', () => {
  it('prefixes the room id', () => {
    expect(livekitRoomName('bible-study-1')).toBe('bolccop-bible-study-1');
    expect(livekitRoomName('prayer')).toBe('bolccop-prayer');
  });
});
