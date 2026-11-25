import { BUILT_IN, type ThemeFile } from './look';
import { rustigExpressive } from './rustig-expressive';
import type { ModePreference, ThemeSettings } from './types';

/** The theme chosen for the whole house: a theme, its base colour (null: the theme's own) and light or dark. */
export interface HouseLook { theme: string; seed: string | null; mode: ModePreference }

export const DEFAULT_HOUSE: Readonly<HouseLook> = Object.freeze({ theme: 'rustig', seed: null, mode: 'auto' });

/** What one device chose for itself. Its density stays in its theme settings, as before. */
export interface DeviceLook {
  /** Style with base colour from the house, or its own. */
  followStyle: boolean;
  /** Light or dark from the house, or its own. */
  followMode: boolean;
  theme: string;
  seed: string | null;
  mode: ModePreference;
  /** A device that may only use, with its own choice from before themes existed: kept until it follows the house. */
  fromBefore: boolean;
  /** High contrast, which every device may choose for itself. */
  helder: boolean;
  /** Dashboards with a theme of their own show the device's look instead. */
  ignoreBoards: boolean;
}

/** How a device may decide about its look: it may edit, may only use, or has no house (its own key, the example house). */
export type LookRole = 'edit' | 'use' | 'own';

export interface ChosenLook {
  file: ThemeFile;
  seed: string | null;
  mode: ModePreference;
  /** Where the style came from. */
  why: 'board' | 'device' | 'house' | 'rustig';
}

interface Choice { theme: string; seed: string | null; mode: ModePreference; why: 'device' | 'house' }

const helderFile = BUILT_IN.find((file) => file.id === 'helder')!;
const rustigFile = BUILT_IN.find((file) => file.id === 'rustig')!;

/** The colour a theme shows: its own if it keeps it, otherwise the one of the device or the house, otherwise its own. */
export const shownSeed = (file: ThemeFile, chosen: string | null): string | null => (file.seed !== null && !file.userSeed ? file.seed : chosen ?? file.seed);

/** What the device or the house says, field by field. */
function chosenBy(role: LookRole, device: DeviceLook, house: HouseLook | null): Choice {
  if (role === 'own' || house === null) return { theme: device.theme, seed: device.seed, mode: device.mode, why: 'device' };
  const ownStyle = role === 'edit' ? !device.followStyle : device.fromBefore && !device.followStyle;
  const ownMode = role === 'edit' ? !device.followMode : device.fromBefore && !device.followMode;
  return {
    theme: ownStyle ? device.theme : house.theme,
    seed: ownStyle ? device.seed : house.seed,
    mode: ownMode ? device.mode : house.mode,
    why: ownStyle ? 'device' : 'house',
  };
}

/**
 * The look a device shows on a dashboard: the dashboard's theme, then the device's or the house's, then Rustig.
 * A theme that no longer exists falls through to the next. Helder replaces the style, never the colour or light or dark.
 */
export function chooseLook(input: { role: LookRole; device: DeviceLook; house: HouseLook | null; board: string | null; themes: readonly ThemeFile[] }): ChosenLook {
  const { role, device, board, themes } = input;
  const house = role === 'own' ? null : input.house;
  const find = (id: string): ThemeFile | undefined => themes.find((file) => file.id === id);
  let choice = chosenBy(role, device, house);
  // a device whose own theme is gone falls back to the house
  if (choice.why === 'device' && house !== null && !find(choice.theme)) choice = { ...choice, theme: house.theme, seed: house.seed, why: 'house' };

  if (device.helder) return { file: helderFile, seed: choice.seed, mode: choice.mode, why: choice.why };
  const boardFile = board !== null && !device.ignoreBoards ? find(board) : undefined;
  if (boardFile) return { file: boardFile, seed: shownSeed(boardFile, choice.seed), mode: choice.mode, why: 'board' };
  const file = find(choice.theme);
  if (file) return { file, seed: shownSeed(file, choice.seed), mode: choice.mode, why: choice.why };
  return { file: rustigFile, seed: choice.seed, mode: choice.mode, why: 'rustig' };
}

/** A device after the update: what it had stays; with the default colour or automatic it follows the house in that field. */
export function deviceAfterUpdate(theme: ThemeSettings, role: LookRole): DeviceLook {
  const ownSeed = theme.seed.toLowerCase() !== rustigExpressive.color.defaultSeed;
  const ownMode = theme.mode !== 'auto';
  if (role === 'own') return { followStyle: false, followMode: false, theme: 'rustig', seed: theme.seed, mode: theme.mode, fromBefore: false, helder: false, ignoreBoards: false };
  return {
    followStyle: !ownSeed, followMode: !ownMode, theme: 'rustig', seed: ownSeed ? theme.seed : null, mode: theme.mode,
    fromBefore: role === 'use' && (ownSeed || ownMode), helder: false, ignoreBoards: false,
  };
}

/** "Voortaan het huis volgen": a one-way step for a device that may only use. */
export function followHouse(device: DeviceLook): DeviceLook {
  return { ...device, followStyle: true, followMode: true, fromBefore: false };
}
