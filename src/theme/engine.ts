import { Hct, SchemeMonochrome, SchemeNeutral, SchemeTonalSpot, SchemeVibrant, argbFromHex, hexFromArgb } from '@material/material-color-utilities';
import { SHAPE_TOKENS } from './shapes';
import type { Mode, ModePreference, ThemeDefinition, ShownSettings } from './types';

export const COLOR_ROLES: string[] = [
  'primary', 'on-primary', 'primary-container', 'on-primary-container',
  'secondary', 'on-secondary', 'secondary-container', 'on-secondary-container',
  'tertiary', 'on-tertiary', 'tertiary-container', 'on-tertiary-container',
  'error', 'on-error', 'error-container', 'on-error-container',
  'surface', 'surface-dim', 'surface-bright',
  'surface-container-lowest', 'surface-container-low', 'surface-container',
  'surface-container-high', 'surface-container-highest',
  'on-surface', 'on-surface-variant', 'outline', 'outline-variant',
  'inverse-surface', 'inverse-on-surface', 'inverse-primary',
];

/** Roles the scheme also offers, outside the 31 that carry a surface or text colour. */
export const EXTRA_ROLES: string[] = ['scrim', 'shadow'];

const toCamelCase = (role: string): string => role.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export function isValidSeed(text: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(text);
}

/** With the sun is decided by the page from the weather; what reaches here without it follows the system. */
export function resolveMode(preference: ModePreference, systemPrefersDark: boolean): Mode {
  if (preference === 'auto' || preference === 'sun') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/** How much colour the roles get from the seed: from none to a lot. */
export type SchemeName = 'monochrome' | 'neutral' | 'tonalSpot' | 'vibrant';
const SCHEMES = { monochrome: SchemeMonochrome, neutral: SchemeNeutral, tonalSpot: SchemeTonalSpot, vibrant: SchemeVibrant } as const;

export function colorTokens(seed: string, mode: Mode, contrast: number, schemeName: SchemeName = 'tonalSpot'): Record<string, string> {
  const scheme = new SCHEMES[schemeName](Hct.fromInt(argbFromHex(seed)), mode === 'dark', contrast);
  const tokens: Record<string, string> = {};
  for (const role of [...COLOR_ROLES, ...EXTRA_ROLES]) {
    const argb = (scheme as unknown as Record<string, number>)[toCamelCase(role)]!;
    tokens[`--c-${role}`] = hexFromArgb(argb).toLowerCase();
  }
  return tokens;
}

const withDashes = (values: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(values).map(([name, value]) => [`--${name}`, value]));

/** Every CSS custom property of the theme: colour roles, the four shapes, then layer 2, density and layer 3. */
export function computeTokens(definition: ThemeDefinition, settings: ShownSettings, systemPrefersDark: boolean): Record<string, string> {
  const seed = isValidSeed(settings.seed) ? settings.seed : definition.color.defaultSeed;
  const mode = resolveMode(settings.mode, systemPrefersDark);
  return {
    ...colorTokens(seed, mode, definition.color.contrast),
    ...SHAPE_TOKENS,
    ...withDashes(definition.system),
    ...withDashes(definition.density[settings.density]),
    ...withDashes(definition.components),
  };
}

/** The colour roles that always stay the dashboard's: danger, faults and no connection read the same everywhere. */
const DASHBOARD_ROLES = new Set(['--c-error', '--c-on-error', '--c-error-container', '--c-on-error-container']);

/**
 * The colour roles of a seed (without the error roles, which stay the dashboard's) and layer 3 again, for one
 * section: a CSS variable resolves where it is declared, so layer 3 must be declared on the section to follow its roles.
 */
export function sectionTokens(definition: ThemeDefinition, seed: string, mode: Mode): Record<string, string> {
  const roles = Object.entries(colorTokens(seed, mode, definition.color.contrast)).filter(([name]) => !DASHBOARD_ROLES.has(name));
  return { ...Object.fromEntries(roles), ...withDashes(definition.components) };
}

export function applyTokens(target: { style: { setProperty(name: string, value: string): void } }, tokens: Record<string, string>): void {
  for (const [name, value] of Object.entries(tokens)) target.style.setProperty(name, value);
}
