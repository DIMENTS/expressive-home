import { generateDashboard } from '../dashboard/generate';
import { statusLabels } from '../dashboard/status';
import type { Dashboard } from '../dashboard/types';
import { ConnectionError, type HomeyClient } from '../homey/client';
import { createHomeyApiClient, type ConnectionSettings, type HomeyApiLib, type RealHomeyClient } from '../homey/api-client';
import { missingFeatures, type Feature } from '../homey/permissions';
import { parseAddress } from '../homey/address';
import type { RawHomey, Route } from '../homey/types';
import { createMockClient } from '../mock/mock-client';
import { createStore } from '../state/store';
import { createDefaultConfig, type AppConfig } from '../storage/config';
import { createLocalConfigStore } from '../storage/local-store';
import { isValidSeed } from '../theme/engine';
import type { ThemeSettings } from '../theme/types';
import { renderDashboard } from './dashboard';
import { describeShore, probeHistory } from './history-probe';
import { probeWeatherEnergy } from './weather-energy-probe';
import { insightsText, measureInsights } from './insights';
import { addRouteChange, structureText } from './structure';
import { applyTheme } from './theme';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const FAILURE_TEXT: Record<string, string> = {
  unreachable: 'Homey niet bereikbaar: controleer het adres en het netwerk.',
  auth: 'De sleutel is geweigerd.',
  'homey-id-unknown': 'Dit Homey-ID is onbekend.',
};

const EVENT_WINDOW_MS = 10_000;

type Source = 'mock' | 'real' | 'connecting';
const SOURCE_TEXT: Record<Source, string> = { mock: 'Bron: NAGEBOOTSTE Homey', real: 'Bron: ECHTE Homey', connecting: 'Bron: verbinden…' };
const TITLE_TEXT: Record<Source, string> = { mock: 'Inspectie [NAGEBOOTST]', real: 'Inspectie [ECHT]', connecting: 'Inspectie [verbinden…]' };

const configStore = createLocalConfigStore(window.localStorage);
const store = createStore((flush) => { requestAnimationFrame(flush); });
let config: AppConfig = createDefaultConfig();
let client: HomeyClient | null = null;
let realHub: RealHomeyClient | null = null; // set while the active client is a real hub
let stopClient: () => void = () => {};
let stopDashboard: () => void = () => {};
let dashboard: Dashboard = { hero: null, sections: [] };
let missing: Feature[] = [];
let eventTimes: number[] = [];
let routeLog: string[] = [];
let loggedRoute: Route | null = null; // the route after the last logged change
let source: Source = 'connecting';
let generation = 0; // every activation takes a new number; an older one is superseded
let pending = 0; // activations in flight
let insightsResult: string | null = null; // the last Insights measurement of the active client

const homeyLib = (): HomeyApiLib | null => (typeof (window as { HomeyAPIV3Local?: unknown }).HomeyAPIV3Local === 'function' ? (window as unknown as HomeyApiLib) : null);
const eventsInWindow = (): number => {
  const cutoff = Date.now() - EVENT_WINDOW_MS;
  eventTimes = eventTimes.filter((t) => t >= cutoff);
  return eventTimes.length;
};
const showMessage = (text: string): void => { $('message').textContent = text; };

/** Notes a route change with its time, on the page and for the copied result. */
function logRoute(next: Route | null): void {
  routeLog = addRouteChange(routeLog, new Date(), loggedRoute, next);
  loggedRoute = next;
  const list = $('route-log');
  list.replaceChildren();
  for (const line of routeLog) {
    const item = document.createElement('li');
    item.textContent = line;
    list.append(item);
  }
  $('route-log-empty').hidden = routeLog.length > 0;
}
/** The reason a real connection failed; only a new attempt or a successful real connection clears it. */
const showReason = (text: string): void => { $('reason').textContent = text; };
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function setSource(next: Source): void {
  source = next;
  $('source').textContent = SOURCE_TEXT[next];
  document.title = TITLE_TEXT[next];
}

function setPending(delta: number): void {
  pending += delta;
  $<HTMLButtonElement>('connect-submit').disabled = pending > 0;
  $<HTMLButtonElement>('disconnect').disabled = pending > 0;
}

function mockData(): RawHomey {
  const files = import.meta.glob<{ default: RawHomey }>('../mock/fixtures/*.raw.json', { eager: true });
  const pick = (name: string) => Object.entries(files).find(([path]) => path.endsWith(`/${name}`))?.[1];
  const found = pick('camper.raw.json') ?? pick('voorbeeld.raw.json');
  if (!found) throw new Error('Geen nagebootste gegevens gevonden in src/mock/fixtures.');
  return found.default;
}

/**
 * Makes the client from `make` the active one. Returns false when a newer activation superseded this one;
 * a superseded activation disconnects its own client and touches nothing else. Throws when connecting fails.
 */
async function activate(make: () => HomeyClient, kind: 'mock' | 'real'): Promise<boolean> {
  const mine = ++generation;
  setPending(1);
  try {
    setSource('connecting');
    stopClient();
    client?.disconnect();
    client = null;
    realHub = null;
    stopDashboard();
    stopDashboard = () => {};
    store.apply({ type: 'route', route: null });
    // Every connection starts its own log, so the log of a real hub holds no lines of the fake one.
    routeLog = [];
    loggedRoute = null;
    logRoute(null);
    refreshDashboard();

    const next = make();
    const stop = next.subscribe((event) => {
      if (mine !== generation) return;
      eventTimes.push(Date.now());
      store.apply(event);
      if (event.type === 'route') logRoute(event.route);
      // A local address the hub reported itself: keep it with the saved connection for the next start.
      if (event.type === 'localAddress' && config.connection.apiKey) {
        config.connection = { ...config.connection, localAddress: event.address };
        configStore.save(config).catch(() => showMessage('Het lokale adres kon niet worden opgeslagen.'));
      }
      if (event.type === 'authError') showReason(FAILURE_TEXT['auth']!);
    });
    let snapshot;
    try {
      snapshot = await next.connect();
    } catch (error) {
      stop();
      next.disconnect();
      if (mine !== generation) return false;
      throw error;
    }
    if (mine !== generation) {
      stop();
      next.disconnect();
      return false;
    }
    client = next;
    stopClient = stop;
    insightsResult = null;
    missing = missingFeatures(snapshot.scopes);
    store.load(snapshot);
    setSource(kind);
    refreshDashboard(); // do not wait for the scheduled structure flush: the label and the list must agree at once
    return true;
  } finally {
    setPending(-1);
  }
}

async function useMock(): Promise<void> {
  await activate(() => {
    const mock = createMockClient(mockData());
    mock.simulate({ setInterval: (fn, ms) => window.setInterval(fn, ms), clearInterval: (handle) => window.clearInterval(handle as number) });
    return mock;
  }, 'mock');
}

type RealResult = 'ok' | 'failed' | 'superseded' | 'unavailable';

async function connectReal(settings: ConnectionSettings): Promise<RealResult> {
  const lib = homeyLib();
  if (!lib) {
    $('notice').textContent = 'Verbinden met een echte Homey vraagt eerst "npm run vendor".';
    return 'unavailable';
  }
  showReason('');
  let real: RealHomeyClient | null = null;
  try {
    const current = await activate(() => {
      real = createHomeyApiClient(lib, settings, {
        fetch: window.fetch.bind(window),
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: (handle) => window.clearInterval(handle as number),
        addOnlineListener: (fn) => {
          window.addEventListener('online', fn);
          return () => window.removeEventListener('online', fn);
        },
        now: () => Date.now(),
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: (handle) => window.clearTimeout(handle as number),
      });
      return real;
    }, 'real');
    if (!current) return 'superseded';
  } catch (error) {
    showReason(error instanceof ConnectionError ? FAILURE_TEXT[error.failure]! : 'Verbinden mislukt.');
    return 'failed';
  }
  const hub = real as unknown as RealHomeyClient;
  realHub = hub;
  showMessage('');
  try {
    config.connection = { homeyId: hub.getHomeyId(), localAddress: hub.getLocalAddress(), apiKey: settings.apiKey };
    await configStore.save(config);
  } catch {
    showMessage('Verbonden, maar de verbinding kon niet worden opgeslagen.');
  }
  return 'ok';
}

function refreshDashboard(): void {
  if (source === 'connecting') {
    stopDashboard();
    stopDashboard = () => {};
    $('dashboard').textContent = 'bezig met verbinden';
    refreshHeader();
    return;
  }
  const snapshot = store.getSnapshot();
  stopDashboard();
  stopDashboard = () => {};
  if (!snapshot) return;
  dashboard = generateDashboard(snapshot, { grouping: 'type' });
  stopDashboard = renderDashboard($('dashboard'), { store, getClient: () => client, missing }, dashboard);
  refreshHeader();
}

function refreshHeader(): void {
  const devices = source === 'connecting' ? [] : store.getDevices();
  const labels = statusLabels(devices, store.getRoute()).map((label) => {
    if (label.kind === 'route') return `route: ${label.route ?? 'onbekend'}`;
    if (label.kind === 'more') return `+${label.count} meer`;
    const device = store.getDevice(label.deviceId);
    return `alarm: ${device?.name ?? '?'} / ${device?.capabilities[label.capabilityId]?.title ?? label.capabilityId}`;
  });
  $('status').textContent = `${labels.join(' | ')} | ontbrekende rechten: ${missing.length ? missing.join(', ') : 'geen'}`;
  $('rate').textContent = `Live gebeurtenissen laatste 10 s: ${eventsInWindow()}`;
  $('address-shape').textContent = `Vorm lokaal adres: ${realHub?.getLocalAddressShape() ?? 'onbekend'}`;
}

function setupTheme(): void {
  const seed = $<HTMLInputElement>('seed');
  const mode = $<HTMLSelectElement>('mode');
  const density = $<HTMLSelectElement>('density');
  seed.value = config.theme.seed;
  mode.value = config.theme.mode;
  density.value = config.theme.density;
  const change = (): void => {
    if (!isValidSeed(seed.value)) return;
    config.theme = { seed: seed.value, mode: mode.value as ThemeSettings['mode'], density: density.value as ThemeSettings['density'] };
    applyTheme(config.theme, $('roles'));
    configStore.save(config).catch(() => showMessage('Thema kon niet worden opgeslagen.'));
  };
  for (const input of [seed, mode, density]) input.addEventListener(input === seed ? 'input' : 'change', change);
  applyTheme(config.theme, $('roles'));
}

/** Falls back to the fake hub; reports instead of throwing. */
async function fallbackToMock(): Promise<void> {
  try {
    await useMock();
  } catch (error) {
    showMessage(`Nagebootste Homey starten mislukt: ${errorMessage(error)}`);
  }
}

function setupConnectForm(): void {
  $('connect-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (pending > 0) return;
    const address = $<HTMLInputElement>('address').value.trim();
    const keyInput = $<HTMLInputElement>('key');
    const apiKey = keyInput.value.trim();
    if (!address || !apiKey) { showMessage('Vul een adres en een sleutel in.'); return; }
    const parsed = parseAddress(address);
    if (parsed.kind === 'invalid') {
      showMessage('Dit is geen adres van de Homey-webapp, geen Homey-ID (24 tekens, 0-9 en a-f) en geen IPv4-adres (zoals 192.168.1.50).');
      return;
    }
    const settings: ConnectionSettings = parsed.kind === 'ip'
      ? { homeyId: null, localAddress: parsed.address, apiKey }
      : { homeyId: parsed.homeyId, localAddress: null, apiKey };
    showMessage('');
    void (async () => {
      const result = await connectReal(settings).catch(() => 'failed' as RealResult);
      if (result === 'ok') keyInput.value = '';
      if (result === 'failed') await fallbackToMock();
    })();
  });
  $('disconnect').addEventListener('click', () => {
    if (pending > 0) return;
    void (async () => {
      let cleared = true;
      try {
        config = await configStore.clearConnection();
      } catch {
        cleared = false;
        showMessage('De opgeslagen verbinding kon niet worden gewist.');
      }
      await fallbackToMock();
      if (cleared) showMessage('Verbinding verbroken; terug naar de nagebootste Homey.');
    })();
  });
}

function setupCopy(): void {
  $('copy').addEventListener('click', () => {
    const area = $<HTMLTextAreaElement>('structure');
    if (source === 'connecting') { area.value = 'nog bezig met verbinden'; return; }
    showResult();
  });
  $('measure-insights').addEventListener('click', () => {
    const area = $<HTMLTextAreaElement>('structure');
    const measured = client;
    if (source === 'connecting' || !measured) { area.value = 'nog bezig met verbinden'; return; }
    area.value = 'Geschiedenis meten… dit duurt een minuut of twee.';
    void (async () => {
      const own = insightsText(await measureInsights(measured, dashboard.hero, Date.now()));
      const all = measured.rawHistory ? await probeHistory(measured.rawHistory, dashboard.hero, Date.now()) : 'geschiedenis: niet te meten op deze Homey';
      if (measured !== client) return;
      const shore = dashboard.hero?.stats.find((stat) => stat.role === 'shore');
      const shoreText = describeShore(shore && 'ref' in shore ? store.getDevice(shore.ref.deviceId)?.capabilities[shore.ref.capabilityId] : undefined);
      insightsResult = `${own}\n${all}\n${shoreText}`;
      showResult();
    })();
  });
  $('measure-weather-energy').addEventListener('click', () => {
    const area = $<HTMLTextAreaElement>('structure');
    const measured = client;
    if (source === 'connecting' || !measured) { area.value = 'nog bezig met verbinden'; return; }
    if (!measured.rawManagers) { area.value = 'weer en energie: niet te meten op deze Homey'; return; }
    area.value = 'Weer en energie meten… dit duurt ruim twee minuten (twee minuten luisteren naar nieuws).';
    void (async () => {
      const text = await probeWeatherEnergy(measured.rawManagers!, new Date(), WEATHER_ENERGY_LISTEN_MS);
      if (measured !== client) return;
      insightsResult = text;
      showResult();
    })();
  });
}

/** How long the measurement listens for news of the energy and the weather of the hub, each. */
const WEATHER_ENERGY_LISTEN_MS = 60_000;

/** Puts the structure, and the Insights measurement when there is one, in the result field and on the clipboard. */
function showResult(): void {
  const area = $<HTMLTextAreaElement>('structure');
  const structure = structureText(source === 'real' ? 'echte Homey' : 'nagebootste Homey', dashboard, store.getRoute(), missing, eventsInWindow(), routeLog, realHub?.getLocalAddressShape() ?? null);
  const text = insightsResult === null ? structure : `${structure}\n${insightsResult}`;
  area.value = text;
  // The clipboard is optional: it is missing on plain http origins.
  try {
    void navigator.clipboard?.writeText(text).catch(() => {});
  } catch { /* ignore */ }
}

async function start(): Promise<void> {
  setSource('connecting');
  try {
    config = await configStore.load();
  } catch { /* defaults */ }
  if (!homeyLib()) $('notice').textContent = 'Verbinden met een echte Homey vraagt eerst "npm run vendor".';
  setupTheme();
  setupConnectForm();
  setupCopy();
  store.subscribeStructure(refreshDashboard);
  window.setInterval(refreshHeader, 1000);

  const saved = config.connection;
  if (saved.apiKey && (saved.homeyId || saved.localAddress) && homeyLib()) {
    const result = await connectReal({ homeyId: saved.homeyId, localAddress: saved.localAddress, apiKey: saved.apiKey }).catch(() => 'failed' as RealResult);
    if (result === 'ok' || result === 'superseded') return;
  }
  await fallbackToMock();
}

void start();
