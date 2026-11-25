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
/** A key that may do everything, for the widgets of other apps; and one widget of an app, as Homey serves it. */
const WIDE_KEY = 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee:11111111-2222-3333-4444-555555555555:0123456789abcdef';
const APP_WIDGET_PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body><p id="out">…</p><script>
  var id = 0, waiting = {};
  function hex(s) { var h = ''; for (var i = 0; i < s.length; i++) h += ('000' + s.charCodeAt(i).toString(16)).slice(-4); return h; }
  function unhex(h) { var s = ''; for (var i = 0; i < h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return s; }
  function emit(event, data) { return new Promise(function (done) { id += 1; waiting[id] = done; parent.postMessage('CF2_MESSAGE' + hex(JSON.stringify({ type: 'tx', event: event, data: data, callbackId: id })), '*'); }); }
  window.addEventListener('message', function (e) { if (typeof e.data !== 'string' || e.data.indexOf('CF2_MESSAGE') !== 0) return; var m = JSON.parse(unhex(e.data.slice(11))); if (m.type === 'cb' && waiting[m.callbackId]) waiting[m.callbackId](m.args); });
  var word = '?';
  emit('getInitialData').then(function (args) {
    var data = args[1] || {};
    word = (data.locales && data.locales.today) || '?';
    if (data.settings && data.settings.city && data.settings.city.name) word = word + ' in ' + data.settings.city.name;
    if (location.search.indexOf('widgetInstanceId=') === -1 || typeof data.isDarkMode !== 'boolean') word = 'fout';
    return emit('api', { method: 'GET', path: '/forecast?when=today' });
  }).then(function (args) {
    document.getElementById('out').textContent = args[0] ? 'fout' : word + ' ' + args[1].temp + ' graden';
    emit('setHeight', 120); emit('ready');
  });
</script></body></html>`;
const local = createServer((request, response) => {
  const url = request.url ?? '';
  if (url === '/app/com.example.weather/widgets/today/index.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(APP_WIDGET_PAGE);
    return;
  }
  if (request.headers.authorization === `Bearer ${WIDE_KEY}`) {
    const answers = {
      '/api/manager/sessions/session/me': { intersectedScopes: ['homey'] },
      '/api/manager/dashboards/appwidget': { 'homey:app:com.example.weather:today': { id: 'homey:app:com.example.weather:today', name: { en: 'Weather today', nl: 'Weer vandaag' }, uri: 'homey:app:com.example.weather', locales: { en: { today: 'Today' }, nl: { today: 'Vandaag' } }, settings: [{ id: 'city', type: 'autocomplete', title: { en: 'City', nl: 'Stad' } }] } },
      '/api/manager/dashboards/appwidget/homey%3Aapp%3Acom.example.weather%3Atoday/autocomplete?settingId=city&query=Utr': [{ name: 'Utrecht', id: 'ut', image: 'data:x' }],
      '/api/app/com.example.weather/widget/today/api/forecast?when=today': { temp: 7 },
    };
    response.writeHead(url in answers ? 200 : 404, { 'content-type': 'application/json' });
    response.end(JSON.stringify(answers[url] ?? {}));
    return;
  }
  const known = !revoked && request.headers.authorization === `Bearer ${FLOW_KEY}`;
  if (known && request.method === 'POST') started.push(request.url);
  response.writeHead(known ? 200 : 401, { 'content-type': 'application/json' });
  response.end(JSON.stringify(known && request.method === 'GET' ? { intersectedScopes: ['homey.flow.start'] } : {}));
});
await new Promise((done) => { local.listen(0, '127.0.0.1', done); });

/** The logs this app made in Insights, as the hub keeps them: id, type and entries. */
const ownLogs = new Map();
const OWN_URI = 'homey:app:app.expressive.home';
const logHandle = (id) => ({ id, createEntry: async (value, date) => { ownLogs.get(id).entries.push({ t: (date ?? new Date()).toISOString(), v: value }); } });
/** The part of `this.homey.insights` that the app uses. */
const sdkInsights = {
  createLog: async (id, { type }) => { if (ownLogs.has(id)) throw new Error('Log already exists'); ownLogs.set(id, { type, entries: [] }); return logHandle(id); },
  getLog: async (id) => { if (!ownLogs.has(id)) throw Object.assign(new Error('Log not found'), { statusCode: 404 }); return logHandle(id); },
  deleteLog: async (log) => { ownLogs.delete(log.id); },
};

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
    this.insights = {
      getLogs: async () => Object.fromEntries([...ownLogs].map(([id, log]) => [id, { id: `${OWN_URI}:${id}`, ownerUri: OWN_URI, type: log.type }])),
      getLogEntries: async ({ id }) => { const own = ownLogs.get(id.split(':').at(-1)); return own ? { values: own.entries } : null; },
    };
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
      insights: sdkInsights,
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
  '/reset': () => { buttons = []; pressed = []; settings.delete('dashboardButtons'); settings.delete('sharedLayouts'); settings.delete('sharedLooks'); settings.delete('wallNight'); settings.delete('flowKey'); revoked = false; started = []; return true; },
  '/flowkey': async ({ key }) => ({ result: await app.setFlowKey(key ?? FLOW_KEY) }),
  '/unflowkey': () => { app.removeFlowKey(); return true; },
  '/widekey': async () => ({ result: await app.setFlowKey(WIDE_KEY) }),
  '/revoke': () => { revoked = true; return true; },
  '/started': () => started,
  '/night': ({ on }) => { app.setNight(on); return true; },
  '/theme': ({ id }) => app.setHouseTheme(id),
  '/mode': ({ mode }) => { app.setHouseMode(mode); return true; },
  '/looks-reset': () => { app.resetLooks(); return true; },
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
