import { MEETING_ROOMS, type MeetingRoom } from '../constants/meetingRooms';

/**
 * The meeting rooms as the back office last described them, shared by the
 * pickers and the agenda. Remembered on the device so a returning visitor sees
 * today's names straight away rather than the built-in ones for a moment.
 */

export type RoomWithActivity = MeetingRoom & { activeCount?: number };

const CACHE_KEY = 'bolccop.meetingRooms';

function readCache(): readonly MeetingRoom[] | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

let rooms: readonly RoomWithActivity[] = readCache() ?? MEETING_ROOMS;
const listeners = new Set<() => void>();

export function getMeetingRooms(): readonly RoomWithActivity[] {
  return rooms;
}

export function subscribeMeetingRooms(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishMeetingRooms(next: readonly RoomWithActivity[]): void {
  rooms = next;
  // How many are in each room is only true right now; the next visit asks again.
  const lasting = next.map(({ activeCount: _count, ...room }) => room);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(lasting)); } catch { /* private mode: just not remembered */ }
  listeners.forEach((listener) => listener());
}

/** Asks the server for the rooms (with how many are in each) and shares the answer. */
export async function refreshMeetingRooms(): Promise<void> {
  const res = await fetch('/api/meeting/rooms');
  if (!res.ok) return;
  const body = await res.json() as { rooms?: RoomWithActivity[] };
  if (Array.isArray(body.rooms) && body.rooms.length > 0) publishMeetingRooms(body.rooms);
}
