import type { Capability, Device } from '../homey/types';
import { find, number, words, yesNo } from './find';

export interface Vacuum {
  state: Capability | null; onoff: Capability | null; docked: Capability | null; battery: Capability | null; job: Capability | null;
  /** What it says is wrong with it, the most pressing first. */
  problems: Capability[];
}

export const VACUUM_CLASSES: readonly string[] = ['vacuumcleaner', 'mop'];
/** What a vacuum cleaner can say is wrong, the most pressing first. */
export const VACUUM_PROBLEMS: readonly string[] = ['alarm_stuck', 'alarm_lost', 'alarm_bin_full', 'alarm_bin_missing', 'alarm_tank_empty', 'alarm_tank_missing', 'alarm_tank_open', 'alarm_cleaning_pad_missing'];
const STANDS = ['cleaning', 'spot_cleaning', 'docked', 'charging', 'stopped'] as const;
export type VacuumStand = (typeof STANDS)[number];

export function vacuumOf(device: Device): Vacuum | null {
  const state = find(device, 'vacuumcleaner_state', { type: 'enum' }) ?? null;
  if (!VACUUM_CLASSES.includes(device.deviceClass) && !state) return null;
  return {
    state, onoff: find(device, 'onoff', { setable: true, type: 'boolean' }) ?? null, docked: find(device, 'docked', { type: 'boolean' }) ?? null,
    battery: find(device, 'measure_battery', { type: 'number' }) ?? null, job: find(device, 'vacuumcleaner_job_mode', { setable: true, type: 'enum' }) ?? null,
    problems: VACUUM_PROBLEMS.flatMap((baseId) => { const cap = find(device, baseId, { type: 'boolean' }); return cap ? [cap] : []; }),
  };
}

/** `battery`: 0 to 100; `problem`: what is wrong now, if anything. */
export interface VacuumState { stand: VacuumStand | null; battery: number | null; problem: Capability | null }

export function vacuumState(vacuum: Vacuum): VacuumState {
  const said = words(vacuum.state);
  const known = (STANDS as readonly string[]).includes(said) ? said as VacuumStand : null;
  const docked = yesNo(vacuum.docked);
  const on = vacuum.onoff?.getable ? yesNo(vacuum.onoff) : null;
  const stand = known ?? (docked === true ? 'docked' : on === true ? 'cleaning' : on === false ? 'stopped' : null);
  const level = number(vacuum.battery);
  return { stand, battery: level === null ? null : Math.round(Math.min(100, Math.max(0, level))), problem: vacuum.problems.find((cap) => cap.value === true) ?? null };
}

export interface VacuumCommand { capabilityId: string; value: string | boolean }

/** Start, pause and back to the dock: by its state where it can be told so, else start and stop by onoff. */
export function vacuumCommands({ state, onoff }: Vacuum): { go: VacuumCommand | null; pause: VacuumCommand | null; dock: VacuumCommand | null } {
  const knows = (id: string): boolean => state !== null && state.setable && (state.options.length === 0 || state.options.some((option) => option.id === id));
  const to = (id: string): VacuumCommand | null => (knows(id) ? { capabilityId: state!.id, value: id } : null);
  const turn = (value: boolean): VacuumCommand | null => (onoff ? { capabilityId: onoff.id, value } : null);
  return { go: to('cleaning') ?? turn(true), pause: to('stopped') ?? turn(false), dock: to('docked') };
}
