import { applyTokens } from '../theme/engine';
import { computeLook } from '../theme/styles';
import type { ShownSettings } from '../theme/types';
import { RUSTIG_STYLE } from './apply-theme';

/**
 * Rustig's values on one element and all within it: the danger question, the pairing screen and the theme panel
 * always look and work the same, whatever theme the page shows. Same colour and light or dark as the page.
 */
export function safeLook(host: HTMLElement, settings: ShownSettings, systemPrefersDark: boolean): void {
  applyTokens(host, computeLook(RUSTIG_STYLE, settings, systemPrefersDark));
}

/** `#veilig` (or `#safe`) after the address: this time the dashboard opens in Rustig, so a theme can be changed back. */
export function isSafeAddress(hash: string): boolean {
  return /^#(veilig|safe)$/i.test(hash);
}
