// Release 1.2.0 of this module, kept as it was: newer themes must survive the code that is already out there.
import { isValidSeed } from '../../../src/theme/engine';
import { EMPTY_BASE, KNOB_VALUES, VALUE_LAYERS, isBase, type KnobName, type Knobs, type ThemeFile, type ThemeValues } from '../../../src/theme/look';

/** The limits of what is kept of themes. */
export const LIMITS_LOOKS = { themes: 50, nameLength: 60, fileBytes: 65536, valuesPerLayer: 600, valueLength: 200, totalBytes: 1_048_576 } as const;

const OWN_ID = /^t-[0-9a-z]{16}$/;
const APP_VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const ID_LENGTH = 16;
// control characters and the line and paragraph separators
const UNPRINTABLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const UNPRINTABLE_ONE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

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
const LATEST_FORMAT = 2;
/** A name of a value as a theme writes it: lower case, without the leading dashes. */
const VALUE_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const UNSAFE_KEYS = new Set(['__proto__']);

/** The values of a format-2 theme, layer by layer: names of the right shape with text of a sane length, the rest named. */
function parseValues(raw: unknown, dropped: string[]): ThemeValues | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    dropped.push('values');
    return undefined;
  }
  const values: ThemeValues = {};
  for (const layer of Object.keys(raw)) {
    if (UNSAFE_KEYS.has(layer)) continue;
    const layerRaw = raw[layer];
    if (!(VALUE_LAYERS as readonly string[]).includes(layer) || !isRecord(layerRaw)) {
      dropped.push(`values.${layer}`);
      continue;
    }
    const kept: Record<string, string> = Object.create(null) as Record<string, string>;
    let count = 0;
    for (const name of Object.keys(layerRaw)) {
      if (UNSAFE_KEYS.has(name)) continue;
      const value = layerRaw[name];
      const fits = VALUE_NAME.test(name) && typeof value === 'string' && value.length <= LIMITS_LOOKS.valueLength && !UNPRINTABLE_ONE.test(value);
      if (!fits || count >= LIMITS_LOOKS.valuesPerLayer) {
        dropped.push(`values.${layer}.${name}`);
        continue;
      }
      kept[name] = value;
      count += 1;
    }
    if (count > 0) values[layer as keyof ThemeValues] = { ...kept };
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

/** The format a theme is written in: 2 only when it has values of its own or the empty base. */
export function fileFormat(file: ThemeFile): 1 | 2 {
  return file.base === EMPTY_BASE || valuesCount(file.values) > 0 ? 2 : 1;
}

/** A theme as it is written: in the lowest format that holds it. */
export function written(file: ThemeFile): ThemeFile {
  const format = fileFormat(file);
  if (format === 2) return { ...file, format };
  const { values: _values, ...plain } = file;
  return { ...plain, format };
}

function valuesCount(values: ThemeValues | undefined): number {
  return values === undefined ? 0 : VALUE_LAYERS.reduce((sum, layer) => sum + Object.keys(values[layer] ?? {}).length, 0);
}

/**
 * A theme from outside (a file, a code, the hub), checked field by field: only known keys with values of their kind
 * come through, the rest falls away and is named. A later format or an unknown base is too new. Never throws.
 */
export function parseThemeFile(raw: unknown): ParsedTheme {
  try {
    if (!isRecord(raw)) return { ok: false, reason: 'not-a-theme' };
    const format = own(raw, 'format');
    if (typeof format === 'number' && Number.isInteger(format) && format > LATEST_FORMAT) return { ok: false, reason: 'too-new' };
    if (format !== 1 && format !== 2) return { ok: false, reason: 'not-a-theme' };
    const base = own(raw, 'base');
    if (base === undefined) return { ok: false, reason: 'not-a-theme' };
    if (!isBase(base) && !(format === 2 && base === EMPTY_BASE)) return { ok: false, reason: 'too-new' };
    if (new TextEncoder().encode(JSON.stringify(raw)).length > LIMITS_LOOKS.fileBytes) return { ok: false, reason: 'too-big' };

    const dropped: string[] = Object.keys(raw).filter((key) => !KNOWN.has(key) && !(format === 2 && key === 'values'));
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
    const values = format === 2 ? parseValues(own(raw, 'values'), dropped) : undefined;
    const file: ThemeFile = { format, id, name, maker, base, seed, userSeed, knobs, app };
    if (values !== undefined) file.values = values;
    return { ok: true, file, dropped };
  } catch {
    return { ok: false, reason: 'not-a-theme' };
  }
}

/** How many values a theme sets of its own: its colour, its knobs and its values. */
export function valueCount(file: ThemeFile): number {
  return (file.seed === null ? 0 : 1) + Object.keys(file.knobs).length + valuesCount(file.values);
}

