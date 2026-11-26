// Release 1.2.0 of this module, kept as it was: newer themes must survive the code that is already out there.
import type { DeviceLook } from '../../../src/theme/choose';
import { normalizeBoards, normalizeCount, normalizeLooksDoc, normalizeMode, normalizeSeed, normalizeThemes, type LooksDoc } from './looks-doc';
import type { ThemeFile } from '../../../src/theme/look';
import { isThemeId } from './theme-file';
import { joinThemes, looksFromStore, looksToStore, splitThemes } from './full-themes';

/** Its own key: a page of 1.0.0 never reads it, so it can never drop it. */
export const LOOKS_KEY = 'dashboard.looks';
/** The whole themes of format 2, apart: a page of 1.1 rewrites the key above with only what it knows. */
export const FULL_LOOKS_KEY = 'dashboard.looks.full';

/** What this browser keeps of looks. */
export interface StoredLooks {
  version: 1;
  /** The last role the hub gave this device; null in a browser with its own key, or before it was known. */
  role: 'edit' | 'use' | null;
  /** What this device chose; null until the first start after the update. */
  device: DeviceLook | null;
  /** Themes and dashboard themes of a browser with its own key, which has no house. */
  own: { themes: ThemeFile[]; boards: Record<string, string> };
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

function normalize(raw: unknown, fullRaw: unknown): StoredLooks {
  if (!isRecord(raw) || raw['version'] !== 1) return emptyStoredLooks();
  const own = isRecord(raw['own']) ? raw['own'] : {};
  const full = isRecord(fullRaw) ? fullRaw : {};
  return {
    version: 1,
    role: raw['role'] === 'edit' || raw['role'] === 'use' ? raw['role'] : null,
    device: normalizeDeviceLook(raw['device']),
    own: { themes: normalizeThemes(joinThemes(normalizeThemes(own['themes']), full['own'])), boards: normalizeBoards(own['boards']) },
    hub: raw['hub'] === null || raw['hub'] === undefined ? null : normalizeLooksDoc(looksFromStore(raw['hub'], full['hub'])),
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
        let full: unknown = null;
        try {
          full = JSON.parse(storage.getItem(FULL_LOOKS_KEY) ?? 'null');
        } catch {
          full = null;
        }
        return normalize(JSON.parse(text), full);
      } catch {
        return emptyStoredLooks();
      }
    },
    save(looks) {
      try {
        const own = splitThemes(looks.own.themes);
        const hub = looks.hub === null ? null : looksToStore(looks.hub);
        // the whole themes first: a page that stops halfway leaves shadows that still have them
        const full = { own: own.full, hub: hub?.full ?? {} };
        if (Object.keys(full.own).length + Object.keys(full.hub).length === 0) storage.removeItem(FULL_LOOKS_KEY);
        else storage.setItem(FULL_LOOKS_KEY, JSON.stringify(full));
        storage.setItem(LOOKS_KEY, JSON.stringify({ ...looks, own: { ...looks.own, themes: own.shadows }, hub: hub?.doc ?? null }));
        return true;
      } catch {
        return false;
      }
    },
  };
}
