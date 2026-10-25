import { describe, expect, it } from 'vitest';
import { MEETING_ROOMS } from '../constants/meetingRooms';
import { loadMeetingRooms, newMeetingRoomId, readMeetingRoomInput, roomFromRow, type MeetingRoomRow } from './roomStore';

const row = (over: Partial<MeetingRoomRow> = {}): MeetingRoomRow => ({
  id: 'prayer', name_zh: '琴爐卷禱告會', name_en: 'Harp & Bowl Prayer Meeting', schedule_zh: '每週三晚上7:00',
  schedule_en: 'Wednesdays at 7:00 PM', image_url: 'https://images.example.org/a.jpg', sort_order: 2, ...over,
});

function fakeDb(result: () => MeetingRoomRow[]) {
  return { prepare: () => ({ all: async () => ({ results: result() }) }) } as unknown as D1Database;
}

describe('roomFromRow', () => {
  it('turns a stored room into what the pickers and the join check use', () => {
    expect(roomFromRow(row())).toMatchObject({
      id: 'prayer', name: { zh: '琴爐卷禱告會', en: 'Harp & Bowl Prayer Meeting' },
      schedule: { zh: '每週三晚上7:00', en: 'Wednesdays at 7:00 PM' }, imageUrl: 'https://images.example.org/a.jpg',
      type: 'prayer', hasVideo: true,
    });
  });

  it('keeps the old names of a built-in room, so older agendas still find it', () => {
    expect(roomFromRow(row()).formerNames).toContain('禱告會');
  });

  it('falls back to the Chinese wording where the English was left blank', () => {
    const room = roomFromRow(row({ id: 'room-1', name_en: '', schedule_en: '' }));
    expect(room.name.en).toBe('琴爐卷禱告會');
    expect(room.schedule.en).toBe('每週三晚上7:00');
    expect(room.type).toBe('bible');
  });
});

describe('loadMeetingRooms', () => {
  it('reads the rooms in their stored order', async () => {
    const rooms = await loadMeetingRooms(fakeDb(() => [row({ id: 'a' }), row({ id: 'b' })]));
    expect(rooms.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('falls back to the built-in rooms when the table is empty, missing or there is no database', async () => {
    expect(await loadMeetingRooms(fakeDb(() => []))).toEqual(MEETING_ROOMS);
    expect(await loadMeetingRooms(fakeDb(() => { throw new Error('no such table: meeting_rooms'); }))).toEqual(MEETING_ROOMS);
    expect(await loadMeetingRooms(undefined)).toEqual(MEETING_ROOMS);
  });
});

describe('readMeetingRoomInput', () => {
  it('trims and accepts a complete room', () => {
    expect(readMeetingRoomInput({ nameZh: ' 青少年團契 ', nameEn: 'Youth', scheduleZh: '每週五', scheduleEn: '', imageUrl: '/api/images/images/a.jpg' }))
      .toEqual({ nameZh: '青少年團契', nameEn: 'Youth', scheduleZh: '每週五', scheduleEn: '', imageUrl: '/api/images/images/a.jpg' });
  });

  it('needs a Chinese name', () => {
    expect(readMeetingRoomInput({ nameZh: '  ' })).toBe('請填寫房間名稱');
  });

  it('only takes pictures from the web or from the site itself', () => {
    expect(readMeetingRoomInput({ nameZh: 'x', imageUrl: 'javascript:alert(1)' })).toBe('圖片網址需以 https:// 開頭');
    expect(readMeetingRoomInput({ nameZh: 'x', imageUrl: 'https://images.example.org/a.jpg' })).toMatchObject({ imageUrl: 'https://images.example.org/a.jpg' });
  });
});

describe('newMeetingRoomId', () => {
  it('makes a short id that is safe in a LiveKit room name', () => {
    const id = newMeetingRoomId();
    expect(id).toMatch(/^room-[0-9a-f]{8}$/);
    expect(newMeetingRoomId()).not.toBe(id);
  });
});
