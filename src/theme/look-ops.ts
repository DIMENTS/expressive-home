import type { HouseLook } from './choose';
import { isValidSeed } from './engine';
import type { ThemeFile } from './look';
import { isCssFrom, normalizeBoards, withBoardTheme, type CssFrom, type LooksDoc } from './looks-doc';
import { LIMITS_LOOKS, isOwnThemeId, isThemeId, parseThemeFile } from './theme-file';
import { MODE_PREFERENCES, type ModePreference } from './types';
import { sanitizeCss } from './css/sanitize';

/**
 * A change of the house's looks, as a device asks for it and the hub applies it. A change of the house names only
 * what changes, so what another device or a flow changed meanwhile stays.
 */
export type LookOp =
  | { house: Partial<HouseLook> } | { save: ThemeFile } | { remove: string } | { board: string; theme: string | null }
  /** The CSS of a theme, and where it comes from; null clears it. A save never touches CSS: a page of 1.2 does not send it. */
  | { css: { id: string; text: string | null; from: CssFrom } }
  /** Whether a theme was taken in from someone else. Sent on its own: a hub of 1.3 refuses what it does not know. */
  | { takenIn: { id: string; on: boolean } };

/** The size of a text as it is kept. */
const bytes = (text: string): number => new TextEncoder().encode(text).length;

/** More than any one change needs. */
const MAX_OPS = 20;
const MODES: readonly unknown[] = MODE_PREFERENCES;
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
  if (keys === 'css') {
    const css = raw['css'];
    if (!isRecord(css) || Object.keys(css).sort().join(',') !== 'from,id,text') return null;
    const { id, text, from } = css;
    if (!isOwnThemeId(id) || !isCssFrom(from) || !(text === null || (typeof text === 'string' && bytes(text) <= LIMITS_LOOKS.fileBytes))) return null;
    // read once as the page will: CSS that cannot be read in reasonable time is refused here already
    if (text !== null) {
      try {
        sanitizeCss(text, { list: 'wide', keyframes: 'k' });
      } catch {
        return null;
      }
    }
    return { css: { id, text, from } };
  }
  if (keys === 'takenIn') {
    const mark = raw['takenIn'];
    if (!isRecord(mark) || Object.keys(mark).sort().join(',') !== 'id,on' || !isOwnThemeId(mark['id']) || typeof mark['on'] !== 'boolean') return null;
    return { takenIn: { id: mark['id'], on: mark['on'] } };
  }
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

function withTakenIn(doc: LooksDoc, takenIn: string[]): LooksDoc {
  const { takenIn: _was, ...plain } = doc;
  return takenIn.length > 0 ? { ...plain, takenIn } : plain;
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
      // the CSS a theme has stays, whatever the save says: only its own operation changes it
      const { css: _sent, ...saved } = op.save;
      const before = next.themes.find((file) => file.id === op.save.id);
      const file: ThemeFile = before?.css ? { ...saved, css: before.css } : saved;
      if (before) next = { ...next, themes: next.themes.map((item) => (item.id === file.id ? file : item)) };
      else if (next.themes.length < LIMITS_LOOKS.themes) next = { ...next, themes: [...next.themes, file] };
    } else if ('css' in op) {
      const { id, text, from } = op.css;
      if (!next.themes.some((file) => file.id === id)) continue;
      const { [id]: _old, ...others } = next.cssFrom ?? {};
      const cleared = text === null || text.trim() === '';
      const themes = next.themes.map((file): ThemeFile => {
        if (file.id !== id) return file;
        const { css: _gone, ...rest } = file;
        return cleared ? rest : { ...rest, format: 2, css: { version: 1, text: text! } };
      });
      // a theme with its CSS stays a theme that can be taken in again
      if (bytes(JSON.stringify(themes.find((file) => file.id === id))) > LIMITS_LOOKS.fileBytes) continue;
      next = { ...next, themes };
      const cssFrom = cleared ? others : { ...others, [id]: from };
      const { cssFrom: _was, ...plain } = next;
      next = Object.keys(cssFrom).length > 0 ? { ...plain, cssFrom } : plain;
    } else if ('takenIn' in op) {
      const { id, on } = op.takenIn;
      if (!next.themes.some((file) => file.id === id)) continue;
      next = withTakenIn(next, (next.takenIn ?? []).filter((item) => item !== id).concat(on ? [id] : []));
    } else if ('remove' in op) {
      const { [op.remove]: _css, ...cssFrom } = next.cssFrom ?? {};
      const { cssFrom: _was, takenIn: _marked, ...plain } = next;
      const takenIn = (next.takenIn ?? []).filter((item) => item !== op.remove);
      next = {
        ...plain,
        ...(Object.keys(cssFrom).length > 0 ? { cssFrom } : {}),
        ...(takenIn.length > 0 ? { takenIn } : {}),
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
