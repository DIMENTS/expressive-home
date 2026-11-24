import type { Capability, Device, HomeySnapshot } from '../../src/homey/types';
import { baseIdOf } from '../../src/homey/map';

export function cap(id: string, partial: Partial<Capability> = {}): Capability {
  return {
    id, baseId: baseIdOf(id), title: id, type: 'number', getable: true, setable: false,
    units: null, min: null, max: null, step: null, decimals: null,
    options: [], titleTrue: null, titleFalse: null, value: null, lastUpdated: null,
    ...partial,
  };
}

let seq = 0;

export function device(partial: Partial<Omit<Device, 'capabilities' | 'capabilityOrder'>> & { caps?: Capability[] } = {}): Device {
  const { caps = [], ...rest } = partial;
  const id = rest.id ?? `dev${++seq}`;
  return {
    id, name: id, zoneId: null, deviceClass: 'other', driverId: null,
    available: true, unavailableMessage: null,
    energy: { cumulative: false, homeBattery: false },
    ...rest,
    capabilityOrder: caps.map((c) => c.id),
    capabilities: Object.fromEntries(caps.map((c) => [c.id, c])),
  };
}

export function snapshot(devices: Device[], extra: Partial<HomeySnapshot> = {}): HomeySnapshot {
  return {
    homeyId: 'test', softwareVersion: null, scopes: [],
    devices: Object.fromEntries(devices.map((d) => [d.id, d])),
    zones: {}, flows: [],
    ...extra,
  };
}
