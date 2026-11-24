type DarkMedia = Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;

/** Reports every later change of the system's light or dark preference; the returned function stops it. */
export function watchSystemDark(media: DarkMedia, onChange: (dark: boolean) => void): () => void {
  const listener = (event: { matches: boolean }): void => onChange(event.matches);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

/** The media query for the system's dark preference, or null where the browser has none. */
export function darkMedia(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
}
