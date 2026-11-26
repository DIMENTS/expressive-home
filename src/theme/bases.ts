import type { Knobs, ThemeBase } from './look';
import { rustigExpressive } from './rustig-expressive';

/** The knobs a built-in style starts with. */
export const BASE_KNOBS: Record<ThemeBase, Partial<Knobs>> = {
  rustig: {},
  leeg: {},
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
export const BASE_COMPONENTS: Record<ThemeBase, Record<string, string>> = {
  rustig: {},
  leeg: {},
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
  // the slow shift of the night screen against burn-in, and the ramps that show real light colours
  '--rest-night-shift-x', '--rest-night-shift-y', '--motion-drift', '--ramp-hue', '--ramp-temperature',
  // a warning on the rest screen never looks like an alarm
  '--rest-warn-bg', '--rest-warn-fg',
]);

/** The colour roles that always stay the dashboard's. */
export const DASHBOARD_ROLES = new Set(['--c-error', '--c-on-error', '--c-error-container', '--c-on-error-container']);

