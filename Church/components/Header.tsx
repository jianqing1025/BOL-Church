
import React, { useState, useEffect, useRef } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { useAdmin } from '../hooks/useAdmin';
import { Language } from '../types';
import { navigateTo as navigateToRoute } from '../utils/routes';
import { MenuIcon, CloseIcon, LogoIcon } from './icons/Icons';
import { buildMediaSlots } from '../media';
import { SLIDESHOW_MODES } from './photos/PhotoToolbar';
import type { SlideshowMode } from './photos/types';

interface HeaderProps {
  isTransparent: boolean;
  useHeroBackground?: boolean;
  isPhotosPage?: boolean;
  photoGateActive?: boolean;
}

type NavSubLink =
  | { href: string; key: string; label?: never }
  | { href: string; label: { en: string; zh: string }; key?: never };

type NavLink =
  | { href: string; key: string; subLinks?: never }
  | { key: string; subLinks: NavSubLink[]; href?: never };

const useHeaderStyle = (isTransparent: boolean, useHeroBackground: boolean) => {
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

    if (useHeroBackground) {
      return {
        isScrolled: true,
        headerClasses: 'sticky top-0 z-50 bg-gray-900 bg-cover bg-center shadow-sm transition-all duration-300',
        logoClasses: 'text-white hover:text-gray-200 drop-shadow',
        navLinkClasses: 'text-white hover:text-gray-200 drop-shadow',
        mobileIconColor: 'text-white',
      };
    }

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

const Header: React.FC<HeaderProps> = ({ isTransparent, useHeroBackground = false, isPhotosPage = false, photoGateActive = false }) => {
  const { language, toggleLanguage, t } = useLocalization();
  const { images } = useAdmin();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [photoSlideshowOpen, setPhotoSlideshowOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const heroSlides = buildMediaSlots('hero', images);
  const headerBackgroundUrl = heroSlides[0] ? (images[heroSlides[0].key] || heroSlides[0].placeholder) : undefined;
  
  const navLinks: NavLink[] = [
    { key: 'header.navHome', subLinks: [
        { href: 'https://www.bolccop.org', label: { en: 'New Homepage', zh: '新版首頁' } },
        { href: 'https://classic.bolccop.org', label: { en: 'Classic Homepage', zh: '舊版首頁' } },
    ]},
    { key: 'header.navAbout', subLinks: [
        { href: '/about/our-church', key: 'aboutPage.navOurChurch' },
        { href: '/about/our-beliefs', key: 'aboutPage.navOurBeliefs' },
        { href: '/about/about-pastor', key: 'aboutPage.navAboutPastor' },
        { href: '/about/job-opportunities', key: 'aboutPage.navJobOpportunities' },
        { href: '/about/ministry-leaders', key: 'aboutPage.navMinistryLeaders' },
        { href: '/about/becoming-a-member', key: 'aboutPage.navBecomingAMember' },
        { href: '/photos', key: 'photosPage.navChurchPhotos' },
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
        { href: '/sermons/worship-praise', key: 'sermonsPage.navWorshipPraise' },
        { href: '/sermons/healing-prayer', key: 'sermonsPage.navHealingPrayer' },
        { href: '/sermons/testimony', key: 'sermonsPage.navTestimony' },
        { href: '/sermons/daily-manna', key: 'sermonsPage.navDailyManna' },
        { href: '/live', key: 'sermonsPage.navLiveStream' },
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
        setPhotoSlideshowOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateHeaderHeight = () => {
      document.documentElement.style.setProperty('--site-header-height', `${header.offsetHeight}px`);
    };

    updateHeaderHeight();
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateHeaderHeight) : null;
    resizeObserver?.observe(header);
    window.addEventListener('resize', updateHeaderHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  const { headerClasses, logoClasses, navLinkClasses, mobileIconColor } = useHeaderStyle(isTransparent, useHeroBackground);
  const uploadLabel = t('photosPage.uploadPhotos');
  const churchTitle = language === Language.EN ? t('header.logo') : '\u4fe1\u671b\u611b\u9748\u7ce7\u5802';
  const openPhotoUpload = () => {
    if (photoGateActive) return;
    window.dispatchEvent(new CustomEvent('bolccop:open-photo-upload'));
  };
  const startPhotoSlideshow = (mode: SlideshowMode) => {
    if (photoGateActive) return;
    setPhotoSlideshowOpen(false);
    window.dispatchEvent(new CustomEvent<SlideshowMode>('bolccop:start-photo-slideshow', { detail: mode }));
  };

  return (
      <header
        className={headerClasses}
        ref={headerRef}
        style={useHeroBackground && headerBackgroundUrl ? { backgroundImage: `url(${headerBackgroundUrl})` } : undefined}
      >
        {useHeroBackground && <div className="absolute inset-0 bg-black/50" aria-hidden="true" />}
        {isPhotosPage ? (
        <div className="relative z-10 flex w-full items-center justify-between gap-4 px-4 py-3 md:px-6 md:py-4">
          <a href="/" onClick={event => navigateTo(event, '/')} className={`flex min-w-0 items-center gap-2 md:gap-3 transition-colors ${logoClasses}`}>
            <LogoIcon className="h-7 w-7 flex-shrink-0 sm:h-8 sm:w-8 md:h-9 md:w-9" />
            <span className="truncate text-xl font-bold leading-none sm:text-2xl md:text-3xl">{churchTitle}</span>
          </a>
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center space-x-5 md:flex lg:space-x-6">
            {navLinks.map(link => (
              'subLinks' in link ? (
                <div
                  key={link.key}
                  className={`relative ${link.key === 'header.navGiving' || link.key === 'header.navContact' ? 'hidden xl:block' : ''}`}
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
                <a key={link.key} href={link.href!} onClick={handleLinkClick} className={`transition-colors text-lg font-bold ${navLinkClasses} ${link.key === 'header.navGiving' || link.key === 'header.navContact' ? 'hidden xl:inline' : ''}`}>
                  {t(link.key)}
                </a>
              )
            ))}
          </nav>
          <div className="ml-auto hidden flex-shrink-0 items-center gap-3 md:flex">
            <button onClick={toggleLanguage} className={`hidden text-base font-semibold transition-colors xl:inline ${navLinkClasses}`}>
              {language === Language.EN ? '\u4e2d\u6587' : 'English'}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => !photoGateActive && setPhotoSlideshowOpen((open) => !open)}
                disabled={photoGateActive}
                className={`rounded-full px-5 py-2 text-base font-semibold text-white transition-all ${photoGateActive ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                Slideshow
              </button>
              {photoSlideshowOpen && !photoGateActive && (
                <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-gray-100 bg-white py-1 shadow-xl">
                  {SLIDESHOW_MODES.map(({ id, label, Icon }) => (
                    <button key={id} type="button" onClick={() => startPhotoSlideshow(id)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                      <Icon size={14} /> {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={openPhotoUpload}
              disabled={photoGateActive}
              className={`rounded-full px-5 py-2 text-base font-semibold transition-all ${photoGateActive ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              {uploadLabel}
            </button>
          </div>
          <div className={`flex items-center gap-2 md:hidden ${mobileIconColor}`}>
            <button
              type="button"
              onClick={openPhotoUpload}
              disabled={photoGateActive}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold shadow-sm transition-all ${photoGateActive ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              上传
            </button>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Toggle menu">
              {isMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
        ) : (
        <div className="container relative z-10 mx-auto px-4 py-3 md:px-6 md:py-4 flex justify-between items-center">
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
            <a href="/contact/contact-us" onClick={event => navigateTo(event, '/contact/contact-us')} className="bg-blue-600 text-white px-5 py-2 rounded-full hover:bg-blue-700 transition-all text-base font-semibold">
              {t('header.newHere')}
            </a>
          </div>
          <div className={`md:hidden ${mobileIconColor}`}>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Toggle menu">
              {isMenuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
        )}
        
        {isMenuOpen && (
          <div className="md:hidden absolute right-3 top-full z-20 mt-2 w-[min(50vw,20rem)] max-h-[calc(100vh-84px)] overflow-y-auto rounded-3xl border border-white/35 bg-white/55 shadow-2xl shadow-black/15 backdrop-blur-2xl">
            <nav className="flex flex-col items-center space-y-2 p-4">
              {navLinks.map(link => (
                link.key === 'header.navEvents' ? (
                    <React.Fragment key="mobile-photos-before-events">
                      <a href="/photos" onClick={event => navigateTo(event, '/photos')} className="text-gray-600 hover:text-blue-600 transition-colors py-2 text-base sm:text-lg font-semibold">
                        {t('photosPage.navChurchPhotos')}
                      </a>
                      <div className="flex flex-col items-center gap-2">
                        <a href={link.subLinks[0].href} onClick={event => navigateTo(event, link.subLinks[0].href)} className="text-gray-600 hover:text-blue-600 transition-colors py-2 text-base sm:text-lg font-semibold">
                            {t(link.key)}
                        </a>
                      </div>
                    </React.Fragment>
                ) : 'href' in link ? (
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
              {!isPhotosPage && (
                <a href="/contact/contact-us" onClick={event => navigateTo(event, '/contact/contact-us')} className="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 transition-all text-base font-semibold mt-3">
                  {t('header.newHere')}
                </a>
              )}
            </nav>
          </div>
        )}
      </header>
  );
};

export default Header;
