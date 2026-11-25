import type { LooksStore, StoredLooks } from '../../storage/looks-store';
import { DEFAULT_HOUSE, chooseLook, deviceAfterUpdate, followHouse, type ChosenLook, type DeviceLook, type HouseLook, type LookRole } from '../../theme/choose';
import { BUILT_IN, type ThemeFile } from '../../theme/look';
import { emptyLooksDoc, withBoardTheme, type LooksDoc } from '../../theme/looks-doc';
import { applyLookOps, type LookOp } from '../../theme/look-ops';
import { rustigExpressive } from '../../theme/rustig-expressive';
import { LIMITS_LOOKS, isOwnThemeId } from '../../theme/theme-file';
import type { ThemeSettings } from '../../theme/types';

export interface LooksDeps {
  store: LooksStore;
  /** What this device may: its own (own key, example house), edit or use; null while the hub has not said yet. */
  role(): LookRole | null;
  /** The theme settings of 1.0.0, which keep this device's colour, light or dark, and density. */
  theme(): ThemeSettings;
  setTheme(theme: ThemeSettings): void;
  publish(): void;
  /** The example house keeps no themes. */
  demo(): boolean;
  /** Changes of the house's looks to the hub; only on a device the hub served. */
  send?(ops: LookOp[]): void;
}

export interface LookState {
  role: LookRole;
  device: DeviceLook;
  /** Null for a device of its own: there is no house. */
  house: HouseLook | null;
  /** The built-in styles first, then those of the house (or of this browser). */
  themes: readonly ThemeFile[];
  boards: Readonly<Record<string, string>>;
}

/** The fields a device that may only use can change: high contrast for itself. */
const USE_FIELDS = new Set<keyof DeviceLook>(['helder']);

/**
 * The looks of this device: what it chose itself, what the house chose, the themes there are and the dashboards with a
 * theme of their own. Decides what is shown (`chosen`), and refuses what this device may not change.
 */
export function createLooks(deps: LooksDeps) {
  let stored: StoredLooks = deps.store.load();
  /** The themes of the example house, which last until it is left. */
  let demoOwn: StoredLooks['own'] | null = null;
  /** What a layout file showed of this device in the example house, which keeps nothing of it: it lasts until it is left. */
  let demoDevice: DeviceLook | null = null;
  /** The browser refused the last save: what is stored is older than what is here. */
  let unsaved = false;

  const role = (): LookRole => deps.role() ?? stored.role ?? 'own';
  const storedDevice = (): DeviceLook => stored.device ?? deviceAfterUpdate(deps.theme(), role());
  const device = (): DeviceLook => (deps.demo() ? demoDevice : null) ?? storedDevice();
  const own = (): StoredLooks['own'] => (deps.demo() ? (demoOwn ??= structuredClone(stored.own)) : stored.own);

  function save(): void {
    unsaved = !deps.store.save(stored);
  }

  function state(): LookState {
    const current = role();
    if (current === 'own') return { role: current, device: device(), house: null, themes: [...BUILT_IN, ...own().themes], boards: own().boards };
    const hub = stored.hub;
    return { role: current, device: device(), house: hub?.house ?? { ...DEFAULT_HOUSE }, themes: [...BUILT_IN, ...(hub?.themes ?? [])], boards: hub?.boards ?? {} };
  }

  function chosen(boardId: string | null): ChosenLook {
    const { role: current, device: look, house, themes, boards } = state();
    return chooseLook({ role: current, device: look, house, board: boardId === null ? null : boards[boardId] ?? null, themes });
  }

  /** What 1.0.0 shows of this device: its own colour and light or dark stay in the old settings too. */
  function mirror(look: DeviceLook): void {
    const theme = deps.theme();
    const mine = role() === 'own';
    const seed = mine || !look.followStyle ? look.seed ?? rustigExpressive.color.defaultSeed : theme.seed;
    const mode = mine || !look.followMode ? look.mode : theme.mode;
    if (seed !== theme.seed || mode !== theme.mode) deps.setTheme({ ...theme, seed, mode });
  }

  function storeDevice(look: DeviceLook): void {
    stored = { ...stored, device: look };
    mirror(look);
    save();
    deps.publish();
  }

  /**
   * The hub said what this device may: the first time, what it had becomes its look. A device that may edit has no
   * choice "from before" any more: when it may only use again, it follows the house, and what it had stays kept.
   */
  function roleChanged(): void {
    const known = deps.role();
    if (known === null) return;
    const next = known === 'own' ? stored.role : known;
    if (stored.device !== null && stored.role === next) return;
    const look = stored.device ?? deviceAfterUpdate(deps.theme(), known);
    stored = { ...stored, role: next, device: next === 'edit' && look.fromBefore ? { ...look, fromBefore: false } : look };
    save();
    deps.publish();
  }

  /** A change of the house, by a device that may edit: shown at once, and sent to the hub. */
  function change(ops: LookOp[]): boolean {
    if (role() !== 'edit' || !deps.send) return false;
    stored = { ...stored, hub: applyLookOps(stored.hub ?? emptyLooksDoc(), ops) };
    save();
    deps.publish();
    deps.send(ops);
    return true;
  }

  function setOwn(next: StoredLooks['own']): void {
    if (deps.demo()) demoOwn = next;
    else {
      stored = { ...stored, own: next };
      save();
    }
    deps.publish();
  }

  return {
    state,
    chosen,
    roleChanged,
    /** A change of this device's own look; false when this device may not make it. */
    setDevice(change: Partial<DeviceLook>): boolean {
      if (role() === 'use' && Object.keys(change).some((key) => !USE_FIELDS.has(key as keyof DeviceLook))) return false;
      const { fromBefore: _never, ...rest } = change;
      // in the example house what is chosen by hand is kept, what a file brought is not
      if (demoDevice && deps.demo()) demoDevice = { ...demoDevice, ...rest };
      storeDevice({ ...storedDevice(), ...rest });
      return true;
    },
    /** "Voortaan het huis volgen": style, colour and light or dark come from the house. */
    followHouse(): boolean {
      if (role() === 'own') return false;
      demoDevice = null;
      storeDevice(followHouse(storedDevice()));
      return true;
    },
    /**
     * The colour and light or dark of a layout file, where this device chooses them itself: on a device of its own, and
     * where a device that may edit does not follow the house; what follows the house stays with it. In the example house
     * it lasts until that is left. Says which of the two it took.
     */
    fromFile(theme: Pick<ThemeSettings, 'seed' | 'mode'>): { seed: boolean; mode: boolean } {
      const current = role();
      const look = device();
      const seed = current === 'own' || (current === 'edit' && !look.followStyle);
      const mode = current === 'own' || (current === 'edit' && !look.followMode);
      if (!seed && !mode) return { seed, mode };
      const next = { ...look, ...(seed ? { seed: theme.seed.toLowerCase() } : {}), ...(mode ? { mode: theme.mode } : {}) };
      if (deps.demo()) {
        demoDevice = next;
        deps.publish();
      } else {
        storeDevice(next);
      }
      return { seed, mode };
    },
    /** A theme of this browser (own key, example house); on a hub the house keeps them. */
    saveTheme(file: ThemeFile): boolean {
      if (!isOwnThemeId(file.id)) return false;
      if (role() === 'edit') {
        const house = stored.hub?.themes ?? [];
        // a house with as many themes as there may be takes no new one: the hub would leave it out
        if (!house.some((item) => item.id === file.id) && house.length >= LIMITS_LOOKS.themes) return false;
        return change([{ save: file }]);
      }
      if (role() !== 'own') return false;
      const { themes, boards } = own();
      const known = themes.some((item) => item.id === file.id);
      if (!known && themes.length >= LIMITS_LOOKS.themes) return false;
      setOwn({ themes: known ? themes.map((item) => (item.id === file.id ? file : item)) : [...themes, file], boards });
      return true;
    },
    removeTheme(id: string): boolean {
      if (role() === 'edit') return state().themes.some((item) => item.id === id && isOwnThemeId(id)) && change([{ remove: id }]);
      if (role() !== 'own') return false;
      const { themes, boards } = own();
      if (!themes.some((item) => item.id === id)) return false;
      setOwn({ themes: themes.filter((item) => item.id !== id), boards: Object.fromEntries(Object.entries(boards).filter(([, theme]) => theme !== id)) });
      return true;
    },
    setBoardTheme(boardId: string, themeId: string | null): boolean {
      if (role() === 'edit') return (themeId === null || state().themes.some((item) => item.id === themeId)) && change([{ board: boardId, theme: themeId }]);
      if (role() !== 'own') return false;
      const { themes, boards } = own();
      if (themeId !== null && !state().themes.some((item) => item.id === themeId)) return false;
      setOwn({ themes, boards: withBoardTheme(boards, boardId, themeId) });
      return true;
    },
    /** The theme of the house: only a device that may edit chooses it. Only what changes is sent. */
    setHouse(house: Partial<HouseLook>): boolean {
      const current = state().house;
      if (current === null) return false;
      if (house.theme !== undefined && !state().themes.some((item) => item.id === house.theme)) return false;
      const changed: Partial<HouseLook> = {};
      if (house.theme !== undefined && house.theme !== current.theme) changed.theme = house.theme;
      const seed = house.seed === undefined ? undefined : house.seed?.toLowerCase() ?? null;
      if (seed !== undefined && seed !== current.seed) changed.seed = seed;
      if (house.mode !== undefined && house.mode !== current.mode) changed.mode = house.mode;
      // nothing changes: there is nothing to send
      if (Object.keys(changed).length === 0) return role() === 'edit' && deps.send !== undefined;
      return change([{ house: changed }]);
    },
    /**
     * What the hub has now; kept, so the next start shows it at once. When the owner put everything back in Rustig since
     * this device last looked, it follows the house again, Helder stays if it was on. The first time it sees a house, an
     * earlier rescue is not for it.
     */
    adoptHub(doc: LooksDoc): void {
      const rescued = stored.rescue !== null && doc.rescue > stored.rescue && role() !== 'own';
      stored = { ...stored, hub: doc, rescue: doc.rescue };
      if (rescued) storeDevice({ ...followHouse(storedDevice()), ignoreBoards: false });
      else {
        save();
        deps.publish();
      }
    },
    /**
     * Another tab changed what is stored; a page of 1.0.0 only writes the old settings, which then win. When this
     * browser refused the last save, what is stored is older than what is here, and what is here stays.
     */
    reload(): void {
      if (!unsaved) stored = deps.store.load();
      // what is stored wins, also over what a file showed in the example house
      demoDevice = null;
      const look = stored.device;
      const theme = deps.theme();
      if (look !== null) {
        const mine = role() === 'own';
        const seed = (mine || !look.followStyle) && (look.seed ?? rustigExpressive.color.defaultSeed) !== theme.seed ? theme.seed : look.seed;
        const mode = (mine || !look.followMode) && look.mode !== theme.mode ? theme.mode : look.mode;
        if (seed !== look.seed || mode !== look.mode) {
          stored = { ...stored, device: { ...look, seed, mode } };
          save();
        }
      }
      deps.publish();
    },
    /** This device was taken away from the hub: what it knew of the house goes, what it chose itself stays. */
    forgetHouse(): void {
      stored = { ...stored, role: null, hub: null, rescue: null };
      save();
      deps.publish();
    },
    leaveDemo(): void {
      demoOwn = null;
      demoDevice = null;
      deps.publish();
    },
  };
}

export type Looks = ReturnType<typeof createLooks>;
