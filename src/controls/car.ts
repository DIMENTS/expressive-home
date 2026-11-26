import type { Capability, Device } from '../homey/types';
import { find, number, words, yesNo } from './find';

export const CAR_CLASSES: readonly string[] = ['car', 'vehicle'];

/** A car: by its class, by the flag of Homey Energy, or by the charging state that only a car has. */
export function isCar(device: Device): boolean {
  return CAR_CLASSES.includes(device.deviceClass) || device.energy.electricCar === true || (device.deviceClass !== 'evcharger' && find(device, 'ev_charging_state') !== undefined);
}

export interface Car { battery: Capability | null; range: Capability | null; charging: Capability | null; lock: Capability | null }

const caps = (device: Device): Capability[] => device.capabilityOrder.map((id) => device.capabilities[id]).filter((cap): cap is Capability => cap !== undefined);

/** How far it can go: the standard distance, else a number of the app with "range" in its name. */
function rangeOf(device: Device): Capability | null {
  return find(device, 'measure_distance', { type: 'number' }) ?? caps(device).find((cap) => cap.type === 'number' && cap.getable && /range/i.test(cap.id)) ?? null;
}

export function carOf(device: Device): Car | null {
  if (!isCar(device)) return null;
  return {
    battery: find(device, 'measure_battery', { type: 'number' }) ?? null, range: rangeOf(device),
    charging: find(device, 'ev_charging_state', { type: 'enum' }) ?? null, lock: find(device, 'locked', { type: 'boolean' }) ?? null,
  };
}

/** Null where it does not tell. `battery`: its charge, 0 to 100. */
export interface CarState { battery: number | null; range: { value: number; units: string } | null; charging: boolean | null; plugged: boolean | null; locked: boolean | null }

export function carState(car: Car): CarState {
  const level = number(car.battery);
  const range = number(car.range);
  const said = words(car.charging);
  return {
    battery: level === null ? null : Math.round(Math.min(100, Math.max(0, level))),
    range: range === null || range < 0 ? null : { value: range, units: car.range?.units?.trim() || 'km' },
    charging: said ? said === 'plugged_in_charging' : null,
    plugged: said ? said.startsWith('plugged_in') : null,
    locked: yesNo(car.lock),
  };
}
