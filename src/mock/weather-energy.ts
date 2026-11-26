// The weather and Homey Energy of the example hub, in the shapes a real hub gives, made up around the moment asked for,
// the same for the same moment.

import type { Device } from '../homey/types';
import type { EnergyPeriod } from '../widgets/energy';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const round = (value: number, digits = 2): number => Math.round(value * 10 ** digits) / 10 ** digits;

const DAY_ICONS = ['clouds_light_day', 'clear_day', 'clear_day', 'clouds_light_day', 'clouds_heavy_day', 'rain_light_day'];
const NIGHT_ICONS = ['clouds_light_night', 'clear_night', 'clouds_heavy_night'];
const STATES: Record<string, string> = {
  clouds_light_day: 'Half bewolkt', clear_day: 'Zonnig', clouds_heavy_day: 'Geheel bewolkt', rain_light_day: 'Lichte regen',
  clouds_light_night: 'Half bewolkt', clear_night: 'Helder', clouds_heavy_night: 'Geheel bewolkt',
};

const iconAt = (at: number): string => {
  const date = new Date(at);
  const hour = date.getHours();
  const turn = Math.floor(at / HOUR_MS / 3);
  return hour >= 7 && hour < 19 ? DAY_ICONS[turn % DAY_ICONS.length]! : NIGHT_ICONS[turn % NIGHT_ICONS.length]!;
};
const temperatureAt = (at: number): number => {
  const hour = new Date(at).getHours() + new Date(at).getMinutes() / 60;
  const day = Math.floor(at / DAY_MS);
  return round(9 + (day % 4) - 1 + 4 * Math.sin(((hour - 9) / 24) * 2 * Math.PI), 1);
};

/** The weather of now, five hours from the running one, and six days from tomorrow at noon. */
export function mockWeather(now: number): Record<string, unknown> {
  const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  const icon = iconAt(now);
  const today = Array.from({ length: 24 }, (_, h) => temperatureAt(new Date(now).setHours(h, 0, 0, 0)));
  const noon = (days: number): number => { const date = new Date(now); date.setDate(date.getDate() + days); return date.setHours(12, 0, 0, 0); };
  return {
    when: new Date(hourStart).toISOString(), iconId: icon, state: STATES[icon] ?? 'Bewolkt',
    temperature: temperatureAt(now), temperatureCelsius: temperatureAt(now), temperatureMax: Math.max(...today), temperatureMin: Math.min(...today), temperatureUnits: '°C',
    humidity: 0.78, pressure: 1.013,
    forecastHourly: Array.from({ length: 5 }, (_, i) => {
      const at = hourStart + i * HOUR_MS;
      return { time: at / 1000, iconId: iconAt(at), temperature: temperatureAt(at), temperatureMax: temperatureAt(at) + 0.3, temperatureMin: temperatureAt(at) - 0.3 };
    }),
    forecast: Array.from({ length: 6 }, (_, i) => {
      const at = noon(i + 1);
      const day = Array.from({ length: 24 }, (_, h) => temperatureAt(at + (h - 12) * HOUR_MS));
      return { time: at / 1000, iconId: DAY_ICONS[(i * 2 + 1) % DAY_ICONS.length], temperature: temperatureAt(at), temperatureMax: Math.max(...day), temperatureMin: Math.min(...day), weatherId: 800 };
    }),
  };
}

/** How much a device uses on a day, in kWh: the same for the same device. */
const perDay = (id: string): number => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return round(0.2 + (hash % 13) / 10, 2);
};
/** How much of a day's use falls in an hour, and how much sun. */
const useShare = (hour: number): number => (hour >= 7 && hour <= 22 ? (hour === 8 || hour >= 17 && hour <= 20 ? 0.08 : 0.04) : 0.016);
const sunShare = (hour: number): number => Math.max(0, Math.sin(((hour - 7) / 11) * Math.PI)) / 7;

const electricity = (consumed: number | null, generated: number | null, devices: Record<string, number> = {}) => ({
  consumedPeriod: consumed === null ? null : round(consumed), generatedPeriod: generated === null ? null : round(generated),
  batteryChargedPeriod: generated === null ? null : round(generated * 0.4), batteryDischargedPeriod: consumed === null ? null : round(consumed * 0.25),
  importedPeriod: null, exportedPeriod: null,
  devices: { consumed: devices, generated: {}, batteryCharged: {}, batteryDischarged: {}, imported: {}, exported: {} },
});

/** A report of Homey Energy for the period that holds now, by the clock of this device. */
export function mockEnergy(period: EnergyPeriod, now: number, devices: Readonly<Record<string, Device>>): Record<string, unknown> {
  const users = Object.values(devices).filter((device) => device.capabilities['measure_power'] && device.deviceClass !== 'solarpanel' && device.deviceClass !== 'battery');
  const dayUse = users.reduce((sum, device) => sum + perDay(device.id), 0);
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  const sunPerDay = 6.2;
  const pad = (n: number): string => String(n).padStart(2, '0');
  const dayKey = (at: number): string => { const date = new Date(at); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; };
  let slots: { key: string; use: number | null; sun: number | null; share: number }[];
  if (period === 'day') {
    slots = Array.from({ length: 24 }, (_, hour) => {
      const at = new Date(dayStart).setHours(hour);
      const done = at <= now;
      return { key: new Date(at).toISOString(), use: done ? dayUse * useShare(hour) : null, sun: done ? sunPerDay * sunShare(hour) : null, share: done ? useShare(hour) : 0 };
    });
  } else {
    const date = new Date(dayStart);
    const first = period === 'week' ? new Date(dayStart).setDate(date.getDate() - ((date.getDay() + 6) % 7)) : new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    const count = period === 'week' ? 7 : new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    slots = Array.from({ length: count }, (_, i) => {
      const at = new Date(first).setDate(new Date(first).getDate() + i);
      const done = at <= dayStart;
      const weather = 0.6 + ((Math.floor(at / DAY_MS) * 7) % 10) / 20;
      return { key: dayKey(at), use: done ? dayUse * (0.85 + weather / 4) : null, sun: done ? sunPerDay * weather : null, share: done ? 1 : 0 };
    });
  }
  const sum = (pick: (slot: (typeof slots)[number]) => number | null): number => slots.reduce((total, slot) => total + (pick(slot) ?? 0), 0);
  const days = sum((slot) => slot.share);
  const perDevice = Object.fromEntries(users.map((device) => [device.id, round(perDay(device.id) * days)]));
  return {
    id: `mock-${period}`, currency: null,
    electricity: electricity(sum((slot) => slot.use), sum((slot) => slot.sun), perDevice),
    gas: { devices: { imported: {} }, importedPeriod: null }, water: { devices: { imported: {} }, importedPeriod: null },
    subReports: Object.fromEntries(slots.map((slot) => [slot.key, { electricity: electricity(slot.use, slot.sun), gas: {}, water: {} }])),
  };
}
