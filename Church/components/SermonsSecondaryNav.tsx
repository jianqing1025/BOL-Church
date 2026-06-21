import React from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { navigateTo as navigateToRoute } from '../utils/routes';

export type SermonsNavKey = 'sunday-worship' | 'daily-manna' | 'recent-sermons' | 'live-stream';

interface SermonsSecondaryNavProps {
  active: SermonsNavKey;
}

const NAV_ITEMS: { key: SermonsNavKey; textKey: string; href: string }[] = [
  { key: 'sunday-worship', textKey: 'sermonsPage.navSundayWorship', href: '/sermons/sunday-worship' },
  { key: 'daily-manna', textKey: 'sermonsPage.navDailyManna', href: '/sermons/daily-manna' },
  { key: 'recent-sermons', textKey: 'sermonsPage.navRecentSermons', href: '/sermons/recent-sermons' },
  { key: 'live-stream', textKey: 'sermonsPage.navLiveStream', href: '/live' },
];

const SermonsSecondaryNav: React.FC<SermonsSecondaryNavProps> = ({ active }) => {
  const { t } = useLocalization();

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    event.preventDefault();
    navigateToRoute(path);
  };

  return (
    <div className="sticky top-[88px] bg-gray-800 text-white z-40 shadow-md">
      <nav className="container mx-auto px-6">
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
      </nav>
    </div>
  );
};

export default SermonsSecondaryNav;
