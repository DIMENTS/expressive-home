import { ConnectionError, type ClientEvent, type HistorySeries, type HistorySource, type HistorySwitches, type HomeyClient } from '../homey/client';
import type { Device, FlowAccess, HomeySnapshot, Route } from '../homey/types';
import { RequestError, type Link } from './link';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Everything could not be read again: how long until it is tried once more. */
export const RESYNC_RETRY_MS = 3000;

/** The client of a page that the app on the hub served: it has no key, and knows no other address. */
export type ServedClient = HomeyClient & { getHomeyId(): string | null; getLocalAddress(): string | null; getLocalAddressShape(): string | null };

/** What the hub reported while everything was being read, laid over what was read. */
function layOver(snapshot: HomeySnapshot, events: ClientEvent[]): HomeySnapshot {
  const devices = { ...snapshot.devices };
  let { zones, flows, scopes, flowAccess } = snapshot;
  for (const event of events) {
    if (event.type === 'device') devices[event.device.id] = event.device;
    else if (event.type === 'deviceRemoved') delete devices[event.deviceId];
    else if (event.type === 'structure') ({ zones, flows } = event);
    else if (event.type === 'scopes') [scopes, flowAccess] = [event.scopes, event.flowAccess ?? flowAccess];
    else if (event.type === 'capability') {
      const device = devices[event.deviceId];
      const capability = device?.capabilities[event.capabilityId];
      if (device && capability) devices[event.deviceId] = { ...device, capabilities: { ...device.capabilities, [event.capabilityId]: { ...capability, value: event.value, lastUpdated: event.at ?? capability.lastUpdated } } };
    }
  }
  return { ...snapshot, devices, zones, flows, scopes, ...(flowAccess === undefined ? {} : { flowAccess }) };
}

/**
 * A hub through the app on it. The app passes on what the hub reports; when the way to the app was gone,
 * everything is read again and what changed meanwhile is reported. Without the live stream there is no route: what is
 * shown would stand still.
 */
export function createServedClient(link: Link): ServedClient {
  let listeners = new Set<(event: ClientEvent) => void>();
  let devices: Record<string, Device> = {};
  let scopes: string[] = [];
  let flowAccess: FlowAccess | undefined;
  let homeyId: string | null = null;
  let route: Route | null = null;
  let connected = false;
  /** Reports that come while everything is being read; they are newer. */
  let waiting: ClientEvent[] | null = null;
  let reads = 0;
  /** Everything must be read again once the connection is made. */
  let missed = false;
  let stopRetry: () => void = () => {};
  const stops: (() => void)[] = [];

  const emit = (event: ClientEvent): void => { for (const listener of [...listeners]) listener(event); };

  function setRoute(next: Route | null, always = false): void {
    if (next === route && !always) return;
    route = next;
    emit({ type: 'route', route });
  }

  function report(event: ClientEvent): void {
    if (waiting) { waiting.push(event); return; }
    if (event.type === 'route') { setRoute(link.up() ? event.route : null); return; }
    if (event.type === 'scopes') [scopes, flowAccess] = [event.scopes, event.flowAccess ?? flowAccess];
    if (event.type === 'device') devices = { ...devices, [event.device.id]: event.device };
    if (event.type === 'deviceRemoved') {
      const { [event.deviceId]: _gone, ...rest } = devices;
      devices = rest;
    }
    emit(event);
  }

  function onHub(raw: unknown): void {
    if (!isRecord(raw)) return;
    if (raw['type'] === 'reset') again();
    else report(raw as unknown as ClientEvent);
  }

  async function read(): Promise<{ snapshot: HomeySnapshot; route: Route | null }> {
    try {
      const value = await link.request('GET', 'api/snapshot');
      if (isRecord(value) && isRecord(value['snapshot'])) return value as unknown as { snapshot: HomeySnapshot; route: Route | null };
    } catch (error) {
      if (error instanceof RequestError && error.status === 401) throw new ConnectionError('auth');
    }
    throw new ConnectionError('unreachable');
  }

  /** The hub is another than it was, or the stream was away: now, or as soon as what is being read was taken over. */
  function again(): void {
    if (connected) void resync();
    else missed = true;
  }

  /** Reads everything again and reports what is there now and what is gone; tried until it works. */
  async function resync(): Promise<void> {
    stopRetry();
    const mine = ++reads;
    waiting ??= [];
    try {
      const result = await read();
      if (mine !== reads || !connected) return;
      const before = devices;
      devices = result.snapshot.devices;
      for (const device of Object.values(devices)) emit({ type: 'device', device });
      for (const id of Object.keys(before)) if (!Object.hasOwn(devices, id)) emit({ type: 'deviceRemoved', deviceId: id });
      emit({ type: 'structure', zones: result.snapshot.zones, flows: result.snapshot.flows });
      if (JSON.stringify([scopes, flowAccess]) !== JSON.stringify([result.snapshot.scopes, result.snapshot.flowAccess])) {
        ({ scopes, flowAccess } = result.snapshot);
        emit({ type: 'scopes', scopes, ...(flowAccess === undefined ? {} : { flowAccess }) });
      }
      setRoute(link.up() ? result.route : null);
      flush();
    } catch (error) {
      if (mine !== reads || !connected) return;
      flush();
      if (error instanceof ConnectionError && error.failure === 'auth') { emit({ type: 'authError' }); return; }
      stopRetry = link.later(() => { if (connected) void resync(); }, RESYNC_RETRY_MS);
    }
  }

  function flush(): void {
    const late = waiting ?? [];
    waiting = null;
    for (const event of late) report(event);
  }

  function drop(): void {
    connected = false;
    waiting = null;
    stopRetry();
    for (const stop of stops.splice(0)) stop();
  }

  return {
    async connect() {
      drop();
      const mine = ++reads;
      waiting = [];
      stops.push(
        link.on('hub', onHub),
        link.on('lost', () => { if (connected) setRoute(null); }),
        link.on('open', again),
        link.on('unpaired', () => { if (connected) emit({ type: 'authError' }); }),
        link.hold(),
      );
      try {
        // the stream first, then reading: a change between the two would otherwise be lost
        await link.whenUp();
        if (mine !== reads) throw new ConnectionError('unreachable');
        missed = false;
        // what came before is in what is read now
        waiting = [];
        const result = await read();
        if (mine !== reads) throw new ConnectionError('unreachable');
        // what came while reading is newer than what was read
        const late: ClientEvent[] = waiting ?? [];
        waiting = null;
        const snapshot = layOver(result.snapshot, late);
        ({ homeyId, devices, scopes, flowAccess } = snapshot);
        connected = true;
        const routes = late.flatMap((event) => (event.type === 'route' ? [event.route] : []));
        // always said: whoever listens can still have the route of an earlier connection
        setRoute(link.up() ? (routes.length > 0 ? routes.at(-1)! : result.route) : null, true);
        if (missed) stopRetry = link.later(() => { void resync(); }, 0);
        return snapshot;
      } catch (error) {
        if (mine === reads) drop();
        throw error;
      }
    },
    async setCapability(deviceId, capabilityId, value) {
      await link.request('POST', 'api/control', { deviceId, capabilityId, value });
    },
    async startFlow(flow) {
      await link.request('POST', 'api/flow', { id: flow.id });
    },
    async listHistory() {
      const answer = await link.request('GET', 'api/history/sources') as { sources?: unknown };
      return Array.isArray(answer?.sources) ? answer.sources.filter(isSource) : [];
    },
    async readSeries(source, period) {
      const answer = await askHistory(link, source, period) as { series?: unknown } | null;
      return seriesOf(answer?.series);
    },
    async readSwitches(source) {
      const answer = await askHistory(link, source, 'switches') as { switches?: unknown } | null;
      return switchesOf(answer?.switches);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    disconnect() {
      reads += 1;
      drop();
      listeners = new Set();
    },
    getHomeyId: () => homeyId,
    getLocalAddress: () => null,
    getLocalAddressShape: () => null,
  };
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isSource = (value: unknown): value is HistorySource => isRecord(value) && typeof value['log'] === 'string'
  && (value['kind'] === 'device' || value['kind'] === 'recorded') && (value['type'] === 'number' || value['type'] === 'boolean')
  && typeof value['deviceId'] === 'string' && typeof value['capabilityId'] === 'string';

/** The history of one log from the app; null when the app no longer knows the log. */
async function askHistory(link: Link, source: HistorySource, period: string): Promise<unknown> {
  try {
    return await link.request('GET', `api/history?log=${encodeURIComponent(source.log)}&period=${encodeURIComponent(period)}`);
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) return null;
    throw error;
  }
}

/** Only what has the shape of a series: points at a time, with a number or nothing. */
function seriesOf(raw: unknown): HistorySeries | null {
  if (!isRecord(raw) || !Array.isArray(raw['points']) || !finite(raw['start']) || !finite(raw['end']) || !finite(raw['step'])) return null;
  const points = raw['points'].flatMap((point) => (isRecord(point) && finite(point['at']) ? [{ at: point['at'], value: finite(point['value']) ? point['value'] : null }] : []));
  return { start: raw['start'], end: raw['end'], step: raw['step'], updatesIn: finite(raw['updatesIn']) ? raw['updatesIn'] : null, points };
}

function switchesOf(raw: unknown): HistorySwitches | null {
  if (!isRecord(raw) || !Array.isArray(raw['changes'])) return null;
  return { changes: raw['changes'].flatMap((change) => (isRecord(change) && finite(change['at']) && typeof change['on'] === 'boolean' ? [{ at: change['at'], on: change['on'] }] : [])) };
}
