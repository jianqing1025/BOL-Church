import React from 'react';
import { useLocalization } from '../hooks/useLocalization';
import Editable from './Editable';

const ContactInfoItem: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h4 className="font-bold text-lg text-gray-800 mb-2">{title}</h4>
    <div className="text-gray-600 space-y-1">{children}</div>
  </div>
);

const Contact: React.FC = () => {
  const { t } = useLocalization();
  
  return (
    <section id="contact" className="py-20 bg-white">
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
              <a href="tel:425-898-7650" className="hover:text-blue-600">(425) 898-7650</a>
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
    </section>
  );
};

export default Contact;