import React, { useState } from 'react';
import { useLocalization } from '../../hooks/useLocalization';
import { checkMeetingPassword, MEETING_UNLOCK_KEY } from './meetingAuth';

/**
 * Soft access gate for the co-worker meeting rooms. Renders inside the normal
 * page layout: a blurred Hero image fills the content area with a floating
 * password card on top. Mirrors the photo album's PhotoGate visual style.
 */
export const MeetingGate: React.FC<{ heroUrl?: string; onUnlocked: () => void }> = ({ heroUrl, onUnlocked }) => {
  const { t } = useLocalization();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password.trim()) return;
    if (checkMeetingPassword(password)) {
      try { localStorage.setItem(MEETING_UNLOCK_KEY, '1'); } catch { /* ignore */ }
      onUnlocked();
    } else {
      setError(t('meeting.gateError'));
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-24">
      <div
        className="absolute inset-0 scale-110 bg-cover bg-center blur-xl"
        style={heroUrl ? { backgroundImage: `url("${heroUrl}")` } : { backgroundColor: '#1f2937' }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-black/55" aria-hidden />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-2xl backdrop-blur-sm">
        <h1 className="text-center text-2xl font-bold leading-snug text-gray-900">{t('meeting.gateTitle')}</h1>
        <p className="mt-4 text-center text-sm leading-relaxed text-gray-600">{t('meeting.gateNotice')}</p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder={t('meeting.gatePlaceholder')}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            autoFocus
          />
          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={!password.trim()}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {t('meeting.gateEnter')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MeetingGate;
