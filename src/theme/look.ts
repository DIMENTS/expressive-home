/** The styles a theme can start from. Rustig is the first and stays the default. */
export const BASES = ['rustig', 'uitbundig', 'glas', 'helder'] as const;
export type Base = (typeof BASES)[number];
/** What a theme can start from: a built-in style, or the empty base without Material (format 2 only). */
export type ThemeBase = Base | 'leeg';
export const EMPTY_BASE = 'leeg' as const;

/** Every knob of the simple editor and the values it can take, in the order they are shown. */
export const KNOB_VALUES = {
  roundness: ['square', 'slight', 'round', 'very-round'],
  strength: ['grey', 'soft', 'normal', 'vivid'],
  contrast: ['normal', 'high', 'highest'],
  letter: ['sans', 'system', 'serif'],
  weight: [500, 600, 700, 800],
  surfaces: ['solid', 'see-through', 'outlined'],
  background: ['plain', 'gradient'],
} as const;

export type KnobName = keyof typeof KNOB_VALUES;
export type Knobs = { [K in KnobName]: (typeof KNOB_VALUES)[K][number] };

/** The knobs as Rustig has them: with these, a theme looks exactly like the dashboard always did. */
export const RUSTIG_KNOBS: Readonly<Knobs> = Object.freeze({
  roundness: 'round', strength: 'normal', contrast: 'normal', letter: 'sans', weight: 600, surfaces: 'solid', background: 'plain',
});

/**
 * A theme as it is stored and shared: what it starts from, its colour and the knobs it sets.
 * Only looks: never a device, a name of a device, a photo, an address or a key.
 */
/** Values a theme sets itself, by name without the leading dashes: for both light and dark, or for one of them. */
export interface ThemeValues {
  both?: Record<string, string>;
  light?: Record<string, string>;
  dark?: Record<string, string>;
}

export const VALUE_LAYERS = ['both', 'light', 'dark'] as const;
export type ValueLayer = (typeof VALUE_LAYERS)[number];

export interface ThemeFile {
  /** 1 without values of its own and with a built-in base; 2 otherwise. */
  format: 1 | 2;
  /** Fixed for the life of the theme; a built-in style has its base as id. */
  id: string;
  name: string;
  /** Who made it, as they chose to be named; may be empty. */
  maker: string;
  base: ThemeBase;
  /** The base colour; null keeps the colour of the device or the house. */
  seed: string | null;
  /** Whether the base colour of the device or the house replaces the theme's own. */
  userSeed: boolean;
  /** Only the knobs that differ from the base. */
  knobs: Partial<Knobs>;
  /** The version of the app it was made with, for the one who takes it in. */
  app: string;
  /** Format 2: the values it sets itself. Names this version does not know are kept, never applied. */
  values?: ThemeValues;
  /** Format 2: CSS of its own, for the parts of the given version of their list. */
  css?: ThemeCss;
}

/** CSS of a theme: the text as written, and the version of the list of parts it was written for. */
export interface ThemeCss { version: number; text: string }

const builtIn = (base: Base, name: string): ThemeFile => Object.freeze({ format: 1, id: base, name, maker: '', base, seed: null, userSeed: true, knobs: Object.freeze({}), app: '' });

/** The four styles that come with the app. */
export const BUILT_IN: readonly ThemeFile[] = Object.freeze([
  builtIn('rustig', 'Rustig'), builtIn('uitbundig', 'Uitbundig'), builtIn('glas', 'Glas'), builtIn('helder', 'Helder'),
]);

export const isBase = (value: unknown): value is Base => (BASES as readonly unknown[]).includes(value);
