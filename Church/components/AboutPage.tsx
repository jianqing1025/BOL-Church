import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { SubPage } from '../types';
import Editable from './Editable';

interface AboutPageProps {
  activeSubPage: SubPage;
}

const AboutPage: React.FC<AboutPageProps> = ({ activeSubPage: initialSubPage }) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<SubPage>(initialSubPage);

  useEffect(() => {
     const handleHashChange = () => {
        const hash = window.location.hash;
        const subPage = (hash.split('/')[2] || 'our-church') as SubPage;
        setActiveTab(subPage);
    };
    window.addEventListener('hashchange', handleHashChange);
    // Set initial state from hash
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  
  const navItems: { key: SubPage; textKey: string }[] = [
    { key: 'our-church', textKey: 'aboutPage.navOurChurch' },
    { key: 'our-beliefs', textKey: 'aboutPage.navOurBeliefs' },
    { key: 'job-opportunities', textKey: 'aboutPage.navJobOpportunities' },
    { key: 'ministry-leaders', textKey: 'aboutPage.navMinistryLeaders' },
    { key: 'becoming-a-member', textKey: 'aboutPage.navBecomingAMember' },
  ];

  const contentMap: Record<SubPage, { titleKey: string; contentKey: string }> = {
    'our-church': { titleKey: 'aboutPage.ourChurchTitle', contentKey: 'aboutPage.ourChurchContent' },
    'our-beliefs': { titleKey: 'aboutPage.ourBeliefsTitle', contentKey: 'aboutPage.ourBeliefsContent' },
    'job-opportunities': { titleKey: 'aboutPage.jobOpportunitiesTitle', contentKey: 'aboutPage.jobOpportunitiesContent' },
    'ministry-leaders': { titleKey: 'aboutPage.ministryLeadersTitle', contentKey: 'aboutPage.ministryLeadersContent' },
    'becoming-a-member': { titleKey: 'aboutPage.becomingAMemberTitle', contentKey: 'aboutPage.becomingAMemberContent' },
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
        title={t('aboutPage.pageTitle')}
        subtitle={t('aboutPage.pageSubtitle')}
      />
      
      <div className="sticky top-[88px] bg-gray-800 text-white z-40 shadow-md">
        <nav className="container mx-auto px-6">
          <ul className="flex justify-center items-center -mb-px space-x-4 sm:space-x-8 overflow-x-auto">
            {navItems.map((item) => (
              <li key={item.key}>
                <a
                  href={`#/about/${item.key}`}
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

export default AboutPage;