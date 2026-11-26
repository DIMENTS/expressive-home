import { expect, test } from 'vitest';
import { createTranslate } from '../../src/i18n';
import { batteryNet, energyEmpty, energyPeriodClock, energySentence, formatKwh, formatSigned, periodArgs, readEnergyReport, topDevices } from '../../src/widgets/energy';

// The shapes a real hub gave, with made-up numbers.
const hourKey = (h: number) => new Date(Date.UTC(2026, 10, 24, 23 + h)).toISOString();
const sub = (consumed: number | null, generated: number | null) => ({ electricity: { consumedPeriod: consumed, generatedPeriod: generated, batteryChargedPeriod: 0, batteryDischargedPeriod: 0, importedPeriod: null, exportedPeriod: null }, gas: {}, water: {} });
const day = {
  id: 'x', date: '2026-11-25', currency: null, gas: {}, water: {},
  electricity: {
    consumedPeriod: 4.82, generatedPeriod: 6.2, batteryChargedPeriod: 2.5, batteryDischargedPeriod: 1.3, importedPeriod: null, exportedPeriod: null,
    devices: { consumed: { 'aaaa-1': 1.1, 'homey:device:aaaa-2': 0.9, 'aaaa-3': { consumedPeriod: 0.7 }, 'aaaa-4': 0.6, 'aaaa-5': 0.3, gone: 0.8 }, generated: { 'aaaa-9': 6.2 }, imported: {} },
    generatedMeasurePower: [{ t: 1, v: 0 }], solarForecastMeasurePower: [], pricesDynamicUserCosts: 'x',
  },
  subReports: Object.fromEntries(Array.from({ length: 24 }, (_, h) => [hourKey(h), sub(0.2, h >= 8 && h <= 16 ? 0.5 : 0)])),
};
const week = { isoWeek: '2026-W48', electricity: { consumedPeriod: 28, generatedPeriod: 31, devices: {} }, subReports: Object.fromEntries(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'].map((d) => [d, sub(4, 4.4)])) };

test('a period is asked by its day, ISO week or month, in the time zone of the hub', () => {
  // 23:30 in UTC is already the next day in Amsterdam
  const late = new Date('2026-11-25T23:30:00Z');
  expect(periodArgs('day', late, 'Europe/Amsterdam')).toEqual({ date: '2026-11-26' });
  expect(periodArgs('day', late, 'UTC')).toEqual({ date: '2026-11-25' });
  expect(periodArgs('week', late, 'Europe/Amsterdam')).toEqual({ isoWeek: '2026-W48' });
  expect(periodArgs('month', late, 'Europe/Amsterdam')).toEqual({ yearMonth: '2026-11' });
  // the last day of 2026 is in week 53 of 2026, the first of 2027 too
  expect(periodArgs('week', new Date('2026-12-31T12:00:00Z'), 'UTC')).toEqual({ isoWeek: '2026-W53' });
  expect(periodArgs('week', new Date('2027-01-02T12:00:00Z'), 'UTC')).toEqual({ isoWeek: '2026-W53' });
  expect(periodArgs('week', new Date('2027-01-04T12:00:00Z'), 'UTC')).toEqual({ isoWeek: '2027-W01' });
  // a zone the device does not know: the time of the device
  expect(periodArgs('day', late, 'Nowhere/Nothing')).toEqual({ date: expect.stringMatching(/^2026-11-2[56]$/) });
});

test('a report gives its totals, its hours or days, and the devices that used most', () => {
  const report = readEnergyReport(day)!;
  expect(report.totals).toEqual({ consumed: 4.82, generated: 6.2, batteryCharged: 2.5, batteryDischarged: 1.3, imported: null, exported: null });
  expect(report.slots).toHaveLength(24);
  expect(report.slots[0]).toEqual({ key: hourKey(0), time: Date.parse(hourKey(0)), consumed: 0.2, generated: 0 });
  expect(report.slots[10]!.generated).toBe(0.5);
  expect(report.devices).toEqual([{ id: 'aaaa-1', consumed: 1.1 }, { id: 'aaaa-2', consumed: 0.9 }, { id: 'gone', consumed: 0.8 }, { id: 'aaaa-3', consumed: 0.7 }, { id: 'aaaa-4', consumed: 0.6 }, { id: 'aaaa-5', consumed: 0.3 }]);
  const weekly = readEnergyReport(week)!;
  expect(weekly.slots.map((slot) => slot.key)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
  expect(weekly.slots[0]!.time).toBe(new Date(2026, 10, 23).getTime());
});

test('a day of 23 or 25 hours is read as it comes', () => {
  const short = { electricity: { consumedPeriod: 1 }, subReports: Object.fromEntries(Array.from({ length: 23 }, (_, h) => [hourKey(h), sub(0.1, 0)])) };
  const long = { electricity: { consumedPeriod: 1 }, subReports: Object.fromEntries(Array.from({ length: 25 }, (_, h) => [hourKey(h), sub(0.1, 0)])) };
  expect([readEnergyReport(short)!.slots.length, readEnergyReport(long)!.slots.length]).toEqual([23, 25]);
});

test('the four largest devices the dashboard knows, and the rest as other, never below nothing', () => {
  const report = readEnergyReport(day)!;
  const names: Record<string, string> = { 'aaaa-1': 'Koelkast', 'aaaa-2': 'Boiler', 'aaaa-3': 'Inductie', 'aaaa-4': 'Verwarming', 'aaaa-5': 'Lader' };
  const top = topDevices(report, (id) => names[id]);
  expect(top.rows).toEqual([{ id: 'aaaa-1', name: 'Koelkast', consumed: 1.1 }, { id: 'aaaa-2', name: 'Boiler', consumed: 0.9 }, { id: 'aaaa-3', name: 'Inductie', consumed: 0.7 }, { id: 'aaaa-4', name: 'Verwarming', consumed: 0.6 }]);
  expect(top.other).toBeCloseTo(4.82 - 3.3);
  const small = readEnergyReport({ electricity: { consumedPeriod: 1, devices: { consumed: { 'aaaa-1': 1.1 } } } })!;
  expect(topDevices(small, (id) => names[id]).other).toBe(0);
  const noTotal = readEnergyReport({ electricity: { consumedPeriod: null, devices: { consumed: { 'aaaa-1': 1, 'aaaa-5': 0.5, x: 0.25 } } } })!;
  expect(topDevices(noTotal, (id) => names[id], 1)).toEqual({ rows: [{ id: 'aaaa-1', name: 'Koelkast', consumed: 1 }], other: 0.75 });
});

test('empty is no report, or nothing at all in it; zero is a value', () => {
  expect(energyEmpty(null)).toBe(true);
  expect(energyEmpty(readEnergyReport({ electricity: { consumedPeriod: null, generatedPeriod: null, devices: { consumed: {} } }, subReports: {} }))).toBe(true);
  expect(energyEmpty(readEnergyReport({ electricity: { consumedPeriod: 0 } }))).toBe(false);
  expect(readEnergyReport('x')).toBeNull();
});

test('the battery counts what went in minus what came out', () => {
  expect(batteryNet(readEnergyReport(day)!.totals)).toBeCloseTo(1.2);
  expect(batteryNet({ consumed: 1, generated: null, batteryCharged: null, batteryDischarged: null, imported: null, exported: null })).toBeNull();
});

test('kilowatt hours with one decimal below ten, whole above, in the language of the dashboard; read out in words', () => {
  const nl = createTranslate('nl');
  const en = createTranslate('en');
  expect([formatKwh(4.82, nl), formatKwh(4.82, en), formatKwh(28.4, nl), formatKwh(0, nl), formatKwh(null, nl)]).toEqual(['4,8', '4.8', '28', '0,0', '–']);
  const report = readEnergyReport(day)!;
  expect(energySentence(report, 'day', nl)).toBe('Energie vandaag: 4,8 kilowattuur verbruikt, 6,2 van de zon, accu +1,2');
  expect(energySentence(report, 'week', en)).toBe('Energy this week: 4.8 kilowatt hours used, 6.2 from the sun, battery +1.2');
  expect(energySentence(readEnergyReport({ electricity: { consumedPeriod: 2 } })!, 'month', nl)).toBe('Energie deze maand: 2,0 kilowattuur verbruikt');
});

test('only what the dashboard uses goes to a page: totals, the devices with their use, the hours or days', async () => {
  const { slimEnergy } = await import('../../src/widgets/energy');
  const slim = slimEnergy(day)!;
  expect(Object.keys(slim).sort()).toEqual(['electricity', 'subReports']);
  expect(Object.keys(slim.electricity).sort()).toEqual(['batteryChargedPeriod', 'batteryDischargedPeriod', 'consumedPeriod', 'devices', 'exportedPeriod', 'generatedPeriod', 'importedPeriod']);
  expect(slim.electricity.devices).toEqual({ consumed: { 'aaaa-1': 1.1, 'aaaa-2': 0.9, 'aaaa-3': 0.7, 'aaaa-4': 0.6, 'aaaa-5': 0.3, gone: 0.8 } });
  expect(JSON.stringify(slim)).not.toMatch(/MeasurePower|prices|gas|water/);
  expect(readEnergyReport(slim)).toEqual(readEnergyReport(day));
  expect(slimEnergy('x')).toBeNull();
});

test('hours named by a bare number come in the order of the clock', () => {
  const report = readEnergyReport({ electricity: {}, subReports: Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h), { electricity: { consumedPeriod: h } }])) })!;
  expect(report.slots.map((slot) => slot.key)).toEqual(Array.from({ length: 24 }, (_, h) => String(h)));
});

test('a battery that is about even is shown and said as nothing, without a sign', () => {
  const nl = createTranslate('nl');
  expect([formatSigned(-0.02, nl), formatSigned(0.04, nl), formatSigned(-0.06, nl), formatSigned(1.25, nl)]).toEqual(['0,0', '0,0', '−0,1', '+1,3']);
  const even = readEnergyReport({ electricity: { consumedPeriod: 2, batteryChargedPeriod: 1, batteryDischargedPeriod: 1.02 } })!;
  expect(energySentence(even, 'day', nl)).toBe('Energie vandaag: 2,0 kilowattuur verbruikt, accu 0,0');
});

test('a period is over at midnight on this device: then it is another day, and maybe another week or month', () => {
  const late = new Date(2026, 10, 30, 23, 59).getTime();
  const after = new Date(2026, 11, 1, 0, 1).getTime();
  const day = energyPeriodClock('day');
  expect(day.nextAt(late)).toBe(new Date(2026, 11, 1).getTime());
  expect(day.keyOf(late)).not.toBe(day.keyOf(after));
  expect(energyPeriodClock('month').keyOf(late)).not.toBe(energyPeriodClock('month').keyOf(after));
  // the 30th of November and the 1st of December are in one week
  expect(energyPeriodClock('week').keyOf(late)).toBe(energyPeriodClock('week').keyOf(after));
});
