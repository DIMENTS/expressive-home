import { expect, test } from 'vitest';
import { ConnectionError, type HistoryPeriod, type HistoryPoint, type HistoryRef, type HomeyClient } from '../../src/homey/client';
import type { HeroSpec } from '../../src/dashboard/types';
import { insightsText, measureInsights, type InsightsMeasurement } from '../../src/inspect/insights';

const NOW = Date.parse('2026-11-22T14:00:00.000Z');
const MIN = 60_000;

const battery: HeroSpec = {
  kind: 'battery', deviceIds: ['accu-1', 'zon-1'], primary: { deviceId: 'accu-1', capabilityId: 'battery_soc' }, timeToGo: null,
  stats: [{ role: 'solar', ref: { deviceId: 'zon-1', capabilityId: 'measure_power' } }, { role: 'net' }],
};

/** Points every `step` minutes, the newest `lastAgo` minutes before now. */
const series = (count: number, step: number, lastAgo: number): HistoryPoint[] =>
  Array.from({ length: count }, (_, i) => ({ at: NOW - (lastAgo + (count - 1 - i) * step) * MIN, value: 400 + i }));

function client(refs: HistoryRef[], read: (ref: HistoryRef, period: HistoryPeriod) => Promise<HistoryPoint[]>): HomeyClient {
  return {
    connect: async () => { throw new Error('unused'); }, setCapability: async () => {}, startFlow: async () => {},
    subscribe: () => () => {}, disconnect: () => {},
    listHistory: async () => refs, readHistory: read,
  };
}

test('the text of a measurement with two roles', () => {
  const measurement: InsightsMeasurement = {
    logs: 167, listError: null,
    roles: [
      { role: 'solar', exists: true, periods: [
        { period: 'today', points: 160, stepMinutes: 5, firstMinutesAgo: 800, lastMinutesAgo: 4, error: null },
        { period: 'last24Hours', points: 288, stepMinutes: 5, firstMinutesAgo: 1440, lastMinutesAgo: 4, error: null },
      ] },
      { role: 'battery', exists: false, periods: [] },
    ],
  };
  expect(insightsText(measurement)).toBe([
    'insights: 167 reeksen',
    '- solar: bestaat',
    '  - today: 160 punten, om de 5 min, eerste 800 min geleden, laatste 4 min geleden',
    '  - last24Hours: 288 punten, om de 5 min, eerste 1440 min geleden, laatste 4 min geleden',
    '- battery: bestaat niet',
  ].join('\n'));
});

test('measuring reads both periods of every role of the hero that exists', async () => {
  const refs = [{ deviceId: 'zon-1', capabilityId: 'measure_power' }, { deviceId: 'x', capabilityId: 'onoff' }];
  const m = await measureInsights(client(refs, async (_ref, period) => (period === 'today' ? series(160, 5, 4) : series(288, 5, 4))), battery, NOW);
  expect(m.logs).toBe(2);
  expect(m.roles).toEqual([
    { role: 'solar', exists: true, periods: [
      { period: 'today', points: 160, stepMinutes: 5, firstMinutesAgo: 799, lastMinutesAgo: 4, error: null },
      { period: 'last24Hours', points: 288, stepMinutes: 5, firstMinutesAgo: 1439, lastMinutesAgo: 4, error: null },
    ] },
    { role: 'battery', exists: false, periods: [] },
  ]);
});

test('the interval is the median of the gaps, so one hole does not change it', async () => {
  const points = series(10, 5, 2);
  points.splice(4, 2);
  const m = await measureInsights(client([battery.primary], async () => points), battery, NOW);
  expect(m.roles.find((r) => r.role === 'battery')!.periods[0]!.stepMinutes).toBe(5);
});

test('a failing read is noted in its period and never thrown', async () => {
  const refs = [{ deviceId: 'zon-1', capabilityId: 'measure_power' }, battery.primary];
  const m = await measureInsights(client(refs, async (ref) => {
    if (ref.deviceId === 'zon-1') throw new Error('boom');
    throw new ConnectionError('auth');
  }), battery, NOW);
  expect(m.roles[0]!.periods[0]).toEqual({ period: 'today', points: 0, stepMinutes: null, firstMinutesAgo: null, lastMinutesAgo: null, error: 'unreachable' });
  expect(m.roles[1]!.periods[1]!.error).toBe('auth');
  expect(insightsText(m)).toContain('  - today: fout (unreachable)');
});

test('a failing list is noted too', async () => {
  const failing = { ...client([], async () => []), listHistory: async () => { throw new Error('boom'); } };
  const m = await measureInsights(failing, battery, NOW);
  expect(m).toEqual({ logs: 0, listError: 'unreachable', roles: [] });
  expect(insightsText(m)).toBe('insights: lijst lezen mislukt (unreachable)');
});

test('without a hero there are only the logs; an empty log has no interval', async () => {
  expect(insightsText(await measureInsights(client([battery.primary], async () => []), null, NOW))).toBe('insights: 1 reeksen\n- blikvanger: geen');
  const one = await measureInsights(client([battery.primary], async () => series(1, 5, 3)), battery, NOW);
  expect(insightsText(one)).toContain('  - today: 1 punten, eerste 3 min geleden, laatste 3 min geleden');
});

test('the text holds no device id and no value', async () => {
  const refs = [{ deviceId: 'zon-1', capabilityId: 'measure_power' }, battery.primary];
  const text = insightsText(await measureInsights(client(refs, async () => series(20, 5, 1)), battery, NOW));
  expect(text).not.toMatch(/zon-1|accu-1|40\d|41\d/);
});
