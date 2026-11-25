import type { HistoryPeriod, HistorySeries } from '../homey/client';
import type { Translate } from '../i18n';

/** A time under a chart: where, and what it says. */
export interface Tick { at: number; label: string }

const HOUR_MS = 3_600_000;
/** A time closer to "now" than this part of the width goes, so they do not run into each other. */
const NEAR_NOW = 0.08;
const QUARTERS = [1, 4, 7, 10];

interface Parts { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

const calendars = new Map<string, Intl.DateTimeFormat>();

/** The calendar of a moment in a time zone; the device's zone without one. */
function partsIn(at: number, zone: string | undefined): Parts {
  let calendar = calendars.get(zone ?? '');
  if (!calendar) {
    calendar = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' });
    calendars.set(zone ?? '', calendar);
  }
  const parts = calendar.formatToParts(at);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')), hour: Number(get('hour')), minute: Number(get('minute')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  };
}

/** The whole hours between two moments, as the clock of the zone shows them; a day of 23 or 25 hours follows the clock. */
function wholeHours(start: number, end: number, zone: string | undefined, keep: (parts: Parts) => boolean): number[] {
  const found: number[] = [];
  // every zone of the world is on a whole hour or on a half or quarter; the hour itself is checked by its parts
  for (let at = Math.ceil(start / (HOUR_MS / 4)) * (HOUR_MS / 4); at <= end; at += HOUR_MS / 4) {
    const parts = partsIn(at, zone);
    if (parts.minute === 0 && keep(parts)) found.push(at);
  }
  return found;
}

/** The midnight of the zone that begins the day of a moment, also on a day of 23 or 25 hours. */
export function startOfDay(at: number, zone: string | undefined): number {
  const parts = partsIn(at, zone);
  let midnight = at - (parts.hour * 60 + parts.minute) * 60_000;
  midnight -= midnight % 60_000;
  const check = partsIn(midnight, zone);
  if (check.hour !== 0) midnight += (check.hour > 12 ? 24 - check.hour : -check.hour) * HOUR_MS;
  return midnight;
}

/** Midnights of the zone between two moments; per day, not per quarter hour, for long periods. */
function midnights(start: number, end: number, zone: string | undefined, keep: (parts: Parts) => boolean): number[] {
  const found: number[] = [];
  for (let at = start; at <= end + 86_400_000; at += 86_400_000) {
    const midnight = startOfDay(at, zone);
    if (midnight > start && midnight <= end && keep(partsIn(midnight, zone)) && !found.includes(midnight)) found.push(midnight);
  }
  return found;
}

/**
 * The times under a chart of a period: Dag every whole six hours, Week the days, Maand the Mondays, Jaar the quarters;
 * and "nu" at the end. A time too close to "nu" goes.
 */
export function timesFor(period: HistoryPeriod, start: number, end: number, zone: string | undefined, t: Translate): Tick[] {
  const span = end - start;
  const format = (at: number, options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat(t.locale, { timeZone: zone, ...options }).format(at).replace(/\.$/, '');
  let ticks: Tick[];
  if (period === 'today' || period === 'last24Hours') {
    ticks = wholeHours(start, end, zone, (parts) => parts.hour % 6 === 0).map((at) => ({ at, label: format(at, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) }));
  } else if (period === 'last7Days') {
    ticks = midnights(start, end, zone, () => true).map((at) => ({ at, label: format(at, { weekday: 'short' }) }));
  } else if (period === 'last31Days') {
    ticks = midnights(start, end, zone, (parts) => parts.weekday === 1).map((at) => ({ at, label: format(at, { day: 'numeric', month: 'short' }) }));
  } else {
    ticks = midnights(start, end, zone, (parts) => parts.day === 1 && QUARTERS.includes(parts.month)).map((at) => ({ at, label: format(at, { month: 'short' }) }));
  }
  return [...ticks.filter((tick) => span <= 0 || (end - tick.at) / span > NEAR_NOW), { at: end, label: t('chart.now') }];
}

/** The point nearest to a moment; null in a series without points. */
export function readAt(series: HistorySeries, at: number): HistorySeries['points'][number] | null {
  let best: HistorySeries['points'][number] | null = null;
  for (const point of series.points) if (!best || Math.abs(point.at - at) < Math.abs(best.at - at)) best = point;
  return best;
}
