import { contrastOf, type Rgba } from './legible';
import { rustigExpressive } from './rustig-expressive';
import type { Mode } from './types';

/**
 * The empty base: no Material. Plain colours of its own (white and grey with black text and one accent; nearly black
 * with white text in the dark), square corners, the system letter, no motion and a straight line in the hero.
 * A base colour of the device, the house or a section sets only the accent; the texts on it are black or white.
 */

const SYSTEM_LETTER = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

/** The accent when nobody chose a colour. */
const ACCENT: Record<Mode, string> = { light: '#1d4ed8', dark: '#7aa2ff' };

const NEUTRAL: Record<Mode, Record<string, string>> = {
  light: {
    'secondary': '#4b5563', 'on-secondary': '#ffffff', 'secondary-container': '#e5e7eb', 'on-secondary-container': '#111827',
    'surface': '#ffffff', 'surface-dim': '#e5e7eb', 'surface-bright': '#ffffff', 'surface-container-lowest': '#ffffff', 'surface-container-low': '#f9fafb',
    'surface-container': '#f3f4f6', 'surface-container-high': '#eceef1', 'surface-container-highest': '#e5e7eb',
    'on-surface': '#111111', 'on-surface-variant': '#374151', 'outline': '#6b7280', 'outline-variant': '#d1d5db',
    'inverse-surface': '#111111', 'inverse-on-surface': '#ffffff', 'scrim': '#000000', 'shadow': '#000000',
  },
  dark: {
    'secondary': '#9ca3af', 'on-secondary': '#111111', 'secondary-container': '#2a2d33', 'on-secondary-container': '#e5e7eb',
    'surface': '#0d0d0f', 'surface-dim': '#0d0d0f', 'surface-bright': '#26282c', 'surface-container-lowest': '#08080a', 'surface-container-low': '#131417',
    'surface-container': '#17181b', 'surface-container-high': '#1f2024', 'surface-container-highest': '#2a2b30',
    'on-surface': '#f5f5f5', 'on-surface-variant': '#b4b8bf', 'outline': '#8b9099', 'outline-variant': '#3a3d44',
    'inverse-surface': '#f5f5f5', 'inverse-on-surface': '#111111', 'scrim': '#000000', 'shadow': '#000000',
  },
};

/** How much of the accent a container has over the surface. */
const CONTAINER_SHARE: Record<Mode, number> = { light: 0.18, dark: 0.4 };
const MARK_MIN = 3;

const rgb = (value: string): Rgba => ({ r: parseInt(value.slice(1, 3), 16) / 255, g: parseInt(value.slice(3, 5), 16) / 255, b: parseInt(value.slice(5, 7), 16) / 255, a: 1 });
const hexOf = ({ r, g, b }: Rgba): string => `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
const mixed = (a: string, b: string, share: number): string => {
  const [x, y] = [rgb(a), rgb(b)];
  return hexOf({ r: x.r * share + y.r * (1 - share), g: x.g * share + y.g * (1 - share), b: x.b * share + y.b * (1 - share), a: 1 });
};
/** Black or white, whichever stands out more. */
const textOn = (ground: string): string => (contrastOf(rgb('#111111'), rgb(ground)) >= contrastOf(rgb('#ffffff'), rgb(ground)) ? '#111111' : '#ffffff');
/** With room to spare: a mark in a chart lies on a faint band of its own as well. */
const stands = (mark: string, ground: string): boolean => contrastOf(rgb(mark), rgb(ground)) >= MARK_MIN + 0.5;

export interface LeegColours {
  /** The colour roles, as CSS custom properties, without the error roles. */
  roles: Record<string, string>;
  /** The marks in the accent where the accent stands out, in the text colour where it does not. */
  marks: Record<string, string>;
}

/** The colours of the empty base for light or dark, with the accent chosen (null: its own blue). */
export function leegColours(mode: Mode, chosen: string | null): LeegColours {
  const accent = (chosen ?? ACCENT[mode]).toLowerCase();
  const neutral = NEUTRAL[mode];
  const container = mixed(accent, neutral['surface']!, CONTAINER_SHARE[mode]);
  const onContainer = textOn(container);
  const roles: Record<string, string> = {
    ...neutral,
    'primary': accent, 'on-primary': textOn(accent), 'primary-container': container, 'on-primary-container': onContainer,
    'tertiary': accent, 'on-tertiary': textOn(accent), 'tertiary-container': container, 'on-tertiary-container': onContainer,
    'inverse-primary': mixed(accent, neutral['inverse-surface']!, 0.5),
  };
  const onContainerMark = stands(accent, container) ? 'var(--c-primary)' : 'var(--c-on-primary-container)';
  const onRowMark = stands(accent, neutral['surface-container-high']!) && stands(accent, neutral['surface']!) ? 'var(--c-primary)' : 'var(--c-on-surface)';
  return {
    roles: Object.fromEntries(Object.entries(roles).map(([role, value]) => [`--c-${role}`, value])),
    marks: {
      '--tile-on-slider-fill': onContainerMark, '--hero-wave-fg': onContainerMark, '--hero-chart-line': onContainerMark,
      '--chart-line': onRowMark, '--chart-band-on': onRowMark,
    },
  };
}

/** A base colour that is Rustig's own is no choice: the empty base keeps its own accent then. */
export const chosenAccent = (seed: string): string | null => (seed.toLowerCase() === rustigExpressive.color.defaultSeed ? null : seed);

/** What the empty base sets in layer 2: square corners, the system letter, no motion. */
export const LEEG_SYSTEM: Readonly<Record<string, string>> = Object.freeze({
  'shape-xs': '0px', 'shape-sm': '0px', 'shape-md': '0px', 'shape-lg': '0px', 'shape-xl': '0px', 'shape-2xl': '0px',
  'shape-circle': 'inset(0)', 'shape-cookie': 'inset(0)', 'shape-clover': 'inset(0)', 'shape-flower': 'inset(0)',
  'font-family': SYSTEM_LETTER,
  'motion-spatial': '0ms', 'motion-effects': '0ms', 'duration-spatial': '0ms', 'motion-arrive': '0ms', 'motion-wave': '0s', 'motion-banner-wave': '0s',
  'press-scale': '1',
});

/** What the empty base sets in layer 3: a straight line in the hero and square pressed tiles. */
export const LEEG_COMPONENTS: Readonly<Record<string, string>> = Object.freeze({
  'hero-wave-scale': '0', 'tile-radius-pressed': 'var(--shape-lg)', 'flow-press-scale': '1', 'drag-lift-scale': '1',
});
