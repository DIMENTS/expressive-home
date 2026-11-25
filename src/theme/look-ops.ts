import type { HouseLook } from './choose';
import { isValidSeed } from './engine';
import type { ThemeFile } from './look';
import { normalizeBoards, withBoardTheme, type LooksDoc } from './looks-doc';
import { LIMITS_LOOKS, isOwnThemeId, isThemeId, parseThemeFile } from './theme-file';
import type { ModePreference } from './types';

/**
 * A change of the house's looks, as a device asks for it and the hub applies it. A change of the house names only
 * what changes, so what another device or a flow changed meanwhile stays.
 */
export type LookOp = { house: Partial<HouseLook> } | { save: ThemeFile } | { remove: string } | { board: string; theme: string | null };

/** More than any one change needs. */
const MAX_OPS = 20;
const MODES: readonly unknown[] = ['auto', 'light', 'dark'] satisfies ModePreference[];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** What changes of the house: at least one field, each one checked; null when something is not right. */
function parseHouse(raw: Record<string, unknown>): Partial<HouseLook> | null {
  const keys = Object.keys(raw);
  if (keys.length === 0 || keys.some((key) => key !== 'theme' && key !== 'seed' && key !== 'mode')) return null;
  const house: Partial<HouseLook> = {};
  if ('theme' in raw) {
    if (!isThemeId(raw['theme'])) return null;
    house.theme = raw['theme'];
  }
  if ('seed' in raw) {
    const seed = raw['seed'];
    if (seed !== null && !(typeof seed === 'string' && isValidSeed(seed))) return null;
    house.seed = seed === null ? null : seed.toLowerCase();
  }
  if ('mode' in raw) {
    if (!MODES.includes(raw['mode'])) return null;
    house.mode = raw['mode'] as ModePreference;
  }
  return house;
}

function parseOne(raw: unknown): LookOp | null {
  if (!isRecord(raw)) return null;
  const keys = Object.keys(raw).sort().join(',');
  if (keys === 'house') {
    const house = isRecord(raw['house']) ? parseHouse(raw['house']) : null;
    return house ? { house } : null;
  }
  if (keys === 'save') {
    if (!isRecord(raw['save']) || !isOwnThemeId(raw['save']['id'])) return null;
    const parsed = parseThemeFile(raw['save']);
    return parsed.ok ? { save: parsed.file } : null;
  }
  if (keys === 'remove') return isOwnThemeId(raw['remove']) ? { remove: raw['remove'] } : null;
  if (keys === 'board,theme') {
    const board = raw['board'];
    const theme = raw['theme'];
    if (typeof board !== 'string' || (theme !== null && !isThemeId(theme))) return null;
    const known = Object.keys(normalizeBoards({ [board]: 'rustig' }));
    return known.length === 1 ? { board, theme: theme as string | null } : null;
  }
  return null;
}

/** The operations a device sent, each checked; null when any of them is not one. */
export function parseLookOps(raw: unknown): LookOp[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_OPS) return null;
  const ops: LookOp[] = [];
  for (const item of raw) {
    const op = parseOne(item);
    if (!op) return null;
    ops.push(op);
  }
  return ops;
}

/**
 * The operations applied in order, to a copy. A theme that does not exist is never chosen, what else changes of the
 * house is; removing a theme sends the house back to Rustig and the dashboards that had it back to the house. The
 * revision is the caller's.
 */
export function applyLookOps(doc: LooksDoc, ops: readonly LookOp[]): LooksDoc {
  let next: LooksDoc = structuredClone(doc);
  const exists = (id: string): boolean => !isOwnThemeId(id) || next.themes.some((file) => file.id === id);
  for (const op of ops) {
    if ('house' in op) {
      const { theme, ...rest } = op.house;
      next = { ...next, house: { ...next.house, ...rest, ...(theme !== undefined && exists(theme) ? { theme } : {}) } };
    } else if ('save' in op) {
      const known = next.themes.some((file) => file.id === op.save.id);
      if (known) next = { ...next, themes: next.themes.map((file) => (file.id === op.save.id ? op.save : file)) };
      else if (next.themes.length < LIMITS_LOOKS.themes) next = { ...next, themes: [...next.themes, op.save] };
    } else if ('remove' in op) {
      next = {
        ...next,
        themes: next.themes.filter((file) => file.id !== op.remove),
        house: next.house.theme === op.remove ? { ...next.house, theme: 'rustig' } : next.house,
        boards: Object.fromEntries(Object.entries(next.boards).filter(([, theme]) => theme !== op.remove)),
      };
    } else if (op.theme === null || exists(op.theme)) {
      next = { ...next, boards: withBoardTheme(next.boards, op.board, op.theme) };
    }
  }
  return next;
}
