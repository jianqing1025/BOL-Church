import React from 'react';
import { useLocalization } from '../hooks/useLocalization';

/** 影片卡片的灰色占位：資料還沒到時用，不再先顯示寫死的範例講道。 */
export const VideoCardSkeletons: React.FC<{ count: number; className?: string }> = ({ count, className = 'grid md:grid-cols-2 lg:grid-cols-4 gap-8' }) => (
  <div className={className} aria-busy="true">
    {Array.from({ length: count }, (_, index) => (
      <div key={index} className={`animate-pulse overflow-hidden rounded-lg bg-white shadow-lg ${index < 2 ? '' : 'hidden md:block'}`}>
        <div className="aspect-video bg-gray-200" />
        <div className="space-y-2 p-4">
          <div className="h-4 w-3/4 rounded bg-gray-200" />
          <div className="h-3 w-1/2 rounded bg-gray-100" />
        </div>
      </div>
    ))}
  </div>
);

/** 清單載入失敗：說明並給一個重試鍵。 */
export const ListLoadError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
  const { t } = useLocalization();
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 py-16 text-center">
      <p className="text-gray-500">{t('sermonArchive.loadFailed')}</p>
      <button type="button" onClick={onRetry} className="mt-4 rounded-full bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-700">
        {t('sermonArchive.retry')}
      </button>
    </div>
  );
};
