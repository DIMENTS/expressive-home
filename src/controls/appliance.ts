import type { Capability, Device } from '../homey/types';
import { find, number, words, yesNo } from './find';

/** A washing machine, dryer, dishwasher or fridge: what it says of what it does. */
export interface Appliance {
  operational: Capability | null; running: Capability | null; progress: Capability | null; remaining: Capability | null;
  program: Capability | null; onoff: Capability | null; power: Capability | null; problem: Capability | null;
}

export const APPLIANCE_CLASSES: readonly string[] = ['washer', 'dryer', 'washer_and_dryer', 'dishwasher'];
/** What is not switched off by accident: white goods and what keeps food cold. */
export const KEEP_ON_CLASSES: readonly string[] = [...APPLIANCE_CLASSES, 'fridge', 'freezer', 'fridge_and_freezer'];
const PROGRAMS: readonly string[] = ['laundry_washer_program', 'dishwasher_program', 'laundry_dryer_dryness', 'laundry_washer_cycles', 'laundry_washer_speed'];
const STANDS = ['running', 'paused', 'error', 'stopped'] as const;
export type ApplianceStand = (typeof STANDS)[number];

const MINUTE: Record<string, number> = { s: 1 / 60, sec: 1 / 60, seconds: 1 / 60, min: 1, minutes: 1, h: 60, hours: 60 };

const caps = (device: Device): Capability[] => device.capabilityOrder.map((id) => device.capabilities[id]).filter((cap): cap is Capability => cap !== undefined);

/** How long it still takes: there is no standard for it, apps name it themselves, with "remaining" in it, in a unit of time or none. */
function remainingOf(device: Device): Capability | null {
  return caps(device).find((cap) => cap.type === 'number' && cap.getable && /remaining/i.test(cap.id) && (cap.units === null || cap.units.trim() === '' || cap.units.trim().toLowerCase() in MINUTE)) ?? null;
}

export function applianceOf(device: Device): Appliance | null {
  const operational = find(device, 'operational_state', { type: 'enum' }) ?? null;
  const program = PROGRAMS.map((baseId) => find(device, baseId)).find((cap) => cap !== undefined) ?? null;
  if (!APPLIANCE_CLASSES.includes(device.deviceClass) && !(operational && program)) return null;
  return {
    operational, running: find(device, 'alarm_running', { type: 'boolean' }) ?? null, progress: find(device, 'progress', { type: 'number' }) ?? null,
    remaining: remainingOf(device), program, onoff: find(device, 'onoff', { type: 'boolean' }) ?? null, power: find(device, 'measure_power', { type: 'number' }) ?? null,
    problem: find(device, 'alarm_problem', { type: 'boolean' }) ?? find(device, 'alarm_door_fault', { type: 'boolean' }) ?? null,
  };
}

/** Null where it does not tell. `progress`: 0 to 100; `minutesLeft`: only while it runs or waits. */
export interface ApplianceState { stand: ApplianceStand | null; on: boolean | null; progress: number | null; minutesLeft: number | null; power: number | null }


export function applianceState(appliance: Appliance): ApplianceState {
  const said = words(appliance.operational);
  const running = yesNo(appliance.running);
  let stand: ApplianceStand | null = (STANDS as readonly string[]).includes(said) ? said as ApplianceStand : running === true ? 'running' : running === false ? 'stopped' : null;
  if (stand !== null && yesNo(appliance.problem) === true) stand = 'error';
  const busy = stand === 'running' || stand === 'paused';
  const left = number(appliance.remaining);
  const per = MINUTE[(appliance.remaining?.units ?? 'min').trim().toLowerCase()] ?? 1;
  const progress = number(appliance.progress);
  return {
    stand, on: appliance.onoff?.getable ? yesNo(appliance.onoff) : null,
    progress: busy && progress !== null ? Math.round(Math.min(100, Math.max(0, progress))) : null,
    minutesLeft: busy && left !== null && left >= 0 ? Math.round(left * per) : null,
    power: number(appliance.power),
  };
}
