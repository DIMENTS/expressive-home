import { expect, test, vi } from 'vitest';
import { apiPath, createAppWidgets, filePath, homeyFilePath, normalizeAppWidgets, parseAppRef } from '../../src/home-server/app-widgets';

test('a widget of an app is named by its app and its own id, nothing else', () => {
  expect(parseAppRef('app:com.example.weather/today')).toEqual({ app: 'com.example.weather', widget: 'today' });
  for (const bad of ['app:../x/y', 'app:a/..', 'own:a', 'app:a', 'app:a/b/c', 'app:A B/c']) expect(parseAppRef(bad)).toBeNull();
});

test('only the files of that widget can be asked for', () => {
  expect(filePath('com.example.weather', 'today', 'public/index.html')).toBe('/app/com.example.weather/widgets/today/public/index.html');
  expect(filePath('com.example.weather', 'today', '')).toBe('/app/com.example.weather/widgets/today/index.html');
  for (const bad of ['../../api/manager', 'a/%2e%2e/b', 'a/%2fb', 'a\\b', 'a//b', '.hidden']) expect(filePath('com.example.weather', 'today', bad)).toBeNull();
});

test('only the routes of that widget\'s own back end, with a known method', () => {
  expect(apiPath('com.example.weather', 'today', 'GET', '/forecast')).toBe('/api/app/com.example.weather/widget/today/api/forecast');
  expect(apiPath('com.example.weather', 'today', 'PUT', 'a/b')).toBe('/api/app/com.example.weather/widget/today/api/a/b');
  for (const route of ['../../manager/devices', '/%2e%2e/x', 'a#b']) expect(apiPath('com.example.weather', 'today', 'GET', route)).toBeNull();
  expect(apiPath('com.example.weather', 'today', 'PATCH', 'a')).toBeNull();
});

test('the list of the hub becomes plain rows, whatever else it holds', () => {
  expect(normalizeAppWidgets({
    'homey:app:com.example.weather:today': { id: 'homey:app:com.example.weather:today', name: { en: 'Today', nl: 'Vandaag' }, uri: 'homey:app:com.example.weather', height: 200, secret: 'x' },
    bad: { id: 'homey:app:../x:y' },
  })).toEqual([{ ref: 'app:com.example.weather/today', name: { en: 'Today', nl: 'Vandaag' }, app: 'com.example.weather', height: 200 }]);
  expect(normalizeAppWidgets('nonsense')).toEqual([]);
});

test('without a key that may, there is no list; with one the hub is asked with it', async () => {
  const request = vi.fn(async () => ({ status: 200, body: {} }));
  expect(await createAppWidgets({ keyRequest: async () => null, fetchFile: async () => null }).list()).toEqual({ state: 'no-key', widgets: [] });
  const refused = createAppWidgets({ keyRequest: async () => ({ status: 403, body: null }), fetchFile: async () => null });
  expect(await refused.list()).toEqual({ state: 'refused', widgets: [] });
  const fine = createAppWidgets({ keyRequest: request, fetchFile: async () => null });
  expect(await fine.list()).toEqual({ state: 'ok', widgets: [] });
  expect(request).toHaveBeenCalledWith('GET', '/api/manager/dashboards/appwidget', undefined);
});

test('the files Homey adds to every widget page are passed on too, and nothing else of the hub', () => {
  expect(homeyFilePath('/js/crossframe.js')).toBe('/js/crossframe.js');
  expect(homeyFilePath('/widgets/js/homey.widgets.js')).toBe('/widgets/js/homey.widgets.js');
  expect(homeyFilePath('/widgets/css/homey.widgets.css')).toBe('/widgets/css/homey.widgets.css');
  for (const bad of ['/js/other.js', '/api/manager/devices', '/widgets/../api/x', '/widgets/%2e%2e/x', '/widgets/', '/manager/x']) expect(homeyFilePath(bad)).toBeNull();
});

test('a route of a widget may carry a query, passed on cleanly', () => {
  expect(apiPath('com.example.weather', 'today', 'GET', '/state?id=12&x=a b')).toBe('/api/app/com.example.weather/widget/today/api/state?id=12&x=a+b');
  expect(apiPath('com.example.weather', 'today', 'GET', '/state?id=%2e%2e/x')).toBe('/api/app/com.example.weather/widget/today/api/state?id=..%2Fx');
  expect(apiPath('com.example.weather', 'today', 'GET', '/../x?id=1')).toBeNull();
});

test('what a widget brings is kept: its settings, whether it picks devices, its texts and whether it is see-through', () => {
  const [row] = normalizeAppWidgets([{
    id: 'homey:app:com.example.relay:channels', name: 'Channels', transparent: true,
    settings: [
      { id: 'layout', type: 'dropdown', title: { en: 'Layout' }, value: 'sky', values: [{ id: 'sky', title: { en: 'Sky' } }, { id: 'calm', title: 'Calm' }] },
      { id: 'name', type: 'text', title: 'Name', value: '' },
      { id: 'channel', type: 'autocomplete', title: 'Channel' },
      { id: '__proto__', type: 'text', title: 'x' },
    ],
    devices: { singular: false, type: 'app' },
    locales: { en: { widget: { down: 'down' } }, nl: { widget: { down: 'omlaag' } } },
  }]);
  expect(row).toMatchObject({ transparent: true, devices: { singular: false } });
  expect(row!.settings!.map((s) => [s.id, s.type])).toEqual([['layout', 'dropdown'], ['name', 'text'], ['channel', 'autocomplete']]);
  expect(row!.settings![0]).toMatchObject({ value: 'sky', values: [{ id: 'sky', title: { en: 'Sky' } }, { id: 'calm', title: { en: 'Calm' } }] });
  expect(row!.locales).toEqual({ en: { widget: { down: 'down' } }, nl: { widget: { down: 'omlaag' } } });
});

test('the texts of a widget are the texts of its app, read once per app with the key', async () => {
  const asked: string[] = [];
  const widgets = createAppWidgets({
    keyRequest: async (_method, path) => {
      asked.push(path);
      if (path === '/api/manager/dashboards/appwidget') {
        return { status: 200, body: [
          { id: 'homey:app:nl.example.dish:dish', name: 'Dish', settings: [{ id: 'layout', type: 'dropdown', label: { en: 'Layout', nl: 'Vormgeving' }, value: 'sky', values: [{ id: 'sky', label: { nl: 'Hemelschijf' } }] }] },
          { id: 'homey:app:nl.example.dish:other', name: 'Other' },
        ] };
      }
      return path === '/api/manager/apps/app/nl.example.dish/locale' ? { status: 200, body: { widget: { up: 'omhoog' } } } : { status: 404, body: null };
    },
    fetchFile: async () => null,
  });
  const list = await widgets.list();
  expect(list.widgets.map((row) => row.locales)).toEqual([{ widget: { up: 'omhoog' } }, { widget: { up: 'omhoog' } }]);
  expect(list.widgets[0]!.settings![0]).toMatchObject({ title: { en: 'Layout', nl: 'Vormgeving' }, values: [{ id: 'sky', title: { nl: 'Hemelschijf' } }] });
  expect(asked.filter((path) => path.endsWith('/locale'))).toHaveLength(1);
});

test('the root route of a widget\'s back end can be reached too', () => {
  expect(apiPath('com.example.relay', 'channels', 'GET', '/')).toBe('/api/app/com.example.relay/widget/channels/api/');
  expect(apiPath('com.example.relay', 'channels', 'GET', '')).toBe('/api/app/com.example.relay/widget/channels/api/');
  expect(apiPath('com.example.relay', 'channels', 'GET', '/?x=1')).toBe('/api/app/com.example.relay/widget/channels/api/?x=1');
  expect(apiPath('com.example.relay', 'channels', 'POST', '/mark-all-off')).toBe('/api/app/com.example.relay/widget/channels/api/mark-all-off');
  expect(apiPath('com.example.relay', 'channels', 'GET', '//')).toBeNull();
});

test('a setting with a search list asks the hub with the key, and gives back small plain choices', async () => {
  const asked: string[] = [];
  const widgets = createAppWidgets({
    keyRequest: async (_method, path) => {
      asked.push(path);
      return { status: 200, body: [
        { name: 'Kanaal een', description: 'live', id: '123', image: 'data:image/png;base64,' + 'A'.repeat(5000), nested: { x: 1 } },
        { description: 'no name' },
      ] };
    },
    fetchFile: async () => null,
  });
  const found = await widgets.autocomplete('app:com.example.twitch/channel', 'channel', 'kan aal');
  expect(asked).toEqual(['/api/manager/dashboards/appwidget/homey%3Aapp%3Acom.example.twitch%3Achannel/autocomplete?settingId=channel&query=kan+aal']);
  expect(found).toEqual([{ name: 'Kanaal een', description: 'live', id: '123' }]);
  expect(await widgets.autocomplete('app:../x/y', 'channel', 'a')).toBeNull();
  expect(await widgets.autocomplete('app:com.example.twitch/channel', 'bad id', 'a')).toBeNull();
});
