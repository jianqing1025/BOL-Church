
import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { PrayerRequestSubPage } from '../types';
import { navigateTo as navigateToRoute } from '../utils/routes';
import Editable from './Editable';
import { useAdmin } from '../hooks/useAdmin';

const PrayerRequestForm = () => {
  const { t } = useLocalization();
  const { submitPrayerRequest } = useAdmin();
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', phone: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await submitPrayerRequest(formData);
      setSubmitted(true);
      setFormData({ firstName: '', lastName: '', email: '', phone: '', message: '' });
    } catch (error) {
      console.error("Prayer request submission failed", error);
      alert("Submission failed. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  
  return (
    <div className="bg-white p-8 sm:p-12 rounded-2xl shadow-lg max-w-4xl mx-auto border border-gray-100">
      <Editable as="h2" contentKey="prayerRequestPage.formTitle" className="text-3xl font-bold text-gray-900 mb-2" />
      <Editable as="p" contentKey="prayerRequestPage.formSubtitle" className="text-gray-600 mb-8" />
      
      {submitted ? (
          <div className="bg-green-50 text-green-800 p-8 rounded-xl text-center">
              <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                 <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <h3 className="text-2xl font-bold mb-2">{t('prayerRequestPage.successTitle')}</h3>
              <p className="text-lg">{t('prayerRequestPage.successMessage')}</p>
              <button onClick={() => setSubmitted(false)} className="mt-6 text-blue-600 font-semibold hover:underline">{t('prayerRequestPage.submitAnother')}</button>
          </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
                <label htmlFor="firstName" className="block text-sm font-semibold text-gray-700 mb-1">{t('prayerRequestPage.firstName')}</label>
                <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} placeholder={t('prayerRequestPage.firstName')} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
            </div>
            <div>
                <label htmlFor="lastName" className="block text-sm font-semibold text-gray-700 mb-1">{t('prayerRequestPage.lastName')}</label>
                <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} placeholder={t('prayerRequestPage.lastName')} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
            </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1">{t('prayerRequestPage.emailAddress')}</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder={t('prayerRequestPage.emailAddress')} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
            </div>
            <div>
                <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-1">{t('prayerRequestPage.phoneNumber')}</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder={t('prayerRequestPage.phoneNumber')} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
            </div>
            </div>
            <div>
            <label htmlFor="message" className="block text-sm font-semibold text-gray-700 mb-1">{t('prayerRequestPage.message')}</label>
            <textarea required name="message" value={formData.message} onChange={handleChange} rows={6} placeholder={t('prayerRequestPage.message')} className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"></textarea>
            </div>
            <div>
            <button 
                type="submit" 
                disabled={isSubmitting}
                className={`w-full sm:w-auto ${isSubmitting ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold py-4 px-10 rounded-lg transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center justify-center gap-2`}
            >
                {isSubmitting && (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                )}
                {t('prayerRequestPage.submit')}
            </button>
            </div>
        </form>
      )}
    </div>
  );
};


interface PrayerRequestPageProps {
  activeSubPage: PrayerRequestSubPage;
}

const PrayerRequestPage: React.FC<PrayerRequestPageProps> = ({ activeSubPage: initialSubPage }) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<PrayerRequestSubPage>(initialSubPage);

  useEffect(() => {
    setActiveTab(initialSubPage);
  }, [initialSubPage]);

  const handleTabClick = (event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    event.preventDefault();
    navigateToRoute(path);
  };
  
  const navItems: { key: PrayerRequestSubPage; textKey: string }[] = [
    { key: 'submit-request', textKey: 'prayerRequestPage.navSubmitRequest' },
  ];

  return (
    <div className="bg-gray-50 min-h-screen">
      <PageHeader
        title={t('prayerRequestPage.pageTitle')}
        subtitle={t('prayerRequestPage.pageSubtitle')}
      />
      
      <div className="sticky top-[88px] bg-gray-800 text-white z-40 shadow-md">
        <nav className="container mx-auto px-6">
          <ul className="flex justify-center items-center -mb-px space-x-4 sm:space-x-8 overflow-x-auto">
            {navItems.map((item) => (
              <li key={item.key}>
                <a
                  href={`/prayer-request/${item.key}`}
                  onClick={event => handleTabClick(event, `/prayer-request/${item.key}`)}
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
      
      <div className="container mx-auto px-6 py-16">
        <PrayerRequestForm />
      </div>
    </div>
  );
};

export default PrayerRequestPage;
