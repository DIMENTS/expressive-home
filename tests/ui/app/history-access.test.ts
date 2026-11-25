import { expect, test, vi } from 'vitest';
import type { HistorySeries, HistorySource, HomeyClient } from '../../../src/homey/client';
import { createHistoryAccess } from '../../../src/ui/app/history';

const source = (n: number): HistorySource => ({ log: `homey:device:d${n}:measure_power`, kind: 'device', type: 'number', deviceId: `d${n}`, capabilityId: 'measure_power' });
const series: HistorySeries = { start: 0, end: 1, step: 1, updatesIn: null, points: [{ at: 0, value: 1 }] };

function client() {
  const gates: (() => void)[] = [];
  let open = 0;
  let most = 0;
  const c = {
    listHistory: vi.fn(async () => [source(1), source(2)]),
    readSeries: vi.fn(async () => { open += 1; most = Math.max(most, open); await new Promise<void>((go) => gates.push(go)); open -= 1; return series; }),
    readSwitches: vi.fn(async () => ({ changes: [] })),
  };
  return { c: c as unknown as HomeyClient & typeof c, release: async () => { while (gates.length) { gates.shift()!(); await Promise.resolve(); await Promise.resolve(); } }, most: () => most };
}

test('the list of logs is read once per connection, with every value the page knows', async () => {
  const one = client();
  let current: HomeyClient | null = one.c;
  const access = createHistoryAccess({ client: () => current, known: () => [{ deviceId: 'd1', capabilityId: 'measure_power' }], now: () => 0 });
  expect(await access.sources()).toEqual([source(1), source(2)]);
  await access.sources();
  expect(one.c.listHistory).toHaveBeenCalledTimes(1);
  expect(one.c.listHistory).toHaveBeenCalledWith([{ deviceId: 'd1', capabilityId: 'measure_power' }]);
  const two = client();
  current = two.c;
  await access.sources();
  expect(two.c.listHistory).toHaveBeenCalledTimes(1);
  current = null;
  expect(await access.sources()).toEqual([]);
});

test('at most four reads at a time; an answer is kept for five minutes', async () => {
  const one = client();
  let now = 0;
  const access = createHistoryAccess({ client: () => one.c, known: () => [], now: () => now });
  const all = Promise.all([1, 2, 3, 4, 5, 6].map((n) => access.series(source(n), 'last24Hours')));
  await one.release();
  await one.release();
  await all;
  expect(one.most()).toBe(4);
  await access.series(source(1), 'last24Hours');
  expect(one.c.readSeries).toHaveBeenCalledTimes(6);
  now = 301_000;
  const again = access.series(source(1), 'last24Hours');
  await one.release();
  await again;
  expect(one.c.readSeries).toHaveBeenCalledTimes(7);
});

test('a failure is not kept, and without a connection there is nothing', async () => {
  let fail = true;
  const c = { listHistory: async () => [], readSeries: vi.fn(async () => { if (fail) throw new Error('x'); return series; }), readSwitches: async () => null } as unknown as HomeyClient;
  const access = createHistoryAccess({ client: () => c, known: () => [], now: () => 0 });
  await expect(access.series(source(1), 'today')).rejects.toThrow();
  fail = false;
  expect(await access.series(source(1), 'today')).toEqual(series);
  const none = createHistoryAccess({ client: () => null, known: () => [], now: () => 0 });
  expect(await none.series(source(1), 'today')).toBeNull();
  expect(await none.switches(source(1))).toBeNull();
});

test('the list of logs is read again after five minutes, so what is recorded later shows up', async () => {
  const one = client();
  let now = 0;
  const access = createHistoryAccess({ client: () => one.c, known: () => [], now: () => now });
  await access.sources();
  now = 299_000;
  await access.sources();
  expect(one.c.listHistory).toHaveBeenCalledTimes(1);
  now = 301_000;
  await access.sources();
  expect(one.c.listHistory).toHaveBeenCalledTimes(2);
});
