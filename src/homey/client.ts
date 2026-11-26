import type { CapabilityValue, Device, Flow, FlowAccess, HomeySnapshot, Route, Zone } from './types';
import type { EnergyPeriod } from '../widgets/energy';

export type ClientEvent =
  | { type: 'capability'; deviceId: string; capabilityId: string; value: CapabilityValue; at: string | null }
  | { type: 'device'; device: Device }
  | { type: 'deviceRemoved'; deviceId: string }
  | { type: 'route'; route: Route | null }
  /** The rooms and the flows as they are now; a change of them is not reported live, only read again. */
  | { type: 'structure'; zones: Record<string, Zone>; flows: Flow[] }
  /** What may be done as it is now: the app on the hub got a key for flows, or lost it. */
  | { type: 'scopes'; scopes: string[]; flowAccess?: FlowAccess }
  /** The hub reported a local address the adapter did not know yet; worth saving for the next start. */
  | { type: 'localAddress'; address: string }
  | { type: 'authError' };

export type ConnectionFailure = 'unreachable' | 'auth' | 'homey-id-unknown';

export class ConnectionError extends Error {
  constructor(readonly failure: ConnectionFailure) {
    super(failure);
    this.name = 'ConnectionError';
  }
}

/** A capability of a device whose history Insights keeps. */
export interface HistoryRef { deviceId: string; capabilityId: string }
export type HistoryPeriod = 'today' | 'last24Hours' | 'last7Days' | 'last31Days' | 'year';
/** `at` in milliseconds since 1970. */
export interface HistoryPoint { at: number; value: number }
/** A log with history of a value of a device: kept by the hub itself, or recorded by the app on the hub. */
export interface HistorySource extends HistoryRef { log: string; kind: 'device' | 'recorded'; type: 'number' | 'boolean' }
/** The points of a log over a period, oldest first; null is a point without a measurement. Times in milliseconds. */
export interface HistorySeries { start: number; end: number; step: number; updatesIn: number | null; points: { at: number; value: number | null }[] }
/** The last changes of a yes/no log, oldest first; the hub keeps a fixed number of them, whatever the period. */
export interface HistorySwitches { changes: { at: number; on: boolean }[] }

/** The single seam to a Homey hub; the real and the mock client both implement it. */
export interface HomeyClient {
  connect(): Promise<HomeySnapshot>;
  setCapability(deviceId: string, capabilityId: string, value: CapabilityValue): Promise<void>;
  startFlow(flow: Pick<Flow, 'id' | 'kind'>): Promise<void>;
  /**
   * The logs with history: those of devices, and those the app on the hub records for one of `known`;
   * [] without the right (403).
   */
  listHistory(known?: readonly HistoryRef[]): Promise<HistorySource[]>;
  /** The points of a log over a period, with gaps; null without the right, when the log does not exist or has no points. */
  readSeries(source: HistorySource, period: HistoryPeriod): Promise<HistorySeries | null>;
  /** The last changes of a yes/no log; null without the right or when the log does not exist. */
  readSwitches(source: HistorySource): Promise<HistorySwitches | null>;
  /** What the hub answers about its history, as it is; only to measure what it has. */
  rawHistory?: { logs(): Promise<unknown>; entries(id: string, resolution: string | null): Promise<unknown> };
  /** Only for measuring weather and energy: read-only operations of a few managers, and news of a manager by name. */
  rawManagers?: {
    call(manager: 'sessions' | 'weather' | 'energy' | 'geolocation', operation: string, args?: Record<string, unknown>): Promise<unknown>;
    logs(): Promise<unknown>;
    listen(uri: string, onEvent: (event: string) => void): Promise<() => void>;
  };
  /** The weather of the hub, as it gives it; it throws with a status (403: the key may not) when it cannot be read. */
  readWeather?(): Promise<unknown>;
  /** The report of Homey Energy for the period that holds now, in the time zone of the hub; it throws as above. */
  readEnergy?(period: EnergyPeriod, timeZone: string): Promise<unknown>;
  /** The rooms and the flows as they are now; null when they could not be read. */
  readStructure?(): Promise<{ zones: Record<string, Zone>; flows: Flow[] } | null>;
  subscribe(listener: (event: ClientEvent) => void): () => void;
  disconnect(): void;
}
