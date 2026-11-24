import camperRaw from '../../mock/fixtures/camper.raw.json';
import type { RawHomey } from '../../homey/types';

/** Which example hub: a house, or a camper. */
export type Demo = 'house' | 'camper';

// The example hub: the anonymised camper with invented, recognisable names.
// The fixture carries neutral names such as "Lamp 1"; these tables give each a friendly one.

const DEVICE_NAMES: Record<string, string> = {
  'Lamp 1': 'Badkamer', 'Lamp 2': 'Garage', 'Lamp 3': 'Keuken', 'Lamp 4': 'Leeslamp links', 'Lamp 5': 'Leeslamp rechts',
  'Lamp 6': 'Luifel', 'Lamp 7': 'Plafond', 'Lamp 8': 'Sfeerstrip',
  'Stekker 1': 'Boiler', 'Stekker 2': 'Buitenstekker', 'Stekker 3': 'Fietslader', 'Stekker 4': 'Koelkast', 'Stekker 5': 'Koffiezetter',
  'Stekker 6': 'Televisie', 'Stekker 7': 'Waterpomp',
  'Sensor 1': 'Starlink', 'Sensor 2': 'Schoon water', 'Sensor 3': 'Sam', 'Sensor 4': 'Livestream', 'Sensor 5': 'Klimaatsensor',
  'Sensor 6': 'Robin', 'Sensor 7': 'Grijs water',
  'Apparaat 1': 'Victron-systeem', 'Apparaat 2': 'Omvormer', 'Knop 1': 'Afstandsbediening',
  'Accu 1': 'Accu', 'Zonnepaneel 1': 'Zonnepanelen',
};

const ZONE_NAMES = ['Buiten', 'Slaapkamer', 'Woonkamer', 'Hal', 'Garage', 'Keuken', 'Dak', 'Badkamer'];
const FLOW_NAMES = ['Alles uit', 'Slaapstand', 'Ochtend', 'Vertrek', 'Thuiskomst', 'Nacht', 'Opstaan', 'Weg'];

type Named = { name?: unknown };

function rename<T extends Record<string, unknown>>(items: T, next: (item: Named, index: number) => string): T {
  return Object.fromEntries(Object.entries(items).map(([id, item], index) => [id, { ...(item as object), name: next(item as Named, index) }])) as T;
}

/** The camper fixture with invented names for devices, zones and flows; a fresh copy each time. */
export function demoRaw(): RawHomey {
  const raw = structuredClone(camperRaw) as unknown as RawHomey;
  let extra = 0;
  return {
    ...raw,
    devices: rename(raw.devices, (device) => DEVICE_NAMES[String(device.name)] ?? `Apparaat ${String.fromCharCode(65 + extra++)}`),
    zones: rename(raw.zones, (_zone, index) => ZONE_NAMES[index] ?? `Ruimte ${String.fromCharCode(65 + index)}`),
    flows: rename(raw.flows, (_flow, index) => FLOW_NAMES[index] ?? `Flow ${String.fromCharCode(65 + index)}`),
    advancedFlows: rename(raw.advancedFlows, (_flow, index) => FLOW_NAMES[Object.keys(raw.flows).length + index] ?? `Flow ${String.fromCharCode(75 + index)}`),
  };
}

/** The most reports a second the example hub may simulate. */
const MAX_RATE = 100;

/**
 * How many reports a second the example hub simulates, from `?simulatie=<n>` in the address (for the speed test,
 * spec 8.9); undefined for the usual gentle movement.
 */
export function simulationRate(search: string): number | undefined {
  const value = Number(new URLSearchParams(search).get('simulatie') ?? Number.NaN);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(value, MAX_RATE);
}
