import { MEETING_ROOMS, type MeetingRoom } from '../constants/meetingRooms';
import { sanitizeName } from './chatProtocol';

type Fail = { ok: false; status: number; error: string };
type AuthOk = { ok: true; name: string };
type RoomOk = { ok: true; room: MeetingRoom; name: string };

interface Creds { name?: string | null; password?: string | null; }
interface RoomCreds extends Creds { roomId?: string | null; }

function checkName(name?: string | null): string | Fail {
  const clean = sanitizeName(name);
  if (!clean) return { ok: false, status: 400, error: 'Name required' };
  return clean;
}
function checkPassword(password: string | null | undefined, chatPassword: string | undefined): Fail | null {
  if (!chatPassword || password !== chatPassword) return { ok: false, status: 401, error: 'Invalid password' };
  return null;
}

export function validateAuth(creds: Creds, chatPassword: string | undefined): AuthOk | Fail {
  const name = checkName(creds.name);
  if (typeof name !== 'string') return name;
  const pw = checkPassword(creds.password, chatPassword);
  if (pw) return pw;
  return { ok: true, name };
}

/** `rooms` is the list the back office keeps; the built-in one stands in for tests and fallbacks. */
export function validateJoin(creds: RoomCreds, chatPassword: string | undefined, rooms: readonly MeetingRoom[] = MEETING_ROOMS): RoomOk | Fail {
  const room = creds.roomId ? rooms.find((r) => r.id === creds.roomId) : undefined;
  if (!room) return { ok: false, status: 400, error: 'Unknown room' };
  const name = checkName(creds.name);
  if (typeof name !== 'string') return name;
  const pw = checkPassword(creds.password, chatPassword);
  if (pw) return pw;
  return { ok: true, room, name };
}

export function validateVideo(creds: RoomCreds, chatPassword: string | undefined, rooms: readonly MeetingRoom[] = MEETING_ROOMS): RoomOk | Fail {
  const joined = validateJoin(creds, chatPassword, rooms);
  if (!joined.ok) return joined;
  if (!joined.room.hasVideo) return { ok: false, status: 403, error: 'Room has no video' };
  return joined;
}
