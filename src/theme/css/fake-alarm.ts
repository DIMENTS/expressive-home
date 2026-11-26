import { coloursOf, type Rgba } from '../legible';
import { sanitizeCss } from './sanitize';

const NEAR = 0.04;
const distance = (a: Rgba, b: Rgba): number => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) / Math.sqrt(3);
/** What paints the face of a tile: its background in every form, and a shadow inside it. */
const PAINTING = new Set(['background', 'background-color', 'background-image', 'box-shadow']);

function hexColour(hex: string): Rgba {
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
  return { r: parseInt(full.slice(0, 2), 16) / 255, g: parseInt(full.slice(2, 4), 16) / 255, b: parseInt(full.slice(4, 6), 16) / 255, a: 1 };
}

/** Every colour a written value names: hex colours, rgb() and references to the theme. */
function coloursIn(value: string, tokens: Record<string, string>): Rgba[] {
  const found: Rgba[] = [];
  for (const match of value.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/gi)) found.push(hexColour(match[1]!.toLowerCase()));
  for (const match of value.matchAll(/rgba?\(([^)]*)\)/gi)) {
    const parts = match[1]!.split(/[\s,/]+/).filter(Boolean).slice(0, 3);
    const channel = (part: string): number => (part.endsWith('%') ? Number(part.slice(0, -1)) / 100 : Number(part) / 255);
    if (parts.length === 3 && parts.every((part) => Number.isFinite(channel(part)))) found.push({ r: channel(parts[0]!), g: channel(parts[1]!), b: channel(parts[2]!), a: 1 });
  }
  for (const match of value.matchAll(/var\((--[a-z0-9-]+)\)/gi)) found.push(...(coloursOf(`var(${match[1]})`, tokens) ?? []));
  return found;
}

/**
 * Whether own CSS gives plain tiles the colour of an alarm: then a real alarm no longer stands out. Read from what the
 * page would use of it: the rules for tiles that are not an alarm, in any form that paints them, and values of the
 * theme that it sets anywhere (they reach the tiles below).
 */
export function cssFakesAlarm(text: string, tokens: Record<string, string>): boolean {
  const alarm = coloursOf(tokens['--tile-alert-bg'] ?? '', tokens)?.[0];
  if (!alarm || text.trim() === '') return false;
  const { dashboard } = sanitizeCss(text, { list: 'wide', keyframes: 'k' });
  const near = (value: string): boolean => coloursIn(value, tokens).some((colour) => distance(colour, alarm) < NEAR);
  for (const rule of dashboard.matchAll(/((?:mh-app::part\([^)]*\)[^,{]*,?)+)\{([^}]*)\}/g)) {
    const selectors = [...rule[1]!.matchAll(/::part\(([^)]*)\)/g)].map((match) => match[1]!.split(' '));
    const plainTile = selectors.some((names) => (names.includes('tile') || names.includes('tile-icon')) && !names.includes('alert'));
    for (const declaration of rule[2]!.split(';')) {
      const at = declaration.indexOf(':');
      if (at < 0) continue;
      const property = declaration.slice(0, at);
      const value = declaration.slice(at + 1);
      if (property.startsWith('--') && near(value)) return true;
      if (plainTile && PAINTING.has(property) && near(value)) return true;
    }
  }
  return false;
}
