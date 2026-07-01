import React, { useState } from 'react';
import { useLocalization } from '../../hooks/useLocalization';
import { isValidDisplayName, normalizeDisplayName } from './meetingAuth';

interface JoinNameModalProps {
  roomTitle: string;
  initialName?: string;
  onJoin: (name: string) => void;
  onClose: () => void;
}

export const JoinNameModal: React.FC<JoinNameModalProps> = ({ roomTitle, initialName = '', onJoin, onClose }) => {
  const { t } = useLocalization();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');

  const submit = () => {
    if (!isValidDisplayName(name)) {
      setError(t('meeting.nameRequired'));
      return;
    }
    onJoin(normalizeDisplayName(name));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-xl font-bold text-gray-900">{t('meeting.nameTitle')}</h2>
        <p className="mb-5 text-sm text-gray-600">{t('meeting.nameSubtitle').replace('{room}', roomTitle)}</p>
        <input
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          maxLength={30}
          placeholder={t('meeting.namePlaceholder')}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          autoFocus
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('meeting.nameCancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('meeting.nameJoin')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JoinNameModal;
