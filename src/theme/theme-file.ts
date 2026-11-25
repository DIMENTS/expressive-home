import { isValidSeed } from './engine';
import { KNOB_VALUES, isBase, type KnobName, type Knobs, type ThemeFile } from './look';

/** The limits of what is kept of themes. */
export const LIMITS_LOOKS = { themes: 50, nameLength: 60, fileBytes: 65536 } as const;

const OWN_ID = /^t-[0-9a-z]{16}$/;
const APP_VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const ID_LENGTH = 16;
// control characters and the line and paragraph separators
const UNPRINTABLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/** The id of a theme someone made, never that of a built-in style. From getRandomValues: randomUUID only exists on a secure origin. */
export function newThemeId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  return `t-${[...bytes].map((byte) => (byte % 36).toString(36)).join('')}`;
}

export const isOwnThemeId = (id: unknown): id is string => typeof id === 'string' && OWN_ID.test(id);
/** The id of a theme that exists somewhere: a built-in style or one someone made. */
export const isThemeId = (id: unknown): id is string => isOwnThemeId(id) || isBase(id);

export type ParsedTheme = { ok: true; file: ThemeFile; dropped: string[] } | { ok: false; reason: 'not-a-theme' | 'too-new' | 'too-big' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const own = (record: Record<string, unknown>, key: string): unknown => (Object.hasOwn(record, key) ? record[key] : undefined);

function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  return value.replace(UNPRINTABLE, '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

const KNOWN = new Set(['format', 'id', 'name', 'maker', 'base', 'seed', 'userSeed', 'knobs', 'app']);

/**
 * A theme from outside (a file, a code, the hub), checked field by field: only known keys with values of their kind
 * come through, the rest falls away and is named. A later format or an unknown base is too new. Never throws.
 */
export function parseThemeFile(raw: unknown): ParsedTheme {
  try {
    if (!isRecord(raw)) return { ok: false, reason: 'not-a-theme' };
    const format = own(raw, 'format');
    if (typeof format === 'number' && Number.isInteger(format) && format > 1) return { ok: false, reason: 'too-new' };
    if (format !== 1) return { ok: false, reason: 'not-a-theme' };
    const base = own(raw, 'base');
    if (base === undefined) return { ok: false, reason: 'not-a-theme' };
    if (!isBase(base)) return { ok: false, reason: 'too-new' };
    if (new TextEncoder().encode(JSON.stringify(raw)).length > LIMITS_LOOKS.fileBytes) return { ok: false, reason: 'too-big' };

    const dropped: string[] = Object.keys(raw).filter((key) => !KNOWN.has(key));
    const take = <T>(key: string, value: T | null, fallback: T): T => {
      if (value !== null) return value;
      if (own(raw, key) !== undefined) dropped.push(key);
      return fallback;
    };
    const id = take('id', isOwnThemeId(own(raw, 'id')) ? (own(raw, 'id') as string) : null, '') || newThemeId();
    const name = take('name', text(own(raw, 'name'), LIMITS_LOOKS.nameLength), '');
    const maker = take('maker', text(own(raw, 'maker'), LIMITS_LOOKS.nameLength), '');
    const seedRaw = own(raw, 'seed');
    const seed = seedRaw === null ? null : take('seed', typeof seedRaw === 'string' && isValidSeed(seedRaw) ? seedRaw.toLowerCase() : null, null);
    const userSeedRaw = own(raw, 'userSeed');
    const userSeed = take('userSeed', typeof userSeedRaw === 'boolean' ? userSeedRaw : null, true);
    const appRaw = own(raw, 'app');
    const app = appRaw === '' ? '' : take('app', typeof appRaw === 'string' && APP_VERSION.test(appRaw) ? appRaw : null, '');

    const knobs: Partial<Knobs> = {};
    const knobsRaw = own(raw, 'knobs');
    if (isRecord(knobsRaw)) {
      for (const key of Object.keys(knobsRaw)) {
        const allowed = Object.hasOwn(KNOB_VALUES, key) ? (KNOB_VALUES[key as KnobName] as readonly unknown[]) : null;
        if (allowed?.includes(knobsRaw[key])) (knobs as Record<string, unknown>)[key] = knobsRaw[key];
        else dropped.push(`knobs.${key}`);
      }
    } else if (knobsRaw !== undefined) {
      dropped.push('knobs');
    }
    return { ok: true, file: { format: 1, id, name, maker, base, seed, userSeed, knobs, app }, dropped };
  } catch {
    return { ok: false, reason: 'not-a-theme' };
  }
}

/** How many values a theme sets of its own: its colour and its knobs. */
export function valueCount(file: ThemeFile): number {
  return (file.seed === null ? 0 : 1) + Object.keys(file.knobs).length;
}

