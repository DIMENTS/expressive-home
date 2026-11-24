import { applyTokens, computeTokens, COLOR_ROLES } from '../theme/engine';
import { rustigExpressive } from '../theme/rustig-expressive';
import { darkMedia, watchSystemDark } from '../theme/system-mode';
import type { ThemeSettings } from '../theme/types';

let current: { settings: ThemeSettings; roles: HTMLElement } | null = null;
let watching = false;

/** Applies the theme to the document and redraws the colour role boxes; "automatisch" follows later system changes. */
export function applyTheme(settings: ThemeSettings, roles: HTMLElement): void {
  current = { settings, roles };
  const media = darkMedia();
  if (media && !watching) {
    watching = true;
    watchSystemDark(media, () => { if (current?.settings.mode === 'auto') draw(current.settings, current.roles, media.matches); });
  }
  draw(settings, roles, media?.matches ?? false);
}

function draw(settings: ThemeSettings, roles: HTMLElement, dark: boolean): void {
  const tokens = computeTokens(rustigExpressive, settings, dark);
  applyTokens(document.documentElement, tokens);
  roles.replaceChildren();
  for (const role of COLOR_ROLES) {
    const cell = document.createElement('div');
    cell.style.display = 'inline-block';
    cell.style.margin = '4px';
    cell.style.width = '9em';
    const swatch = document.createElement('div');
    swatch.style.height = '2.5em';
    swatch.style.background = `var(--c-${role})`;
    swatch.style.border = '1px solid gray';
    const label = document.createElement('div');
    label.style.fontSize = '11px';
    label.textContent = `${role} ${tokens[`--c-${role}`]}`;
    cell.append(swatch, label);
    roles.append(cell);
  }
}
