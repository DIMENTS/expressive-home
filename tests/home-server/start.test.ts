import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { createOwnClient, filesOf, startHomeServer, type HomeySdk } from '../../src/home-server';
import camperRaw from '../../src/mock/fixtures/camper.raw.json';
import { camperSnapshot, fakeHub, HOMEY_ID } from '../helpers/fake-hub';
import { readQr } from '../helpers/qr-reader';

const cleanup: (() => unknown)[] = [];
afterEach(async () => { for (const act of cleanup.splice(0)) await act(); });

function sdk(values: Record<string, unknown> = {}) {
  const homey: HomeySdk & { values: Record<string, unknown> } = {
    version: '13.5.5', values,
    settings: { get: (key) => values[key], set: (key, value) => { values[key] = structuredClone(value); } },
    api: { getOwnerApiToken: vi.fn(async () => 'owner-token'), getLocalUrl: vi.fn(async () => 'http://127.0.0.1:80') },
    cloud: { getHomeyId: vi.fn(async () => HOMEY_ID), getLocalAddress: vi.fn(async () => '192.168.1.20:80') },
  };
  return homey;
}

function folder() {
  const path = mkdtempSync(join(tmpdir(), 'mh-'));
  cleanup.push(() => rmSync(path, { recursive: true, force: true }));
  mkdirSync(join(path, 'public', 'assets'), { recursive: true });
  writeFileSync(join(path, 'public', 'index.html'), '<mh-app></mh-app>');
  writeFileSync(join(path, 'public', 'assets', 'main.js'), 'export {}');
  writeFileSync(join(path, 'public', 'manifest.webmanifest'), '{}');
  writeFileSync(join(path, 'secret.json'), '{}');
  return join(path, 'public');
}

test('files come from the folder only, with their type', async () => {
  const file = filesOf(folder());
  expect((await file('/index.html'))!.type).toBe('text/html; charset=utf-8');
  expect(new TextDecoder().decode((await file('/assets/main.js'))!.body)).toBe('export {}');
  expect((await file('/manifest.webmanifest'))!.type).toBe('application/manifest+json; charset=utf-8');
  for (const path of ['/../secret.json', '/assets/../../secret.json', '/nothing.js', '/assets', '/index.php', '']) expect([path, await file(path)]).toEqual([path, null]);
});

test('the app starts, shows its address, pairs and keeps that over a restart', async () => {
  const homey = sdk();
  const start = () => startHomeServer({ homey, createClient: async () => fakeHub(), folder: folder(), port: 0 });
  const app = await start();
  const base = () => `http://127.0.0.1:${app.port()}`;
  expect(await app.address()).toBe('http://192.168.1.20:0');
  const page = await fetch(`${base()}/`);
  expect([page.status, await page.text()]).toEqual([200, '<mh-app></mh-app>']);
  const { code } = app.newCode('edit');
  const pair = await fetch(`${base()}/api/pair`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base() }, body: JSON.stringify({ code, name: 'Laptop' }) });
  expect(pair.status).toBe(200);
  const cookie = pair.headers.get('set-cookie')!.split(';')[0]!;
  expect(app.devices()).toMatchObject([{ name: 'Laptop', role: 'edit' }]);
  expect(JSON.stringify(homey.values)).not.toContain(cookie.split('=')[1]);
  await app.close();

  const again = await start();
  cleanup.push(() => again.close());
  const session = await fetch(`http://127.0.0.1:${again.port()}/api/session`, { headers: { cookie } });
  expect(await session.json()).toMatchObject({ paired: true, homeyId: HOMEY_ID });
  expect(again.removeDevice(again.devices()[0]!.id)).toBe(true);
});

test('without internet the id of the hub is the one that was kept', async () => {
  const homey = sdk({ homeyId: HOMEY_ID });
  homey.cloud.getHomeyId = vi.fn(async () => { throw new Error('offline'); });
  homey.cloud.getLocalAddress = vi.fn(async () => { throw new Error('offline'); });
  const app = await startHomeServer({ homey, createClient: async () => fakeHub(), folder: folder(), port: 0 });
  cleanup.push(() => app.close());
  expect(await app.address()).toBeNull();
  const { code } = app.newCode('use');
  const base = `http://127.0.0.1:${app.port()}`;
  const pair = await fetch(`${base}/api/pair`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ code, name: 'x' }) });
  const session = await fetch(`${base}/api/session`, { headers: { cookie: pair.headers.get('set-cookie')!.split(';')[0]! } });
  expect(await session.json()).toMatchObject({ homeyId: HOMEY_ID });
});

test('the client of the app uses the local address and the token of the app, never an address on the internet', async () => {
  const made: Record<string, unknown>[] = [];
  const raw = camperRaw as unknown as Record<string, Record<string, unknown>>;
  class FakeApi {
    sessions = { getSessionMe: async () => ({ scopes: ['homey'] }) };
    devices = { getDevices: async () => raw['devices'], connect: async () => {}, on: () => {}, setCapabilityValue: vi.fn(async () => {}) };
    zones = { getZones: async () => raw['zones'] };
    system = { getInfo: async () => ({ wifiAddress: '192.168.1.20' }) };
    flow = { getFlows: async () => raw['flows'], getAdvancedFlows: async () => raw['advancedFlows'], triggerFlow: async () => {}, triggerAdvancedFlow: async () => {} };
    insights = { getLogs: async () => ({}), getLogEntries: async () => null };
    constructor(options: Record<string, unknown>) { made.push(options); }
    on() {}
    destroy() {}
  }
  const homey = sdk();
  const client = await createOwnClient(homey, FakeApi as unknown as Parameters<typeof createOwnClient>[1], HOMEY_ID);
  const snapshot = await client.connect();
  cleanup.push(() => client.disconnect());
  expect(made).toMatchObject([{ token: 'owner-token', baseUrl: 'http://127.0.0.1:80', properties: { id: HOMEY_ID, softwareVersion: '13.5.5' } }]);
  expect(snapshot.homeyId).toBe(HOMEY_ID);
  expect(Object.keys(snapshot.devices).length).toBeGreaterThan(10);
});

test('it does not wait for the internet: with a kept id it is there at once', async () => {
  const homey = sdk({ homeyId: HOMEY_ID });
  homey.cloud.getHomeyId = vi.fn(() => new Promise<string>(() => {}));
  const app = await startHomeServer({ homey, createClient: async () => fakeHub(), folder: folder(), port: 0 });
  cleanup.push(() => app.close());
  expect((await fetch(`http://127.0.0.1:${app.port()}/`)).status).toBe(200);
});

test('also without a kept id the dashboard is there; the hub follows as soon as its id is known', async () => {
  const homey = sdk();
  let answer: (id: string) => void = () => {};
  homey.cloud.getHomeyId = vi.fn(() => new Promise<string>((done) => { answer = done; }));
  const app = await startHomeServer({ homey, createClient: async () => fakeHub(), folder: folder(), port: 0 });
  cleanup.push(() => app.close());
  expect((await fetch(`http://127.0.0.1:${app.port()}/`)).status).toBe(200);
  answer(HOMEY_ID);
  await vi.waitFor(() => expect(homey.values['homeyId']).toBe(HOMEY_ID));
});

test('what goes wrong with the connection is told in the log, without the token', async () => {
  const homey = sdk({ homeyId: HOMEY_ID });
  homey.api.getLocalUrl = vi.fn(async () => 'http://10.0.0.1:80/some/path?token=owner-token');
  const log = vi.fn();
  class FakeApi {
    sessions = { getSessionMe: async () => { throw new Error('ECONNREFUSED owner-token'); } };
    on() {}
    destroy() {}
  }
  const app = await startHomeServer({ homey, HomeyAPIV3Local: FakeApi as unknown as Parameters<typeof createOwnClient>[1], folder: folder(), port: 0, log });
  cleanup.push(() => app.close());
  await vi.waitFor(() => expect(log.mock.calls.flat().join(' ')).toContain('No connection'));
  const told = log.mock.calls.flat().join(' ');
  expect(told).toContain('http://10.0.0.1:80');
  for (const secret of ['owner-token', 'some/path']) expect(told).not.toContain(secret);
});

test('what a flow said of the night outlives a restart of the app', async () => {
  const homey = sdk();
  const path = folder();
  const start = () => startHomeServer({ homey, createClient: async () => fakeHub(), folder: path, port: 0 });
  const app = await start();
  app.setNight(true);
  expect(homey.values['wallNight']).toMatchObject({ night: true });
  await app.close();
  const again = await start();
  cleanup.push(() => again.close());
  expect(again.night()).toMatchObject({ night: true });
});

test('another version of the dashboard has another mark; one that cannot be read has none', async () => {
  const path = folder();
  const start = async () => {
    const app = await startHomeServer({ homey: sdk(), createClient: async () => fakeHub(), folder: path, port: 0 });
    const build = app.build();
    await app.close();
    return build;
  };
  const first = await start();
  expect(first).toMatch(/^[0-9a-f]{16}$/);
  expect(await start()).toBe(first);
  writeFileSync(join(path, 'index.html'), '<mh-app>2</mh-app>');
  expect(await start()).not.toBe(first);
  rmSync(join(path, 'index.html'));
  expect(await start()).toBe('');
});

// ----- the key for flows -----

const FLOW_KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:11111111-2222-3333-4444-555555555555:0123456789abcdef';

/** A hub that answers over HTTP, as the local address does. */
async function httpHub(key: string) {
  const heard: { method: string; url: string; headers: IncomingHttpHeaders; body: string }[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (part: Buffer) => { body += part.toString('utf8'); });
    request.on('end', () => {
      heard.push({ method: request.method!, url: request.url!, headers: request.headers, body });
      const ok = request.headers.authorization === `Bearer ${key}`;
      response.writeHead(ok ? 200 : 401, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(!ok ? { error: 'invalid_token' } : request.method === 'GET' ? { intersectedScopes: ['homey.flow.start'] } : {}));
    });
  });
  await new Promise<void>((done) => { server.listen(0, '127.0.0.1', () => done()); });
  cleanup.push(() => new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); }));
  return { heard, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

test('the key for flows goes to the hub itself and nowhere else, also after a restart', async () => {
  const remote = await httpHub(FLOW_KEY);
  const homey = sdk({ homeyId: HOMEY_ID });
  homey.api.getLocalUrl = vi.fn(async () => remote.url);
  const log = vi.fn();
  const start = () => startHomeServer({ homey, createClient: async () => fakeHub({ ...camperSnapshot(), scopes: ['homey.device', 'homey.flow.readonly'] }), folder: folder(), port: 0, log });
  const first = await start();
  expect([first.flowKey(), await first.setFlowKey('verkeerd'), await first.setFlowKey(FLOW_KEY.replace('a', 'b'))]).toEqual(['none', 'not-a-key', 'refused']);
  expect([await first.setFlowKey(FLOW_KEY), first.flowKey()]).toEqual(['works', 'works']);
  expect(remote.heard.at(-1)).toMatchObject({ method: 'GET', url: '/api/manager/sessions/session/me', headers: { authorization: `Bearer ${FLOW_KEY}`, 'x-homey-id': HOMEY_ID } });
  await first.close();

  const app = await start();
  cleanup.push(() => app.close());
  const base = `http://127.0.0.1:${app.port()}`;
  const { code } = app.newCode('use');
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, ...headers }, body: JSON.stringify(body) });
  const cookie = (await post('/api/pair', { code, name: 'x' })).headers.get('set-cookie')!.split(';')[0]!;
  const flow = camperSnapshot().flows.find((f) => f.startable && f.kind === 'flow')!;
  expect((await post('/api/flow', { id: flow.id }, { cookie })).status).toBe(200);
  expect(remote.heard.at(-1)).toMatchObject({ method: 'POST', url: `/api/manager/flow/flow/${flow.id}/trigger`, body: '{}', headers: { authorization: `Bearer ${FLOW_KEY}`, 'content-type': 'application/json' } });
  app.removeFlowKey();
  expect([app.flowKey(), JSON.stringify(homey.values).includes(FLOW_KEY)]).toEqual(['none', false]);
  expect(JSON.stringify(log.mock.calls)).not.toContain('aaaaaaaa');
});

test('a hub that sends somewhere else does not get the key sent there', async () => {
  const elsewhere = await httpHub(FLOW_KEY);
  const server = createServer((_request, response) => { response.writeHead(302, { location: `${elsewhere.url}/api/manager/sessions/session/me` }); response.end(); });
  await new Promise<void>((done) => { server.listen(0, '127.0.0.1', () => done()); });
  cleanup.push(() => new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); }));
  const homey = sdk({ homeyId: HOMEY_ID });
  homey.api.getLocalUrl = vi.fn(async () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  const app = await startHomeServer({ homey, createClient: async () => fakeHub(), folder: folder(), port: 0 });
  cleanup.push(() => app.close());
  expect([await app.setFlowKey(FLOW_KEY), elsewhere.heard, app.flowKey()]).toEqual(['unreachable', [], 'none']);
});

test('an SDK that does not answer does not keep one waiting either', async () => {
  const homey = sdk({ homeyId: HOMEY_ID, flowKey: { key: FLOW_KEY, wide: false } });
  homey.api.getLocalUrl = vi.fn(() => new Promise<string>(() => {}));
  const app = await startHomeServer({ homey, createClient: async () => fakeHub(), folder: folder(), port: 0, hubTimeout: 50 });
  cleanup.push(() => app.close());
  expect(await app.setFlowKey(FLOW_KEY)).toBe('unreachable');
});

test('the address of the hub is asked once; after a request that failed again', async () => {
  const remote = await httpHub(FLOW_KEY);
  const homey = sdk({ homeyId: HOMEY_ID });
  const gone = createServer();
  await new Promise<void>((done) => { gone.listen(0, '127.0.0.1', () => done()); });
  const old = `http://127.0.0.1:${(gone.address() as AddressInfo).port}`;
  await new Promise<void>((done) => { gone.close(() => done()); });
  homey.api.getLocalUrl = vi.fn(async () => old);
  const app = await startHomeServer({ homey, createClient: async () => fakeHub(), folder: folder(), port: 0 });
  cleanup.push(() => app.close());
  expect(await app.setFlowKey(FLOW_KEY)).toBe('unreachable');
  homey.api.getLocalUrl = vi.fn(async () => remote.url);
  expect([await app.setFlowKey(FLOW_KEY), await app.setFlowKey(FLOW_KEY), vi.mocked(homey.api.getLocalUrl).mock.calls.length]).toEqual(['works', 'works', 1]);
});

test('the end of the waiting says nothing after an answer came', async () => {
  const remote = await httpHub(FLOW_KEY);
  const homey = sdk({ homeyId: HOMEY_ID });
  homey.api.getLocalUrl = vi.fn(async () => remote.url);
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  cleanup.push(() => process.off('unhandledRejection', unhandled));
  const app = await startHomeServer({ homey, createClient: async () => fakeHub(), folder: folder(), port: 0, hubTimeout: 300 });
  cleanup.push(() => app.close());
  expect([await app.setFlowKey(FLOW_KEY), await app.setFlowKey(FLOW_KEY)]).toEqual(['works', 'works']);
  await new Promise((done) => { setTimeout(done, 450); });
  expect(unhandled).not.toHaveBeenCalled();
});

test('a hub that does not answer does not keep one waiting', async () => {
  const server = createServer(() => {});
  await new Promise<void>((done) => { server.listen(0, '127.0.0.1', () => done()); });
  cleanup.push(() => new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); }));
  const homey = sdk({ homeyId: HOMEY_ID });
  homey.api.getLocalUrl = vi.fn(async () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  const app = await startHomeServer({ homey, createClient: async () => fakeHub(), folder: folder(), port: 0, hubTimeout: 50 });
  cleanup.push(() => app.close());
  expect(await app.setFlowKey(FLOW_KEY)).toBe('unreachable');
});

test('what the settings show for another device belongs together: the code, the address with it and the QR code', async () => {
  const app = await startHomeServer({ homey: sdk(), createClient: async () => fakeHub(), folder: folder(), port: 0 });
  cleanup.push(() => app.close());
  const made = await app.code('scan', null, false);
  expect(made).toMatchObject({ role: 'edit', address: 'http://192.168.1.20:0', link: `http://192.168.1.20:0/#pair=${made.code}` });
  expect(readQr(made.qr!)).toBe(made.link);
  expect(await app.code('scan', null, false)).toEqual(made);
  expect((await app.code('here', 'use', false)).code).not.toBe(made.code);
  expect(app.codes()).toMatchObject({ scan: { open: { serial: made.serial } }, here: { open: { role: 'use' } } });
  expect(JSON.stringify(app.codes())).not.toContain(made.code);
  expect((await app.code('scan', 'use', true)).code).not.toBe(made.code);
});

test('a hub that does not tell its address has a code all the same, without a QR code', async () => {
  const homey = sdk();
  homey.cloud.getLocalAddress = vi.fn(async () => { throw new Error('offline'); });
  const app = await startHomeServer({ homey, createClient: async () => fakeHub(), folder: folder(), port: 0 });
  cleanup.push(() => app.close());
  expect(await app.code('scan', null, false)).toMatchObject({ code: expect.stringMatching(/^\d{6}$/), address: null, link: null, qr: null });
});

test('a hub that is slow with its address has the one it had, and asks once at a time', async () => {
  const homey = sdk();
  const path = folder();
  const start = () => startHomeServer({ homey, createClient: async () => fakeHub(), folder: path, port: 0, addressTimeout: 20 });
  const app = await start();
  expect(await app.address()).toBe('http://192.168.1.20:0');
  await app.close();
  let answer: (address: string) => void = () => {};
  homey.cloud.getLocalAddress = vi.fn(() => new Promise<string>((done) => { answer = done; }));
  const again = await start();
  cleanup.push(() => again.close());
  expect(await again.address()).toBe('http://192.168.1.20:0');
  expect(await again.address()).toBe('http://192.168.1.20:0');
  expect(homey.cloud.getLocalAddress).toHaveBeenCalledOnce();
  // nobody waits for the same silence twice
  const before = performance.now();
  for (let i = 0; i < 20; i += 1) await again.address();
  expect(performance.now() - before).toBeLessThan(100);
  answer('192.168.1.30:80');
  await vi.waitFor(() => expect(homey.values['homeAddress']).toBe('192.168.1.30'));
});

test.each(['', '2001:db8::1', 'evil.example.com:80', 'a b', '8.8.8.8'])('what is no address on the own network is not shown: %s', async (address) => {
  const homey = sdk({ homeAddress: address });
  homey.cloud.getLocalAddress = vi.fn(async () => address);
  const app = await startHomeServer({ homey, createClient: async () => fakeHub(), folder: folder(), port: 0 });
  cleanup.push(() => app.close());
  expect(await app.address()).toBeNull();
});

test('the right of a device can be changed', async () => {
  const app = await startHomeServer({ homey: sdk(), createClient: async () => fakeHub(), folder: folder(), port: 0 });
  cleanup.push(() => app.close());
  const base = `http://127.0.0.1:${app.port()}`;
  const { code } = await app.code('scan', 'use', false);
  await fetch(`${base}/api/pair`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ code, name: 'Tablet' }) });
  expect(app.codes().scan.used).toMatchObject({ name: 'Tablet' });
  expect(app.setRole(app.devices()[0]!.id, 'edit')).toBe(true);
  expect(app.devices()).toMatchObject([{ name: 'Tablet', role: 'edit' }]);
});

test('the buttons come from the flow card, are there after a restart, and the settings know their names', async () => {
  let values = [{ button: 'Film kijken' }];
  const trigger = vi.fn(async () => {});
  const getTriggerCard = vi.fn(() => ({ getArgumentValues: async () => values, on: () => {}, registerRunListener: () => {}, trigger }));
  const homey: HomeySdk & { values: Record<string, unknown> } = { ...sdk(), flow: { getTriggerCard } };
  const path = folder();
  const start = () => startHomeServer({ homey, createClient: async () => fakeHub(), folder: path, port: 0 });
  const app = await start();
  expect(getTriggerCard).toHaveBeenCalledWith('dashboard_button');
  await vi.waitFor(() => expect(app.buttons()).toEqual(['Film kijken']));
  expect(homey.values['dashboardButtons']).toEqual(['Film kijken']);
  await app.close();
  values = [];
  const again = await start();
  cleanup.push(() => again.close());
  await vi.waitFor(() => expect(again.buttons()).toEqual([]));
});

test('an app without the flow card, or with one that does not work, starts all the same', async () => {
  for (const flow of [undefined, { getTriggerCard: () => { throw new Error('Invalid Flow Card ID'); } }]) {
    const app = await startHomeServer({ homey: { ...sdk(), ...(flow ? { flow } : {}) }, createClient: async () => fakeHub(), folder: folder(), port: 0 });
    cleanup.push(() => app.close());
    expect(app.buttons()).toEqual([]);
  }
});

test('a hub that was silent once is asked again later, also when asking fails at once', async () => {
  const homey = sdk();
  homey.cloud.getLocalAddress = vi.fn(() => new Promise<string>(() => {}));
  const app = await startHomeServer({ homey, createClient: async () => fakeHub(), folder: folder(), port: 0, addressTimeout: 10 });
  cleanup.push(() => app.close());
  expect(await app.address()).toBeNull();
  homey.cloud.getLocalAddress = vi.fn(() => { throw new Error('at once'); });
  await vi.waitFor(async () => { await app.address(); expect(homey.cloud.getLocalAddress).toHaveBeenCalled(); });
  homey.cloud.getLocalAddress = vi.fn(async () => '192.168.1.20:80');
  await vi.waitFor(async () => expect(await app.address()).toBe('http://192.168.1.20:0'));
});
