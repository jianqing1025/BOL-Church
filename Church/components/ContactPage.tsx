
import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { ContactSubPage } from '../types';
import Editable from './Editable';
import { useAdmin } from '../hooks/useAdmin';

const ContactForm = () => {
  const { t } = useLocalization();
  const { submitMessage } = useAdmin();
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', phone: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitMessage(formData);
    setSubmitted(true);
    setFormData({ firstName: '', lastName: '', email: '', phone: '', message: '' });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  
  return (
    <div className="bg-white p-8 sm:p-12 rounded-2xl shadow-lg max-w-4xl mx-auto border border-gray-100">
      <Editable as="h2" contentKey="contactPage.formTitle" className="text-3xl font-bold text-gray-900 mb-2" />
      <Editable as="p" contentKey="contactPage.formSubtitle" className="text-gray-600 mb-8" />
      
      {submitted ? (
          <div className="bg-green-50 text-green-800 p-6 rounded-lg text-center">
              <h3 className="text-xl font-bold mb-2">{t('contactPage.successTitle')}</h3>
              <p>{t('contactPage.successMessage')}</p>
              <button onClick={() => setSubmitted(false)} className="mt-4 text-sm underline">{t('contactPage.sendAnother')}</button>
          </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
                <label htmlFor="firstName" className="sr-only">{t('contactPage.firstName')}</label>
                <input required type="text" name="firstName" value={formData.firstName} onChange={handleChange} placeholder={t('contactPage.firstName')} className="w-full bg-gray-100 border-gray-200 rounded-lg p-4 text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
                <label htmlFor="lastName" className="sr-only">{t('contactPage.lastName')}</label>
                <input required type="text" name="lastName" value={formData.lastName} onChange={handleChange} placeholder={t('contactPage.lastName')} className="w-full bg-gray-100 border-gray-200 rounded-lg p-4 text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
                <label htmlFor="email" className="sr-only">{t('contactPage.emailAddress')}</label>
                <input required type="email" name="email" value={formData.email} onChange={handleChange} placeholder={t('contactPage.emailAddress')} className="w-full bg-gray-100 border-gray-200 rounded-lg p-4 text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
                <label htmlFor="phone" className="sr-only">{t('contactPage.phoneNumber')}</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder={t('contactPage.phoneNumber')} className="w-full bg-gray-100 border-gray-200 rounded-lg p-4 text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            </div>
            <div>
            <label htmlFor="message" className="sr-only">{t('contactPage.message')}</label>
            <textarea required name="message" value={formData.message} onChange={handleChange} rows={6} placeholder={t('contactPage.message')} className="w-full bg-gray-100 border-gray-200 rounded-lg p-4 text-sm focus:ring-blue-500 focus:border-blue-500"></textarea>
            </div>
            <div className="flex items-center">
            <input id="terms" name="terms" type="checkbox" required className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
            <label htmlFor="terms" className="ml-2 block text-sm text-gray-700">
                {t('contactPage.agreePrefix')}{' '}
                <a href="#" className="font-medium text-blue-600 hover:underline">{t('contactPage.terms')}</a>{' '}
                {t('contactPage.and')}{' '}
                <a href="#" className="font-medium text-blue-600 hover:underline">{t('contactPage.privacy')}</a>.
            </label>
            </div>
            <div>
            <button type="submit" className="w-full sm:w-auto bg-gray-900 text-white font-bold py-4 px-8 rounded-lg hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900">
                {t('contactPage.submit')}
            </button>
            </div>
        </form>
      )}
    </div>
  );
};

const PrayerRequestForm = () => {
  const { t } = useLocalization();
  const { submitPrayerRequest } = useAdmin();
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '', phone: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitPrayerRequest(formData);
    setSubmitted(true);
    setFormData({ firstName: '', lastName: '', email: '', phone: '', message: '' });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  
  return (
    <div className="bg-white p-8 sm:p-12 rounded-2xl shadow-lg max-w-4xl mx-auto border border-gray-100">
      <Editable as="h2" contentKey="contactPage.prayerFormTitle" className="text-3xl font-bold text-gray-900 mb-2" />
      <Editable as="p" contentKey="contactPage.prayerFormSubtitle" className="text-gray-600 mb-8" />
      
      {submitted ? (
          <div className="bg-green-50 text-green-800 p-6 rounded-lg text-center">
              <h3 className="text-xl font-bold mb-2">{t('prayerRequestPage.successTitle')}</h3>
              <p>{t('prayerRequestPage.successMessage')}</p>
              <button onClick={() => setSubmitted(false)} className="mt-4 text-sm underline">{t('prayerRequestPage.submitAnother')}</button>
          </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
                <label htmlFor="firstName" className="sr-only">{t('contactPage.firstNameOptional')}</label>
                <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} placeholder={t('contactPage.firstNameOptional')} className="w-full bg-gray-100 border-gray-200 rounded-lg p-4 text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
                <label htmlFor="lastName" className="sr-only">{t('contactPage.lastNameOptional')}</label>
                <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} placeholder={t('contactPage.lastNameOptional')} className="w-full bg-gray-100 border-gray-200 rounded-lg p-4 text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
                <label htmlFor="email" className="sr-only">{t('contactPage.emailAddressOptional')}</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder={t('contactPage.emailAddressOptional')} className="w-full bg-gray-100 border-gray-200 rounded-lg p-4 text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
                <label htmlFor="phone" className="sr-only">{t('contactPage.phoneNumberOptional')}</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder={t('contactPage.phoneNumberOptional')} className="w-full bg-gray-100 border-gray-200 rounded-lg p-4 text-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            </div>
            <div>
            <label htmlFor="message" className="sr-only">{t('contactPage.prayerMessagePlaceholder')}</label>
            <textarea required name="message" value={formData.message} onChange={handleChange} rows={6} placeholder={t('contactPage.prayerMessagePlaceholder')} className="w-full bg-gray-100 border-gray-200 rounded-lg p-4 text-sm focus:ring-blue-500 focus:border-blue-500"></textarea>
            </div>
            <div>
            <button type="submit" className="w-full sm:w-auto bg-gray-900 text-white font-bold py-4 px-8 rounded-lg hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900">
                {t('contactPage.prayerSubmit')}
            </button>
            </div>
        </form>
      )}
    </div>
  );
};

const LocationInfo = () => {
    const { t } = useLocalization();
    const ContactInfoItem: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
      <div>
        <h4 className="font-bold text-lg text-gray-800 mb-2">{title}</h4>
        <div className="text-gray-600 space-y-1">{children}</div>
      </div>
    );
    return (
        <div className="bg-gray-50">
            <div className="container mx-auto px-6">
                <div className="text-center">
                    <Editable as="h2" contentKey="contact.title" className="text-3xl md:text-4xl font-bold mb-12 text-gray-800" />
                </div>
                <div className="flex flex-col md:flex-row gap-12 justify-center">
                <div className="md:w-1/3 space-y-6">
                    <ContactInfoItem title={t('contact.addressTitle')}>
                    <p>{t('contact.address')}</p>
                    </ContactInfoItem>
                    <ContactInfoItem title={t('contact.serviceTimesTitle')}>
                    <p>{t('contact.chineseService')}</p>
                    </ContactInfoItem>
                    <ContactInfoItem title={t('contact.onlineServiceTitle')}>
                        <a 
                            href="https://www.youtube.com/@信望愛網路教會BreadofLife" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 transition-colors"
                        >
                            {t('contact.onlineServiceLinkText')}
                        </a>
                    </ContactInfoItem>
                    <ContactInfoItem title={t('contact.phone')}>
                    <a href="tel:425-246-0264" className="hover:text-blue-600">(425) 246-0264</a>
                    </ContactInfoItem>
                    <ContactInfoItem title={t('contact.email')}>
                    <a href="mailto:bolccop@gmail.com" className="hover:text-blue-600">bolccop@gmail.com</a>
                    </ContactInfoItem>
                </div>
                <div className="md:w-1/2 h-64 md:h-auto rounded-lg overflow-hidden shadow-lg">
                    <iframe
                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2693.303960309193!2d-122.03847358437146!3d47.5302319791796!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x5490658025280ab7%3A0xc7fc8bdddb87d66d!2sBread%20of%20Life%20Christian%20Church!5e0!3m2!1sen!2sus!4v1626886364000!5m2!1sen!2sus"
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        allowFullScreen={false}
                        loading="lazy"
                        title="Google Maps Location"
                    ></iframe>
                </div>
                </div>
            </div>
        </div>
    );
}

interface ContactPageProps {
  activeSubPage: ContactSubPage;
}

const ContactPage: React.FC<ContactPageProps> = ({ activeSubPage: initialSubPage }) => {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<ContactSubPage>(initialSubPage);

  useEffect(() => {
     const handleHashChange = () => {
        const hash = window.location.hash;
        const subPage = (hash.split('/')[2] || 'contact-us') as ContactSubPage;
        setActiveTab(subPage);
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  
  const navItems: { key: ContactSubPage; textKey: string }[] = [
    { key: 'contact-us', textKey: 'header.navContact' },
    { key: 'join-us', textKey: 'contactPage.navJoinUs' },
    { key: 'prayer-request', textKey: 'contactPage.navPrayerRequest' },
  ];

  return (
    <div className="bg-gray-50">
      <PageHeader
        title={t('contactPage.pageTitle')}
        subtitle={t('contactPage.pageSubtitle')}
      />
      
      <div className="sticky top-[88px] bg-gray-800 text-white z-40 shadow-md">
        <nav className="container mx-auto px-6">
          <ul className="flex justify-center items-center -mb-px space-x-4 sm:space-x-8 overflow-x-auto">
            {navItems.map((item) => (
              <li key={item.key}>
                <a
                  href={`#/contact/${item.key}`}
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
        {activeTab === 'contact-us' && <ContactForm />}
        {activeTab === 'join-us' && <LocationInfo />}
        {activeTab === 'prayer-request' && <PrayerRequestForm />}
      </div>
    </div>
  );
};

export default ContactPage;
