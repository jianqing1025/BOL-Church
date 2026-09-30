import React from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useLocalization } from '../hooks/useLocalization';

/** 網站內容載入失敗（自動重試後仍失敗、裝置上也沒有快取）時，在畫面下方提示並可重試。 */
const SiteLoadErrorBanner: React.FC = () => {
  const { loadError, retryBootstrap } = useAdmin();
  const { t } = useLocalization();
  if (!loadError) return null;
  return (
    <div role="alert" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg items-center justify-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg ring-1 ring-amber-200">
      <span>{t('sermonArchive.siteLoadFailed')}</span>
      <button type="button" onClick={retryBootstrap} className="rounded-full bg-amber-600 px-3 py-1 font-semibold text-white hover:bg-amber-700">
        {t('sermonArchive.retry')}
      </button>
    </div>
  );
};

export default SiteLoadErrorBanner;
