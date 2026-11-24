import type { CapabilityValue, Device, Flow, FlowAccess, HomeySnapshot, Route, Zone } from './types';

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
export type HistoryPeriod = 'today' | 'last24Hours';
/** `at` in milliseconds since 1970. */
export interface HistoryPoint { at: number; value: number }

/** The single seam to a Homey hub; the real and the mock client both implement it. */
export interface HomeyClient {
  connect(): Promise<HomeySnapshot>;
  setCapability(deviceId: string, capabilityId: string, value: CapabilityValue): Promise<void>;
  startFlow(flow: Pick<Flow, 'id' | 'kind'>): Promise<void>;
  /** The capabilities whose history Insights keeps; [] without the right (403). */
  listHistory(): Promise<HistoryRef[]>;
  /** The points of one capability over a period, oldest first; [] without the right or when the log does not exist. */
  readHistory(ref: HistoryRef, period: HistoryPeriod): Promise<HistoryPoint[]>;
  /** The rooms and the flows as they are now; null when they could not be read. */
  readStructure?(): Promise<{ zones: Record<string, Zone>; flows: Flow[] } | null>;
  subscribe(listener: (event: ClientEvent) => void): () => void;
  disconnect(): void;
}
