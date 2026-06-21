import React from 'react';
import PageHeader from './PageHeader';
import LiveStreamSection from './LiveStreamSection';
import SermonsSecondaryNav from './SermonsSecondaryNav';
import { useLocalization } from '../hooks/useLocalization';

const LiveStreamPage: React.FC = () => {
  const { t } = useLocalization();
  return (
    <div>
      <PageHeader
        title={t('sermonsPage.navLiveStream')}
        subtitle={t('sermonsPage.liveStreamContent')}
      />
      <SermonsSecondaryNav active="live-stream" />
      <div className="container mx-auto max-w-[1480px] px-6 py-16">
        <LiveStreamSection />
      </div>
    </div>
  );
};

export default LiveStreamPage;
