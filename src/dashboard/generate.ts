import { isButton } from '../homey/buttons';
import { offeredFlows } from '../homey/flows';
import type { HomeySnapshot } from '../homey/types';
import { zoneIcon, zonesWithDevices } from '../rooms/zones';
import { sectionsByKind, type Entry } from './by-kind';
import { pickHero } from './hero';
import { NO_ROOM, roomTitleKey, zoneSectionId, type Dashboard, type GenerateOptions, type Section } from './types';

const flowEntries = (snapshot: HomeySnapshot): Entry[] => offeredFlows(snapshot)
  .map((f): Entry => ({ tile: { kind: 'flow', id: `flow:${f.id}`, flowId: f.id, flowKind: f.kind, size: 'single' }, name: f.name, first: isButton(f.id) }));

/** A section per room, with everything in it; flows are of no room. */
function sectionsByRoom(snapshot: HomeySnapshot, inHero: ReadonlySet<string>, locale: string): Section[] {
  const rooms = zonesWithDevices(snapshot, locale).flatMap(({ zone, devices }): Section[] => {
    const tiles = sectionsByKind(devices.filter((device) => !inHero.has(device.id)), locale).flatMap((section) => section.tiles);
    if (tiles.length === 0) return [];
    const name = zone?.name.trim() || null;
    return [{ id: zoneSectionId(zone?.id ?? NO_ROOM), kind: 'own', titleKey: roomTitleKey(zone?.id ?? NO_ROOM), name, icon: zone ? zoneIcon(zone.icon) : 'category', zone: zone?.id ?? NO_ROOM, tiles }];
  });
  return [...rooms, ...sectionsByKind([], locale, undefined, flowEntries(snapshot))];
}

export function generateDashboard(snapshot: HomeySnapshot, options: GenerateOptions): Dashboard {
  const locale = options.locale ?? 'nl';
  const hero = pickHero(snapshot, locale);
  const inHero = new Set(hero?.deviceIds ?? []);
  if (options.grouping === 'zone') return { hero, sections: sectionsByRoom(snapshot, inHero, locale) };
  const devices = Object.values(snapshot.devices).filter((device) => !inHero.has(device.id));
  return { hero, sections: sectionsByKind(devices, locale, undefined, flowEntries(snapshot)) };
}
