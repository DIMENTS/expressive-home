import type { Capability, Device } from '../homey/types';
import { find, fraction, words, yesNo } from './find';

/** A fan or an air purifier, with what it can be told beside on and off. */
export interface Fan { onoff: Capability | null; speed: Capability | null; oscillating: Capability | null; mode: Capability | null }

export const FAN_CLASSES: readonly string[] = ['fan', 'airpurifier'];

/** A fan that can do more than on and off; one that cannot stays a switch. Older apps use dim for the speed. */
export function fanOf(device: Device): Fan | null {
  if (!FAN_CLASSES.includes(device.deviceClass)) return null;
  const speed = find(device, 'fan_speed', { setable: true, type: 'number' }) ?? find(device, 'dim', { setable: true, type: 'number' }) ?? null;
  const oscillating = find(device, 'oscillating', { setable: true, type: 'boolean' }) ?? null;
  const mode = find(device, 'fan_mode', { setable: true, type: 'enum' }) ?? null;
  if (!speed && !oscillating && !mode) return null;
  return { onoff: find(device, 'onoff', { setable: true, type: 'boolean' }) ?? null, speed, oscillating, mode };
}

/** `speed`: 0 to 1 in the range of the app; null where it does not tell. */
export interface FanState { on: boolean | null; speed: number | null; oscillating: boolean | null; mode: string | null }

export function fanState(fan: Fan): FanState {
  const mode = words(fan.mode) || null;
  const speed = fraction(fan.speed);
  const power = fan.onoff?.getable ? yesNo(fan.onoff) : null;
  // without a switch of its own it is on while it turns, and off in the mode off
  const on = power ?? (mode === 'off' ? false : mode !== null ? true : speed === null ? null : speed > 0);
  return { on, speed: speed === null ? null : Math.round(speed * 1000) / 1000, oscillating: fan.oscillating?.getable ? yesNo(fan.oscillating) : null, mode };
}
