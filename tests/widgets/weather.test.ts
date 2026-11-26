import { expect, test } from 'vitest';
import { createTranslate } from '../../src/i18n';
import { daysAfter, hoursAfter, iconOf, readWeather, slimWeather, weatherAge, weatherSentence, weatherState, formatDegrees } from '../../src/widgets/weather';

// The shape a real hub gave, with made-up numbers.
const NOW = Date.parse('2026-11-25T23:17:00Z');
const hour = (i: number) => 1795647600 + i * 3600;
const day = (i: number) => 1795690800 + i * 86400;
const measured = {
  city: 'Somewhere', country: 'NL', colors: [{ r: 149, g: 165, b: 166 }], id: 'abc', screensaver: { fps: 1, frames: [[1]], rpm: 3 }, screensaverId: 's', videoId: 'v',
  humidity: 0.9, pressure: 1.012, iconId: 'clouds_heavy_night', state: 'Geheel bewolkt', temperature: -0.7, temperatureCelsius: -0.7,
  temperatureMax: 0, temperatureMin: -2.6, temperatureUnits: '°C', when: '2026-11-25T23:00:00.000Z',
  forecastHourly: [0, 1, 2, 3, 4].map((i) => ({ iconId: i < 2 ? 'clouds_heavy_day' : 'rain_light_day', temperature: -0.3 + i, temperatureMax: -0.3 + i, temperatureMin: -0.6 + i, time: hour(i) })),
  forecast: [0, 1, 2, 3, 4, 5].map((i) => ({ iconId: 'clear_day', temperature: -1.9 + i, temperatureMax: i, temperatureMin: -2.6 + i, time: day(i), weatherId: 800, 'odd-key': 1 })),
};

test('the weather of now, the hours after the running one and the days after today are read from what the hub gives', () => {
  const weather = readWeather(measured)!;
  expect(weather).toMatchObject({ at: Date.parse('2026-11-25T23:00:00.000Z'), icon: 'cloud', known: true, state: 'Geheel bewolkt', temperature: -0.7, max: 0, min: -2.6, unit: '°C', humidity: 0.9 });
  expect(weather.hours).toHaveLength(5);
  expect(weather.days).toHaveLength(6);
  // the first hour is the running one: that is "now"
  expect(hoursAfter(weather, NOW, 4).map((point) => point.time)).toEqual([1, 2, 3, 4].map((i) => hour(i) * 1000));
  expect(hoursAfter(weather, NOW, 4)[2]).toMatchObject({ icon: 'rainy', temperature: 2.7 });
  expect(daysAfter(weather, NOW, 5)).toHaveLength(5);
  expect(daysAfter(weather, NOW, 5)[0]).toMatchObject({ time: day(0) * 1000, icon: 'sunny', max: 0, min: -2.6 });
});

test('only what the dashboard uses goes to a page: no place, no picture of Homey\'s own screen', () => {
  const slim = slimWeather(measured)!;
  expect(Object.keys(slim).sort()).toEqual(['forecast', 'forecastHourly', 'humidity', 'iconId', 'state', 'temperature', 'temperatureMax', 'temperatureMin', 'temperatureUnits', 'when']);
  expect(Object.keys(slim.forecast[0]!).sort()).toEqual(['iconId', 'temperature', 'temperatureMax', 'temperatureMin', 'time']);
  expect(JSON.stringify(slim)).not.toMatch(/Somewhere|screensaver|colors|abc/);
  expect(readWeather(slim)).toEqual(readWeather(measured));
  expect(slimWeather('nonsense')).toBeNull();
  expect(slimWeather({ forecast: 'x' })).toEqual({ forecast: [], forecastHourly: [] });
});

test('an icon of the hub becomes one of the dashboard by the words in it; an unknown one is cloudy and says so', () => {
  expect(iconOf('clear_day')).toEqual({ icon: 'sunny', known: true });
  expect(iconOf('clear_night')).toEqual({ icon: 'clear_night', known: true });
  expect(iconOf('clouds_light_night')).toEqual({ icon: 'partly_cloudy_night', known: true });
  expect(iconOf('clouds_few_day')).toEqual({ icon: 'partly_cloudy_day', known: true });
  expect(iconOf('clouds_heavy_day')).toEqual({ icon: 'cloud', known: true });
  expect(iconOf('rain_heavy_night')).toEqual({ icon: 'rainy', known: true });
  expect(iconOf('drizzle')).toEqual({ icon: 'rainy', known: true });
  expect(iconOf('snow_light_day')).toEqual({ icon: 'weather_snowy', known: true });
  expect(iconOf('sleet')).toEqual({ icon: 'weather_snowy', known: true });
  expect(iconOf('thunderstorm_rain')).toEqual({ icon: 'thunderstorm', known: true });
  expect(iconOf('fog')).toEqual({ icon: 'foggy', known: true });
  expect(iconOf('mist_day')).toEqual({ icon: 'foggy', known: true });
  expect(iconOf('something_new')).toEqual({ icon: 'cloud', known: false });
  expect(iconOf(undefined)).toEqual({ icon: 'cloud', known: false });
});

test('the state is said in the language of the dashboard; Homey\'s own words only for an icon it does not know', () => {
  const nl = createTranslate('nl');
  const en = createTranslate('en');
  const weather = readWeather(measured)!;
  expect(weatherState(weather, nl)).toBe('Bewolkt');
  expect(weatherState(weather, en)).toBe('Cloudy');
  const odd = readWeather({ ...measured, iconId: 'volcanic_ash' })!;
  expect(weatherState(odd, en)).toBe('Geheel bewolkt');
  expect(weatherState(readWeather({ ...measured, iconId: 'volcanic_ash', state: undefined })!, en)).toBe('Cloudy');
});

test('degrees are whole, without minus zero, in the unit of the hub', () => {
  const nl = createTranslate('nl');
  expect(formatDegrees(-0.7, nl)).toBe('-1°');
  expect(formatDegrees(-0.3, nl)).toBe('0°');
  expect(formatDegrees(12.5, nl)).toBe('13°');
  expect(formatDegrees(null, nl)).toBe('–');
  expect(readWeather({ ...measured, temperatureUnits: '°F', temperature: 30.7 })).toMatchObject({ unit: '°F', temperature: 30.7 });
});

test('how old the weather is: fresh, with its time from an hour and a half, gone from six hours or when it never came', () => {
  const weather = readWeather(measured)!;
  const at = weather.at!;
  expect(weatherAge(weather, at + 89 * 60_000)).toBe('fresh');
  expect(weatherAge(weather, at + 90 * 60_000)).toBe('old');
  expect(weatherAge(weather, at + 6 * 3_600_000)).toBe('gone');
  expect(weatherAge(readWeather({ ...measured, when: undefined })!, at)).toBe('gone');
  expect(weatherAge(null, at)).toBe('gone');
});

test('read out without arrows, with one degree and more degrees', () => {
  const nl = createTranslate('nl');
  const en = createTranslate('en');
  const weather = readWeather({ ...measured, temperature: 1.2, temperatureMax: 4, temperatureMin: -1 })!;
  expect(weatherSentence(weather, nl)).toBe('Weer: 1 graad, bewolkt, vandaag hoogstens 4 graden en laagstens -1 graad');
  expect(weatherSentence(weather, en)).toBe('Weather: 1 degree, cloudy, today at most 4 degrees and at least -1 degree');
  expect(weatherSentence(readWeather({ ...measured, temperatureMax: undefined, temperatureMin: undefined })!, nl)).toBe('Weer: -1 graad, bewolkt');
});

test('what is not weather is nothing', () => {
  expect(readWeather(null)).toBeNull();
  expect(readWeather({ state: 'x' })).toBeNull();
  expect(readWeather({ temperature: 'warm' })).toBeNull();
});

test('every icon of the weather is one the dashboard can draw', async () => {
  const { ICONS } = await import('../../src/ui/icons/icons');
  const { weatherIconName } = await import('../../src/widgets/weather');
  const all = ['sunny', 'clear_night', 'partly_cloudy_day', 'partly_cloudy_night', 'cloud', 'rainy', 'weather_snowy', 'thunderstorm', 'foggy'] as const;
  expect(all.filter((icon) => !Object.hasOwn(ICONS, weatherIconName(icon)))).toEqual([]);
  expect(weatherIconName('clear_night')).toBe('bedtime');
});
