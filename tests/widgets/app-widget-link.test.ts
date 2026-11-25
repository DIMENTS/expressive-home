import { expect, test } from 'vitest';
import { appInitialData, appWidgetList, APP_DEVICES } from '../../src/widgets/app-widget-link';

const row = {
  ref: 'app:com.example.relay/channels', app: 'com.example.relay', name: { en: 'Channels' }, transparent: true, devices: { singular: false },
  settings: [{ id: 'layout', type: 'dropdown', title: { en: 'Layout' }, value: 'sky' }],
  locales: { en: { widget: { down: 'down' } }, nl: { widget: { down: 'omlaag' } } },
};

test('Homey\'s own script gets what it asks for: settings with defaults, chosen devices, texts in the language, dark or light', () => {
  expect(appInitialData(row, { layout: 'calm', [APP_DEVICES]: 'a,b' }, 'nl', true)).toEqual({
    settings: { layout: 'calm' }, deviceIds: ['a', 'b'], transparent: true, locales: { widget: { down: 'omlaag' } }, language: 'nl', devmode: false, fontScale: 1, isDarkMode: true,
  });
  expect(appInitialData(row, {}, 'de', false)).toMatchObject({ settings: { layout: 'sky' }, deviceIds: [], locales: { widget: { down: 'down' } }, isDarkMode: false });
  expect(appInitialData(undefined, {}, 'en', false)).toMatchObject({ settings: {}, locales: {}, transparent: false });
});

test('the list keeps settings, devices and texts of a widget, and drops what is odd', async () => {
  const list = await appWidgetList(async () => ({ state: 'ok', widgets: [row, { ref: 'app:../x/y', app: 'x' }] }));
  expect(list.widgets).toHaveLength(1);
  expect(list.widgets[0]).toMatchObject({ devices: { singular: false }, transparent: true, settings: [{ id: 'layout', value: 'sky' }] });
});

test('a choice from a search list is kept as text with the tile, and given to the widget as the object it was', () => {
  const twitch = { ...row, settings: [{ id: 'channel', type: 'autocomplete', title: { en: 'Channel' } }] };
  const data = appInitialData(twitch, { channel: JSON.stringify({ name: 'Kanaal een', id: '123' }) }, 'nl', true);
  expect(data['settings']).toEqual({ channel: { name: 'Kanaal een', id: '123' } });
  expect(appInitialData(twitch, { channel: 'not json' }, 'nl', true)['settings']).toEqual({ channel: null });
});
