import { LIMITS } from '../layout/types';
import { DEFAULT_HOUSE, type HouseLook } from './choose';
import { isValidSeed } from './engine';
import type { ThemeFile } from './look';
import { LIMITS_LOOKS, isOwnThemeId, isThemeId, parseThemeFile } from './theme-file';
import { MODE_PREFERENCES, type ModePreference } from './types';

/** What a hub keeps of looks: the house's theme, the themes of the house and a theme per dashboard. */
export interface LooksDoc {
  revision: number;
  house: HouseLook;
  themes: ThemeFile[];
  /** Dashboard id → theme id, for the dashboards with a theme of their own. */
  boards: Record<string, string>;
  /** How often the owner put every device back in Rustig: a device that sees a higher number than it knows follows the house again. */
  rescue: number;
  /** Where the CSS of a theme comes from, for the themes that have CSS: written in this house, or taken in from someone else. */
  cssFrom?: Record<string, CssFrom>;
  /** The themes taken in from someone else, never sent in to the gallery as made here; kept apart from what older versions read. */
  takenIn?: string[];
}

export type CssFrom = 'house' | 'other';
export const isCssFrom = (raw: unknown): raw is CssFrom => raw === 'house' || raw === 'other';

export const emptyLooksDoc = (): LooksDoc => ({ revision: 0, house: { ...DEFAULT_HOUSE }, themes: [], boards: {}, rescue: 0 });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const MODES: readonly ModePreference[] = MODE_PREFERENCES;
/** A dashboard that can have a theme: never the rooms, which follow the house. */
const BOARD_ID = /^(?!view:|room:)[a-z0-9_-][a-z0-9:_-]{0,59}$/i;

export const normalizeMode = (raw: unknown): ModePreference => (MODES.includes(raw as ModePreference) ? (raw as ModePreference) : 'auto');
export const normalizeSeed = (raw: unknown): string | null => (typeof raw === 'string' && isValidSeed(raw) ? raw.toLowerCase() : null);

export function normalizeHouse(raw: unknown): HouseLook {
  if (!isRecord(raw)) return { ...DEFAULT_HOUSE };
  return { theme: isThemeId(raw['theme']) ? raw['theme'] : DEFAULT_HOUSE.theme, seed: normalizeSeed(raw['seed']), mode: normalizeMode(raw['mode']) };
}

/** Themes someone made, each checked; built-in ids, twins and what is beyond the limit are left out. */
export function normalizeThemes(raw: unknown): ThemeFile[] {
  if (!Array.isArray(raw)) return [];
  const themes: ThemeFile[] = [];
  for (const item of raw) {
    if (themes.length >= LIMITS_LOOKS.themes) break;
    if (!isRecord(item) || !isOwnThemeId(item['id']) || themes.some((file) => file.id === item['id'])) continue;
    const parsed = parseThemeFile(item);
    if (parsed.ok) themes.push(parsed.file);
  }
  return themes;
}

/** The dashboards with a theme of their own, the newest last; the newest as many as there can be dashboards are kept. */
export function normalizeBoards(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};
  const boards = Object.entries(raw).filter((entry): entry is [string, string] => BOARD_ID.test(entry[0]) && isThemeId(entry[1]));
  return Object.fromEntries(boards.slice(-LIMITS.dashboards));
}

/**
 * A dashboard with a theme of its own (null: like the house again), as the newest. There are never more of them than
 * there can be dashboards: one that is gone stays behind, so a new one takes the place of the oldest.
 */
export function withBoardTheme(boards: Readonly<Record<string, string>>, board: string, theme: string | null): Record<string, string> {
  const { [board]: _old, ...rest } = boards;
  if (theme === null) return rest;
  return Object.fromEntries(Object.entries({ ...rest, [board]: theme }).slice(-LIMITS.dashboards));
}

/** A count that only goes up from 0; anything else is 0. */
export const normalizeCount = (raw: unknown): number => (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : 0);

/** The origins of CSS, only for themes that are there and have CSS. */
export function normalizeCssFrom(raw: unknown, themes: readonly ThemeFile[]): Record<string, CssFrom> {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(themes.filter((file) => file.css !== undefined && Object.hasOwn(raw, file.id) && isCssFrom(raw[file.id])).map((file) => [file.id, raw[file.id] as CssFrom]));
}

/** The themes taken in from someone else: only themes that are there, once each. */
export function normalizeTakenIn(raw: unknown, themes: readonly ThemeFile[]): string[] {
  if (!Array.isArray(raw)) return [];
  return themes.filter((file) => raw.includes(file.id)).map((file) => file.id);
}

export function normalizeLooksDoc(raw: unknown): LooksDoc {
  if (!isRecord(raw)) return emptyLooksDoc();
  const themes = normalizeThemes(raw['themes']);
  const cssFrom = normalizeCssFrom(raw['cssFrom'], themes);
  const takenIn = normalizeTakenIn(raw['takenIn'], themes);
  return {
    revision: normalizeCount(raw['revision']),
    house: normalizeHouse(raw['house']),
    themes,
    boards: normalizeBoards(raw['boards']),
    rescue: normalizeCount(raw['rescue']),
    ...(Object.keys(cssFrom).length > 0 ? { cssFrom } : {}),
    ...(takenIn.length > 0 ? { takenIn } : {}),
  };
}

/** The size of all themes together, as they are sent and kept. */
export const themesBytes = (themes: readonly ThemeFile[]): number => new TextEncoder().encode(JSON.stringify(themes)).length;

/** Whether a change keeps the themes within the limit of all together; one that makes them smaller always does. */
export function withinTotal(before: LooksDoc, after: LooksDoc): boolean {
  const size = themesBytes(after.themes);
  return size <= LIMITS_LOOKS.totalBytes || size <= themesBytes(before.themes);
}
