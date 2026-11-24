/**
 * A place or size measured on the screen, as a CSS length for a custom property set through the CSSOM (the content
 * security policy allows no style attribute). Only for geometry that is measured at that moment, never for a design
 * value: those come from the theme.
 */
export function pixels(measured: number): string {
  return `${Math.round(measured * 100) / 100}px`;
}
