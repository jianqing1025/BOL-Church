import React, { useState } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { useAdmin } from '../hooks/useAdmin';
import { navigateTo as navigateToRoute } from '../utils/routes';
import SecondaryNavBar from './SecondaryNavBar';
import ChannelSyncManager from './ChannelSyncManager';

export type SermonsNavKey = 'sunday-worship' | 'worship-praise' | 'healing-prayer' | 'testimony' | 'daily-manna' | 'live-stream';

interface SermonsSecondaryNavProps {
  active: SermonsNavKey;
}

const NAV_ITEMS: { key: SermonsNavKey; textKey: string; href: string }[] = [
  { key: 'sunday-worship', textKey: 'sermonsPage.navSundayWorship', href: '/sermons/sunday-worship' },
  { key: 'worship-praise', textKey: 'sermonsPage.navWorshipPraise', href: '/sermons/worship-praise' },
  { key: 'healing-prayer', textKey: 'sermonsPage.navHealingPrayer', href: '/sermons/healing-prayer' },
  { key: 'testimony', textKey: 'sermonsPage.navTestimony', href: '/sermons/testimony' },
  { key: 'daily-manna', textKey: 'sermonsPage.navDailyManna', href: '/sermons/daily-manna' },
  { key: 'live-stream', textKey: 'sermonsPage.navLiveStream', href: '/live' },
];

const SermonsSecondaryNav: React.FC<SermonsSecondaryNavProps> = ({ active }) => {
  const { t } = useLocalization();
  const { isAdminMode } = useAdmin();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    event.preventDefault();
    navigateToRoute(path);
  };

  return (
    <SecondaryNavBar>
      <nav className="container relative mx-auto px-6">
        <ul className="flex justify-center items-center -mb-px space-x-4 sm:space-x-8 overflow-x-auto">
          {NAV_ITEMS.map(item => (
            <li key={item.key}>
              <a
                href={item.href}
                onClick={event => handleClick(event, item.href)}
                className={`whitespace-nowrap inline-block text-sm sm:text-base font-semibold py-4 border-b-2 transition-colors duration-300 ${
                  active === item.key
                    ? 'border-white text-white'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-300'
                }`}
              >
                {t(item.textKey)}
              </a>
            </li>
          ))}
        </ul>
        {isAdminMode && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title={t('admin.channelSyncSettings')}
            aria-label={t('admin.channelSyncSettings')}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-300 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </nav>
      <ChannelSyncManager open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </SecondaryNavBar>
  );
};

export default SermonsSecondaryNav;
