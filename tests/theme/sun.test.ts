import { expect, test } from 'vitest';
import { normalizeMode } from '../../src/theme/looks-doc';
import { sunDark, withSun } from '../../src/theme/sun';
import { readWeather, type Weather } from '../../src/widgets/weather';

const NOW = new Date(2026, 10, 26, 18, 30).getTime();
const weather = (iconId: string, minutesAgo = 5): Weather => readWeather({ when: new Date(NOW - minutesAgo * 60_000).toISOString(), iconId, temperature: 7, forecast: [], forecastHourly: [] })!;

test('day or night is in the name of the icon of the weather of now, also when it is cloudy', () => {
  expect([weather('clouds_heavy_day').daylight, weather('clouds_heavy_night').daylight, weather('rain_light_day').daylight, weather('fog').daylight]).toEqual([true, false, true, null]);
});

test('with the sun: dark at night, light by day, as the system when the weather does not tell or is old', () => {
  expect(sunDark({ value: weather('clear_night'), at: NOW, error: null }, NOW)).toBe(true);
  expect(sunDark({ value: weather('clouds_heavy_day'), at: NOW, error: null }, NOW)).toBe(false);
  expect(sunDark({ value: weather('fog'), at: NOW, error: null }, NOW)).toBeNull();
  expect(sunDark({ value: weather('clear_night', 100), at: NOW, error: null }, NOW)).toBeNull();
  expect(sunDark(null, NOW)).toBeNull();
  expect([withSun('sun', true), withSun('sun', false), withSun('sun', null), withSun('light', true), withSun('auto', false)]).toEqual(['dark', 'light', 'auto', 'light', 'auto']);
});

test('the choice with the sun is kept, for this device and for the house', async () => {
  expect(normalizeMode('sun')).toBe('sun');
  const { normalizeTheme } = await import('../../src/storage/local-store');
  expect(normalizeTheme({ seed: '#3b6939', mode: 'sun', density: 'comfortable' }).mode).toBe('sun');
  const { parseLookOps } = await import('../../src/theme/look-ops');
  expect(parseLookOps([{ house: { mode: 'sun' } }])).toEqual([{ house: { mode: 'sun' } }]);
});

test('what was kept of the sun counts for half a day, until the weather says otherwise; nothing from the future or nonsense', async () => {
  const { keptSunOf } = await import('../../src/theme/sun');
  const now = NOW;
  expect(keptSunOf(JSON.stringify({ dark: true, at: now - 40 * 60_000 }), now)).toBe(true);
  expect(keptSunOf(JSON.stringify({ dark: false, at: now - 11 * 3_600_000 }), now)).toBe(false);
  expect(keptSunOf(JSON.stringify({ dark: true, at: now - 13 * 3_600_000 }), now)).toBeNull();
  expect(keptSunOf(JSON.stringify({ dark: true, at: now + 60_000 }), now)).toBeNull();
  expect([keptSunOf('nonsense', now), keptSunOf(null, now)]).toEqual([null, null]);
});

test('the weather is heard for the sun while this dashboard, the rest screen or the house follows it, also when this device itself does not', async () => {
  const { followsSun } = await import('../../src/theme/sun');
  expect(followsSun({ shown: 'sun', resting: 'light', house: null })).toBe(true);
  expect(followsSun({ shown: 'light', resting: 'sun', house: null })).toBe(true);
  // the house follows the sun while this device is light: the theme panel of the house shows it
  expect(followsSun({ shown: 'light', resting: 'light', house: 'sun' })).toBe(true);
  expect(followsSun({ shown: 'auto', resting: 'auto', house: 'dark' })).toBe(false);
});
