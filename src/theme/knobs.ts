import type { SchemeName } from './engine';
import { RUSTIG_KNOBS, type Knobs } from './look';

/** The shape scale per roundness; `round` is Rustig's own. */
const SHAPES: Record<Knobs['roundness'], Record<string, string>> = {
  'square': { 'shape-xs': '2px', 'shape-sm': '2px', 'shape-md': '4px', 'shape-lg': '4px', 'shape-xl': '6px', 'shape-2xl': '8px', 'shape-full': '8px' },
  'slight': { 'shape-xs': '2px', 'shape-sm': '4px', 'shape-md': '8px', 'shape-lg': '10px', 'shape-xl': '12px', 'shape-2xl': '16px', 'shape-full': '999px' },
  'round': { 'shape-xs': '4px', 'shape-sm': '8px', 'shape-md': '12px', 'shape-lg': '16px', 'shape-xl': '20px', 'shape-2xl': '28px', 'shape-full': '999px' },
  'very-round': { 'shape-xs': '6px', 'shape-sm': '12px', 'shape-md': '16px', 'shape-lg': '24px', 'shape-xl': '28px', 'shape-2xl': '36px', 'shape-full': '999px' },
};

const LETTERS: Record<Knobs['letter'], string> = {
  sans: '"Google Sans Flex Variable", "Google Sans Flex", system-ui, "Segoe UI", sans-serif',
  system: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
};

export const SCHEMES: Record<Knobs['strength'], SchemeName> = { grey: 'monochrome', soft: 'neutral', normal: 'tonalSpot', vivid: 'vibrant' };
export const CONTRASTS: Record<Knobs['contrast'], number> = { normal: 0, high: 0.5, highest: 1 };

const SEE_THROUGH = {
  'section-bg': 'color-mix(in srgb, var(--c-surface) 46%, transparent)',
  'section-hero-bg': 'color-mix(in srgb, var(--c-primary-container) 70%, transparent)',
  'tile-bg': 'color-mix(in srgb, var(--c-surface-container-high) 42%, transparent)',
  'tile-icon-bg': 'color-mix(in srgb, var(--c-surface) 72%, transparent)',
  'tile-cell-bg': 'color-mix(in srgb, var(--c-surface) 60%, transparent)',
  'chip-bg': 'color-mix(in srgb, var(--c-surface) 66%, transparent)',
};

const OUTLINED = {
  'section-outline': 'var(--c-on-surface)', 'section-outline-width': '2px',
  'tile-outline': 'var(--c-on-surface)', 'tile-outline-width': '2px',
};

const GRADIENT = 'linear-gradient(160deg, var(--c-primary-container), var(--c-tertiary-container) 55%, var(--c-secondary-container))';

/**
 * What the knobs change in layer 2: shape, letter and weight. Only what differs from Rustig, so that Rustig's own knobs
 * give exactly Rustig's tokens.
 */
export function knobSystem(knobs: Knobs): Record<string, string> {
  const values: Record<string, string> = {};
  if (knobs.roundness !== RUSTIG_KNOBS.roundness) Object.assign(values, SHAPES[knobs.roundness]);
  if (knobs.letter !== RUSTIG_KNOBS.letter) values['font-family'] = LETTERS[knobs.letter];
  if (knobs.weight !== RUSTIG_KNOBS.weight) {
    values['weight-strong'] = String(knobs.weight);
    values['weight-medium'] = String(knobs.weight - 100);
  }
  return values;
}

/** What the knobs change in layer 3: the surfaces, the page behind them, and the radius of a pressed tile with the shapes. */
export function knobComponents(knobs: Knobs): Record<string, string> {
  const values: Record<string, string> = {};
  if (knobs.roundness !== RUSTIG_KNOBS.roundness) values['tile-radius-pressed'] = 'var(--shape-lg)';
  if (knobs.surfaces === 'see-through') Object.assign(values, SEE_THROUGH);
  if (knobs.surfaces === 'outlined') Object.assign(values, OUTLINED);
  if (knobs.background === 'gradient') values['page-bg'] = GRADIENT;
  return values;
}
