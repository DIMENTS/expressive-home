import type { ClientEvent } from '../homey/client';
import type { CapabilityValue, Device, HomeySnapshot, Route } from '../homey/types';
import { layoutKey } from './layout-key';

export interface Store {
  load(snapshot: HomeySnapshot): void;
  apply(event: ClientEvent): void;
  getDevice(id: string): Device | undefined;
  getDevices(): Device[];
  getSnapshot(): HomeySnapshot | null;
  getRoute(): Route | null;
  subscribeDevice(id: string, listener: () => void): () => void;
  /** Who listens to a device draws it again: something beside its values changed. */
  touch(id: string): void;
  /** Devices added or removed, route changes, and reloads. */
  subscribeStructure(listener: () => void): () => void;
  control(deviceId: string, capabilityId: string, value: CapabilityValue, send: () => Promise<void>): Promise<void>;
}

interface PendingControl {
  count: number;
  previous: CapabilityValue;
  hasLive: boolean;
  live: CapabilityValue;
  liveAt: string | null;
}

export interface StoreOptions {
  /** Receives what a listener threw; without it the error goes to the console. */
  onListenerError?(error: unknown): void;
}

export function createStore(schedule: (flush: () => void) => void, options: StoreOptions = {}): Store {
  let base: HomeySnapshot | null = null;
  let devices: Record<string, Device> = {};
  let route: Route | null = null;
  const deviceListeners = new Map<string, Set<() => void>>();
  const structureListeners = new Set<() => void>();
  const dirty = new Set<string>();
  let structureDirty = false;
  let scheduled = false;
  const pending = new Map<string, PendingControl>();

  const pendingKey = (deviceId: string, capabilityId: string) => `${deviceId}\u0000${capabilityId}`;

  function flush(): void {
    scheduled = false;
    const ids = [...dirty];
    const structure = structureDirty;
    dirty.clear();
    structureDirty = false;
    for (const id of ids) {
      for (const listener of [...(deviceListeners.get(id) ?? [])]) notify(listener);
    }
    if (structure) for (const listener of [...structureListeners]) notify(listener);
  }

  /** One listener that throws must not keep the others in this flush from hearing the change. */
  function notify(listener: () => void): void {
    try {
      listener();
    } catch (error) {
      if (options.onListenerError) options.onListenerError(error);
      else console.error(error);
    }
  }

  function request(): void {
    if (scheduled) return;
    scheduled = true;
    schedule(flush);
  }

  function setValue(deviceId: string, capabilityId: string, value: CapabilityValue, at: string | null): void {
    const current = devices[deviceId];
    const capability = current?.capabilities[capabilityId];
    if (!current || !capability) return;
    devices[deviceId] = {
      ...current,
      capabilities: { ...current.capabilities, [capabilityId]: { ...capability, value, lastUpdated: at ?? capability.lastUpdated } },
    };
    dirty.add(deviceId);
    request();
  }

  function apply(event: ClientEvent): void {
    switch (event.type) {
      case 'capability': {
        const entry = pending.get(pendingKey(event.deviceId, event.capabilityId));
        if (entry) {
          entry.hasLive = true;
          entry.live = event.value;
          entry.liveAt = event.at;
          return;
        }
        setValue(event.deviceId, event.capabilityId, event.value, event.at);
        return;
      }
      case 'device': {
        // A new device, one whose make-up changed or one that went to another room changes the layout; a new name or value does not.
        const known = devices[event.device.id];
        if (!known || known.zoneId !== event.device.zoneId || layoutKey(known) !== layoutKey(event.device)) structureDirty = true;
        devices[event.device.id] = event.device;
        dirty.add(event.device.id);
        request();
        return;
      }
      case 'deviceRemoved':
        if (!(event.deviceId in devices)) return;
        delete devices[event.deviceId];
        dirty.add(event.deviceId);
        structureDirty = true;
        request();
        return;
      case 'route':
        if (route === event.route) return;
        route = event.route;
        structureDirty = true;
        request();
        return;
      case 'structure':
        if (!base || JSON.stringify([base.zones, base.flows]) === JSON.stringify([event.zones, event.flows])) return;
        base = { ...base, zones: event.zones, flows: event.flows };
        structureDirty = true;
        request();
        return;
      case 'scopes':
        if (!base || (JSON.stringify(base.scopes) === JSON.stringify(event.scopes) && (event.flowAccess ?? base.flowAccess) === base.flowAccess)) return;
        base = { ...base, scopes: event.scopes, ...(event.flowAccess === undefined ? {} : { flowAccess: event.flowAccess }) };
        structureDirty = true;
        request();
        return;
      case 'localAddress':
      case 'authError':
        // Not part of the live state; the app handles these itself.
        return;
    }
  }

  async function control(deviceId: string, capabilityId: string, value: CapabilityValue, send: () => Promise<void>): Promise<void> {
    const capability = devices[deviceId]?.capabilities[capabilityId];
    const key = pendingKey(deviceId, capabilityId);
    let entry = pending.get(key);
    if (entry) entry.count += 1;
    else {
      entry = { count: 1, previous: capability?.value ?? null, hasLive: false, live: null, liveAt: null };
      pending.set(key, entry);
    }
    setValue(deviceId, capabilityId, value, null);
    let failure: { error: unknown } | null = null;
    try {
      await send();
    } catch (error) {
      failure = { error };
    }
    // A reload discards pending entries; a control that outlives one must not touch the store.
    if (pending.get(key) !== entry) {
      if (failure) throw failure.error;
      return;
    }
    entry.count -= 1;
    if (entry.count === 0) {
      pending.delete(key);
      if (entry.hasLive) setValue(deviceId, capabilityId, entry.live, entry.liveAt);
      else if (failure) setValue(deviceId, capabilityId, entry.previous, null);
    }
    if (failure) throw failure.error;
  }

  function subscribe<K>(map: Map<K, Set<() => void>>, key: K, listener: () => void): () => void {
    let set = map.get(key);
    if (!set) { set = new Set(); map.set(key, set); }
    set.add(listener);
    return () => {
      set.delete(listener);
      // Do not leave an empty set behind for a device nobody listens to any more.
      if (set.size === 0 && map.get(key) === set) map.delete(key);
    };
  }

  return {
    load(snapshot) {
      base = snapshot;
      devices = { ...snapshot.devices };
      pending.clear();
      for (const id of Object.keys(devices)) dirty.add(id);
      structureDirty = true;
      request();
    },
    apply,
    getDevice: (id) => devices[id],
    getDevices: () => Object.values(devices),
    getSnapshot: () => (base ? { ...base, devices: { ...devices } } : null),
    getRoute: () => route,
    touch(id) {
      dirty.add(id);
      request();
    },
    subscribeDevice: (id, listener) => subscribe(deviceListeners, id, listener),
    subscribeStructure(listener) {
      structureListeners.add(listener);
      return () => { structureListeners.delete(listener); };
    },
    control,
  };
}
