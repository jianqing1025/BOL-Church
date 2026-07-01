import React from 'react';
import { useLocalization } from '../../hooks/useLocalization';

interface MemberListProps {
  users: { id: string; name: string }[];
}

export const MemberList: React.FC<MemberListProps> = ({ users }) => {
  const { t } = useLocalization();
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-3 text-sm font-bold text-gray-700">
        {t('meeting.members')} ({users.length})
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700">
            <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
            <span className="truncate">{u.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default MemberList;
