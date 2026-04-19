import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { MinistrySubPage } from '../types';
import { navigateTo as navigateToRoute } from '../utils/routes';
import Editable from './Editable';

interface EventsPageProps {
  activeSubPage: MinistrySubPage;
}

const EventsPage: React.FC<EventsPageProps> = ({ activeSubPage: initialSubPage }) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<MinistrySubPage>(initialSubPage);

  useEffect(() => {
    setActiveTab(initialSubPage);
  }, [initialSubPage]);

  const handleTabClick = (event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    event.preventDefault();
    navigateToRoute(path);
  };
  
  const navItems: { key: MinistrySubPage; textKey: string }[] = [
    { key: 'kids', textKey: 'eventsPage.navKids' },
    { key: 'men', textKey: 'eventsPage.navMen' },
    { key: 'women', textKey: 'eventsPage.navWomen' },
    { key: 'joint', textKey: 'eventsPage.navJoint' },
    { key: 'alpha', textKey: 'eventsPage.navAlpha' },
    { key: 'prayer', textKey: 'eventsPage.navPrayer' },
  ];

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
      
      <div className="sticky top-[88px] bg-gray-800 text-white z-40 shadow-md">
        <nav className="container mx-auto px-6">
          <ul className="flex justify-center items-center -mb-px space-x-4 sm:space-x-8 overflow-x-auto">
            {navItems.map((item) => (
              <li key={item.key}>
                <a
                  href={`/events/${item.key}`}
                  onClick={event => handleTabClick(event, `/events/${item.key}`)}
                  className={`whitespace-nowrap inline-block text-sm sm:text-base font-semibold py-4 border-b-2 transition-colors duration-300 ${
                    activeTab === item.key
                      ? 'border-white text-white'
                      : 'border-transparent text-gray-400 hover:text-white hover:border-gray-300'
                  }`}
                >
                  {t(item.textKey)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      
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
