import type { ClientEvent, HistoryPeriod, HistoryPoint, HistoryRef, HomeyClient } from '../homey/client';
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
  /** The history a test wants; without it the mock makes up a believable day. */
  history?: (ref: HistoryRef, period: HistoryPeriod, now: number) => HistoryPoint[];
}

const STEP_MS = 300_000;
const HOUR_MS = 3_600_000;

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

  /** Insights keeps every power measurement and the state of charge of a home battery. */
  const historyRefs = (): HistoryRef[] => {
    const refs: HistoryRef[] = [];
    for (const device of Object.values(state.devices)) {
      for (const id of device.capabilityOrder) {
        if (device.capabilities[id]?.baseId === 'measure_power') refs.push({ deviceId: device.id, capabilityId: id });
      }
      const soc = findCapability(device, 'battery.soc');
      if (soc) refs.push({ deviceId: device.id, capabilityId: soc.id });
    }
    return refs;
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
      return historyRefs();
    },
    async readHistory(ref, period) {
      const now = Date.now();
      if (options.history) return options.history(ref, period, now);
      const device = state.devices[ref.deviceId];
      if (!historyRefs().some((r) => r.deviceId === ref.deviceId && r.capabilityId === ref.capabilityId) || !device) return [];
      const valueAt = ref.capabilityId === findCapability(device, 'battery.soc')?.id ? batteryAt
        : device.deviceClass === 'solarpanel' ? solarAt : useAt;
      const midnight = new Date(now).setHours(0, 0, 0, 0);
      const start = period === 'today' ? midnight : now - 24 * HOUR_MS;
      const points: HistoryPoint[] = [];
      for (let at = Math.ceil(start / STEP_MS) * STEP_MS; at <= now; at += STEP_MS) points.push({ at, value: valueAt(at) });
      return points;
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
