import type { CapabilityValue, Device } from '../homey/types';
import { applianceOf, KEEP_ON_CLASSES } from './appliance';
import { isCar } from './car';
import { chargerOf } from './charger';

/** What lets somebody in. Of a lock or a garage door everything that can be set is: nobody knows what it does. */
const GUARDED: readonly string[] = ['locked', 'lock_mode', 'garagedoor_closed', 'homealarm_state'];
const GUARDED_CLASSES: readonly string[] = ['lock', 'garagedoor'];
/** How much an alarm watches. */
const WATCHES: Record<string, number> = { disarmed: 0, partially_armed: 1, armed: 2 };

/** What cannot be undone once it is off: a program halfway, the food in a fridge, a car that is not full in the morning. */
const offIsDanger = (device: Device): boolean => KEEP_ON_CLASSES.includes(device.deviceClass) || applianceOf(device) !== null || chargerOf(device) !== null;

/** Whether a command for this capability can be dangerous: it is never a plain switch, button or slider. */
export function isGuarded(device: Device, capabilityId: string): boolean {
  const cap = Object.hasOwn(device.capabilities, capabilityId) ? device.capabilities[capabilityId] : undefined;
  if (cap === undefined || !cap.setable) return false;
  if (GUARDED.includes(cap.baseId) || GUARDED_CLASSES.includes(device.deviceClass) || cap.baseId === 'evcharger_charging') return true;
  // of a car whatever is switched, pressed or chosen can open it or let it drive; a temperature or a limit cannot
  if (isCar(device)) return cap.type !== 'number';
  if (cap.baseId === 'onoff' && offIsDanger(device)) return true;
  // a button of a washing machine starts or ends a program, nobody knows which; a state it can be told stops it
  return (cap.baseId === 'button' || cap.baseId === 'operational_state') && applianceOf(device) !== null;
}

/** Whether this very command is: unlocking, opening, an alarm that watches less. Never with one tap. */
export function isDangerous(device: Device, capabilityId: string, value: CapabilityValue): boolean {
  if (!isGuarded(device, capabilityId)) return false;
  const { baseId, value: now } = device.capabilities[capabilityId]!;
  switch (baseId) {
    case 'locked': case 'garagedoor_closed': return value !== true;
    case 'lock_mode': return value !== 'always_locked';
    case 'evcharger_charging': return value !== true;
    // switching on what is off is no danger; of a car everything is
    case 'onoff': return isCar(device) || GUARDED_CLASSES.includes(device.deviceClass) || value !== true;
    case 'homealarm_state': {
      const to = typeof value === 'string' ? WATCHES[value] : undefined;
      const from = typeof now === 'string' ? WATCHES[now] : undefined;
      return to === undefined || (from === undefined ? value !== 'armed' : to < from);
    }
    default: return true;
  }
}
