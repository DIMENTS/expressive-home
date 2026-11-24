import type { Feature } from '../homey/permissions';
import type { Route } from '../homey/types';
import type { Dashboard } from '../dashboard/types';

export const ROUTE_LOG_MAX = 20;

const routeName = (route: Route | null): string => route ?? 'geen';
const two = (n: number): string => String(n).padStart(2, '0');

/**
 * The route log with one more change: the time and the route before and after, never an address, id or name.
 * Keeps the last twenty; an unchanged route is not a change.
 */
export function addRouteChange(log: string[], at: Date, from: Route | null, to: Route | null): string[] {
  if (from === to) return log;
  const line = `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())} ${routeName(from)} -> ${routeName(to)}`;
  return [...log, line].slice(-ROUTE_LOG_MAX);
}

/** The text to paste into a conversation: structure only, never names, addresses, ids or the key. */
export function structureText(source: 'nagebootste Homey' | 'echte Homey', dashboard: Dashboard, route: Route | null, missing: Feature[], eventsPer10s: number, routeLog: string[], addressShape: string | null): string {
  const lines = [
    `bron: ${source}`,
    `route: ${route ?? 'onbekend'}`,
    `ontbrekende rechten: ${missing.length ? missing.join(', ') : 'geen'}`,
    `blikvanger: ${dashboard.hero ? `${dashboard.hero.kind}, vakjes: ${dashboard.hero.stats.map((s) => s.role).join(', ') || 'geen'}` : 'geen'}`,
    'secties:',
  ];
  for (const section of dashboard.sections) {
    const counts = new Map<string, number>();
    for (const tile of section.tiles) counts.set(tile.kind, (counts.get(tile.kind) ?? 0) + 1);
    const parts = [...counts].map(([kind, n]) => `${kind} ${n}`).join(', ');
    lines.push(`- ${section.kind}: ${section.tiles.length} tegels (${parts})`);
  }
  lines.push(`live-gebeurtenissen laatste 10 s: ${eventsPer10s}`);
  if (routeLog.length === 0) lines.push('routewissels: geen');
  else lines.push('routewissels:', ...routeLog.map((line) => `- ${line}`));
  // Only the shape of the address field in the hub's system info: every letter and digit is masked.
  lines.push(`vorm lokaal adres: ${addressShape ?? 'onbekend'}`);
  return lines.join('\n');
}
