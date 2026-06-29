import React, { useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { api } from '../../api';
import { useLocalization } from '../../hooks/useLocalization';
import { navigateTo } from '../../utils/routes';

export const PHOTO_UNLOCK_KEY = 'bolccop-photo-unlocked';

/**
 * Soft access gate for the church photo album. Renders inside the normal page
 * layout (header/footer preserved): a blurred Hero image fills the content area
 * with a floating password card on top.
 */
export const PhotoGate: React.FC<{ heroUrl: string; onUnlocked: () => void }> = ({ heroUrl, onUnlocked }) => {
  const { t } = useLocalization();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.unlockPhotos(password.trim());
      if (res.ok) {
        try { localStorage.setItem(PHOTO_UNLOCK_KEY, '1'); } catch { /* ignore */ }
        onUnlocked();
      } else {
        setError(t('photoGate.error'));
      }
    } catch {
      setError(t('photoGate.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-24">
      {/* Full-bleed blurred Hero background — extends up behind the transparent
          header so header + hero read as one continuous image (homepage style). */}
      <div
        className="absolute inset-0 scale-110 bg-cover bg-center blur-xl"
        style={heroUrl ? { backgroundImage: `url("${heroUrl}")` } : { backgroundColor: '#1f2937' }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-black/55" aria-hidden />

      {/* Floating card */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-2xl backdrop-blur-sm">
        <h1 className="text-center text-2xl font-bold leading-snug text-gray-900">{t('photoGate.title')}</h1>
        <p className="mt-4 text-center text-sm leading-relaxed text-gray-600">{t('photoGate.noticeSmall')}</p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            placeholder={t('photoGate.placeholder')}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            autoFocus
          />
          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={submitting || !password.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? t('photoGate.unlocking') : t('photoGate.enter')}
          </button>
        </form>

        {/* Collapsible help */}
        <div className="mt-5 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            {t('photoGate.helpToggle')}
            <ChevronDown size={16} className={`transition-transform ${helpOpen ? 'rotate-180' : ''}`} />
          </button>
          {helpOpen && (
            <div className="mt-4 space-y-3 text-left text-sm">
              <div className="font-bold text-gray-900">{t('photoGate.helpTitle')}</div>
              <p className="text-gray-600">{t('photoGate.helpIntro')}</p>
              <div>
                <div className="font-semibold text-gray-900">{t('photoGate.method1Title')}</div>
                <p className="text-gray-600">{t('photoGate.method1Body')}</p>
              </div>
              <div>
                <div className="font-semibold text-gray-900">{t('photoGate.method2Title')}</div>
                <p className="text-gray-600">{t('photoGate.method2Body')}</p>
              </div>
              <div>
                <div className="font-semibold text-gray-900">{t('photoGate.method3Title')}</div>
                <p className="text-gray-600">{t('photoGate.method3Body')}</p>
              </div>
              <button
                type="button"
                onClick={() => navigateTo('/contact/contact-us')}
                className="mt-2 w-full rounded-lg border border-blue-600 px-4 py-2.5 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-50"
              >
                {t('photoGate.contact')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhotoGate;
