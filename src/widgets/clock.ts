/** What the clock widget shows at one moment. */
export interface ClockView {
  /** "09:08", or "09:08:07" with seconds. */
  time: string;
  /** "di 24 nov": under the time on a narrow tile; '' without the date. */
  short: string;
  /** "dinsdag": beside the time on a wide tile. */
  weekday: string;
  /** "24 november". */
  long: string;
  /** What a screen reader says. */
  label: string;
}

export interface ClockChoice { seconds: boolean; date: boolean }

/** The time and date in the habits of the language, from the clock of the device. */
export function clockView(now: Date, locale: string, choice: ClockChoice): ClockView {
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', ...(choice.seconds ? { second: '2-digit' } : {}) }).format(now);
  if (!choice.date) return { time, short: '', weekday: '', long: '', label: time };
  const short = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(now).replace(/\.(?=\s|$)/g, '').replace(',', '');
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now);
  const long = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(now);
  return { time, short, weekday, long, label: `${time}, ${weekday} ${long}` };
}

/** Milliseconds until the shown time changes. */
export function nextTick(now: Date, seconds: boolean): number {
  const ms = now.getMilliseconds();
  return seconds ? 1000 - ms : (60 - now.getSeconds()) * 1000 - ms;
}
