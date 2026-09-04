import { useEffect, useState } from 'react';

export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl';

const BREAKPOINTS: Record<Breakpoint, number> = {
  sm: 640,
  md: 820,
  lg: 1024,
  xl: 1280,
};

function matches(breakpoint: Breakpoint): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= BREAKPOINTS[breakpoint];
}

/** Reactive breakpoint hook for responsive layouts. */
export function useMediaQuery(breakpoint: Breakpoint): boolean {
  const [hits, setHits] = useState(() => matches(breakpoint));
  useEffect(() => {
    const onChange = () => setHits(matches(breakpoint));
    window.addEventListener('resize', onChange);
    onChange();
    return () => window.removeEventListener('resize', onChange);
  }, [breakpoint]);
  return hits;
}

/** True on phones/tablets (< md). Used to switch to the mobile drawer nav. */
export function useIsMobile(): boolean {
  return !useMediaQuery('md');
}

/** Structured grid constants honoured across the app. */
export const grid = {
  cols: {
    sm: 'repeat(auto-fit, minmax(200px, 1fr))',
    cards: 'repeat(auto-fill, minmax(240px, 1fr))',
    detail: 'minmax(0, 1fr) 320px',
  },
};
