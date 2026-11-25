import type { HistoryPeriod } from '../homey/client';
import type { MessageKey, Translate } from '../i18n';

const PERIOD_WORD: Record<HistoryPeriod, MessageKey> = {
  today: 'chart.period.today', last24Hours: 'chart.period.last24Hours', last7Days: 'chart.period.last7Days', last31Days: 'chart.period.last31Days', year: 'chart.period.year',
};
/** Periods whose moments are a time of day; the others are a date. */
const BY_TIME: readonly HistoryPeriod[] = ['today', 'last24Hours', 'last7Days'];

/** A moment as a chart of this period says it: "14:20", "di 14:20", "24 nov". */
export function momentText(period: HistoryPeriod, at: number, zone: string | undefined, t: Translate): string {
  const options: Intl.DateTimeFormatOptions = period === 'today' || period === 'last24Hours' ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : period === 'last7Days' ? { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat(t.locale, { timeZone: zone, ...options }).format(at).replace(/\./g, '').replace(/,/g, '');
}

/** The words of the two states of a yes/no value, as on its tile. */
export function stateWords(baseId: string, t: Translate): { on: string; off: string } {
  if (baseId === 'alarm_contact') return { on: t('chart.open'), off: t('chart.closed') };
  if (baseId === 'alarm_motion') return { on: t('chart.motion'), off: t('chart.noMotion') };
  return { on: t('tile.on'), off: t('tile.off') };
}

/** "Temperatuur, laatste 24 uur: nu 22,4 °C, laagste 17,6 °C om 06:25, hoogste 23,1 °C om 15:40." */
export function seriesSentence(m: { name: string; period: HistoryPeriod; now: string; low: string; lowAt: string; high: string; highAt: string }, t: Translate): string {
  return t(BY_TIME.includes(m.period) ? 'chart.sentence.time' : 'chart.sentence.day', {
    name: m.name, period: t(PERIOD_WORD[m.period]), now: m.now, low: m.low, lowAt: m.lowAt, high: m.high, highAt: m.highAt,
  });
}

/** The name of a period in running text: "laatste 24 uur". */
export const periodWord = (period: HistoryPeriod, t: Translate): string => t(PERIOD_WORD[period]);

/** "Sfeerlamp, de laatste 50 keer aan of uit, sinds zaterdag 17:12. Vandaag 2 keer aan, samen 1 uur 51. Nu aan sinds 18:02." */
export function switchesSentence(m: { name: string; baseId: string; count: number; since: string; todayTimes: number; todayDuration: string; nowOn: boolean | null; nowSince: string | null }, t: Translate): string {
  const words = stateWords(m.baseId, t);
  const on = words.on.toLowerCase();
  const off = words.off.toLowerCase();
  const parts = [t('chart.switches.sentence', { name: m.name, count: m.count, on, off, since: m.since })];
  if (m.todayTimes > 0) parts.push(t('chart.switches.today', { times: m.todayTimes, on, duration: m.todayDuration }));
  if (m.nowOn !== null && m.nowSince !== null) parts.push(t('chart.switches.now', { state: m.nowOn ? on : off, since: m.nowSince }));
  return parts.join(' ');
}
