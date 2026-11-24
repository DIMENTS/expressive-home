import { expect, test } from 'vitest';
import { dateLine, dayText, formatDuration, formatValue, greetingKey, joinValue, timeText } from '../../src/i18n/format';
import { createTranslate, t } from '../../src/i18n';
import type { Capability } from '../../src/homey/types';
import { cap } from '../helpers/build';

const num = (value: unknown, extra: Partial<Capability> = {}) => cap('x', { value: value as never, ...extra });

test.each([
  [num(45.37, { units: 'W', decimals: 2 }), 'tile', '45 W'], [num(45.37, { units: 'W', decimals: 2 }), 'full', '45,37 W'],
  [num(1234, { units: 'W', decimals: 2 }), 'tile', '1,2 kW'], [num(52.25, { units: '%', decimals: 2 }), 'tile', '52%'],
  [num(20.5, { units: '°C', decimals: 1 }), 'tile', '20,5 °C'], [num(13.8, { units: 'V', decimals: 2 }), 'tile', '13,8 V'], [num(13.8, { units: 'V', decimals: 2 }), 'full', '13,8 V'],
  [num(0.8, { units: '%', min: 0, max: 1, decimals: 2 }), 'tile', '80%'], [num(0.65, { min: 0, max: 1 }), 'full', '65%'],
  [num(182.4, { units: 'Mbit/s', decimals: 1 }), 'tile', '182 Mbit/s'], [num(12), 'tile', '12'], [num(null), 'tile', '–'],
  [num('kapot'), 'tile', '–'], [num(Number.NaN), 'tile', '–'],
  [cap('onoff', { type: 'boolean', value: true }), 'tile', 'Aan'], [cap('alarm_x', { type: 'boolean', value: false }), 'full', 'Nee'],
  [cap('alarm_contact', { type: 'boolean', value: true, titleTrue: 'Open', titleFalse: 'Dicht' }), 'tile', 'Open'],
  [cap('mode', { type: 'enum', value: 'a', options: [{ id: 'a', title: 'Automatisch' }] }), 'tile', 'Automatisch'],
  [cap('mode', { type: 'enum', value: 'zz', options: [] }), 'tile', 'zz'], [undefined, 'tile', '–'],
] as const)('formatValue %#', (capability, mode, text) => { expect(joinValue(formatValue(capability, mode, t))).toBe(text); });

test.each([
  // extra cases around the rules for values
  [num(2.5, { units: 'W', decimals: 2 }), 'full', '2,5 W'], [num(2.5, { units: 'W' }), 'tile', '3 W'],
  [num(-226, { units: 'W' }), 'tile', '-226 W'], [num(-1500, { units: 'W' }), 'full', '-1,5 kW'],
  [num(0.123, { units: 'kWh', decimals: 3 }), 'full', '0,123 kWh'], [num(0.123, { units: 'kWh', decimals: 3 }), 'tile', '0,1 kWh'],
  [num(7.25), 'full', '7,3'], [num(150.6), 'full', '151'], [num(12, { units: '' }), 'tile', '12'],
  [cap('onoff.1', { type: 'boolean', value: false }), 'tile', 'Uit'], [cap('x', { type: 'boolean', value: null }), 'tile', '–'],
  [cap('x', { type: 'string', value: '' }), 'tile', '–'], [cap('x', { type: 'string', value: 'Online' }), 'tile', 'Online'],
  [cap('alarm_contact', { type: 'boolean', value: false, titleTrue: 'Open', titleFalse: 'Dicht' }), 'tile', 'Dicht'],
  [cap('x', { type: 'number', value: true }), 'tile', 'Ja'],
] as const)('formatValue edge %#', (capability, mode, text) => { expect(joinValue(formatValue(capability, mode, t))).toBe(text); });

test('the unit stays apart from the number', () => {
  expect(formatValue(num(45.37, { units: 'W', decimals: 2 }), 'tile', t)).toEqual({ text: '45', unit: 'W' });
  expect(formatValue(num(null, { units: 'W' }), 'tile', t)).toEqual({ text: '–', unit: '' });
});

test.each([[3124, '2 dagen en 4 uur'], [1440, '1 dag'], [61, '1 uur en 1 minuut'], [45, '45 minuten'], [0, 'minder dan een minuut'], [-5, ''], [Number.NaN, '']])(
  'formatDuration %d', (m, text) => { expect(formatDuration(m, t)).toBe(text); });

test.each([[1, '1 minuut'], [0.5, 'minder dan een minuut'], [120, '2 uur'], [1441, '1 dag'], [1500, '1 dag en 1 uur'], [Number.POSITIVE_INFINITY, '']])(
  'formatDuration edge %d', (m, text) => { expect(formatDuration(m, t)).toBe(text); });

test.each([[0, 'greeting.night'], [5, 'greeting.night'], [6, 'greeting.morning'], [11, 'greeting.morning'], [12, 'greeting.afternoon'], [17, 'greeting.afternoon'], [18, 'greeting.evening'], [23, 'greeting.evening']])(
  'greeting at %d h', (h, key) => { expect(greetingKey(new Date(2026, 10, 22, h, 0))).toBe(key); });

test('dateLine', () => {
  expect(dateLine(new Date(2026, 10, 22, 14, 32), t)).toBe('Zondag 22 november · 14:32');
  expect(dateLine(new Date(2026, 0, 5, 9, 5), t)).toBe('Maandag 5 januari · 09:05');
  expect(dateLine(new Date(2026, 10, 22, 14, 32), createTranslate('nl'))).toBe('Zondag 22 november · 14:32');
  expect(dateLine(new Date(2026, 10, 22, 14, 32), createTranslate('en'))).toBe('Sunday 22 November · 14:32');
  expect(dateLine(new Date(2026, 0, 5, 21, 5), createTranslate('en'))).toBe('Monday 5 January · 21:05');
});

test('text where a number belongs shows a dash', () => {
  expect(formatValue(cap('x', { type: 'number', value: 'abc' as never }), 'tile', t).text).toBe('–');
  expect(formatValue(cap('x', { type: 'number', value: 'abc' as never }), 'full', t).text).toBe('–');
  // A text capability keeps its own text.
  expect(formatValue(cap('x', { type: 'string', value: 'abc' }), 'tile', t).text).toBe('abc');
});
test('a value that rounds to zero has no minus sign', () => {
  expect(joinValue(formatValue(cap('x', { type: 'number', units: 'W', value: -0.3 }), 'tile', t))).toBe('0 W');
  expect(joinValue(formatValue(cap('x', { type: 'number', units: '°C', decimals: 1, value: -0.04 }), 'full', t))).toBe('0 °C');
  expect(joinValue(formatValue(cap('x', { type: 'number', units: '°C', decimals: 1, value: -0.06 }), 'full', t))).toBe('-0,1 °C');
});
test('the kW threshold is decided after rounding', () => {
  expect(joinValue(formatValue(cap('x', { type: 'number', units: 'W', value: 999.6 }), 'tile', t))).toBe('1 kW');
  expect(joinValue(formatValue(cap('x', { type: 'number', units: 'W', value: 999.4 }), 'tile', t))).toBe('999 W');
  expect(joinValue(formatValue(cap('x', { type: 'number', units: 'W', decimals: 2, value: 999.996 }), 'full', t))).toBe('1 kW');
  expect(joinValue(formatValue(cap('x', { type: 'number', units: 'W', decimals: 2, value: 999.99 }), 'full', t))).toBe('999,99 W');
  expect(joinValue(formatValue(cap('x', { type: 'number', units: 'W', value: -1234 }), 'tile', t))).toBe('-1,2 kW');
});

test('numbers follow the locale', () => {
  expect(joinValue(formatValue(cap('x', { type: 'number', units: '°C', decimals: 1, value: 20.5 }), 'tile', createTranslate('en')))).toBe('20.5 °C');
  expect(formatValue(cap('x', { type: 'number', decimals: 0, value: 1204 }), 'full', createTranslate('en')).text).toBe('1,204');
  expect(formatValue(cap('x', { type: 'number', decimals: 0, value: 1204 }), 'full', createTranslate('nl')).text).toBe('1.204');
  expect(joinValue(formatValue(cap('x', { type: 'number', units: 'W', value: 1234 }), 'tile', createTranslate('en')))).toBe('1.2 kW');
});

test('durations in English count hours in the plural too', () => {
  const english = createTranslate('en');
  expect(formatDuration(3124, english)).toBe('2 days and 4 hours');
  expect(formatDuration(61, english)).toBe('1 hour and 1 minute');
  expect(formatDuration(0.5, english)).toBe('less than a minute');
  expect(formatDuration(3124, t)).toBe('2 dagen en 4 uur');
});

test('the day and the time by themselves', () => {
  const en = createTranslate('en');
  expect([dayText(new Date(2026, 10, 23, 0, 5), t), timeText(new Date(2026, 10, 23, 0, 5), t)]).toEqual(['Maandag 23 november', '00:05']);
  expect([dayText(new Date(2026, 10, 23, 20, 41), en), timeText(new Date(2026, 10, 23, 20, 41), en)]).toEqual(['Monday 23 November', '20:41']);
});
