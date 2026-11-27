import { createHash, randomBytes } from 'node:crypto';
import { afterEach, expect, test } from 'vitest';
import { createDocuments } from '../../src/home-server/documents';
import { createDoor } from '../../src/home-server/door';
import { createPairing } from '../../src/home-server/pairing';
import { createSharedLayouts } from '../../src/home-server/shared-layouts';
import { createSharedLooks } from '../../src/home-server/shared-looks';
import { createSharedWidgets } from '../../src/home-server/shared-widgets';
import { createDoorLink, POLL_MS } from '../../src/served/door-link';
import { createServedStore, KEY_SAVE_EVERY_MS } from '../../src/served/store';
import { STORAGE_KEY } from '../../src/storage/local-store';
import { createDefaultConfig, type AppConfig } from '../../src/storage/config';
import { SHARED_FORMAT } from '../../src/sync/protocol';
import { board, hubLayout, overview, ownSection, sensorTile } from '../helpers/layout';

// A page with a key that is paired with the app on its hub: the key and the settings of this device stay in this browser,
// the dashboards are the hub's, and a copy of them stays here for when the hub cannot be reached.

const HOMEY = '5f2a00000000000000000c81';
const timers: { at: number; fn: () => void; id: number }[] = [];
let now = 0;
let ids = 0;
afterEach(() => { timers.length = 0; now = 0; });
async function tick(ms: number): Promise<void> {
  now += ms;
  for (let guard = 0; guard < 1000; guard += 1) {
    const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    timers.splice(timers.indexOf(due), 1);
    due.fn();
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  }
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function memory(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); }, clear: () => map.clear(), key: () => null, length: 0 } as Storage & { map: Map<string, string> };
}

function hub() {
  const pairing = createPairing({ load: () => [], save: () => {}, now: () => now, token: () => randomBytes(32).toString('base64url'), code: () => '123456', awayCode: () => String(10_000_000 + Math.floor(Math.random() * 89_999_999)), fingerprint: (t) => createHash('sha256').update(t).digest('hex') });
  const layouts = createSharedLayouts({ load: () => undefined, save: () => {} });
  const looks = createSharedLooks({ load: () => undefined, save: () => {} });
  const widgets = createSharedWidgets({ load: () => undefined, save: () => {} });
  const door = createDoor({ pairing, documents: createDocuments({ layouts, looks, widgets }), now: () => now, boot: 'b1' });
  let reachable = true;
  return { pairing, layouts, door, reach: (on: boolean) => { reachable = on; }, reachable: () => reachable };
}

async function phone(house: ReturnType<typeof hub>, role: 'use' | 'edit', storage = memory(), stored?: Partial<AppConfig>) {
  const config: AppConfig = { ...createDefaultConfig(), connection: { homeyId: HOMEY, localAddress: null, apiKey: 'de-sleutel' }, ...stored };
  if (!storage.map.has(STORAGE_KEY)) storage.setItem(STORAGE_KEY, JSON.stringify(config));
  let token: string | null = storage.getItem('test.token');
  if (token === null) {
    const { code } = house.pairing.openAwayCode(role);
    token = (house.door.handle({ call: 'pair', code, name: 'Telefoon' }) as { token: string }).token;
    storage.setItem('test.token', token);
  }
  const link = createDoorLink({
    fetch: async (_url, init) => {
      if (!house.reachable()) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify(house.door.handle(JSON.parse(init!.body as string))), { status: 200 });
    },
    base: () => 'https://hub.example', token: () => storage.getItem('test.token'),
    keepToken: (next) => { if (next === null) storage.removeItem('test.token'); else storage.setItem('test.token', next); },
    setTimeout: (fn, ms) => { timers.push({ at: now + ms, fn, id: (ids += 1) }); return ids; },
    clearTimeout: (handle) => { const at = timers.findIndex((t) => t.id === handle); if (at >= 0) timers.splice(at, 1); },
    now: () => now,
  });
  let unpaired = 0;
  let conflicts = 0;
  const gone: string[] = [];
  const refused: string[] = [];
  const served = createServedStore(storage, link, { key: { paired: () => storage.getItem('test.token') !== null, forgetPairing: () => storage.removeItem('test.token') } });
  served.onUnpaired((by) => { unpaired += 1; gone.push(by); });
  served.onConflict(() => { conflicts += 1; });
  served.onRefused((why) => { refused.push(why); });
  const release = link.hold();
  return { served, link, storage, release, unpaired: () => unpaired, gone, refused, conflicts: () => conflicts, kept: () => JSON.parse(storage.getItem(STORAGE_KEY)!) as AppConfig };
}

const layoutWith = (name: string) => ({ [HOMEY]: hubLayout([overview(null)], { names: { a: name } }) });
/** Arranged: a dashboard of its own, by name. */
const arrangedAs = (name: string) => ({ [HOMEY]: hubLayout([overview(null), board(`d-${name.replace(/\W/g, '')}`, [ownSection(`own:${name.replace(/\W/g, '')}`, [sensorTile(`t-${name.replace(/\W/g, '')}`, 'device-1')])], { name })]) });

test('the key and the settings of this device stay here; the dashboards are the hub\'s, and a copy stays here', async () => {
  const house = hub();
  house.layouts.put(0, { layouts: layoutWith('van de Homey'), sectionSeeds: {} });
  const p = await phone(house, 'use', undefined, { layouts: layoutWith('van de telefoon'), language: 'en' });
  const config = await p.served.store.load();
  expect(config.connection).toEqual({ homeyId: HOMEY, localAddress: null, apiKey: 'de-sleutel' });
  expect(config.language).toBe('en');
  expect(config.layouts[HOMEY]!.names).toEqual({ a: 'van de Homey' });
  await tick(0);
  expect(p.kept().layouts[HOMEY]!.names).toEqual({ a: 'van de Homey' });
  expect(p.kept().connection.apiKey).toBe('de-sleutel');
  expect(p.served.mayArrange()).toBe(false);
});

test('a change on the hub comes in at the next look', async () => {
  const house = hub();
  const p = await phone(house, 'use');
  await p.served.store.load();
  let changes = 0;
  p.served.onChanged(() => { changes += 1; });
  await tick(0);
  house.layouts.put(house.layouts.get().revision, { layouts: layoutWith('nieuw'), sectionSeeds: {} });
  await tick(POLL_MS);
  expect(changes).toBeGreaterThan(0);
  expect((await p.served.store.load()).layouts[HOMEY]!.names).toEqual({ a: 'nieuw' });
});

test('a device that may arrange saves on the hub, not more often than every two seconds, with the shape of the documents', async () => {
  const house = hub();
  const p = await phone(house, 'edit');
  const config = await p.served.store.load();
  await tick(0);
  expect(p.served.mayArrange()).toBe(true);
  await p.served.store.save({ ...config, layouts: layoutWith('een'), sectionSeeds: {} });
  await tick(0);
  await p.served.store.save({ ...config, layouts: layoutWith('twee'), sectionSeeds: {} });
  await tick(KEY_SAVE_EVERY_MS / 2);
  expect(house.layouts.get().layouts[HOMEY]?.names).toEqual({ a: 'een' });
  await tick(KEY_SAVE_EVERY_MS);
  expect(house.layouts.get().layouts[HOMEY]?.names).toEqual({ a: 'twee' });
  expect(SHARED_FORMAT).toBe(1);
});

test('a device that may only use saves nothing on the hub', async () => {
  const house = hub();
  const p = await phone(house, 'use');
  const config = await p.served.store.load();
  await tick(0);
  await p.served.store.save({ ...config, layouts: layoutWith('stiekem'), sectionSeeds: {} });
  await tick(KEY_SAVE_EVERY_MS * 2);
  expect(house.layouts.get().revision).toBe(0);
});

test('without the hub the copy here is shown, and nothing can be arranged until the hub is there', async () => {
  const house = hub();
  house.layouts.put(0, { layouts: layoutWith('van de Homey'), sectionSeeds: {} });
  const storage = memory();
  const first = await phone(house, 'edit', storage);
  await first.served.store.load();
  await tick(0);
  first.release();
  house.reach(false);
  const again = await phone(house, 'edit', storage);
  const config = await again.served.store.load();
  expect(config.layouts[HOMEY]!.names).toEqual({ a: 'van de Homey' });
  expect(again.served.mayArrange()).toBe(false);
  house.reach(true);
  await tick(POLL_MS);
  expect(again.served.mayArrange()).toBe(true);
});

test('two devices that arrange at the same time: the one that came too late hears it, as at home', async () => {
  const house = hub();
  const a = await phone(house, 'edit');
  const b = await phone(house, 'edit', memory());
  const [ca, cb] = [await a.served.store.load(), await b.served.store.load()];
  await tick(0);
  await a.served.store.save({ ...ca, layouts: arrangedAs('A'), sectionSeeds: {} });
  await tick(KEY_SAVE_EVERY_MS);
  await b.served.store.save({ ...cb, layouts: arrangedAs('B'), sectionSeeds: {} });
  await tick(KEY_SAVE_EVERY_MS);
  expect(b.conflicts()).toBe(1);
  expect(house.layouts.get().revision).toBeGreaterThanOrEqual(1);
});

test('taken away on the hub: it says so, forgets the pairing, and the copy stays here as its own', async () => {
  const house = hub();
  house.layouts.put(0, { layouts: layoutWith('laatst bekend'), sectionSeeds: {} });
  const p = await phone(house, 'use');
  await p.served.store.load();
  await tick(0);
  for (const device of house.pairing.list()) house.pairing.remove(device.id);
  await tick(POLL_MS);
  expect(p.unpaired()).toBe(1);
  expect(p.storage.getItem('test.token')).toBeNull();
  expect(p.kept().layouts[HOMEY]!.names).toEqual({ a: 'laatst bekend' });
});

test('breaking the connection also takes this device off the hub, and forgets the pairing', async () => {
  const house = hub();
  const p = await phone(house, 'use');
  await p.served.store.load();
  await tick(0);
  const cleared = await p.served.store.clearConnection!();
  expect(cleared.connection.apiKey).toBeNull();
  expect(house.pairing.list()).toEqual([]);
  expect(p.storage.getItem('test.token')).toBeNull();
});

test('taken away on the hub while the page was closed: it is told at once, the copy here stays', async () => {
  const house = hub();
  house.layouts.put(0, { layouts: layoutWith('laatst bekend'), sectionSeeds: {} });
  const storage = memory();
  const first = await phone(house, 'use', storage);
  await first.served.store.load();
  await tick(0);
  first.release();
  for (const device of house.pairing.list()) house.pairing.remove(device.id);
  const again = await phone(house, 'use', storage);
  await again.served.store.load();
  expect(again.gone).toEqual(['hub']);
  expect(again.kept().layouts[HOMEY]!.names).toEqual({ a: 'laatst bekend' });
});

test('breaking the connection here is told too, so the page starts anew without the hub', async () => {
  const house = hub();
  const p = await phone(house, 'use');
  await p.served.store.load();
  await tick(0);
  await p.served.store.clearConnection!();
  expect(p.gone).toEqual(['here']);
});

test('a change that did not reach the hub before the page closed goes there when it opens again', async () => {
  const house = hub();
  const storage = memory();
  const first = await phone(house, 'edit', storage);
  const config = await first.served.store.load();
  await tick(0);
  house.reach(false);
  await first.served.store.save({ ...config, layouts: arrangedAs('onderweg'), sectionSeeds: {} });
  await tick(KEY_SAVE_EVERY_MS);
  first.release();
  // the page is closed: nothing of it goes on
  timers.length = 0;
  house.reach(true);
  const again = await phone(house, 'edit', storage);
  await again.served.store.load();
  await tick(KEY_SAVE_EVERY_MS * 2);
  expect(house.layouts.get().revision).toBe(1);
  expect(again.conflicts()).toBe(0);
});

test('when another device saved in between, that change is not lost without a word', async () => {
  const house = hub();
  const storage = memory();
  const first = await phone(house, 'edit', storage);
  const config = await first.served.store.load();
  await tick(0);
  house.reach(false);
  await first.served.store.save({ ...config, layouts: arrangedAs('onderweg'), sectionSeeds: {} });
  await tick(KEY_SAVE_EVERY_MS);
  first.release();
  // the page is closed: nothing of it goes on
  timers.length = 0;
  house.reach(true);
  house.layouts.put(0, { layouts: arrangedAs('thuis'), sectionSeeds: {} });
  const again = await phone(house, 'edit', storage);
  await again.served.store.load();
  await tick(KEY_SAVE_EVERY_MS * 2);
  expect(again.conflicts()).toBe(1);
});

test('a change that is too big for the hub is said so, not promised for later', async () => {
  const house = hub();
  const p = await phone(house, 'edit');
  const config = await p.served.store.load();
  await tick(0);
  const huge = { [HOMEY]: hubLayout([overview(null)], { names: Object.fromEntries(Array.from({ length: 30_000 }, (_, n) => [`d${n}`, 'x'.repeat(150)])) }) };
  await p.served.store.save({ ...config, layouts: huge, sectionSeeds: {} });
  await tick(KEY_SAVE_EVERY_MS);
  expect(p.refused).toEqual(['too-big']);
});

test('a hub without dashboards gets those of a device that may arrange; it never empties the copy here', async () => {
  const house = hub();
  const mine = arrangedAs('van de telefoon');
  const edit = await phone(house, 'edit', memory(), { layouts: mine });
  await edit.served.store.load();
  await tick(KEY_SAVE_EVERY_MS * 2);
  expect(house.layouts.get().revision).toBe(1);
  expect(house.layouts.get().layouts[HOMEY]).toBeDefined();
  const other = hub();
  const use = await phone(other, 'use', memory(), { layouts: mine });
  await use.served.store.load();
  await tick(KEY_SAVE_EVERY_MS * 2);
  expect(other.layouts.get().revision).toBe(0);
  expect(use.kept().layouts[HOMEY]).toEqual(mine[HOMEY]);
});
