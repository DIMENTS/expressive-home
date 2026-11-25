import { expect, test } from 'vitest';
import { t } from '../../../src/i18n';
import { controlFor, deviceView } from '../../../src/ui/model/device-view';
import { parseNumberInput } from '../../../src/ui/model/device-view';
import { cap, device } from '../../helpers/build';

test.each([
  [cap('onoff', { type: 'boolean', setable: true, value: true }), { kind: 'switch', checked: true }],
  [cap('button.identify', { type: 'boolean', setable: true }), { kind: 'action' }],
  [cap('dim', { setable: true, min: 0, max: 1, value: 0.8 }), { kind: 'slider', variant: 'plain', fraction: 0.8, valueText: '80%' }],
  [cap('light_hue', { setable: true, min: 0, max: 1, value: 0.1 }), { kind: 'slider', variant: 'hue', valueText: '' }],
  [cap('light_temperature', { setable: true, min: 0, max: 1, value: 0.5 }), { kind: 'slider', variant: 'temperature' }],
  [cap('target_temperature', { setable: true, min: 5, max: 30, units: '°C', decimals: 1, value: 20.5 }), { kind: 'slider', fraction: 0.62, valueText: '20,5 °C' }],
  [cap('volume', { setable: true, value: 3 }), { kind: 'number', value: 3 }],
  [cap('mode', { type: 'enum', setable: true, value: 'a', options: [{ id: 'a', title: 'Aan' }, { id: 'b', title: 'Uit' }] }), { kind: 'choice', layout: 'buttons', value: 'a' }],
  [cap('mode', { type: 'enum', setable: true, options: [{ id: 'a', title: 'Aan' }, { id: 'b', title: 'Alleen omvormen' }] }), { kind: 'choice', layout: 'list' }],
  [cap('mode', { type: 'enum', setable: true, options: [1, 2, 3, 4].map((n) => ({ id: `${n}`, title: `${n}` })) }), { kind: 'choice', layout: 'list' }],
  [cap('note', { type: 'string', setable: true, value: 'x' }), { kind: 'text', value: 'x' }],
] as const)('controlFor %#', (capability, expected) => { expect(controlFor(capability, t)).toMatchObject(expected); });

test('a control carries the capability id and title', () => {
  expect(controlFor(cap('onoff.1', { type: 'boolean', setable: true, title: 'Relais 2', value: false }), t)).toEqual({ kind: 'switch', capabilityId: 'onoff.1', label: 'Relais 2', checked: false });
});

test('a capability that cannot be set has no control', () => {
  expect(controlFor(cap('measure_power'), t)).toBeNull();
});

test('a slider without a value starts at zero and shows a dash', () => {
  expect(controlFor(cap('dim', { setable: true, min: 0, max: 1, value: null }), t)).toMatchObject({ fraction: 0, valueText: '–' });
});

test('a device view groups controls, values and technical details in the order of the hub', () => {
  const lamp = device({ id: 'l', name: 'Plafond', deviceClass: 'light', zoneId: 'z1', caps: [
    cap('onoff', { type: 'boolean', setable: true, title: 'Aan', value: true }), cap('dim', { setable: true, min: 0, max: 1, title: 'Helderheid', value: 0.8 }),
    cap('light_hue', { setable: true, min: 0, max: 1, title: 'Tint', value: 0.1 }), cap('measure_power', { title: 'Vermogen', units: 'W', decimals: 2, value: 6.2 }),
    cap('rssi', { title: 'Signaalsterkte', units: 'dBm', value: -61 }),
  ] });
  const view = deviceView(lamp, { z1: { id: 'z1', name: 'Woonkamer', parentId: null } }, t);
  expect(view.controls.map((c) => c.kind)).toEqual(['switch', 'slider', 'slider']);
  expect(view.values).toEqual([{ capabilityId: 'measure_power', label: 'Vermogen', text: '6,2 W', danger: false }]);
  expect(view.technical).toEqual([{ label: 'Signaalsterkte', text: '-61 dBm' }]);
  expect(view).toMatchObject({ name: 'Plafond', zoneName: 'Woonkamer', on: true, unavailable: null, icon: 'lightbulb' });
});

test('values show the precision of the hub', () => {
  const plug = device({ id: 'p', caps: [cap('measure_power', { title: 'Vermogen', units: 'W', decimals: 2, value: 45.37 })] });
  expect(deviceView(plug, {}, t).values[0]!.text).toBe('45,37 W');
});

test('an active danger alarm is marked and a status flag is not', () => {
  const victron = device({ id: 'v', caps: [
    cap('alarm_generic', { type: 'boolean', title: 'Algemeen alarm', value: true }), cap('alarm_power.mains', { type: 'boolean', title: 'Geen AC-ingang', value: true }),
  ] });
  expect(deviceView(victron, {}, t).values.map(({ capabilityId: _id, ...rest }) => rest)).toEqual([
    { label: 'Algemeen alarm', text: 'Ja', danger: true }, { label: 'Geen AC-ingang', text: 'Ja', danger: false },
  ]);
});

test('an unavailable device carries the reason of the hub', () => {
  const gone = device({ id: 'g', available: false, unavailableMessage: 'Apparaat is offline' });
  expect(deviceView(gone, {}, t)).toMatchObject({ unavailable: 'Apparaat is offline', icon: 'link_off' });
  expect(deviceView({ ...gone, unavailableMessage: null }, {}, t).unavailable).toBe('Niet bereikbaar');
});

test('an unknown zone gives an empty zone name', () => {
  expect(deviceView(device({ id: 'x', zoneId: 'nowhere' }), {}, t).zoneName).toBe('');
});

test.each([['21,5', 21.5], ['21.5', 21.5], ['-3', -3], ['+4', 4], ['0x10', null], ['1e3', null], ['1.000,5', null], ['', null], [' 7 ', 7], ['.5', null], ['5.', null], ['Infinity', null]] as const)('parseNumberInput(%s)', (input, expected) => {
  expect(parseNumberInput(input, 'nl')).toBe(expected);
  expect(parseNumberInput(input, 'en')).toBe(expected);
});

test('a number that reads as thousands in the language is refused instead of sent as a fraction', () => {
  // Dutch writes 1.500 for fifteen hundred, English 1,500: never send either as 1.5
  expect(parseNumberInput('1.500', 'nl')).toBeNull();
  expect(parseNumberInput('1,500', 'en')).toBeNull();
  expect(parseNumberInput('-2.000', 'nl')).toBeNull();
  // the decimal mark of the language, and the other mark with other than three digits, still work
  expect(parseNumberInput('1,500', 'nl')).toBe(1.5);
  expect(parseNumberInput('1.500', 'en')).toBe(1.5);
  expect(parseNumberInput('21.5', 'nl')).toBe(21.5);
  expect(parseNumberInput('21,25', 'en')).toBe(21.25);
});
