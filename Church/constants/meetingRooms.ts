export type MeetingRoomType = 'chat' | 'bible' | 'prayer';

export interface MeetingRoom {
  /** Whitelist key, route/selection id, and LiveKit room suffix. */
  id: string;
  /** Display name (zh). */
  name: string;
  type: MeetingRoomType;
  hasVideo: boolean;
}

export const MEETING_ROOMS: readonly MeetingRoom[] = [
  { id: 'lobby',         name: '大厅',         type: 'chat',   hasVideo: false },
  { id: 'bible-study-1', name: '联合小组查经', type: 'bible',  hasVideo: true  },
  { id: 'bible-study-2', name: '弟兄小组查经', type: 'bible',  hasVideo: true  },
  { id: 'bible-study-3', name: '姐妹小组查经', type: 'bible',  hasVideo: true  },
  { id: 'prayer',        name: '医治祷告',     type: 'prayer', hasVideo: true  },
] as const;

export const MEETING_ROOM_IDS: readonly string[] = MEETING_ROOMS.map((r) => r.id);

export function findMeetingRoom(id: string | null | undefined): MeetingRoom | undefined {
  if (!id) return undefined;
  return MEETING_ROOMS.find((r) => r.id === id);
}

export function livekitRoomName(id: string): string {
  return `bolccop-${id}`;
}
