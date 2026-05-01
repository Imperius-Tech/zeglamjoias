import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';
const TABLET_QUERY = '(max-width: 1023px)';

function matches(query: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => matches(MOBILE_QUERY));
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(() => matches(TABLET_QUERY));
  useEffect(() => {
    const mql = window.matchMedia(TABLET_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsTablet(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isTablet;
}
