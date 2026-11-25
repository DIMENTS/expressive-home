import type { MessageKey, Translate } from '../../i18n';
import type { DeviceLook, HouseLook, LookRole } from '../../theme/choose';
import { legibility } from '../../theme/legible';
import { isBase, type ThemeFile } from '../../theme/look';
import { rustigExpressive } from '../../theme/rustig-expressive';
import { computeLook, styleOf } from '../../theme/styles';
import type { ModePreference } from '../../theme/types';

/** Where a change in the theme panel goes: this device, or the whole house. */
export type LookTarget = 'device' | 'house';

/** What the theme panel shows as chosen: a theme, its base colour and light or dark. */
export interface LookChoice { theme: string; seed: string; mode: ModePreference }

/** The name of a theme as people read it: built-in styles in the language of the app. */
export function themeName(file: ThemeFile, t: Translate): string {
  if (isBase(file.id)) return t(`theme.style.${file.id}` as MessageKey);
  return file.name || t('theme.unnamed');
}

/** The line under a theme's name. */
export function themeNote(file: ThemeFile, role: LookRole, t: Translate): string {
  if (isBase(file.id)) return t(file.id === 'helder' ? 'theme.builtInHelder' : 'theme.builtIn');
  if (file.maker) return t('theme.by', { maker: file.maker });
  return t(role === 'own' ? 'theme.ownMade' : 'theme.ofHouse');
}

/** Where changes go now: a device of its own has no house, a device that may only use changes nothing of it. */
export function lookTarget(role: LookRole, device: DeviceLook): LookTarget {
  if (role === 'own') return 'device';
  if (role === 'use') return 'house';
  return device.followStyle && device.followMode ? 'house' : 'device';
}

/** What the panel shows as chosen, field by field from the device or the house. */
export function lookChoice(role: LookRole, device: DeviceLook, house: HouseLook | null): LookChoice {
  const fromHouse = (follow: boolean): boolean => house !== null && (role === 'use' ? !device.fromBefore || follow : role === 'edit' && follow);
  const styleOwner = fromHouse(device.followStyle) ? house! : device;
  return {
    theme: styleOwner.theme,
    seed: styleOwner.seed ?? rustigExpressive.color.defaultSeed,
    mode: fromHouse(device.followMode) ? house!.mode : device.mode,
  };
}

const MODE_KEYS: Record<ModePreference, MessageKey> = { light: 'theme.mode.light', dark: 'theme.mode.dark', auto: 'theme.mode.auto' };

/** "Glas, automatisch": a look in a few words. */
export function lookWords(theme: string, mode: ModePreference, themes: readonly ThemeFile[], t: Translate): string {
  const file = themes.find((item) => item.id === theme);
  return t('theme.lookName', { style: file ? themeName(file, t) : t('theme.style.rustig'), mode: t(MODE_KEYS[mode]).toLowerCase() });
}

/** In how many places text is hard to read with a theme in this colour, light or dark: a place counts once. */
export function poorPlaces(file: ThemeFile, seed: string): number {
  const style = styleOf(file);
  const poor = new Set<string>();
  for (const mode of ['light', 'dark'] as const) {
    for (const result of legibility(computeLook(style, { seed, mode, density: 'comfortable' }, false))) if (!result.ok) poor.add(result.id);
  }
  return poor.size;
}
