import { expect, test } from 'vitest';
import type { HeroSpec } from '../../src/dashboard/types';
import { describeShore, probeHistory, RESOLUTIONS, type RawHistory } from '../../src/inspect/history-probe';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const at = (minutesAgo: number): string => new Date(NOW - minutesAgo * 60_000).toISOString();
const hero: HeroSpec = { kind: 'battery', deviceIds: ['geheim-accu', 'geheim-zon'], primary: { deviceId: 'geheim-accu', capabilityId: 'measure_battery' }, timeToGo: null, stats: [{ role: 'solar', ref: { deviceId: 'geheim-zon', capabilityId: 'measure_power' } }, { role: 'net' }] };

const LOGS = {
  a: { id: 'homey:device:geheim-accu:measure_battery', ownerUri: 'homey:device:geheim-accu', title: 'Geheime accu', type: 'number', units: '%' },
  b: { id: 'homey:device:geheim-huis:measure_temperature', ownerUri: 'homey:device:geheim-huis', title: 'Geheime kamer', type: 'number', units: '°C' },
  c: { id: 'homey:device:geheim-huis:onoff', ownerUri: 'homey:device:geheim-huis', title: 'Geheim', type: 'boolean' },
  d: { id: 'homey:device:geheim-huis:geheim_merk_eigen', ownerUri: 'homey:device:geheim-huis', title: 'Geheim merk', type: 'number' },
  e: { id: 'homey:manager:geheim:x', ownerUri: 'homey:manager:geheim', title: 'Geheim', type: 'number' },
};
const raw = (entries: RawHistory['entries']): RawHistory => ({ logs: async () => LOGS, entries });

test('what comes back is told as shapes, numbers and times; never a name, an id or a value', async () => {
  const text = await probeHistory(raw(async (id, resolution) => {
    if (id.includes('onoff')) return [{ t: at(50), v: true }, { t: at(10), v: false }];
    if (resolution === 'today') return { values: [], start: at(720), end: at(0), step: 60_000, updatesIn: 1000, geheimVeldMetNaam: 'Geheim' };
    if (resolution === 'last24Hours') return { values: [{ t: at(15), v: 71.25 }, { t: at(10), v: null }, { t: at(5), v: 73.5 }], step: 300_000 };
    throw Object.assign(new Error('Geheime fout http://192.168.9.9/x'), { statusCode: 400 });
  }), hero, NOW);
  expect(text).toContain('reeksen: 5 (4 van apparaten); getal 4, ja/nee 1');
  expect(text).toContain('measure_battery 1, measure_temperature 1, onoff 1, anders 1');
  expect(text).toContain('blikvanger: battery bestaat, solar bestaat niet');
  expect(text).toMatch(/battery, last24Hours: lijst van 3, velden t v, t tekst, v getal 2 leeg 1, om de 5 min, eerste 15 en laatste 5 min geleden, gevuld van 15 tot 5 min geleden, erbij: step/);
  expect(text).toMatch(/battery, today: lijst van 0, erbij: end start step updatesIn \+1/);
  expect(text).toMatch(/onoff, .*: lijst van 2, .*v ja\/nee 2/);
  expect(text).toMatch(/battery, lastHour: fout 400/);
  for (const secret of ['geheim', 'Geheim', '71.25', '73.5', '192.168']) expect(text.toLowerCase()).not.toContain(secret.toLowerCase());
  for (const resolution of RESOLUTIONS) expect(text).toContain(resolution ?? 'zonder periode');
});

test('a hub without logs, with an odd list or that fails is told too', async () => {
  expect(await probeHistory({ logs: async () => { throw Object.assign(new Error('Geheim'), { statusCode: 403 }); }, entries: async () => null }, hero, NOW)).toContain('lijst: fout 403');
  expect(await probeHistory({ logs: async () => null, entries: async () => null }, null, NOW)).toContain('reeksen: 0');
  expect(await probeHistory({ logs: async () => ({ a: LOGS.b }), entries: async () => 'iets anders' }, null, NOW)).toMatch(/measure_temperature, zonder periode: text|tekst/);
});

test('a hub that does not answer does not hold it up', async () => {
  const text = await probeHistory(raw((id) => (id.includes('battery') ? new Promise(() => {}) : Promise.resolve([]))), hero, NOW, 5);
  expect(text).toContain('battery, today: geen antwoord');
});

test('the year is asked as lastYear too', () => {
  expect(RESOLUTIONS).toContain('lastYear');
});

test('how long a log has values, apart from how long its list is', async () => {
  const text = await probeHistory(raw(async (id, resolution) => (resolution === 'last24Hours' && id.includes('battery')
    ? { values: [{ t: at(30), v: null }, { t: at(20), v: 50 }, { t: at(10), v: 51 }] }
    : [])), hero, NOW);
  expect(text).toMatch(/battery, last24Hours: lijst van 3, .*gevuld van 20 tot 10 min geleden/);
});

test('logs of an app are counted apart, and those of this app are read like the others', async () => {
  const logs = {
    ...LOGS,
    f: { id: 'homey:app:app.expressive.home:probe_number', ownerUri: 'homey:app:app.expressive.home', title: 'Proef', type: 'number' },
    g: { id: 'homey:app:com.geheim.merk:geheim', ownerUri: 'homey:app:com.geheim.merk', title: 'Geheim', type: 'number' },
  };
  const asked: string[] = [];
  const text = await probeHistory({ logs: async () => logs, entries: async (id, resolution) => { asked.push(`${id} ${resolution}`); return []; } }, null, NOW);
  expect(text).toContain('reeksen: 7 (4 van apparaten, 2 van apps, waarvan 1 van dit appje)');
  expect(text).toContain('- dit appje, probe_number, last24Hours: lijst van 0');
  expect(asked).toContain('homey:app:app.expressive.home:probe_number lastHour');
  expect(text.toLowerCase()).not.toContain('geheim');
});

test('the words of the shore power are told by their ids, never by the names of the app', () => {
  const capability = { id: 'ac_input_source', type: 'enum', options: [{ id: 'none', title: 'Geheim niet' }, { id: 'grid', title: 'Geheim net' }, { id: 'inverting', title: 'Geheim' }], value: 'grid' };
  expect(describeShore(capability)).toBe('walstroom: enum, woorden none grid inverting, nu grid');
  expect(describeShore({ id: 'x', type: 'boolean', options: [], value: true })).toBe('walstroom: boolean, nu ja/nee');
  expect(describeShore({ id: 'x', type: 'enum', options: [{ id: 'Geheim 192.168.1.1', title: 'x' }], value: 'Geheim 192.168.1.1' })).toBe('walstroom: enum, woorden (eigen), nu (eigen)');
  expect(describeShore(undefined)).toBe('walstroom: geen');
});
