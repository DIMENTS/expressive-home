import { EXTRA_ROLES, COLOR_ROLES, colorTokens, isValidSeed, resolveMode, type SchemeName } from './engine';
import { CONTRASTS, SCHEMES, knobComponents, knobSystem } from './knobs';
import { BASE_COMPONENTS, BASE_KNOBS, DASHBOARD_ROLES } from './bases';
import { RUSTIG_KNOBS, type Knobs, type ThemeBase, type ThemeFile, type ThemeValues } from './look';
import { LEEG_COMPONENTS, LEEG_SYSTEM, chosenAccent, leegColours } from './leeg';
import { ownLayers } from './own-values';

export { PROTECTED_NAMES } from './bases';
import { rustigExpressive } from './rustig-expressive';
import { SHAPE_TOKENS } from './shapes';
import type { Mode, ShownSettings } from './types';

/** A theme worked out: its colour calculation, its knobs and what it sets in layers 2 and 3 on top of Rustig. */
export interface Style {
  base: ThemeBase;
  knobs: Knobs;
  scheme: SchemeName;
  contrast: number;
  system: Record<string, string>;
  components: Record<string, string>;
  /** What the theme sets itself, over all of the above. */
  values?: ThemeValues;
}

/** Danger is red in every style: the error roles of Rustig's calculation; only a higher contrast makes them stronger. */
export function dangerRoles(seed: string, mode: Mode, contrast: number): Record<string, string> {
  return Object.fromEntries(Object.entries(colorTokens(seed, mode, contrast)).filter(([name]) => DASHBOARD_ROLES.has(name)));
}

/** A theme as a style: the knobs of its base, then its own. */
export function styleOf(file: ThemeFile): Style {
  if (file.base === 'leeg') {
    // the knobs are about Material; the empty base has none of it
    return {
      base: 'leeg', knobs: { ...RUSTIG_KNOBS }, scheme: SCHEMES.normal, contrast: CONTRASTS.normal, system: { ...LEEG_SYSTEM }, components: { ...LEEG_COMPONENTS },
      ...(file.values === undefined ? {} : { values: file.values }),
    };
  }
  const knobs: Knobs = { ...RUSTIG_KNOBS, ...BASE_KNOBS[file.base], ...file.knobs };
  return {
    base: file.base,
    knobs,
    scheme: SCHEMES[knobs.strength],
    contrast: CONTRASTS[knobs.contrast],
    system: knobSystem(knobs),
    components: { ...BASE_COMPONENTS[file.base], ...knobComponents(knobs) },
    ...(file.values === undefined ? {} : { values: file.values }),
  };
}

const withDashes = (values: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(values).map(([name, value]) => [`--${name}`, value]));

/** Every CSS custom property of a style: colour roles, the four shapes, then layer 2, density and layer 3. */
export function computeLook(style: Style, settings: ShownSettings, systemPrefersDark: boolean): Record<string, string> {
  const seed = isValidSeed(settings.seed) ? settings.seed : rustigExpressive.color.defaultSeed;
  const mode = resolveMode(settings.mode, systemPrefersDark);
  const own = ownLayers(style.values, mode);
  const leeg = style.base === 'leeg' ? leegColours(mode, chosenAccent(seed)) : null;
  return {
    ...(leeg ? leeg.roles : colorTokens(seed, mode, style.contrast, style.scheme)),
    ...own.roles,
    ...dangerRoles(seed, mode, style.contrast),
    ...SHAPE_TOKENS,
    ...withDashes({ ...rustigExpressive.system, ...style.system }),
    ...own.system,
    ...withDashes(rustigExpressive.density[settings.density]),
    ...own.density,
    ...withDashes({ ...rustigExpressive.components, ...style.components }),
    ...leeg?.marks,
    ...own.components,
  };
}


/**
 * The colour roles of a seed in this style (without the error roles) and layer 3 again, for one section: a CSS
 * variable resolves where it is declared, so layer 3 must be declared on the section to follow its roles.
 */
export function sectionLook(style: Style, seed: string, mode: Mode): Record<string, string> {
  if (style.base === 'leeg') {
    const leeg = leegColours(mode, seed);
    return { ...leeg.roles, ...withDashes({ ...rustigExpressive.components, ...style.components }), ...leeg.marks, ...ownLayers(style.values, mode).components };
  }
  const roles = Object.entries(colorTokens(seed, mode, style.contrast, style.scheme)).filter(([name]) => !DASHBOARD_ROLES.has(name));
  // the section's own colour wins over the theme's roles; what the theme sets of the parts stays
  return { ...Object.fromEntries(roles), ...withDashes({ ...rustigExpressive.components, ...style.components }), ...ownLayers(style.values, mode).components };
}

/** The names a section palette sets; the same for every style and seed. */
export const SECTION_NAMES: readonly string[] = Object.freeze([
  ...[...COLOR_ROLES, ...EXTRA_ROLES].map((role) => `--c-${role}`).filter((name) => !DASHBOARD_ROLES.has(name)),
  ...Object.keys(rustigExpressive.components).map((name) => `--${name}`),
]);
