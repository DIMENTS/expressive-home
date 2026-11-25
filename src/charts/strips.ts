import type { HistorySwitches } from '../homey/client';
import type { Translate } from '../i18n';
import { startOfDay } from './times';

/** A stretch of time in one state. */
export interface Stretch { from: number; to: number; on: boolean }
/** One day of on and off: from its midnight (or the oldest change) to the next midnight (or now). */
export interface DayStrip { start: number; end: number; label: string; stretches: Stretch[] }

/** At most this many days are shown; changes from before them go. */
export const STRIP_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * The days of a yes/no log, newest first: what is known from the oldest change up to now, cut at the midnights of the
 * zone. The state of now comes from the device itself when it is known.
 */
export function stripsFrom(changes: HistorySwitches['changes'], nowOn: boolean | null, now: number, zone: string | undefined, t: Translate): { days: DayStrip[]; since: number | null; count: number } {
  const known = changes.filter((change) => change.at <= now);
  if (known.length === 0) return { days: [], since: null, count: 0 };
  const stretches: Stretch[] = known.map((change, i) => ({ from: change.at, to: known[i + 1]?.at ?? now, on: i === known.length - 1 ? nowOn ?? change.on : change.on }));
  const today = startOfDay(now, zone);
  const days: DayStrip[] = [];
  for (let n = 0; n < STRIP_DAYS; n++) {
    // a day back from a moment in its middle, so a day of 23 or 25 hours is found all the same
    const start = n === 0 ? today : startOfDay(today - n * DAY_MS + DAY_MS / 2, zone);
    const end = n === 0 ? now : days[n - 1]!.start;
    const inside = stretches.filter((s) => s.to > start && s.from < end).map((s) => ({ from: Math.max(s.from, start), to: Math.min(s.to, end), on: s.on }));
    if (inside.length === 0) break;
    const label = n === 0 ? t('chart.today') : n === 1 ? t('chart.yesterday')
      : new Intl.DateTimeFormat(t.locale, { timeZone: zone, weekday: 'short', day: 'numeric' }).format(start).replace(/\./g, '');
    days.push({ start, end, label, stretches: inside });
  }
  return { days, since: known[0]!.at, count: known.length };
}
