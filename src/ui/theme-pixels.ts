import { rustigExpressive } from '../theme/rustig-expressive';

/**
 * A size of layer 2 or 3 as a number of pixels, for geometry that code works out itself (the waves are SVG paths in
 * pixel units, a menu keeps its distance from the edge of the window). The theme stays the one place for the value; a name that holds no pixel size is a mistake.
 */
export function themePixels(name: string): number {
  const value = ({ ...rustigExpressive.system, ...rustigExpressive.components } as Record<string, string | undefined>)[name];
  const match = value === undefined ? null : /^(-?\d*\.?\d+)px$/.exec(value.trim());
  if (!match) throw new Error(`The theme has no size in pixels called ${name}`);
  return Number(match[1]);
}
