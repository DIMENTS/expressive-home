// Homey Energy as the hub gives it (`/api/manager/energy/report/day|week|month`): the totals of a period in kWh, the
// same per hour or per day, and per device. The hub describes none of this; what is read here is what a real hub
// answered. A value the hub leaves empty stays empty; zero is a value.

import type { Translate } from '../i18n/index';

export type EnergyPeriod = 'day' | 'week' | 'month';
export const ENERGY_PERIODS: readonly EnergyPeriod[] = ['day', 'week', 'month'];

export interface EnergyTotals {
  consumed: number | null;
  generated: number | null;
  batteryCharged: number | null;
  batteryDischarged: number | null;
  imported: number | null;
  exported: number | null;
}

/** An hour or a day of the period. */
export interface EnergySlot { key: string; time: number | null; consumed: number | null; generated: number | null }

export interface EnergyReport { totals: EnergyTotals; slots: EnergySlot[]; devices: { id: string; consumed: number }[] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const pad = (n: number): string => String(n).padStart(2, '0');

/** The year, month and day of a moment in a time zone; the device's own when the zone is unknown. */
function partsIn(now: Date, timeZone: string): { year: number; month: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = (type: string): number => Number(parts.find((one) => one.type === type)?.value);
    return { year: part('year'), month: part('month'), day: part('day') };
  } catch {
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }
}

/** The ISO week of a day: Monday to Sunday, with the year the week belongs to. */
function isoWeek(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const week = Math.ceil(((date.getTime() - Date.UTC(weekYear, 0, 1)) / 86_400_000 + 1) / 7);
  return `${weekYear}-W${pad(week)}`;
}

/** What to ask the hub for the period that holds this moment, in the time zone of the hub. */
export function periodArgs(period: EnergyPeriod, now: Date, timeZone: string): { date: string } | { isoWeek: string } | { yearMonth: string } {
  const { year, month, day } = partsIn(now, timeZone);
  if (period === 'week') return { isoWeek: isoWeek(year, month, day) };
  if (period === 'month') return { yearMonth: `${year}-${pad(month)}` };
  return { date: `${year}-${pad(month)}-${pad(day)}` };
}

const totalsOf = (raw: unknown): EnergyTotals => {
  const electricity = isRecord(raw) ? raw : {};
  return {
    consumed: num(electricity['consumedPeriod']), generated: num(electricity['generatedPeriod']),
    batteryCharged: num(electricity['batteryChargedPeriod']), batteryDischarged: num(electricity['batteryDischargedPeriod']),
    imported: num(electricity['importedPeriod']), exported: num(electricity['exportedPeriod']),
  };
};

/** When a slot begins: an hour as a moment, a day or a month by the clock of this device. */
function timeOfKey(key: string): number | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).getTime();
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  if (month) return new Date(Number(month[1]), Number(month[2]) - 1, 1).getTime();
  if (/^\d{4}-\d{2}-\d{2}T/.test(key)) {
    const at = Date.parse(key);
    return Number.isFinite(at) ? at : null;
  }
  return null;
}

/** The energy of one device: a number, or the first number in what it has. */
function deviceValue(raw: unknown): number | null {
  if (num(raw) !== null) return raw as number;
  if (!isRecord(raw)) return null;
  const named = Object.entries(raw).find(([key, value]) => /consumed|value|total|kwh|energy/i.test(key) && num(value) !== null);
  return named ? named[1] as number : Object.values(raw).map(num).find((value) => value !== null) ?? null;
}

/** A report of the hub, or null when it is none. */
export function readEnergyReport(raw: unknown): EnergyReport | null {
  if (!isRecord(raw)) return null;
  const electricity = isRecord(raw['electricity']) ? raw['electricity'] : {};
  const subReports = isRecord(raw['subReports']) ? raw['subReports'] : {};
  const slots = Object.entries(subReports).slice(0, 62).map(([key, value]): EnergySlot => {
    const totals = totalsOf(isRecord(value) ? value['electricity'] : undefined);
    return { key, time: timeOfKey(key), consumed: totals.consumed, generated: totals.generated };
  }).sort((a, b) => (a.time !== null && b.time !== null ? a.time - b.time : a.key.localeCompare(b.key, undefined, { numeric: true })));
  const consumedDevices = isRecord(electricity['devices']) && isRecord(electricity['devices']['consumed']) ? electricity['devices']['consumed'] : {};
  const devices = Object.entries(consumedDevices).slice(0, 500).flatMap(([id, value]) => {
    const consumed = deviceValue(value);
    return consumed === null ? [] : [{ id: id.replace(/^homey:device:/, ''), consumed }];
  }).sort((a, b) => b.consumed - a.consumed);
  return { totals: totalsOf(electricity), slots, devices };
}

/** No report, or nothing at all in it. */
export function energyEmpty(report: EnergyReport | null): boolean {
  if (!report) return true;
  const { totals } = report;
  return Object.values(totals).every((value) => value === null) && report.devices.length === 0
    && report.slots.every((slot) => slot.consumed === null && slot.generated === null);
}

/** What went into the battery minus what came out; null when the hub knows neither. */
export function batteryNet(totals: EnergyTotals): number | null {
  if (totals.batteryCharged === null && totals.batteryDischarged === null) return null;
  return (totals.batteryCharged ?? 0) - (totals.batteryDischarged ?? 0);
}

/**
 * The largest devices that the dashboard knows, and the rest as "other": the total minus them, never below nothing;
 * without a total, the devices that are not shown.
 */
export function topDevices(report: EnergyReport, nameOf: (id: string) => string | undefined, count = 4): { rows: { id: string; name: string; consumed: number }[]; other: number | null } {
  const rows = report.devices.flatMap((device) => {
    const name = nameOf(device.id);
    return name === undefined ? [] : [{ ...device, name }];
  }).slice(0, count);
  const shown = rows.reduce((sum, row) => sum + row.consumed, 0);
  if (report.totals.consumed !== null) return { rows, other: Math.max(0, report.totals.consumed - shown) };
  const ids = new Set(rows.map((row) => row.id));
  const rest = report.devices.filter((device) => !ids.has(device.id));
  return { rows, other: rest.length === 0 ? null : rest.reduce((sum, device) => sum + device.consumed, 0) };
}

/** Kilowatt hours as they are shown: one decimal below ten, whole from ten. */
export function formatKwh(value: number | null, t: Translate): string {
  if (value === null) return '–';
  const digits = Math.abs(value) < 10 ? 1 : 0;
  return new Intl.NumberFormat(t.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** The sign of a value as it is shown: none when it is nothing once rounded. */
function signOf(value: number, minus: string): string {
  const digits = Math.abs(value) < 10 ? 1 : 0;
  const shown = Math.round(Math.abs(value) * 10 ** digits);
  return shown === 0 ? '' : value > 0 ? '+' : minus;
}

/** The battery as it is shown: with + or −, and without a sign when it is about even. */
export const formatSigned = (value: number, t: Translate): string => `${signOf(value, '−')}${formatKwh(Math.abs(value), t)}`;

/** Today, this week or this month on the clock of this device, and when it is over: at midnight. */
export function energyPeriodClock(period: EnergyPeriod): { keyOf(now: number): string; nextAt(now: number): number } {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    keyOf: (now) => JSON.stringify(periodArgs(period, new Date(now), zone)),
    nextAt: (now) => { const next = new Date(now); next.setHours(24, 0, 0, 0); return next.getTime(); },
  };
}

/** What a screen reader says of a period. */
export function energySentence(report: EnergyReport, period: EnergyPeriod, t: Translate): string {
  const { totals } = report;
  let sentence = t('energy.say', { period: t(`energy.period.${period}`), consumed: formatKwh(totals.consumed, t) });
  if (totals.generated !== null) sentence += t('energy.saySun', { n: formatKwh(totals.generated, t) });
  const battery = batteryNet(totals);
  if (battery !== null) sentence += t('energy.sayBattery', { n: `${signOf(battery, '-')}${formatKwh(Math.abs(battery), t)}` });
  return sentence;
}

const TOTAL_FIELDS = ['consumedPeriod', 'generatedPeriod', 'batteryChargedPeriod', 'batteryDischargedPeriod', 'importedPeriod', 'exportedPeriod'] as const;
type SlimTotals = Record<(typeof TOTAL_FIELDS)[number], number | null>;
const slimTotals = (raw: unknown): SlimTotals => {
  const from = isRecord(raw) ? raw : {};
  return Object.fromEntries(TOTAL_FIELDS.map((field) => [field, num(from[field])])) as SlimTotals;
};

/** Only what the dashboard uses, for a page: the totals, the use of each device, and the hours or days. */
export function slimEnergy(raw: unknown): { electricity: SlimTotals & { devices: { consumed: Record<string, number> } }; subReports: Record<string, { electricity: SlimTotals }> } | null {
  const report = readEnergyReport(raw);
  if (!report || !isRecord(raw)) return null;
  const electricity = isRecord(raw['electricity']) ? raw['electricity'] : {};
  const subReports = isRecord(raw['subReports']) ? raw['subReports'] : {};
  return {
    electricity: { ...slimTotals(electricity), devices: { consumed: Object.fromEntries(report.devices.map((device) => [device.id, device.consumed])) } },
    subReports: Object.fromEntries(Object.entries(subReports).slice(0, 62).map(([key, value]) => [key, { electricity: slimTotals(isRecord(value) ? value['electricity'] : undefined) }])),
  };
}
