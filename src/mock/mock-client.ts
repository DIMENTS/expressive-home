import type { ClientEvent, HistoryPeriod, HistorySeries, HistorySource, HistorySwitches, HomeyClient } from '../homey/client';
import { toSnapshot } from '../homey/map';
import type { Capability, CapabilityValue, Device, HomeySnapshot, RawHomey } from '../homey/types';
import { findCapability } from '../recognition/recognize';

/** The devices of the mock, and the way to let them say something. */
export interface LifeHub { readonly devices: Readonly<Record<string, Device>>; report(deviceId: string, capabilityId: string, value: CapabilityValue): void }

export interface Life {
  everyMs: number;
  /** What a command does; true when the device says itself later what became of it. */
  set(hub: LifeHub, deviceId: string, capabilityId: string, value: CapabilityValue): boolean;
  tick(hub: LifeHub): void;
}

export interface MockClientOptions {
  failControl?: (deviceId: string, capabilityId: string) => boolean;
  /** How its devices answer and what goes on by itself, while it simulates. Without it a command is there at once. */
  life?: Life;
  /** The history a test wants; without it the mock makes up believable history. */
  history?: (source: HistorySource, period: HistoryPeriod, now: number) => HistorySeries | null;
}

const STEP_MS = 300_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** The step and the length of each period, as the hub gives them. */
const PERIODS: Record<Exclude<HistoryPeriod, 'today'>, { step: number; length: number }> = {
  last24Hours: { step: STEP_MS, length: DAY_MS },
  last7Days: { step: HOUR_MS, length: 7 * DAY_MS },
  last31Days: { step: 6 * HOUR_MS, length: 31 * DAY_MS },
  year: { step: 6 * HOUR_MS, length: 365 * DAY_MS },
};
/** The made-up hub measures since this long ago; before it its points are empty, as on a hub that is new. */
const MEASURED_MS = 130 * DAY_MS;
/** How many changes of a yes/no log the hub keeps. */
const SWITCHES = 50;
const NUMBERS = ['measure_power', 'measure_temperature', 'measure_humidity'];
const YES_NO = ['onoff', 'alarm_motion', 'alarm_contact'];

/** A repeatable wobble between -1 and 1 for a moment, so the made-up history is the same on every read. */
const wobble = (at: number, salt: number): number => {
  const x = Math.sin(at / STEP_MS * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

/** Hours since local midnight, with fractions. */
const hourOf = (at: number): number => {
  const d = new Date(at);
  return d.getHours() + d.getMinutes() / 60;
};

/** The sun as an arc from 07:30 to 18:30, with a peak of about 510 W. */
const solarAt = (at: number): number => {
  const h = hourOf(at);
  if (h <= 7.5 || h >= 18.5) return 0;
  return Math.round(Math.max(0, 500 * Math.sin(Math.PI * (h - 7.5) / 11) * (1 + 0.04 * wobble(at, 1))));
};

/** Use around 100 W, with peaks at breakfast, lunch and dinner. */
const useAt = (at: number): number => {
  const h = hourOf(at);
  const peak = [8, 12.5, 18.5].some((p) => Math.abs(h - p) < 0.25) ? 450 : 0;
  return Math.round(100 + 25 * wobble(at, 2) + peak);
};

/** A room between about 17 and 23 °C: coolest before dawn. */
const temperatureAt = (at: number): number => Math.round((20 + 2.6 * Math.sin(Math.PI * (hourOf(at) - 10) / 12) + 0.08 * wobble(at, 3)) * 10) / 10;
/** Humidity around 55 percent. */
const humidityAt = (at: number): number => Math.round(55 + 8 * Math.sin(Math.PI * hourOf(at) / 12) + 0.6 * wobble(at, 4));

/** The battery between 52 and 81 percent: charging with the sun until 16:00, then slowly down until 07:30. */
const batteryAt = (at: number): number => {
  const h = hourOf(at);
  const low = 52; const high = 81;
  const level = h >= 7.5 && h < 16 ? low + (high - low) * (h - 7.5) / 8.5 : high - (high - low) * ((h - 16 + 24) % 24) / 15.5;
  return Math.round(level * 10) / 10;
};

export type MockClient = HomeyClient & {
  /** Injects a live change: updates the mock state and notifies listeners, without a settable check. */
  emitCapability(deviceId: string, capabilityId: string, value: CapabilityValue): void;
  /**
   * Makes values move until disconnect(). By default every 2000 ms each non-zero measure_power value jitters by at
   * most 5 percent; with `eventsPerSecond` that many reports a second, one measurement at a time across the devices.
   */
  simulate(timers: SimulationTimers, options?: { eventsPerSecond?: number }): void;
};

export interface SimulationTimers { setInterval(fn: () => void, ms: number): unknown; clearInterval(handle: unknown): void }

export function createMockClient(raw: RawHomey, options: MockClientOptions = {}): MockClient {
  // toSnapshot builds fresh objects, so this state is private to this client and never touches `raw`.
  const state: HomeySnapshot = toSnapshot(raw);
  let listeners = new Set<(event: ClientEvent) => void>();
  let stopSimulation: () => void = () => {};
  let simulating = false;

  const emit = (event: ClientEvent): void => {
    for (const listener of [...listeners]) listener(event);
  };

  /** Insights keeps power, temperature, humidity, the state of charge of a home battery, and on/off, motion and contact. */
  const historySources = (): HistorySource[] => {
    const sources: HistorySource[] = [];
    const add = (deviceId: string, capabilityId: string, type: HistorySource['type']): void => {
      sources.push({ log: `homey:device:${deviceId}:${capabilityId}`, kind: 'device', type, deviceId, capabilityId });
    };
    for (const device of Object.values(state.devices)) {
      for (const id of device.capabilityOrder) {
        const baseId = device.capabilities[id]?.baseId ?? '';
        if (NUMBERS.includes(baseId)) add(device.id, id, 'number');
        if (YES_NO.includes(baseId)) add(device.id, id, 'boolean');
      }
      const soc = findCapability(device, 'battery.soc');
      if (soc) add(device.id, soc.id, 'number');
    }
    return sources;
  };
  const known = (source: HistorySource): Device | null => {
    const found = historySources().some((s) => s.log === source.log);
    return found ? state.devices[source.deviceId] ?? null : null;
  };

  /** What the made-up hub measured at a moment. */
  const valueOf = (device: Device, capabilityId: string): ((at: number) => number) => {
    const baseId = device.capabilities[capabilityId]?.baseId;
    // the made-up history ends where the value of now is
    const live = device.capabilities[capabilityId]?.value;
    const ending = (shape: (at: number) => number) => (typeof live === 'number' ? (at: number) => Math.round((shape(at) + live - shape(Date.now())) * 10) / 10 : shape);
    if (capabilityId === findCapability(device, 'battery.soc')?.id) return (at) => Math.min(100, Math.max(0, ending(batteryAt)(at)));
    if (baseId === 'measure_temperature') return ending(temperatureAt);
    if (baseId === 'measure_humidity') return ending(humidityAt);
    return device.deviceClass === 'solarpanel' ? solarAt : useAt;
  };

  const emitCapability: MockClient['emitCapability'] = (deviceId, capabilityId, value) => {
    const at = new Date().toISOString();
    const capability = state.devices[deviceId]?.capabilities[capabilityId];
    if (capability) {
      capability.value = value;
      capability.lastUpdated = at;
    }
    emit({ type: 'capability', deviceId, capabilityId, value, at });
  };

  const hub: LifeHub = { devices: state.devices, report: emitCapability };

  return {
    async connect() {
      emit({ type: 'route', route: 'local' });
      return structuredClone(state);
    },
    async setCapability(deviceId, capabilityId, value) {
      const device = state.devices[deviceId];
      if (!device) throw new Error(`Unknown device: ${deviceId}`);
      const capability = device.capabilities[capabilityId];
      if (!capability) throw new Error(`Unknown capability: ${deviceId}/${capabilityId}`);
      if (!capability.setable) throw new Error(`Capability is read-only: ${deviceId}/${capabilityId}`);
      if (options.failControl?.(deviceId, capabilityId)) throw new Error(`Control failed: ${deviceId}/${capabilityId}`);
      if (simulating && options.life?.set(hub, deviceId, capabilityId, value)) return;
      // what only can be told never says how it is
      if (capability.getable) emitCapability(deviceId, capabilityId, value);
    },
    async startFlow(flow) {
      if (!state.flows.some((f) => f.id === flow.id)) throw new Error(`Unknown flow: ${flow.id}`);
    },
    async listHistory() {
      return historySources();
    },
    async readSeries(source, period) {
      const now = Date.now();
      if (options.history) return options.history(source, period, now);
      const device = known(source);
      if (!device || source.type !== 'number') return null;
      const valueAt = valueOf(device, source.capabilityId);
      const { step, length } = period === 'today' ? { step: STEP_MS, length: now - new Date(now).setHours(0, 0, 0, 0) } : PERIODS[period];
      const start = Math.ceil((now - length) / step) * step;
      const points: HistorySeries['points'] = [];
      for (let at = start; at <= now; at += step) {
        // nothing before the hub measured, and a short gap in the night of a thermometer
        const gap = at < now - MEASURED_MS || (device.capabilities[source.capabilityId]?.baseId === 'measure_temperature' && step === STEP_MS && Math.abs(hourOf(at) - 3.25) < 0.25);
        points.push({ at, value: gap ? null : valueAt(at) });
      }
      return { start: now - length, end: now, step, updatesIn: step, points };
    },
    async readSwitches(source) {
      const device = known(source);
      if (!device || source.type !== 'boolean') return null;
      const now = Date.now();
      const on = device.capabilities[source.capabilityId]?.value === true;
      const changes: HistorySwitches['changes'] = [];
      // the last change brought the state of now; before it, they alternate every hour and a half or so
      let at = now - 40 * 60_000;
      for (let i = 0; i < SWITCHES; i++) {
        changes.unshift({ at, on: i % 2 === 0 ? on : !on });
        at -= Math.round((1.5 + wobble(at, 5)) * HOUR_MS);
      }
      return { changes };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    disconnect() {
      stopSimulation();
      listeners = new Set();
    },
    emitCapability,
    simulate(timers, simulation = {}) {
      stopSimulation();
      const jitter = (deviceId: string, capability: Capability): void => {
        if (typeof capability.value !== 'number' || capability.value === 0) return;
        emitCapability(deviceId, capability.id, capability.value + capability.value * 0.05 * (Math.random() * 2 - 1));
      };
      const perSecond = simulation.eventsPerSecond;
      let handle: unknown;
      if (perSecond && perSecond > 0) {
        // One report per tick, taking the measurements in turn, as a busy hub reports one value at a time.
        const moving = Object.values(state.devices).flatMap((device) => Object.values(device.capabilities)
          .filter((c) => c.baseId.startsWith('measure_') && typeof c.value === 'number' && c.value !== 0).map((c) => ({ deviceId: device.id, capabilityId: c.id })));
        let next = 0;
        handle = timers.setInterval(() => {
          const target = moving[next % Math.max(1, moving.length)];
          next += 1;
          const capability = target ? state.devices[target.deviceId]?.capabilities[target.capabilityId] : undefined;
          if (target && capability) jitter(target.deviceId, capability);
        }, 1000 / perSecond);
      } else {
        handle = timers.setInterval(() => {
          for (const device of Object.values(state.devices)) {
            for (const capability of Object.values(device.capabilities)) if (capability.baseId === 'measure_power') jitter(device.id, capability);
          }
        }, 2000);
      }
      const { life } = options;
      const living = life ? timers.setInterval(() => life.tick(hub), life.everyMs) : null;
      simulating = true;
      stopSimulation = () => {
        simulating = false;
        timers.clearInterval(handle);
        if (living !== null) timers.clearInterval(living);
        stopSimulation = () => {};
      };
    },
  };
}
