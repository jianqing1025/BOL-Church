import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { MinistrySubPage } from '../types';
import Editable from './Editable';

interface EventsPageProps {
  activeSubPage: MinistrySubPage;
}

const EventsPage: React.FC<EventsPageProps> = ({ activeSubPage: initialSubPage }) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<MinistrySubPage>(initialSubPage);

  useEffect(() => {
     const handleHashChange = () => {
        const hash = window.location.hash;
        const subPage = (hash.split('/')[2] || 'kids') as MinistrySubPage;
        setActiveTab(subPage);
    };
    window.addEventListener('hashchange', handleHashChange);
    // Set initial state from hash
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  
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
  
  // A simple markdown-like renderer for the content
  const renderContent = (content: string) => {
    return content.split('\n\n').map((paragraph, index) => {
      if (paragraph.startsWith('### ')) {
        return <h3 key={index} className="text-2xl font-bold text-gray-800 mt-8 mb-4">{paragraph.substring(4)}</h3>;
      }
      if (paragraph.startsWith('**')) {
         const parts = paragraph.split('**');
         return <p key={index} className="mb-4"><span className="font-bold">{parts[1]}</span>{parts[2]}</p>
      }
      return <p key={index} className="text-gray-600 leading-relaxed mb-4">{paragraph}</p>;
    });
  };

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
                  href={`#/events/${item.key}`}
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
                render={text => <>{renderContent(text)}</>}
            />
        </div>
      </div>
    </div>
  );
};

export default EventsPage;