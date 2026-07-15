import { describe, it, expect } from 'vitest';
import { Language } from '../types';
import { MEETING_ROOMS, MEETING_ROOM_IDS, findMeetingRoom, livekitRoomName, localizeMeetingRoomText } from './meetingRooms';

describe('MEETING_ROOMS', () => {
  it('defines the four meeting rooms with unique ids', () => {
    expect(MEETING_ROOM_IDS).toEqual(['bible-study-1', 'bible-study-2', 'bible-study-3', 'prayer']);
    expect(new Set(MEETING_ROOM_IDS).size).toBe(4);
  });

  it('marks every room as video-enabled and card-ready', () => {
    for (const room of MEETING_ROOMS) {
      expect(room.hasVideo).toBe(true);
      expect(room.name).toBeTruthy();
      expect(room.schedule).toBeTruthy();
      expect(room.imageUrl).toMatch(/^https:\/\//);
    }
  });
});

describe('findMeetingRoom', () => {
  it('resolves known ids and rejects the rest', () => {
    expect(findMeetingRoom('prayer')?.name.zh).toBe('禱告會');
    expect(findMeetingRoom('lobby')).toBeUndefined();
    expect(findMeetingRoom('nope')).toBeUndefined();
    expect(findMeetingRoom('')).toBeUndefined();
    expect(findMeetingRoom(null)).toBeUndefined();
    expect(findMeetingRoom(undefined)).toBeUndefined();
  });
});

describe('localizeMeetingRoomText', () => {
  it('returns the requested language', () => {
    const name = findMeetingRoom('prayer')!.name;
    expect(localizeMeetingRoomText(name, Language.EN)).toBe('Prayer Meeting');
    expect(localizeMeetingRoomText(name, Language.ZH)).toBe('禱告會');
  });
});

describe('livekitRoomName', () => {
  it('prefixes the room id', () => {
    expect(livekitRoomName('bible-study-1')).toBe('bolccop-bible-study-1');
    expect(livekitRoomName('prayer')).toBe('bolccop-prayer');
  });
});
