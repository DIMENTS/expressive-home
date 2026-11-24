import { climateOf } from '../controls/climate';
import { coverOf } from '../controls/cover';
import { isGuarded } from '../controls/danger';
import { guardOf } from '../controls/guard';
import { mediaOf, MEDIA_CLASSES } from '../controls/media';
import type { Capability, Device } from '../homey/types';
import { findCapability, firstByBaseId, isMinor, isTank, mainValues } from '../recognition/recognize';
import { CLIMATE_CLASSES, CLIMATE_VALUES, SECURITY_ALARMS, SECURITY_CLASSES } from '../recognition/table';
import type { HouseKind, SectionKind, TileSpec } from './types';

function caps(device: Device): Capability[] {
  return device.capabilityOrder.map((id) => device.capabilities[id]).filter((c): c is Capability => c !== undefined);
}

/** The capability a tap toggles: the settable one called exactly `onoff`, otherwise the first settable derived one. */
function toggleCapability(device: Device): Capability | undefined {
  const settable = caps(device).filter((c) => c.baseId === 'onoff' && c.setable && !isGuarded(device, c.id));
  return settable.find((c) => c.id === 'onoff') ?? settable[0];
}

function setableOnoff(device: Device): boolean {
  return toggleCapability(device) !== undefined;
}

/** A settable onoff makes a switch for lights, sockets and devices with few readings; a relay buried among many readings does not. */
function isSwitch(device: Device): boolean {
  return setableOnoff(device) && (device.deviceClass === 'light' || device.deviceClass === 'socket' || mainValues(device).length < 3);
}

function securityAlarm(device: Device): Capability | undefined {
  return caps(device).find((c) => SECURITY_ALARMS.includes(c.baseId));
}

/** What is said of it first; after this the order counts. */
const PLAIN_CLASSES: readonly string[] = ['light', 'socket'];
const DOORS: readonly string[] = ['lock', 'garagedoor', 'homealarm'];
const COVER_CLASSES: readonly string[] = ['curtain', 'blinds', 'sunshade', 'shutterblinds', 'windowcoverings'];

/** Which of the kinds of a house a device is, by what it can do; null for any other device. */
export function houseKind(device: Device): HouseKind | null {
  if (PLAIN_CLASSES.includes(device.deviceClass)) return null;
  const guard = guardOf(device);
  // a lock of something that is mainly something else comes last
  if (guard && (DOORS.includes(device.deviceClass) || guard.kind !== 'lock')) return 'guard';
  if (climateOf(device)) return 'climate';
  if (coverOf(device)) return 'cover';
  if (mediaOf(device)) return 'media';
  return guard ? 'guard' : null;
}

const HOUSE_SECTIONS: Record<HouseKind, Exclude<SectionKind, 'flows'>> = { climate: 'climate', cover: 'covers', media: 'media', guard: 'security' };

export function sectionFor(device: Device): Exclude<SectionKind, 'flows'> {
  if (device.deviceClass === 'light') return 'lights';
  const kind = houseKind(device);
  if (kind) return HOUSE_SECTIONS[kind];
  if (DOORS.includes(device.deviceClass)) return 'security';
  if (COVER_CLASSES.includes(device.deviceClass)) return 'covers';
  if (MEDIA_CLASSES.includes(device.deviceClass)) return 'media';
  if (isTank(device)) return 'water';
  if (SECURITY_CLASSES.includes(device.deviceClass) || securityAlarm(device)) return 'security';
  // A switch that also reports its own temperature stays a switch; only other devices count as climate by value.
  const firstValue = mainValues(device)[0];
  if (CLIMATE_CLASSES.includes(device.deviceClass) || (firstValue && !isSwitch(device) && CLIMATE_VALUES.includes(firstValue.baseId))) return 'climate';
  if (isSwitch(device)) return 'switches';
  return 'other';
}

export function tilesFor(device: Device): TileSpec[] {
  const kind = houseKind(device);
  return kind ? [{ kind, id: `${device.id}:${kind}`, deviceId: device.id, size: 'single' }] : plainTilesFor(device);
}

/** The tiles of the values of a device, whatever else it is. */
export function plainTilesFor(device: Device): TileSpec[] {
  const id = device.id;
  const dim = caps(device).find((c) => c.baseId === 'dim' && c.setable);
  if (device.deviceClass === 'light' && dim) {
    return [{ kind: 'light', id: `${id}:light`, deviceId: id, size: 'wide', onoffCapabilityId: toggleCapability(device)?.id ?? null, dimCapabilityId: dim.id }];
  }
  const toggle = toggleCapability(device);
  if (toggle && isSwitch(device)) {
    // The one detail value of a switch: its power when known, otherwise its first main value.
    const detail = firstByBaseId(device, 'measure_power') ?? mainValues(device)[0];
    return [{ kind: 'switch', id: `${id}:switch`, deviceId: id, size: 'single', onoffCapabilityId: toggle.id, detailCapabilityId: detail?.id ?? null }];
  }
  if (isTank(device)) {
    return [{
      kind: 'tank', id: `${id}:tank`, deviceId: id, size: 'single',
      levelCapabilityId: findCapability(device, 'tank.level')?.id ?? null,
      volumeCapabilityId: findCapability(device, 'tank.volume')?.id ?? null,
      capacityCapabilityId: findCapability(device, 'tank.capacity')?.id ?? null,
    }];
  }
  const alarm = securityAlarm(device);
  if (alarm) return [{ kind: 'generic', id: `${id}:generic`, deviceId: id, size: 'single', capabilityId: alarm.id }];
  const all = caps(device);
  const button = all.find((c) => c.baseId === 'button' && !isGuarded(device, c.id));
  if (button && all.every((c) => c.baseId === 'button' || isMinor(c.baseId))) {
    return [{ kind: 'button', id: `${id}:button`, deviceId: id, size: 'single', capabilityId: button.id }];
  }
  const values = mainValues(device);
  if (values.length >= 1 && values.length <= 2) {
    return values.map((c): TileSpec => ({
      kind: 'sensor', id: `${id}:${c.id}`, deviceId: id, size: 'single', capabilityId: c.id, showCapabilityTitle: values.length === 2,
    }));
  }
  if (values.length >= 3) {
    return [{ kind: 'multi', id: `${id}:multi`, deviceId: id, size: 'wide', capabilityIds: values.slice(0, 3).map((c) => c.id) }];
  }
  const readable = all.find((c) => c.getable && !isMinor(c.baseId));
  return [{ kind: 'generic', id: `${id}:generic`, deviceId: id, size: 'single', capabilityId: readable?.id ?? null }];
}
