
import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import About from './components/About';
import Events from './components/Events';
import Sermons from './components/Sermons';
import Contact from './components/Contact';
import Footer from './components/Footer';
import Support from './components/Support';
import SermonDetailPage from './components/SermonDetailPage';
import AboutPage from './components/AboutPage';
import EventsPage from './components/EventsPage';
import SermonsPage from './components/SermonsPage';
import LiveStreamPage from './components/LiveStreamPage';
import GivingPage from './components/GivingPage';
import ContactPage from './components/ContactPage';
import AdminDashboard from './components/AdminDashboard';
import PrayerRequestPage from './components/PrayerRequestPage';
import PhotosPage from './components/photos/PhotosPage';
import MeetingPage from './components/meeting/MeetingPage';
import { ChurchDialogHost } from './components/ChurchDialog';
import { SubPage, MinistrySubPage, SermonSubPage, GivingSubPage, ContactSubPage, PrayerRequestSubPage } from './types';
import { APP_NAVIGATION_EVENT, currentRoute, redirectLegacyHashRoute } from './utils/routes';

const HomePage = () => (
  <>
    <Hero />
    <About />
    <Events />
    <Sermons />
    <Support />
    <Contact />
  </>
);

function App() {
  const [route, setRoute] = useState(currentRoute());
  // When the photo album gate is showing, render the header in homepage style
  // (transparent, floating over the full-bleed blurred hero) so header + hero
  // read as one piece. The unlocked gallery keeps its hero-background header.
  const [photoGateActive, setPhotoGateActive] = useState(false);
  // Which meeting stage is active (null when not on /meeting). Drives whether the
  // church header/footer are shown around the meeting page.
  const [meetingStage, setMeetingStage] = useState<'auth' | 'pick' | 'room' | null>(null);

  useEffect(() => {
    const handleRouteChange = () => {
      redirectLegacyHashRoute();
      setRoute(currentRoute());
    };

    handleRouteChange();
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener(APP_NAVIGATION_EVENT, handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener(APP_NAVIGATION_EVENT, handleRouteChange);
    };
  }, []);

  useEffect(() => {
    if (!window.location.hash || window.location.hash.startsWith('#/')) {
      window.scrollTo(0, 0);
    } else {
      const id = window.location.hash.substring(1);
      if (id) {
        const element = document.getElementById(id);
        if (element) {
          const header = document.querySelector('header');
          const headerHeight = header ? header.offsetHeight : 100;
          document.documentElement.style.scrollPaddingTop = `${headerHeight}px`;
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setTimeout(() => {
            document.documentElement.style.scrollPaddingTop = '';
          }, 1000);
        }
      }
    }
  }, [route]);

  if (route.startsWith('/admin')) {
      return (
        <>
          <AdminDashboard />
          <ChurchDialogHost />
        </>
      );
  }

  const renderPage = () => {
    // 主日直播獨立路由
    if (route === '/live' || route === '/live/' || route.startsWith('/live/')) {
      return <LiveStreamPage />;
    }
    // 舊鏈接 /sermons/live-stream → 自動 redirect 到 /live（URL 同步更新，不刷新）
    if (route === '/sermons/live-stream' || route.startsWith('/sermons/live-stream/')) {
      if (typeof window !== 'undefined' && window.location.pathname !== '/live') {
        window.history.replaceState(null, '', '/live');
      }
      return <LiveStreamPage />;
    }
    if (route.startsWith('/sermons/')) {
      const parts = route.split('/');
      const segment = (parts[2] || 'sunday-worship').split('?')[0];

      const validSubPages: ReadonlyArray<SermonSubPage> = ['daily-manna', 'sunday-worship', 'worship-praise', 'healing-prayer', 'testimony'];

      // If the segment is NOT one of the known sub-pages, treat it as a Sermon ID
      if (segment && !validSubPages.includes(segment as any)) {
        return <SermonDetailPage sermonId={segment} />;
      }

      const subPage = (validSubPages.find(p => p === segment) ?? 'sunday-worship') as SermonSubPage;
      return <SermonsPage activeSubPage={subPage} />;
    }
    if (route.startsWith('/events/')) {
      const subPageSegment = route.split('/')[2] || 'kids';
      const validSubPages: ReadonlyArray<MinistrySubPage> = ['kids', 'men', 'women', 'joint', 'alpha', 'prayer'];
      const subPage = validSubPages.find(p => p === subPageSegment) ?? 'kids';
      return <EventsPage activeSubPage={subPage} />;
    }
    if (route.startsWith('/giving/')) {
      const subPageSegment = route.split('/')[2] || 'why-we-give';
      const validSubPages: ReadonlyArray<GivingSubPage> = ['why-we-give', 'what-is-tithing', 'ways-to-give', 'other-ways-to-give'];
      const subPage = validSubPages.find(p => p === subPageSegment) ?? 'why-we-give';
      return <GivingPage activeSubPage={subPage} />;
    }
    if (route.startsWith('/contact/')) {
      const subPageSegment = route.split('/')[2] || 'contact-us';
      const validSubPages: ReadonlyArray<ContactSubPage> = ['contact-us', 'join-us', 'prayer-request'];
      const subPage = validSubPages.find(p => p === subPageSegment) ?? 'contact-us';
      return <ContactPage activeSubPage={subPage} />;
    }
    if (route.startsWith('/prayer-request/')) {
        const subPageSegment = route.split('/')[2] || 'submit-request';
        const subPage = 'submit-request' as PrayerRequestSubPage;
        return <PrayerRequestPage activeSubPage={subPage} />;
    }
    if (route === '/photos' || route === '/photos/') {
      return <PhotosPage onGateChange={setPhotoGateActive} />;
    }
    if (route.startsWith('/about/')) {
      const subPageSegment = route.split('/')[2] || 'our-church';
      const validSubPages: ReadonlyArray<SubPage> = ['our-church', 'our-beliefs', 'about-pastor', 'job-opportunities', 'ministry-leaders', 'becoming-a-member'];
      const subPage = validSubPages.find(p => p === subPageSegment) ?? 'our-church';
      return <AboutPage activeSubPage={subPage} />;
    }
    if (route === '/meeting' || route === '/meeting/' || route.startsWith('/meeting/')) {
      return <MeetingPage onStageChange={setMeetingStage} />;
    }
    return <HomePage />;
  };

  const isPhotosPage = route.startsWith('/photos');
  const isMeetingPage = route === '/meeting' || route === '/meeting/' || route.startsWith('/meeting/');
  const isHomePage = !route.startsWith('/sermons') && !route.startsWith('/about') && !route.startsWith('/events') && !route.startsWith('/giving') && !route.startsWith('/contact') && !route.startsWith('/prayer-request') && !isMeetingPage && !isPhotosPage;

  // The in-room view is full-screen (rendered as its own fixed overlay), so the
  // church header/footer are hidden for it. Auth + room-picker keep the chrome.
  const meetingRoomActive = isMeetingPage && meetingStage === 'room';
  const meetingAuthActive = isMeetingPage && meetingStage === 'auth';

  return (
    <div className="bg-white text-gray-800 antialiased min-h-screen flex flex-col">
      {!meetingRoomActive && (
        <Header isTransparent={isHomePage || (isPhotosPage && photoGateActive) || meetingAuthActive} useHeroBackground={isPhotosPage && !photoGateActive} isPhotosPage={isPhotosPage} photoGateActive={photoGateActive} />
      )}
      <main className="flex-grow">
        {renderPage()}
      </main>
      {!meetingRoomActive && <Footer />}
      <ChurchDialogHost />
    </div>
  );
}

export default App;
