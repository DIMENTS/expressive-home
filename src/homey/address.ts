import { isIPv4 } from './routes';

/** A dotted quad that is not part of a longer run of digits and dots. */
const DOTTED_QUAD = /(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?!\d|\.\d)/g;

function isPrivate(address: string): boolean {
  const [a, b] = address.split('.').map(Number) as [number, number];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** The first IPv4 address in the text that lies in 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16. */
export function privateIPv4From(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  for (const [candidate] of value.matchAll(DOTTED_QUAD)) {
    if (isIPv4(candidate) && isPrivate(candidate)) return candidate;
  }
  return null;
}

/** Every digit becomes `n`, so the shape of an address can be shown without the address. */
export function maskDigits(text: string): string {
  return text.replace(/\d/g, 'n');
}

const SHAPE_MAX = 60;

/**
 * The shape of a field that should hold an address: letters become `a` and digits `n`, so nothing in it identifies.
 * Null when the field is absent; the type in brackets when it is not text.
 */
export function addressShape(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') return `(${typeof value})`;
  return maskDigits(value.slice(0, SHAPE_MAX).replace(/\p{L}/gu, 'a'));
}

export type ParsedAddress =
  | { kind: 'homeyId'; homeyId: string }
  | { kind: 'ip'; address: string }
  /** `ambiguous`: two different Homey IDs; `unknown`: anything else that is no address. */
  | { kind: 'invalid'; reason: 'unknown' | 'ambiguous' };

/** An address someone can mean: four numbers without leading zeros, and not the "any address" 0.0.0.0. */
const isUsableIPv4 = (text: string): boolean =>
  isIPv4(text) && text.split('.').every((part) => part === '0' || !part.startsWith('0')) && text !== '0.0.0.0';

/** Exactly 24 hexadecimal characters that do not touch another hexadecimal character. */
const HOMEY_ID = /(?<![0-9a-f])[0-9a-f]{24}(?![0-9a-f])/gi;
const ID_AFTER_HOMEYS = /homeys\/([0-9a-f]{24})(?![0-9a-f])/i;

/**
 * Turns what someone typed or pasted into a Homey ID or an IPv4 address.
 * Accepts the address of the Homey web app (the ID follows `homeys/`), a bare ID, or an IP address with or without
 * `http://`. Anything else is invalid: nothing but a valid ID or address gets any further. Two different IDs anywhere
 * in the text are ambiguous, even when one follows `homeys/`: which Homey was meant is a guess.
 */
export function parseAddress(input: string): ParsedAddress {
  const text = input.trim();
  const ids = new Set([...text.matchAll(HOMEY_ID)].map(([id]) => id.toLowerCase()));
  const inPath = ID_AFTER_HOMEYS.exec(text)?.[1]?.toLowerCase();
  if (inPath) ids.add(inPath);
  if (ids.size > 1) return { kind: 'invalid', reason: 'ambiguous' };
  if (ids.size === 1) return { kind: 'homeyId', homeyId: [...ids][0] as string };
  const address = text.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return isUsableIPv4(address) ? { kind: 'ip', address } : { kind: 'invalid', reason: 'unknown' };
}
