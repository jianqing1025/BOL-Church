import React from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { navigateTo as navigateToRoute } from '../utils/routes';
import SecondaryNavBar from './SecondaryNavBar';

/** Shared 二級導航 for the ministry (教會事工) section, including 線上查經. */
const NAV_ITEMS: { key: string; href: string; textKey: string }[] = [
  { key: 'kids', href: '/events/kids', textKey: 'eventsPage.navKids' },
  { key: 'men', href: '/events/men', textKey: 'eventsPage.navMen' },
  { key: 'women', href: '/events/women', textKey: 'eventsPage.navWomen' },
  { key: 'joint', href: '/events/joint', textKey: 'eventsPage.navJoint' },
  { key: 'alpha', href: '/events/alpha', textKey: 'eventsPage.navAlpha' },
  { key: 'prayer', href: '/events/prayer', textKey: 'eventsPage.navPrayer' },
  { key: 'online-bible-study', href: '/meeting', textKey: 'eventsPage.navOnlineBibleStudy' },
];

const MinistrySecondaryNav: React.FC<{ active: string }> = ({ active }) => {
  const { t } = useLocalization();
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    navigateToRoute(href);
  };

  return (
    <SecondaryNavBar>
      <nav className="container mx-auto px-6">
        <ul className="flex justify-center items-center -mb-px space-x-4 sm:space-x-8 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <li key={item.key}>
              <a
                href={item.href}
                onClick={(event) => handleClick(event, item.href)}
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
    </SecondaryNavBar>
  );
};

export default MinistrySecondaryNav;
