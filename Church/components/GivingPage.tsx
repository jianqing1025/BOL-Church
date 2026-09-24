
import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { GivingSubPage } from '../types';
import { navigateTo as navigateToRoute } from '../utils/routes';
import Editable from './Editable';
import SecondaryNavBar from './SecondaryNavBar';

/**
 * 線上刷卡奉獻的過渡畫面。Task 21 會換成真正的 Stripe 表單。
 *
 * 在那之前寧可誠實說「還沒好」，也不要留一個按了會顯示「感謝奉獻」
 * 卻根本沒收到錢的假表單 —— 那比沒有功能糟糕得多。
 */
const OnlineGivingComingSoon: React.FC = () => {
  const { t } = useLocalization();
  return (
    <div className="mx-auto mt-8 max-w-lg rounded-xl bg-white p-8 text-center shadow-lg">
      <p className="mb-6 text-gray-700">{t('giving.onlineComingSoon')}</p>
      <a
        href="/giving/other-ways-to-give"
        onClick={event => { event.preventDefault(); navigateToRoute('/giving/other-ways-to-give'); }}
        className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {t('givingPage.navOtherWaysToGive')}
      </a>
      <div className="mt-6 space-y-1 text-sm">
        <p><a href="tel:4258987650" className="font-semibold text-blue-700 hover:text-blue-800">(425) 898-7650</a></p>
        <p><a href="mailto:bolccop@gmail.com" className="font-semibold text-blue-700 hover:text-blue-800">bolccop@gmail.com</a></p>
      </div>
    </div>
  );
};


interface GivingPageProps {
  activeSubPage: GivingSubPage;
}

const PAYPAL_DONATE_URL = 'https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=53TWJ24XHFQXW';

const OtherWaysToGiveSection: React.FC = () => (
  <div className="mx-auto max-w-4xl">
    <Editable
      as="p"
      contentKey="givingPage.otherWaysToGiveContent"
      className="mx-auto mb-8 max-w-2xl text-center text-lg text-gray-600"
    />

    <div className="grid gap-5 md:grid-cols-2">
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm md:col-span-2">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="text-left">
            <Editable
              as="h3"
              contentKey="givingPage.otherWaysOnlineTitle"
              className="text-xl font-bold text-gray-900"
            />
            <Editable
              as="p"
              contentKey="givingPage.otherWaysOnlineText"
              className="mt-2 text-gray-600"
            />
          </div>
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <img src="/images/zelle-icon.png" alt="Zelle" className="mx-auto h-16 w-16 object-contain" />
              <div className="mt-2 text-sm font-semibold text-gray-700">Zelle</div>
            </div>
            <a
              href={PAYPAL_DONATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center transition-transform hover:-translate-y-0.5"
            >
              <img src="/images/paypal_PNG22.png" alt="PayPal" className="mx-auto h-16 w-16 object-contain" />
              <div className="mt-2 text-sm font-semibold text-gray-700">PayPal</div>
            </a>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <Editable
          as="h3"
          contentKey="givingPage.otherWaysMailTitle"
          className="text-xl font-bold text-gray-900"
        />
        <Editable
          as="p"
          contentKey="givingPage.otherWaysMailText"
          className="mt-3 text-gray-600"
        />
        <div className="mt-5 rounded-lg bg-gray-50 p-4 text-gray-800">
          <Editable
            as="p"
            contentKey="givingPage.otherWaysChurchName"
            className="font-semibold"
          />
          <Editable
            as="p"
            contentKey="givingPage.otherWaysAddress"
            className="mt-1"
          />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <Editable
          as="h3"
          contentKey="givingPage.otherWaysTransferTitle"
          className="text-xl font-bold text-gray-900"
        />
        <Editable
          as="p"
          contentKey="givingPage.otherWaysTransferText"
          className="mt-3 text-gray-600"
        />
        <div className="mt-5 space-y-2 rounded-lg bg-gray-50 p-4 text-gray-800">
          <Editable
            as="h4"
            contentKey="givingPage.otherWaysContactTitle"
            className="font-semibold"
          />
          <p>
            <a href="tel:4258987650" className="font-semibold text-blue-700 hover:text-blue-800">
              <Editable as="span" contentKey="givingPage.otherWaysPhone" />
            </a>
          </p>
          <p>
            <a href="mailto:bolccop@gmail.com" className="font-semibold text-blue-700 hover:text-blue-800">
              <Editable as="span" contentKey="givingPage.otherWaysEmail" />
            </a>
          </p>
        </div>
      </section>
    </div>

    <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 px-5 py-4 text-center text-blue-900">
      <Editable as="p" contentKey="givingPage.otherWaysReceiptNote" className="font-semibold" />
    </div>
  </div>
);

const GivingPage: React.FC<GivingPageProps> = ({ activeSubPage: initialSubPage }) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<GivingSubPage>(initialSubPage);

  useEffect(() => {
    setActiveTab(initialSubPage);
  }, [initialSubPage]);

  const handleTabClick = (event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    event.preventDefault();
    navigateToRoute(path);
  };
  
  const navItems: { key: GivingSubPage; textKey: string }[] = [
    { key: 'why-we-give', textKey: 'givingPage.navWhyWeGive' },
    { key: 'what-is-tithing', textKey: 'givingPage.navWhatIsTithing' },
    { key: 'ways-to-give', textKey: 'givingPage.navWaysToGive' },
    { key: 'other-ways-to-give', textKey: 'givingPage.navOtherWaysToGive' },
  ];

  const contentMap: Record<GivingSubPage, { titleKey: string; contentKey: string } | null> = {
    'why-we-give': { titleKey: 'givingPage.whyWeGiveTitle', contentKey: 'givingPage.whyWeGiveContent' },
    'what-is-tithing': { titleKey: 'givingPage.whatIsTithingTitle', contentKey: 'givingPage.whatIsTithingContent' },
    'ways-to-give': { titleKey: 'givingPage.waysToGiveTitle', contentKey: 'givingPage.waysToGiveContent' },
    'other-ways-to-give': { titleKey: 'givingPage.otherWaysToGiveTitle', contentKey: 'givingPage.otherWaysToGiveContent' },
  };

  const currentContent = contentMap[activeTab];
  
  return (
    <div>
      <PageHeader
        title={t('givingPage.pageTitle')}
        subtitle={t('givingPage.pageSubtitle')}
      />
      
      <SecondaryNavBar>
        <nav className="container mx-auto px-6">
          <ul className="flex justify-center items-center -mb-px space-x-4 sm:space-x-8 overflow-x-auto">
            {navItems.map((item) => (
              <li key={item.key}>
                <a
                  href={`/giving/${item.key}`}
                  onClick={event => handleTabClick(event, `/giving/${item.key}`)}
                  className={`whitespace-nowrap inline-block text-sm sm:text-base font-semibold py-2.5 min-[1920px]:py-4 border-b-2 transition-colors duration-300 ${
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
      </SecondaryNavBar>
      
      <div className="container mx-auto max-w-4xl px-6 py-16">
        {currentContent && (
            <div className={activeTab === 'ways-to-give' ? 'text-center' : 'text-left'}>
                <Editable
                    as="h2"
                    contentKey={currentContent.titleKey}
                    className="text-3xl font-extrabold text-gray-900 mb-6"
                />
                {activeTab === 'other-ways-to-give' ? (
                    <OtherWaysToGiveSection />
                ) : (
                    <div className="prose prose-lg max-w-none mx-auto">
                        <Editable
                            as="div"
                            contentKey={currentContent.contentKey}
                            isTextarea={true}
                        />
                    </div>
                )}
            </div>
        )}
        {activeTab === 'ways-to-give' && <OnlineGivingComingSoon />}
      </div>
    </div>
  );
};

export default GivingPage;
