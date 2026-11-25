import type { Grouping, TileSpec } from '../../dashboard/types';
import { parseAddress } from '../../homey/address';
import type { ConnectionSettings } from '../../homey/api-client';
import { ConnectionError, type ClientEvent, type HomeyClient } from '../../homey/client';
import { createHistoryAccess } from './history';
import { clampTarget, climateOf, targetStep } from '../../controls/climate';
import { isGuarded } from '../../controls/danger';
import { number as numberOf } from '../../controls/find';
import { isButton } from '../../homey/buttons';
import { missingFeatures, type Feature } from '../../homey/permissions';
import type { CapabilityValue, Route } from '../../homey/types';
import { resolveLanguage, type Language, type Translate } from '../../i18n/index';
import { newLayoutId, type LayoutEdit } from '../../layout/edit';
import type { Store } from '../../state/store';
import type { Demo } from './demo';
import { lampsCommands } from './lamps';
import { createDefaultConfig, type AppConfig, type ConfigStore, type OwnConfig } from '../../storage/config';
import { isValidSeed } from '../../theme/engine';
import type { ThemeSettings } from '../../theme/types';
import type { WallSettings } from '../../wall/settings';
import type { SnackbarMessage } from '../parts/snackbar';
import type { DashboardStatus, UiActions } from './context';
import { createLayouts, type ImportResult, type LayoutState } from './layouts';
import { createLooks, type LookState } from './looks';
import { createLooksStore, type LooksStore } from '../../storage/looks-store';
import type { ChosenLook, DeviceLook, HouseLook } from '../../theme/choose';
import type { LookOp } from '../../theme/look-ops';
import type { LooksDoc } from '../../theme/looks-doc';
import type { ThemeFile } from '../../theme/look';

export type ConnectIssue = 'none' | 'invalid-address' | 'ambiguous-address' | 'missing-key' | 'unreachable' | 'auth' | 'revoked';

/** What the app shows. The API key is never part of it. */
export interface AppState extends LayoutState {
  phase: 'connect' | 'connecting' | 'dashboard' | 'demo';
  connectIssue: ConnectIssue; busy: boolean; waitingForPermission: boolean;
  /** Missing rights waiting for "Toch doorgaan". */
  review: Feature[] | null;
  /** Prefill for the connect screen: the Homey id or the local address, never the key. */
  savedAddress: string;
  route: Route | null; missing: Feature[];
  startUnreachable: boolean; restored: boolean;
  theme: ThemeSettings; softwareVersion: string | null;
  /** The device whose window is open. */
  openDeviceId: string | null;
  /** The saved choice (null: follow the browser) and the language in use. */
  language: { choice: Language | null; active: Language };
  /** The own colour per section id; the hero's is under HERO_SECTION_ID. */
  sectionSeeds: Record<string, string>;
  /** The dashboard this device starts with; null: the first. */
  startBoard: string | null;
  /** What is set up on this device for a wall tablet. */
  wall: WallSettings;
  /** The hub that is open, also before it answers; 'demo' for the example hub. */
  hubId: string | null;
  /** What this device chose of looks, the house's choice and the themes there are. */
  look: LookState;
}

type RealClient = HomeyClient & { getHomeyId(): string | null; getLocalAddress(): string | null };

export interface ControllerDeps {
  configStore: ConfigStore; store: Store;
  /** Null when the vendor bundle is missing. */
  createRealClient(settings: ConnectionSettings): RealClient | null;
  createDemoClient(which: Demo, language: Language): HomeyClient;
  notify(message: SnackbarMessage): void;
  setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void;
  /** The app's translate function; the controller switches its language. */
  t: Translate & { setLanguage(language: Language): void };
  /** The browser's preferred languages, first the most preferred. */
  browserLanguages: readonly string[];
  /** Whether this device may arrange the dashboards; without it, it may. */
  mayArrange?(): boolean;
  /** The app on the hub served this page. */
  served?: boolean;
  /** Where this device keeps its looks; without it, nothing is kept. */
  looksStore?: LooksStore;
  /** What the hub says this device may (null: not yet); without it the device is its own. */
  lookRole?(): 'edit' | 'use' | null;
  /** Changes of the house's looks to the hub. */
  sendLooks?(ops: LookOp[]): void;
}

/** A storage that keeps what it is given for as long as the page is open. */
const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const items = new Map<string, string>();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); }, removeItem: (key) => { items.delete(key); } };
};

/** Delays between attempts while the hub cannot be reached at the start; the last one repeats. */
export const START_RETRY_MS = [5000, 10000, 30000, 60000];
/** Connecting by IP address alone: after this long, explain the browser may be asking for permission. */
export const PERMISSION_HINT_MS = 2000;
/** How long "Weer verbonden" stays after the route came back. */
export const RESTORED_MS = 3000;
/** The dashboard is rebuilt this long after the last change of the hub's make-up, so a run of changes rebuilds once. */
export const REBUILD_QUIET_MS = 2000;
/** Where a target begins that nobody knows. */
const DEFAULT_TARGET = 20;
/** A lock or a door that says nothing for this long is taken to be where it was. */
export const BUSY_MS = 10_000;
/** Tapping a target goes to the hub this long after the last tap. */
export const NUDGE_MS = 600;
/** A command without an answer after this long counts as failed. */
export const CONTROL_TIMEOUT_MS = 10_000;

/**
 * The app controller: one state for the screen, the connection to the hub, the actions of the
 * interface and the notices. Without a route or a right nothing is sent and a short notice says why.
 */
export function createController(deps: ControllerDeps) {
  const { configStore, store, t } = deps;
  /** What belongs to this device, when the store can say it at once. */
  function ownConfig(): Partial<OwnConfig> {
    try {
      return configStore.peek?.() ?? {};
    } catch {
      return {};
    }
  }
  let config: AppConfig = { ...createDefaultConfig(), ...ownConfig() };
  /** What the store has of the hub was read since the start: a layout is not worked out with what was there before. */
  let fresh = false;
  const layouts = createLayouts({
    snapshot: () => (fresh ? store.getSnapshot() : null),
    locale: () => t.locale,
    appearance: () => ({ theme: config.theme, sectionSeeds: { ...config.sectionSeeds } }),
    setAppearance({ theme, sectionSeeds }) {
      // the example hub keeps nothing (5.12): the look of a file lasts until it is left
      if (isDemo) ownLook ??= { theme: config.theme, sectionSeeds: config.sectionSeeds };
      // colour and light or dark are this device's look: where it follows the house, the file's are left out on purpose
      const took = looks.fromFile(theme);
      const next: ThemeSettings = { ...theme, seed: took.seed ? theme.seed.toLowerCase() : config.theme.seed, mode: took.mode ? theme.mode : config.theme.mode };
      config.theme = next;
      config.sectionSeeds = { ...sectionSeeds };
      set({ theme: next, sectionSeeds: { ...sectionSeeds } });
      if (!isDemo) void save();
    },
    stored: (hubId) => config.layouts[hubId],
    store(hubId, layout) {
      // the hub in use goes last: only the last few hubs are kept
      const { [hubId]: _old, ...others } = config.layouts;
      config.layouts = { ...others, [hubId]: layout };
      void save();
    },
    startBoard: () => config.startBoard,
    publish: () => set(layouts.state()),
  });
  let isDemo = false;
  const looks = createLooks({
    store: deps.looksStore ?? createLooksStore(memoryStorage()),
    role: () => (deps.lookRole ? deps.lookRole() : 'own'),
    theme: () => config.theme,
    setTheme(theme) {
      config.theme = theme;
      if (early) early.theme = theme;
      if (ownLook) ownLook = { ...ownLook, theme };
      set({ theme });
      void save();
    },
    publish: () => set({ look: looks.state() }),
    demo: () => isDemo,
    ...(deps.sendLooks ? { send: deps.sendLooks } : {}),
  });
  let state: AppState = {
    ...layouts.state(),
    look: looks.state(),
    phase: 'connecting', connectIssue: 'none', busy: false, waitingForPermission: false, review: null, savedAddress: '',
    route: null, missing: [], startUnreachable: false, restored: false,
    theme: config.theme, softwareVersion: null, openDeviceId: null,
    language: { choice: config.language, active: resolveLanguage(config.language, deps.browserLanguages) },
    sectionSeeds: {}, startBoard: config.startBoard, wall: config.wall, hubId: null,
  };
  t.setLanguage(state.language.active);
  let client: HomeyClient | null = null;
  /** The owner's own theme and colours while a file that was loaded in the example hub shows others; null otherwise. */
  let ownLook: Pick<AppConfig, 'theme' | 'sectionSeeds'> | null = null;
  /** What was set up for a wall tablet on the example hub, which keeps nothing; null: what this device has. */
  let demoWall: WallSettings | null = null;
  let stopEvents: () => void = () => {};
  /** Every attempt to (re)connect takes a number; the answer of an older attempt is ignored. */
  let generation = 0;
  let retryIndex = 0;
  let retryTimer: unknown = null;
  let permissionTimer: unknown = null;
  /** The client of a connect() that has not settled yet, so "Annuleren" can let it go. */
  let pending: HomeyClient | null = null;
  let restoredTimer: unknown = null;
  let lost = false;
  let saveFailureShown = false;
  /** What was chosen while the settings are still being read: it goes over them. */
  let early: Partial<Pick<AppConfig, 'theme' | 'language' | 'wall'>> | null = {};
  const listeners = new Set<() => void>();

  /** The example hub is everyone's own; on a hub it is what the owner chose for this device. */
  const mayArrange = (): boolean => isDemo || (deps.mayArrange?.() ?? true);

  const openHub = (): string | null => {
    if (state.phase === 'connect') return null;
    return isDemo ? 'demo' : ((client ? hubIdOf(client) : null) ?? config.connection.homeyId)?.toLowerCase() ?? null;
  };
  const set = (change: Partial<AppState>): void => {
    state = { ...state, ...change };
    state.hubId = openHub();
    for (const listener of [...listeners]) listener();
  };
  // what this device may is known from the last time, or it is its own: its look is there at once
  looks.roleChanged();
  const clearTimer = (handle: unknown): null => {
    if (handle !== null) deps.clearTimeout(handle);
    return null;
  };

  let rebuildTimer: unknown = null;
  /** Works out the dashboards again from what the store has now: an automatic one anew, an own one reconciled. */
  const rebuild = (): void => {
    rebuildTimer = clearTimer(rebuildTimer);
    layouts.refresh();
    set(layouts.state());
  };
  // A device that came, went or changed its make-up: rebuild once things are quiet; no snapshot at all is shown at once.
  store.subscribeStructure(() => {
    if (!store.getSnapshot()) { rebuild(); return; }
    rebuildTimer = clearTimer(rebuildTimer);
    rebuildTimer = deps.setTimeout(rebuild, REBUILD_QUIET_MS);
  });

  let storageQueue: Promise<unknown> = Promise.resolve();
  /** What reads and writes the storage happens in turn, so one never writes what another just changed. */
  function inTurn<T>(act: () => Promise<T>): Promise<T> {
    const result = storageQueue.then(act);
    storageQueue = result.catch(() => {});
    return result;
  }

  /**
   * Saves the configuration; a refusal (private window, full storage) is reported once and the app goes on. The
   * connection is only written by what changed it: a key that another tab took out of the storage must not come back.
   * On a page of the app on the hub there is no key, and that app knows by itself who is paired.
   */
  async function save(withConnection = false): Promise<void> {
    try {
      await inTurn(async () => {
        const { connection } = withConnection || deps.served ? config : await configStore.load();
        await configStore.save({ ...config, ...ownLook, connection });
      });
      saveFailureShown = false;
    } catch {
      if (saveFailureShown) return;
      saveFailureShown = true;
      deps.notify({ text: t('notify.saveFailed'), icon: 'error', tone: 'error', important: true });
    }
  }

  /** What locks, doors and alarms were told; they say themselves where they are. */
  const busyDevices = new Map<string, { capabilityId: string; value: CapabilityValue; timer: unknown }>();
  function settleBusy(deviceId: string): void {
    const busy = busyDevices.get(deviceId);
    if (!busy) return;
    deps.clearTimeout(busy.timer);
    busyDevices.delete(deviceId);
    store.touch(deviceId);
  }
  /** Targets that are still being tapped. */
  const nudges = new Map<string, { value: number; timer: unknown; sent: Promise<void>; done(): void; fail(error: unknown): void }>();

  function dropClient(): void {
    for (const id of [...busyDevices.keys()]) settleBusy(id);
    for (const { timer, fail } of nudges.values()) {
      deps.clearTimeout(timer);
      fail(new Error('left'));
    }
    nudges.clear();
    stopEvents();
    stopEvents = () => {};
    rebuildTimer = clearTimer(rebuildTimer);
    client?.disconnect();
    client = null;
    if (isDemo) looks.leaveDemo();
    isDemo = false;
    if (ownLook) {
      config = { ...config, ...ownLook };
      ownLook = null;
      set({ theme: config.theme, sectionSeeds: { ...config.sectionSeeds } });
    }
    if (demoWall) {
      demoWall = null;
      set({ wall: config.wall });
    }
    lost = false;
    restoredTimer = clearTimer(restoredTimer);
    layouts.leave();
    set({ editing: false });
  }

  function onEvent(event: ClientEvent): void {
    store.apply(event);
    if (event.type === 'capability' && busyDevices.get(event.deviceId)?.capabilityId === event.capabilityId) settleBusy(event.deviceId);
    if (event.type === 'device') settleBusy(event.device.id);
    if (event.type === 'deviceRemoved') settleBusy(event.deviceId);
    if (event.type === 'route') {
      const regained = lost && event.route !== null;
      if (event.route === null && (state.phase === 'dashboard' || state.phase === 'demo')) lost = true;
      if (regained) {
        lost = false;
        restoredTimer = clearTimer(restoredTimer);
        restoredTimer = deps.setTimeout(() => { restoredTimer = null; set({ restored: false }); }, RESTORED_MS);
      }
      set({ route: event.route, ...(regained ? { restored: true } : {}), ...(event.route === null ? { restored: false } : {}) });
    } else if (event.type === 'scopes') {
      set({ missing: missingFeatures(event.scopes) });
    } else if (event.type === 'authError') {
      void revoke();
    } else if (event.type === 'localAddress' && !isDemo && config.connection.apiKey) {
      void saveAddress(event.address);
    }
  }

  /** The address the connection found, kept with the key it belongs to: not when another tab changed or cleared that. */
  async function saveAddress(localAddress: string): Promise<void> {
    config.connection = { ...config.connection, localAddress };
    const stored = await configStore.load().catch(() => null);
    if (stored?.connection.apiKey === config.connection.apiKey) await save(true);
  }

  /** The key no longer works: back to the connect screen, only the key is removed; a paired device forgets the house. */
  async function revoke(): Promise<void> {
    generation += 1;
    dropClient();
    if (deps.served) looks.forgetHouse();
    retryTimer = clearTimer(retryTimer);
    config.connection = { ...config.connection, apiKey: null };
    set({ phase: 'connect', connectIssue: 'revoked', review: null, busy: false, startUnreachable: false, route: null, openDeviceId: null });
    await save(true);
  }

  /**
   * Makes a client, listens to it and connects; the store gets the snapshot. Throws what connecting threw.
   * A side attempt ("Nu proberen" while the route is gone) leaves the current client heard until the new one
   * has connected: its own events wait in a buffer, and it only takes over when nothing else happened meanwhile.
   */
  async function open(next: HomeyClient, kind: 'normal' | 'side' | 'demo' = 'normal'): Promise<boolean> {
    const side = kind === 'side';
    let mine = side ? -1 : ++generation;
    const startedAt = generation;
    const waiting: ClientEvent[] = [];
    const stop = next.subscribe((event) => {
      if (mine === -1) waiting.push(event);
      else if (mine === generation) onEvent(event);
    });
    const superseded = (): boolean => (side ? generation !== startedAt || state.route !== null : mine !== generation);
    let snapshot;
    try {
      snapshot = await next.connect();
    } catch (error) {
      stop();
      next.disconnect();
      if (superseded()) return false;
      throw error;
    }
    if (superseded()) {
      stop();
      next.disconnect();
      return false;
    }
    if (side) mine = ++generation;
    stopEvents();
    if (client && client !== next) client.disconnect();
    client = next;
    stopEvents = stop;
    for (const event of waiting.splice(0)) onEvent(event);
    store.load(snapshot);
    fresh = true;
    // do not wait for the store's next flush: the dashboard must be there when the phase says so
    rebuildTimer = clearTimer(rebuildTimer);
    layouts.use(kind === 'demo' ? null : hubIdOf(next));
    set({
      ...layouts.state(), missing: missingFeatures(snapshot.scopes),
      softwareVersion: snapshot.softwareVersion, route: store.getRoute() ?? state.route,
    });
    return true;
  }

  /** The Homey id a layout is kept under: the one the connection proved, otherwise the saved one. */
  const hubIdOf = (next: HomeyClient): string | null => ('getHomeyId' in next ? (next as RealClient).getHomeyId() : null) ?? config.connection.homeyId;

  function settingsFromConfig(): ConnectionSettings | null {
    const { homeyId, localAddress, apiKey } = config.connection;
    return apiKey ? { homeyId, localAddress, apiKey } : null;
  }

  async function attemptStart(): Promise<void> {
    retryTimer = clearTimer(retryTimer);
    const settings = settingsFromConfig();
    if (!settings) { set({ phase: 'connect' }); return; }
    const next = deps.createRealClient(settings);
    if (!next) { set({ phase: 'connect', connectIssue: 'unreachable', startUnreachable: false }); return; }
    try {
      if (!(await open(next))) return;
      retryIndex = 0;
      set({ phase: 'dashboard', startUnreachable: false, connectIssue: 'none' });
    } catch (error) {
      if (error instanceof ConnectionError && error.failure === 'auth') { await revoke(); return; }
      const delay = START_RETRY_MS[Math.min(retryIndex, START_RETRY_MS.length - 1)]!;
      retryIndex += 1;
      set({ phase: 'connecting', startUnreachable: true });
      retryTimer = deps.setTimeout(() => { retryTimer = null; void attemptStart(); }, delay);
    }
  }

  async function start(): Promise<void> {
    early = {};
    fresh = false;
    try {
      // in turn: what is chosen meanwhile is saved after it
      config = await inTurn(() => configStore.load());
    } catch {
      config = createDefaultConfig();
    }
    config = { ...config, ...early };
    early = null;
    const { homeyId, localAddress, apiKey } = config.connection;
    const active = resolveLanguage(config.language, deps.browserLanguages);
    t.setLanguage(active);
    set({ theme: config.theme, savedAddress: homeyId ?? localAddress ?? '', language: { choice: config.language, active }, sectionSeeds: { ...config.sectionSeeds }, startBoard: config.startBoard, wall: config.wall });
    looks.roleChanged();
    // what was open before (a device that is paired again) is not what is stored now
    layouts.use(null);
    if (!apiKey) { set({ ...layouts.state(), phase: 'connect', connectIssue: 'none' }); return; }
    // the layout of this hub is there before the hub is: it can be saved while the hub cannot be reached
    if (homeyId) layouts.use(homeyId);
    set({ ...layouts.state(), phase: 'connecting', startUnreachable: false });
    await attemptStart();
  }

  async function connect(addressInput: string, apiKey: string): Promise<void> {
    const parsed = parseAddress(addressInput);
    if (parsed.kind === 'invalid') { set({ connectIssue: parsed.reason === 'ambiguous' ? 'ambiguous-address' : 'invalid-address' }); return; }
    const key = apiKey.trim();
    if (!key) { set({ connectIssue: 'missing-key' }); return; }
    const settings: ConnectionSettings = {
      homeyId: parsed.kind === 'homeyId' ? parsed.homeyId : null,
      localAddress: parsed.kind === 'ip' ? parsed.address : null,
      apiKey: key,
    };
    const next = deps.createRealClient(settings);
    if (!next) { set({ connectIssue: 'unreachable' }); return; }
    retryTimer = clearTimer(retryTimer);
    permissionTimer = clearTimer(permissionTimer);
    dropClient();
    pending = next;
    set({ busy: true, connectIssue: 'none', waitingForPermission: false, review: null, savedAddress: parsed.kind === 'homeyId' ? parsed.homeyId : parsed.address });
    if (parsed.kind === 'ip') permissionTimer = deps.setTimeout(() => { permissionTimer = null; set({ waitingForPermission: true }); }, PERMISSION_HINT_MS);
    const opening = open(next);
    // open() took its number synchronously: anything that raises it later (a newer attempt, cancel, a rejected key) wins.
    const mine = generation;
    const current = (): boolean => mine === generation;
    try {
      if (!(await opening)) return;
      config.connection = { homeyId: next.getHomeyId() ?? settings.homeyId, localAddress: next.getLocalAddress() ?? settings.localAddress, apiKey: key };
      await save(true);
      if (!current()) return;
      if (state.missing.length > 0) set({ phase: 'connect', review: state.missing });
      else set({ phase: 'dashboard', connectIssue: 'none' });
    } catch (error) {
      if (!current()) return;
      const issue: ConnectIssue = error instanceof ConnectionError && error.failure === 'auth' ? 'auth' : 'unreachable';
      set({ phase: 'connect', connectIssue: issue });
    } finally {
      if (pending === next) pending = null;
      if (current()) {
        permissionTimer = clearTimer(permissionTimer);
        set({ busy: false, waitingForPermission: false });
      }
    }
  }

  /** "Annuleren" while connecting: the attempt is dropped, the form is free again, nothing is saved. */
  function cancelConnect(): void {
    if (!state.busy) return;
    generation += 1;
    pending?.disconnect();
    pending = null;
    permissionTimer = clearTimer(permissionTimer);
    set({ busy: false, waitingForPermission: false, phase: 'connect' });
  }

  /** Clears the saved connection; when the browser refuses, the key is still there and the app says so. */
  async function clearSavedConnection(): Promise<void> {
    try {
      config = await inTurn(() => configStore.clearConnection());
      // a device that was taken away forgets what it knew of the house
      if (deps.served) looks.forgetHouse();
    } catch {
      if (deps.served) {
        // the hub did not hear it: this device is still paired, and goes on
        deps.notify({ text: t('notify.unpairFailed'), icon: 'error', tone: 'error' });
        await start();
        return;
      }
      config.connection = { homeyId: null, localAddress: null, apiKey: null };
      deps.notify({ text: t('notify.clearFailed'), icon: 'error', tone: 'error' });
    }
  }

  function continueWithMissingRights(): void {
    set({ review: null, phase: 'dashboard' });
  }

  /** "Andere Homey of sleutel": to the connect screen; the saved connection stays until a new one replaces it. */
  function changeConnection(): void {
    generation += 1;
    retryTimer = clearTimer(retryTimer);
    dropClient();
    set({ review: null, phase: 'connect', connectIssue: 'none', route: null, startUnreachable: false, openDeviceId: null });
  }

  async function useOtherKey(): Promise<void> {
    generation += 1;
    retryTimer = clearTimer(retryTimer);
    dropClient();
    set({ review: null, phase: 'connect', connectIssue: 'none', route: null, startUnreachable: false, openDeviceId: null });
    await clearSavedConnection();
  }

  async function startDemo(which: Demo = 'house'): Promise<void> {
    retryTimer = clearTimer(retryTimer);
    dropClient();
    const demo = deps.createDemoClient(which, t.language);
    if (!(await open(demo, 'demo'))) return;
    isDemo = true;
    set({ phase: 'demo', connectIssue: 'none', review: null, startUnreachable: false, openDeviceId: null });
  }

  function leaveDemo(): void {
    generation += 1;
    dropClient();
    set({ phase: 'connect', route: null, missing: [], openDeviceId: null });
  }

  /** "Nu proberen": at an unreachable start try again now; with the route gone open a fresh connection beside the old one. */
  function retry(): void {
    if (state.phase === 'connecting' && state.startUnreachable) { void attemptStart(); return; }
    if (state.route !== null || isDemo) return;
    deps.notify({ text: t('notify.retrying'), icon: 'sync' });
    const settings = settingsFromConfig();
    const next = settings ? deps.createRealClient(settings) : null;
    if (!next) return;
    // a side attempt: the old client keeps recovering and stays heard until the new one has connected
    open(next, 'side').catch((error) => {
      if (error instanceof ConnectionError && error.failure === 'auth') void revoke();
    });
  }

  async function disconnect(): Promise<void> {
    generation += 1;
    retryTimer = clearTimer(retryTimer);
    dropClient();
    set({ phase: 'connect', connectIssue: 'none', review: null, savedAddress: '', route: null, missing: [], startUnreachable: false, openDeviceId: null });
    await clearSavedConnection();
  }

  /** A new language (null: follow the browser): every text and the order of names follow; the connection stays. */
  function setLanguage(choice: Language | null): void {
    config.language = choice;
    if (early) early.language = choice;
    const active = resolveLanguage(choice, deps.browserLanguages);
    t.setLanguage(active);
    layouts.refresh();
    set({ language: { choice, active }, ...layouts.state() });
    void save();
  }

  /**
   * The stored configuration changed in another tab: its layouts, theme, colours and connection are taken over. This
   * tab stays connected as it is, unless the key was taken out there ("Verbinding verbreken"): then it leaves too.
   */
  async function reloadStored(): Promise<void> {
    let stored: AppConfig;
    try {
      stored = await inTurn(() => configStore.load());
    } catch {
      return;
    }
    const cleared = config.connection.apiKey !== null && stored.connection.apiKey === null;
    config = { ...stored, language: config.language };
    ownLook = null;
    looks.reload();
    looks.roleChanged();
    layouts.adopt(deps.served);
    // the right to arrange can be gone
    if (!mayArrange()) layouts.setEditing(false);
    set({ theme: config.theme, sectionSeeds: { ...config.sectionSeeds }, startBoard: config.startBoard, wall: demoWall ?? config.wall, ...layouts.state() });
    if (!cleared || isDemo || (state.phase !== 'dashboard' && state.phase !== 'connecting')) return;
    generation += 1;
    retryTimer = clearTimer(retryTimer);
    dropClient();
    set({ phase: 'connect', connectIssue: 'none', review: null, savedAddress: '', route: null, missing: [], startUnreachable: false, openDeviceId: null });
  }

  /** A section's own colour, or null to follow the dashboard again; saved at once, like the theme. */
  function setSectionSeed(sectionId: string, seed: string | null): void {
    if (!mayArrange() || (seed !== null && !isValidSeed(seed))) return;
    const { [sectionId]: _old, ...rest } = config.sectionSeeds;
    config.sectionSeeds = seed === null ? rest : { ...rest, [sectionId]: seed.toLowerCase() };
    if (ownLook) {
      const { [sectionId]: _own, ...others } = ownLook.sectionSeeds;
      ownLook = { ...ownLook, sectionSeeds: seed === null ? others : { ...others, [sectionId]: seed.toLowerCase() } };
    }
    set({ sectionSeeds: { ...config.sectionSeeds } });
    void save();
  }

  /** The dashboard this device starts with the next time (null: the first); what is open stays open. */
  function setStartBoard(id: string | null): void {
    config.startBoard = id;
    set({ startBoard: id });
    void save();
  }

  /** What this device does as a wall tablet; the example hub keeps nothing of it. */
  function setWall(wall: WallSettings): void {
    set({ wall });
    if (isDemo) {
      demoWall = wall;
      return;
    }
    config.wall = wall;
    if (early) early.wall = wall;
    void save();
  }

  function setTheme(next: ThemeSettings): void {
    // colour and light or dark are this device's own look: a device that may only use follows the house in them
    const before = config.theme;
    const own = looks.state().role !== 'use';
    const theme = own ? next : { ...next, seed: before.seed, mode: before.mode };
    if (own && theme.seed !== before.seed) looks.setDevice({ seed: theme.seed, followStyle: false });
    if (own && theme.mode !== before.mode) looks.setDevice({ mode: theme.mode, followMode: false });
    config.theme = theme;
    if (early) early.theme = theme;
    if (ownLook) ownLook = { ...ownLook, theme };
    set({ theme });
    void save();
  }

  function status(): DashboardStatus {
    return {
      route: state.route,
      canControl: !state.missing.includes('controlDevices'),
      canStartFlows: !state.missing.includes('startFlows'),
      demo: state.phase === 'demo',
      canArrange: mayArrange(),
      served: deps.served ?? false,
    };
  }

  /** Whether something may be sent now; otherwise the notice says why. */
  function mayControl(quiet = false): boolean {
    if (!client || state.route === null) {
      if (!quiet) deps.notify({ text: t('notify.offline'), icon: 'cloud_off' });
      return false;
    }
    if (state.missing.includes('controlDevices')) {
      if (!quiet) deps.notify({ text: t('notify.readonly'), icon: 'lock' });
      return false;
    }
    return true;
  }

  const nameOf = (deviceId: string): string => store.getDevice(deviceId)?.name ?? '';

  /** The command, failed when it has no answer within CONTROL_TIMEOUT_MS; a late answer is ignored. */
  function withTimeout(command: Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = deps.setTimeout(() => reject(new Error('No answer from the hub')), CONTROL_TIMEOUT_MS);
      command.then(
        () => { deps.clearTimeout(timer); resolve(); },
        (error: unknown) => { deps.clearTimeout(timer); reject(error); },
      );
    });
  }

  /** Sends through the store: the tile turns at once and turns back when the hub refuses. */
  function send(deviceId: string, capabilityId: string, value: CapabilityValue, report = true): void {
    const target = client;
    if (!target) return;
    store.control(deviceId, capabilityId, value, () => withTimeout(target.setCapability(deviceId, capabilityId, value))).catch(() => {
      if (!report) return;
      deps.notify({
        text: t('notify.controlFailed', { name: nameOf(deviceId) }), icon: 'error', tone: 'error',
        action: { label: t('notify.retry'), run: () => { if (mayControl()) send(deviceId, capabilityId, value); } },
      });
    });
  }

  /** Locks, doors and alarms have a way of their own (`guard`): no other one leads there. */
  const guarded = (deviceId: string, capabilityId: string): boolean => {
    const device = store.getDevice(deviceId);
    return device !== undefined && isGuarded(device, capabilityId);
  };

  /** The last tap was a while ago: the target goes to the hub. */
  function sendNudge(deviceId: string, capabilityId: string): void {
    const nudge = nudges.get(deviceId);
    if (!nudge) return;
    nudges.delete(deviceId);
    if (!client) { nudge.fail(new Error('left')); return; }
    withTimeout(client.setCapability(deviceId, capabilityId, nudge.value)).then(nudge.done, (error: unknown) => {
      nudge.fail(error);
      deps.notify({
        text: t('notify.controlFailed', { name: nameOf(deviceId) }), icon: 'error', tone: 'error',
        action: { label: t('notify.retry'), run: () => { if (mayControl()) send(deviceId, capabilityId, nudge.value); } },
      });
    });
  }

  /** The target was set another way: what was tapped before that does not count any more. */
  function forgetNudge(deviceId: string, capabilityId: string): void {
    const nudge = nudges.get(deviceId);
    const device = store.getDevice(deviceId);
    if (!nudge || !device || climateOf(device)?.target.id !== capabilityId) return;
    deps.clearTimeout(nudge.timer);
    nudges.delete(deviceId);
    nudge.done();
  }

  const actions: UiActions = {
    guard(deviceId, capabilityId, value) {
      if (!mayControl() || !guarded(deviceId, capabilityId) || !client) return;
      settleBusy(deviceId);
      const busy = { capabilityId, value, timer: deps.setTimeout(() => settleBusy(deviceId), BUSY_MS) };
      busyDevices.set(deviceId, busy);
      store.touch(deviceId);
      withTimeout(client.setCapability(deviceId, capabilityId, value)).catch(() => {
        if (busyDevices.get(deviceId) === busy) settleBusy(deviceId);
        // without a button that does it again: that would be one tap
        deps.notify({ text: t('notify.controlFailed', { name: nameOf(deviceId) }), icon: 'error', tone: 'error' });
      });
    },
    lamps(deviceIds, on) {
      if (!mayControl()) return;
      for (const { deviceId, capabilityId, value } of lampsCommands(deviceIds.flatMap((id) => store.getDevice(id) ?? []), on)) if (!guarded(deviceId, capabilityId)) send(deviceId, capabilityId, value);
    },
    nudge(deviceId, steps) {
      const device = store.getDevice(deviceId);
      const climate = device?.available ? climateOf(device) : null;
      if (!climate || !mayControl()) return;
      const { target, measure } = climate;
      const value = clampTarget(target, (numberOf(target) ?? numberOf(measure) ?? DEFAULT_TARGET) + steps * targetStep(target));
      const before = nudges.get(deviceId);
      if (!before && value === target.value) return;
      let nudge = before;
      if (nudge) deps.clearTimeout(nudge.timer);
      else {
        const made = { value, timer: null as unknown, done: () => {}, fail: (_error: unknown) => {} };
        nudge = { ...made, sent: new Promise<void>((done, fail) => Object.assign(made, { done, fail })) };
        nudge.done = made.done;
        nudge.fail = made.fail;
        nudges.set(deviceId, nudge);
      }
      const { sent } = nudge;
      nudge.value = value;
      nudge.timer = deps.setTimeout(() => sendNudge(deviceId, target.id), NUDGE_MS);
      store.control(deviceId, target.id, value, () => sent).catch(() => {});
    },
    toggle(spec: Extract<TileSpec, { kind: 'light' | 'switch' }>) {
      if (!mayControl()) return;
      const device = store.getDevice(spec.deviceId);
      if (!device) return;
      if (guarded(spec.deviceId, spec.onoffCapabilityId ?? (spec.kind === 'light' ? spec.dimCapabilityId : ''))) return;
      if (spec.onoffCapabilityId) {
        send(spec.deviceId, spec.onoffCapabilityId, device.capabilities[spec.onoffCapabilityId]?.value !== true);
      } else if (spec.kind === 'light') {
        const level = device.capabilities[spec.dimCapabilityId]?.value;
        send(spec.deviceId, spec.dimCapabilityId, typeof level === 'number' && level > 0 ? 0 : 1);
      }
    },
    slide(deviceId, capabilityId, value, final) {
      if (!mayControl(!final) || guarded(deviceId, capabilityId)) return;
      forgetNudge(deviceId, capabilityId);
      const device = store.getDevice(deviceId);
      // dimming a lamp that is off turns it on; no other slider switches a device on
      const dims = device?.capabilities[capabilityId]?.baseId === 'dim';
      const toggles = device ? device.capabilityOrder.map((id) => device.capabilities[id]).filter((c) => c?.baseId === 'onoff' && c.setable) : [];
      const onoff = toggles.find((c) => c?.id === 'onoff') ?? toggles[0];
      if (dims && onoff && onoff.value === false && value > 0) send(deviceId, onoff.id, true, final);
      send(deviceId, capabilityId, value, final);
    },
    press(deviceId, capabilityId, quiet = false) {
      if (!mayControl() || guarded(deviceId, capabilityId)) return;
      const target = client;
      if (!target) return;
      withTimeout(target.setCapability(deviceId, capabilityId, true))
        .then(() => { if (!quiet) deps.notify({ text: t('tile.pressed', { name: nameOf(deviceId) }), icon: 'check_circle' }); })
        .catch(() => deps.notify({ text: t('notify.controlFailed', { name: nameOf(deviceId) }), icon: 'error', tone: 'error' }));
    },
    setCapability(deviceId, capabilityId, value) {
      if (!mayControl() || guarded(deviceId, capabilityId)) return;
      forgetNudge(deviceId, capabilityId);
      send(deviceId, capabilityId, value);
    },
    async startFlow(flowId, kind) {
      const flow = store.getSnapshot()?.flows.find((f) => f.id === flowId);
      if (!client || state.route === null) { deps.notify({ text: t('notify.flowsOffline'), icon: 'cloud_off' }); return false; }
      if (!isButton(flowId) && state.missing.includes('startFlows')) { deps.notify({ text: t(!deps.served ? 'flows.locked' : store.getSnapshot()?.flowAccess === 'refused' ? 'flows.refused' : 'flows.lockedServed'), icon: 'lock' }); return false; }
      try {
        await withTimeout(client.startFlow({ id: flowId, kind }));
        return true;
      } catch {
        deps.notify({ text: t('notify.flowFailed', { name: flow?.name ?? '' }), icon: 'error', tone: 'error' });
        return false;
      }
    },
    openDevice(deviceId) {
      // the window also opens without a route: it then shows the last known values, without controls
      set({ openDeviceId: deviceId });
    },
  };

  const history = createHistoryAccess({
    client: () => (state.route === null ? null : client),
    known: () => store.getDevices().flatMap((device) => Object.keys(device.capabilities).map((capabilityId) => ({ deviceId: device.id, capabilityId }))),
    now: () => Date.now(),
  });

  return {
    history,
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** The hub that is open, or 'demo'; null on the connect screen. */
    hubId: (): string | null => openHub(),
    closeDevice: () => set({ openDeviceId: null }),
    openBoard: (id: string) => layouts.openBoard(id),
    /** The automatic Overzicht per kind of device or per room, and whether the screen with the rooms is there: for every device on this hub. */
    setGrouping: (grouping: Grouping) => { if (mayArrange()) layouts.setGrouping(grouping); },
    setRooms: (shown: boolean) => { if (mayArrange()) layouts.setRooms(shown); },
    /** The dashboard this device starts with. */
    openStart: () => layouts.openStart(),
    setEditing: (on: boolean) => { if (!on || mayArrange()) layouts.setEditing(on); },
    /**
     * Freezes the automatic Overzicht first when the edit is on it, applies, saves, keeps the step for undo.
     * The index of move-tile counts the tiles that are shown. Edits of one group in a row are one step to undo.
     */
    edit: (change: LayoutEdit, group?: string) => { if (mayArrange()) layouts.edit(change, group); },
    undo: () => layouts.undo(),
    /** Null: the suggested section, made again in its usual column when it is gone. */
    placeNew: (ref: string, sectionId: string | null, group?: string) => layouts.placeNew(ref, sectionId, group),
    dismissNew: (ref: string) => layouts.dismissNew(ref),
    acknowledgeGone: () => layouts.acknowledgeGone(),
    resetOverview: () => layouts.resetOverview(),
    exportLayout: (now: Date) => layouts.exportLayout(now),
    importLayout: (text: string): ImportResult => layouts.importLayout(text),
    newId: (prefix: 't' | 's' | 'd') => newLayoutId(prefix),
    reloadStored,
    start, connect, cancelConnect, continueWithMissingRights, useOtherKey, changeConnection, startDemo, leaveDemo, retry, disconnect, setTheme, setLanguage, setStartBoard, setWall, setSectionSeed,
    actions, status,
    /** The look of a dashboard on this device; rooms follow the house. */
    chosenLook: (boardId: string | null): ChosenLook => looks.chosen(boardId),
    setDeviceLook: (change: Partial<DeviceLook>): boolean => looks.setDevice(change),
    followHouse: (): boolean => looks.followHouse(),
    saveTheme: (file: ThemeFile): boolean => looks.saveTheme(file),
    removeTheme: (id: string): boolean => looks.removeTheme(id),
    setBoardTheme: (boardId: string, themeId: string | null): boolean => looks.setBoardTheme(boardId, themeId),
    setHouse: (house: Partial<HouseLook>): boolean => looks.setHouse(house),
    /** What the hub has of looks now; with a rescue that this device did not see yet, it follows the house again. */
    adoptHubLooks: (doc: LooksDoc): void => looks.adoptHub(doc),
    busy(deviceId: string): { capabilityId: string; value: CapabilityValue } | null {
      const busy = busyDevices.get(deviceId);
      return busy ? { capabilityId: busy.capabilityId, value: busy.value } : null;
    },
  };
}

export type Controller = ReturnType<typeof createController>;
