import { climateOf } from '../controls/climate';
import { coverOf, coverState } from '../controls/cover';
import { number } from '../controls/find';
import { guardOf, guardState, type GuardState } from '../controls/guard';
import { mediaOf, mediaState } from '../controls/media';
import { houseKind } from '../dashboard/classify';
import { sectionsByKind } from '../dashboard/by-kind';
import { HOUSE_KINDS, NO_ROOM, type Dashboard, type TileSpec } from '../dashboard/types';
import type { Capability, Device, HomeySnapshot } from '../homey/types';
import type { Translate } from '../i18n/index';
import { dangerAlarms, firstByBaseId } from '../recognition/recognize';
import type { IconName } from '../ui/icons/icons';
import { coverText, partly } from '../ui/model/cover-view';
import { iconForCapability } from '../ui/model/icon-for';
import { degrees } from '../ui/model/tile-view';

import { hasRooms, zoneIcon, zonesWithDevices } from './zones';

export { NO_ROOM, hasRooms, zoneIcon };

/** A zone with devices in it, or (NO_ROOM) the devices that are in none. */
export interface Room { id: string; name: string; icon: IconName; deviceIds: string[] }

export function roomsOf(snapshot: HomeySnapshot, t: Translate): Room[] {
  return zonesWithDevices(snapshot, t.locale).map(({ zone, devices }): Room => ({
    id: zone?.id ?? NO_ROOM, name: zone ? zone.name.trim() || t('rooms.unnamed') : t('rooms.none'), icon: zone ? zoneIcon(zone.icon) : 'category', deviceIds: devices.map((device) => device.id),
  }));
}

/** A value of a room: what a sensor there measures, otherwise what heating or cooling does. Nothing else measures a room. */
function roomValue(devices: readonly Device[], baseId: string, ofClimate: (device: Device) => Capability | null | undefined): { value: number; deviceId: string; cap: Capability } | null {
  const sorted = devices.filter((device) => device.available).sort((a, b) => a.name.localeCompare(b.name));
  const found = [
    ...sorted.filter((device) => device.deviceClass === 'sensor').map((device) => ({ device, cap: firstByBaseId(device, baseId) })),
    ...sorted.filter((device) => houseKind(device) === 'climate').map((device) => ({ device, cap: ofClimate(device) })),
  ];
  for (const { device, cap } of found) {
    const value = number(cap);
    if (cap && value !== null) return { value, deviceId: device.id, cap };
  }
  return null;
}

export const roomTemperature = (devices: readonly Device[]) => roomValue(devices, 'measure_temperature', (device) => climateOf(device)?.measure);
const roomHumidity = (devices: readonly Device[]) => roomValue(devices, 'measure_humidity', (device) => climateOf(device)?.humidity);

const canSwitch = (device: Device): Capability | undefined =>
  [firstByBaseId(device, 'onoff'), firstByBaseId(device, 'dim')].find((cap) => cap?.setable);

/** The lamps of a room that can be switched. */
export const lampsOf = (devices: readonly Device[]): Device[] => devices.filter((device) => device.deviceClass === 'light' && canSwitch(device) !== undefined);

/** Whether a lamp is on; one that cannot be reached is not. */
export function lampOn(device: Device): boolean {
  if (!device.available) return false;
  const onoff = firstByBaseId(device, 'onoff');
  const level = firstByBaseId(device, 'dim')?.value;
  return onoff ? onoff.value === true : typeof level === 'number' && level > 0;
}

export interface RoomFact { icon: IconName; text: string; danger?: true }
/** `lamps`: null when there are none to switch. */
export interface RoomCard { lit: boolean; lamps: { on: number; ids: string[] } | null; facts: RoomFact[] }

const devicesOf = (room: Pick<Room, 'deviceIds'>, snapshot: HomeySnapshot): Device[] => room.deviceIds.flatMap((id) => snapshot.devices[id] ?? []);

/** What a room says of itself on its card. */
export function roomCard(room: Room, snapshot: HomeySnapshot, t: Translate): RoomCard {
  const devices = devicesOf(room, snapshot);
  const here = devices.filter((device) => device.available);
  const lamps = lampsOf(devices);
  const on = lamps.filter(lampOn).length;
  const facts: RoomFact[] = [];
  for (const device of here) {
    const alarm = dangerAlarms(device).find((cap) => cap.baseId !== 'alarm_battery');
    if (alarm) facts.push({ icon: iconForCapability(alarm, device), text: alarm.title, danger: true });
  }
  if (on > 0) facts.push({ icon: 'lightbulb', text: t('count.on', { n: on }) });
  const temperature = roomTemperature(devices);
  if (temperature) facts.push({ icon: 'thermostat', text: degrees(temperature.value, t) });
  const humidity = roomHumidity(devices);
  if (humidity) facts.push({ icon: 'humidity_percentage', text: t('media.percent', { n: Math.round(humidity.value) }) });
  const kind = (which: string): Device[] => here.filter((device) => houseKind(device) === which);
  if (kind('media').some((device) => mediaState(mediaOf(device)!).playing === true)) facts.push({ icon: 'music_note', text: t('media.plays') });

  const all = (which: string): Device[] => devices.filter((device) => houseKind(device) === which);
  const covers = kind('cover').map((device) => ({ ...coverState(coverOf(device)!), awning: coverOf(device)!.awning })).filter((cover) => cover.part !== null);
  const curtains = covers.filter((cover) => !cover.awning).map((cover) => partly(cover.part!));
  const open = curtains.filter((part) => part > 0);
  // one that does not tell can be open: then the others are not all of them
  const everyCurtain = all('cover').filter((device) => !coverOf(device)!.awning).length;
  if (everyCurtain === 1 && curtains.length === 1) facts.push({ icon: 'blinds', text: open.length === 0 || open[0] === 100 ? t(open.length === 0 ? 'cover.closed' : 'cover.open') : t('media.percent', { n: open[0]! }) });
  else if (open.length > 0) facts.push({ icon: 'blinds', text: t('count.open', { n: open.length }) });
  else if (curtains.length > 0 && curtains.length === everyCurtain) facts.push({ icon: 'blinds', text: t('cover.closed') });
  const awnings = covers.filter((cover) => cover.awning);
  if (awnings.length > 0) facts.push({ icon: 'roller_shades', text: coverText(Math.max(...awnings.map((cover) => cover.part!)), true, t) });

  // one that cannot be reached does not tell
  const guards = all('guard').map((device) => ({ kind: guardOf(device)!.kind, said: device.available ? guardState(guardOf(device)!) : null }));
  const said = (which: string): (GuardState | null)[] => guards.filter((guard) => guard.kind === which).map((guard) => guard.said);
  const [locks, doors, alarms] = [said('lock'), said('door'), said('alarm')];
  const [unlocked, opened] = [locks.filter((state) => state === 'unlocked').length, doors.filter((state) => state === 'open').length];
  // that all is locked or closed is only said when all of them say so
  if (locks.length > 0) facts.push(unlocked > 0 ? { icon: 'lock_open', text: t('count.unlocked', { n: unlocked }) } : { icon: 'lock', text: t(locks.includes(null) ? 'cover.unknown' : 'guard.locked') });
  if (doors.length > 0) facts.push({ icon: 'garage_home', text: opened > 0 ? t('count.open', { n: opened }) : t(doors.includes(null) ? 'cover.unknown' : 'cover.closed') });
  if (alarms.includes('armed')) facts.push({ icon: 'shield_lock', text: t('guard.armed') });
  else if (alarms.includes('partially_armed')) facts.push({ icon: 'shield_lock', text: t('guard.partly') });
  return { lit: on > 0, lamps: lamps.length > 0 ? { on, ids: lamps.map((lamp) => lamp.id) } : null, facts };
}

/** Everything of a room, per kind; what can be operated is wide: that is done there. */
export function roomDashboard(room: Pick<Room, 'deviceIds'>, snapshot: HomeySnapshot, locale: string): Dashboard {
  const wide = (kind: string): boolean => HOUSE_KINDS.some((house) => house === kind);
  return { hero: null, sections: sectionsByKind(devicesOf(room, snapshot), locale, (spec) => (wide(spec.kind) ? { ...spec, size: 'wide' } as TileSpec : spec)) };
}
