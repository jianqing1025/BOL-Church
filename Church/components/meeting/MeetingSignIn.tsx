import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAdmin } from '../../hooks/useAdmin';
import { useLocalization } from '../../hooks/useLocalization';
import { buildMediaSlots } from '../../media';

interface MeetingSignInProps {
  name: string;
  password: string;
  error: string;
  verifying: boolean;
  onNameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: () => void;
}

/**
 * Meeting sign-in screen. Mirrors the photo gate: the Hero images cross-fade as
 * a full-bleed background (behind the transparent header) with a floating card.
 */
export const MeetingSignIn: React.FC<MeetingSignInProps> = ({
  name, password, error, verifying, onNameChange, onPasswordChange, onSubmit,
}) => {
  const { t } = useLocalization();
  const { images } = useAdmin();
  const heroSlides = buildMediaSlots('hero', images);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % heroSlides.length), 5000);
    return () => window.clearInterval(id);
  }, [heroSlides.length]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-24">
      {/* Full-bleed cross-fading Hero background, extending up behind the
          transparent header so header + hero read as one image. */}
      {heroSlides.map((slide, i) => (
        <div
          key={slide.key}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
          style={{ backgroundImage: `url("${images[slide.key] || slide.placeholder}")`, opacity: i === idx ? 1 : 0 }}
          aria-hidden
        />
      ))}
      <div className="absolute inset-0 bg-black/55" aria-hidden />

      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-2xl backdrop-blur-sm">
        <h1 className="text-center text-2xl font-bold leading-snug text-gray-900">{t('meeting.pageTitle')}</h1>
        <p className="mt-4 text-center text-sm leading-relaxed text-gray-600">{t('meeting.authSubtitle')}</p>

        <div className="mt-6 space-y-3">
          <input
            type="text" value={name} maxLength={30}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t('meeting.authName')}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base sm:text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <input
            type="password" value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
            placeholder={t('meeting.authPassword')}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base sm:text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          {error && <div className="text-sm font-medium text-red-600">{error}</div>}
          <button
            type="button" onClick={onSubmit} disabled={verifying}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {verifying && <Loader2 size={16} className="animate-spin" />}
            {t('meeting.authEnter')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MeetingSignIn;
