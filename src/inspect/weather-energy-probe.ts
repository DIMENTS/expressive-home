// Measures what the hub answers about its weather and its energy, as shapes: field names, kinds, the weather in
// numbers and plain words, energy only in orders of magnitude. Nothing of where or who: places, names and ids stay
// hidden, also when the hub puts them where they are not expected. Only for measuring, on the inspection page.

/** What the hub can be asked here, read only. */
export interface RawManagers {
  call(manager: 'sessions' | 'weather' | 'energy' | 'geolocation', operation: string, args?: Record<string, unknown>): Promise<unknown>;
  logs(): Promise<unknown>;
  /** Hears the names of what a manager of the hub sends; returns how to stop. */
  listen(uri: string, onEvent: (event: string) => void): Promise<() => void>;
}

type Kind = 'weather' | 'energy';

const ANSWER_MS = 15_000;
const DEPTH = 4;
/** Parts of field names whose values could say where the hub is or whose it is; a name is split at its capitals. */
const HIDDEN = new Set(['lat', 'latitude', 'lon', 'lng', 'longitude', 'geo', 'geolocation', 'location', 'city', 'place', 'address', 'addr', 'street', 'zip',
  'postal', 'postcode', 'country', 'region', 'name', 'title', 'label', 'uri', 'token', 'key', 'zone', 'ip', 'mac', 'timezone', 'tz', 'accuracy', 'homey',
  'owner', 'user', 'email', 'phone', 'id']);
/** Fields with an id that names a kind of thing, not a thing of the owner. */
const PLAIN_IDS = new Set(['iconId']);
/** Fields of the weather whose few words may be told as they are. */
const WEATHER_TEXT = new Set(['state', 'condition']);
/** A few plain words, only the first with a capital: a name of a place never passes. */
const PLAIN_WORDS = /^[\p{L}][\p{Ll}]*(?: [\p{Ll}]+){0,3}$/u;
/** A word of a fixed list, like a state of the weather. */
const WORD = /^[a-z0-9_.:-]{1,40}$/;
/** Units that can be told: a known list, so a short place name never passes as one. */
const UNITS = new Set(['°C', '°F', 'K', '%', 'W', 'kW', 'Wh', 'kWh', 'MWh', 'V', 'A', 'm/s', 'km/h', 'mph', 'Bft', 'hPa', 'mbar', 'bar', 'mm', 'cm', 'in', 'lx', 'ppm', 'EUR', 'DKK', 'SEK', 'NOK', 'GBP', 'USD', 'CHF']);
/** A field name that can be told as it is. */
const FIELD = /^[A-Za-z_][A-Za-z0-9_-]{0,40}$/;
/** Keys that are ids of things: never told. */
const ID_KEY = /^[0-9a-f]{8}-|:|^[0-9a-f]{16,}$/i;
/** Keys that are hours, days, weeks or months: told from first to last. */
const ORDER_KEY = /^(?:\d{1,4}|\d{4}-\d{2}(?:-\d{2})?|\d{4}-W\d{2})$/;
/** Fields that hold a time. */
const TIME_FIELD = /time|when|date|^t$|start|end|At$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const hidden = (field: string): boolean => !PLAIN_IDS.has(field) && field.split(/[_-]|(?=[A-Z])/).some((part) => HIDDEN.has(part.toLowerCase()));

function magnitude(value: number): string {
  if (value === 0) return '0';
  const power = Math.floor(Math.log10(Math.abs(value)));
  const rounded = 10 ** power;
  return `${value < 0 ? '-' : ''}~${power < 0 ? rounded.toFixed(-power) : String(rounded)}`;
}

/** A time as hours from now, or null when the value is none. */
function timeOf(value: unknown): number | null {
  if (typeof value === 'number') return value >= 1e9 && value < 4e9 ? value * 1000 : value >= 1e12 && value < 4e12 ? value : null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const at = Date.parse(value);
    return Number.isFinite(at) ? at : null;
  }
  return null;
}
const fromNow = (at: number, now: Date | null): string => {
  if (now === null) return 'tijd';
  const hours = Math.round((at - now.getTime()) / 3_600_000);
  return `tijd ${hours < 0 ? '-' : '+'}${Math.abs(hours)}u`;
};

function describeValue(value: unknown, kind: Kind, depth: number, field: string | null, now: Date | null): string {
  if (value === null || value === undefined) return 'leeg';
  if (typeof value === 'boolean') return 'ja/nee';
  const at = field !== null && TIME_FIELD.test(field) ? timeOf(value) : null;
  if (at !== null) return fromNow(at, now);
  if (typeof value === 'number') return `getal ${kind === 'weather' ? String(Math.round(value * 10) / 10) : magnitude(value)}`;
  if (typeof value === 'string') {
    if (UNITS.has(value)) return `eenheid ${value}`;
    if (WORD.test(value)) return `woord ${value}`;
    if (kind === 'weather' && field !== null && WEATHER_TEXT.has(field) && value.length <= 30 && PLAIN_WORDS.test(value)) return `tekst "${value}"`;
    return `tekst(${value.length})`;
  }
  if (depth >= DEPTH) return '…';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'lijst van 0';
    const times = value.slice(0, 12).map((item) => (isRecord(item) ? Object.entries(item).find(([key]) => TIME_FIELD.test(key)) : undefined))
      .map((entry) => (entry ? timeOf(entry[1]) : null));
    const told = now !== null && times.every((time) => time !== null) ? `, tijden ${times.map((time) => fromNow(time!, now).slice(5)).join(' ')}` : '';
    return `lijst van ${value.length}${told}: ${describeValue(value[0], kind, depth + 1, null, now)}`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const first = (): string => describeValue(value[keys[0]!], kind, depth + 1, null, now);
    // keyed by ids: how many, and what one holds
    if (keys.every((key) => ID_KEY.test(key))) return `{${keys.length} sleutels als id: ${first()}}`;
    // keyed by hours or days: from which to which
    if (keys.every((key) => ORDER_KEY.test(key))) {
      const ordered = [...keys].sort((a, b) => (/^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) - Number(b) : a.localeCompare(b)));
      return `{${keys.length} sleutels ${ordered[0]}…${ordered[ordered.length - 1]}: ${first()}}`;
    }
    const named = keys.filter((key) => FIELD.test(key) && !ID_KEY.test(key)).sort();
    const others = keys.length - named.length;
    const parts = named.map((key) => `${key} ${hidden(key) ? 'verborgen' : describeValue(value[key], kind, depth + 1, key, now)}`);
    return `{${[...parts, ...(others > 0 ? [`+${others} andere sleutels`] : [])].join('; ')}}`;
  }
  return 'anders';
}

/** What came back, as its shape; with `now`, times are told in hours from then. */
export const describeShape = (value: unknown, kind: Kind, now: Date | null = null): string => describeValue(value, kind, 0, null, now);

const failure = (error: unknown): string => {
  const { statusCode, status } = (isRecord(error) || error instanceof Error ? error : {}) as { statusCode?: unknown; status?: unknown };
  const code = typeof statusCode === 'number' ? statusCode : typeof status === 'number' ? status : null;
  return code === null ? 'fout' : `fout ${code}`;
};

async function inTime<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_done, fail) => { timer = setTimeout(() => fail(new Error('te laat')), ANSWER_MS); });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

const pad = (n: number): string => String(n).padStart(2, '0');
const dayOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The ISO week of a day, as year and number. */
function isoWeek(date: Date): { year: number; week: number } {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const start = Date.UTC(day.getUTCFullYear(), 0, 1);
  return { year: day.getUTCFullYear(), week: Math.ceil(((day.getTime() - start) / 86_400_000 + 1) / 7) };
}

/** How far a list of forecasts reaches, from the first time in an entry to the last, in hours from now. */
function reach(list: unknown, now: Date): string | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const timeOf = (entry: unknown): number | null => {
    if (!isRecord(entry)) return null;
    for (const value of Object.values(entry)) {
      const at = typeof value === 'string' ? Date.parse(value) : typeof value === 'number' && value > 1e12 ? value : NaN;
      if (Number.isFinite(at)) return at;
    }
    return null;
  };
  const [first, last] = [timeOf(list[0]), timeOf(list[list.length - 1])];
  if (first === null || last === null) return null;
  const hours = (at: number): string => `${Math.round((at - now.getTime()) / 3_600_000)}u`;
  return `van ${hours(first)} tot ${hours(last)} vanaf nu`;
}

/** The measurement, as text to paste; `listenMs`: how long to listen for news of the managers. */
export async function probeWeatherEnergy(raw: RawManagers, now: Date, listenMs: number): Promise<string> {
  const lines: string[] = ['--- weer en energie ---'];
  const ask = async (label: string, kind: Kind, manager: Parameters<RawManagers['call']>[0], operation: string, args?: Record<string, unknown>): Promise<unknown> => {
    try {
      const answer = await inTime(raw.call(manager, operation, args));
      lines.push(`${label}: ${describeShape(answer, kind, now)}`);
      return answer;
    } catch (error) {
      lines.push(`${label}: ${failure(error)}`);
      return undefined;
    }
  };

  try {
    const session = await inTime(raw.call('sessions', 'getSessionMe')) as { intersectedScopes?: unknown; scopes?: unknown } | null;
    const scopes = Array.isArray(session?.intersectedScopes) ? session.intersectedScopes : Array.isArray(session?.scopes) ? session.scopes : [];
    lines.push(`rechten: ${scopes.filter((scope): scope is string => typeof scope === 'string' && /^homey(?:\.[a-z]+)*$/.test(scope)).sort().join(' ') || 'geen'}`);
  } catch (error) {
    lines.push(`rechten: ${failure(error)}`);
  }

  await ask('weer nu', 'weather', 'weather', 'getWeather');
  const hourly = await ask('weer per uur', 'weather', 'weather', 'getWeatherHourly');
  const reached = reach(hourly, now);
  if (reached) lines.push(`weer per uur reikt: ${reached}`);
  await ask('weer toestand', 'weather', 'weather', 'getState');
  await ask('locatie', 'weather', 'geolocation', 'getOptionLocation');
  await ask('locatie toestand', 'weather', 'geolocation', 'getState');

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const { year, week } = isoWeek(now);
  await ask('energie toestand', 'energy', 'energy', 'getState');
  await ask('energie live', 'energy', 'energy', 'getLiveReport');
  await ask('energie rapporten', 'energy', 'energy', 'getReportsAvailable');
  await ask('energie dag', 'energy', 'energy', 'getReportDay', { date: dayOf(yesterday) });
  await ask('energie week', 'energy', 'energy', 'getReportWeek', { isoWeek: `${year}-W${pad(week)}` });
  await ask('energie maand', 'energy', 'energy', 'getReportMonth', { yearMonth: `${now.getFullYear()}-${pad(now.getMonth() + 1)}` });
  await ask('energie jaar', 'energy', 'energy', 'getReportYear', { year: String(now.getFullYear()) });
  await ask('energie munt', 'energy', 'energy', 'getCurrency');

  try {
    const logs = await inTime(raw.logs());
    const all = (isRecord(logs) ? Object.values(logs) : Array.isArray(logs) ? logs : []).filter(isRecord);
    const weather = all.filter((log) => typeof log['id'] === 'string' && log['id'].startsWith('homey:manager:weather:'))
      .map((log) => `${log['id'] as string} ${typeof log['units'] === 'string' && log['units'].length <= 6 ? log['units'] : '?'}`);
    lines.push(`reeksen van het weer: ${weather.length > 0 ? weather.join(', ') : 'geen'}`);
    lines.push(`reeksen energy_power: ${all.filter((log) => typeof log['id'] === 'string' && log['id'].endsWith(':energy_power')).length}`);
  } catch (error) {
    lines.push(`reeksen: ${failure(error)}`);
  }

  // news of the managers: only names, and how often
  for (const [label, uri] of [['nieuws energie', 'homey:manager:energy'], ['nieuws weer', 'homey:manager:weather']] as const) {
    const heard = new Map<string, number>();
    try {
      const stop = await inTime(raw.listen(uri, (event) => { if (WORD.test(event)) heard.set(event, (heard.get(event) ?? 0) + 1); }));
      await new Promise((done) => { setTimeout(done, listenMs); });
      stop();
      lines.push(`${label} in ${Math.round(listenMs / 1000)} s: ${heard.size > 0 ? [...heard].map(([event, n]) => `${event} ${n}`).join(', ') : 'niets'}`);
    } catch (error) {
      lines.push(`${label}: ${failure(error)}`);
    }
  }
  return lines.join('\n');
}
