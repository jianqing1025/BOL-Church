import React, { useState } from 'react';
import { useLocalization } from '../../hooks/useLocalization';

export const OFFICIAL_MEETING_URL = 'https://www.bolccop.org/meeting';
const DISMISS_KEY = 'meeting.devNoticeDismissed';

const isDevSite = () => typeof window !== 'undefined' && window.location.hostname.startsWith('dev.');

const wasDismissed = () => {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};

/**
 * dev.bolccop.org 是測試站：一打開線上聚會就提醒要參加小組聚會請到正式網站。
 * 展開 More info 才看得到「繼續測試」，同一分頁內選過就不再跳出。
 */
export const DevSiteNotice: React.FC = () => {
  const { t } = useLocalization();
  const [open, setOpen] = useState(() => isDevSite() && !wasDismissed());
  const [moreInfo, setMoreInfo] = useState(false);
  if (!open) return null;

  const stay = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* 無痕模式：只是下次還會提醒 */ }
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="dev-site-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">DEV</div>
        <h2 id="dev-site-title" className="text-xl font-bold text-gray-900">{t('meeting.devSiteTitle')}</h2>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{t('meeting.devSiteBody')}</p>
        <a href={OFFICIAL_MEETING_URL} className="mt-1 inline-block break-all text-sm font-semibold text-blue-600 hover:underline">{OFFICIAL_MEETING_URL}</a>
        <div className="mt-2">
          <button type="button" onClick={() => setMoreInfo(value => !value)} aria-expanded={moreInfo}
            className="text-xs text-gray-400 underline hover:text-gray-600">
            {t('meeting.devSiteMoreInfo')}
          </button>
          {moreInfo && <p className="mt-2 text-xs leading-relaxed text-gray-500">{t('meeting.devSiteMoreText')}</p>}
        </div>
        <a href={OFFICIAL_MEETING_URL}
          className="mt-5 flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700">
          {t('meeting.devSiteGo')}
        </a>
        {moreInfo && (
          <button type="button" onClick={stay}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50">
            {t('meeting.devSiteContinue')}
          </button>
        )}
      </div>
    </div>
  );
};
