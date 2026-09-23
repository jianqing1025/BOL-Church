import React, { useEffect, useRef } from 'react';
import { useLocalization } from '../../hooks/useLocalization';
import type { MeetingInAppBrowser } from '../../meeting/inAppBrowser';
import { MeetingSignIn } from './MeetingSignIn';

export const MeetingBrowserGuide: React.FC<{
  browser: MeetingInAppBrowser;
}> = ({ browser }) => {
  const { t } = useLocalization();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const wechat = browser === 'wechat';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return () => {
      document.body.style.overflow = overflow;
      if (typeof dialog.close === 'function') dialog.close();
    };
  }, []);

  return (
    <>
      <div inert aria-hidden="true">
        <MeetingSignIn
          name="" password="" error="" verifying={false} remember
          onNameChange={() => {}} onPasswordChange={() => {}} onRememberChange={() => {}} onSubmit={() => {}}
        />
      </div>
      <dialog
        ref={dialogRef}
        aria-labelledby="meeting-browser-guide-title"
        aria-describedby="meeting-browser-guide-instructions meeting-browser-guide-note"
        aria-modal="true"
        onCancel={event => event.preventDefault()}
        className="fixed inset-0 z-[100] m-0 h-full max-h-none w-full max-w-none overflow-y-auto border-0 bg-black/80 text-white backdrop:bg-transparent"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 140 150"
          className={`pointer-events-none fixed text-yellow-300 ${wechat ? 'h-24 w-24 sm:h-28 sm:w-28' : 'h-28 w-28 sm:h-36 sm:w-36'}`}
          style={{
            right: 'max(12px, env(safe-area-inset-right))',
            ...(wechat
              ? { top: 'max(12px, env(safe-area-inset-top))' }
              : { bottom: 'max(12px, env(safe-area-inset-bottom))', transform: 'scaleY(-1)' }),
          }}
        >
          <path d="M 16 134 C 85 132 108 83 119 15 M 96 34 L 119 15 L 133 42" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div
          className="flex min-h-full items-start justify-center px-6"
          style={wechat
            ? { paddingTop: 'max(132px, calc(env(safe-area-inset-top) + 12vh))', paddingBottom: '48px' }
            : { paddingTop: '50vh', paddingBottom: 'calc(160px + env(safe-area-inset-bottom))' }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-slate-800/80 p-6 text-center shadow-xl">
            <h1 id="meeting-browser-guide-title" className="sr-only">{t('meeting.browserGuideTitle')}</h1>
            <p id="meeting-browser-guide-instructions" className="text-xl font-semibold leading-relaxed">{t(wechat ? 'meeting.browserGuideWechat' : 'meeting.browserGuideLine')}</p>
            <p className="mt-2 text-sm text-yellow-300">{wechat ? 'Open in Default Browser' : 'Open in Browser'}</p>
            <p id="meeting-browser-guide-note" className="mt-4 text-sm leading-relaxed text-slate-300">
              {t(wechat ? 'meeting.browserGuideWechatNote' : 'meeting.browserGuideLineNote')}
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
};
