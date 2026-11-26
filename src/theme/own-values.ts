import type { ThemeValues } from './look';
import { rustigExpressive } from './rustig-expressive';
import type { Mode } from './types';
import { entryOf } from './values/catalogue';
import { checkValue } from './values/kinds';

/** The values a theme sets itself, checked and sorted by the layer they go into, as CSS custom properties. */
export interface OwnLayers {
  roles: Record<string, string>;
  system: Record<string, string>;
  density: Record<string, string>;
  components: Record<string, string>;
}

const SYSTEM = new Set(Object.keys(rustigExpressive.system));
const empty = (): OwnLayers => ({ roles: {}, system: {}, density: {}, components: {} });

/**
 * The own values for light or dark: that mode's own before both. Only names the catalogue can set, with a value
 * their kind writes anew; everything else (unknown names, fixed names, wrong values) stays out.
 */
export function ownLayers(values: ThemeValues | undefined, mode: Mode): OwnLayers {
  const layers = empty();
  if (values === undefined) return layers;
  const merged = { ...values.both, ...values[mode] };
  for (const [name, raw] of Object.entries(merged)) {
    const entry = entryOf(name);
    if (entry === undefined) continue;
    const value = checkValue(entry.kind, raw);
    if (value === null) continue;
    const layer: keyof OwnLayers = name.startsWith('c-') ? 'roles' : name.startsWith('density-') ? 'density' : SYSTEM.has(name) ? 'system' : 'components';
    layers[layer][`--${name}`] = value;
  }
  return layers;
}
