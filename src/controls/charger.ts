import type { Capability, Device } from '../homey/types';
import { isCar } from './car';
import { find, number, words, yesNo } from './find';

export interface Charger { charging: Capability | null; onoff: Capability | null; state: Capability | null; power: Capability | null; session: Capability | null; target: Capability | null }

const STANDS = ['plugged_in_charging', 'plugged_in_discharging', 'plugged_in_paused', 'plugged_in', 'plugged_out'] as const;
export type ChargerStand = (typeof STANDS)[number];

const caps = (device: Device): Capability[] => device.capabilityOrder.map((id) => device.capabilities[id]).filter((cap): cap is Capability => cap !== undefined);

/** A charge point: by its class, its flag, or what only a charge point has; a car that can charge is a car. */
export function chargerOf(device: Device): Charger | null {
  if (isCar(device)) return null;
  const state = find(device, 'evcharger_charging_state', { type: 'enum' }) ?? null;
  const charging = find(device, 'evcharger_charging', { type: 'boolean' }) ?? null;
  if (device.deviceClass !== 'evcharger' && device.energy.evCharger !== true && !state && !charging) return null;
  return {
    charging, state, onoff: find(device, 'onoff', { type: 'boolean' }) ?? null, power: find(device, 'measure_power', { type: 'number' }) ?? null,
    // what was charged this time has a name of its own
    session: caps(device).find((cap) => cap.baseId === 'meter_power' && /session/i.test(cap.id)) ?? null,
    target: find(device, 'target_power', { setable: true, type: 'number' }) ?? null,
  };
}

/** Null where it does not tell. `power` in W, `session` in kWh. */
export interface ChargerState { stand: ChargerStand | null; charging: boolean | null; power: number | null; session: number | null }

export function chargerState(charger: Charger): ChargerState {
  const said = words(charger.state);
  const stand = (STANDS as readonly string[]).includes(said) ? said as ChargerStand : null;
  const switched = charger.charging ?? charger.onoff;
  const charging = stand !== null ? stand === 'plugged_in_charging' : switched?.getable ? yesNo(switched) : null;
  return { stand, charging, power: number(charger.power), session: number(charger.session) };
}

export interface ChargerCommand { capabilityId: string; value: boolean }

/** Charging is started and stopped by its own switch, else by onoff. */
export function chargerCommands({ charging, onoff }: Charger): { start: ChargerCommand | null; stop: ChargerCommand | null } {
  const cap = charging?.setable ? charging : onoff?.setable ? onoff : null;
  return cap ? { start: { capabilityId: cap.id, value: true }, stop: { capabilityId: cap.id, value: false } } : { start: null, stop: null };
}
