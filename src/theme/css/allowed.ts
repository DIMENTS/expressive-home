/**
 * What own CSS may set: per property what its value may be made of. The wide list is for the house's own CSS (and
 * someone else's once it is allowed); the narrow list for someone else's. Nothing that hides, moves, shrinks or lays
 * one thing over another is on either list: an alarm stays visible, in its place and as large as it is.
 */

export type Piece = 'colour' | 'length' | 'number' | 'percentage' | 'time' | 'angle' | 'keyword' | 'family' | 'gradient' | 'picture' | 'empty-string';

export interface Spec {
  pieces: readonly Piece[];
  keywords?: readonly string[];
  /** Bounds of a length, in px (an em counts 16 px). */
  length?: readonly [number, number];
  /** Bounds of a plain number. */
  number?: readonly [number, number];
  /** Bounds of a percentage. */
  percentage?: readonly [number, number];
  /** Bounds of a length in em, for sizes that follow the part (font-size). */
  em?: readonly [number, number];
  /** A list with commas (fonts, shadows, transitions). */
  list?: boolean;
  /** Validated as a shadow: offsets, blur and spread each within their bounds. */
  shadow?: 'box' | 'text';
  /** Keyframes names may appear (animation). */
  animation?: boolean;
  /** Names of properties may appear (transition). */
  transition?: boolean;
  /** A `/` between position and size (the background shorthand). */
  slash?: boolean;
  /** The longest time, in ms. */
  maxTime?: number;
  /** One time per item: a duration, never a delay. */
  oneTime?: boolean;
}

const COLOUR: Spec = { pieces: ['colour'] };
const STYLE_WORDS = ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'];
const BORDER_WIDTH: readonly [number, number] = [0, 16];
const BORDER: Spec = { pieces: ['colour', 'length', 'keyword'], keywords: [...STYLE_WORDS, 'thin', 'medium', 'thick'], length: BORDER_WIDTH };
const RADIUS: Spec = { pieces: ['length', 'percentage'], length: [0, 999], percentage: [0, 50] };
const SPACE: Spec = { pieces: ['length'], length: [0, 64] };
const BACKGROUND: Spec = {
  pieces: ['colour', 'gradient', 'picture', 'keyword', 'length', 'percentage'],
  keywords: ['none', 'no-repeat', 'repeat', 'repeat-x', 'repeat-y', 'round', 'space', 'cover', 'contain', 'center', 'top', 'bottom', 'left', 'right', 'auto', 'fixed', 'scroll', 'local'],
  length: [-2000, 2000], percentage: [-100, 200], slash: true,
};
const TIMING = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end'];
const SHADOW_BOX: Spec = { pieces: ['colour', 'length', 'keyword'], keywords: ['none', 'inset'], list: true, shadow: 'box' };
const SHADOW_TEXT: Spec = { pieces: ['colour', 'length', 'keyword'], keywords: ['none'], list: true, shadow: 'text' };

/** The properties whose motion own CSS may animate or move between: colour, background, shadow and border. */
export const MOVING: readonly string[] = Object.freeze([
  'color', 'background', 'background-color', 'background-image', 'background-position', 'box-shadow', 'text-shadow', 'border-color', 'outline-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'text-decoration-color',
]);

/** A change of colour may take this long at most, and never wait: a tile that goes into alarm shows it at once. */
const TRANSITION_MS = 2000;

export const WIDE: Readonly<Record<string, Spec>> = Object.freeze({
  'color': COLOUR, 'background-color': COLOUR, 'caret-color': COLOUR, 'accent-color': COLOUR, 'text-decoration-color': COLOUR, 'outline-color': COLOUR,
  'background': BACKGROUND, 'background-image': BACKGROUND, 'background-size': BACKGROUND, 'background-position': BACKGROUND, 'background-repeat': BACKGROUND,
  'border': BORDER, 'border-top': BORDER, 'border-right': BORDER, 'border-bottom': BORDER, 'border-left': BORDER,
  'border-color': COLOUR, 'border-top-color': COLOUR, 'border-right-color': COLOUR, 'border-bottom-color': COLOUR, 'border-left-color': COLOUR,
  'border-style': { pieces: ['keyword'], keywords: STYLE_WORDS }, 'border-width': { pieces: ['length'], length: BORDER_WIDTH },
  'border-radius': RADIUS, 'border-top-left-radius': RADIUS, 'border-top-right-radius': RADIUS, 'border-bottom-left-radius': RADIUS, 'border-bottom-right-radius': RADIUS,
  'outline': { ...BORDER, length: [0, 8] }, 'outline-style': { pieces: ['keyword'], keywords: STYLE_WORDS }, 'outline-width': { pieces: ['length'], length: [0, 8] },
  'box-shadow': SHADOW_BOX, 'text-shadow': SHADOW_TEXT,
  'font-family': { pieces: ['family'], list: true },
  'font-weight': { pieces: ['number', 'keyword'], keywords: ['normal', 'bold', 'lighter', 'bolder'], number: [100, 900] },
  'font-style': { pieces: ['keyword'], keywords: ['normal', 'italic', 'oblique'] },
  'font-variant': { pieces: ['keyword'], keywords: ['normal', 'small-caps', 'all-small-caps', 'tabular-nums', 'proportional-nums', 'oldstyle-nums', 'lining-nums'] },
  'font-variant-numeric': { pieces: ['keyword'], keywords: ['normal', 'tabular-nums', 'proportional-nums', 'oldstyle-nums', 'lining-nums', 'slashed-zero'] },
  'font-size': { pieces: ['length', 'percentage'], em: [0.75, 2], percentage: [75, 200] },
  'letter-spacing': { pieces: ['length', 'keyword'], keywords: ['normal'], length: [-4, 16] },
  'word-spacing': { pieces: ['length', 'keyword'], keywords: ['normal'], length: [-4, 32] },
  'line-height': { pieces: ['number', 'keyword'], keywords: ['normal'], number: [0.8, 3] },
  'text-transform': { pieces: ['keyword'], keywords: ['none', 'uppercase', 'lowercase', 'capitalize'] },
  'text-decoration': { pieces: ['keyword', 'colour', 'length'], keywords: ['none', 'underline', 'overline', 'line-through', ...STYLE_WORDS, 'wavy'], length: [0, 8] },
  'text-decoration-line': { pieces: ['keyword'], keywords: ['none', 'underline', 'overline', 'line-through'] },
  'text-decoration-style': { pieces: ['keyword'], keywords: [...STYLE_WORDS, 'wavy'] },
  'text-align': { pieces: ['keyword'], keywords: ['left', 'right', 'center', 'start', 'end', 'justify'] },
  'padding': SPACE, 'padding-top': SPACE, 'padding-right': SPACE, 'padding-bottom': SPACE, 'padding-left': SPACE,
  'padding-inline': SPACE, 'padding-block': SPACE, 'gap': SPACE, 'row-gap': SPACE, 'column-gap': SPACE,
  'content': { pieces: ['empty-string'] },
  'animation': { pieces: ['time', 'number', 'keyword'], keywords: [...TIMING, 'infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'none', 'forwards', 'backwards', 'both', 'running', 'paused'], number: [0, 1000], animation: true, list: true },
  'animation-name': { pieces: ['keyword'], keywords: ['none'], animation: true, list: true },
  'animation-duration': { pieces: ['time'], list: true }, 'animation-delay': { pieces: ['time'], list: true },
  'animation-timing-function': { pieces: ['keyword'], keywords: TIMING, list: true },
  'animation-iteration-count': { pieces: ['number', 'keyword'], keywords: ['infinite'], number: [0, 1000], list: true },
  'animation-direction': { pieces: ['keyword'], keywords: ['normal', 'reverse', 'alternate', 'alternate-reverse'], list: true },
  'transition': { pieces: ['time', 'keyword'], keywords: [...TIMING], transition: true, list: true, maxTime: TRANSITION_MS, oneTime: true },
  'transition-property': { pieces: ['keyword'], keywords: [], transition: true, list: true },
  'transition-duration': { pieces: ['time'], list: true, maxTime: TRANSITION_MS, oneTime: true },
  'transition-timing-function': { pieces: ['keyword'], keywords: TIMING, list: true },
});

const NARROW_NAMES = [
  'color', 'background-color', 'background', 'background-image', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color',
  'border-style', 'border-width', 'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'font-family', 'font-weight', 'letter-spacing', 'text-transform', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap',
];

/** Someone else's CSS, until it is allowed: colours, borders, corners, letters and space. No pictures, shadows or motion. */
export const NARROW: Readonly<Record<string, Spec>> = Object.freeze(Object.fromEntries(NARROW_NAMES.map((name) => {
  const spec = WIDE[name]!;
  return [name, name.startsWith('background') ? { ...spec, pieces: spec.pieces.filter((piece) => piece !== 'picture') } : spec];
})));

/** Bounds of a shadow, in px: offsets, blur, spread. */
export const SHADOW_BOUNDS = { offset: 16, blur: 64, spread: 16 } as const;
