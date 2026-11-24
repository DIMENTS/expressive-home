import type { CapRef } from '../dashboard/types';
import { flowRef, LIMITS, valueRef, type HeroChoice, type HeroValueRef, type TileLayout } from './types';

/** The capability a tile made from one value shows, or null when the kind has none. */
export function valueCapability(tile: TileLayout): string | null {
  const { spec } = tile;
  switch (spec.kind) {
    case 'switch': return spec.onoffCapabilityId;
    case 'button': case 'sensor': case 'generic': return spec.capabilityId;
    default: return null;
  }
}

/** What a tile stands on: its device or flow first and, for a tile made from one value, that value. */
export function tileRefs(tile: TileLayout): string[] {
  if (tile.spec.kind === 'flow') return [flowRef(tile.spec.flowId)];
  const capability = tile.source === 'value' ? valueCapability(tile) : null;
  return capability === null ? [tile.spec.deviceId] : [tile.spec.deviceId, valueRef(tile.spec.deviceId, capability)];
}

/** What a value in the hero stands on. */
export const capRefs = (ref: CapRef): string[] => [ref.deviceId, valueRef(ref.deviceId, ref.capabilityId)];

export const isNet = (ref: HeroValueRef): ref is { net: true } => 'net' in ref;

/** The values an own hero reads, the big number first. */
export function heroRefs(hero: HeroChoice): CapRef[] {
  return [hero.main, ...(hero.line ? [hero.line] : []), ...hero.stats.filter((stat): stat is CapRef => !isNet(stat))];
}

/** A name as it is stored: trimmed, at most LIMITS.nameLength characters, null when nothing is left. */
export function cleanName(name: string | null): string | null {
  const text = [...(name ?? '').trim()].slice(0, LIMITS.nameLength).join('').trim();
  return text === '' ? null : text;
}
