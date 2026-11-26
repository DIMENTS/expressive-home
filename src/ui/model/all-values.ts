import type { MessageKey, Translate } from '../../i18n';
import { VALUE_LAYERS, type ThemeFile, type ThemeValues, type ValueLayer } from '../../theme/look';
import { betterText, dangerStandsOut, legibility, TEXT_PAIRS } from '../../theme/legible';
import { computeLook, styleOf } from '../../theme/styles';
import type { Mode } from '../../theme/types';
import { CATALOGUE, LISTED_NAMES, entryOf, type Entry, type Group } from '../../theme/values/catalogue';
import { checkValue, type Kind } from '../../theme/values/kinds';

/** "Tegel aan: achtergrond": the words of a listed value; null for the rest, which only has its technical name. */
export function wordsOf(entry: Entry, t: Translate): string | null {
  if (!entry.words) return null;
  const [part, role] = entry.words;
  return `${t(`values.part.${part}` as MessageKey)}: ${t(`values.role.${role}` as MessageKey)}`;
}

const LISTED_ORDER = new Map(LISTED_NAMES.map((name, index) => [name, index]));

/** The rows to show: the list (and the rest when asked, after it), in a group or all, matching what was typed. */
export function shownRows(input: { group: Group | null; query: string; rest: boolean; t: Translate }): Entry[] {
  const wanted = input.query.trim().toLowerCase();
  const rows = CATALOGUE.filter((entry) => {
    if (!entry.listed && !input.rest) return false;
    if (input.group !== null && entry.group !== input.group) return false;
    if (wanted === '') return true;
    return entry.name.includes(wanted) || (wordsOf(entry, input.t)?.toLowerCase().includes(wanted) ?? false);
  });
  const order = (entry: Entry): number => LISTED_ORDER.get(entry.name) ?? LISTED_ORDER.size;
  return rows.sort((a, b) => order(a) - order(b));
}

/** What a theme sets itself for a name in a layer; null when it leaves it to its base. */
export function ownValue(values: ThemeValues | undefined, layer: ValueLayer, name: string): string | null {
  return values?.[layer]?.[name] ?? null;
}

/**
 * The values with one set (written anew by its kind) or taken out (null). A value its kind refuses, or a name that
 * cannot be set, changes nothing: the same object comes back.
 */
export function setValue(values: ThemeValues, layer: ValueLayer, name: string, raw: string | null): ThemeValues {
  const entry = entryOf(name);
  if (!entry || entry.kind.kind === 'fixed') return values;
  const next: ThemeValues = {};
  for (const key of VALUE_LAYERS) if (values[key]) next[key] = { ...values[key] };
  if (raw === null) {
    if (!next[layer] || !Object.hasOwn(next[layer], name)) return values;
    delete next[layer][name];
    if (Object.keys(next[layer]).length === 0) delete next[layer];
    return next;
  }
  const value = checkValue(entry.kind, raw);
  if (value === null) return values;
  next[layer] = { ...next[layer], [name]: value };
  return next;
}

type Ranged = Extract<Kind, { min: number; max: number }>;
const ranged = (kind: Kind): Ranged | null => ('min' in kind ? kind : null);
const unitOf = (kind: Kind): string => (kind.kind === 'size' || kind.kind === 'sizes' ? kind.unit : kind.kind === 'corner' ? 'px' : '');

/** Where a value lies on its slider, 0 to 1; null for a value without one (a colour, a choice, a reference). */
export function fractionOf(kind: Kind, value: string): number | null {
  if (kind.kind === 'weight') {
    const weight = Number(value);
    return Number.isFinite(weight) ? (weight - 100) / 800 : null;
  }
  const range = ranged(kind);
  if (!range) return null;
  const match = /^(-?[\d.]+)/.exec(value.split(' ')[0]!);
  if (!match) return null;
  return Math.min(1, Math.max(0, (Number(match[1]) - range.min) / (range.max - range.min)));
}

/** The value at a place on the slider, written as its kind writes it. */
export function valueAt(kind: Kind, fraction: number): string | null {
  const at = Math.min(1, Math.max(0, fraction));
  if (kind.kind === 'weight') return String(100 + Math.round(at * 8) * 100);
  const range = ranged(kind);
  if (!range) return null;
  const raw = range.min + at * (range.max - range.min);
  const step = range.max - range.min > 20 ? 1 : 0.01;
  const value = Math.round(raw / step) * step;
  return checkValue(kind, `${Math.round(value * 100) / 100}${unitOf(kind)}`);
}

/** Undo and redo for the editor, step by step. */
export function createSteps<T>(first: T) {
  const done: T[] = [first];
  const undone: T[] = [];
  return {
    push(state: T): void {
      done.push(state);
      undone.length = 0;
    },
    undo(): T | null {
      if (done.length < 2) return null;
      undone.push(done.pop()!);
      return done.at(-1)!;
    },
    redo(): T | null {
      const state = undone.pop();
      if (state === undefined) return null;
      done.push(state);
      return state;
    },
    /** The last step again, changed: typing in one field is one step, not one per key. */
    replace(state: T): void {
      if (done.length < 2) { this.push(state); return; }
      done[done.length - 1] = state;
      undone.length = 0;
    },
    get canUndo(): boolean { return done.length > 1; },
    get canRedo(): boolean { return undone.length > 0; },
  };
}

export interface PoorPlace { mode: Mode; id: string }

const tokensOf = (file: ThemeFile, seed: string, mode: Mode): Record<string, string> => computeLook(styleOf(file), { seed, mode, density: 'comfortable' }, false);

/** The places that are hard to read with this theme, in light and in dark. */
export function poorList(file: ThemeFile, seed: string): PoorPlace[] {
  return (['light', 'dark'] as const).flatMap((mode) => legibility(tokensOf(file, seed, mode)).filter((result) => !result.ok).map((result) => ({ mode, id: result.id })));
}

/** Whether danger still stands out from a plain tile, in light and in dark. */
export const dangerClear = (file: ThemeFile, seed: string): boolean => (['light', 'dark'] as const).every((mode) => dangerStandsOut(tokensOf(file, seed, mode)));

/** "Kleur aanpassen": the text of each place that is hard to read becomes black or white, in the mode it is hard in. */
export function fixPoor(file: ThemeFile, seed: string, poor: readonly PoorPlace[]): ThemeValues {
  let values: ThemeValues = file.values ?? {};
  for (const { mode, id } of poor) {
    const pair = TEXT_PAIRS.find((item) => item.id === id);
    if (!pair) continue;
    const better = betterText(tokensOf({ ...file, values }, seed, mode), id);
    if (better) values = setValue(values, mode, pair.fg.slice(2), better);
  }
  return values;
}
