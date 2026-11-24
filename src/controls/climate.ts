import type { Capability, Device } from '../homey/types';
import { find, number, words } from './find';

export interface Climate { target: Capability; measure: Capability | null; mode: Capability | null; onoff: Capability | null; humidity: Capability | null }

/** What heats or cools a home. */
export const HEATING_CLASSES: readonly string[] = ['thermostat', 'heater', 'radiator', 'airconditioning', 'heatpump', 'boiler', 'waterheater', 'fireplace', 'airtreatment'];
/** These have a temperature of their own, which is not that of a room. */
const OTHERWISE: readonly string[] = ['light', 'socket', 'fridge', 'freezer', 'fridge_and_freezer', 'oven', 'oven_and_microwave', 'microwave', 'cooktop', 'kettle', 'grill', 'fryer', 'airfryer', 'multicooker', 'coffeemachine', 'dishwasher', 'washer', 'dryer', 'washer_and_dryer'];

/** The smallest step that makes sense for a person, in degrees. */
const MIN_STEP = 0.5;
/** From this difference something is being done about it. */
const DIFFERENCE = 0.2;
/** What Homey takes when an app says nothing. */
const RANGE = { min: 4, max: 35 } as const;

export function climateOf(device: Device): Climate | null {
  if (OTHERWISE.includes(device.deviceClass)) return null;
  const target = find(device, 'target_temperature', { setable: true, type: 'number' });
  if (!target || (target.id !== 'target_temperature' && !HEATING_CLASSES.includes(device.deviceClass))) return null;
  return {
    target,
    measure: find(device, 'measure_temperature', { type: 'number' }) ?? null,
    mode: find(device, 'thermostat_mode', { type: 'enum' }) ?? null,
    onoff: find(device, 'onoff', { type: 'boolean', setable: true }) ?? null,
    humidity: find(device, 'measure_humidity', { type: 'number' }) ?? null,
  };
}

const HEATS = ['heat', 'heating'];
const COOLS = ['cool', 'cooling'];
const RUNS = ['dry', 'fan', 'fan_only'];

/**
 * `off`: null when it does not tell. `active`: it has something to do, as far as target and measurement tell; an app
 * does not say whether it really heats.
 */
export interface ClimateState { off: boolean | null; active: boolean; target: number | null; measure: number | null }

function isOff({ mode, onoff }: Climate): boolean | null {
  const said = words(mode).toLowerCase();
  if (onoff?.value === false || said === 'off') return true;
  const unknown = (onoff !== null && typeof onoff.value !== 'boolean') || (onoff === null && mode !== null && said === '');
  return unknown ? null : false;
}

export function climateState(climate: Climate): ClimateState {
  const [target, measure, off] = [number(climate.target), number(climate.measure), isOff(climate)];
  const said = words(climate.mode).toLowerCase();
  const canCool = climate.mode?.options.some((option) => COOLS.includes(option.id.toLowerCase())) ?? false;
  const more = target !== null && measure !== null ? Math.round((target - measure) * 100) / 100 : null;
  const active = off !== false || target === null ? false
    : more === null || RUNS.includes(said) ? true
      : HEATS.includes(said) ? more >= DIFFERENCE
        : COOLS.includes(said) ? -more >= DIFFERENCE
          : more >= DIFFERENCE || (canCool && -more >= DIFFERENCE);
  return { off, active, target, measure };
}

/** The step of the app; some say a tenth, which nobody feels. */
export const targetStep = (cap: Capability): number => Math.max(MIN_STEP, cap.step ?? MIN_STEP);

/** Where a target can go. */
export const targetRange = (cap: Capability): { min: number; max: number } => ({ min: cap.min ?? RANGE.min, max: cap.max ?? RANGE.max });

/** The nearest target the app allows. */
export function clampTarget(cap: Capability, value: number): number {
  const { min, max } = targetRange(cap);
  const step = targetStep(cap);
  const steps = Math.min(Math.floor((max - min) / step + 1e-6), Math.max(0, Math.round((value - min) / step + 1e-6)));
  return Math.round((min + steps * step) * 1000) / 1000;
}
