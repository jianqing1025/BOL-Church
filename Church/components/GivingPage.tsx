
import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { GivingSubPage } from '../types';
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

const GivingPage: React.FC<GivingPageProps> = ({ activeSubPage: initialSubPage }) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<GivingSubPage>(initialSubPage);

  useEffect(() => {
     const handleHashChange = () => {
        const hash = window.location.hash;
        const subPage = (hash.split('/')[2] || 'why-we-give') as GivingSubPage;
        setActiveTab(subPage);
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  
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
  
  const renderContent = (content: string) => {
    return content.split('\n\n').map((paragraph, index) => {
      // Simple renderer, can be expanded for markdown
      return <p key={index} className="text-gray-600 leading-relaxed mb-4">{paragraph}</p>;
    });
  };

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
                  href={`#/giving/${item.key}`}
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
                <div className="prose prose-lg max-w-none mx-auto">
                    <Editable
                        as="div"
                        contentKey={currentContent.contentKey}
                        isTextarea={true}
                        render={text => <>{renderContent(text)}</>}
                    />
                </div>
            </div>
        )}
        {activeTab === 'ways-to-give' && <GivingForm />}
      </div>
    </div>
  );
};

export default GivingPage;
