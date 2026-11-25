import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BUTTON_CARD } from '../../src/homey/buttons';

// The flow cards of the app on the hub: what app.json promises, app.js does.

interface Card { id: string; title: Record<string, string>; titleFormatted?: Record<string, string>; hint?: Record<string, string>; args?: { type: string; name: string }[]; tokens?: { name: string; type: string }[] }
const manifest = JSON.parse(readFileSync('homey-app/app.json', 'utf8')) as { flow: { actions: Card[]; triggers: Card[] } };

type Loader = { _load(request: string, ...rest: unknown[]): unknown };
const loader = Module as unknown as Loader;
const original = loader._load;
class App {}
beforeEach(() => {
  loader._load = (request, ...rest) => (request === 'homey' ? { App } : request === 'homey-api' ? {} : original.call(loader, request, ...rest));
});
afterEach(() => { loader._load = original; });

/** The app as Homey starts it, with a server that could not start. */
async function start() {
  const path = `${process.cwd()}/homey-app/app.js`;
  const require = createRequire(path);
  delete require.cache[require.resolve(path)];
  const MaterialApp = require(path) as new () => Record<string, unknown> & { onInit(): Promise<void>; server: unknown };
  const app = new MaterialApp();
  const listeners = new Map<string, (args?: Record<string, unknown>) => Promise<unknown>>();
  const autocomplete = new Map<string, (query: string) => Promise<unknown>>();
  Object.assign(app, {
    log: () => {}, error: () => {},
    homey: { __: (key: string) => key, flow: { getActionCard: (id: string) => ({
      registerRunListener: (listener: (args?: Record<string, unknown>) => Promise<unknown>) => { listeners.set(id, listener); },
      registerArgumentAutocompleteListener: (_name: string, listener: (query: string) => Promise<unknown>) => { autocomplete.set(id, listener); },
    }) } },
  });
  return { app, listeners, autocomplete };
}

test('every card has a title in both languages and an id of its own', () => {
  const { actions } = manifest.flow;
  expect(actions.map((card) => card.id)).toEqual(['night_on', 'night_off', 'theme_set', 'mode_set']);
  expect(actions.map((card) => card.title)).toEqual([
    { en: 'Switch the wall tablets to night', nl: 'Zet de wandtablets op nacht' }, { en: 'End the night on the wall tablets', nl: 'Haal de wandtablets uit de nacht' },
    { en: 'Set the theme of the house', nl: 'Zet het thema van het huis' }, { en: 'Set light or dark for the house', nl: 'Zet licht of donker voor het huis' },
  ]);
  expect(actions[2]).toMatchObject({ titleFormatted: { en: 'Set the theme of the house to [[theme]]', nl: 'Zet het thema van het huis op [[theme]]' }, args: [{ type: 'autocomplete', name: 'theme' }] });
  expect(actions[3]).toMatchObject({ titleFormatted: { en: 'Set the house to [[mode]]', nl: 'Zet het huis op [[mode]]' }, args: [{ type: 'dropdown', name: 'mode' }] });
  expect((actions[3]!.args![0] as unknown as { values: { id: string }[] }).values.map((value) => value.id)).toEqual(['light', 'dark', 'auto']);
});

test('every card does what it says', async () => {
  const { app, listeners } = await start();
  await app.onInit();
  expect([...listeners.keys()].sort()).toEqual(manifest.flow.actions.map((card) => card.id).sort());
  const setNight = vi.fn();
  app.server = { setNight };
  expect(await listeners.get('night_on')!()).toBe(true);
  expect(await listeners.get('night_off')!()).toBe(true);
  expect(setNight.mock.calls).toEqual([[true], [false]]);
});

test('the theme cards change the house, offer its themes, and say when a theme is gone', async () => {
  const { app, listeners, autocomplete } = await start();
  await app.onInit();
  const setHouseTheme = vi.fn((id: string) => id !== 't-gone000000000000');
  const setHouseMode = vi.fn();
  const themeChoices = vi.fn((query: string) => [{ id: 'glas', name: `Glas ${query}` }]);
  app.server = { setHouseTheme, setHouseMode, themeChoices };
  expect(await autocomplete.get('theme_set')!('av')).toEqual([{ id: 'glas', name: 'Glas av' }]);
  expect(await listeners.get('theme_set')!({ theme: { id: 'glas', name: 'Glas' } })).toBe(true);
  await expect(listeners.get('theme_set')!({ theme: { id: 't-gone000000000000', name: 'Weg' } })).rejects.toThrow('flow.themeGone');
  expect(await listeners.get('mode_set')!({ mode: 'dark' })).toBe(true);
  await expect(listeners.get('mode_set')!({ mode: 'night' })).rejects.toThrow();
  expect([setHouseTheme.mock.calls, setHouseMode.mock.calls]).toEqual([[['glas'], ['t-gone000000000000']], [['dark']]]);
  for (const language of ['nl', 'en']) expect((JSON.parse(readFileSync(`homey-app/locales/${language}.json`, 'utf8')) as { flow: { themeGone: string } }).flow.themeGone).not.toBe('');
});

test('a card of an app that could not start says so', async () => {
  const { app, listeners } = await start();
  await app.onInit();
  app.server = null;
  await expect(listeners.get('night_on')!()).rejects.toThrow('flow.notRunning');
  for (const language of ['nl', 'en']) expect((JSON.parse(readFileSync(`homey-app/locales/${language}.json`, 'utf8')) as { flow: { notRunning: string } }).flow.notRunning).not.toBe('');
});

test('the card of a button is what the server asks for, with a name that somebody fills in', () => {
  const [card, ...rest] = manifest.flow.triggers;
  expect(rest).toEqual([]);
  expect(card).toMatchObject({
    id: BUTTON_CARD, args: [{ type: 'text', name: 'button' }], tokens: [{ name: 'device', type: 'string' }],
    title: { en: 'A dashboard button was pressed', nl: 'Er is op een dashboardknop gedrukt' },
    titleFormatted: { en: 'Dashboard button [[button]] was pressed', nl: 'Er is op de dashboardknop [[button]] gedrukt' },
  });
  // as the store asks of a card: short, without its own column in it, and with a word of explanation
  for (const language of ['en', 'nl']) {
    for (const text of [card!.title[language]!, card!.titleFormatted![language]!]) {
      expect(text.length).toBeLessThan(60);
      expect(text).not.toMatch(/\b(?:when|and|then|als|en|dan)\b|[()]/i);
    }
    expect(card!.hint![language]!.length).toBeGreaterThan(20);
  }
});
