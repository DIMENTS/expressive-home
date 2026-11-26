// The weather as the hub gives it (`GET /api/manager/weather/weather`): now, the hours ahead and the days ahead, each
// with an icon of the hub and the highest and lowest temperature. The hub describes none of this; what is read here is
// what a real hub answered, and whatever else comes is left out.

import type { MessageKey, Translate } from '../i18n/index';
import type { IconName } from '../ui/icons/icons';

/** The icons of the dashboard that weather can have. */
export type WeatherIcon = 'sunny' | 'clear_night' | 'partly_cloudy_day' | 'partly_cloudy_night' | 'cloud' | 'rainy' | 'weather_snowy' | 'thunderstorm' | 'foggy';

/** The icon a weather icon is drawn with: a clear night is the moon the dashboard already has. */
export const weatherIconName = (icon: WeatherIcon): IconName => (icon === 'clear_night' ? 'bedtime' : icon);

export interface WeatherPoint {
  /** In ms. */
  time: number;
  icon: WeatherIcon;
  /** Whether the hub's icon was one the dashboard knows. */
  known: boolean;
  temperature: number | null;
  max: number | null;
  min: number | null;
}

export interface Weather {
  /** When the hub had this weather, in ms; null when it does not say. */
  at: number | null;
  icon: WeatherIcon;
  known: boolean;
  /** The hub's own words, in the hub's language. */
  state: string | null;
  temperature: number;
  max: number | null;
  min: number | null;
  unit: '°C' | '°F';
  humidity: number | null;
  /** From the running hour on. */
  hours: WeatherPoint[];
  /** From tomorrow on, at noon. */
  days: WeatherPoint[];
  /** Whether the sun is up at the place of the hub, by the name of the icon of now; null when that does not say. */
  daylight: boolean | null;
}

/** From when the time of the weather is shown with it, and from when it counts as none. */
export const WEATHER_AGE = { oldMs: 90 * 60_000, goneMs: 6 * 3_600_000 } as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The icon of the dashboard for an icon of the hub, by the words in it. */
export function iconOf(iconId: unknown): { icon: WeatherIcon; known: boolean } {
  const words = typeof iconId === 'string' ? iconId.toLowerCase().split(/[_\-\s]+/) : [];
  const has = (...some: string[]): boolean => some.some((word) => words.some((part) => part.startsWith(word)));
  const night = has('night');
  if (has('thunder', 'storm', 'lightning')) return { icon: 'thunderstorm', known: true };
  if (has('snow', 'sleet', 'hail')) return { icon: 'weather_snowy', known: true };
  if (has('rain', 'drizzle', 'shower')) return { icon: 'rainy', known: true };
  if (has('fog', 'mist', 'haze')) return { icon: 'foggy', known: true };
  if (has('clear', 'sun')) return { icon: night ? 'clear_night' : 'sunny', known: true };
  if (has('cloud', 'overcast')) {
    if (has('light', 'few', 'partly', 'scattered')) return { icon: night ? 'partly_cloudy_night' : 'partly_cloudy_day', known: true };
    return { icon: 'cloud', known: true };
  }
  return { icon: 'cloud', known: false };
}

const timeOf = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e11 ? value * 1000 : value;
  if (typeof value === 'string') {
    const at = Date.parse(value);
    return Number.isFinite(at) ? at : null;
  }
  return null;
};

function pointOf(raw: unknown): WeatherPoint | null {
  if (!isRecord(raw)) return null;
  const time = timeOf(raw['time']);
  if (time === null) return null;
  return { time, ...iconOf(raw['iconId']), temperature: num(raw['temperature']), max: num(raw['temperatureMax']), min: num(raw['temperatureMin']) };
}

const pointsOf = (raw: unknown): WeatherPoint[] => (Array.isArray(raw) ? raw.slice(0, 48).flatMap((item) => pointOf(item) ?? []) : []);

/** The weather the hub gave, or null when it is none. */
export function readWeather(raw: unknown): Weather | null {
  if (!isRecord(raw)) return null;
  const temperature = num(raw['temperature']);
  if (temperature === null) return null;
  return {
    at: timeOf(raw['when']), ...iconOf(raw['iconId']),
    state: typeof raw['state'] === 'string' && raw['state'].trim() !== '' ? raw['state'].trim().slice(0, 60) : null,
    temperature, max: num(raw['temperatureMax']), min: num(raw['temperatureMin']),
    unit: raw['temperatureUnits'] === '°F' ? '°F' : '°C', humidity: num(raw['humidity']),
    hours: pointsOf(raw['forecastHourly']), days: pointsOf(raw['forecast']),
    daylight: daylightOf(raw['iconId']),
  };
}

/** "clouds_heavy_day", "clear_night": the hub names its icons by day and night. */
function daylightOf(iconId: unknown): boolean | null {
  if (typeof iconId !== 'string') return null;
  const words = iconId.toLowerCase().split(/[^a-z]+/);
  return words.includes('day') ? true : words.includes('night') ? false : null;
}

const POINT_FIELDS = ['iconId', 'temperature', 'temperatureMax', 'temperatureMin', 'time'] as const;
const NOW_FIELDS = ['when', 'iconId', 'state', 'temperature', 'temperatureMax', 'temperatureMin', 'temperatureUnits', 'humidity'] as const;

const pick = (raw: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(fields.flatMap((field) => {
    const value = raw[field];
    return typeof value === 'number' || typeof value === 'string' ? [[field, typeof value === 'string' ? value.slice(0, 60) : value]] : [];
  }));

/** Only what the dashboard uses, for a page: no place, no picture of the hub's own screen. */
export function slimWeather(raw: unknown): (Record<string, unknown> & { forecast: Record<string, unknown>[]; forecastHourly: Record<string, unknown>[] }) | null {
  if (!isRecord(raw)) return null;
  const points = (list: unknown): Record<string, unknown>[] => (Array.isArray(list) ? list.slice(0, 48).filter(isRecord).map((item) => pick(item, POINT_FIELDS)) : []);
  return { ...pick(raw, NOW_FIELDS), forecastHourly: points(raw['forecastHourly']), forecast: points(raw['forecast']) };
}

/** The hours after the running one. */
export const hoursAfter = (weather: Weather, now: number, count: number): WeatherPoint[] => weather.hours.filter((point) => point.time > now).slice(0, count);

const dayKey = (time: number): number => {
  const date = new Date(time);
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
};

/** The days after today, by the clock of this device. */
export const daysAfter = (weather: Weather, now: number, count: number): WeatherPoint[] =>
  weather.days.filter((point) => dayKey(point.time) > dayKey(now)).slice(0, count);

/** Fresh, old (its time is shown with it), or gone (none, or too old to show). */
export function weatherAge(weather: Weather | null, now: number): 'fresh' | 'old' | 'gone' {
  if (!weather || weather.at === null) return 'gone';
  const age = now - weather.at;
  return age >= WEATHER_AGE.goneMs ? 'gone' : age >= WEATHER_AGE.oldMs ? 'old' : 'fresh';
}

const whole = (value: number): number => Math.round(value) || 0;

/** A temperature as it is shown: whole degrees, never minus zero. */
export const formatDegrees = (value: number | null, _t: Translate): string => (value === null ? '–' : `${whole(value)}°`);

/** The state in the language of the dashboard; the hub's own words only for an icon the dashboard does not know. */
export function weatherState(weather: Pick<Weather, 'icon' | 'known' | 'state'>, t: Translate): string {
  if (!weather.known && weather.state) return weather.state;
  return t(`weather.state.${weather.icon}` as MessageKey);
}

const degrees = (value: number, t: Translate): string => {
  const n = whole(value);
  return t(Math.abs(n) === 1 ? 'weather.degree.one' : 'weather.degree.other', { n });
};

/** What a screen reader says of the weather of now. */
export function weatherSentence(weather: Weather, t: Translate): string {
  const sentence = t('weather.say', { temp: degrees(weather.temperature, t), state: weatherState(weather, t).toLocaleLowerCase(t.locale) });
  return weather.max !== null && weather.min !== null ? `${sentence}${t('weather.sayToday', { max: degrees(weather.max, t), min: degrees(weather.min, t) })}` : sentence;
}
