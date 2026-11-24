import { expect, test } from 'vitest';
import { anonymize } from '../../tools/anonymize.mjs';
import type { RawHomey } from '../../src/homey/types';

type Obj = Record<string, any>;

const raw = {
  homeyId: 'real-homey-id', softwareVersion: '13.5.5', scopes: ['homey'],
  devices: {
    'aaa-1': { id: 'aaa-1', name: 'Lamp van Sanne', zone: 'zzz-1', class: 'light', driverId: 'homey:app:com.x:bulb', capabilities: ['onoff'], capabilitiesObj: { onoff: { id: 'onoff', title: 'Aan', type: 'boolean', getable: true, setable: true, value: true } } },
    'aaa-2': { id: 'aaa-2', name: 'Stekker keuken', zone: 'zzz-1', class: 'socket', capabilities: [], capabilitiesObj: {} },
  },
  zones: { 'zzz-1': { id: 'zzz-1', name: 'Onze camper', parent: null } },
  flows: { 'fff-1': { id: 'fff-1', name: 'Geheim', enabled: true, triggerable: true } }, advancedFlows: {},
} as RawHomey;

test('replaces ids and names, keeps structure and capability data', () => {
  const out = anonymize(raw) as RawHomey & { devices: Obj; zones: Obj; flows: Obj };
  const text = JSON.stringify(out);
  for (const secret of ['real-homey-id', 'aaa-1', 'zzz-1', 'fff-1', 'Sanne', 'Onze camper', 'Geheim', 'keuken']) expect(text).not.toContain(secret);
  expect(out.homeyId).toBe('mock-homey');
  expect(Object.keys(out.devices)).toEqual(['device-1', 'device-2']);
  expect(out.devices['device-1']).toMatchObject({ id: 'device-1', name: 'Lamp 1', zone: 'zone-1', class: 'light', driverId: 'homey:app:app-1:bulb' });
  expect(out.devices['device-2']).toMatchObject({ name: 'Stekker 1', zone: 'zone-1' });
  expect(out.zones['zone-1']).toMatchObject({ id: 'zone-1', name: 'Zone 1', parent: null });
  expect(out.flows['flow-1']).toMatchObject({ id: 'flow-1', name: 'Flow 1' });
  expect(out.devices['device-1'].capabilitiesObj.onoff.value).toBe(true);
});

test('is deterministic', () => { expect(anonymize(raw)).toEqual(anonymize(raw)); });

const leaky = () => ({
  homeyId: 'real-homey-id', softwareVersion: '13.5.5', scopes: ['homey'], extraTop: 'real-homey-id',
  devices: {
    'aaa-1': {
      id: 'aaa-1', name: 'Lamp van Sanne', zone: 'zzz-1', class: 'light', driverId: 'homey:app:com.x:bulb',
      uri: 'homey:device:aaa-1', ownerUri: 'homey:app:owner-aaa-1', data: { id: 'aaa-1' }, settings: { n: 'Sanne' },
      store: { s: 'aaa-1' }, note: 'Lamp van Sanne in Onze camper', unavailableMessage: 'Lamp van Sanne is offline',
      capabilities: ['onoff', 'dim', 'text', 'mode', 'measure_power'],
      capabilitiesObj: {
        onoff: { id: 'onoff', title: 'Aan', type: 'boolean', getable: true, setable: true, value: false, lastUpdated: '2026-01-01T00:00:00Z' },
        dim: { id: 'dim', title: 'Dim', type: 'number', getable: true, setable: true, value: 0.5 },
        text: { id: 'text', title: 'Tekst', type: 'string', getable: true, setable: false, value: 'Sanne thuis' },
        mode: { id: 'mode', title: 'Modus', type: 'enum', getable: true, setable: true, value: 'eco', values: [{ id: 'eco', title: 'Eco Lamp van Sanne' }] },
        measure_power: { id: 'measure_power', title: 'Vermogen Lamp van Sanne', type: 'number', getable: true, setable: false, value: 3, units: 'W' },
      },
    },
  },
  zones: { 'zzz-1': { id: 'zzz-1', name: 'Onze camper', parent: null } },
  flows: { 'fff-1': { id: 'fff-1', name: 'Geheim', enabled: true, triggerable: true, folder: 'fold-Geheim', cards: [{ arg: 'aaa-1 Lamp van Sanne' }] } },
  advancedFlows: { 'adv-9': { id: 'adv-9', name: 'Slaapstand van Sanne', enabled: true, triggerable: true, cards: { a: 'adv-9' } } },
}) as unknown as RawHomey;

test('drops everything outside the allow-list and leaks no ids or names', () => {
  const out = anonymize(leaky());
  const text = JSON.stringify(out);
  for (const key of ['uri', 'ownerUri', 'data', 'settings', 'store', 'note', 'lastUpdated', 'cards', 'folder', 'extraTop']) expect(text).not.toContain(`"${key}"`);
  for (const secret of ['real-homey-id', 'aaa-1', 'zzz-1', 'fff-1', 'adv-9', 'Sanne', 'Onze camper', 'Geheim', 'Slaapstand']) expect(text).not.toContain(secret);
});

test('replaces string values, keeps other values', () => {
  const caps = (anonymize(leaky()).devices as Obj)['device-1'].capabilitiesObj;
  expect(caps.text.value).toBe('voorbeeld');
  expect(caps.dim.value).toBe(0.5);
  expect(caps.onoff.value).toBe(false);
  expect(caps.mode.value).toBe('eco');
});

test('replaces a non-empty unavailableMessage', () => {
  expect((anonymize(leaky()).devices as Obj)['device-1'].unavailableMessage).toBe('Niet bereikbaar');
});

test('replaces original names in capability and option titles', () => {
  const caps = (anonymize(leaky()).devices as Obj)['device-1'].capabilitiesObj;
  expect(caps.measure_power.title).toBe('Vermogen Lamp 1');
  expect(caps.mode.values[0].title).toBe('Eco Lamp 1');
});

test('throws when an original id survives in a kept field', () => {
  const bad = leaky() as unknown as Obj;
  bad.devices['aaa-1'].capabilitiesObj.dim.title = 'Dim aaa-1';
  expect(() => anonymize(bad as RawHomey)).toThrow(/anonymi[sz]ation is incomplete/i);
});

test('names advanced flows', () => {
  const out = anonymize(leaky());
  expect((out.advancedFlows as Obj)['advanced-1']).toMatchObject({ id: 'advanced-1', name: 'Advanced Flow 1' });
});

test('anonymises app ids inside driver ids', () => {
  const input = {
    homeyId: 'home-xyz', softwareVersion: null, scopes: [], zones: {}, flows: {}, advancedFlows: {},
    devices: {
      'dev-aaa': { id: 'dev-aaa', name: 'Eerste', class: 'other', driverId: 'homey:app:nl.example.alpha:tank' },
      'dev-bbb': { id: 'dev-bbb', name: 'Tweede', class: 'other', driverId: 'homey:app:nl.example.alpha:battery' },
      'dev-ccc': { id: 'dev-ccc', name: 'Derde', class: 'other', driverId: 'homey:app:com.other.beta:bulb' },
      'dev-ddd': { id: 'dev-ddd', name: 'Vierde', class: 'other', driverId: 'something-else' },
    },
  } as unknown as RawHomey;
  const out = anonymize(input);
  const d = out.devices as Obj;
  expect([d['device-1'].driverId, d['device-2'].driverId, d['device-3'].driverId]).toEqual(['homey:app:app-1:tank', 'homey:app:app-1:battery', 'homey:app:app-2:bulb']);
  expect(d['device-4'].driverId).toBe('driver-1');
  const text = JSON.stringify(out);
  expect(text).not.toContain('nl.example.alpha');
  expect(text).not.toContain('com.other.beta');
});

test('an object title is scrubbed in every language', () => {
  const input = leaky() as unknown as Obj;
  input.devices['aaa-1'].capabilitiesObj.dim.title = { nl: 'Dimmer Lamp van Sanne', en: 'Dimmer of Lamp van Sanne', n: 5, nested: { x: 'Lamp van Sanne' } };
  input.devices['aaa-1'].capabilitiesObj.mode.values = [{ id: 'eco', title: { nl: 'Eco Lamp van Sanne', bad: ['Sanne'] } }, { id: 'max', title: 7 }];
  input.devices['aaa-1'].capabilitiesObj.onoff.title = 42;
  const out = anonymize(input as RawHomey);
  const caps = (out.devices as Obj)['device-1'].capabilitiesObj;
  expect(JSON.stringify(out)).not.toContain('Sanne');
  expect(caps.dim.title).toEqual({ nl: 'Dimmer Lamp 1', en: 'Dimmer of Lamp 1' });
  expect(caps.mode.values).toEqual([{ id: 'eco', title: { nl: 'Eco Lamp 1' } }, { id: 'max' }]);
  expect('title' in caps.onoff).toBe(false);
});
test('energy settings keep only the two flags the app uses', () => {
  const input = leaky() as unknown as Obj;
  input.devices['aaa-1'].energyObj = { cumulative: true, homeBattery: false, meterPowerImportedCapability: 'meter_power.imported', batteries: ['AA'], approximation: { usageOn: 5 } };
  expect((anonymize(input as RawHomey).devices as Obj)['device-1'].energyObj).toEqual({ cumulative: true, homeBattery: false });
  input.devices['aaa-1'].energyObj = { cumulative: 'ja', homeBattery: 1, generator: true };
  expect((anonymize(input as RawHomey).devices as Obj)['device-1'].energyObj).toEqual({});
  input.devices['aaa-1'].energyObj = 'Lamp van Sanne';
  expect('energyObj' in (anonymize(input as RawHomey).devices as Obj)['device-1']).toBe(false);
});
test('a driver id that is not text becomes null', () => {
  const input = leaky() as unknown as Obj;
  input.devices['aaa-1'].driverId = 42;
  expect((anonymize(input as RawHomey).devices as Obj)['device-1'].driverId).toBeNull();
  input.devices['aaa-1'].driverId = { app: 'com.x' };
  expect((anonymize(input as RawHomey).devices as Obj)['device-1'].driverId).toBeNull();
});
test('throws when an original app id survives in a kept field', () => {
  const input = {
    homeyId: 'home-xyz', softwareVersion: null, scopes: [], zones: {}, flows: {}, advancedFlows: {},
    devices: {
      'dev-aaa': {
        id: 'dev-aaa', name: 'Eerste', class: 'socket', driverId: 'homey:app:com.example.demo:plug', capabilities: ['com.example.demo_state'],
        capabilitiesObj: { 'com.example.demo_state': { id: 'com.example.demo_state', title: 'Stand', type: 'string', getable: true, setable: false, value: 'x' } },
      },
    },
  } as unknown as RawHomey;
  expect(() => anonymize(input)).toThrow(/Anonymisation is incomplete/);
});
