// The app on the hub as it runs there, with a stand-in for Homey: the real server bundle over the anonymised camper.
// A second port is the hand of the test: making codes, taking devices away, and letting the hub report something.
import { createServer } from 'node:http';
import { appendFileSync, cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Module, { createRequire } from 'node:module';
import { startHomeServer } from '../homey-app/lib/server.mjs';

const [port, controlPort] = process.argv.slice(2).map(Number);
const at = (path) => fileURLToPath(new URL(path, import.meta.url));
const raw = JSON.parse(readFileSync(at('../src/mock/fixtures/camper.raw.json'), 'utf8'));
const settings = new Map();
// a copy, so a test can make another version of it
const folder = mkdtempSync(join(tmpdir(), 'mh-smoke-'));
cpSync(at('../homey-app/public'), folder, { recursive: true });
const listeners = new Map();
let refuse = false;

/** The hub itself over HTTP, as the app reaches it with the key for flows. */
const FLOW_KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:11111111-2222-3333-4444-555555555555:0123456789abcdef';
let revoked = false;
let started = [];
const local = createServer((request, response) => {
  const known = !revoked && request.headers.authorization === `Bearer ${FLOW_KEY}`;
  if (known && request.method === 'POST') started.push(request.url);
  response.writeHead(known ? 200 : 401, { 'content-type': 'application/json' });
  response.end(JSON.stringify(known && request.method === 'GET' ? { intersectedScopes: ['homey.flow.start'] } : {}));
});
await new Promise((done) => { local.listen(0, '127.0.0.1', done); });

/** The part of homey-api that the app uses, over the raw camper. */
class FakeApi {
  constructor() {
    // an app may not start flows itself
    this.sessions = { getSessionMe: async () => ({ scopes: ['homey.device', 'homey.zone.readonly', 'homey.flow.readonly', 'homey.insights.readonly', 'homey.system.readonly'] }) };
    this.devices = {
      connect: async () => {}, on: () => {},
      getDevices: async () => Object.fromEntries(Object.entries(raw.devices).map(([id, device]) => [id, { ...structuredClone(device), makeCapabilityInstance: (capability, listener) => { listeners.set(`${id}:${capability}`, listener); } }])),
      setCapabilityValue: async ({ deviceId, capabilityId, value }) => { if (refuse) throw new Error('refused'); report(deviceId, capabilityId, value); },
    };
    this.zones = { getZones: async () => raw.zones };
    this.system = { getInfo: async () => ({}) };
    this.flow = { getFlows: async () => raw.flows, getAdvancedFlows: async () => raw.advancedFlows, triggerFlow: async () => { throw new Error('missing scopes'); }, triggerAdvancedFlow: async () => { throw new Error('missing scopes'); } };
    this.insights = { getLogs: async () => ({}), getLogEntries: async () => null };
  }

  on() {}

  destroy() {}
}

function report(deviceId, capabilityId, value) {
  raw.devices[deviceId].capabilitiesObj[capabilityId].value = value;
  listeners.get(`${deviceId}:${capabilityId}`)?.(value);
}

/** The flow card of the buttons, as Homey holds it. */
let buttons = [];
let pressed = [];
let onUpdate = () => {};
let runs = () => false;
const card = {
  getArgumentValues: async () => buttons.map((button) => ({ button })),
  on: (_event, listener) => { onUpdate = listener; },
  registerRunListener: (listener) => { runs = listener; },
  trigger: async (tokens, state) => { pressed.push({ ...tokens, started: buttons.filter((button) => runs({ button }, state)) }); },
};

let app = null;
let address = async () => '127.0.0.1:80';

/** The app itself as Homey loads it, for the requests of its settings; the server in it is the one of the test. */
const load = Module._load;
Module._load = (request, ...rest) => (request === 'homey' ? { App: class {} } : request === 'homey-api' ? {} : load.call(Module, request, ...rest));
const require = createRequire(import.meta.url);
const own = new (require('../homey-app/app.js'))();
const settingsApi = require('../homey-app/api.js');
const { api: routes } = JSON.parse(readFileSync(at('../homey-app/app.json'), 'utf8'));
let refuseSettings = false;
let slowSettings = 0;

async function ofSettings(method, path, body) {
  if (slowSettings > 0) await new Promise((done) => { setTimeout(done, slowSettings); });
  if (refuseSettings) throw new Error('refused');
  for (const [name, route] of Object.entries(routes)) {
    const pattern = new RegExp(`^${route.path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`);
    const found = route.method === method ? pattern.exec(path) : null;
    if (found) return settingsApi[name]({ homey: { app: own }, params: Object.fromEntries(Object.entries(found.groups ?? {}).map(([key, value]) => [key, decodeURIComponent(value)])), body });
  }
  throw new Error(`no route ${method} ${path}`);
}

/** What Homey gives a page with settings. */
const HOMEY_JS = `
  window.opened = []; window.asked = [];
  const texts = TEXTS;
  const Homey = {
    __: (key, tokens) => Object.entries(tokens || {}).reduce((text, [name, value]) => text.replaceAll('__' + name + '__', value), key.split('.').reduce((all, part) => all && all[part], texts) ?? key),
    api: (method, path, body, done) => fetch('/settings-api', { method: 'POST', body: JSON.stringify({ method, path, body }) }).then((r) => r.json()).then((a) => done(a.error ? new Error(a.error) : null, a.result)),
    confirm: (text, _icon, done) => { window.asked.push(text); done(null, true); },
    alert: (text) => { window.asked.push(text); },
    openURL: (url) => { window.opened.push(url); },
    ready: () => {},
  };
  addEventListener('DOMContentLoaded', () => {
    for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = Homey.__(element.dataset.i18n);
    onHomeyReady(Homey);
  });
`;

async function start() {
  app = await startHomeServer({
    homey: {
      version: '13.5.5',
      settings: { get: (key) => settings.get(key), set: (key, value) => { settings.set(key, structuredClone(value)); } },
      api: { getOwnerApiToken: async () => 'token', getLocalUrl: async () => `http://127.0.0.1:${local.address().port}` },
      cloud: { getHomeyId: async () => '5f2a00000000000000000c81', getLocalAddress: () => address() },
      flow: { getTriggerCard: () => card },
    },
    HomeyAPIV3Local: FakeApi, folder, port, log: () => {}, addressTimeout: 300,
  });
  own.server = app;
}
await start();

const actions = {
  '/code': ({ role }) => app.newCode(role),
  '/getcode': ({ slot = 'scan', role = null, fresh = false }) => app.code(slot, role, fresh),
  '/address': ({ known }) => { address = known ? async () => '127.0.0.1:80' : async () => { throw new Error('offline'); }; if (!known) settings.delete('homeAddress'); return true; },
  '/slow-settings': ({ ms }) => { slowSettings = ms; return true; },
  '/refuse-settings': ({ on }) => { refuseSettings = on; return true; },
  '/devices': () => app.devices(),
  '/role': ({ name, role }) => app.setRole(app.devices().find((device) => device.name === name)?.id ?? '', role),
  '/remove': ({ name }) => app.removeDevice(app.devices().find((device) => device.name === name)?.id ?? ''),
  '/report': ({ deviceId, capabilityId, value }) => { report(deviceId, capabilityId, value); return true; },
  '/refuse': ({ on }) => { refuse = on; return true; },
  '/flow': ({ name }) => { raw.flows['smoke-flow'] = { ...structuredClone(Object.values(raw.flows)[0]), id: 'smoke-flow', name }; return true; },
  '/unflow': () => { delete raw.flows['smoke-flow']; return true; },
  '/buttons': ({ names }) => { buttons = names; onUpdate(); return true; },
  '/pressed': () => pressed,
  '/reset': () => { buttons = []; pressed = []; settings.delete('dashboardButtons'); settings.delete('sharedLayouts'); settings.delete('wallNight'); settings.delete('flowKey'); revoked = false; started = []; return true; },
  '/flowkey': async ({ key }) => ({ result: await app.setFlowKey(key ?? FLOW_KEY) }),
  '/unflowkey': () => { app.removeFlowKey(); return true; },
  '/revoke': () => { revoked = true; return true; },
  '/started': () => started,
  '/night': ({ on }) => { app.setNight(on); return true; },
  '/rebuild': () => { appendFileSync(join(folder, 'index.html'), '<!-- another version -->'); return true; },
  '/stop': async () => { await app.close(); return true; },
  '/start': async () => { await start(); return true; },
};
createServer(async (request, response) => {
  let body = '';
  for await (const part of request) body += part;
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/settings/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(readFileSync(at('../homey-app/settings/index.html'), 'utf8').replace('/homey.js', `/homey.js?lang=${url.searchParams.get('lang') ?? 'nl'}`));
    return;
  }
  if (url.pathname === '/homey.js') {
    const language = url.searchParams.get('lang') === 'en' ? 'en' : 'nl';
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    response.end(HOMEY_JS.replace('TEXTS', () => readFileSync(at(`../homey-app/locales/${language}.json`), 'utf8')));
    return;
  }
  if (url.pathname === '/settings-api') {
    const { method, path, body: sent } = JSON.parse(body);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(await ofSettings(method, path, sent).then((result) => ({ result }), (error) => ({ error: error.message }))));
    return;
  }
  const act = actions[request.url];
  response.writeHead(act ? 200 : 404, { 'content-type': 'application/json' });
  response.end(JSON.stringify(act ? await act(body ? JSON.parse(body) : {}) : null));
}).listen(controlPort, '127.0.0.1');
