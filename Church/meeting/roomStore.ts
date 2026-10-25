/// <reference types="@cloudflare/workers-types" />
import { MEETING_ROOMS, type MeetingRoom, type MeetingRoomInput } from '../constants/meetingRooms';

export type { MeetingRoomInput };

/**
 * The meeting rooms, as the back office keeps them (D1 `meeting_rooms`).
 *
 * The built-in list in constants/meetingRooms.ts stays as the fallback: a
 * database that is empty, not yet migrated or briefly unreachable must still
 * leave people a room to join.
 */

export interface MeetingRoomRow {
  id: string;
  name_zh: string;
  name_en: string;
  schedule_zh: string;
  schedule_en: string;
  image_url: string;
  sort_order: number;
}

export function roomFromRow(row: MeetingRoomRow): MeetingRoom {
  const builtIn = MEETING_ROOMS.find((r) => r.id === row.id);
  return {
    id: row.id,
    name: { zh: row.name_zh, en: row.name_en || row.name_zh },
    schedule: { zh: row.schedule_zh, en: row.schedule_en || row.schedule_zh },
    imageUrl: row.image_url,
    type: row.id === 'prayer' ? 'prayer' : 'bible',
    hasVideo: true,
    ...(builtIn?.formerNames ? { formerNames: builtIn.formerNames } : {}),
  };
}

export async function loadMeetingRooms(db: D1Database | undefined): Promise<readonly MeetingRoom[]> {
  if (!db) return MEETING_ROOMS;
  try {
    const { results } = await db.prepare('SELECT * FROM meeting_rooms ORDER BY sort_order, created_at').all<MeetingRoomRow>();
    return results?.length ? results.map(roomFromRow) : MEETING_ROOMS;
  } catch (error) {
    console.error('meeting rooms unavailable, using the built-in list', error);
    return MEETING_ROOMS;
  }
}

const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

export function readMeetingRoomInput(payload: Record<string, unknown>): MeetingRoomInput | string {
  const input = {
    nameZh: text(payload.nameZh, 60),
    nameEn: text(payload.nameEn, 80),
    scheduleZh: text(payload.scheduleZh, 60),
    scheduleEn: text(payload.scheduleEn, 80),
    imageUrl: text(payload.imageUrl, 1000),
  };
  if (!input.nameZh) return '請填寫房間名稱';
  if (input.imageUrl && !/^https:\/\//.test(input.imageUrl) && !input.imageUrl.startsWith('/api/images/')) return '圖片網址需以 https:// 開頭';
  return input;
}

/** Room ids name the LiveKit room and the chat room, so they never change once made. */
export function newMeetingRoomId(): string {
  return `room-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}
