import React from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { FacebookIcon, InstagramIcon, YoutubeIcon } from './icons/Icons';

const Footer: React.FC = () => {
    const { t } = useLocalization();

    return (
        <footer className="bg-gray-800 text-gray-300 py-10">
            <div className="container mx-auto px-6 text-center">
                <div className="flex justify-center space-x-6 mb-6">
                    <a href="#" className="hover:text-white transition-colors" aria-label="Facebook"><FacebookIcon /></a>
                    <a href="#" className="hover:text-white transition-colors" aria-label="Instagram"><InstagramIcon /></a>
                    <a href="#" className="hover:text-white transition-colors" aria-label="YouTube"><YoutubeIcon /></a>
                </div>
                <p className="text-sm">{t('footer.copyright')}</p>
            </div>
        </footer>
    );
};

export default Footer;
