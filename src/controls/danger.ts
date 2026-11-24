import type { CapabilityValue, Device } from '../homey/types';

/** What lets somebody in. Of a lock or a garage door everything that can be set is: nobody knows what it does. */
const GUARDED: readonly string[] = ['locked', 'lock_mode', 'garagedoor_closed', 'homealarm_state'];
const GUARDED_CLASSES: readonly string[] = ['lock', 'garagedoor'];
/** How much an alarm watches. */
const WATCHES: Record<string, number> = { disarmed: 0, partially_armed: 1, armed: 2 };

/** Whether a command for this capability can be dangerous: it is never a plain switch, button or slider. */
export function isGuarded(device: Device, capabilityId: string): boolean {
  const cap = Object.hasOwn(device.capabilities, capabilityId) ? device.capabilities[capabilityId] : undefined;
  return cap !== undefined && cap.setable && (GUARDED.includes(cap.baseId) || GUARDED_CLASSES.includes(device.deviceClass));
}

/** Whether this very command is: unlocking, opening, an alarm that watches less. Never with one tap. */
export function isDangerous(device: Device, capabilityId: string, value: CapabilityValue): boolean {
  if (!isGuarded(device, capabilityId)) return false;
  const { baseId, value: now } = device.capabilities[capabilityId]!;
  switch (baseId) {
    case 'locked': case 'garagedoor_closed': return value !== true;
    case 'lock_mode': return value !== 'always_locked';
    case 'homealarm_state': {
      const to = typeof value === 'string' ? WATCHES[value] : undefined;
      const from = typeof now === 'string' ? WATCHES[now] : undefined;
      return to === undefined || (from === undefined ? value !== 'armed' : to < from);
    }
    default: return true;
  }
}
