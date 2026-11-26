/** A colour with alpha, each channel 0–1. */
export interface Rgba { r: number; g: number; b: number; a: number }

const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 };
const DEPTH = 12;

const hex = (value: string): Rgba => ({
  r: parseInt(value.slice(1, 3), 16) / 255, g: parseInt(value.slice(3, 5), 16) / 255, b: parseInt(value.slice(5, 7), 16) / 255,
  a: value.length === 9 ? parseInt(value.slice(7, 9), 16) / 255 : 1,
});

/** Splits on the commas at the top level of a value. */
function parts(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') depth -= 1;
    else if (text[i] === ',' && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
  }
  out.push(text.slice(start).trim());
  return out;
}

/** CSS colour-mix in srgb: premultiplied by alpha, as browsers do it. */
function mix(a: Rgba, pa: number, b: Rgba, pb: number): Rgba {
  const total = pa + pb;
  const [wa, wb] = [pa / total, pb / total];
  const alpha = a.a * wa + b.a * wb;
  const scale = Math.min(1, total);
  if (alpha === 0) return { ...CLEAR };
  const channel = (k: 'r' | 'g' | 'b'): number => (a[k] * a.a * wa + b[k] * b.a * wb) / alpha;
  return { r: channel('r'), g: channel('g'), b: channel('b'), a: alpha * scale };
}

/**
 * Every colour a token can show: one for a plain colour, the stops of a gradient. Follows `var()`, `color-mix(in srgb …)`
 * and `transparent`, as the themes write them; `currentColor` is the text colour given. Null for what is no colour.
 */
export function coloursOf(value: string, tokens: Record<string, string>, current: Rgba | null = null, depth = 0): Rgba[] | null {
  const text = value.trim();
  if (depth > DEPTH) return null;
  if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(text)) return [hex(text)];
  if (text === 'transparent') return [{ ...CLEAR }];
  if (/^currentcolor$/i.test(text)) return current ? [current] : null;
  const reference = /^var\((--[a-z0-9-]+)\)$/i.exec(text);
  if (reference) {
    const next = tokens[reference[1]!];
    return next === undefined ? null : coloursOf(next, tokens, current, depth + 1);
  }
  const mixed = /^color-mix\(in srgb,(.*)\)$/i.exec(text);
  if (mixed) {
    const [first, second] = parts(mixed[1]!);
    if (first === undefined || second === undefined) return null;
    const side = (part: string): { colour: Rgba[] | null; percent: number | null } => {
      const match = /^(.*?)(?:\s+(\d+(?:\.\d+)?)%)?$/.exec(part)!;
      return { colour: coloursOf(match[1]!, tokens, current, depth + 1), percent: match[2] === undefined ? null : Number(match[2]) };
    };
    const a = side(first);
    const b = side(second);
    if (!a.colour || !b.colour) return null;
    const pa = a.percent ?? (b.percent === null ? 50 : 100 - b.percent);
    const pb = b.percent ?? 100 - pa;
    return a.colour.flatMap((ca) => b.colour!.map((cb) => mix(ca, pa / 100, cb, pb / 100)));
  }
  const gradient = /^linear-gradient\((.*)\)$/i.exec(text);
  if (gradient) {
    const stops = parts(gradient[1]!).filter((part) => !/^\d+deg$/.test(part)).map((part) => coloursOf(part.replace(/\s+\d+%$/, ''), tokens, current, depth + 1));
    return stops.some((stop) => stop === null) ? null : stops.flat() as Rgba[];
  }
  return null;
}

/** A colour over another: what the eye sees. */
const over = (top: Rgba, under: Rgba): Rgba => {
  const a = top.a + under.a * (1 - top.a);
  if (a === 0) return { ...CLEAR };
  const channel = (k: 'r' | 'g' | 'b'): number => (top[k] * top.a + under[k] * under.a * (1 - top.a)) / a;
  return { r: channel('r'), g: channel('g'), b: channel('b'), a };
};

const luminance = ({ r, g, b }: Rgba): number => {
  const linear = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

/** The WCAG contrast of two opaque colours. */
export function contrastOf(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A text or a mark over a stack of backgrounds, from the top down; the page is the last. `min` is what it must reach:
 * 4.5 for text, 3 for large text and for marks such as icons and slider fills.
 */
export interface Pair {
  id: string; fg: string; stack: string[]; min: number;
  /** The token whose colour is `currentColor` in the stack, for a background in the colour of the text. */
  current?: string;
}

const page = ['--page-bg'];
const section = ['--section-bg', ...page];
const tile = ['--tile-bg', ...section];
const tileOn = ['--tile-on-bg', ...section];

/** The texts and marks of the dashboard that a theme can make hard to see. */
export const TEXT_PAIRS: readonly Pair[] = Object.freeze([
  { id: 'page', fg: '--page-fg', stack: page, min: 4.5 },
  { id: 'header', fg: '--header-eyebrow-fg', stack: page, min: 4.5 },
  { id: 'rail', fg: '--rail-item-fg', stack: page, min: 4.5 },
  { id: 'rail-active', fg: '--rail-indicator-fg', stack: ['--rail-indicator-bg', ...page], min: 4.5 },
  { id: 'chip', fg: '--chip-fg', stack: ['--chip-bg', ...page], min: 4.5 },
  { id: 'section', fg: '--section-fg', stack: section, min: 4.5 },
  { id: 'section-count', fg: '--section-count-fg', stack: section, min: 4.5 },
  { id: 'hero', fg: '--section-hero-fg', stack: ['--section-hero-bg', ...page], min: 4.5 },
  { id: 'hero-wave', fg: '--hero-wave-fg', stack: ['--section-hero-bg', ...page], min: 3 },
  { id: 'tile', fg: '--tile-fg', stack: tile, min: 4.5 },
  { id: 'tile-state', fg: '--tile-state-fg', stack: tile, min: 4.5 },
  { id: 'tile-icon', fg: '--tile-icon-fg', stack: ['--tile-icon-bg', ...tile], min: 3 },
  { id: 'tile-on', fg: '--tile-on-fg', stack: tileOn, min: 4.5 },
  { id: 'tile-icon-on', fg: '--tile-icon-on-fg', stack: ['--tile-icon-on-bg', ...tileOn], min: 3 },
  { id: 'tile-on-slider', fg: '--tile-on-slider-fill', stack: tileOn, min: 3 },
  { id: 'tile-alert', fg: '--tile-alert-fg', stack: ['--tile-alert-bg', ...section], min: 4.5 },
  { id: 'flow', fg: '--flow-fg', stack: ['--flow-bg', ...section], min: 4.5 },
  { id: 'sheet', fg: '--sheet-fg', stack: ['--sheet-bg'], min: 4.5 },
  { id: 'button', fg: '--button-filled-fg', stack: ['--button-filled-bg', '--sheet-bg'], min: 4.5 },
  { id: 'snackbar', fg: '--snackbar-fg', stack: ['--snackbar-bg'], min: 4.5 },
  { id: 'banner', fg: '--banner-fg', stack: ['--banner-bg', ...page], min: 4.5 },
  { id: 'rest', fg: '--rest-fg', stack: ['--rest-bg'], min: 4.5 },
  { id: 'hero-chart', fg: '--hero-chart-line', stack: ['--section-hero-bg', ...page], min: 3 },
  { id: 'window-chart', fg: '--chart-line', stack: ['--sheet-row-bg', '--sheet-bg'], min: 3 },
  { id: 'chart-tip', fg: '--chart-tip-fg', stack: ['--chart-tip-bg', '--sheet-bg'], min: 4.5 },
  { id: 'chart-band', fg: '--chart-band-on', stack: ['--chart-band-track', '--sheet-row-bg', '--sheet-bg'], current: '--sheet-fg', min: 3 },
  { id: 'tile-trend', fg: '--tile-fg', stack: ['--chart-tile-area', ...tile], current: '--tile-fg', min: 4.5 },
  { id: 'tile-trend-state', fg: '--tile-state-fg', stack: ['--chart-tile-area', ...tile], current: '--tile-fg', min: 4.5 },
]);

export interface Legibility { id: string; ratio: number; ok: boolean }

/**
 * How well each text stands out, at its worst: over a gradient or through a see-through surface, against every colour
 * that can lie beneath. A pair that cannot be worked out counts as unreadable.
 */
export function legibility(tokens: Record<string, string>, pairs: readonly Pair[] = TEXT_PAIRS): Legibility[] {
  return pairs.map(({ id, fg, stack, min, current }) => {
    let grounds: Rgba[] = [{ r: 1, g: 1, b: 1, a: 1 }];
    for (const name of [...stack].reverse()) {
      const value = tokens[name];
      // the colour of the text over what lies beneath this layer, when the layer is made of it
      const text = current === undefined || tokens[current] === undefined ? null : coloursOf(tokens[current]!, tokens, grounds[0]!)?.[0] ?? null;
      const colours = value === undefined ? null : coloursOf(value, tokens, text);
      if (!colours) return { id, ratio: 0, ok: false };
      grounds = grounds.flatMap((ground) => colours.map((colour) => over(colour, ground)));
    }
    let ratio = Infinity;
    for (const ground of grounds) {
      const text = tokens[fg] === undefined ? null : coloursOf(tokens[fg]!, tokens, ground);
      if (!text) return { id, ratio: 0, ok: false };
      for (const colour of text) ratio = Math.min(ratio, contrastOf(over(colour, ground), ground));
    }
    return { id, ratio: Math.round(ratio * 100) / 100, ok: ratio >= min };
  });
}

/** Every colour a stack of layers can show, from the top down to a white page. Null when one is no colour. */
function groundsOf(tokens: Record<string, string>, stack: readonly string[]): Rgba[] | null {
  let grounds: Rgba[] = [{ r: 1, g: 1, b: 1, a: 1 }];
  for (const name of [...stack].reverse()) {
    const value = tokens[name];
    const colours = value === undefined ? null : coloursOf(value, tokens);
    if (!colours) return null;
    grounds = grounds.flatMap((ground) => colours.map((colour) => over(colour, ground)));
  }
  return grounds;
}

/** How far apart two colours lie, 0 to 1. */
const distance = (a: Rgba, b: Rgba): number => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) / Math.sqrt(3);
const DANGER_DISTANCE = 0.04;

/** Whether a tile with an alarm still looks different from a plain tile: danger must always read as danger. */
export function dangerStandsOut(tokens: Record<string, string>): boolean {
  const plain = groundsOf(tokens, ['--tile-bg', '--section-bg', '--page-bg']);
  const alert = groundsOf(tokens, ['--tile-alert-bg', '--section-bg', '--page-bg']);
  if (!plain || !alert) return false;
  return plain.every((a) => alert.every((b) => distance(a, b) >= DANGER_DISTANCE));
}

const BLACK: Rgba = { r: 17 / 255, g: 17 / 255, b: 17 / 255, a: 1 };
const WHITE: Rgba = { r: 1, g: 1, b: 1, a: 1 };

/** For a place that is hard to read: black or white, whichever stands out most at its worst. Null for an unknown place. */
export function betterText(tokens: Record<string, string>, id: string): '#111111' | '#ffffff' | null {
  const pair = TEXT_PAIRS.find((item) => item.id === id);
  if (!pair) return null;
  const grounds = groundsOf(tokens, pair.stack);
  if (!grounds) return null;
  const worst = (text: Rgba): number => Math.min(...grounds.map((ground) => contrastOf(text, ground)));
  return worst(BLACK) >= worst(WHITE) ? '#111111' : '#ffffff';
}
