import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { MinistrySubPage } from '../types';
import Editable from './Editable';
import MinistrySecondaryNav from './MinistrySecondaryNav';

interface EventsPageProps {
  activeSubPage: MinistrySubPage;
}

const EventsPage: React.FC<EventsPageProps> = ({ activeSubPage: initialSubPage }) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<MinistrySubPage>(initialSubPage);

  useEffect(() => {
    setActiveTab(initialSubPage);
  }, [initialSubPage]);

  const contentMap: Record<MinistrySubPage, { titleKey: string; contentKey: string }> = {
    'kids': { titleKey: 'eventsPage.kidsTitle', contentKey: 'eventsPage.kidsContent' },
    'men': { titleKey: 'eventsPage.menTitle', contentKey: 'eventsPage.menContent' },
    'women': { titleKey: 'eventsPage.womenTitle', contentKey: 'eventsPage.womenContent' },
    'joint': { titleKey: 'eventsPage.jointTitle', contentKey: 'eventsPage.jointContent' },
    'alpha': { titleKey: 'eventsPage.alphaTitle', contentKey: 'eventsPage.alphaContent' },
    'prayer': { titleKey: 'eventsPage.prayerTitle', contentKey: 'eventsPage.prayerContent' },
  };

  const currentContent = contentMap[activeTab];
  
  return (
    <div>
      <PageHeader
        title={t('eventsPage.pageTitle')}
        subtitle={t('eventsPage.pageSubtitle')}
      />
      
      <MinistrySecondaryNav active={activeTab} />

      <div className="container mx-auto max-w-4xl px-6 py-16">
        <Editable
            as="h2"
            contentKey={currentContent.titleKey}
            className="text-3xl font-extrabold text-gray-900 mb-6"
        />
        <div className="prose prose-lg max-w-none">
            <Editable
                as="div"
                contentKey={currentContent.contentKey}
                isTextarea={true}
            />
        </div>
      </div>
    </div>
  );
};

export default EventsPage;
