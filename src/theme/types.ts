export type Mode = 'light' | 'dark';
export type ModePreference = 'auto' | 'sun' | Mode;
/** Every choice of light and dark, as it is kept. */
export const MODE_PREFERENCES: readonly ModePreference[] = ['auto', 'sun', 'light', 'dark'];
export type Density = 'comfortable' | 'compact';
/** What is shown: the owner's choice, or the sizes of a phone in a narrow window. */
export type ShownDensity = Density | 'phone';
export interface ThemeSettings { seed: string; mode: ModePreference; density: Density }
export type ShownSettings = Omit<ThemeSettings, 'density'> & { density: ShownDensity };
export interface ThemeDefinition {
  id: string; name: string;
  color: { variant: 'tonalSpot'; contrast: number; defaultSeed: string; presets: { id: string; seed: string }[] };
  /** Layer 2 without colour: token name without the leading dashes -> CSS value. */
  system: Record<string, string>;
  density: Record<ShownDensity, Record<string, string>>;
  /** Layer 3: token name -> CSS value that refers to layer 2 with var(). */
  components: Record<string, string>;
}
