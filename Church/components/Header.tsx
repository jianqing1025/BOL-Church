
import React, { useState, useEffect, useRef } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { Language } from '../types';
import { navigateTo as navigateToRoute } from '../utils/routes';
import { MenuIcon, CloseIcon, LogoIcon } from './icons/Icons';

interface HeaderProps {
  isTransparent: boolean;
}

type NavSubLink =
  | { href: string; key: string; label?: never }
  | { href: string; label: { en: string; zh: string }; key?: never };

type NavLink =
  | { href: string; key: string; subLinks?: never }
  | { key: string; subLinks: NavSubLink[]; href?: never };

const useHeaderStyle = () => {
    const { isTransparent } = React.useContext(HeaderContext);
    const [isScrolled, setIsScrolled] = useState(!isTransparent);

    useEffect(() => {
        if (!isTransparent) {
            setIsScrolled(true);
            return;
        }
        const handleScroll = () => setIsScrolled(window.scrollY > 50);
        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener('scroll', handleScroll);
    }, [isTransparent]);

    return {
        isScrolled,
        headerClasses: isScrolled
            ? 'bg-white/80 backdrop-blur-md sticky top-0 z-50 shadow-sm transition-all duration-300'
            : 'bg-transparent absolute top-5 z-50 w-full transition-all duration-300',
        logoClasses: isScrolled ? 'text-gray-800 hover:text-blue-600' : 'text-white hover:text-gray-200',
        navLinkClasses: isScrolled ? 'text-gray-600 hover:text-blue-600' : 'text-white hover:text-gray-200',
        mobileIconColor: isScrolled ? 'text-gray-800' : 'text-white',
    };
}

const HeaderContext = React.createContext<{ isTransparent: boolean }>({ isTransparent: true });


const Header: React.FC<HeaderProps> = ({ isTransparent }) => {
  const { language, toggleLanguage, t } = useLocalization();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  
  const navLinks: NavLink[] = [
    { key: 'header.navHome', subLinks: [
        { href: 'https://new.bolccop.org', label: { en: 'New Homepage', zh: '新版首頁' } },
        { href: 'https://classic.bolccop.org', label: { en: 'Classic Homepage', zh: '舊版首頁' } },
    ]},
    { key: 'header.navAbout', subLinks: [
        { href: '/about/our-church', key: 'aboutPage.navOurChurch' },
        { href: '/about/our-beliefs', key: 'aboutPage.navOurBeliefs' },
        { href: '/about/job-opportunities', key: 'aboutPage.navJobOpportunities' },
        { href: '/about/ministry-leaders', key: 'aboutPage.navMinistryLeaders' },
        { href: '/about/becoming-a-member', key: 'aboutPage.navBecomingAMember' },
    ]},
    { key: 'header.navEvents', subLinks: [
        { href: '/events/kids', key: 'eventsPage.navKids' },
        { href: '/events/men', key: 'eventsPage.navMen' },
        { href: '/events/women', key: 'eventsPage.navWomen' },
        { href: '/events/joint', key: 'eventsPage.navJoint' },
        { href: '/events/alpha', key: 'eventsPage.navAlpha' },
        { href: '/events/prayer', key: 'eventsPage.navPrayer' },
    ]},
    { key: 'header.navSermons', subLinks: [
        { href: '/sermons/sunday-worship', key: 'sermonsPage.navSundayWorship' },
        { href: '/sermons/daily-manna', key: 'sermonsPage.navDailyManna' },
        { href: '/sermons/recent-sermons', key: 'sermonsPage.navRecentSermons' },
        { href: '/sermons/live-stream', key: 'sermonsPage.navLiveStream' },
    ]},
    { key: 'header.navGiving', subLinks: [
        { href: '/giving/why-we-give', key: 'givingPage.navWhyWeGive' },
        { href: '/giving/what-is-tithing', key: 'givingPage.navWhatIsTithing' },
        { href: '/giving/ways-to-give', key: 'givingPage.navWaysToGive' },
        { href: '/giving/other-ways-to-give', key: 'givingPage.navOtherWaysToGive' },
    ]},
    { key: 'header.navContact', subLinks: [
        { href: '/contact/contact-us', key: 'header.navContact' },
        { href: '/contact/join-us', key: 'contactPage.navJoinUs' },
        { href: '/contact/prayer-request', key: 'contactPage.navPrayerRequest' },
    ]},
  ];

  const handleLinkClick = () => {
    setActiveDropdown(null);
    setIsMenuOpen(false);
  };

  const navigateTo = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('http')) {
      handleLinkClick();
      return;
    }

    event.preventDefault();
    handleLinkClick();

    navigateToRoute(href);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const { headerClasses, logoClasses, navLinkClasses, mobileIconColor } = useHeaderStyle();

  return (
    <HeaderContext.Provider value={{ isTransparent }}>
      <header className={headerClasses} ref={headerRef}>
        <div className="container mx-auto px-4 py-3 md:px-6 md:py-4 flex justify-between items-center">
          <a href="/" onClick={event => navigateTo(event, '/')} className={`flex min-w-0 items-center gap-2 md:gap-3 transition-colors ${logoClasses}`}>
            <LogoIcon className="h-7 w-7 flex-shrink-0 sm:h-8 sm:w-8 md:h-9 md:w-9" />
            <span className="max-w-[13rem] truncate text-xl font-bold leading-none sm:max-w-none sm:text-2xl md:text-3xl">{t('header.logo')}</span>
          </a>
          <nav className="hidden md:flex items-center space-x-5 lg:space-x-6">
            {navLinks.map(link => (
              'subLinks' in link ? (
                <div
                  key={link.key}
                  className="relative"
                  onMouseEnter={() => setActiveDropdown(link.key)}
                  onMouseLeave={() => setActiveDropdown(null)}
                >
                   <a
                    href={link.subLinks[0].href}
                    onClick={event => navigateTo(event, link.subLinks[0].href)}
                    onFocus={() => setActiveDropdown(link.key)}
                    className={`transition-colors text-lg font-bold ${navLinkClasses} cursor-pointer py-2`}
                    aria-haspopup="true"
                    aria-expanded={activeDropdown === link.key}
                   >
                    {t(link.key)}
                  </a>
                  {activeDropdown === link.key && (
                    <div className="absolute left-0 top-full z-10 w-56 pt-2">
                      <div className="rounded-xl border border-white/30 bg-white/80 p-2 shadow-lg backdrop-blur-lg">
                        {link.subLinks.map(subLink => (
                           <a key={subLink.key ?? subLink.href} href={subLink.href} onClick={event => navigateTo(event, subLink.href)} className="block px-4 py-2 text-gray-900 hover:bg-white/50 rounded-lg whitespace-nowrap transition-colors duration-200">
                            {'key' in subLink ? t(subLink.key) : (language === Language.EN ? subLink.label.en : subLink.label.zh)}
                           </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <a key={link.key} href={link.href!} onClick={handleLinkClick} className={`transition-colors text-lg font-bold ${navLinkClasses}`}>
                  {t(link.key)}
                </a>
              )
            ))}
          </nav>
          <div className="hidden md:flex items-center space-x-4">
            <button onClick={toggleLanguage} className={`text-base font-semibold transition-colors w-20 text-center ${navLinkClasses}`}>
              {language === Language.EN ? '中文' : 'English'}
            </button>
            <a href="/contact/join-us" onClick={event => navigateTo(event, '/contact/join-us')} className="bg-blue-600 text-white px-5 py-2 rounded-full hover:bg-blue-700 transition-all text-base font-semibold">
              {t('header.newHere')}
            </a>
          </div>
          <div className={`md:hidden ${mobileIconColor}`}>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Toggle menu">
              {isMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
        
        {isMenuOpen && (
          <div className="md:hidden absolute right-3 top-full mt-2 w-[min(50vw,20rem)] max-h-[calc(100vh-84px)] overflow-y-auto rounded-3xl border border-white/35 bg-white/55 shadow-2xl shadow-black/15 backdrop-blur-2xl">
            <nav className="flex flex-col items-center space-y-2 p-4">
              {navLinks.map(link => (
                'href' in link ? (
                    <a key={link.key} href={link.href} onClick={event => navigateTo(event, link.href)} className="text-gray-600 hover:text-blue-600 transition-colors py-2 text-base sm:text-lg font-semibold">
                        {t(link.key)}
                    </a>
                ) : (
                    <div key={link.key} className="flex flex-col items-center gap-2">
                      <a href={link.subLinks[0].href} onClick={event => navigateTo(event, link.subLinks[0].href)} className="text-gray-600 hover:text-blue-600 transition-colors py-2 text-base sm:text-lg font-semibold">
                          {t(link.key)}
                      </a>
                    </div>
                )
              ))}
              <button onClick={() => { toggleLanguage(); handleLinkClick(); }} className="text-base font-semibold text-gray-600 hover:text-blue-600 transition-colors py-2 mt-1">
                {language === Language.EN ? '中文' : 'English'}
              </button>
              <a href="/contact/join-us" onClick={event => navigateTo(event, '/contact/join-us')} className="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 transition-all text-base font-semibold mt-3">
                {t('header.newHere')}
              </a>
            </nav>
          </div>
        )}
      </header>
    </HeaderContext.Provider>
  );
};

export default Header;
