import { PHONE_MAX_PX } from './breakpoints';

type Media = Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;

/** The media query for a window as narrow as a phone, or null where the browser has none. */
export function phoneMedia(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(`(width < ${PHONE_MAX_PX}px)`) : null;
}

/** Reports every later change: the window became, or no longer is, as narrow as a phone. */
export function watchPhone(media: Media, changed: () => void): () => void {
  media.addEventListener('change', changed);
  return () => media.removeEventListener('change', changed);
}
