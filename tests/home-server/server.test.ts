import { createHash, randomBytes } from 'node:crypto';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, test, vi } from 'vitest';
import { createButtons } from '../../src/home-server/buttons';
import { createFlowKey } from '../../src/home-server/flow-key';
import { createHubLink } from '../../src/home-server/hub-link';
import { createNight } from '../../src/home-server/night';
import { createPairing } from '../../src/home-server/pairing';
import { createHomeServer, filePath, isLocalAddress, isLocalHost } from '../../src/home-server/server';
import { createSharedLayouts } from '../../src/home-server/shared-layouts';
import { createSharedLooks } from '../../src/home-server/shared-looks';
import { createSharedWidgets } from '../../src/home-server/shared-widgets';
import { createAppWidgets } from '../../src/home-server/app-widgets';
import type { HomeServerDeps } from '../../src/home-server/server';
import { hubLayout, overview, ownSection } from '../helpers/layout';
import { camperSnapshot, fakeHub, HOMEY_ID } from '../helpers/fake-hub';

const open: { close(): Promise<void> }[] = [];
afterEach(async () => { for (const server of open.splice(0)) await server.close(); });

const settle = () => new Promise((done) => { setTimeout(done, 5); });

async function setup(scopes?: string[] | Partial<HomeServerDeps>, more: Partial<HomeServerDeps> = {}) {
  if (scopes !== undefined && !Array.isArray(scopes)) return setup(undefined, scopes);
  const hub = fakeHub(scopes ? { ...camperSnapshot(), scopes } : undefined);
  const clock = { now: 0 };
  const link = createHubLink({ createClient: async () => hub, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => clock.now });
  const pairing = createPairing({ load: () => [], save: () => {}, now: () => Date.now(), token: () => randomBytes(32).toString('base64url'), code: () => '123456', fingerprint: (t) => createHash('sha256').update(t).digest('hex') });
  const layouts = createSharedLayouts({ load: () => undefined, save: () => {} });
  const looks = createSharedLooks({ load: () => undefined, save: () => {} });
  const widgets = createSharedWidgets({ load: () => undefined, save: () => {} });
  const nightClock = { now: 0 };
  const night = createNight({ load: () => undefined, save: () => {}, now: () => nightClock.now });
  const asked: string[] = [];
  const said: string[] = [];
  const hubSays = { status: 200 };
  const flowKey = createFlowKey({
    load: () => undefined, save: () => {},
    request: async (method, path) => {
      asked.push(`${method} ${path}`);
      return { status: hubSays.status, body: { scopes: ['homey.flow.start'] } };
    },
  });
  const card = { values: [] as string[], update: (): void => {}, trigger: vi.fn(async (_tokens: unknown, _state: unknown): Promise<unknown> => undefined) };
  const buttons = createButtons({
    load: () => undefined, save: () => {}, flows: () => link.snapshot()?.flows ?? [], pressTimeout: 60, now: () => clock.now, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    card: { getArgumentValues: async () => card.values.map((button) => ({ button })), on: (_event, listener) => { card.update = listener; }, registerRunListener: () => {}, trigger: card.trigger },
  });
  let ping: () => void = () => {};
  const server = createHomeServer({
    ...more,
    log: (line) => said.push(line), pairing, layouts, looks, widgets, night, flowKey, buttons, build: () => 'abc', hub: link, homeyId: () => HOMEY_ID, setInterval: (fn) => { ping = fn; return 0; }, clearInterval: () => {},
    file: async (path) => (path === '/index.html' || path === '/widget-frame.html' ? { body: new TextEncoder().encode('<mh-app></mh-app>'), type: 'text/html; charset=utf-8' } : null),
  });
  open.push(server);
  await new Promise<void>((done) => { server.server.listen(0, '127.0.0.1', () => done()); });
  const { port } = server.server.address() as AddressInfo;
  const host = `127.0.0.1:${port}`;
  link.start();
  await settle();

  /** A request as a browser sends it from a page of the server; `headers` over that. */
  async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const response = await new Promise<IncomingMessage>((done, fail) => {
      const sent = httpRequest({ host: '127.0.0.1', port, method, path, headers: { host, ...(method === 'GET' ? {} : { origin: `http://${host}`, 'content-type': 'application/json' }), ...headers } }, done);
      sent.on('error', fail);
      sent.end(body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
    });
    const parts: Buffer[] = [];
    for await (const part of response) parts.push(part as Buffer);
    const text = Buffer.concat(parts).toString('utf8');
    let value: unknown = text;
    try { value = JSON.parse(text); } catch { /* text */ }
    return { status: response.statusCode!, headers: response.headers, body: value as Record<string, unknown> };
  }
  async function paired(role: 'use' | 'edit' = 'edit', name = 'Tablet') {
    const { code } = pairing.newCode(role);
    const result = await call('POST', '/api/pair', { code, name });
    const cookie = result.headers['set-cookie']![0]!.split(';')[0]!;
    return { cookie, as: (method: string, path: string, body?: unknown) => call(method, path, body, { cookie }) };
  }
  /** Opens the live stream and collects what comes. */
  async function listen(cookie: string) {
    const events: [string, unknown][] = [];
    let ended = false;
    const response = await new Promise<IncomingMessage>((done) => { httpRequest({ host: '127.0.0.1', port, path: '/api/events', headers: { host, cookie } }, done).end(); });
    let rest = '';
    response.on('data', (part: Buffer) => {
      rest += part.toString('utf8');
      for (let at = rest.indexOf('\n\n'); at !== -1; at = rest.indexOf('\n\n')) {
        const [event = '', data = ''] = rest.slice(0, at).split('\n');
        rest = rest.slice(at + 2);
        events.push([event.replace('event: ', ''), JSON.parse(data.replace('data: ', ''))]);
      }
    });
    response.on('end', () => { ended = true; });
    await settle();
    return { events, ended: () => ended, response };
  }
  return { card, said, flowKey, asked, hubSays, night, nightClock, hub, link, pairing, layouts, looks, widgets, server, port, clock, call, paired, listen, ping: () => ping(), host };
}

test('the dashboard itself is for everyone, the rest only for paired devices', async () => {
  const s = await setup();
  const page = await s.call('GET', '/');
  expect([page.status, page.headers['content-type'], page.body]).toEqual([200, 'text/html; charset=utf-8', '<mh-app></mh-app>']);
  expect(page.headers['x-frame-options']).toBe('DENY');
  expect((await s.call('GET', '/api/session')).body).toEqual({ paired: false });
  for (const [method, path] of [['GET', '/api/snapshot'], ['GET', '/api/events'], ['GET', '/api/layouts'], ['PUT', '/api/layouts'], ['GET', '/api/looks'], ['POST', '/api/looks'], ['POST', '/api/control'], ['POST', '/api/flow'], ['POST', '/api/unpair']] as const) {
    expect([path, (await s.call(method, path, method === 'GET' ? undefined : {})).status]).toEqual([path, 401]);
  }
  expect((await s.call('GET', '/api/snapshot', undefined, { cookie: 'mh_device=nonsense' })).status).toBe(401);
  expect((await s.call('GET', '/api/nothing')).status).toBe(404);
});

test('pairing with a code gives a cookie that a script cannot read and no other site gets', async () => {
  const s = await setup();
  s.pairing.newCode('use');
  expect((await s.call('POST', '/api/pair', { code: '999999', name: 'x' })).status).toBe(403);
  const result = await s.call('POST', '/api/pair', { code: '123456', name: 'Tablet' });
  expect(result.body).toMatchObject({ device: { name: 'Tablet', role: 'use' } });
  expect(result.headers['set-cookie']![0]).toMatch(/^mh_device=[\w-]{40,}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+$/);
  const cookie = result.headers['set-cookie']![0]!.split(';')[0]!;
  expect((await s.call('GET', '/api/session', undefined, { cookie })).body).toEqual({ paired: true, device: { name: 'Tablet', role: 'use' }, homeyId: HOMEY_ID });
});

test('a page on the internet cannot reach it: the address must be of the own network, writing only from its own page', async () => {
  const s = await setup();
  const { cookie } = await s.paired();
  expect((await s.call('GET', '/', undefined, { host: 'evil.example' })).status).toBe(403);
  for (const origin of ['http://evil.example', 'null', `https://${s.host}`]) {
    expect((await s.call('POST', '/api/control', {}, { cookie, origin })).status).toBe(403);
  }
  expect((await s.call('POST', '/api/control', {}, { cookie, 'content-type': 'text/plain' })).status).toBe(415);
  for (const host of ['192.168.1.20:8790', '10.0.0.4', 'localhost:8790', 'homey-5f2a.local:8790', 'homey', '172.20.1.1', '169.254.2.3']) expect([host, isLocalHost(host)]).toEqual([host, true]);
  for (const host of [undefined, '', '8.8.8.8', 'evil.example', '192.168.1.20.evil.example', '172.32.0.1', 'a.local.evil.example', 'x.local@evil']) expect([host, isLocalHost(host)]).toEqual([host, false]);
});

test('a file outside the folder cannot be asked for', () => {
  expect([filePath('/'), filePath('/assets/main.js')]).toEqual(['/index.html', '/assets/main.js']);
  for (const path of ['/../secret', '/a/../../b', '/%2e%2e/secret', '/..%2fsecret', '/a\\..\\b', '/%00', '/%zz']) expect([path, filePath(path)]).toEqual([path, null]);
});

test('a paired device gets what the hub has now, and controls it', async () => {
  const s = await setup();
  const { as } = await s.paired('use');
  const first = await as('GET', '/api/snapshot');
  expect(first.body).toMatchObject({ route: 'local', snapshot: { homeyId: camperSnapshot().homeyId } });
  s.hub.emit({ type: 'capability', deviceId: 'device-1', capabilityId: 'onoff', value: true, at: null });
  const second = (await as('GET', '/api/snapshot')).body as { snapshot: { devices: Record<string, { capabilities: Record<string, { value: unknown }> }> } };
  expect(second.snapshot.devices['device-1']!.capabilities['onoff']!.value).toBe(true);
  expect((await as('POST', '/api/control', { deviceId: 'device-1', capabilityId: 'onoff', value: false })).status).toBe(200);
  expect(s.hub.setCapability).toHaveBeenCalledWith('device-1', 'onoff', false);
  for (const bad of [{ deviceId: 'device-1', capabilityId: 'nothing', value: 1 }, { deviceId: '__proto__', capabilityId: 'toString', value: 1 }, {}]) expect((await as('POST', '/api/control', bad)).status).toBe(404);
  expect((await as('POST', '/api/control', { deviceId: 'device-1', capabilityId: 'onoff', value: { a: 1 } })).status).toBe(400);
  s.hub.failControl = true;
  expect((await as('POST', '/api/control', { deviceId: 'device-1', capabilityId: 'onoff', value: false })).status).toBe(502);
  const flow = camperSnapshot().flows.find((f) => f.startable)!;
  expect((await as('POST', '/api/flow', { id: flow.id })).status).toBe(200);
  expect(s.hub.startFlow).toHaveBeenCalledWith(expect.objectContaining({ id: flow.id, kind: flow.kind }));
  expect((await as('POST', '/api/flow', { id: 'nothing' })).status).toBe(404);
});

test('live reports go to every paired device that listens, and a ping now and then', async () => {
  const s = await setup();
  const a = await s.paired('use', 'A');
  const b = await s.paired('edit', 'B');
  const [one, two] = [await s.listen(a.cookie), await s.listen(b.cookie)];
  expect(one.events).toEqual([['hello', { revision: 0, looks: 0, rescue: 0, widgets: 0, role: 'use', route: 'local', ready: true, night: null, build: 'abc' }]]);
  expect(two.events).toEqual([['hello', { revision: 0, looks: 0, rescue: 0, widgets: 0, role: 'edit', route: 'local', ready: true, night: null, build: 'abc' }]]);
  s.hub.emit({ type: 'capability', deviceId: 'device-1', capabilityId: 'onoff', value: true, at: null });
  s.hub.emit({ type: 'localAddress', address: '192.168.1.2' });
  s.ping();
  await settle();
  for (const stream of [one, two]) expect(stream.events.slice(1)).toEqual([['hub', { type: 'capability', deviceId: 'device-1', capabilityId: 'onoff', value: true, at: null }], ['ping', {}]]);
  one.response.destroy();
  await settle();
  expect(s.server.streams()).toBe(1);
});

test('the layouts are shared: one saves, the other hears it; an older one is refused', async () => {
  const s = await setup();
  const laptop = await s.paired('edit', 'Laptop');
  const phone = await s.paired('edit', 'Telefoon');
  const stream = await s.listen(phone.cookie);
  const layouts = { [HOMEY_ID]: hubLayout([overview([ownSection('own:a')])]) };
  expect((await laptop.as('PUT', '/api/layouts', { base: 0, layouts, sectionSeeds: { 'type:lights': '#a6422a' } })).body).toMatchObject({ revision: 1 });
  await settle();
  expect(stream.events.at(-1)).toEqual(['layouts', { revision: 1 }]);
  expect((await phone.as('GET', '/api/layouts')).body).toMatchObject({ revision: 1, layouts, sectionSeeds: { 'type:lights': '#a6422a' } });
  const late = await phone.as('PUT', '/api/layouts', { base: 0, layouts: {}, sectionSeeds: {} });
  expect([late.status, late.body]).toMatchObject([409, { revision: 1, layouts }]);
});

test('a device that may only use the dashboard cannot change the layouts', async () => {
  const s = await setup();
  const { as } = await s.paired('use');
  expect((await as('PUT', '/api/layouts', { base: 0, layouts: {}, sectionSeeds: {} })).status).toBe(403);
  expect((await as('GET', '/api/layouts')).status).toBe(200);
});

test('a device that is taken away hears it and has no access any more', async () => {
  const s = await setup();
  const { cookie, as } = await s.paired();
  const stream = await s.listen(cookie);
  s.pairing.remove(s.pairing.list()[0]!.id);
  await settle();
  expect(stream.events.at(-1)).toEqual(['unpaired', {}]);
  expect(stream.ended()).toBe(true);
  expect((await as('GET', '/api/snapshot')).status).toBe(401);
});

test('a device hears at once that it may do something else, and only that device', async () => {
  const s = await setup();
  const a = await s.paired('edit', 'A');
  const b = await s.paired('edit', 'B');
  const [one, two] = [await s.listen(a.cookie), await s.listen(b.cookie)];
  s.pairing.setRole(s.pairing.list().find((d) => d.name === 'A')!.id, 'use');
  await settle();
  expect([one.events.slice(1), two.events.slice(1), one.ended()]).toEqual([[['role', { role: 'use' }]], [], false]);
  expect((await a.as('PUT', '/api/layouts', { base: 0, layouts: {}, sectionSeeds: {} })).status).toBe(403);
  expect((await b.as('PUT', '/api/layouts', { base: 0, layouts: {}, sectionSeeds: {} })).status).toBe(200);
});

test('a right that is taken while a layout is on its way counts for that layout too', async () => {
  const s = await setup();
  const { cookie } = await s.paired('edit');
  const body = JSON.stringify({ base: 0, layouts: {}, sectionSeeds: { 'type:lights': '#a6422a' } });
  const answer = new Promise<IncomingMessage>((done, fail) => {
    const sent = httpRequest({ host: '127.0.0.1', port: s.port, method: 'PUT', path: '/api/layouts', headers: { host: s.host, origin: `http://${s.host}`, 'content-type': 'application/json', 'content-length': String(body.length), cookie } }, done);
    sent.on('error', fail);
    sent.write(body.slice(0, 10));
    setTimeout(() => {
      s.pairing.setRole(s.pairing.list()[0]!.id, 'use');
      sent.end(body.slice(10));
    }, 30);
  });
  expect((await answer).statusCode).toBe(403);
  expect(s.layouts.get()).toMatchObject({ revision: 0 });
});

test('a button that the hub does not start in time is told, and does not keep the request', async () => {
  const s = await setup();
  s.card.values = ['Film'];
  s.card.update();
  await settle();
  const { as } = await s.paired();
  s.card.trigger.mockImplementationOnce(() => new Promise(() => {}));
  expect((await as('POST', '/api/flow', { id: 'button:film' })).status).toBe(502);
});

test('a device can take itself away', async () => {
  const s = await setup();
  const { as } = await s.paired();
  const result = await as('POST', '/api/unpair', {});
  expect([result.status, result.headers['set-cookie']![0]]).toEqual([200, 'mh_device=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0']);
  expect(s.pairing.list()).toEqual([]);
});

test('too much and broken requests are refused without breaking the server', async () => {
  const s = await setup();
  const { as } = await s.paired();
  expect((await as('POST', '/api/control', 'geen json')).status).toBe(400);
  expect((await as('POST', '/api/control', '[]')).status).toBe(400);
  expect((await as('POST', '/api/control', JSON.stringify({ x: 'a'.repeat(20_000) }))).status).toBe(413);
  expect((await s.call('POST', '/', {})).status).toBe(405);
  expect((await s.call('GET', '/api/session')).status).toBe(200);
});

test('until the hub was read there is nothing to show', async () => {
  const hub = fakeHub();
  hub.failWith = new Error('away');
  const timers: (() => void)[] = [];
  const log = vi.fn();
  const link = createHubLink({ createClient: async () => hub, setTimeout: (fn) => { timers.push(fn); return 0; }, clearTimeout: () => {}, now: () => 0, log });
  link.start();
  await settle();
  expect([link.snapshot(), link.route(), timers.length]).toEqual([null, null, 1]);
  await expect(link.setCapability('device-1', 'onoff', true)).rejects.toThrow();
  // it keeps trying, and tells who listens to read everything
  const heard: unknown[] = [];
  link.subscribe((event) => heard.push(event));
  hub.failWith = null;
  timers[0]!();
  await settle();
  expect(heard).toEqual([{ type: 'route', route: 'local' }, { type: 'reset' }]);
  expect(link.snapshot()).not.toBeNull();
  // a refused token: the link is dropped and made again with a fresh client
  hub.emit({ type: 'authError' });
  expect([link.route(), timers.length]).toEqual([null, 2]);
  timers[1]!();
  await settle();
  expect(link.route()).toBe('local');
  link.stop();
  expect(link.route()).toBeNull();
});

test('only the own network is served, also when the request says it is for an address there', () => {
  for (const own of ['192.168.1.20', '10.0.0.5', '172.17.0.1', '127.0.0.1', '::ffff:192.168.1.20', '169.254.3.4']) expect([own, isLocalAddress(own)]).toEqual([own, true]);
  for (const other of ['8.8.8.8', '::ffff:8.8.8.8', '2001:db8::1', '172.32.0.1', '', undefined]) expect([other, isLocalAddress(other)]).toEqual([other, false]);
});

test('a device that is taken away gets nothing any more from that moment, also one that does not read', async () => {
  const s = await setup();
  const { cookie } = await s.paired();
  const stream = await s.listen(cookie);
  s.pairing.remove(s.pairing.list()[0]!.id);
  expect(s.server.streams()).toBe(0);
  s.hub.emit({ type: 'capability', deviceId: 'device-1', capabilityId: 'onoff', value: true, at: null });
  s.layouts.put(0, { layouts: {}, sectionSeeds: { 'type:lights': '#a6422a' } });
  s.ping();
  await settle();
  expect(stream.events.at(-1)).toEqual(['unpaired', {}]);
});

test('a request that was on its way when the device was taken away does nothing any more', async () => {
  const s = await setup();
  for (const [method, path, body] of [
    ['PUT', '/api/layouts', { base: 0, layouts: {}, sectionSeeds: { 'type:lights': '#a6422a' } }],
    ['POST', '/api/control', { deviceId: 'device-1', capabilityId: 'onoff', value: true }],
    ['POST', '/api/flow', { id: camperSnapshot().flows.find((f) => f.startable)!.id }],
  ] as const) {
    const { cookie } = await s.paired();
    const text = JSON.stringify(body);
    const status = await new Promise<number>((done, fail) => {
      const sent = httpRequest({ host: '127.0.0.1', port: s.port, method, path, headers: { host: s.host, origin: `http://${s.host}`, cookie, 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) } }, (response) => { response.resume(); done(response.statusCode!); });
      sent.on('error', fail);
      sent.write(text.slice(0, 5));
      setTimeout(() => { s.pairing.remove(s.pairing.list()[0]!.id); sent.end(text.slice(5)); }, 30);
    });
    expect([path, status]).toEqual([path, 401]);
  }
  expect([s.layouts.get().revision, s.hub.setCapability.mock.calls.length, s.hub.startFlow.mock.calls.length]).toEqual([0, 0, 0]);
});

test('a device that only listens was seen too', async () => {
  const s = await setup();
  const touch = vi.spyOn(s.pairing, 'touch');
  const { cookie } = await s.paired();
  await s.listen(cookie);
  s.ping();
  expect(touch).toHaveBeenCalledWith(s.pairing.list()[0]!.id);
});

test('the rooms and flows of the hub are read again for who opens a page, and now and then while someone looks', async () => {
  const s = await setup();
  const { cookie, as } = await s.paired();
  const { zones, flows } = s.link.snapshot()!;
  const added = { id: 'new', name: 'Nieuwe flow', kind: 'flow' as const, startable: true };
  s.hub.structure = { zones, flows: [...flows, added] };
  // nobody looks: the hub is left alone
  s.clock.now += 3_600_000;
  s.ping();
  await settle();
  expect(s.hub.readStructure).not.toHaveBeenCalled();
  const read = (await as('GET', '/api/snapshot')).body as { snapshot: { flows: { id: string }[] } };
  expect(read.snapshot.flows.map((f) => f.id)).toContain('new');
  // a moment later it is not read again
  await as('GET', '/api/snapshot');
  expect(s.hub.readStructure).toHaveBeenCalledTimes(1);

  const stream = await s.listen(cookie);
  s.ping();
  await settle();
  expect(s.hub.readStructure).toHaveBeenCalledTimes(1);
  s.hub.structure = { zones, flows };
  s.clock.now += 61_000;
  s.ping();
  await settle();
  expect(stream.events.at(-1)).toEqual(['hub', { type: 'structure', zones, flows }]);
  // the same again is no news
  s.clock.now += 61_000;
  const before = stream.events.length;
  s.ping();
  await settle();
  expect([s.hub.readStructure.mock.calls.length, stream.events.slice(before)]).toEqual([3, [['ping', {}]]]);
});

test('a hub that is slow with its flows does not keep a page waiting', async () => {
  const s = await setup();
  const { as } = await s.paired();
  s.clock.now += 3_600_000;
  s.hub.readStructure.mockImplementation(() => new Promise(() => {}));
  const started = Date.now();
  expect((await as('GET', '/api/snapshot')).status).toBe(200);
  expect(Date.now() - started).toBeLessThan(4000);
  s.hub.readStructure.mockRejectedValue(new Error('away'));
  expect((await as('GET', '/api/snapshot')).status).toBe(200);
});

test('a device that is taken away while its page waits for the hub gets nothing', async () => {
  const s = await setup();
  const { as } = await s.paired();
  s.clock.now += 3_600_000;
  let answer: (value: null) => void = () => {};
  s.hub.readStructure.mockImplementation(() => new Promise((done) => { answer = done; }));
  const asked = as('GET', '/api/snapshot');
  await vi.waitFor(() => expect(s.hub.readStructure).toHaveBeenCalled());
  s.pairing.remove(s.pairing.list()[0]!.id);
  answer(null);
  expect((await asked).status).toBe(401);
});

test('a clock that is set back does not keep the flows from being read again', async () => {
  const s = await setup();
  const { as } = await s.paired();
  s.clock.now -= 3_600_000;
  await as('GET', '/api/snapshot');
  expect(s.hub.readStructure).toHaveBeenCalledTimes(1);
});

test('what a flow says of the night goes to every paired device, and to those that come later', async () => {
  const s = await setup();
  const a = await s.paired('use', 'A');
  const one = await s.listen(a.cookie);
  s.night.set(true);
  await settle();
  expect(one.events.slice(1)).toEqual([['night', { night: true, age: 0 }]]);
  s.nightClock.now += 5000;
  const two = await s.listen(a.cookie);
  expect((two.events[0]![1] as { night: unknown }).night).toEqual({ night: true, age: 5000 });
  s.night.set(false);
  await settle();
  expect([one.events.at(-1), two.events.at(-1)]).toEqual([['night', { night: false, age: 0 }], ['night', { night: false, age: 0 }]]);
  // who is not paired hears nothing
  expect((await s.call('GET', '/api/events')).status).toBe(401);
});

// ----- starting flows with a key -----

const APP_SCOPES = ['homey.device', 'homey.zone.readonly', 'homey.flow.readonly'];
const FLOW_KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:11111111-2222-3333-4444-555555555555:0123456789abcdef';

test('with a key flows start, and the pages hear at once that they can', async () => {
  const s = await setup(APP_SCOPES);
  const { cookie, as } = await s.paired('use');
  const scopes = async () => ((await as('GET', '/api/snapshot')).body['snapshot'] as { scopes: string[] }).scopes;
  expect(await scopes()).toEqual(APP_SCOPES);
  expect((await as('GET', '/api/snapshot')).body['snapshot']).toMatchObject({ flowAccess: 'none' });
  const stream = await s.listen(cookie);
  await s.flowKey.set(FLOW_KEY);
  await settle();
  expect(stream.events.at(-1)).toEqual(['hub', { type: 'scopes', scopes: [...APP_SCOPES, 'homey.flow.start'], flowAccess: 'works' }]);
  expect(await scopes()).toEqual([...APP_SCOPES, 'homey.flow.start']);
  const flow = camperSnapshot().flows.find((f) => f.startable)!;
  expect((await as('POST', '/api/flow', { id: flow.id })).status).toBe(200);
  expect([s.asked.at(-1), s.hub.startFlow.mock.calls.length]).toEqual([`POST /api/manager/flow/${flow.kind === 'flow' ? 'flow' : 'advancedflow'}/${flow.id}/trigger`, 0]);
  // only a flow the hub has, and that can be started by hand
  const asked = s.asked.length;
  for (const id of ['nothing', '../../devices', camperSnapshot().flows.find((f) => !f.startable)?.id ?? '']) expect((await as('POST', '/api/flow', { id })).status).toBe(404);
  expect(s.asked).toHaveLength(asked);
  // and without pairing nothing at all
  expect([(await s.call('POST', '/api/flow', { id: flow.id })).status, s.asked.length]).toEqual([401, asked]);

  s.flowKey.remove();
  await settle();
  expect([stream.events.at(-1), await scopes()]).toEqual([['hub', { type: 'scopes', scopes: APP_SCOPES, flowAccess: 'none' }], APP_SCOPES]);
});

test('a key the hub no longer takes: the flow does not start, and the pages hear that they cannot', async () => {
  const s = await setup(APP_SCOPES);
  const { cookie, as } = await s.paired('edit');
  await s.flowKey.set(FLOW_KEY);
  const stream = await s.listen(cookie);
  s.hubSays.status = 401;
  const flow = camperSnapshot().flows.find((f) => f.startable)!;
  const answer = await as('POST', '/api/flow', { id: flow.id });
  await settle();
  expect([answer.status, answer.body, stream.events.at(-1)]).toEqual([502, { error: 'hub-refused' }, ['hub', { type: 'scopes', scopes: APP_SCOPES, flowAccess: 'refused' }]]);
  expect(((await as('GET', '/api/snapshot')).body['snapshot'] as { flowAccess: string }).flowAccess).toBe('refused');
  // the log of the app says why, without the key
  expect(s.said).toEqual(['Not done: The hub answered 401']);
});

test('an app that may start flows itself needs no key', async () => {
  const s = await setup(['homey']);
  const { as } = await s.paired();
  const flow = camperSnapshot().flows.find((f) => f.startable)!;
  expect((await as('POST', '/api/flow', { id: flow.id })).status).toBe(200);
  expect([s.hub.startFlow.mock.calls.length, s.asked]).toEqual([1, []]);
  await s.flowKey.set(FLOW_KEY);
  expect((await as('GET', '/api/snapshot')).body['snapshot']).toMatchObject({ scopes: ['homey'], flowAccess: 'works' });
});

test('the key itself is in nothing that a browser gets', async () => {
  const s = await setup(APP_SCOPES);
  const { cookie, as } = await s.paired('edit');
  const stream = await s.listen(cookie);
  await s.flowKey.set(FLOW_KEY);
  await settle();
  const all = [stream.events, ...(await Promise.all(['/api/session', '/api/snapshot', '/api/layouts', '/api/flow-key'].map((path) => as('GET', path))))];
  expect(JSON.stringify(all)).not.toContain(FLOW_KEY.slice(0, 20));
});

test('what a key says before the hub was read waits for that', async () => {
  const s = await setup(APP_SCOPES);
  const { cookie } = await s.paired();
  const stream = await s.listen(cookie);
  vi.spyOn(s.link, 'snapshot').mockReturnValue(null);
  await s.flowKey.set(FLOW_KEY);
  await settle();
  expect(stream.events.map(([type]) => type)).toEqual(['hello']);
});

test('the buttons come before the flows, and are pressed without a key, also by a device that may only use it', async () => {
  const s = await setup(['homey.device', 'homey.flow.readonly']);
  s.card.values = ['Welterusten', 'Film kijken'];
  s.card.update();
  const { as } = await s.paired('use', 'Tablet');
  const { flows } = (await as('GET', '/api/snapshot')).body['snapshot'] as { flows: { id: string; name: string }[] };
  expect(flows.slice(0, 2)).toEqual([{ id: 'button:film kijken', name: 'Film kijken', kind: 'flow', startable: true }, { id: 'button:welterusten', name: 'Welterusten', kind: 'flow', startable: true }]);
  expect(flows.slice(2)).toEqual(camperSnapshot().flows);
  expect((await as('POST', '/api/flow', { id: 'button:film kijken' })).status).toBe(200);
  expect(s.card.trigger.mock.calls).toEqual([[{ device: 'Tablet' }, { button: 'film kijken' }]]);
  expect([s.hub.startFlow.mock.calls.length, s.asked]).toEqual([0, []]);
  expect((await as('POST', '/api/flow', { id: 'button:weg' })).status).toBe(404);
  s.card.trigger.mockRejectedValueOnce(new Error('too many'));
  expect((await as('POST', '/api/flow', { id: 'button:film kijken' })).status).toBe(502);
  expect((await s.call('POST', '/api/flow', { id: 'button:film kijken' })).status).toBe(401);
});

test('a button that comes or goes is told at once, with everything else as it is', async () => {
  const s = await setup();
  const a = await s.paired();
  const stream = await s.listen(a.cookie);
  s.card.values = ['Film'];
  s.card.update();
  await settle();
  const last = () => stream.events.at(-1) as [string, { type: string; zones: unknown; flows: { id: string }[] }];
  expect(last()).toMatchObject(['hub', { type: 'structure', zones: camperSnapshot().zones }]);
  expect(last()[1].flows.map((f) => f.id)).toEqual(['button:film', ...camperSnapshot().flows.map((f) => f.id)]);
  // and the flows of the hub come with the buttons in front
  s.hub.emit({ type: 'structure', zones: {}, flows: [{ id: 'f9', name: 'Nieuw', kind: 'flow', startable: false, buttons: ['Nacht'], off: true }] });
  await settle();
  expect(last()[1].flows).toEqual([{ id: 'button:film', name: 'Film', kind: 'flow', startable: true }, { id: 'button:nacht', name: 'Nacht', kind: 'flow', startable: false }, { id: 'f9', name: 'Nieuw', kind: 'flow', startable: false }]);
  s.card.values = [];
  s.card.update();
  await settle();
  expect(last()[1].flows.map((f) => f.id)).toEqual(['button:nacht', 'f9']);
});

test('a page that is opened asks for the buttons as they are now', async () => {
  const s = await setup();
  const { as } = await s.paired();
  s.card.values = ['Film'];
  s.clock.now += 60_000;
  const { flows } = (await as('GET', '/api/snapshot')).body['snapshot'] as { flows: { id: string }[] };
  expect(flows[0]!.id).toBe('button:film');
});

// ----- looks -----

const A = 't-aaaaaaaaaaaaaaaa';
const avond = { format: 1, id: A, name: 'Avondlicht', maker: '', base: 'glas', seed: null, userSeed: true, knobs: {}, app: '1.1.0' };

test('the looks of the house: every paired device reads them, a device that may edit changes them, the others hear it', async () => {
  const s = await setup();
  const laptop = await s.paired('edit', 'Laptop');
  const phone = await s.paired('use', 'Telefoon');
  const stream = await s.listen(phone.cookie);
  expect(stream.events[0]![1]).toMatchObject({ looks: 0 });
  expect((await phone.as('GET', '/api/looks')).body).toEqual({ revision: 0, house: { theme: 'rustig', seed: null, mode: 'auto' }, themes: [], boards: {}, rescue: 0 });
  const done = await laptop.as('POST', '/api/looks', { ops: [{ save: avond }, { house: { theme: A, seed: null, mode: 'dark' } }] });
  expect([done.status, done.body]).toMatchObject([200, { revision: 1, house: { theme: A, mode: 'dark' }, themes: [avond] }]);
  await settle();
  expect(stream.events.at(-1)).toEqual(['looks', { revision: 1, reset: false }]);
});

test('a device that may only use cannot change the looks of the house, whatever it sends', async () => {
  const s = await setup();
  const { as } = await s.paired('use');
  expect((await as('POST', '/api/looks', { ops: [{ house: { theme: 'glas', seed: null, mode: 'dark' } }] })).body).toEqual({ error: 'use-only' });
  expect((await as('POST', '/api/looks', '{broken')).status).toBe(403);
  expect(s.looks.get().revision).toBe(0);
});

test('what is no operation is refused as a whole, and nothing changes', async () => {
  const s = await setup();
  const { as } = await s.paired('edit');
  for (const body of [{}, { ops: [] }, { ops: [{ save: avond }, { reset: true }] }, { ops: [{ house: { theme: 'glas' } }, 'x'] }]) {
    expect((await as('POST', '/api/looks', body)).status).toBe(400);
  }
  expect(s.looks.get().revision).toBe(0);
});

test('saving the layouts, as a page of 1.0.0 does, leaves the looks alone', async () => {
  const s = await setup();
  const { as } = await s.paired('edit');
  await as('POST', '/api/looks', { ops: [{ save: avond }] });
  await as('PUT', '/api/layouts', { base: 0, layouts: {}, sectionSeeds: {} });
  expect(s.looks.get().themes).toEqual([avond]);
});

test('the rescue is heard by every device, and a device that opens its stream later is told how many there were', async () => {
  const s = await setup();
  const { cookie } = await s.paired('use');
  const stream = await s.listen(cookie);
  s.looks.reset();
  await settle();
  expect(stream.events.at(-1)).toEqual(['looks', { revision: 1, reset: true }]);
  const later = await s.listen(cookie);
  expect(later.events[0]![1]).toMatchObject({ looks: 1, rescue: 1 });
});

test('history: every paired device reads the logs and their points through the app, and the hub is asked once', async () => {
  const s = await setup();
  const power = { log: 'homey:device:d1:measure_power', kind: 'device' as const, type: 'number' as const, deviceId: 'd1', capabilityId: 'measure_power' };
  const lamp = { ...power, log: 'homey:device:d1:onoff', type: 'boolean' as const, capabilityId: 'onoff' };
  s.hub.listHistory.mockResolvedValue([power, lamp]);
  s.hub.readSeries.mockResolvedValue({ start: 0, end: 1, step: 300_000, updatesIn: 60_000, points: [{ at: 0, value: null }, { at: 300_000, value: 4 }] });
  s.hub.readSwitches.mockResolvedValue({ changes: [{ at: 5, on: true }] });
  expect((await s.call('GET', '/api/history/sources')).status).toBe(401);
  const use = await s.paired('use');
  expect(await use.as('GET', '/api/history/sources')).toMatchObject({ status: 200, body: { sources: [power, lamp] } });
  // the hub was told every value it has, so it finds what the app records too
  expect(s.hub.listHistory.mock.calls[0]![0]!.length).toBeGreaterThan(10);
  const asked = `/api/history?log=${encodeURIComponent(power.log)}&period=last24Hours`;
  expect(await use.as('GET', asked)).toMatchObject({ status: 200, body: { series: { points: [{ at: 0, value: null }, { at: 300_000, value: 4 }] } } });
  await use.as('GET', asked);
  expect(s.hub.readSeries).toHaveBeenCalledTimes(1);
  expect(s.hub.readSeries).toHaveBeenCalledWith(power, 'last24Hours');
  expect(await use.as('GET', `/api/history?log=${encodeURIComponent(lamp.log)}&period=switches`)).toMatchObject({ status: 200, body: { switches: { changes: [{ at: 5, on: true }] } } });
  expect((await use.as('GET', '/api/history?log=homey%3Adevice%3Ad9%3Ax&period=today')).status).toBe(404);
  expect((await use.as('GET', `/api/history?log=${encodeURIComponent(power.log)}&period=lastHour`)).status).toBe(400);
  s.hub.readSeries.mockRejectedValue(new Error('slow'));
  expect((await use.as('GET', `/api/history?log=${encodeURIComponent(power.log)}&period=today`)).status).toBe(502);
});

// ----- own widgets -----

const gauge = { format: 'expressive-home-widget', version: 1, id: 'gauge', name: { en: 'Gauge' }, description: {}, icon: null, widgetVersion: '', sizes: ['single', 'wide'], settings: [], html: '', css: '', js: '', texts: {} };

test('the own widgets of the house: every paired device reads them, a device that may edit adds them, the others hear it', async () => {
  const s = await setup();
  const laptop = await s.paired('edit', 'Laptop');
  const phone = await s.paired('use', 'Telefoon');
  const stream = await s.listen(phone.cookie);
  expect(stream.events[0]![1]).toMatchObject({ widgets: 0 });
  expect((await phone.as('GET', '/api/widgets')).body).toEqual({ revision: 0, widgets: [] });
  const done = await laptop.as('POST', '/api/widgets', { ops: [{ add: gauge }] });
  expect([done.status, done.body]).toEqual([200, { revision: 1, widgets: [gauge] }]);
  await settle();
  expect(stream.events.at(-1)).toEqual(['widgets', { revision: 1 }]);
  expect((await phone.as('POST', '/api/widgets', { ops: [{ remove: 'gauge' }] })).body).toEqual({ error: 'use-only' });
  expect((await laptop.as('POST', '/api/widgets', { ops: [{ add: { ...gauge, id: 'Bad Id' } }] })).status).toBe(400);
  expect(s.widgets.get().revision).toBe(1);
});

test('the page of the frame of a widget may only be framed by the dashboard, and is always sandboxed', async () => {
  const s = await setup();
  const response = await fetch(`http://${s.host}/widget-frame.html`);
  expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  expect(response.headers.get('content-security-policy')).toBe('sandbox allow-scripts');
  const page = await fetch(`http://${s.host}/index.html`);
  expect(page.headers.get('x-frame-options')).toBe('DENY');
  expect(page.headers.get('content-security-policy')).toBeNull();
});

// ----- widgets of other apps -----

test('without widgets of apps the list says there is no key, and their files are not there', async () => {
  const s = await setup();
  const { as } = await s.paired('use');
  expect((await as('GET', '/api/app-widgets')).body).toEqual({ state: 'no-key', widgets: [] });
  expect((await fetch(`http://${s.host}/app-widget/com.example/today/index.html`)).status).toBe(404);
});

test('the back end of a widget of an app is only reached for a widget that stands on a dashboard', async () => {
  const s = await setup();
  const { as } = await s.paired('edit');
  expect((await as('POST', '/api/app-widget-api', { ref: 'app:com.example/today', method: 'GET', route: 'x' })).status).toBe(404);
});

test('the files Homey adds to a widget page are passed on with what a sandboxed page needs, and a page of a widget names this server', async () => {
  const s = await setup({
    appWidgets: createAppWidgets({
      keyRequest: async () => null,
      fetchFile: async (path) => ({ status: 200, type: path.endsWith('.css') ? 'text/css' : 'text/javascript', body: new TextEncoder().encode(`/* ${path} */`) }),
    }),
  });
  const script = await fetch(`http://${s.host}/widgets/js/homey.widgets.js`);
  expect([script.status, await script.text()]).toEqual([200, '/* /widgets/js/homey.widgets.js */']);
  expect(script.headers.get('access-control-allow-origin')).toBe('*');
  expect(script.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  expect((await fetch(`http://${s.host}/js/crossframe.js`)).status).toBe(200);
  expect((await fetch(`http://${s.host}/js/other.js`)).status).toBe(404);
  const page = await fetch(`http://${s.host}/app-widget/com.example/today/index.html`);
  expect(page.headers.get('content-security-policy')).toContain(`default-src http://${s.host} 'unsafe-inline'`);
  expect(page.headers.get('content-security-policy')).toMatch(/^sandbox allow-scripts;/);
});
