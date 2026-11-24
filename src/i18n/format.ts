import type { Capability } from '../homey/types';
import type { MessageKey, Translate } from './index';

/** A value as text, with its unit apart: the interface may set the unit smaller. */
export interface Formatted { text: string; unit: string }

const NONE = (t: Translate): Formatted => ({ text: t('value.none'), unit: '' });

/** At most `decimals` decimals; trailing zeros drop. In the locale of the language. */
function number(value: number, decimals: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: Math.max(0, Math.min(20, decimals)), minimumFractionDigits: 0 }).format(value);
}

/** Without a number from the hub: none from 100, otherwise at most one. */
const defaultDecimals = (value: number): number => (Math.abs(value) >= 100 ? 0 : 1);

/** Rounds half away from zero, as the number format does; a result of minus zero becomes zero. */
function round(value: number, places: number): number {
  const factor = 10 ** Math.max(0, Math.min(20, places));
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** The number as it will be shown: in its shown unit, rounded to the shown places. */
function shownNumber(cap: Capability, value: number, mode: 'tile' | 'full'): { value: number; unit: string; places: number } {
  let shown = value;
  let unit = cap.units ?? '';
  let decimals = cap.decimals;
  if (cap.min === 0 && cap.max === 1) {
    // a range of 0 to 1 reads as a percentage, whatever unit the hub gives
    shown = value * 100;
    unit = '%';
    decimals = decimals === null ? null : Math.max(0, decimals - 2);
  }
  let places = decimals ?? defaultDecimals(shown);
  if (mode === 'tile') {
    places = Math.min(places, 1);
    if (unit === '%' || unit === 'W' || Math.abs(shown) >= 100) places = 0;
  }
  // Decided after rounding, so 999.6 W shows as 1 kW and never as 1000 W.
  if (unit === 'W' && Math.abs(round(shown, places)) >= 1000) return { value: round(value / 1000, 1), unit: 'kW', places: 1 };
  return { value: round(shown, places), unit, places };
}

function formatNumber(cap: Capability, value: number, mode: 'tile' | 'full', locale: string): Formatted {
  const shown = shownNumber(cap, value, mode);
  return { text: number(shown.value, shown.places, locale), unit: shown.unit };
}

/** Whether a number capability shows as zero once rounded, so a sign in front of it would mislead. */
export function showsAsZero(cap: Capability, value: number, mode: 'tile' | 'full'): boolean {
  return shownNumber(cap, value, mode).value === 0;
}

function formatBoolean(cap: Capability, value: boolean, t: Translate): Formatted {
  if (cap.baseId === 'onoff') return { text: t(value ? 'tile.on' : 'tile.off'), unit: '' };
  const own = value ? cap.titleTrue : cap.titleFalse;
  return { text: own ?? t(value ? 'value.yes' : 'value.no'), unit: '' };
}

/**
 * A capability's value as text: short on tiles, in the hub's own precision in the device window.
 * Never throws and never shows NaN or undefined: a missing or odd value becomes a dash.
 */
export function formatValue(cap: Capability | undefined, mode: 'tile' | 'full', t: Translate): Formatted {
  if (!cap) return NONE(t);
  const { value } = cap;
  if (value === null || value === undefined) return NONE(t);
  if (typeof value === 'boolean') return formatBoolean(cap, value, t);
  if (cap.type === 'enum' || cap.options.length > 0) {
    const option = cap.options.find((o) => o.id === String(value));
    if (option) return { text: option.title, unit: '' };
  }
  if (typeof value === 'number') return Number.isFinite(value) ? formatNumber(cap, value, mode, t.locale) : NONE(t);
  // Text where a number belongs is a broken value, not something to show.
  if (typeof value === 'string') return value.trim() === '' || cap.type === 'number' ? NONE(t) : { text: value, unit: '' };
  return NONE(t);
}

/** "45 W", "80%", "–": a space before the unit, except before the percent sign. */
export function joinValue(f: Formatted): string {
  if (!f.unit) return f.text;
  return f.unit === '%' ? `${f.text}%` : `${f.text} ${f.unit}`;
}

/** "2 dagen en 4 uur": at most two adjacent units, the largest first. Empty for a negative or odd number. */
export function formatDuration(minutes: number, t: Translate): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  const whole = Math.floor(minutes);
  if (whole < 1) return t('duration.short');
  const days = Math.floor(whole / 1440);
  const hours = Math.floor((whole % 1440) / 60);
  const mins = whole % 60;
  const day = (n: number) => t(n === 1 ? 'duration.day' : 'duration.days', { n });
  const hour = (n: number) => t(n === 1 ? 'duration.hour' : 'duration.hours', { n });
  const minute = (n: number) => t(n === 1 ? 'duration.minute' : 'duration.minutes', { n });
  const pair = (a: string, b: string | null) => (b ? t('duration.and', { a, b }) : a);
  if (days > 0) return pair(day(days), hours > 0 ? hour(hours) : null);
  if (hours > 0) return pair(hour(hours), mins > 0 ? minute(mins) : null);
  return minute(mins);
}

/** Goedemorgen from 6 to 12, Goedemiddag to 18, Goedenavond to 24, Goedenacht from 0 to 6. */
export function greetingKey(date: Date): Extract<MessageKey, 'greeting.night' | 'greeting.morning' | 'greeting.afternoon' | 'greeting.evening'> {
  const hour = date.getHours();
  if (hour < 6) return 'greeting.night';
  if (hour < 12) return 'greeting.morning';
  if (hour < 18) return 'greeting.afternoon';
  return 'greeting.evening';
}

/** "Zondag 22 november · 14:32", "Sunday 22 November · 14:32": the time is 24-hour in both languages. */
export function dateLine(date: Date, t: Translate): string {
  return `${dayText(date, t)} · ${timeText(date, t)}`;
}

/** "Zondag 22 november", "Sunday 22 November". */
export function dayText(date: Date, t: Translate): string {
  const day = new Intl.DateTimeFormat(t.locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}`;
}

/** "14:32", 24-hour in both languages. */
export function timeText(date: Date, t: Translate): string {
  return new Intl.DateTimeFormat(t.locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
