import { vi } from 'vitest';
import camperRaw from '../../src/mock/fixtures/camper.raw.json';
import type { ClientEvent, HistoryPeriod, HistoryRef, HistorySeries, HistorySource, HistorySwitches } from '../../src/homey/client';
import { toSnapshot } from '../../src/homey/map';
import type { CapabilityValue, Flow, HomeySnapshot, RawHomey, Zone } from '../../src/homey/types';
import { createDefaultConfig, type AppConfig, type ConfigStore } from '../../src/storage/config';

export const HOMEY_ID = '5f2a00000000000000000c81';

/** The anonymised camper as a snapshot, ready to change for a test. */
export const camperSnapshot = (): HomeySnapshot => toSnapshot(camperRaw as unknown as RawHomey);

/** A configuration store in memory, with an optional saved connection. */
export function memoryConfig(initial: Partial<AppConfig['connection']> | null = null) {
  let stored: AppConfig = createDefaultConfig();
  if (initial) stored.connection = { homeyId: null, localAddress: null, apiKey: null, ...initial };
  const store: ConfigStore & { stored(): AppConfig; refuse: boolean } = {
    refuse: false,
    load: vi.fn(async () => structuredClone(stored)),
    save: vi.fn(async (config: AppConfig) => {
      if (store.refuse) throw new Error('quota');
      stored = structuredClone(config);
    }),
    clearConnection: vi.fn(async () => {
      stored = { ...stored, connection: { homeyId: null, localAddress: null, apiKey: null } };
      return structuredClone(stored);
    }),
    stored: () => stored,
  };
  return store;
}

/** A hub the test steers: it can wait, fail, refuse a control, and send events. */
export function fakeHub(snapshot: HomeySnapshot = camperSnapshot()) {
  let listeners = new Set<(event: ClientEvent) => void>();
  let pending: { resolve(s: HomeySnapshot): void; reject(e: unknown): void } | null = null;
  const hub = {
    manual: false,
    failWith: null as unknown,
    failControl: false,
    /** The rooms and flows the hub has now; null: those of the snapshot. */
    structure: null as { zones: Record<string, Zone>; flows: Flow[] } | null,
    connect: vi.fn(async () => {
      if (hub.failWith) throw hub.failWith;
      if (hub.manual) return new Promise<HomeySnapshot>((resolve, reject) => { pending = { resolve, reject }; });
      hub.emit({ type: 'route', route: 'local' });
      return structuredClone(snapshot);
    }),
    setCapability: vi.fn(async (_d: string, _c: string, _v: CapabilityValue) => { if (hub.failControl) throw new Error('refused'); }),
    startFlow: vi.fn(async () => {}),
    listHistory: vi.fn(async (_known?: readonly HistoryRef[]): Promise<HistorySource[]> => []),
    readSeries: vi.fn(async (_source: HistorySource, _period: HistoryPeriod): Promise<HistorySeries | null> => null),
    readSwitches: vi.fn(async (_source: HistorySource): Promise<HistorySwitches | null> => null),
    /** What the hub answers for its weather and its energy; an Error is thrown. */
    weather: { temperature: 3, iconId: 'clear_day', when: '2026-11-25T23:00:00.000Z', city: 'Somewhere', forecast: [], forecastHourly: [] } as unknown,
    energy: { electricity: { consumedPeriod: 4.8, generatedMeasurePower: [{ t: 1, v: 0 }], devices: { consumed: { d1: 1 } } }, subReports: {} } as unknown,
    readWeather: vi.fn(async (): Promise<unknown> => { if (hub.weather instanceof Error) throw hub.weather; return structuredClone(hub.weather); }),
    readEnergy: vi.fn(async (_period: string, _timeZone: string): Promise<unknown> => { if (hub.energy instanceof Error) throw hub.energy; return structuredClone(hub.energy); }),
    readStructure: vi.fn(async (): Promise<{ zones: Record<string, Zone>; flows: Flow[] } | null> => structuredClone(hub.structure ?? { zones: snapshot.zones, flows: snapshot.flows })),
    subscribe: vi.fn((listener: (event: ClientEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener); }),
    disconnect: vi.fn(() => { listeners = new Set(); }),
    getHomeyId: vi.fn(() => HOMEY_ID),
    getLocalAddress: vi.fn((): string | null => '192.168.1.20'),
    emit(event: ClientEvent) { for (const l of [...listeners]) l(event); },
    finish() { hub.emit({ type: 'route', route: 'local' }); pending?.resolve(structuredClone(snapshot)); },
  };
  return hub;
}
