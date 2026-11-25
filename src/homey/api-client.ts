import { addressShape, privateIPv4From } from './address';
import { ConnectionError, type ClientEvent, type HistoryPeriod, type HomeyClient } from './client';
import { seriesFrom, sourcesFrom, switchesFrom, yearFrom } from './history';
import { toDevice, toSnapshot } from './map';
import { candidatesFor, chooseRoute, CLOUD_TIMEOUT_MS, FIRST_LOCAL_TIMEOUT_MS, isHomeyId, isIPv4, LOCAL_TIMEOUT_MS, probe, watchForLocal, type RouteCandidate } from './routes';
import type { CapabilityValue, Device, HomeySnapshot, Route } from './types';

/** How long a lost connection waits before each new attempt to choose a route; the last delay repeats. */
export const RECOVERY_DELAYS_MS = [5000, 5000, 10000, 20000, 40000, 60000];

/** How often a live connection is checked: does the hub still answer, and does it still accept the key? */
export const LIVENESS_INTERVAL_MS = 20_000;

/** A connection that answers but has reported nothing for this long is replaced by a fresh one on the same route. */
export const SILENCE_REOPEN_MS = 120_000;

/** The silence limit doubles after every such reopening, up to this. */
export const SILENCE_REOPEN_MAX_MS = 1_800_000;

/** After this many consecutive recovery ticks that only find the current route, that route is reopened. */
export const SAME_ROUTE_RETRY_TICKS = 3;

export interface ConnectionSettings { homeyId: string | null; localAddress: string | null; apiKey: string }

type Collection = Record<string, unknown>;

/** The narrow part of Athom's library this adapter calls (see spike/connection-test/index.html). */
export interface LibDevice {
  id?: string;
  capabilities?: string[];
  makeCapabilityInstance?(capabilityId: string, listener: (value: unknown) => void): unknown;
}
export interface LibApi {
  sessions: { getSessionMe(): Promise<{ intersectedScopes?: string[]; scopes?: string[] }> };
  devices: {
    getDevices(): Promise<Record<string, LibDevice>>;
    connect(): Promise<unknown>;
    on(event: string, listener: (device: unknown) => void): unknown;
    setCapabilityValue(args: { deviceId: string; capabilityId: string; value: CapabilityValue }): Promise<unknown>;
  };
  zones: { getZones(): Promise<Collection> };
  system: { getInfo(): Promise<{ wifiAddress?: unknown }> };
  flow: {
    getFlows(): Promise<Collection>;
    getAdvancedFlows(): Promise<Collection>;
    triggerFlow(args: { id: string }): Promise<unknown>;
    triggerAdvancedFlow(args: { id: string }): Promise<unknown>;
  };
  insights: {
    getLogs(): Promise<Collection>;
    getLogEntries(args: { id: string; resolution?: string }): Promise<unknown>;
  };
  on(event: string, listener: (...args: unknown[]) => void): void;
  destroy(): void;
}

export interface HomeyApiLib {
  HomeyAPIV3Local: new (options: {
    token: string; baseUrl: string; strategy: []; properties: { id: string; softwareVersion: string | null }; debug: () => void;
  }) => LibApi;
}

export interface ApiClientDeps {
  fetch: typeof fetch;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  addOnlineListener(fn: () => void): () => void;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** What the library threw while a connection was made, for a log; the caller only hears the kind of failure. */
  onFailure?(error: unknown): void;
}

/** What a connection reports before its devices have been handed over. */
type Buffered =
  | { kind: 'value'; deviceId: string; capabilityId: string; value: CapabilityValue; at: string }
  | { kind: 'device'; raw: unknown }
  | { kind: 'removed'; deviceId: string };

interface Connection {
  api: LibApi; route: Route; closed: boolean; subscribed: Set<string>;
  /** While set, live reports are kept here, in arrival order, instead of being emitted. A value replaces the earlier one for the same capability. */
  buffer: Map<string, Buffered> | null;
}

/** The id of a device report; a report without a non-empty text id is not about any device. */
const deviceIdOf = (raw: unknown): string | null => {
  const id = typeof raw === 'object' && raw !== null ? (raw as { id?: unknown }).id : undefined;
  return typeof id === 'string' && id !== '' ? id : null;
};

/**
 * Turns a device report into a device, or null when the report must be ignored.
 * A complete report carries its capabilities; an incomplete one only replaces a few fields of the device it is about.
 */
const deviceFrom = (raw: unknown, lookup: (id: string) => Device | undefined): Device | null => {
  const id = deviceIdOf(raw);
  if (id === null) return null;
  const r = raw as Record<string, unknown>;
  const capabilitiesObj = r['capabilitiesObj'];
  if (Array.isArray(r['capabilities']) && typeof capabilitiesObj === 'object' && capabilitiesObj !== null && !Array.isArray(capabilitiesObj)) return toDevice(raw);
  const known = lookup(id);
  if (!known) return null;
  const text = (key: string): string | null => (typeof r[key] === 'string' ? (r[key] as string) : null);
  const next: Device = { ...known };
  if (text('name') !== null) next.name = text('name') as string;
  if (text('zone') !== null) next.zoneId = text('zone');
  const deviceClass = text('virtualClass') ?? text('class');
  if (deviceClass !== null) next.deviceClass = deviceClass;
  if (typeof r['available'] === 'boolean') next.available = r['available'];
  if ('unavailableMessage' in r) next.unavailableMessage = text('unavailableMessage');
  return next;
};

const statusOf = (error: unknown): number | null => {
  const status = typeof error === 'object' && error !== null ? (error as { statusCode?: unknown }).statusCode : undefined;
  return typeof status === 'number' ? status : null;
};

/** The client of a real hub: next to the common seam it tells what it learned about the hub's addresses. */
export type RealHomeyClient = HomeyClient & {
  getHomeyId(): string | null;
  /** The local address in use: the one from the settings, or the one learned from the hub. */
  getLocalAddress(): string | null;
  /** The shape of the address field in the hub's system info, with every letter and digit masked; null when unread. */
  getLocalAddressShape(): string | null;
};

export function createHomeyApiClient(
  lib: HomeyApiLib,
  settings: ConnectionSettings,
  deps: ApiClientDeps,
): RealHomeyClient {
  let listeners = new Set<(event: ClientEvent) => void>();
  let localAddress: string | null = settings.localAddress !== null && isIPv4(settings.localAddress) ? settings.localAddress : null;
  let localAddressShape: string | null = null;
  let current: Connection | null = null;
  let homeyId: string | null = null;
  let softwareVersion: string | null = null;
  let stopWatching: () => void = () => {};
  let disconnected = false;
  let recovering = false;
  let recoveryHandle: unknown = null;
  /** How many recovery attempts have been scheduled since the loss, or since the network came back. */
  let recoveryAttempt = 0;
  let removeRecoveryOnline: () => void = () => {};
  let ticking = false;
  let switching = false;
  let sameRouteTicks = 0;
  /** Bumped on every loss, so a resync that started before a new loss can tell it is stale. */
  let lossEpoch = 0;
  /**
   * The devices the adapter has delivered, kept current with live values: a resync reports the ones that vanished,
   * and an incomplete device report is laid over the device it is about.
   */
  let remembered = new Map<string, Device>();
  let bufferSeq = 0;
  let livenessHandle: unknown = null;
  let checking = false;
  /** When the current connection last reported anything, and how long it may stay silent. */
  let lastReportAt = 0;
  let silenceLimit = SILENCE_REOPEN_MS;
  let authReported = false;

  const emit = (event: ClientEvent): void => {
    for (const listener of [...listeners]) listener(event);
  };

  /** Reads one collection; a missing right (403) is an empty collection, a rejected key (401) is an auth failure. */
  const read = async (fn: () => Promise<Collection>): Promise<Collection> => {
    try {
      return await fn();
    } catch (error) {
      const status = statusOf(error);
      if (status === 403) return {};
      deps.onFailure?.(error);
      throw status === 401 ? new ConnectionError('auth') : new ConnectionError('unreachable');
    }
  };

  /**
   * Reads from Insights: a missing right (403) or log (404) is nothing, a rejected key (401) goes the way of every
   * rejected key and is an auth failure; anything else is unreachable.
   */
  const readInsights = async (fn: () => Promise<unknown>): Promise<unknown> => {
    try {
      return await fn();
    } catch (error) {
      const status = statusOf(error);
      if (status === 403 || status === 404) return null;
      if (status === 401) {
        authFailed();
        throw new ConnectionError('auth');
      }
      throw new ConnectionError('unreachable');
    }
  };

  /** Anything the current connection reports proves it is not silent. */
  const noteReport = (conn: Connection): void => {
    if (conn !== current) return;
    lastReportAt = deps.now();
    silenceLimit = SILENCE_REOPEN_MS;
  };

  const subscribeDevice = (conn: Connection, raw: unknown): void => {
    const deviceId = deviceIdOf(raw);
    const device = raw as LibDevice;
    if (deviceId === null || typeof device.makeCapabilityInstance !== 'function') return;
    for (const capabilityId of Array.isArray(device.capabilities) ? device.capabilities : []) {
      const key = `${deviceId}:${capabilityId}`;
      if (conn.subscribed.has(key)) continue;
      try {
        device.makeCapabilityInstance(capabilityId, (value) => {
          if (conn.closed) return;
          noteReport(conn);
          const at = new Date().toISOString();
          if (conn.buffer) {
            // Deleting first moves the entry to the end, so it stays in order with later device reports.
            conn.buffer.delete(key);
            conn.buffer.set(key, { kind: 'value', deviceId, capabilityId, value: value as CapabilityValue, at });
            return;
          }
          const device = remembered.get(deviceId);
          const capability = device?.capabilities[capabilityId];
          if (device && capability) {
            remembered.set(deviceId, { ...device, capabilities: { ...device.capabilities, [capabilityId]: { ...capability, value: value as CapabilityValue, lastUpdated: at } } });
          }
          emit({ type: 'capability', deviceId, capabilityId, value: value as CapabilityValue, at });
        });
        conn.subscribed.add(key);
      } catch {
        // A single capability may fail without breaking the others.
      }
    }
  };

  const openConnection = async (candidate: RouteCandidate, id: string, version: string | null): Promise<{ conn: Connection; snapshot: HomeySnapshot }> => {
    const api = new lib.HomeyAPIV3Local({
      token: settings.apiKey,
      baseUrl: candidate.baseUrl,
      strategy: [],
      properties: { id, softwareVersion: version },
      debug: () => {},
    });
    // Everything this connection reports is kept until its devices have been read and handed over.
    const conn: Connection = { api, route: candidate.route, closed: false, subscribed: new Set(), buffer: new Map() };
    try {
      let session: { intersectedScopes?: string[]; scopes?: string[] };
      try {
        session = await api.sessions.getSessionMe();
      } catch (error) {
        deps.onFailure?.(error);
        throw new ConnectionError(statusOf(error) === 401 ? 'auth' : 'unreachable');
      }
      const scopes = session.intersectedScopes ?? session.scopes ?? [];

      // Subscribe first, then read: a change between the two would otherwise be lost.
      try {
        await api.devices.connect();
      } catch (error) {
        if (statusOf(error) !== 403) deps.onFailure?.(error);
        if (statusOf(error) === 401) throw new ConnectionError('auth');
        if (statusOf(error) !== 403) throw new ConnectionError('unreachable');
      }
      api.devices.on('device.update', (device) => { if (!conn.closed) onDevice(conn, device); });
      api.devices.on('device.create', (device) => { if (!conn.closed) onDevice(conn, device); });
      api.devices.on('device.delete', (device) => { if (!conn.closed) onDeviceRemoved(conn, device); });

      const devices = await read(() => api.devices.getDevices());
      for (const device of Object.values(devices)) subscribeDevice(conn, device);
      const zones = await read(() => api.zones.getZones());
      const flows = await read(() => api.flow.getFlows());
      const advancedFlows = await read(() => api.flow.getAdvancedFlows());

      api.on('disconnect', () => { if (current === conn && !conn.closed) onLoss(); });
      api.on('connect', () => { if (current === conn && !conn.closed && recovering) void onReconnected(conn); });

      const snapshot = toSnapshot({ homeyId: id, softwareVersion: version, scopes, devices, zones, flows, advancedFlows });
      // From here on the caller owns the devices; later reports are emitted as they arrive.
      snapshot.devices = handOver(conn, snapshot.devices);
      return { conn, snapshot };
    } catch (error) {
      closeConnection(conn);
      throw error;
    }
  };

  const onDevice = (conn: Connection, raw: unknown): void => {
    noteReport(conn);
    subscribeDevice(conn, raw);
    if (conn.buffer) {
      conn.buffer.set(`\u0000${++bufferSeq}`, { kind: 'device', raw });
      return;
    }
    const device = deviceFrom(raw, (id) => remembered.get(id));
    if (!device) return;
    remembered.set(device.id, device);
    emit({ type: 'device', device });
  };

  const onDeviceRemoved = (conn: Connection, raw: unknown): void => {
    const id = deviceIdOf(raw);
    if (id === null) return;
    noteReport(conn);
    if (conn.buffer) {
      conn.buffer.set(`\u0000${++bufferSeq}`, { kind: 'removed', deviceId: id });
      return;
    }
    remembered.delete(id);
    emit({ type: 'deviceRemoved', deviceId: id });
  };

  /** Ends the buffering and lays what the connection reported in the meantime over the devices that were read. */
  const handOver = (conn: Connection, read: Record<string, Device>): Record<string, Device> => {
    const buffer = conn.buffer;
    conn.buffer = null;
    const devices = { ...read };
    // A device that was read without an id cannot be addressed and would only show up as a ghost.
    delete devices[''];
    for (const entry of buffer?.values() ?? []) {
      if (entry.kind === 'device') {
        const device = deviceFrom(entry.raw, (id) => devices[id]);
        if (device) devices[device.id] = device;
      } else if (entry.kind === 'removed') {
        delete devices[entry.deviceId];
      } else {
        const device = devices[entry.deviceId];
        const capability = device?.capabilities[entry.capabilityId];
        if (!device || !capability) continue;
        devices[entry.deviceId] = { ...device, capabilities: { ...device.capabilities, [entry.capabilityId]: { ...capability, value: entry.value, lastUpdated: entry.at } } };
      }
    }
    return devices;
  };

  /** Reports what was buffered as ordinary events; used when a read failed and there is nothing to lay it over. */
  const replay = (conn: Connection): void => {
    const buffer = conn.buffer;
    conn.buffer = null;
    for (const entry of buffer?.values() ?? []) {
      if (entry.kind === 'device') onDevice(conn, entry.raw);
      else if (entry.kind === 'removed') onDeviceRemoved(conn, { id: entry.deviceId });
      else emit({ type: 'capability', deviceId: entry.deviceId, capabilityId: entry.capabilityId, value: entry.value, at: entry.at });
    }
  };

  const closeConnection = (conn: Connection): void => {
    conn.closed = true;
    try {
      conn.api.destroy();
    } catch {
      // Cleaning up must not throw.
    }
  };

  /** The ID this adapter recorded, otherwise a valid one from the settings; never an unchecked string. */
  const knownHomeyId = (): string | null => homeyId ?? (settings.homeyId !== null && isHomeyId(settings.homeyId) ? settings.homeyId : null);
  /** Built from the known ID, so a connection made by IP address alone can still fall back to the cloud. */
  const candidates = (): RouteCandidate[] => candidatesFor({ homeyId: knownHomeyId(), localAddress });

  const localCandidate = (): RouteCandidate | undefined => candidates().find((c) => c.route === 'local');

  const startWatching = (): void => {
    const local = localCandidate();
    if (!local || disconnected || authReported) return;
    stopWatching();
    stopWatching = watchForLocal({
      isLocalReachable: async () => (await probe(local, homeyId, deps.fetch, LOCAL_TIMEOUT_MS)).ok,
      onLocalAvailable: () => { void moveToLocal(local); },
      setInterval: deps.setInterval,
      clearInterval: deps.clearInterval,
      addOnlineListener: deps.addOnlineListener,
    });
  };

  const stopRecovery = (): void => {
    if (recoveryHandle !== null) deps.clearTimeout(recoveryHandle);
    recoveryHandle = null;
    removeRecoveryOnline();
    removeRecoveryOnline = () => {};
    recovering = false;
    sameRouteTicks = 0;
  };

  /** Plans the next recovery attempt; there is never more than one waiting. */
  const scheduleRecovery = (): void => {
    if (recoveryHandle !== null) deps.clearTimeout(recoveryHandle);
    const delay = RECOVERY_DELAYS_MS[Math.min(recoveryAttempt, RECOVERY_DELAYS_MS.length - 1)] as number;
    recoveryAttempt += 1;
    recoveryHandle = deps.setTimeout(() => { void recoveryTick(); }, delay);
  };

  const stopLiveness = (): void => {
    if (livenessHandle !== null) deps.clearInterval(livenessHandle);
    livenessHandle = null;
  };

  /** A rejected key: report it once and stop watching, recovering and checking until connect() is called again. */
  const authFailed = (): void => {
    if (authReported) return;
    authReported = true;
    stopRecovery();
    stopWatching();
    stopWatching = () => {};
    stopLiveness();
    emit({ type: 'authError' });
  };

  /** Emits the current devices and reports the ones that disappeared since the last delivery. */
  const resync = (devices: Record<string, Device>): void => {
    for (const device of Object.values(devices)) emit({ type: 'device', device });
    for (const id of remembered.keys()) if (!(id in devices)) emit({ type: 'deviceRemoved', deviceId: id });
    remembered = new Map(Object.entries(devices));
  };

  const onLoss = (): void => {
    if (recovering) return;
    recovering = true;
    sameRouteTicks = 0;
    lossEpoch += 1;
    stopWatching();
    stopWatching = () => {};
    emit({ type: 'route', route: null });
    recoveryAttempt = 0;
    // When the network returns there is no reason to sit out a long delay: try at once and start the delays again.
    removeRecoveryOnline = deps.addOnlineListener(() => {
      if (!recovering || disconnected) return;
      recoveryAttempt = 0;
      void recoveryTick();
    });
    scheduleRecovery();
  };

  /** The library re-established its own socket while we were recovering. */
  const onReconnected = async (conn: Connection): Promise<void> => {
    const epoch = lossEpoch;
    stopRecovery();
    // Keep what arrives during the read, so an older value that was read cannot overwrite a newer live one.
    const buffer = new Map<string, Buffered>();
    conn.buffer = buffer;
    let rawDevices: Collection | null = null;
    let rejected = false;
    try {
      rawDevices = await read(() => conn.api.devices.getDevices());
    } catch (error) {
      // The connection is back; a failed resync must not undo that. A rejected key is another matter.
      rejected = error instanceof ConnectionError && error.failure === 'auth';
    }
    // A later resync on this connection has taken over the buffering.
    if (conn.buffer !== buffer) return;
    // The world may have moved on during the read: a new loss, a disconnect or a replaced connection.
    if (disconnected || recovering || epoch !== lossEpoch || current !== conn || conn.closed) {
      conn.buffer = null;
      return;
    }
    if (rejected) {
      conn.buffer = null;
      authFailed();
      return;
    }
    if (rawDevices) {
      const devices: Record<string, Device> = {};
      for (const raw of Object.values(rawDevices)) {
        subscribeDevice(conn, raw);
        const device = toDevice(raw);
        devices[device.id] = device;
      }
      resync(handOver(conn, devices));
    } else {
      replay(conn);
    }
    lastReportAt = deps.now();
    emit({ type: 'route', route: conn.route });
    if (conn.route === 'cloud') startWatching();
  };

  /**
   * Opens a complete new connection, then closes the old one, resyncs and reports the route.
   * Only one switch runs at a time; returns false when nothing was switched.
   */
  const switchTo = async (candidate: RouteCandidate, stillWanted: () => boolean): Promise<boolean> => {
    if (switching || disconnected) return false;
    switching = true;
    try {
      const before = current;
      const { conn, snapshot } = await openConnection(candidate, homeyId as string, softwareVersion);
      if (disconnected || current !== before || !stillWanted()) {
        closeConnection(conn);
        return false;
      }
      current = conn;
      lastReportAt = deps.now();
      if (before) closeConnection(before);
      stopRecovery();
      stopWatching();
      stopWatching = () => {};
      resync(snapshot.devices);
      emit({ type: 'route', route: conn.route });
      if (conn.route === 'cloud') startWatching();
      void learnLocalAddress(conn);
      return true;
    } finally {
      switching = false;
    }
  };

  /** One call that needs no right and uses the key, so a revoked key shows up too. No answer within the limit is a loss. */
  const checkAlive = (conn: Connection): Promise<'ok' | 'auth' | 'lost'> => new Promise((resolve) => {
    const timer = setTimeout(() => resolve('lost'), CLOUD_TIMEOUT_MS);
    conn.api.sessions.getSessionMe().then(
      () => { clearTimeout(timer); resolve('ok'); },
      (error: unknown) => { clearTimeout(timer); resolve(statusOf(error) === 401 ? 'auth' : 'lost'); },
    );
  });

  const livenessTick = async (): Promise<void> => {
    const conn = current;
    if (checking || disconnected || authReported || recovering || switching || !conn) return;
    checking = true;
    try {
      const outcome = await checkAlive(conn);
      // The world may have moved on during the check.
      if (disconnected || recovering || current !== conn || conn.closed) return;
      if (outcome === 'auth') { authFailed(); return; }
      if (outcome === 'lost') { onLoss(); return; }
      if (deps.now() - lastReportAt <= silenceLimit) return;
      // The hub answers but this connection has gone silent: replace it on the same route, without reporting a loss.
      const candidate = candidates().find((c) => c.route === conn.route);
      if (!candidate) return;
      const limit = silenceLimit;
      if (await switchTo(candidate, () => !recovering)) silenceLimit = Math.min(limit * 2, SILENCE_REOPEN_MAX_MS);
    } catch (error) {
      if (error instanceof ConnectionError && error.failure === 'auth') authFailed();
      // Any other failure leaves the connection as it is; the next check tries again.
    } finally {
      checking = false;
    }
  };

  const startLiveness = (): void => {
    if (livenessHandle !== null) return;
    livenessHandle = deps.setInterval(() => { void livenessTick(); }, LIVENESS_INTERVAL_MS);
  };

  /** On the cloud route with a local address that was just learned: try it at once, and keep watching if it does not answer. */
  const lookForLocal = (): void => {
    const local = localCandidate();
    if (!local) return;
    stopWatching();
    stopWatching = () => {};
    void (async () => {
      const reachable = (await probe(local, homeyId, deps.fetch, LOCAL_TIMEOUT_MS)).ok;
      if (disconnected || authReported || recovering || current?.route !== 'cloud') return;
      if (reachable) await moveToLocal(local);
      else startWatching();
    })();
  };

  /**
   * Reads the hub's system info in the background after every opening. On the cloud route a private address that
   * differs from the known one is taken over, so a connection that began with only a Homey ID finds the local route.
   * On the local route the address that demonstrably works is kept.
   */
  const learnLocalAddress = async (conn: Connection): Promise<void> => {
    let info: { wifiAddress?: unknown } | null | undefined;
    try {
      info = await conn.api.system.getInfo();
    } catch (error) {
      // Without the right to read the system info (403) the connection simply stays as it is.
      if (statusOf(error) === 401 && !disconnected && current === conn && !conn.closed) authFailed();
      return;
    }
    if (disconnected || authReported || current !== conn || conn.closed) return;
    const field = typeof info === 'object' && info !== null ? info.wifiAddress : undefined;
    localAddressShape = addressShape(field);
    const found = privateIPv4From(field);
    if (found === null || found === localAddress || conn.route !== 'cloud') return;
    localAddress = found;
    emit({ type: 'localAddress', address: found });
    if (!recovering) lookForLocal();
  };

  const moveToLocal = async (local: RouteCandidate): Promise<void> => {
    let switched = false;
    try {
      switched = await switchTo(local, () => !recovering);
    } catch (error) {
      if (error instanceof ConnectionError && error.failure === 'auth') {
        authFailed();
        return;
      }
      // Otherwise keep the cloud connection and keep watching.
    }
    if (!switched && !recovering && !disconnected && current?.route === 'cloud') startWatching();
  };

  const recoveryTick = async (): Promise<void> => {
    if (ticking || disconnected || !recovering || !current) return;
    ticking = true;
    try {
      const chosen = await chooseRoute(candidates(), knownHomeyId(), deps.fetch);
      if (!chosen || !current) {
        sameRouteTicks = 0;
        return;
      }
      if (chosen.candidate.route === current.route) {
        sameRouteTicks += 1;
        if (sameRouteTicks < SAME_ROUTE_RETRY_TICKS) return;
      }
      sameRouteTicks = 0;
      await switchTo(chosen.candidate, () => recovering);
    } catch (error) {
      if (error instanceof ConnectionError && error.failure === 'auth') authFailed();
    } finally {
      ticking = false;
      if (recovering && !disconnected) scheduleRecovery();
    }
  };

  return {
    async connect() {
      disconnected = false;
      authReported = false;
      stopRecovery();
      const expected = knownHomeyId();
      // Without an ID there is no cloud route to fall back on, and the browser may still be asking for permission.
      const chosen = await chooseRoute(candidates(), expected, deps.fetch, expected === null ? { localTimeoutMs: FIRST_LOCAL_TIMEOUT_MS } : {});
      if (disconnected || !chosen) throw new ConnectionError('unreachable');
      // The probe only passes on an ID that is a valid Homey ID.
      const id = expected ?? chosen.homeyId;
      if (!id) throw new ConnectionError('homey-id-unknown');
      const { conn, snapshot } = await openConnection(chosen.candidate, id, chosen.softwareVersion);
      if (disconnected) {
        closeConnection(conn);
        throw new ConnectionError('unreachable');
      }
      homeyId = id;
      softwareVersion = chosen.softwareVersion;
      if (current) closeConnection(current);
      current = conn;
      remembered = new Map(Object.entries(snapshot.devices));
      lastReportAt = deps.now();
      silenceLimit = SILENCE_REOPEN_MS;
      startLiveness();
      emit({ type: 'route', route: conn.route });
      if (conn.route === 'cloud') {
        stopWatching();
        startWatching();
      }
      // In the background: connect() does not wait for it.
      void learnLocalAddress(conn);
      return snapshot;
    },
    async setCapability(deviceId, capabilityId, value) {
      const conn = current;
      if (!conn) throw new Error('Not connected');
      try {
        await conn.api.devices.setCapabilityValue({ deviceId, capabilityId, value });
      } catch (error) {
        if (statusOf(error) === 401) authFailed();
        throw error;
      }
    },
    async startFlow(flow) {
      const conn = current;
      if (!conn) throw new Error('Not connected');
      try {
        if (flow.kind === 'flow') await conn.api.flow.triggerFlow({ id: flow.id });
        else await conn.api.flow.triggerAdvancedFlow({ id: flow.id });
      } catch (error) {
        if (statusOf(error) === 401) authFailed();
        throw error;
      }
    },
    async readStructure() {
      const conn = current;
      if (!conn || recovering) return null;
      try {
        const zones = await read(() => conn.api.zones.getZones());
        const flows = await read(() => conn.api.flow.getFlows());
        const advancedFlows = await read(() => conn.api.flow.getAdvancedFlows());
        const snapshot = toSnapshot({ homeyId: '', softwareVersion: null, scopes: [], devices: {}, zones, flows, advancedFlows });
        return { zones: snapshot.zones, flows: snapshot.flows };
      } catch {
        // the liveness check finds out what is the matter
        return null;
      }
    },
    rawHistory: {
      async logs() {
        if (!current) throw new ConnectionError('unreachable');
        return current.api.insights.getLogs();
      },
      async entries(id, resolution) {
        if (!current) throw new ConnectionError('unreachable');
        return current.api.insights.getLogEntries({ id, ...(resolution === null ? {} : { resolution }) });
      },
    },
    async listHistory(known = []) {
      const conn = current;
      if (!conn) return [];
      return sourcesFrom(await readInsights(() => conn.api.insights.getLogs()), known);
    },
    async readSeries(source, period) {
      const conn = current;
      if (!conn) return null;
      const entries = (resolution: string) => readInsights(() => conn.api.insights.getLogEntries({ id: source.log, resolution }));
      if (period !== 'year') return seriesFrom(await entries(period));
      const [last, now] = [await entries('lastYear'), await entries('thisYear')];
      return yearFrom(seriesFrom(last), seriesFrom(now), deps.now());
    },
    async readSwitches(source) {
      const conn = current;
      if (!conn) return null;
      const raw = await readInsights(() => conn.api.insights.getLogEntries({ id: source.log }));
      return raw === null ? null : switchesFrom(raw);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    disconnect() {
      disconnected = true;
      stopRecovery();
      stopLiveness();
      stopWatching();
      stopWatching = () => {};
      if (current) closeConnection(current);
      current = null;
      listeners = new Set();
    },
    getHomeyId() {
      return homeyId;
    },
    getLocalAddress() {
      return localAddress;
    },
    getLocalAddressShape() {
      return localAddressShape;
    },
  };
}
