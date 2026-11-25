import { applyTokens, isValidSeed, resolveMode } from '../theme/engine';
import { BUILT_IN } from '../theme/look';
import { SECTION_NAMES, computeLook, sectionLook, styleOf, type Style } from '../theme/styles';
import type { Mode, ShownSettings } from '../theme/types';

/** Rustig as a style: what the dashboard shows when nothing else is chosen. */
export const RUSTIG_STYLE: Style = styleOf(BUILT_IN[0]!);

/**
 * Puts the theme on an element (normally the document root): every token as a CSS variable through the
 * CSSOM, which the content security policy allows, plus the resolved mode, the density and the style as attributes.
 */
export function applyThemeTo(root: HTMLElement, settings: ShownSettings, systemPrefersDark: boolean, style: Style = RUSTIG_STYLE): void {
  const tokens = computeLook(style, settings, systemPrefersDark);
  applyTokens(root, tokens);
  // the bar around the page on a phone
  if (root === root.ownerDocument.documentElement) root.ownerDocument.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens['--c-surface-container'] ?? '');
  root.dataset['mode'] = resolveMode(settings.mode, systemPrefersDark);
  root.dataset['density'] = settings.density;
  root.dataset['look'] = style.base;
}

/**
 * Puts a section's own palette on its element, or removes it again when the seed is null or no colour.
 * The element is marked with `data-own-seed`, so styles can tell a section with its own colour.
 */
export function applySectionTheme(target: HTMLElement, seed: string | null, mode: Mode, style: Style = RUSTIG_STYLE): void {
  if (seed === null || !isValidSeed(seed)) {
    for (const name of SECTION_NAMES) target.style.removeProperty(name);
    target.removeAttribute('data-own-seed');
    return;
  }
  applyTokens(target, sectionLook(style, seed, mode));
  target.setAttribute('data-own-seed', seed);
}
