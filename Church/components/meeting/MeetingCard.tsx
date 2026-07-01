import React from 'react';
import { Video } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';

export const MeetingCard: React.FC<{ title: string; description: string; onJoin: () => void }> = ({ title, description, onJoin }) => {
  const { t } = useLocalization();
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="min-w-0">
        <h3 className="truncate text-lg font-bold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>
      <button
        type="button"
        onClick={onJoin}
        className="flex shrink-0 items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
      >
        <Video size={16} />
        {t('meeting.join')}
      </button>
    </div>
  );
};

export default MeetingCard;
