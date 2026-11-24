import { NO_ROOM } from '../dashboard/types';
import type { Device, HomeySnapshot, Zone } from '../homey/types';
import type { IconName } from '../ui/icons/icons';

/** By what the hub calls the icon of a zone; the first that occurs in it. */
const ZONE_ICONS: readonly (readonly [part: string, icon: IconName])[] = [
  ['living', 'weekend'], ['dining', 'table_restaurant'], ['kitchen', 'countertops'], ['bed', 'bed'], ['kids', 'bed'], ['bath', 'bathtub'], ['shower', 'shower'], ['toilet', 'bathtub'], ['laundry', 'local_laundry_service'],
  ['hall', 'door_front'], ['entrance', 'door_front'], ['stair', 'stairs'], ['office', 'computer'], ['study', 'computer'], ['garage', 'garage'], ['garden', 'yard'], ['yard', 'yard'], ['outside', 'yard'], ['balcony', 'deck'], ['terrace', 'deck'],
  ['attic', 'roofing'], ['roof', 'roofing'], ['home', 'home'], ['house', 'home'],
];

export function zoneIcon(icon: string | undefined): IconName {
  const name = icon?.toLowerCase() ?? '';
  return ZONE_ICONS.find(([part]) => name.includes(part))?.[1] ?? 'meeting_room';
}

/** The zones as the hub orders them where it tells, otherwise by name; each followed by its own. */
function zonesInOrder(zones: Record<string, Zone>, locale: string): Zone[] {
  const first = (zone: Zone): number => zone.order ?? Number.POSITIVE_INFINITY;
  const all = Object.values(zones).sort((a, b) => (first(a) === first(b) ? a.name.localeCompare(b.name, locale) : first(a) - first(b)));
  const seen = new Set<string>();
  const walk = (zone: Zone): Zone[] => (seen.has(zone.id) ? [] : (seen.add(zone.id), [zone, ...all.filter((child) => child.parentId === zone.id).flatMap(walk)]));
  const roots = all.filter((zone) => zone.parentId === null || !Object.hasOwn(zones, zone.parentId));
  // zones that only point at each other are no one's child: they come last
  return [...roots.flatMap(walk), ...all.flatMap(walk)];
}

/** The zone a device is in, or NO_ROOM. */
export const roomIdOf = (device: Device, snapshot: HomeySnapshot): string =>
  (device.zoneId !== null && Object.hasOwn(snapshot.zones, device.zoneId) ? device.zoneId : NO_ROOM);

/** The zones with a device of their own, in order, with those devices by name; the devices of no zone (null) last. */
export function zonesWithDevices(snapshot: HomeySnapshot, locale: string): { zone: Zone | null; devices: Device[] }[] {
  const devices = Object.values(snapshot.devices).sort((a, b) => a.name.localeCompare(b.name, locale));
  return [...zonesInOrder(snapshot.zones, locale), null]
    .map((zone) => ({ zone, devices: devices.filter((device) => roomIdOf(device, snapshot) === (zone?.id ?? NO_ROOM)) }))
    .filter((room) => room.devices.length > 0);
}

/** Whether there are rooms to speak of: at least two. */
export function hasRooms(snapshot: HomeySnapshot): boolean {
  const rooms = new Set(Object.values(snapshot.devices).map((device) => roomIdOf(device, snapshot)));
  rooms.delete(NO_ROOM);
  return rooms.size >= 2;
}
