import { describe, it, expect } from 'vitest';
import { Language } from '../types';
import { MEETING_ROOMS, MEETING_ROOM_IDS, findMeetingRoom, livekitRoomName, localizeMeetingRoomText } from './meetingRooms';

describe('MEETING_ROOMS', () => {
  it('defines the six meeting rooms with unique ids', () => {
    expect([...MEETING_ROOM_IDS].sort()).toEqual(['bible-study-1', 'bible-study-2', 'bible-study-3', 'coworkers', 'prayer', 'youth']);
    expect(new Set(MEETING_ROOM_IDS).size).toBe(6);
  });

  it('lists the prayer meeting second, where a phone shows it without scrolling', () => {
    // The cards are one per row on a phone, so this order is what people see
    // first — a deliberate choice, not an accident of how the array was typed.
    expect(MEETING_ROOM_IDS).toEqual(['bible-study-1', 'prayer', 'coworkers', 'bible-study-3', 'bible-study-2', 'youth']);
  });

  it('names the fellowships and the prayer meeting as the church calls them', () => {
    expect(MEETING_ROOMS.map((r) => r.name.zh)).toEqual(['聯合小組查經', '琴爐卷禱告會', '同工會', '姊妹小組團契', '弟兄小組團契', '青少年團契']);
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
    expect(findMeetingRoom('prayer')?.name.zh).toBe('琴爐卷禱告會');
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
    expect(localizeMeetingRoomText(name, Language.EN)).toBe('Harp & Bowl Prayer Meeting');
    expect(localizeMeetingRoomText(name, Language.ZH)).toBe('琴爐卷禱告會');
  });
});

describe('livekitRoomName', () => {
  it('prefixes the room id', () => {
    expect(livekitRoomName('bible-study-1')).toBe('bolccop-bible-study-1');
    expect(livekitRoomName('prayer')).toBe('bolccop-prayer');
  });
});
