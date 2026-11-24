import type { Device } from '../homey/types';

/**
 * A fingerprint of what decides where and how a device appears on the dashboard: its class, its
 * capabilities in order with their type, whether they can be read and set, their range and unit, and the energy
 * flags. Its name, zone, availability and values do not count: those change live without a rebuild.
 */
export function layoutKey(device: Device): string {
  const capabilities = device.capabilityOrder.map((id) => {
    const c = device.capabilities[id];
    return c ? [id, c.type, c.setable, c.getable, c.min, c.max, c.units] : [id];
  });
  return JSON.stringify([device.deviceClass, capabilities, device.energy.cumulative, device.energy.homeBattery]);
}
