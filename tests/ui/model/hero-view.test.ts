import { expect, test } from 'vitest';
import type { HeroSpec } from '../../../src/dashboard/types';
import type { Device } from '../../../src/homey/types';
import { createTranslate, t } from '../../../src/i18n';
import { hasLongWord, heroView, isWords } from '../../../src/ui/model/hero-view';
import { cap, device } from '../../helpers/build';

const victron = (soc: number | null, timeToGo: number | null, consumption: number) => device({ id: 'v', name: 'Victron-systeem', caps: [
  cap('battery_soc', { units: '%', value: soc }), cap('time_to_go', { units: 'min', value: timeToGo }), cap('measure_power', { units: 'W', value: consumption }),
  cap('ac_input_source', { type: 'enum', value: 'none', options: [{ id: 'none', title: 'Niet aangesloten' }, { id: 'grid', title: 'Net' }] }),
] });
const panel = (power: number) => device({ id: 'z', name: 'Zonnepanelen', deviceClass: 'solarpanel', caps: [cap('measure_power', { units: 'W', value: power })] });

const batteryHero: HeroSpec = {
  kind: 'battery', deviceIds: ['v', 'z'], primary: { deviceId: 'v', capabilityId: 'battery_soc' }, timeToGo: { deviceId: 'v', capabilityId: 'time_to_go' },
  stats: [
    { role: 'solar', ref: { deviceId: 'z', capabilityId: 'measure_power' } }, { role: 'consumption', ref: { deviceId: 'v', capabilityId: 'measure_power' } },
    { role: 'shore', ref: { deviceId: 'v', capabilityId: 'ac_input_source' } }, { role: 'net' },
  ],
};
const lookup = (...devices: Device[]) => (id: string) => devices.find((d) => d.id === id);

test('the battery hero', () => {
  const view = heroView(batteryHero, lookup(victron(78.4, 3124, 186), panel(412)), t);
  expect(view).toMatchObject({ kind: 'battery', title: 'Accu', icon: 'battery_5_bar', number: { text: '78', unit: '%' }, progress: 78, line: 'Nog ongeveer 2 dagen en 4 uur', primaryDeviceId: 'v' });
  expect(view.stats).toEqual([
    { role: 'solar', icon: 'solar_power', value: '412 W', label: 'Zon', deviceId: 'z' },
    { role: 'consumption', icon: 'bolt', value: '186 W', label: 'Verbruik', deviceId: 'v' },
    { role: 'shore', icon: 'power', value: 'Off-grid', label: 'Walstroom', deviceId: 'v' },
    { role: 'net', icon: 'trending_up', value: '+226 W', label: 'Netto laden', deviceId: null },
  ]);
});

test('without a time to go the line is empty', () => {
  expect(heroView(batteryHero, lookup(victron(78, null, 186), panel(412)), t).line).toBe('');
  expect(heroView({ ...batteryHero, timeToGo: null }, lookup(victron(78, 3124, 186), panel(412)), t).line).toBe('');
});

test('solar below consumption is net discharging, with a real minus sign', () => {
  const net = heroView(batteryHero, lookup(victron(78, 3124, 186), panel(146)), t).stats.find((s) => s.role === 'net');
  expect(net).toEqual({ role: 'net', icon: 'trending_down', value: '−40 W', label: 'Netto ontladen', deviceId: null });
});

test('a stat whose device or value is missing is left out, and the net needs both', () => {
  const view = heroView(batteryHero, lookup(victron(78, 3124, 186)), t);
  expect(view.stats.map((s) => s.role)).toEqual(['consumption', 'shore']);
});

test('a missing state of charge shows a dash and no progress', () => {
  expect(heroView(batteryHero, lookup(victron(null, null, 186), panel(412)), t)).toMatchObject({ number: { text: '–', unit: '' }, progress: null });
});

test('the solar and the consumption hero', () => {
  const solar = heroView({ kind: 'solar', deviceIds: ['z'], primary: { deviceId: 'z', capabilityId: 'measure_power' }, timeToGo: null, stats: [] }, lookup(panel(412)), t);
  expect(solar).toMatchObject({ title: 'Zon', icon: 'solar_power', number: { text: '412', unit: 'W' }, line: 'Zon nu', progress: null, stats: [] });
  const meter = device({ id: 'm', name: 'Meter', caps: [cap('measure_power', { units: 'W', value: 186 })] });
  const use = heroView({ kind: 'consumption', deviceIds: [], primary: { deviceId: 'm', capabilityId: 'measure_power' }, timeToGo: null, stats: [] }, lookup(meter), t);
  expect(use).toMatchObject({ title: 'Verbruik', icon: 'bolt', number: { text: '186', unit: 'W' }, line: 'Verbruik nu', progress: null, stats: [] });
});

test('a net that rounds to zero has no sign', () => {
  const net = heroView(batteryHero, lookup(victron(78, 3124, 100.4), panel(100.2)), t).stats.find((s) => s.role === 'net');
  expect(net).toMatchObject({ value: '0 W', icon: 'trending_up', label: 'Netto laden' });
});

test('a word, and not a number however long', () => {
  expect(['Niet aangesloten', 'Generator', 'Net', '–', '12.345,6 kWh', '−1,1 kW', '0 W', ''].map(isWords)).toEqual([true, true, false, false, false, false, false, false]);
});

test('a label with a long word needs more room than one with short ones', () => {
  for (const long of ['Consumption', 'Net discharging', 'Netto ontladen en opladen-tegelijk']) expect([long, hasLongWord(long)]).toEqual([long, true]);
  expect([hasLongWord('Walstroom', 9), hasLongWord('Verbruik', 9)]).toEqual([true, false]);
  for (const short of ['Verbruik', 'Walstroom', 'Netto ontladen', 'Solar', '']) expect([short, hasLongWord(short)]).toEqual([short, false]);
});

test('without power from outside the shore power says off-grid, or inverting when the inverter really inverts', () => {
  const options = [{ id: 'none', title: 'Niet aangesloten' }, { id: 'grid', title: 'Net' }, { id: 'inverting', title: 'Omvormen (eiland)' }];
  const states = [{ id: 'off', title: 'Uit' }, { id: 'inverting', title: 'Omvormen' }, { id: 'bulk', title: 'Bulk' }];
  const system = (source: string, state: string | null) => device({ id: 'v', name: 'Victron-systeem', caps: [
    cap('battery_soc', { units: '%', value: 80 }), cap('measure_power', { units: 'W', value: 100 }),
    cap('ac_input_source', { type: 'enum', value: source, options }),
    ...(state === null ? [] : [cap('victron_state', { type: 'enum', value: state, options: states })]),
  ] });
  const shore = (source: string, state: string | null) => heroView(batteryHero, lookup(system(source, state), panel(0)), t).stats.find((s) => s.role === 'shore')!.value;
  expect(shore('inverting', 'off')).toBe('Off-grid');
  expect(shore('none', null)).toBe('Off-grid');
  expect(shore('inverting', 'inverting')).toBe('Omvormen');
  expect(shore('none', 'inverting')).toBe('Omvormen');
  expect(shore('grid', 'bulk')).toBe('Net');
  expect(heroView(batteryHero, lookup(system('inverting', 'off'), panel(0)), createTranslate('en')).stats.find((s) => s.role === 'shore')!.value).toBe('Off-grid');
  expect(heroView(batteryHero, lookup(system('inverting', 'inverting'), panel(0)), createTranslate('en')).stats.find((s) => s.role === 'shore')!.value).toBe('Inverting');
});
