import { expect, test, vi } from 'vitest';
import type { HistorySeries, HistorySource } from '../../src/homey/client';
import { createHistoryCache } from '../../src/home-server/history-cache';

const source = (n: number): HistorySource => ({ log: `homey:device:d${n}:measure_power`, kind: 'device', type: 'number', deviceId: `d${n}`, capabilityId: 'measure_power' });
const series = (updatesIn: number | null): HistorySeries => ({ start: 0, end: 1, step: 1, updatesIn, points: [{ at: 0, value: 1 }] });

function setup(updatesIn: number | null = 60_000) {
  let now = 1_000_000;
  const gates: (() => void)[] = [];
  let open = 0;
  let most = 0;
  const read = vi.fn(async () => {
    open += 1;
    most = Math.max(most, open);
    await new Promise<void>((done) => gates.push(done));
    open -= 1;
    return series(updatesIn);
  });
  const switches = vi.fn(async () => ({ changes: [] }));
  const cache = createHistoryCache({ read, switches, now: () => now, limit: 3, parallel: 2 });
  const release = async () => { while (gates.length > 0) { gates.shift()!(); await Promise.resolve(); await Promise.resolve(); } };
  return { cache, read, switches, release, tick: (ms: number) => { now += ms; }, most: () => most };
}

test('equal requests are joined, and an answer is kept for as long as the hub says', async () => {
  const s = setup(60_000);
  const both = Promise.all([s.cache.series(source(1), 'last24Hours'), s.cache.series(source(1), 'last24Hours')]);
  await s.release();
  expect((await both)[0]).toEqual(series(60_000));
  expect(s.read).toHaveBeenCalledTimes(1);
  s.tick(59_000);
  await s.cache.series(source(1), 'last24Hours');
  expect(s.read).toHaveBeenCalledTimes(1);
  s.tick(2000);
  const again = s.cache.series(source(1), 'last24Hours');
  await s.release();
  await again;
  expect(s.read).toHaveBeenCalledTimes(2);
});

test('never longer than five minutes, and another period is another answer', async () => {
  const s = setup(3_600_000);
  const first = s.cache.series(source(1), 'last7Days');
  await s.release();
  await first;
  s.tick(301_000);
  const second = Promise.all([s.cache.series(source(1), 'last7Days'), s.cache.series(source(1), 'last31Days')]);
  await s.release();
  await second;
  expect(s.read).toHaveBeenCalledTimes(3);
});

test('at most a few reads at a time, and at most so many answers kept', async () => {
  const s = setup();
  const all = Promise.all([1, 2, 3, 4, 5].map((n) => s.cache.series(source(n), 'today')));
  await s.release();
  await all;
  expect(s.most()).toBe(2);
  // the oldest went: 1 and 2 are read again, 5 is still there
  const later = Promise.all([s.cache.series(source(5), 'today'), s.cache.series(source(1), 'today')]);
  await s.release();
  await later;
  expect(s.read).toHaveBeenCalledTimes(6);
});

test('a failure is not kept', async () => {
  let fail = true;
  const read = vi.fn(async () => { if (fail) throw new Error('slow'); return series(null); });
  const cache = createHistoryCache({ read, switches: async () => null, now: () => 0 });
  await expect(cache.series(source(1), 'today')).rejects.toThrow('slow');
  fail = false;
  expect(await cache.series(source(1), 'today')).toEqual(series(null));
});

test('a slot that frees up goes to who waited, never to one more beside it', async () => {
  const gates: (() => void)[] = [];
  let open = 0;
  let most = 0;
  const read = vi.fn(async () => { open += 1; most = Math.max(most, open); await new Promise<void>((go) => gates.push(go)); open -= 1; return series(null); });
  const cache = createHistoryCache({ read, switches: async () => null, now: () => 0, parallel: 2 });
  const first = [1, 2, 3].map((n) => cache.series(source(n), 'today'));
  await Promise.resolve();
  // one read ends; at that very moment another asks
  gates.shift()!();
  const late = cache.series(source(4), 'today');
  for (let i = 0; i < 10; i++) { await Promise.resolve(); while (gates.length > 0 && open > 2) break; }
  expect(most).toBeLessThanOrEqual(2);
  while (gates.length > 0) { gates.shift()!(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
  await Promise.all([...first, late]);
  expect(most).toBe(2);
});

test('a new connection forgets what was kept', async () => {
  const read = vi.fn(async () => series(60_000));
  const cache = createHistoryCache({ read, switches: async () => null, now: () => 0 });
  await cache.series(source(1), 'today');
  cache.clear();
  await cache.series(source(1), 'today');
  expect(read).toHaveBeenCalledTimes(2);
});
