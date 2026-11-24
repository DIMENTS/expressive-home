import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { can, FEATURE_SCOPES } from '../homey/permissions';
import { isButton } from '../homey/buttons';
import type { CapabilityValue, Flow, FlowAccess } from '../homey/types';
import type { Buttons } from './buttons';
import type { FlowKey } from './flow-key';
import { FRESH_MS, STRUCTURE_MS, withoutSecrets, type HubEvent, type HubLink } from './hub-link';
import type { Night } from './night';
import type { PairedDevice, Pairing } from './pairing';
import type { SharedLayouts } from './shared-layouts';

export interface HomeServerDeps {
  pairing: Pairing;
  layouts: SharedLayouts;
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
  log?(message: string): void;
}

/** A sign of life on every open stream, so a browser notices a connection that silently went. */
export const PING_MS = 20_000;
export const COOKIE = 'mh_device';
const COOKIE_SECONDS = 400 * 24 * 3600;
const SMALL_BODY = 8 * 1024;
/** A layout of a few large dashboards; far more than any home has. */
const LAYOUT_BODY = 4 * 1024 * 1024;
/** A stream that a browser no longer reads is closed instead of kept in memory. */
const MAX_UNSENT = 4 * 1024 * 1024;
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
  const streams = new Set<{ response: ServerResponse; deviceId: string }>();
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
    const stream = { response, deviceId: id };
    streams.add(stream);
    response.on('close', () => {
      streams.delete(stream);
      ending.delete(response);
    });
    send(stream, 'hello', { revision: deps.layouts.get().revision, role, route: deps.hub.route(), ready: deps.hub.snapshot() !== null, night: deps.night.get(), build: deps.build() });
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

  async function putLayouts(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (device(request).role !== 'edit') throw new HttpError(403, 'use-only');
    const body = await bodyOf(request, LAYOUT_BODY);
    // the owner can have taken the device away while it was sending, or its right
    if (device(request).role !== 'edit') throw new HttpError(403, 'use-only');
    const { ok, doc } = deps.layouts.put(typeof body['base'] === 'number' ? body['base'] : -1, body);
    json(response, ok ? 200 : 409, doc);
  }

  async function pair(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await bodyOf(request, SMALL_BODY);
    const result = deps.pairing.redeem(text(body['code']), text(body['name']));
    if (!result.ok) throw new HttpError(result.reason === 'locked' ? 429 : 403, result.reason);
    json(response, 200, { device: result.device }, { 'set-cookie': cookie(result.token) });
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
      default: throw new HttpError(404, 'not-found');
    }
  }

  async function serveFile(method: string, path: string, response: ServerResponse): Promise<void> {
    if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'method');
    const wanted = filePath(path);
    const found = wanted === null ? null : await deps.file(wanted);
    if (!found) throw new HttpError(404, 'not-found');
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
      else await serveFile(method, path, response);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const known = error instanceof HttpError;
      if (!known) deps.log?.(`Request failed: ${error instanceof Error ? error.message : 'unknown'}`);
      json(response, known ? error.status : 500, { error: known ? error.code : 'failed' });
    }
  }

  const tell = (event: HubEvent): void => { for (const stream of [...streams]) send(stream, 'hub', event); };
  const stopHub = deps.hub.subscribe((event) => tell(event.type === 'structure' ? { ...event, flows: flowsOf(event.flows) } : event));
  const stopButtons = deps.buttons.subscribe(() => {
    const snapshot = deps.hub.snapshot();
    if (snapshot) tell({ type: 'structure', zones: snapshot.zones, flows: flowsOf(snapshot.flows) });
  });
  const stopLayouts = deps.layouts.subscribe((revision) => { for (const stream of [...streams]) send(stream, 'layouts', { revision }); });
  const stopNight = deps.night.subscribe(() => { for (const stream of [...streams]) send(stream, 'night', deps.night.get()); });
  const stopFlowKey = deps.flowKey.subscribe(() => {
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
  const ping = deps.setInterval(() => {
    for (const response of [...ending]) response.destroy();
    for (const stream of [...streams]) {
      send(stream, 'ping', {});
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
      stopNight();
      stopFlowKey();
      stopPairing();
      stopRole();
      deps.clearInterval(ping);
      for (const stream of [...streams]) {
        streams.delete(stream);
        stream.response.end();
      }
      await new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); });
    },
  };
}
