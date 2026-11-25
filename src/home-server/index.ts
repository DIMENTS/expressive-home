import { createHash, randomBytes, randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { createHomeyApiClient, type HomeyApiLib } from '../homey/api-client';
import type { HomeyClient } from '../homey/client';
import { BUTTON_CARD } from '../homey/buttons';
import { isHomeyId } from '../homey/routes';
import { createButtons, type ButtonCard } from './buttons';
import { createFlowKey, type FlowKeyResult, type FlowKeyState } from './flow-key';
import { createHubLink, withoutSecrets } from './hub-link';
import { createRecorder, type SdkInsights } from './recorder';
import { pickHero } from '../dashboard/hero';
import type { CapRef } from '../dashboard/types';
import { createNight, type NightWord } from './night';
import { createPairing, type CodeState, type OpenCode, type PairedDevice, type Role, type Slot } from './pairing';
import { qrCode } from './qr';
import { createHomeServer, isLocalHost } from './server';
import { createSharedLayouts } from './shared-layouts';
import { createSharedLooks, type ThemeChoice } from './shared-looks';
import { createSharedWidgets } from './shared-widgets';
import { createAppWidgets } from './app-widgets';
import type { ModePreference } from '../theme/types';
import type { HomeySnapshot } from '../homey/types';
import type { HubLayout } from '../layout/types';
import { createTranslate, type Language } from '../i18n';

/** The part of `this.homey` of the Homey Apps SDK that the app uses. */
export interface HomeySdk {
  version: string;
  settings: { get(key: string): unknown; set(key: string, value: unknown): void };
  api: { getOwnerApiToken(): Promise<string>; getLocalUrl(): Promise<string> };
  cloud: { getHomeyId(): Promise<string>; getLocalAddress(): Promise<string> };
  flow?: { getTriggerCard(id: string): ButtonCard };
  i18n?: { getLanguage(): string };
  insights?: SdkInsights;
}

export interface StartOptions {
  homey: HomeySdk;
  /** From the package homey-api; not needed with an own `createClient` (in tests). */
  HomeyAPIV3Local?: HomeyApiLib['HomeyAPIV3Local'];
  createClient?(): Promise<HomeyClient>;
  /** The folder with the files of the dashboard. */
  folder: string;
  port: number;
  /** How long the hub may take to answer a request with the key for flows. */
  hubTimeout?: number;
  /** How long the hub may take to tell its address. */
  addressTimeout?: number;
  log?(message: string): void;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon',
};
const KEYS = { recording: 'recordedHistory', record: 'recordHistory', devices: 'pairedDevices', layouts: 'sharedLayouts', looks: 'sharedLooks', widgets: 'sharedWidgets', homeyId: 'homeyId', night: 'wallNight', flowKey: 'flowKey', address: 'homeAddress', buttons: 'dashboardButtons' } as const;
const HUB_MS = 10_000;
/** The settings do not wait longer than this for the address of the hub. */
export const ADDRESS_MS = 3000;
/** Stands in for the address of the hub: the client checks its shape, and the library gets the real one. */
const OWN_ADDRESS = '127.0.0.1';

/** Files of one folder, never outside it. */
export function filesOf(folder: string) {
  const root = normalize(folder + sep);
  return async (path: string): Promise<{ body: Uint8Array; type: string } | null> => {
    const type = TYPES[extname(path).toLowerCase()];
    const full = normalize(join(root, path));
    if (!type || !full.startsWith(root)) return null;
    try {
      return { body: await readFile(full), type };
    } catch {
      return null;
    }
  };
}

/** The client of the web app, over the local address and with the token of the app itself (homey-api, createAppAPI). */
export async function createOwnClient(homey: HomeySdk, HomeyAPIV3Local: HomeyApiLib['HomeyAPIV3Local'], homeyId: string, log?: (message: string) => void): Promise<HomeyClient> {
  const token = await homey.api.getOwnerApiToken();
  const baseUrl = await homey.api.getLocalUrl();
  log?.(`Connecting to the hub over ${withoutSecrets(new Error(baseUrl))}`);
  class OwnApi {
    constructor(options: ConstructorParameters<HomeyApiLib['HomeyAPIV3Local']>[0]) {
      return new HomeyAPIV3Local({ ...options, token, baseUrl, properties: { id: homeyId, softwareVersion: homey.version } });
    }
  }
  // the hub is this very machine: the ping that chooses a route always finds it
  const ping = async (): Promise<Response> => new Response('', { status: 200, headers: { 'X-Homey-ID': homeyId, 'X-Homey-Version': homey.version } });
  return createHomeyApiClient({ HomeyAPIV3Local: OwnApi as unknown as HomeyApiLib['HomeyAPIV3Local'] }, { homeyId, localAddress: OWN_ADDRESS, apiKey: token }, {
    fetch: ping as typeof fetch,
    setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    addOnlineListener: () => () => {}, now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    onFailure: (error) => log?.(`The hub said: ${withoutSecrets(error).replaceAll(token, '…')}`),
  });
}

/** The language of the hub, for what it shows itself: Dutch, or else English. */
function hubLanguage(homey: HomeySdk): Language {
  try {
    return homey.i18n?.getLanguage() === 'nl' ? 'nl' : 'en';
  } catch {
    return 'en';
  }
}

/** The id of the hub as it was kept. */
function keptHomeyId(homey: HomeySdk): string | null {
  const stored = homey.settings.get(KEYS.homeyId);
  return typeof stored === 'string' && isHomeyId(stored) ? stored : null;
}

/** The id of the hub; kept, so it is known without internet too. */
async function readHomeyId(homey: HomeySdk): Promise<string | null> {
  const stored = keptHomeyId(homey);
  try {
    const id = await homey.cloud.getHomeyId();
    if (isHomeyId(id)) {
      if (id !== stored) homey.settings.set(KEYS.homeyId, id);
      return id;
    }
  } catch {
    // without internet: the one that was kept
  }
  return stored;
}

/** The words of the values a hero records, as Insights shows them. */
const RECORDED_WORDS = { solar: 'hero.solar', consumption: 'hero.consumption', shore: 'hero.shore' } as const;

/** The values the heroes show, in the order in which they count: the automatic one, then each dashboard's own. */
export function heroValues(layout: HubLayout | null, snapshot: HomeySnapshot | null): CapRef[] {
  const refs: CapRef[] = [];
  const hero = snapshot ? pickHero(snapshot) : null;
  if (hero) refs.push(hero.primary, ...hero.stats.flatMap((stat) => ('ref' in stat ? [stat.ref] : [])));
  for (const dashboard of layout?.dashboards ?? []) {
    for (const section of dashboard.sections ?? []) {
      const own = section.hero;
      if (!own) continue;
      refs.push(own.main, ...(own.line ? [own.line] : []), ...own.stats.flatMap((stat) => ('net' in stat ? [] : [stat])));
    }
  }
  return refs;
}

/** "Expressive Home: Zon": the word of its role in the automatic hero, else the name of the value; never a device's name. */
export function recordedTitle(ref: CapRef, snapshot: HomeySnapshot | null): Record<string, string> {
  const hero = snapshot ? pickHero(snapshot) : null;
  const stat = hero?.stats.find((one) => 'ref' in one && one.ref.deviceId === ref.deviceId && one.ref.capabilityId === ref.capabilityId);
  const role = stat && stat.role !== 'net' && stat.role !== 'value' ? stat.role : null;
  const title = snapshot?.devices[ref.deviceId]?.capabilities[ref.capabilityId]?.title ?? ref.capabilityId;
  const [en, nl] = [createTranslate('en'), createTranslate('nl')];
  return { en: `Expressive Home: ${role ? en(RECORDED_WORDS[role]) : title}`, nl: `Expressive Home: ${role ? nl(RECORDED_WORDS[role]) : title}` };
}

/** What the settings show for another device. */
export interface ShownCode extends OpenCode { address: string | null; link: string | null; qr: string[] | null }

/** A hub that did not tell its address is asked again after this many times the time it may take. */
const ASK_AGAIN = 10;

/** The address of the hub on the own network; the last one that is known when the hub does not tell it in time. */
function addressOf(homey: HomeySdk, ms: number): () => Promise<string | null> {
  const own = (value: unknown): string | null => (typeof value === 'string' && /^\d+(?:\.\d+){3}$/.test(value) && isLocalHost(value) ? value : null);
  let known = own(homey.settings.get(KEYS.address));
  let asking: { at: number; answer: Promise<void> } | null = null;
  async function ask(): Promise<void> {
    try {
      const found = own((await homey.cloud.getLocalAddress()).split(':')[0]);
      if (found !== null && found !== known) homey.settings.set(KEYS.address, found);
      known = found ?? known;
    } catch {
      // the last one that is known
    }
  }
  return async () => {
    const now = Date.now();
    if (!asking || Math.abs(now - asking.at) > ms * ASK_AGAIN) {
      const mine = { at: now, answer: ask() };
      asking = mine;
      void mine.answer.then(() => { if (asking === mine) asking = null; });
    }
    // nobody waits for the same silence twice
    const left = ms - (now - asking.at);
    if (left <= 0) return known;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([asking.answer, new Promise<void>((done) => { timer = setTimeout(done, left); })]);
    clearTimeout(timer);
    return known;
  };
}

/** The flow card of the buttons; null when the app does not have it. */
function buttonCard(homey: HomeySdk): ButtonCard | null {
  try {
    return homey.flow?.getTriggerCard(BUTTON_CARD) ?? null;
  } catch {
    return null;
  }
}

/** Starts everything the app on the hub does; what it gives back is for the settings of the app and for stopping it. */
export async function startHomeServer(options: StartOptions) {
  const { homey, log } = options;
  // without internet the SDK can keep one waiting: nothing here waits for it
  let homeyId = keptHomeyId(homey);
  void readHomeyId(homey).then((id) => { homeyId = id ?? homeyId; });
  const pairing = createPairing({
    load: () => homey.settings.get(KEYS.devices),
    save: (devices) => homey.settings.set(KEYS.devices, devices),
    now: () => Date.now(),
    token: () => randomBytes(32).toString('base64url'),
    code: () => String(randomInt(1_000_000)).padStart(6, '0'),
    fingerprint: (token) => createHash('sha256').update(token).digest('hex'),
  });
  const layouts = createSharedLayouts({ load: () => homey.settings.get(KEYS.layouts), save: (doc) => homey.settings.set(KEYS.layouts, doc) });
  const looks = createSharedLooks({ load: () => homey.settings.get(KEYS.looks), save: (doc) => homey.settings.set(KEYS.looks, doc) });
  const widgets = createSharedWidgets({ load: () => homey.settings.get(KEYS.widgets), save: (doc) => homey.settings.set(KEYS.widgets, doc) });
  const night = createNight({ load: () => homey.settings.get(KEYS.night), save: (value) => homey.settings.set(KEYS.night, value), now: () => Date.now() });
  const ownAddress = addressOf(homey, options.addressTimeout ?? ADDRESS_MS);
  let localUrl: string | null = null;
  const flowKey = createFlowKey({
    load: () => homey.settings.get(KEYS.flowKey), save: (value) => homey.settings.set(KEYS.flowKey, value),
    request: async (method, path, key, sent) => {
      const signal = AbortSignal.timeout(options.hubTimeout ?? HUB_MS);
      const late = new Promise<never>((_done, fail) => { signal.addEventListener('abort', () => fail(new Error('The hub is slow')), { once: true }); });
      // the time goes on after an answer: then nobody waits for it
      late.catch(() => {});
      const base = localUrl ?? await Promise.race([homey.api.getLocalUrl(), late]);
      localUrl = null;
      // never on to another address: the key is for this hub only
      const response = await fetch(`${base}${path}`, {
        method, redirect: 'error', ...(method === 'POST' || method === 'PUT' ? { body: JSON.stringify(sent ?? {}) } : {}), signal,
        headers: { authorization: `Bearer ${key}`, ...(method === 'POST' || method === 'PUT' ? { 'content-type': 'application/json' } : {}), ...(homeyId === null ? {} : { 'x-homey-id': homeyId }) },
      });
      const text = await response.text();
      localUrl = base;
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        // not JSON
      }
      return { status: response.status, body };
    },
  });
  // the page names its files by what is in them: another page is another version
  const build = await readFile(join(options.folder, 'index.html')).then((page) => createHash('sha256').update(page).digest('hex').slice(0, 16), () => '');
  const hub = createHubLink({
    createClient: async () => {
      if (options.createClient) return options.createClient();
      homeyId ??= await readHomeyId(homey);
      if (homeyId === null || !options.HomeyAPIV3Local) throw new Error('The id of the hub is not known yet');
      return createOwnClient(homey, options.HomeyAPIV3Local, homeyId, log);
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>), now: () => Date.now(), log,
  });
  const buttons = createButtons({
    load: () => homey.settings.get(KEYS.buttons), save: (names) => homey.settings.set(KEYS.buttons, names), card: buttonCard(homey), flows: () => hub.snapshot()?.flows ?? [], updated: () => { void hub.refresh(0); },
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>), now: () => Date.now(),
  });
  const appWidgets = createAppWidgets({
    keyRequest: (method, path, body) => flowKey.wideRequest(method, path, body),
    fetchFile: async (path) => {
      const base = await homey.api.getLocalUrl();
      // the files of a widget are on the hub's web server without a key; never on to another address
      const response = await fetch(`${base}${path}`, { redirect: 'error', signal: AbortSignal.timeout(options.hubTimeout ?? HUB_MS) });
      return { status: response.status, type: response.headers.get('content-type') ?? 'application/octet-stream', body: new Uint8Array(await response.arrayBuffer()) };
    },
  });
  const http = createHomeServer({
    appWidgets, pairing, layouts, looks, widgets, night, flowKey, buttons, build: () => build, hub, file: filesOf(options.folder), homeyId: () => homeyId ?? hub.snapshot()?.homeyId ?? null,
    setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>), log,
  });
  await new Promise<void>((done, fail) => {
    http.server.once('error', fail);
    // the own network is IPv4: an address of IPv6 can be one on the internet
    http.server.listen(options.port, '0.0.0.0', () => {
      http.server.off('error', fail);
      http.server.on('error', (error) => log?.(`Server: ${error.message}`));
      done();
    });
  });
  const recorder = createRecorder({
    insights: homey.insights,
    wanted: () => heroValues(layouts.get().layouts[homeyId ?? ''] ?? null, hub.snapshot()),
    value: (ref) => hub.snapshot()?.devices[ref.deviceId]?.capabilities[ref.capabilityId]?.value,
    kept: () => hub.listHistory([]),
    title: (ref) => recordedTitle(ref, hub.snapshot()),
    load: () => homey.settings.get(KEYS.recording), save: (state) => homey.settings.set(KEYS.recording, state),
    enabled: () => homey.settings.get(KEYS.record) !== false,
    now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>), log,
  });
  const stopObserving = hub.subscribe((event) => {
    if (event.type === 'capability') recorder.observe(event.deviceId, event.capabilityId, event.value);
    if (event.type === 'reset') void recorder.refresh();
  });
  const stopLayouts = layouts.subscribe(() => { void recorder.refresh(); });
  hub.start();
  void buttons.refresh();
  void recorder.start();

  const address = async (): Promise<string | null> => {
    const own = await ownAddress();
    return own === null ? null : `http://${own}:${options.port}`;
  };

  return {
    port: (): number => {
      const bound = http.server.address();
      return typeof bound === 'object' && bound !== null ? bound.port : options.port;
    },
    /** For the settings of the app. */
    newCode: (role: Role) => pairing.newCode(role),
    devices: (): PairedDevice[] => pairing.list(),
    removeDevice: (id: string): boolean => pairing.remove(id),
    /** What is known of the key for flows; never the key itself. */
    flowKey: (): FlowKeyState => flowKey.state(),
    setFlowKey: (key: unknown): Promise<FlowKeyResult> => flowKey.set(key),
    removeFlowKey: (): void => flowKey.remove(),
    /** The address to open on another device; null when the hub does not say. */
    address,
    /** The code to pair with, the address that brings it along, and the squares to scan. */
    async code(slot: Slot, role: Role | null, fresh: boolean): Promise<ShownCode> {
      const made = pairing.openCode(slot, role, fresh);
      const base = await address();
      const link = base === null ? null : `${base}/#pair=${made.code}`;
      return { ...made, address: base, link, qr: link === null ? null : qrCode(link) };
    },
    codes: (): Record<Slot, CodeState> => pairing.codes(),
    setRole: (id: string, role: Role): boolean => pairing.setRole(id, role),
    /** The names of the buttons, for the settings of the app. */
    buttons: (): string[] => buttons.list().map((button) => button.name),
    connected: (): boolean => hub.route() !== null,
    /** A flow on the hub begins or ends the night of the wall tablets. */
    setNight: (on: boolean): void => night.set(on),
    /** The themes a flow card offers; false when a flow names one that is gone. */
    themeChoices: (query: string): ThemeChoice[] => looks.choices(query, hubLanguage(homey)),
    setHouseTheme: (id: string): boolean => looks.setHouseTheme(id),
    setHouseMode: (mode: ModePreference): void => looks.setHouseMode(mode),
    /** What the app may do with Insights, for the settings of the app: shapes, numbers and times only. */
    /** "Zelf opnemen wat Homey niet bijhoudt", for the settings of the app. */
    recording: (): boolean => homey.settings.get(KEYS.record) !== false,
    setRecording(on: boolean): void {
      homey.settings.set(KEYS.record, on);
      if (on) void recorder.start();
      else recorder.stop();
    },
    /** "Opname wissen": every log the app recorded goes; recording goes on when it is on. */
    async wipeRecording(): Promise<void> {
      recorder.stop();
      await recorder.wipe();
      if (homey.settings.get(KEYS.record) !== false) void recorder.start();
    },
    /** Every device back in Rustig, from the settings of the app. */
    resetLooks: (): void => { looks.reset(); },
    night: (): NightWord | null => night.get(),
    build: (): string => build,
    async close(): Promise<void> {
      recorder.stop();
      stopObserving();
      stopLayouts();
      hub.stop();
      await http.close();
    },
  };
}
