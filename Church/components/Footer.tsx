import React, { useState } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { FacebookIcon, InstagramIcon, YoutubeIcon } from './icons/Icons';
import AdminLogin from './AdminLogin';

const Footer: React.FC = () => {
    const { t } = useLocalization();
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

    return (
        <>
            <footer className="bg-gray-800 text-gray-300 py-10">
                <div className="container mx-auto px-6 text-center">
                    <div className="flex justify-center space-x-6 mb-6">
                        <a href="#" className="hover:text-white transition-colors" aria-label="Facebook"><FacebookIcon /></a>
                        <a href="#" className="hover:text-white transition-colors" aria-label="Instagram"><InstagramIcon /></a>
                        <a href="#" className="hover:text-white transition-colors" aria-label="YouTube"><YoutubeIcon /></a>
                    </div>
                    <p className="text-sm">{t('footer.copyright')}</p>
                    <div className="mt-4">
                        <button onClick={() => setIsLoginModalOpen(true)} className="text-xs text-gray-500 hover:text-white transition-colors">
                            Admin
                        </button>
                    </div>
                </div>
            </footer>
            {isLoginModalOpen && <AdminLogin onClose={() => setIsLoginModalOpen(false)} />}
        </>
    );
};

export default Footer;
