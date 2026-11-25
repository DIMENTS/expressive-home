import { expect, test } from 'vitest';
import { createTranslate } from '../../src/i18n';
import { stripsFrom } from '../../src/charts/strips';
import { momentText, seriesSentence, stateWords, switchesSentence } from '../../src/charts/say';

const ZONE = 'Europe/Amsterdam';
const at = (text: string): number => Date.parse(text);
const nl = createTranslate('nl');
const en = createTranslate('en');

test('days of on and off: newest first, nothing before the oldest change, today ends at now', () => {
  const now = at('2026-11-25T17:00:00Z'); // 18:00 in Amsterdam
  const changes = [
    { at: at('2026-11-24T06:05:00Z'), on: true },
    { at: at('2026-11-24T06:50:00Z'), on: false },
    { at: at('2026-11-25T16:02:00Z'), on: true },
  ];
  const { days, since, count } = stripsFrom(changes, true, now, ZONE, nl);
  expect([since, count]).toEqual([changes[0]!.at, 3]);
  expect(days.map((day) => day.label)).toEqual(['Vandaag', 'Gisteren']);
  expect(days[0]!.end).toBe(now);
  expect(days[0]!.stretches).toEqual([{ from: days[0]!.start, to: changes[2]!.at, on: false }, { from: changes[2]!.at, to: now, on: true }]);
  // yesterday starts at the oldest change, not at midnight
  expect(days[1]!.stretches[0]).toEqual({ from: changes[0]!.at, to: changes[1]!.at, on: true });
  expect(days[1]!.stretches.at(-1)).toEqual({ from: changes[1]!.at, to: days[0]!.start, on: false });
});

test('at most seven days; a day before that goes; older days are named by weekday and date', () => {
  const now = at('2026-11-25T17:00:00Z');
  const changes = Array.from({ length: 50 }, (_, i) => ({ at: now - (50 - i) * 5 * 3_600_000, on: i % 2 === 0 }));
  const { days } = stripsFrom(changes, null, now, ZONE, nl);
  expect(days).toHaveLength(7);
  expect(days.map((day) => day.label).slice(2)).toEqual(['ma 23', 'zo 22', 'za 21', 'vr 20', 'do 19']);
  expect(stripsFrom([], false, now, ZONE, nl).days).toEqual([]);
});

test('the words of the moments and the sentences, in both languages', () => {
  const moment = at('2026-11-24T13:20:00Z');
  expect(momentText('last24Hours', moment, ZONE, nl)).toBe('14:20');
  expect(momentText('last7Days', moment, ZONE, nl)).toBe('di 14:20');
  expect(momentText('last31Days', moment, ZONE, nl)).toBe('24 nov');
  expect(momentText('year', moment, ZONE, en)).toBe('24 Nov');
  expect(seriesSentence({ name: 'Temperatuur', period: 'last24Hours', now: '22,4 °C', low: '17,6 °C', lowAt: '06:25', high: '23,1 °C', highAt: '15:40' }, nl))
    .toBe('Temperatuur, laatste 24 uur: nu 22,4 °C, laagste 17,6 °C om 06:25, hoogste 23,1 °C om 15:40.');
  expect(seriesSentence({ name: 'Temperature', period: 'year', now: '22.4 °C', low: '1.2 °C', lowAt: '12 Jan', high: '31 °C', highAt: '2 Aug' }, en))
    .toBe('Temperature, last 12 months: now 22.4 °C, lowest 1.2 °C on 12 Jan, highest 31 °C on 2 Aug.');
  expect(stateWords('alarm_contact', nl)).toEqual({ on: 'Open', off: 'Dicht' });
  expect(stateWords('alarm_motion', nl)).toEqual({ on: 'Beweging', off: 'Geen beweging' });
  expect(stateWords('onoff', en)).toEqual({ on: 'On', off: 'Off' });
  expect(switchesSentence({ name: 'Sfeerlamp', baseId: 'onoff', count: 50, since: 'zaterdag 17:12', todayTimes: 2, todayDuration: '1 uur en 51 minuten', nowOn: true, nowSince: '18:02' }, nl))
    .toBe('Sfeerlamp, de laatste 50 keer aan of uit, sinds zaterdag 17:12. Vandaag 2 keer aan, samen 1 uur en 51 minuten. Nu aan sinds 18:02.');
});
