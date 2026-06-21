import React, { useState } from 'react';
import { useLocalization } from '../hooks/useLocalization';

interface LiveJoinModalProps {
  loggedInName?: string;
  onJoin: (params: { name?: string; asGuest?: boolean }) => Promise<void> | void;
}

const LiveJoinModal: React.FC<LiveJoinModalProps> = ({ loggedInName, onJoin }) => {
  const { t } = useLocalization();
  const [name, setName] = useState(loggedInName || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (asGuest: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (!asGuest && !name.trim()) {
        setError(t('liveChat.joinNeedNameOrGuest'));
        setBusy(false);
        return;
      }
      await onJoin(asGuest ? { asGuest: true } : { name: name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="mb-2 text-xl font-bold text-gray-900">{t('liveChat.joinTitle')}</h2>
        <p className="mb-5 text-sm text-gray-600">{t('liveChat.joinSubtitle')}</p>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={30}
          placeholder={t('liveChat.namePlaceholder')}
          onKeyDown={e => { if (e.key === 'Enter' && !busy) submit(false); }}
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={busy}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {t('liveChat.watchAsGuest')}
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={busy}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? t('liveChat.joining') : t('liveChat.joinButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveJoinModal;
