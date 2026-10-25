import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEETING_ROOMS } from '../constants/meetingRooms';

const added = { ...MEETING_ROOMS[0], id: 'room-1a2b3c4d', name: { zh: '新房間', en: 'New room' } };

beforeEach(() => {
  vi.resetModules();
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
  });
});

describe('meeting rooms store', () => {
  it('starts from the built-in rooms when nothing is cached', async () => {
    const { getMeetingRooms } = await import('./meetingRoomsStore');
    expect(getMeetingRooms()).toEqual(MEETING_ROOMS);
  });

  it('tells subscribers about a new list and remembers it for the next visit, without the live counts', async () => {
    const store = await import('./meetingRoomsStore');
    const seen = vi.fn();
    store.subscribeMeetingRooms(seen);
    store.publishMeetingRooms([{ ...added, activeCount: 3 }]);
    expect(seen).toHaveBeenCalled();
    expect(store.getMeetingRooms()).toEqual([{ ...added, activeCount: 3 }]);

    vi.resetModules();
    const next = await import('./meetingRoomsStore');
    expect(next.getMeetingRooms()).toEqual([added]);
  });

  it('ignores a cache it cannot read', async () => {
    localStorage.setItem('bolccop.meetingRooms', '{not json');
    const { getMeetingRooms } = await import('./meetingRoomsStore');
    expect(getMeetingRooms()).toEqual(MEETING_ROOMS);
  });
});
