import { ConnectionError, type ClientEvent, type HistoryPeriod, type HistoryRef, type HistorySeries, type HistorySource, type HistorySwitches, type HomeyClient } from '../homey/client';
import type { CapabilityValue, Flow, HomeySnapshot, Route } from '../homey/types';
import { createStore } from '../state/store';

/** What a browser hears of the hub; `reset`: read everything again. */
export type HubEvent = Exclude<ClientEvent, { type: 'localAddress' } | { type: 'authError' }> | { type: 'reset' };

export interface HubLinkDeps {
  /** A fresh client, with a fresh token of the app. */
  createClient(): Promise<HomeyClient>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
  log?(message: string): void;
}

/** Delays between attempts while the hub does not answer; the last one repeats. */
export const LINK_RETRY_MS = [1000, 5000, 10_000, 30_000, 60_000];
/** The rooms and flows are read again when they were read longer ago than this: while someone looks, and for who opens a page. */
export const STRUCTURE_MS = 60_000;
export const FRESH_MS = 10_000;
/** A page does not wait longer than this for a hub that is slow with its flows. */
export const REFRESH_WAIT_MS = 1500;

/** What went wrong, for the log of the app; never something that looks like a token, nor the rest of an address. */
export function withoutSecrets(error: unknown): string {
  return (error instanceof Error ? error.message : 'failed')
    .replace(/(https?:\/\/[^/\s?#]+)[^\s]*/gi, '$1')
    .replace(/[\w-]{20,}(?:[.:][\w-]+)*/g, '…')
    .slice(0, 200);
}

/**
 * The one connection of the app on the hub to the hub: it keeps what the hub has now for every browser and
 * passes on what changes. It tries until it has a connection; a refused token gets a new one.
 */
export function createHubLink(deps: HubLinkDeps) {
  const store = createStore((flush) => flush());
  const listeners = new Set<(event: HubEvent) => void>();
  let client: HomeyClient | null = null;
  let route: Route | null = null;
  let generation = 0;
  let failures = 0;
  let timer: unknown = null;
  let stopped = true;
  let structureAt = Number.NEGATIVE_INFINITY;
  let reading: Promise<void> | null = null;

  const emit = (event: HubEvent): void => { for (const listener of [...listeners]) listener(event); };

  function drop(): void {
    generation += 1;
    client?.disconnect();
    client = null;
    if (route !== null) {
      route = null;
      emit({ type: 'route', route: null });
    }
  }

  function retry(): void {
    if (stopped) return;
    const delay = LINK_RETRY_MS[Math.min(failures, LINK_RETRY_MS.length - 1)]!;
    failures += 1;
    timer = deps.setTimeout(() => { void attempt(); }, delay);
  }

  function onEvent(event: ClientEvent): void {
    if (event.type === 'authError') {
      deps.log?.('The hub refused the token of the app; asking for a new one');
      drop();
      retry();
      return;
    }
    if (event.type === 'localAddress') return;
    if (event.type === 'route') route = event.route;
    store.apply(event);
    emit(event);
  }

  async function attempt(): Promise<void> {
    timer = null;
    const mine = ++generation;
    try {
      const next = await deps.createClient();
      if (mine !== generation) { next.disconnect(); return; }
      client = next;
      next.subscribe((event) => { if (mine === generation) onEvent(event); });
      const snapshot = await next.connect();
      if (mine !== generation) return;
      store.load(snapshot);
      failures = 0;
      structureAt = deps.now();
      emit({ type: 'reset' });
    } catch (error) {
      if (mine !== generation) return;
      deps.log?.(`No connection to the hub: ${error instanceof ConnectionError ? error.failure : withoutSecrets(error)}`);
      drop();
      retry();
    }
  }

  async function readStructure(source: HomeyClient): Promise<void> {
    const mine = generation;
    structureAt = deps.now();
    const found = await source.readStructure?.().catch(() => null);
    const before = store.getSnapshot();
    if (!found || !before || mine !== generation) return;
    if (JSON.stringify([before.zones, before.flows]) === JSON.stringify([found.zones, found.flows])) return;
    onEvent({ type: 'structure', ...found });
  }

  const connected = (): HomeyClient => {
    if (!client || route === null) throw new ConnectionError('unreachable');
    return client;
  };

  return {
    start(): void {
      if (!stopped) return;
      stopped = false;
      void attempt();
    },
    stop(): void {
      stopped = true;
      if (timer !== null) deps.clearTimeout(timer);
      timer = null;
      drop();
    },
    /** What the hub has now; null until it was read once. */
    snapshot: (): HomeySnapshot | null => store.getSnapshot(),
    route: (): Route | null => route,
    /** Reads the rooms and flows again when that was longer ago than `age`; what changed is reported. */
    async refresh(age: number): Promise<void> {
      if (!client || route === null) return;
      if (reading === null) {
        const since = deps.now() - structureAt;
        // below zero: the clock of the hub was set back
        if (since >= 0 && since < age) return;
        reading = readStructure(client).finally(() => { reading = null; });
      }
      let timer: unknown = null;
      await Promise.race([reading, new Promise<void>((done) => { timer = deps.setTimeout(done, REFRESH_WAIT_MS); })]);
      if (timer !== null) deps.clearTimeout(timer);
    },
    async setCapability(deviceId: string, capabilityId: string, value: CapabilityValue): Promise<void> {
      await connected().setCapability(deviceId, capabilityId, value);
    },
    async startFlow(flow: Pick<Flow, 'id' | 'kind'>): Promise<void> {
      await connected().startFlow(flow);
    },
    listHistory: (known: readonly HistoryRef[]): Promise<HistorySource[]> => connected().listHistory(known),
    readSeries: (source: HistorySource, period: HistoryPeriod): Promise<HistorySeries | null> => connected().readSeries(source, period),
    readSwitches: (source: HistorySource): Promise<HistorySwitches | null> => connected().readSwitches(source),
    subscribe(listener: (event: HubEvent) => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type HubLink = ReturnType<typeof createHubLink>;
