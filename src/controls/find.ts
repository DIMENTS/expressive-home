import type { Capability, CapabilityType, Device } from '../homey/types';

/**
 * The capability of a device for a purpose: the plain one, then one that can be set, then the first derived one
 * ("locked.custom"). Apps name and add them as they like, so this is asked anew every time.
 */
export function find(device: Device, baseId: string, want: { setable?: boolean; type?: CapabilityType } = {}): Capability | undefined {
  const found = device.capabilityOrder.map((id) => device.capabilities[id]).filter((cap): cap is Capability =>
    cap !== undefined && cap.baseId === baseId && (want.setable === undefined || cap.setable === want.setable) && (want.type === undefined || cap.type === want.type));
  return found.find((cap) => cap.id === baseId) ?? found.find((cap) => cap.setable) ?? found[0];
}

export const number = (cap: Capability | null | undefined): number | null => (typeof cap?.value === 'number' && Number.isFinite(cap.value) ? cap.value : null);
export const yesNo = (cap: Capability | null | undefined): boolean | null => (typeof cap?.value === 'boolean' ? cap.value : null);
export const words = (cap: Capability | null | undefined): string => (typeof cap?.value === 'string' ? cap.value.trim() : '');

/** Where a value lies in the range of its own capability, 0 to 1: some apps count to 1 and some to 100. */
export function fraction(cap: Capability | null | undefined): number | null {
  const value = number(cap);
  const [min, max] = [cap?.min ?? 0, cap?.max ?? 1];
  return value === null || max <= min ? null : Math.min(1, Math.max(0, (value - min) / (max - min)));
}
