import React from 'react';
import { Video } from 'lucide-react';
import type { MeetingRoom } from '../../constants/meetingRooms';

interface RoomListProps {
  rooms: readonly MeetingRoom[];
  activeId: string | null;
  onSelect: (room: MeetingRoom) => void;
}

export const RoomList: React.FC<RoomListProps> = ({ rooms, activeId, onSelect }) => (
  <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
    {rooms.map((room) => {
      const active = room.id === activeId;
      return (
        <button
          key={room.id}
          type="button"
          onClick={() => onSelect(room)}
          className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-4 py-2.5 text-left text-sm font-semibold transition-colors md:w-full ${
            active ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          <span className="truncate">{room.name}</span>
          {room.hasVideo && <Video size={16} className={active ? 'text-white' : 'text-gray-400'} />}
        </button>
      );
    })}
  </div>
);

export default RoomList;
