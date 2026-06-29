export const APP_NAVIGATION_EVENT = 'app:navigation';

export function cleanPath(href: string): string {
  if (href.startsWith('#/')) {
    return href.slice(1) || '/';
  }

  return href || '/';
}

export function currentRoute(): string {
  // Route matching is path-based. Query strings (e.g. the slideshow popup's
  // ?photoSlideshowWindow=1&photoSlideshowToken=… params) must NOT be part of the
  // route, otherwise exact matches like `route === '/photos'` fail and the page
  // falls through to the default layout. Components read window.location.search directly.
  return window.location.pathname || '/';
}

export function redirectLegacyHashRoute(): boolean {
  if (!window.location.hash.startsWith('#/')) {
    return false;
  }

  const path = cleanPath(window.location.hash);
  window.history.replaceState(null, '', path);
  window.dispatchEvent(new Event(APP_NAVIGATION_EVENT));
  return true;
}

export function navigateTo(href: string, replace = false): void {
  const path = cleanPath(href);
  const currentPath = currentRoute();

  if (path !== currentPath) {
    if (replace) {
      window.history.replaceState(null, '', path);
    } else {
      window.history.pushState(null, '', path);
    }
  }

  window.dispatchEvent(new Event(APP_NAVIGATION_EVENT));
}
