import { createHash, randomBytes } from 'node:crypto';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createButtons } from '../../src/home-server/buttons';
import { createFlowKey } from '../../src/home-server/flow-key';
import { createHubLink } from '../../src/home-server/hub-link';
import { createNight } from '../../src/home-server/night';
import { createPairing } from '../../src/home-server/pairing';
import { createHomeServer } from '../../src/home-server/server';
import { createSharedLayouts } from '../../src/home-server/shared-layouts';
import type { HomeyClient } from '../../src/homey/client';
import { createSwitchableTranslate } from '../../src/i18n';
import type { LayoutEdit } from '../../src/layout/edit';
import { createServedClient } from '../../src/served/client';
import { createLink, type EventStream } from '../../src/served/link';
import { createServedStore } from '../../src/served/store';
import { createStore } from '../../src/state/store';
import { createController } from '../../src/ui/app/controller';
import { camperSnapshot, fakeHub, HOMEY_ID } from '../helpers/fake-hub';

// The app on the hub and the pages of several devices, over a real connection on this machine with the delays of a
// wireless network. Only the waiting of the app itself goes faster.

/** How much faster the app waits than it does on a device. */
export const SPEED = 10;
export const sleep = (ms: number): Promise<void> => new Promise((done) => { setTimeout(done, ms); });
const later = (fn: () => void, ms: number): unknown => setTimeout(fn, ms / SPEED);
const cancel = (handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>);

const closing: (() => Promise<void> | void)[] = [];
export async function closeBeds(): Promise<void> { for (const close of closing.splice(0)) await close(); }

/** Waits until something is so, as a person would; fails after a while. */
export async function until(what: string, test: () => boolean, ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error(`never happened: ${what}`);
    await sleep(5);
  }
}

export async function bed() {
  const hub = fakeHub({ ...camperSnapshot(), homeyId: HOMEY_ID });
  const hubLink = createHubLink({ createClient: async () => hub as unknown as HomeyClient, setTimeout: later, clearTimeout: cancel, now: () => Date.now() * SPEED });
  let codes = 100_000;
  const pairing = createPairing({ load: () => [], save: () => {}, now: () => Date.now(), token: () => randomBytes(32).toString('base64url'), code: () => String((codes += 1)), fingerprint: (t) => createHash('sha256').update(t).digest('hex') });
  let saves = 0;
  const layouts = createSharedLayouts({ load: () => undefined, save: () => { saves += 1; } });
  const night = createNight({ load: () => undefined, save: () => {}, now: () => Date.now() });
  const flowKey = createFlowKey({ load: () => undefined, save: () => {}, request: async () => { throw new Error('no key here'); } });
  const version = { build: 'one' };
  const buttons = createButtons({ load: () => undefined, save: () => {}, card: null, flows: () => [], setTimeout: later, clearTimeout: cancel, now: () => Date.now() });
  const server = createHomeServer({ pairing, layouts, night, flowKey, buttons, build: () => version.build, hub: hubLink, homeyId: () => HOMEY_ID, setInterval: (fn, ms) => setInterval(fn, ms / SPEED), clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>), file: async () => null });
  await new Promise<void>((done) => { server.server.listen(0, '127.0.0.1', () => done()); });
  const { port } = server.server.address() as AddressInfo;
  hubLink.start();
  await sleep(5);
  closing.push(async () => { hubLink.stop(); await server.close(); });
  return {
    hub, hubLink, pairing, layouts, night, version, server, port, host: `127.0.0.1:${port}`, saves: () => saves,
    /** The names of the dashboards that the hub keeps. */
    boards: () => (layouts.get().layouts[HOMEY_ID]?.dashboards ?? []).map((d) => d.name ?? d.id),
  };
}
export type Bed = Awaited<ReturnType<typeof bed>>;

/** The page of one device; `up`, `down` and `stream` are the delays of its requests, their answers and its live stream. */
export function device(b: Bed, delays: { up?: number; down?: number; stream?: number } = {}) {
  const net = { up: 0, down: 0, stream: delays.down ?? 0, ...delays, away: false, failing: '' };
  const sockets = new Set<{ destroy(): void }>();
  const log: string[] = [];
  let cookie = '';

  async function fetch(path: string, init?: RequestInit): Promise<Response> {
    const method = init?.method ?? 'GET';
    log.push(`${method} ${path}`);
    await sleep(net.up);
    if (net.away || net.failing === `${method} ${path}`) throw new TypeError('Failed to fetch');
    const response = await new Promise<IncomingMessage>((done, fail) => {
      const sent = httpRequest({ host: '127.0.0.1', port: b.port, method, path: `/${path}`, headers: { host: b.host, origin: `http://${b.host}`, 'content-type': 'application/json', cookie } }, done);
      sent.on('error', fail);
      sent.end(init?.body as string | undefined);
    });
    const parts: Buffer[] = [];
    for await (const part of response) parts.push(part as Buffer);
    const set = response.headers['set-cookie']?.[0];
    if (set) cookie = set.split(';')[0]!;
    await sleep(net.down);
    if (net.away) throw new TypeError('Failed to fetch');
    return new Response(Buffer.concat(parts).toString('utf8'), { status: response.statusCode! });
  }

  function openStream(path: string): EventStream {
    const on = new Map<string, (event: { data?: string }) => void>();
    let closed = false;
    let request: ReturnType<typeof httpRequest> | null = null;
    const stream = {
      readyState: 0,
      addEventListener: (type: string, listener: (event: { data?: string }) => void) => { on.set(type, listener); },
      close() { closed = true; request?.destroy(); },
    };
    const fire = (type: string, data?: string): void => { if (!closed) on.get(type)?.(data === undefined ? {} : { data }); };
    void (async () => {
      await sleep(net.up);
      if (closed) return;
      if (net.away) { fire('error'); return; }
      request = httpRequest({ host: '127.0.0.1', port: b.port, path: `/${path}`, headers: { host: b.host, cookie } }, (response) => {
        if (response.statusCode !== 200) { stream.readyState = 2; fire('error'); return; }
        let rest = '';
        response.on('data', (part: Buffer) => {
          rest += part.toString('utf8');
          for (let at = rest.indexOf('\n\n'); at !== -1; at = rest.indexOf('\n\n')) {
            const [event = '', data = ''] = rest.slice(0, at).split('\n');
            rest = rest.slice(at + 2);
            setTimeout(() => fire(event.replace('event: ', ''), data.replace('data: ', '')), net.stream);
          }
        });
        response.on('close', () => setTimeout(() => fire('error'), net.stream));
        response.on('error', () => {});
      });
      request.on('error', () => fire('error'));
      request.on('socket', (socket) => sockets.add(socket));
      request.end();
    })();
    return stream;
  }

  const link = createLink({ fetch, openStream, setTimeout: later, clearTimeout: cancel, now: () => Date.now() * SPEED });
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const served = createServedStore(storage, link);
  const notices: string[] = [];
  const store = createStore((flush) => { setTimeout(flush, 0); });
  const controller = createController({
    configStore: served.store, store, createRealClient: () => createServedClient(link), createDemoClient: () => { throw new Error('there is no example here'); },
    notify: (message) => { notices.push(message.text); }, setTimeout: later, clearTimeout: cancel, t: createSwitchableTranslate('nl'), browserLanguages: ['nl'],
    mayArrange: () => served.mayArrange(), served: true,
  });
  served.onChanged(() => { void controller.reloadStored(); });
  served.onConflict(() => { notices.push('CONFLICT'); });
  served.onUnsaved(() => { notices.push('UNSAVED'); });
  closing.unshift(() => controller.disconnect());

  return {
    net, link, served, store, controller, notices, log, storage, values,
    /** The wifi of this device goes, or comes back. */
    leave(): void { net.away = true; for (const socket of sockets) socket.destroy(); },
    comeBack(): void { net.away = false; },
    /** The cookie of another tab of the same browser. */
    take(other: { cookie(): string }): void { cookie = other.cookie(); },
    cookie: () => cookie,
    async pair(role: 'use' | 'edit' = 'edit'): Promise<void> {
      const { code } = b.pairing.newCode(role);
      if (await served.pair(code, 'x') !== 'ok') throw new Error('not paired');
      await controller.start();
      await until('the live stream is open', () => link.up());
    },
    route: () => controller.getState().route,
    edit: (edit: LayoutEdit, group?: string) => controller.edit(edit, group),
    add: (id: string, name: string) => controller.edit({ type: 'add-dashboard', dashboard: { id, name, icon: null, sections: [] } }),
    boards: () => controller.getState().layout.dashboards.map((d) => d.name ?? d.id),
    lamp: () => store.getDevice('device-1')!.capabilities['onoff']!.value,
  };
}
export type Page = ReturnType<typeof device>;
