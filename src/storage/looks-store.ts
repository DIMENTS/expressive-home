import type { DeviceLook } from '../theme/choose';
import { normalizeBoards, normalizeCount, normalizeCssFrom, normalizeLooksDoc, normalizeMode, normalizeSeed, normalizeTakenIn, normalizeThemes, type CssFrom, type LooksDoc } from '../theme/looks-doc';
import type { ThemeFile } from '../theme/look';
import { isThemeId } from '../theme/theme-file';
import { joinCss, joinThemes, looksFromStore, looksToStore, splitCss, splitThemes } from '../theme/full-themes';

/** Its own key: a page of 1.0.0 never reads it, so it can never drop it. */
export const LOOKS_KEY = 'dashboard.looks';
/** The whole themes of format 2, apart: a page of 1.1 rewrites the key above with only what it knows. */
export const FULL_LOOKS_KEY = 'dashboard.looks.full';
/** The CSS of themes, apart again: a page of 1.2 rewrites both keys above with only what it knows. */
export const CSS_LOOKS_KEY = 'dashboard.looks.css';
/** Per theme, the CSS of someone else this device allowed in full, as text: a changed CSS is not allowed. */
export const CSS_ALLOWED_KEY = 'dashboard.looks.cssAllowed';
/** The themes taken in from someone else, of this browser and of the house as last heard: a page of 1.3 rewrites the keys above. */
export const TAKEN_IN_KEY = 'dashboard.looks.takenIn';

/** What this browser keeps of looks. */
export interface StoredLooks {
  version: 1;
  /** The last role the hub gave this device; null in a browser with its own key, or before it was known. */
  role: 'edit' | 'use' | null;
  /** What this device chose; null until the first start after the update. */
  device: DeviceLook | null;
  /** Themes and dashboard themes of a browser with its own key, which has no house. */
  own: { themes: ThemeFile[]; boards: Record<string, string>; cssFrom?: Record<string, CssFrom>; takenIn?: string[] };
  /** The last that was heard of the hub, so a device starts in the right look before the hub answers. */
  hub: LooksDoc | null;
  /** The number of rescues this device last saw on the hub; null: it never saw the looks of a house. */
  rescue: number | null;
}

export interface LooksStore {
  load(): StoredLooks;
  /** False when the browser refused. */
  save(looks: StoredLooks): boolean;
}

type SimpleStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const emptyStoredLooks = (): StoredLooks => ({ version: 1, role: null, device: null, own: { themes: [], boards: {} }, hub: null, rescue: null });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const flag = (raw: unknown, fallback: boolean): boolean => (typeof raw === 'boolean' ? raw : fallback);

export function normalizeDeviceLook(raw: unknown): DeviceLook | null {
  if (!isRecord(raw)) return null;
  return {
    followStyle: flag(raw['followStyle'], true),
    followMode: flag(raw['followMode'], true),
    theme: isThemeId(raw['theme']) ? raw['theme'] : 'rustig',
    seed: normalizeSeed(raw['seed']),
    mode: normalizeMode(raw['mode']),
    fromBefore: flag(raw['fromBefore'], false),
    helder: flag(raw['helder'], false),
    ignoreBoards: flag(raw['ignoreBoards'], false),
  };
}

function normalize(raw: unknown, fullRaw: unknown, cssRaw: unknown, takenRaw: unknown): StoredLooks {
  if (!isRecord(raw) || raw['version'] !== 1) return emptyStoredLooks();
  const own = isRecord(raw['own']) ? raw['own'] : {};
  const full = isRecord(fullRaw) ? fullRaw : {};
  const css = isRecord(cssRaw) ? cssRaw : {};
  const ownThemes = joinCss(normalizeThemes(joinThemes(normalizeThemes(own['themes']), full['own'])), css['own']);
  const ownFrom = normalizeCssFrom(ownThemes.cssFrom, ownThemes.themes);
  const taken = isRecord(takenRaw) ? takenRaw : {};
  const ownTaken = normalizeTakenIn(taken['own'], ownThemes.themes);
  return {
    version: 1,
    role: raw['role'] === 'edit' || raw['role'] === 'use' ? raw['role'] : null,
    device: normalizeDeviceLook(raw['device']),
    own: {
      themes: ownThemes.themes, boards: normalizeBoards(own['boards']),
      ...(Object.keys(ownFrom).length > 0 ? { cssFrom: ownFrom } : {}), ...(ownTaken.length > 0 ? { takenIn: ownTaken } : {}),
    },
    hub: raw['hub'] === null || raw['hub'] === undefined ? null : normalizeLooksDoc(looksFromStore(raw['hub'], full['hub'], css['hub'], taken['hub'])),
    rescue: raw['rescue'] === null || raw['rescue'] === undefined ? null : normalizeCount(raw['rescue']),
  };
}

/** The looks of this browser, under their own key; reading never fails, writing says whether it worked. */
export function createLooksStore(storage: SimpleStorage): LooksStore {
  return {
    load() {
      try {
        const text = storage.getItem(LOOKS_KEY);
        if (text === null) return emptyStoredLooks();
        return normalize(JSON.parse(text), readJson(storage, FULL_LOOKS_KEY), readJson(storage, CSS_LOOKS_KEY), readJson(storage, TAKEN_IN_KEY));
      } catch {
        return emptyStoredLooks();
      }
    },
    save(looks) {
      try {
        const own = splitThemes(looks.own.themes);
        const ownCss = splitCss(looks.own.themes, looks.own.cssFrom);
        const hub = looks.hub === null ? null : looksToStore(looks.hub);
        const taken = { own: looks.own.takenIn ?? [], hub: hub?.takenIn ?? [] };
        if (taken.own.length + taken.hub.length === 0) storage.removeItem(TAKEN_IN_KEY);
        else storage.setItem(TAKEN_IN_KEY, JSON.stringify(taken));
        const css = { own: ownCss, hub: hub?.css ?? {} };
        if (Object.keys(css.own).length + Object.keys(css.hub).length === 0) storage.removeItem(CSS_LOOKS_KEY);
        else storage.setItem(CSS_LOOKS_KEY, JSON.stringify(css));
        // the whole themes first: a page that stops halfway leaves shadows that still have them
        const full = { own: own.full, hub: hub?.full ?? {} };
        if (Object.keys(full.own).length + Object.keys(full.hub).length === 0) storage.removeItem(FULL_LOOKS_KEY);
        else storage.setItem(FULL_LOOKS_KEY, JSON.stringify(full));
        const { cssFrom: _from, takenIn: _taken, ...ownRest } = looks.own;
        storage.setItem(LOOKS_KEY, JSON.stringify({ ...looks, own: { ...ownRest, themes: own.shadows }, hub: hub?.doc ?? null }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

function readJson(storage: SimpleStorage, key: string): unknown {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

/** Whether this device allowed exactly this CSS of someone else in full. */
export function allowedCss(storage: SimpleStorage, id: string, text: string): boolean {
  const allowed = readJson(storage, CSS_ALLOWED_KEY);
  return isRecord(allowed) && Object.hasOwn(allowed, id) && allowed[id] === text;
}

/** Allows this CSS of someone else in full on this device, or no longer. */
export function allowCss(storage: SimpleStorage, id: string, text: string, on: boolean): boolean {
  const before = readJson(storage, CSS_ALLOWED_KEY);
  const allowed: Record<string, string> = isRecord(before) ? Object.fromEntries(Object.entries(before).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {};
  if (on) allowed[id] = text;
  else delete allowed[id];
  try {
    storage.setItem(CSS_ALLOWED_KEY, JSON.stringify(allowed));
    return true;
  } catch {
    return false;
  }
}
