import { EXTRA_ROLES, COLOR_ROLES, colorTokens, isValidSeed, resolveMode, type SchemeName } from './engine';
import { CONTRASTS, SCHEMES, knobComponents, knobSystem } from './knobs';
import { RUSTIG_KNOBS, type Base, type Knobs, type ThemeFile } from './look';
import { rustigExpressive } from './rustig-expressive';
import { SHAPE_TOKENS } from './shapes';
import type { Mode, ShownSettings } from './types';

/** A theme worked out: its colour calculation, its knobs and what it sets in layers 2 and 3 on top of Rustig. */
export interface Style {
  base: Base;
  knobs: Knobs;
  scheme: SchemeName;
  contrast: number;
  system: Record<string, string>;
  components: Record<string, string>;
}

/** The knobs a built-in style starts with. */
const BASE_KNOBS: Record<Base, Partial<Knobs>> = {
  rustig: {},
  uitbundig: { strength: 'vivid', roundness: 'very-round' },
  glas: { surfaces: 'see-through', background: 'gradient', strength: 'vivid' },
  helder: { contrast: 'highest', surfaces: 'outlined', weight: 800, roundness: 'slight' },
};

/** A tile that is on in the strong colour of the theme, with a light slider on it. */
const STRONG_TILES = {
  'tile-on-bg': 'var(--c-primary)', 'tile-on-fg': 'var(--c-on-primary)',
  'tile-icon-on-bg': 'var(--c-on-primary)', 'tile-icon-on-fg': 'var(--c-primary)',
  'tile-on-slider-fill': 'var(--c-on-primary)', 'tile-on-slider-track': 'color-mix(in srgb, var(--c-on-primary) 30%, transparent)',
};

/** What a built-in style sets of its own in layer 3, apart from its knobs. Only names that follow colour roles. */
const BASE_COMPONENTS: Record<Base, Record<string, string>> = {
  rustig: {},
  uitbundig: {
    ...STRONG_TILES,
    'page-bg': 'color-mix(in srgb, var(--c-primary-container) 42%, var(--c-surface-container))',
    'section-hero-bg': 'var(--c-tertiary-container)', 'section-hero-fg': 'var(--c-on-tertiary-container)',
  },
  glas: {
    'tile-on-bg': 'color-mix(in srgb, var(--c-surface-bright) 92%, transparent)', 'tile-on-fg': 'var(--c-on-surface)',
    'tile-icon-on-bg': 'var(--c-primary)', 'tile-icon-on-fg': 'var(--c-on-primary)',
  },
  helder: {
    ...STRONG_TILES,
    'page-bg': 'var(--c-surface)', 'tile-bg': 'var(--c-surface)', 'tile-state-fg': 'var(--c-on-surface)',
    'section-hero-bg': 'var(--c-primary)', 'section-hero-fg': 'var(--c-on-primary)',
    'hero-wave-fg': 'var(--c-on-primary)', 'hero-wave-track': 'color-mix(in srgb, var(--c-on-primary) 30%, transparent)',
    'hero-chart-line': 'var(--c-on-primary)', 'hero-chart-line-2': 'color-mix(in srgb, var(--c-on-primary) 70%, transparent)',
    'hero-chart-area': 'color-mix(in srgb, var(--c-on-primary) 20%, transparent)', 'chart-tile-area': 'color-mix(in srgb, var(--tile-fg) 26%, transparent)',
  },
};

/**
 * Names no theme may set: danger and faults read the same everywhere, layers stay in their order, a finger always has
 * room, holding takes as long, and the sizes code works out itself stay the ones it expects.
 */
export const PROTECTED_NAMES: readonly string[] = Object.freeze([
  '--tile-alert-bg', '--tile-alert-fg', '--tile-icon-alert-bg', '--tile-icon-alert-fg', '--tile-badge-fg',
  '--chip-alert-bg', '--chip-alert-fg', '--banner-bg', '--banner-fg', '--button-danger-fg', '--field-error',
  '--rest-alarm-bg', '--rest-alarm-fg', '--rest-night-alarm',
  ...Object.keys(rustigExpressive.system).filter((name) => name.startsWith('layer-')).map((name) => `--${name}`),
  '--target-min', '--hold-step', '--space-8', '--nav-bar-height', '--dimmer-height', '--dimmer-grow',
  '--hero-wave-length', '--hero-wave-amplitude', '--hero-wave-gap', '--hero-wave-height',
  '--banner-wave-width', '--banner-wave-height', '--banner-wave-length', '--banner-wave-amplitude',
]);

/** The colour roles that always stay the dashboard's. */
const DASHBOARD_ROLES = new Set(['--c-error', '--c-on-error', '--c-error-container', '--c-on-error-container']);

/** Danger is red in every style: the error roles of Rustig's calculation; only a higher contrast makes them stronger. */
export function dangerRoles(seed: string, mode: Mode, contrast: number): Record<string, string> {
  return Object.fromEntries(Object.entries(colorTokens(seed, mode, contrast)).filter(([name]) => DASHBOARD_ROLES.has(name)));
}

/** A theme as a style: the knobs of its base, then its own. */
export function styleOf(file: ThemeFile): Style {
  const knobs: Knobs = { ...RUSTIG_KNOBS, ...BASE_KNOBS[file.base], ...file.knobs };
  return {
    base: file.base,
    knobs,
    scheme: SCHEMES[knobs.strength],
    contrast: CONTRASTS[knobs.contrast],
    system: knobSystem(knobs),
    components: { ...BASE_COMPONENTS[file.base], ...knobComponents(knobs) },
  };
}

const withDashes = (values: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(values).map(([name, value]) => [`--${name}`, value]));

/** Every CSS custom property of a style: colour roles, the four shapes, then layer 2, density and layer 3. */
export function computeLook(style: Style, settings: ShownSettings, systemPrefersDark: boolean): Record<string, string> {
  const seed = isValidSeed(settings.seed) ? settings.seed : rustigExpressive.color.defaultSeed;
  const mode = resolveMode(settings.mode, systemPrefersDark);
  return {
    ...colorTokens(seed, mode, style.contrast, style.scheme),
    ...dangerRoles(seed, mode, style.contrast),
    ...SHAPE_TOKENS,
    ...withDashes({ ...rustigExpressive.system, ...style.system }),
    ...withDashes(rustigExpressive.density[settings.density]),
    ...withDashes({ ...rustigExpressive.components, ...style.components }),
  };
}


/**
 * The colour roles of a seed in this style (without the error roles) and layer 3 again, for one section: a CSS
 * variable resolves where it is declared, so layer 3 must be declared on the section to follow its roles.
 */
export function sectionLook(style: Style, seed: string, mode: Mode): Record<string, string> {
  const roles = Object.entries(colorTokens(seed, mode, style.contrast, style.scheme)).filter(([name]) => !DASHBOARD_ROLES.has(name));
  return { ...Object.fromEntries(roles), ...withDashes({ ...rustigExpressive.components, ...style.components }) };
}

/** The names a section palette sets; the same for every style and seed. */
export const SECTION_NAMES: readonly string[] = Object.freeze([
  ...[...COLOR_ROLES, ...EXTRA_ROLES].map((role) => `--c-${role}`).filter((name) => !DASHBOARD_ROLES.has(name)),
  ...Object.keys(rustigExpressive.components).map((name) => `--${name}`),
]);
