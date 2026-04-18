
import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { GivingSubPage } from '../types';
import { navigateTo as navigateToRoute } from '../utils/routes';
import Editable from './Editable';
import { LockIcon } from './icons/Icons';
import { useAdmin } from '../hooks/useAdmin';

// This is the form from Giving.tsx
const GivingForm: React.FC = () => {
  const { t } = useLocalization();
  const { submitDonation } = useAdmin();
  const [donationType, setDonationType] = useState<'one-time' | 'recurring'>('one-time');
  const [amount, setAmount] = useState('50');
  const [submitted, setSubmitted] = useState(false);
  const presetAmounts = [50, 100, 200, 500];

  const handleAmountClick = (presetAmount: number) => {
    setAmount(String(presetAmount));
  };
  
  const handleDonate = () => {
      // Mock donation process
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
          alert('Please enter a valid amount.');
          return;
      }
      
      submitDonation({
          amount: numAmount,
          type: donationType
      });
      setSubmitted(true);
  };
  
  if (submitted) {
      return (
          <div className="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-lg mt-8 text-center">
              <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                 <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <h3 className="text-2xl font-bold mb-2">Thank You!</h3>
              <p className="text-gray-600 mb-6">Your generosity helps us continue our mission. A confirmation email has been sent.</p>
              <button onClick={() => setSubmitted(false)} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700">
                  Give Again
              </button>
          </div>
      );
  }
  
  return (
    <div className="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-lg mt-8 text-left">
        <div className="grid grid-cols-2 gap-2 bg-gray-200 p-1 rounded-full mb-6">
            <button
                onClick={() => setDonationType('one-time')}
                className={`w-full py-2 rounded-full font-semibold transition-colors ${donationType === 'one-time' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-300'}`}
            >
                {t('giving.oneTime')}
            </button>
            <button
                onClick={() => setDonationType('recurring')}
                className={`w-full py-2 rounded-full font-semibold transition-colors ${donationType === 'recurring' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-300'}`}
            >
                {t('giving.recurring')}
            </button>
        </div>
        <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">{t('giving.amount')}</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {presetAmounts.map((preset) => (
                    <button
                        key={preset}
                        onClick={() => handleAmountClick(preset)}
                        className={`py-3 px-4 border rounded-lg font-semibold transition-all ${String(preset) === amount ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-500'}`}
                    >
                        ${preset}
                    </button>
                ))}
            </div>
            <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-xl">$</span>
                <input
                    id="amount"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Other Amount"
                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg text-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
            </div>
        </div>
        <button onClick={handleDonate} className="w-full bg-blue-600 text-white text-lg font-bold py-4 rounded-lg hover:bg-blue-700 transition-all mt-8">
            {t('giving.giveNow')}
        </button>
        <p className="text-xs text-gray-500 mt-6 text-center">
            <LockIcon />
            {t('giving.securityNote')}
        </p>
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
      
      <div className="sticky top-[88px] bg-gray-800 text-white z-40 shadow-md">
        <nav className="container mx-auto px-6">
          <ul className="flex justify-center items-center -mb-px space-x-4 sm:space-x-8 overflow-x-auto">
            {navItems.map((item) => (
              <li key={item.key}>
                <a
                  href={`/giving/${item.key}`}
                  onClick={event => handleTabClick(event, `/giving/${item.key}`)}
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
        {activeTab === 'ways-to-give' && <GivingForm />}
      </div>
    </div>
  );
};

export default GivingPage;
