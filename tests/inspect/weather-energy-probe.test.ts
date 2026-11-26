import { expect, test } from 'vitest';
import { describeShape, probeWeatherEnergy, type RawManagers } from '../../src/inspect/weather-energy-probe';

test('a shape tells field names and kinds, the weather in numbers and plain words, and nothing of where or who', () => {
  const weather = {
    temperature: 12.34, humidity: 0.81, state: 'partly-cloudy-day', city: 'Utrecht', latitude: 52.09, location: { lat: 52.09, lng: 5.12 },
    description: 'Half bewolkt boven Utrecht', windSpeed: 3.2, units: { temperature: '°C' },
  };
  const text = describeShape(weather, 'weather');
  expect(text).toContain('temperature getal 12.3');
  expect(text).toContain('state woord partly-cloudy-day');
  expect(text).toContain('windSpeed getal 3.2');
  expect(text).toContain('units {temperature eenheid °C}');
  for (const secret of ['Utrecht', '52.09', '5.12', 'Half bewolkt']) expect(text).not.toContain(secret);
  expect(text).toContain('city verborgen');
  expect(text).toContain('location verborgen');
  expect(text).toContain('description tekst(26)');
});

test('energy keeps its magnitudes only, and ids and names of devices stay out', () => {
  const report = {
    totalConsumed: 4812.5, totalGenerated: 6210, items: [
      { id: 'b0c1d2e3-aaaa-bbbb-cccc-000000000001', name: 'Koelkast keuken', consumed: 1100, category: 'appliance' },
      { id: 'b0c1d2e3-aaaa-bbbb-cccc-000000000002', name: 'Boiler', consumed: 900, category: 'heating' },
    ],
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, consumed: 0.2 })),
  };
  const text = describeShape(report, 'energy');
  expect(text).toContain('totalConsumed getal ~1000');
  expect(text).toContain('items lijst van 2: {category woord appliance; consumed getal ~1000; id verborgen; name verborgen}');
  expect(text).toContain('hours lijst van 24: {consumed getal ~0.1; hour getal 0}');
  for (const secret of ['Koelkast', 'Boiler', 'b0c1d2e3', '4812', '1100']) expect(text).not.toContain(secret);
});

test('records keyed by ids are counted, not listed', () => {
  const live = { 'b0c1d2e3-aaaa-bbbb-cccc-000000000001': { W: 120 }, 'b0c1d2e3-aaaa-bbbb-cccc-000000000002': { W: 80 } };
  const text = describeShape(live, 'energy');
  expect(text).toBe('{2 sleutels als id: {W getal ~100}}');
});

test('the measurement asks only what it may, tells failures by their code, and never the place', async () => {
  const asked: string[] = [];
  const raw: RawManagers = {
    async call(manager, operation, args) {
      asked.push(`${manager}.${operation}${args ? ` ${JSON.stringify(args)}` : ''}`);
      if (manager === 'sessions') return { intersectedScopes: ['homey.energy.readonly', 'homey.geolocation.readonly'] };
      if (manager === 'weather' && operation === 'getWeather') return { temperature: 11, state: 'rain' };
      if (manager === 'weather' && operation === 'getWeatherHourly') return Array.from({ length: 48 }, () => ({ temperature: 10, state: 'cloudy', time: '2026-11-26T10:00:00.000Z' }));
      if (manager === 'geolocation' && operation === 'getOptionLocation') return { latitude: 52.1, longitude: 5.1, accuracy: 30, mode: 'manual' };
      if (manager === 'energy' && operation === 'getReportDay') throw Object.assign(new Error('Missing Scopes'), { statusCode: 403 });
      return {};
    },
    async logs() { return { 'homey:manager:weather:temperature': { id: 'homey:manager:weather:temperature', units: '°C', ownerUri: 'homey:manager:weather' }, 'homey:device:abc:energy_power': { id: 'homey:device:abc:energy_power', units: 'W', ownerUri: 'homey:device:abc' } }; },
    async listen(_uri, _onEvent) { return () => {}; },
  };
  const text = await probeWeatherEnergy(raw, new Date('2026-11-25T12:00:00Z'), 0);
  expect(text).toContain('rechten: homey.energy.readonly homey.geolocation.readonly');
  expect(text).toContain('weer nu: {state woord rain; temperature getal 11}');
  expect(text).toContain('weer per uur: lijst van 48');
  expect(text).toContain('locatie: {accuracy verborgen; latitude verborgen; longitude verborgen; mode woord manual}');
  expect(text).toContain('energie dag: fout 403');
  expect(text).toContain('reeksen van het weer: homey:manager:weather:temperature °C');
  expect(text).toContain('reeksen energy_power: 1');
  expect(text).not.toContain('52.1');
  expect(text).not.toMatch(/homey:device:abc/);
  expect(asked).toContain('energy.getReportDay {"date":"2026-11-24"}');
  expect(asked).toContain('energy.getReportMonth {"yearMonth":"2026-11"}');
});

test('a short name of a place never passes as a unit', () => {
  expect(describeShape({ unit: 'kWh', where: 'Ede', other: 'Oss' }, 'energy')).toBe('{other tekst(3); unit eenheid kWh; where tekst(3)}');
});

test('words that only look like a place inside them are not hidden: electricity, cumulative', () => {
  const text = describeShape({ electricity: { imported: 4.2 }, totalCumulative: { W: 10 }, city: 'Ede', zoneName: 'Keuken' }, 'energy');
  expect(text).toBe('{city verborgen; electricity {imported getal ~1}; totalCumulative {W getal ~10}; zoneName verborgen}');
});

test('the icon of the weather and its words are told; times are told from now', () => {
  const now = new Date('2026-11-25T23:10:00Z');
  const weather = {
    iconId: 'partly-cloudy-night', state: 'Lichte sneeuw', when: '2026-11-25T23:00:00.000Z',
    forecastHourly: [0, 1, 2].map((i) => ({ time: 1795647600 + i * 3600, temperature: -0.3 })),
  };
  const text = describeShape(weather, 'weather', now);
  expect(text).toContain('iconId woord partly-cloudy-night');
  expect(text).toContain('state tekst "Lichte sneeuw"');
  expect(text).toContain('when tijd +0u');
  expect(text).toContain('forecastHourly lijst van 3, tijden +0u +1u +2u: {temperature getal -0.3; time tijd +0u}');
});

test('keys that are hours or days are told from first to last; other odd keys by their name', () => {
  const report = { subReports: Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h), { used: 0.2 }])), days: { '2026-11-01': 1, '2026-11-30': 2 } };
  expect(describeShape(report, 'energy')).toBe('{days {2 sleutels 2026-11-01…2026-11-30: getal ~1}; subReports {24 sleutels 0…23: {used getal ~0.1}}}');
  const forecast = { 'temperature-max': 3, 'rain-chance': 0.4, time: 1795690800 };
  expect(describeShape(forecast, 'weather', new Date('2026-11-25T23:10:00Z'))).toBe('{rain-chance getal 0.4; temperature-max getal 3; time tijd +12u}');
  const devices = { 'b0c1d2e3-aaaa-bbbb-cccc-000000000001': { W: 1 }, 'homey:device:x': { W: 2 } };
  expect(describeShape(devices, 'energy')).toBe('{2 sleutels als id: {W getal ~1}}');
});

test('a state of the weather with a name in it is not told', () => {
  expect(describeShape({ state: 'Sneeuw in Ede' }, 'weather')).toBe('{state tekst(13)}');
  expect(describeShape({ state: 'Lichte sneeuw' }, 'weather')).toBe('{state tekst "Lichte sneeuw"}');
});
