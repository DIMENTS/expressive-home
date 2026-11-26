import { COLOR_ROLES, EXTRA_ROLES } from '../engine';

/**
 * What a value of a theme may be. A check never passes text on: it reads the parts the kind allows and writes them
 * again, so nothing but those parts can ever reach the page.
 */
export type Kind =
  /** plain: a colour of its own only, never a reference (the colour roles, which others refer to) */
  | { kind: 'colour'; also: readonly string[]; plain?: boolean }
  | { kind: 'size'; unit: Unit; min: number; max: number; also: readonly string[] }
  | { kind: 'sizes'; unit: Unit; min: number; max: number; also: readonly string[] }
  | { kind: 'corner'; min: number; max: number; also: readonly string[] }
  | { kind: 'number'; min: number; max: number; also: readonly string[] }
  | { kind: 'time'; max: number; also: readonly string[] }
  | { kind: 'weight'; also: readonly string[] }
  | { kind: 'choice'; also: readonly string[] }
  | { kind: 'fixed' };

export type KindName = Kind['kind'];
export const UNITS = ['px', 'em', '%', 'vw', 'dvh'] as const;
export type Unit = (typeof UNITS)[number];

/** The colour roles a theme may set and refer to: all but the error roles, which stay the dashboard's. */
export const SETTABLE_ROLES: readonly string[] = Object.freeze(
  [...COLOR_ROLES, ...EXTRA_ROLES].filter((role) => !/(^|-)error/.test(role)),
);
const ROLE_SET = new Set(SETTABLE_ROLES);

/** The shapes of the scale a corner may refer to. */
export const SHAPE_SCALE = ['shape-xs', 'shape-sm', 'shape-md', 'shape-lg', 'shape-xl', 'shape-2xl', 'shape-full'] as const;
const SHAPE_SET = new Set<string>(SHAPE_SCALE);

/** The curves a time may have, as the built-in styles use them. */
export const CURVES: readonly string[] = Object.freeze([
  'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier(.38,1.21,.22,1)', 'cubic-bezier(.34,.8,.34,1)',
]);

const NUMBER = /^-?(?:\d{1,5}(?:\.\d{1,4})?|\.\d{1,4})$/;
const MAX_TIME_MS = 10_000;

/** A number as CSS writes it: no exponent, no more digits than needed; null when it is no plain number. */
function readNumber(text: string): number | null {
  if (!NUMBER.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const write = (value: number): string => String(Math.round(value * 10_000) / 10_000);
const within = (value: number, min: number, max: number): boolean => value >= min && value <= max;

function hex(text: string): string | null {
  const lower = text.toLowerCase();
  return /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/.test(lower) ? lower : null;
}

/** One side of a colour: a hex colour, a role of the theme, transparent or the colour of the text. */
function plainColour(text: string): string | null {
  const own = hex(text);
  if (own) return own;
  if (text === 'transparent') return 'transparent';
  if (/^currentcolor$/i.test(text)) return 'currentColor';
  const role = /^var\(--c-([a-z-]+)\)$/.exec(text);
  return role && ROLE_SET.has(role[1]!) ? `var(--c-${role[1]})` : null;
}

/** A side of a mix with its share, if it has one. */
function mixSide(text: string): { colour: string; share: number | null } | null {
  const match = /^(.+?)(?:\s+(-?[\d.]+)%)?$/.exec(text.trim());
  if (!match) return null;
  const colour = plainColour(match[1]!.trim());
  if (!colour) return null;
  if (match[2] === undefined) return { colour, share: null };
  const share = readNumber(match[2]);
  return share !== null && within(share, 0, 100) ? { colour, share } : null;
}

/** Text split at the commas outside brackets. */
function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
    if (depth < 0) return [];
  }
  parts.push(text.slice(start));
  return depth === 0 ? parts : [];
}

export function checkColour(text: string): string | null {
  const plain = plainColour(text);
  if (plain) return plain;
  if (!text.startsWith('color-mix(in srgb,') || !text.endsWith(')')) return null;
  const sides = splitTop(text.slice('color-mix(in srgb,'.length, -1));
  if (sides.length !== 2) return null;
  const mixed = ['', sides[0]!, sides[1]!];
  const first = mixSide(mixed[1]!);
  const second = mixSide(mixed[2]!);
  if (!first || !second) return null;
  const side = (part: { colour: string; share: number | null }): string => (part.share === null ? part.colour : `${part.colour} ${write(part.share)}%`);
  return `color-mix(in srgb, ${side(first)}, ${side(second)})`;
}

function checkSize(text: string, unit: Unit, min: number, max: number): string | null {
  if (!text.endsWith(unit)) return null;
  const value = readNumber(text.slice(0, -unit.length));
  if (value === null || !within(value, min, max)) return null;
  return value === 0 ? `0${unit}` : `${write(value)}${unit}`;
}

function checkTime(text: string, max: number): string | null {
  const match = /^(\S+?)(ms|s)(?:\s+(.+))?$/.exec(text);
  if (!match) return null;
  const value = readNumber(match[1]!);
  if (value === null) return null;
  const ms = match[2] === 's' ? value * 1000 : value;
  if (!within(ms, 0, max)) return null;
  const curve = match[3];
  if (curve !== undefined && !CURVES.includes(curve.replace(/\s+/g, ''))) return null;
  const time = `${write(value)}${match[2]}`;
  return curve === undefined ? time : `${time} ${curve.replace(/\s+/g, '')}`;
}

/** The value as the kind allows it, written anew; null when the kind refuses it. */
export function checkValue(kind: Kind, raw: string): string | null {
  if (kind.kind === 'fixed') return null;
  const text = raw.trim().replace(/\s+/g, ' ');
  if (text.length === 0 || text.length > 200) return null;
  if (kind.also.includes(text)) return text;
  switch (kind.kind) {
    case 'colour': {
      if (!kind.plain) return checkColour(text);
      const own = hex(text);
      return own ?? (text === 'transparent' ? text : null);
    }
    case 'size':
      return checkSize(text, kind.unit, kind.min, kind.max);
    case 'sizes': {
      const parts = text.split(' ');
      if (parts.length < 1 || parts.length > 2) return null;
      const both = parts.map((part) => checkSize(part, kind.unit, kind.min, kind.max));
      return both.every((part) => part !== null) ? both.join(' ') : null;
    }
    case 'corner': {
      const shape = /^var\(--([a-z0-9-]+)\)$/.exec(text);
      if (shape) return SHAPE_SET.has(shape[1]!) ? `var(--${shape[1]})` : null;
      return checkSize(text, 'px', kind.min, kind.max);
    }
    case 'number': {
      const value = readNumber(text);
      return value !== null && within(value, kind.min, kind.max) ? write(value) : null;
    }
    case 'time':
      return checkTime(text, kind.max);
    case 'weight': {
      const value = readNumber(text);
      return value !== null && Number.isInteger(value) && value % 100 === 0 && within(value, 100, 900) ? String(value) : null;
    }
    case 'choice':
      return null;
  }
}

export const MAX_TIME = MAX_TIME_MS;
