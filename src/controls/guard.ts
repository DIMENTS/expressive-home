import type { Capability, CapabilityValue, Device } from '../homey/types';
import { find, fraction, words, yesNo } from './find';

export interface Guard { kind: 'lock' | 'door' | 'alarm'; cap: Capability; canSet: boolean }
export type GuardState = 'locked' | 'unlocked' | 'closed' | 'open' | 'armed' | 'partially_armed' | 'disarmed';

const guard = (kind: Guard['kind'], cap: Capability | undefined): Guard | null => (cap ? { kind, cap, canSet: cap.setable } : null);
/** Elsewhere a lock is that of something else: of a car, or against children. */
const LOCK_CLASSES: readonly string[] = ['lock', 'sensor', 'other'];

/** The lock of a device; of several without a plain one, one that is unlocked. */
function lockOf(device: Device): Capability | undefined {
  const lock = find(device, 'locked', { type: 'boolean' });
  if (!lock || lock.id === 'locked') return lock;
  return device.capabilityOrder.map((id) => device.capabilities[id]).find((cap) => cap?.baseId === 'locked' && cap.type === 'boolean' && cap.value === false) ?? lock;
}

export function guardOf(device: Device): Guard | null {
  const door = find(device, 'garagedoor_closed', { type: 'boolean' });
  if (device.deviceClass === 'garagedoor') {
    return guard('door', door ?? find(device, 'windowcoverings_closed', { type: 'boolean' }) ?? find(device, 'windowcoverings_set', { type: 'number' }) ?? find(device, 'windowcoverings_state', { type: 'enum' }));
  }
  if (device.deviceClass === 'lock') return guard('lock', lockOf(device));
  if (door) return guard('door', door);
  const alarm = find(device, 'homealarm_state', { type: 'enum' });
  if (alarm) return guard('alarm', alarm);
  return LOCK_CLASSES.includes(device.deviceClass) ? guard('lock', lockOf(device)) : null;
}

/** What it says now; null when it does not tell. */
export function guardState({ kind, cap }: Guard): GuardState | null {
  if (kind === 'alarm') {
    const said = words(cap);
    return said === 'armed' || said === 'partially_armed' || said === 'disarmed' ? said : null;
  }
  const part = cap.type === 'number' ? fraction(cap) : null;
  const shut = cap.type === 'boolean' ? yesNo(cap) : part !== null ? part === 0 : words(cap) === 'down' ? true : words(cap) === 'up' ? false : null;
  if (shut === null) return null;
  return kind === 'lock' ? (shut ? 'locked' : 'unlocked') : shut ? 'closed' : 'open';
}

/** What it is told to get there. */
export function guardValue({ kind, cap }: Guard, to: GuardState): CapabilityValue {
  if (kind === 'alarm') return to;
  const shut = to === 'locked' || to === 'closed';
  if (cap.type === 'number') return shut ? cap.min ?? 0 : cap.max ?? 1;
  if (cap.type === 'enum') return shut ? 'down' : 'up';
  return shut;
}
