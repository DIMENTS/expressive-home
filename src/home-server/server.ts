import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { can, FEATURE_SCOPES } from '../homey/permissions';
import { isButton } from '../homey/buttons';
import type { HistoryPeriod, HistorySource } from '../homey/client';
import type { CapabilityValue, Flow, FlowAccess } from '../homey/types';
import { createHistoryCache } from './history-cache';
import type { Buttons } from './buttons';
import type { FlowKey } from './flow-key';
import { FRESH_MS, STRUCTURE_MS, withoutSecrets, type HubEvent, type HubLink } from './hub-link';
import type { Night } from './night';
import type { PairedDevice, Pairing } from './pairing';
import type { SharedLayouts } from './shared-layouts';
import type { SharedLooks } from './shared-looks';
import type { SharedWidgets } from './shared-widgets';
import type { AppWidgets } from './app-widgets';
import { parseWants, type HubLive } from './app-live';
import { slimWeather } from '../widgets/weather';
import { ENERGY_PERIODS, periodArgs, slimEnergy, type EnergyPeriod } from '../widgets/energy';
import { createDocuments, type Refusal } from './documents';

export interface HomeServerDeps {
  pairing: Pairing;
  layouts: SharedLayouts;
  /** The house's theme, its themes and the dashboards with a theme of their own. */
  looks: SharedLooks;
  /** The own widgets of the house. */
  widgets: SharedWidgets;
  /** Widgets of other apps on the hub, through this app; absent where it cannot be done. */
  appWidgets?: AppWidgets;
  /** The live news of those apps for their widgets; absent where it cannot be had. */
  appLive?: HubLive;
  /** What a flow said of the night of the wall tablets. */
  night: Night;
  /** The key with which flows are started, when the app itself may not. */
  flowKey: FlowKey;
  /** The buttons that start a flow with the card of the app. */
  buttons: Buttons;
  /** The mark of this version of the dashboard; '' when it is not known. */
  build(): string;
  hub: HubLink;
  /** A file of the dashboard by its path from the root ("/index.html"), or null. */
  file(path: string): Promise<{ body: Uint8Array; type: string } | null>;
  /** The id of the hub, also before the hub was read. */
  homeyId(): string | null;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  /** The time zone of the hub, for the days of Homey Energy; UTC without it. */
  timeZone?(): string;
  /** The clock for how long history is kept; the system's without it. */
  now?(): number;
  log?(message: string): void;
}

/** How long the weather and a report of Homey Energy are kept before the hub is asked again. */
export const READ_KEPT_MS = { weather: 10 * 60_000, day: 5 * 60_000, week: 30 * 60_000, month: 30 * 60_000 } as const;

/** The periods a page may ask history for, and the changes of on and off. */
const PERIODS: readonly string[] = ['today', 'last24Hours', 'last7Days', 'last31Days', 'year'];
/** The list of logs changes seldom: it is read again after this long. */
const SOURCES_MS = 60_000;

/** A sign of life on every open stream, so a browser notices a connection that silently went. */
export const PING_MS = 20_000;
export const COOKIE = 'mh_device';
const COOKIE_SECONDS = 400 * 24 * 3600;
const SMALL_BODY = 8 * 1024;
/** Twelve widgets at their largest, with room for the escaping of JSON. */
const WIDGETS_BODY = 3 * 1024 * 1024;
/** The page of the frame an own widget runs in: only in a frame of this server, and always sandboxed. */
export const WIDGET_FRAME_PATH = '/widget-frame.html';
/** Where the files of a widget of another app are passed on. */
export const APP_WIDGET_PREFIX = '/app-widget/';
/**
 * What a page of a widget of another app may: the files of this server (named by its address: the sandbox gives the
 * page no origin of its own), its inline code, no network, never without the sandbox.
 */
export const appWidgetPolicy = (host: string): string => {
  const own = `http://${host}`;
  return `sandbox allow-scripts; default-src ${own} 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
};
/** The files Homey adds to the page of every widget, passed on from the hub at their own paths. */
const isHomeyWidgetFile = (path: string): boolean => path === '/js/crossframe.js' || path.startsWith('/widgets/');
/** A layout of a few large dashboards; far more than any home has. */
const LAYOUT_BODY = 4 * 1024 * 1024;
/** A few themes at their largest. */
const LOOKS_BODY = 512 * 1024;
/** Twenty widgets of apps with fifty long names each. */
const APP_LIVE_BODY = 128 * 1024;
/** A stream that a browser no longer reads is closed instead of kept in memory. */
const MAX_UNSENT = 4 * 1024 * 1024;
/** A stream this far behind gets no news of apps until it caught up: what it shows of the hub goes first. */
export const NEWS_LAG = 256 * 1024;

/** What news of apps is written to: a stream, with the apps it missed news of while it was behind. */
interface NewsStream { response: Pick<ServerResponse, 'writableLength' | 'writableEnded' | 'destroyed'> & { write(text: string): unknown }; missed: Set<string> }

const open = (stream: NewsStream): boolean => !stream.response.writableEnded && !stream.response.destroyed;

/** A stream that caught up hears of the apps it missed news of, so their widgets start anew. */
export function catchUp(stream: NewsStream): void {
  if (stream.missed.size === 0 || !open(stream) || stream.response.writableLength > NEWS_LAG) return;
  for (const app of stream.missed) stream.response.write(`event: app-gap\ndata: ${JSON.stringify({ app })}\n\n`);
  stream.missed.clear();
}

/** News of an app on a stream, as text made once; skipped, and remembered, while the stream is too far behind. */
export function writeNews(stream: NewsStream, app: string, event: string, text: string): void {
  if (!open(stream)) return;
  if (stream.response.writableLength > NEWS_LAG) { stream.missed.add(app); return; }
  catchUp(stream);
  stream.response.write(`event: ${event}\ndata: ${text}\n\n`);
}
const MAX_STREAMS = 120;

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

const PRIVATE_IPV4 = /^(?:10|127)(?:\.\d{1,3}){3}$|^192\.168(?:\.\d{1,3}){2}$|^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$|^169\.254(?:\.\d{1,3}){2}$/;
/** A name without a dot, or of the own network: no name that a website on the internet can point at the hub. */
const LOCAL_NAME = /^[a-z0-9-]+(?:\.(?:local|lan|home\.arpa))?$/i;

/** Whether who asks is on the own network. */
export function isLocalAddress(address: string | undefined): boolean {
  return PRIVATE_IPV4.test((address ?? '').replace(/^::ffff:/i, ''));
}

/** Whether the Host header is an address on the own network (against DNS rebinding). */
export function isLocalHost(host: string | undefined): boolean {
  const name = (host ?? '').replace(/:\d{1,5}$/, '');
  return PRIVATE_IPV4.test(name) || LOCAL_NAME.test(name);
}

/** The path of a file inside the folder of the dashboard; null when it points outside it. */
export function filePath(raw: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (path.includes('\0') || path.includes('\\') || path.split('/').includes('..')) return null;
  return path.endsWith('/') ? `${path}index.html` : path;
}

function cookieOf(request: IncomingMessage): string {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE) return value.join('=');
  }
  return '';
}

/** Puts the pairing in the browser, or (an empty token) takes it out. Not readable by a script, only sent to this address. */
const cookie = (token: string): string => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token === '' ? 0 : COOKIE_SECONDS}`;

async function bodyOf(request: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  if (!/^application\/json\b/i.test(request.headers['content-type'] ?? '')) throw new HttpError(415, 'json-only');
  const parts: Buffer[] = [];
  let size = 0;
  for await (const part of request as AsyncIterable<Buffer>) {
    size += part.length;
    if (size > limit) throw new HttpError(413, 'too-large');
    parts.push(part);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // not JSON
  }
  throw new HttpError(400, 'bad-json');
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * The server of the app on the hub: the files of the dashboard, pairing, and for paired devices what the
 * hub has, its live reports, controlling, and the shared layouts. The browser only ever talks to this server.
 */
export function createHomeServer(deps: HomeServerDeps) {
  const streams = new Set<{ response: ServerResponse; deviceId: string; id: string; missed: Set<string> }>();
  const documents = createDocuments(deps);
  /** Streams that got their last word; what a browser does not take by the next ping is cut off. */
  const ending = new Set<ServerResponse>();

  function json(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
    response.end(JSON.stringify(value));
  }

  /** What may be done: what the app may, and starting flows when there is a key for that. */
  function scopes(own: string[]): string[] {
    return deps.flowKey.usable() && !can(own, FEATURE_SCOPES.startFlows) ? [...own, FEATURE_SCOPES.startFlows] : own;
  }

  /** How flows that are no buttons can be started. */
  function flowAccess(own: string[]): FlowAccess {
    if (can(scopes(own), FEATURE_SCOPES.startFlows)) return 'works';
    return deps.flowKey.state() === 'refused' ? 'refused' : 'none';
  }

  /** What a page gets of the flows: the buttons first, then the flows of the hub. */
  const flowsOf = (flows: Flow[]): Flow[] => [...deps.buttons.list(), ...flows.map(({ buttons: _names, off: _off, ...flow }) => flow)];

  /** The paired device of a request, or a refusal. */
  function device(request: IncomingMessage): PairedDevice {
    const found = deps.pairing.find(cookieOf(request));
    if (!found) throw new HttpError(401, 'not-paired');
    return found;
  }

  function send(stream: { response: ServerResponse }, event: string, data: unknown): void {
    const { response } = stream;
    if (response.writableEnded || response.destroyed) return;
    if (response.writableLength > MAX_UNSENT) {
      response.destroy();
      return;
    }
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function openStream(request: IncomingMessage, response: ServerResponse): void {
    const { id, role } = device(request);
    if (streams.size >= MAX_STREAMS) throw new HttpError(503, 'busy');
    response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
    const stream = { response, deviceId: id, id: randomBytes(12).toString('hex'), missed: new Set<string>() };
    streams.add(stream);
    response.on('close', () => {
      streams.delete(stream);
      ending.delete(response);
      deps.appLive?.drop(stream.id);
    });
    const looks = deps.looks.get();
    send(stream, 'hello', { revision: deps.layouts.get().revision, looks: looks.revision, rescue: looks.rescue, widgets: deps.widgets.get().revision, role, route: deps.hub.route(), ready: deps.hub.snapshot() !== null, night: deps.night.get(), build: deps.build(), ...(deps.appLive ? { stream: stream.id } : {}) });
  }

  async function control(request: IncomingMessage, response: ServerResponse): Promise<void> {
    device(request);
    const body = await bodyOf(request, SMALL_BODY);
    device(request);
    const [deviceId, capabilityId, value] = [text(body['deviceId']), text(body['capabilityId']), body['value']];
    const known = deps.hub.snapshot()?.devices;
    const target = known && Object.hasOwn(known, deviceId) ? known[deviceId] : undefined;
    const capability = target && Object.hasOwn(target.capabilities, capabilityId) ? target.capabilities[capabilityId] : undefined;
    if (!capability?.setable) throw new HttpError(404, 'unknown-capability');
    if (value !== null && !['boolean', 'number', 'string'].includes(typeof value)) throw new HttpError(400, 'bad-value');
    await onHub(() => deps.hub.setCapability(deviceId, capabilityId, value as CapabilityValue));
    json(response, 200, {});
  }

  async function startFlow(request: IncomingMessage, response: ServerResponse): Promise<void> {
    device(request);
    const id = text((await bodyOf(request, SMALL_BODY))['id']);
    const { name } = device(request);
    if (isButton(id)) {
      let pressed = false;
      await onHub(async () => { pressed = await deps.buttons.press(id, name); });
      if (!pressed) throw new HttpError(404, 'unknown-flow');
      json(response, 200, {});
      return;
    }
    const flow = deps.hub.snapshot()?.flows.find((f) => f.id === id && f.startable);
    if (!flow) throw new HttpError(404, 'unknown-flow');
    await onHub(() => (deps.flowKey.usable() ? deps.flowKey.start(flow) : deps.hub.startFlow(flow)));
    json(response, 200, {});
  }

  async function onHub(act: () => Promise<void>): Promise<void> {
    try {
      await act();
    } catch (error) {
      deps.log?.(`Not done: ${withoutSecrets(error)}`);
      throw new HttpError(502, 'hub-refused');
    }
  }

  const now = deps.now ?? Date.now;
  const history = createHistoryCache({ read: (source, period) => deps.hub.readSeries(source, period), switches: (source) => deps.hub.readSwitches(source), now });
  let sources: { at: number; list: Promise<HistorySource[]> } | null = null;
  // a new connection with the hub: what was read of the old one is not kept
  deps.hub.subscribe((event) => { if (event.type === 'reset') { history.clear(); sources = null; } });

  /** The logs with history; every value the hub has is known, so the recorded logs of the app are found too. */
  async function historySources(): Promise<HistorySource[]> {
    if (sources && Math.abs(now() - sources.at) < SOURCES_MS) return sources.list;
    const devices = Object.values(deps.hub.snapshot()?.devices ?? {});
    const known = devices.flatMap((d) => Object.keys(d.capabilities).map((capabilityId) => ({ deviceId: d.id, capabilityId })));
    const mine = { at: now(), list: deps.hub.listHistory(known) };
    sources = mine;
    mine.list.catch(() => { if (sources === mine) sources = null; });
    return mine.list;
  }

  async function fromHub<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error) {
      deps.log?.(`History not read: ${withoutSecrets(error)}`);
      throw new HttpError(502, 'hub-refused');
    }
  }

  /**
   * What the hub answered for its weather and its energy, slimmed and kept a while: every page asks, the hub is asked seldom.
   * One answer per kind, with what it is of: the report of another day takes the place of the one before.
   */
  const kept = new Map<string, { at: number; of: string; value: unknown }>();
  async function keptRead(slot: string, of: string, maxAge: number, read: () => Promise<unknown>, slim: (raw: unknown) => unknown): Promise<unknown> {
    const hit = kept.get(slot);
    if (hit && hit.of === of && Math.abs(now() - hit.at) < maxAge) return hit.value;
    try {
      const value = slim(await read());
      kept.set(slot, { at: now(), of, value });
      return value;
    } catch (error) {
      const { statusCode, status } = (typeof error === 'object' && error !== null ? error : {}) as { statusCode?: unknown; status?: unknown };
      const code = typeof statusCode === 'number' ? statusCode : typeof status === 'number' ? status : null;
      if (code === 401 || code === 403) throw new HttpError(403, 'no-right');
      if (code === 404) throw new HttpError(404, 'none');
      deps.log?.(`Not read: ${withoutSecrets(error)}`);
      throw new HttpError(502, 'hub-refused');
    }
  }
  deps.hub.subscribe((event) => { if (event.type === 'reset') kept.clear(); });

  async function readWeather(request: IncomingMessage, response: ServerResponse): Promise<void> {
    device(request);
    const weather = await keptRead('weather', '', READ_KEPT_MS.weather, () => deps.hub.readWeather(), slimWeather);
    device(request);
    json(response, 200, { weather });
  }

  async function readEnergy(request: IncomingMessage, response: ServerResponse): Promise<void> {
    device(request);
    const period = new URLSearchParams((request.url ?? '').split('?')[1] ?? '').get('period') ?? '';
    if (!(ENERGY_PERIODS as readonly string[]).includes(period)) throw new HttpError(400, 'bad-period');
    const timeZone = deps.timeZone?.() ?? 'UTC';
    // another day, week or month is another report
    const of = JSON.stringify(periodArgs(period as EnergyPeriod, new Date(now()), timeZone));
    const report = await keptRead(`energy:${period}`, of, READ_KEPT_MS[period as EnergyPeriod], () => deps.hub.readEnergy(period as EnergyPeriod, timeZone), slimEnergy);
    device(request);
    json(response, 200, { report });
  }

  async function readHistory(request: IncomingMessage, response: ServerResponse): Promise<void> {
    device(request);
    const query = new URLSearchParams((request.url ?? '').split('?')[1] ?? '');
    const period = query.get('period') ?? '';
    if (period !== 'switches' && !PERIODS.includes(period)) throw new HttpError(400, 'bad-period');
    const source = (await fromHub(historySources)).find((one) => one.log === query.get('log'));
    if (!source) throw new HttpError(404, 'unknown-log');
    const answer = period === 'switches'
      ? { switches: await fromHub(() => history.switches(source)) }
      : { series: await fromHub(() => history.series(source, period as HistoryPeriod)) };
    // the right can be gone while the hub was asked
    device(request);
    json(response, 200, answer);
  }

  /** A refusal of the shared documents as an answer of this server. */
  function refused(refusal: Refusal, bad: string): never {
    if (refusal.error === 'role') throw new HttpError(403, 'use-only');
    if (refusal.error === 'too-big') throw new HttpError(413, 'too-big');
    throw new HttpError(400, bad);
  }

  async function putLayouts(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (device(request).role !== 'edit') throw new HttpError(403, 'use-only');
    const body = await bodyOf(request, LAYOUT_BODY);
    // the owner can have taken the device away while it was sending, or its right
    const done = documents.putLayouts(device(request).role, body);
    if ('error' in done) refused(done, 'bad-layouts');
    json(response, done.ok ? 200 : 409, done.doc);
  }

  async function postLooks(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (device(request).role !== 'edit') throw new HttpError(403, 'use-only');
    const body = await bodyOf(request, LOOKS_BODY);
    // the right can be gone while it was sending
    const done = documents.looksOps(device(request).role, body['ops']);
    if ('error' in done) refused(done, 'bad-looks');
    json(response, 200, done.doc);
  }

  async function postWidgets(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (device(request).role !== 'edit') throw new HttpError(403, 'use-only');
    const body = await bodyOf(request, WIDGETS_BODY);
    const done = documents.widgetsOps(device(request).role, body['ops']);
    if ('error' in done) refused(done, 'bad-widgets');
    json(response, 200, done.doc);
  }

  async function appWidgetApi(request: IncomingMessage, response: ServerResponse): Promise<void> {
    device(request);
    if (!deps.appWidgets) throw new HttpError(404, 'not-found');
    const body = await bodyOf(request, LOOKS_BODY);
    device(request);
    const ref = text(body['ref']);
    // only a widget that stands on a dashboard of this house may reach its back end
    const placed = Object.values(deps.layouts.get().layouts).some((layout) => layout.dashboards.some((board) => (board.sections ?? [])
      .some((section) => section.tiles.some((tile) => tile.spec.kind === 'widget' && tile.spec.widget === ref))));
    if (!placed) throw new HttpError(404, 'unknown-route');
    const answer = await deps.appWidgets.api(ref, text(body['method']), text(body['route']), body['body']).catch(() => undefined);
    if (answer === null) throw new HttpError(404, 'unknown-route');
    if (answer === undefined) throw new HttpError(502, 'hub-refused');
    json(response, 200, { status: answer.status, body: answer.body });
  }

  /** What the widgets of apps on a page listen to, for one stream of that page's own device. */
  async function appLivePost(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const { id } = device(request);
    if (!deps.appLive) throw new HttpError(404, 'not-found');
    const body = await bodyOf(request, APP_LIVE_BODY);
    device(request);
    const streamId = text(body['stream']);
    const stream = [...streams].find((one) => one.id === streamId && one.deviceId === id);
    if (!stream) throw new HttpError(404, 'unknown-stream');
    const wants = parseWants(body['wants']);
    if (!wants) throw new HttpError(400, 'bad-wants');
    // whether a widget stands on a dashboard is looked at whenever news is listened to: it may be saved just after this
    deps.appLive.want(stream.id, wants);
    json(response, 200, {});
  }

  /** A file of a widget of another app, from the hub's own web server, kept in its sandbox. */
  /** A file Homey adds to every widget page: read by a page without an origin of its own, so open to it. */
  async function homeyWidgetFile(method: string, path: string, response: ServerResponse): Promise<void> {
    if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'method');
    const found = deps.appWidgets ? await deps.appWidgets.homeyFile(path).catch(() => null) : null;
    if (!found || found.status !== 200) throw new HttpError(404, 'not-found');
    response.setHeader('cross-origin-resource-policy', 'cross-origin');
    // a module script of a sandboxed page is fetched with CORS
    response.setHeader('access-control-allow-origin', '*');
    response.writeHead(200, { 'content-type': found.type, 'content-length': String(found.body.length), 'cache-control': 'no-cache' });
    response.end(method === 'HEAD' ? undefined : found.body);
  }

  async function appWidgetFile(method: string, path: string, host: string, response: ServerResponse): Promise<void> {
    if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'method');
    const [app = '', widget = '', ...rest] = path.slice(APP_WIDGET_PREFIX.length).split('/');
    const found = deps.appWidgets ? await deps.appWidgets.file(`app:${app}/${widget}`, rest.join('/')).catch(() => null) : null;
    if (!found || found.status !== 200) throw new HttpError(404, 'not-found');
    response.setHeader('x-frame-options', 'SAMEORIGIN');
    response.setHeader('content-security-policy', appWidgetPolicy(host));
    // the same CORS answer as Homey's own files, for module scripts of the widget itself
    response.setHeader('access-control-allow-origin', '*');
    // loaded by a page without an origin of its own, in the sandbox
    response.setHeader('cross-origin-resource-policy', 'cross-origin');
    response.writeHead(200, { 'content-type': found.type, 'content-length': String(found.body.length), 'cache-control': 'no-cache' });
    response.end(method === 'HEAD' ? undefined : found.body);
  }

  async function pair(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await bodyOf(request, SMALL_BODY);
    const result = deps.pairing.redeem(text(body['code']), text(body['name']));
    if (!result.ok) throw new HttpError(result.reason === 'locked' ? 429 : 403, result.reason);
    // the first start of this hub: the only device, one that may arrange, and nobody ever saved a dashboard or chose a look
    const first = result.device.role === 'edit' && deps.pairing.list().length === 1 && deps.layouts.get().revision === 0 && deps.looks.get().revision === 0;
    json(response, 200, { device: result.device, first }, { 'set-cookie': cookie(result.token) });
  }

  function session(request: IncomingMessage, response: ServerResponse): void {
    const token = cookieOf(request);
    const found = deps.pairing.find(token);
    if (!found) json(response, 200, { paired: false });
    else json(response, 200, { paired: true, device: { name: found.name, role: found.role }, homeyId: deps.homeyId() }, { 'set-cookie': cookie(token) });
  }

  async function api(method: string, path: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
    switch (`${method} ${path}`) {
      case 'GET /api/session': session(request, response); return;
      case 'POST /api/pair': await pair(request, response); return;
      case 'POST /api/unpair':
        await bodyOf(request, SMALL_BODY);
        deps.pairing.remove(device(request).id);
        json(response, 200, {}, { 'set-cookie': cookie('') });
        return;
      case 'GET /api/snapshot': {
        device(request);
        await Promise.all([deps.hub.refresh(FRESH_MS), deps.buttons.refresh(FRESH_MS)]);
        device(request);
        const snapshot = deps.hub.snapshot();
        if (!snapshot) throw new HttpError(503, 'hub-unreachable');
        json(response, 200, { snapshot: { ...snapshot, scopes: scopes(snapshot.scopes), flowAccess: flowAccess(snapshot.scopes), flows: flowsOf(snapshot.flows) }, route: deps.hub.route() });
        return;
      }
      case 'GET /api/events': openStream(request, response); return;
      case 'POST /api/control': await control(request, response); return;
      case 'POST /api/flow': await startFlow(request, response); return;
      case 'GET /api/layouts': device(request); json(response, 200, deps.layouts.get()); return;
      case 'PUT /api/layouts': await putLayouts(request, response); return;
      case 'GET /api/looks': device(request); json(response, 200, deps.looks.get()); return;
      case 'POST /api/looks': await postLooks(request, response); return;
      case 'GET /api/history/sources': device(request); json(response, 200, { sources: await fromHub(historySources) }); return;
      case 'GET /api/history': await readHistory(request, response); return;
      case 'GET /api/weather': await readWeather(request, response); return;
      case 'GET /api/energy': await readEnergy(request, response); return;
      case 'GET /api/widgets': device(request); json(response, 200, deps.widgets.get()); return;
      case 'POST /api/widgets': await postWidgets(request, response); return;
      case 'GET /api/app-widgets': device(request); json(response, 200, deps.appWidgets ? await deps.appWidgets.list() : { state: 'no-key', widgets: [] }); return;
      case 'POST /api/app-widget-api': await appWidgetApi(request, response); return;
      case 'POST /api/app-live': await appLivePost(request, response); return;
      case 'GET /api/app-widget-autocomplete': {
        // choosing a setting is arranging
        if (device(request).role !== 'edit') throw new HttpError(403, 'use-only');
        const asked = new URL(request.url ?? '/', 'http://local').searchParams;
        const found = deps.appWidgets ? await deps.appWidgets.autocomplete(asked.get('ref') ?? '', asked.get('setting') ?? '', asked.get('query') ?? '') : null;
        json(response, 200, { results: found ?? [] });
        return;
      }
      default: throw new HttpError(404, 'not-found');
    }
  }

  async function serveFile(method: string, path: string, response: ServerResponse): Promise<void> {
    if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'method');
    const wanted = filePath(path);
    const found = wanted === null ? null : await deps.file(wanted);
    if (!found) throw new HttpError(404, 'not-found');
    if (path === WIDGET_FRAME_PATH) {
      // framed by the dashboard only, and never run without the sandbox, also when it is opened by itself
      response.setHeader('x-frame-options', 'SAMEORIGIN');
      response.setHeader('content-security-policy', 'sandbox allow-scripts');
    }
    response.writeHead(200, { 'content-type': found.type, 'content-length': String(found.body.length), 'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    response.end(method === 'HEAD' ? undefined : found.body);
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('cross-origin-resource-policy', 'same-origin');
    // a browser that goes away in the middle is no reason to stop
    response.on('error', () => {});
    const { host, origin } = request.headers;
    const method = request.method ?? 'GET';
    try {
      if (!isLocalAddress(request.socket.remoteAddress)) throw new HttpError(403, 'address');
      if (!isLocalHost(host)) throw new HttpError(403, 'host');
      // writing only from a page of this server itself
      if (method !== 'GET' && method !== 'HEAD' && origin !== `http://${host}`) throw new HttpError(403, 'origin');
      const path = (request.url ?? '/').split('?')[0]!;
      if (path.startsWith('/api/')) await api(method, path, request, response);
      else if (path.startsWith(APP_WIDGET_PREFIX)) await appWidgetFile(method, path, host ?? '', response);
      else if (isHomeyWidgetFile(path)) await homeyWidgetFile(method, path, response);
      else await serveFile(method, path, response);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const known = error instanceof HttpError;
      if (!known) deps.log?.(`Request failed: ${error instanceof Error ? error.message : 'unknown'}`);
      json(response, known ? error.status : 500, { error: known ? error.code : 'failed' });
    }
  }

  const tell = (event: HubEvent): void => { for (const stream of [...streams]) send(stream, 'hub', event); };
  const stopHub = deps.hub.subscribe((event) => {
    // a new connection of this app with the hub: the live news of apps begins anew too
    if (event.type === 'reset') deps.appLive?.restart();
    tell(event.type === 'structure' ? { ...event, flows: flowsOf(event.flows) } : event);
  });
  const stopButtons = deps.buttons.subscribe(() => {
    const snapshot = deps.hub.snapshot();
    if (snapshot) tell({ type: 'structure', zones: snapshot.zones, flows: flowsOf(snapshot.flows) });
  });
  const stopLayouts = deps.layouts.subscribe((revision) => {
    for (const stream of [...streams]) send(stream, 'layouts', { revision });
    deps.appLive?.placedChanged();
  });
  const stopLooks = deps.looks.subscribe((revision, reset) => { for (const stream of [...streams]) send(stream, 'looks', { revision, reset }); });
  const stopWidgets = deps.widgets.subscribe((revision) => { for (const stream of [...streams]) send(stream, 'widgets', { revision }); });
  const stopNight = deps.night.subscribe(() => { for (const stream of [...streams]) send(stream, 'night', deps.night.get()); });
  const stopFlowKey = deps.flowKey.subscribe(() => {
    deps.appLive?.restart();
    const snapshot = deps.hub.snapshot();
    if (snapshot) for (const stream of [...streams]) send(stream, 'hub', { type: 'scopes', scopes: scopes(snapshot.scopes), flowAccess: flowAccess(snapshot.scopes) });
  });
  const stopPairing = deps.pairing.subscribe((id) => {
    for (const stream of [...streams]) {
      if (stream.deviceId !== id) continue;
      send(stream, 'unpaired', {});
      streams.delete(stream);
      ending.add(stream.response);
      stream.response.end();
    }
  });
  const stopRole = deps.pairing.onRole((id, role) => { for (const stream of [...streams]) if (stream.deviceId === id) send(stream, 'role', { role }); });
  const stopAppLive = deps.appLive?.subscribe((ids, event, text, app) => {
    const wanted = new Set(ids);
    for (const stream of [...streams]) if (wanted.has(stream.id)) writeNews(stream, app, event, text);
  });
  const ping = deps.setInterval(() => {
    for (const response of [...ending]) response.destroy();
    for (const stream of [...streams]) {
      send(stream, 'ping', {});
      catchUp(stream);
      deps.pairing.touch(stream.deviceId);
    }
    // the hub does not tell of a new flow or room: it is asked while someone looks
    if (streams.size > 0) {
      void deps.hub.refresh(STRUCTURE_MS);
      void deps.buttons.refresh(STRUCTURE_MS);
    }
  }, PING_MS);
  const server: Server = createServer((request, response) => { void handle(request, response); });

  return {
    server,
    /** How many browsers are listening now. */
    streams: (): number => streams.size,
    async close(): Promise<void> {
      stopHub();
      stopButtons();
      stopLayouts();
      stopLooks();
      stopWidgets();
      stopNight();
      stopFlowKey();
      stopPairing();
      stopRole();
      stopAppLive?.();
      deps.clearInterval(ping);
      for (const stream of [...streams]) {
        streams.delete(stream);
        stream.response.end();
      }
      await new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); });
    },
  };
}
