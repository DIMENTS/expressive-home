import { isCar } from '../controls/car';
import { chargerOf } from '../controls/charger';
import { vacuumOf, vacuumState } from '../controls/vacuum';
import type { Capability, Device } from '../homey/types';
import { ALARM_ACTIVITY, ALARM_DANGER, BATTERY, LOW_BATTERY_PERCENT, MEANINGS, MINOR_CAPABILITIES, type Meaning } from './table';

function all(device: Device): Capability[] {
  return device.capabilityOrder.map((id) => device.capabilities[id]).filter((c): c is Capability => c !== undefined);
}

export function firstByBaseId(device: Device, baseId: string): Capability | undefined {
  return all(device).find((c) => c.baseId === baseId);
}

/** A home battery is a battery-class device, an energy-flagged one, or one with an app state of charge. */
export function isHomeBattery(device: Device): boolean {
  // a car has a state of charge too
  if (isCar(device)) return false;
  return device.energy.homeBattery || device.deviceClass === 'battery' || firstByBaseId(device, BATTERY.homeSoc) !== undefined;
}

export function findCapability(device: Device, meaning: Meaning): Capability | undefined {
  for (const baseId of MEANINGS[meaning]) {
    // measure_battery is only a state of charge on a home battery; elsewhere it is a battery level.
    if (meaning === 'battery.soc' && baseId === BATTERY.level && !isHomeBattery(device)) continue;
    const found = firstByBaseId(device, baseId);
    if (found) return found;
  }
  return undefined;
}

export function isTank(device: Device): boolean {
  return findCapability(device, 'tank.level') !== undefined || findCapability(device, 'tank.volume') !== undefined;
}

const finite = (cap: Capability | undefined): number | null => (typeof cap?.value === 'number' && Number.isFinite(cap.value) ? cap.value : null);

/** How full a tank is, 0 to 100 and rounded: its level, or else its content and its size. Null when that is not known. */
export function tankPercent(levelCap: Capability | undefined, volumeCap: Capability | undefined, capacityCap: Capability | undefined): number | null {
  const [volume, capacity] = [finite(volumeCap), finite(capacityCap)];
  const level = finite(levelCap) ?? (volume !== null && capacity !== null && capacity > 0 ? (volume / capacity) * 100 : null);
  return level === null ? null : Math.round(Math.min(100, Math.max(0, level)));
}

/** How full the tank of a device is. */
export function tankLevel(device: Device): number | null {
  return tankPercent(findCapability(device, 'tank.level'), findCapability(device, 'tank.volume'), findCapability(device, 'tank.capacity'));
}

/** A side detail such as battery level or signal strength (MINOR_CAPABILITIES); never a main value. */
export function isMinor(baseId: string): boolean {
  return MINOR_CAPABILITIES.some((m) => {
    if (m.endsWith('*')) return baseId.startsWith(m.slice(0, -1));
    if (m.endsWith('#')) return baseId.startsWith(m.slice(0, -1)) && /^\d+$/.test(baseId.slice(m.length - 1));
    return baseId === m;
  });
}

/** Numeric, readable, non-minor capabilities in device order. */
export function mainValues(device: Device): Capability[] {
  return all(device).filter((c) => c.type === 'number' && c.getable && !isMinor(c.baseId));
}

/**
 * A battery-powered device is low on alarm_battery or a measure_battery below the threshold. A home battery and a car never are:
 * theirs is a charge; a vacuum cleaner is not while it is in its dock.
 */
export function hasLowBattery(device: Device): boolean {
  if (isHomeBattery(device) || isCar(device)) return false;
  const vacuum = vacuumOf(device);
  const stand = vacuum ? vacuumState(vacuum).stand : null;
  if (stand === 'docked' || stand === 'charging') return false;
  if (firstByBaseId(device, BATTERY.alarm)?.value === true) return true;
  const level = firstByBaseId(device, BATTERY.level)?.value;
  return typeof level === 'number' && level < LOW_BATTERY_PERCENT;
}

export function activeAlarms(device: Device): Capability[] {
  return all(device).filter((c) => c.baseId.startsWith('alarm_') && c.type === 'boolean' && c.value === true);
}

export type AlarmKind = 'danger' | 'activity' | 'status';

/** The kind of an alarm-like capability by its base id; anything on neither list is a status. */
export function alarmKind(baseId: string): AlarmKind {
  if (ALARM_DANGER.includes(baseId)) return 'danger';
  if (ALARM_ACTIVITY.includes(baseId)) return 'activity';
  return 'status';
}

/** Whether an alarm of this device is danger: a charge point or a car names its own states this way ("car_connected"). */
export function isDangerAlarm(device: Device, cap: Capability): boolean {
  if (alarmKind(cap.baseId) !== 'danger') return false;
  return !(cap.baseId === 'alarm_generic' && cap.id !== cap.baseId && (isCar(device) || chargerOf(device) !== null));
}

/** The capabilities of the danger kind that are true now. */
export function dangerAlarms(device: Device): Capability[] {
  return all(device).filter((c) => c.value === true && isDangerAlarm(device, c));
}
