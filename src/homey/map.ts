import { buttonsIn } from './buttons';
import type {
  Capability, CapabilityType, CapabilityValue, Device, Flow, HomeySnapshot, RawHomey, Zone,
} from './types';

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const CAPABILITY_TYPES: readonly string[] = ['boolean', 'number', 'string', 'enum'];

/** 'measure_power.l1' -> 'measure_power' */
export function baseIdOf(capabilityId: string): string {
  const dot = capabilityId.indexOf('.');
  return dot === -1 ? capabilityId : capabilityId.slice(0, dot);
}

function toCapability(id: string, raw: Obj): Capability {
  const type = typeof raw['type'] === 'string' && CAPABILITY_TYPES.includes(raw['type']) ? (raw['type'] as CapabilityType) : 'string';
  const value = raw['value'];
  const options = Array.isArray(raw['values'])
    ? raw['values'].map(obj).flatMap((o) => (str(o['id']) !== null ? [{ id: str(o['id']) as string, title: str(o['title']) ?? str(o['id']) as string }] : []))
    : [];
  return {
    id,
    baseId: baseIdOf(id),
    title: str(raw['title']) ?? id,
    type,
    getable: raw['getable'] === true,
    setable: raw['setable'] === true,
    units: str(raw['units']),
    min: num(raw['min']),
    max: num(raw['max']),
    step: num(raw['step']),
    decimals: num(raw['decimals']),
    options,
    titleTrue: str(raw['titleTrue']),
    titleFalse: str(raw['titleFalse']),
    value: typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' ? (value as CapabilityValue) : null,
    lastUpdated: str(raw['lastUpdated']),
  };
}

export function toDevice(raw: unknown): Device {
  const r = obj(raw);
  const caps = obj(r['capabilitiesObj']);
  const order = Array.isArray(r['capabilities']) ? r['capabilities'].filter((c): c is string => typeof c === 'string') : [];
  const capabilityOrder: string[] = [];
  const capabilities: Record<string, Capability> = {};
  for (const id of order) {
    const meta = caps[id];
    if (typeof meta !== 'object' || meta === null) continue;
    capabilityOrder.push(id);
    capabilities[id] = toCapability(id, obj(meta));
  }
  const energy = obj(r['energyObj']);
  return {
    id: str(r['id']) ?? '',
    name: str(r['name']) ?? '',
    zoneId: str(r['zone']),
    deviceClass: str(r['virtualClass']) ?? str(r['class']) ?? 'other',
    driverId: str(r['driverId']),
    available: r['available'] !== false,
    unavailableMessage: str(r['unavailableMessage']),
    capabilityOrder,
    capabilities,
    energy: { cumulative: energy['cumulative'] === true, homeBattery: energy['homeBattery'] === true },
  };
}

export function toZone(raw: unknown): Zone {
  const r = obj(raw);
  const [icon, order] = [str(r['icon']), num(r['order'])];
  return { id: str(r['id']) ?? '', name: str(r['name']) ?? '', parentId: str(r['parent']), ...(icon === null ? {} : { icon }), ...(order === null ? {} : { order }) };
}

export function toFlow(raw: unknown, kind: 'flow' | 'advanced'): Flow {
  const r = obj(raw);
  const buttons = buttonsIn(raw);
  return {
    id: str(r['id']) ?? '',
    name: str(r['name']) ?? '',
    kind,
    startable: r['enabled'] !== false && r['triggerable'] !== false,
    ...(buttons.length === 0 ? {} : { buttons, ...(r['enabled'] === false ? { off: true as const } : {}) }),
  };
}

export function toSnapshot(raw: RawHomey): HomeySnapshot {
  const devices: Record<string, Device> = {};
  for (const v of Object.values(obj(raw.devices))) {
    const d = toDevice(v);
    devices[d.id] = d;
  }
  const zones: Record<string, Zone> = {};
  for (const v of Object.values(obj(raw.zones))) {
    const z = toZone(v);
    zones[z.id] = z;
  }
  return {
    homeyId: raw.homeyId,
    softwareVersion: raw.softwareVersion ?? null,
    scopes: raw.scopes ?? [],
    devices,
    zones,
    flows: [
      ...Object.values(obj(raw.flows)).map((f) => toFlow(f, 'flow')),
      ...Object.values(obj(raw.advancedFlows)).map((f) => toFlow(f, 'advanced')),
    ],
  };
}
