import type { CapRef, HeroSpec } from '../dashboard/types';
import type { HistorySource } from '../homey/client';
import type { HeroChart } from '../layout/types';

/** The value behind a role of the hero: the battery, the sun, the use. */
export function heroRefOf(hero: HeroSpec, role: 'battery' | 'solar' | 'consumption'): CapRef | null {
  if (role === 'battery') return hero.kind === 'battery' ? hero.primary : null;
  const stat = hero.stats.find((one) => one.role === role);
  if (stat && 'ref' in stat) return stat.ref;
  return hero.kind === role ? hero.primary : null;
}

/** The log with numbers of a value; Homey's own before one the app recorded. */
export function heroSourceOf(sources: readonly HistorySource[], ref: CapRef | null): HistorySource | null {
  if (!ref) return null;
  const all = sources.filter((source) => source.type === 'number' && source.deviceId === ref.deviceId && source.capabilityId === ref.capabilityId);
  return all.find((source) => source.kind === 'device') ?? all[0] ?? null;
}

/** The charts this hub can deliver for a hero, in the order of the menu. */
export function heroChartsOf(hero: HeroSpec | null, sources: readonly HistorySource[]): HeroChart[] {
  if (!hero) return [];
  const has = (role: 'battery' | 'solar' | 'consumption') => heroSourceOf(sources, heroRefOf(hero, role)) !== null;
  return [...(has('battery') ? ['battery' as const] : []), ...(has('solar') ? ['solar' as const] : []), ...(has('solar') && has('consumption') ? ['solar-use' as const] : [])];
}

