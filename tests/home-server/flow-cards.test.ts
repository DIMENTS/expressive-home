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
  const listeners = new Map<string, () => Promise<unknown>>();
  Object.assign(app, {
    log: () => {}, error: () => {},
    homey: { __: (key: string) => key, flow: { getActionCard: (id: string) => ({ registerRunListener: (listener: () => Promise<unknown>) => { listeners.set(id, listener); } }) } },
  });
  return { app, listeners };
}

test('every card has a title in both languages and an id of its own', () => {
  const { actions } = manifest.flow;
  expect(actions.map((card) => card.id)).toEqual(['night_on', 'night_off']);
  expect(actions.map((card) => card.title)).toEqual([
    { en: 'Switch the wall tablets to night', nl: 'Zet de wandtablets op nacht' }, { en: 'End the night on the wall tablets', nl: 'Haal de wandtablets uit de nacht' },
  ]);
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
