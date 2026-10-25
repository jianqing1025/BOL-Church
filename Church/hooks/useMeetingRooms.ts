import { useEffect, useSyncExternalStore } from 'react';
import { getMeetingRooms, refreshMeetingRooms, subscribeMeetingRooms, type RoomWithActivity } from '../meeting/meetingRoomsStore';

let asked = false;

/** The rooms as the back office set them up, asked for once per page load. */
export function useMeetingRooms(): readonly RoomWithActivity[] {
  const rooms = useSyncExternalStore(subscribeMeetingRooms, getMeetingRooms);
  useEffect(() => {
    if (asked) return;
    asked = true;
    void refreshMeetingRooms().catch(() => { asked = false; });
  }, []);
  return rooms;
}
