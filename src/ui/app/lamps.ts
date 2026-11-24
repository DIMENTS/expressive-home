import type { CapabilityValue, Device } from '../../homey/types';
import { firstByBaseId } from '../../recognition/recognize';
import { lampOn } from '../../rooms/rooms';

export interface LampCommand { deviceId: string; capabilityId: string; value: CapabilityValue }

/** What turns these lamps on or off: each with what it has. One that is so already, or cannot be reached, is left alone. */
export function lampsCommands(lamps: readonly Device[], on: boolean): LampCommand[] {
  return lamps.filter((device) => device.available && lampOn(device) !== on).flatMap((device): LampCommand[] => {
    const onoff = firstByBaseId(device, 'onoff');
    if (onoff?.setable) return [{ deviceId: device.id, capabilityId: onoff.id, value: on }];
    const dim = firstByBaseId(device, 'dim');
    return dim?.setable ? [{ deviceId: device.id, capabilityId: dim.id, value: on ? dim.max ?? 1 : dim.min ?? 0 }] : [];
  });
}
