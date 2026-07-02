import React from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { YoutubeIcon } from './icons/Icons';

const SpotifyIcon: React.FC = () => (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.45a.74.74 0 0 1-1.02.25c-2.8-1.7-6.32-2.09-10.47-1.14a.75.75 0 0 1-.33-1.46c4.55-1.04 8.45-.59 11.57 1.32.35.21.46.67.25 1.03Zm1.23-2.74a.93.93 0 0 1-1.28.31c-3.2-1.97-8.1-2.54-11.9-1.39a.94.94 0 0 1-.54-1.8c4.34-1.31 9.73-.68 13.4 1.57.44.27.58.86.32 1.31Zm.1-2.85C14.1 8.58 7.78 8.37 4.12 9.48a1.12 1.12 0 1 1-.65-2.14c4.2-1.28 11.2-1.03 15.6 1.58a1.12 1.12 0 0 1-1.14 1.94Z" />
    </svg>
);

const AnchorIcon: React.FC = () => (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="5" r="2.5" />
        <path d="M12 7.5V20" />
        <path d="M7 10h10" />
        <path d="M5 15c.8 3 3.4 5 7 5s6.2-2 7-5" />
        <path d="M5 15h3" />
        <path d="M19 15h-3" />
    </svg>
);

const PodBeanIcon: React.FC = () => (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3.5c4.7 0 8.5 3.8 8.5 8.5S16.7 20.5 12 20.5 3.5 16.7 3.5 12 7.3 3.5 12 3.5Zm0 2C8.4 5.5 5.5 8.4 5.5 12s2.9 6.5 6.5 6.5 6.5-2.9 6.5-6.5S15.6 5.5 12 5.5Zm0 4.1a2.4 2.4 0 0 1 2.4 2.4A2.4 2.4 0 0 1 12 14.4 2.4 2.4 0 0 1 9.6 12 2.4 2.4 0 0 1 12 9.6Zm-4.5 1.9a.9.9 0 0 1 .9.9 3.6 3.6 0 0 0 3.6 3.6.9.9 0 1 1 0 1.8 5.4 5.4 0 0 1-5.4-5.4.9.9 0 0 1 .9-.9Zm9 0a.9.9 0 0 1 .9.9 5.4 5.4 0 0 1-5.4 5.4.9.9 0 1 1 0-1.8 3.6 3.6 0 0 0 3.6-3.6.9.9 0 0 1 .9-.9Z" />
    </svg>
);

const footerLinks = [
    { label: 'Spotify', href: 'https://open.spotify.com/show/5Jtsg9l5yUQ7RNqSi2tvaj', icon: <SpotifyIcon /> },
    { label: 'Anchor 信望愛', href: 'https://anchor.fm/andy84476', icon: <AnchorIcon /> },
    { label: 'PodBean 信望愛', href: 'https://andydyu.podbean.com', icon: <PodBeanIcon /> },
    { label: 'YouTube', href: 'https://www.youtube.com/channel/UC_BhtgATxv5GYwMbhTYAFog', icon: <YoutubeIcon /> },
];

const Footer: React.FC = () => {
    const { t } = useLocalization();

    return (
        <footer className="bg-gray-800 text-gray-300 py-10">
            <div className="container mx-auto px-6 text-center">
                <div className="mb-6 flex flex-wrap justify-center gap-3">
                    {footerLinks.map(link => (
                        <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center transition-colors hover:text-white"
                            aria-label={link.label}
                        >
                            {link.icon}
                        </a>
                    ))}
                </div>
                <p className="text-sm">
                    {t('footer.copyright')}{' '}
                    <a
                        href="https://classic.bolccop.org"
                        className="font-semibold text-white underline-offset-4 hover:underline"
                    >
                        {t('footer.classicSite')}
                    </a>
                </p>
            </div>
        </footer>
    );
};

export default Footer;
