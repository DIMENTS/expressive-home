import { applyTokens, computeTokens, isValidSeed, resolveMode, sectionTokens } from '../theme/engine';
import { rustigExpressive } from '../theme/rustig-expressive';
import type { Mode, ShownSettings } from '../theme/types';

/**
 * Puts the theme on an element (normally the document root): every token as a CSS variable through the
 * CSSOM, which the content security policy allows, plus the resolved mode and the density as attributes.
 */
export function applyThemeTo(root: HTMLElement, settings: ShownSettings, systemPrefersDark: boolean): void {
  const tokens = computeTokens(rustigExpressive, settings, systemPrefersDark);
  applyTokens(root, tokens);
  // the bar around the page on a phone
  if (root === root.ownerDocument.documentElement) root.ownerDocument.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens['--c-surface-container'] ?? '');
  root.dataset['mode'] = resolveMode(settings.mode, systemPrefersDark);
  root.dataset['density'] = settings.density;
}

/** The names a section palette sets; the same for every seed. */
const SECTION_NAMES = Object.keys(sectionTokens(rustigExpressive, rustigExpressive.color.defaultSeed, 'light'));

/**
 * Puts a section's own palette on its element, or removes it again when the seed is null or no colour.
 * The element is marked with `data-own-seed`, so styles can tell a section with its own colour.
 */
export function applySectionTheme(target: HTMLElement, seed: string | null, mode: Mode): void {
  if (seed === null || !isValidSeed(seed)) {
    for (const name of SECTION_NAMES) target.style.removeProperty(name);
    target.removeAttribute('data-own-seed');
    return;
  }
  applyTokens(target, sectionTokens(rustigExpressive, seed, mode));
  target.setAttribute('data-own-seed', seed);
}
