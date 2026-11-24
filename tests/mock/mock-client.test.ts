import { expect, test, vi } from 'vitest';
import example from '../../src/mock/fixtures/voorbeeld.raw.json';
import { createMockClient } from '../../src/mock/mock-client';
import type { ClientEvent } from '../../src/homey/client';
import type { RawHomey } from '../../src/homey/types';

const raw = example as unknown as RawHomey;

test('connect returns the mapped fixture and reports a local route', async () => {
  const client = createMockClient(raw);
  const events: ClientEvent[] = [];
  client.subscribe((e) => events.push(e));
  const snap = await client.connect();
  expect(Object.keys(snap.devices)).toHaveLength(7);
  expect(events).toContainEqual({ type: 'route', route: 'local' });
});

test('setting a capability echoes a live event', async () => {
  const client = createMockClient(raw);
  const snap = await client.connect();
  const lamp = Object.values(snap.devices).find((d) => d.deviceClass === 'light')!;
  const events: ClientEvent[] = [];
  const stop = client.subscribe((e) => events.push(e));
  await client.setCapability(lamp.id, 'onoff', false);
  expect(events).toContainEqual({ type: 'capability', deviceId: lamp.id, capabilityId: 'onoff', value: false, at: expect.any(String) });
  stop();
  await client.setCapability(lamp.id, 'onoff', true);
  expect(events).toHaveLength(1);
});

test('refuses read-only, unknown and failing controls', async () => {
  const client = createMockClient(raw, { failControl: (_d, c) => c === 'dim' });
  const snap = await client.connect();
  const lamp = Object.values(snap.devices).find((d) => d.deviceClass === 'light')!;
  const plug = Object.values(snap.devices).find((d) => d.deviceClass === 'socket')!;
  await expect(client.setCapability(plug.id, 'measure_power', 1)).rejects.toThrow();
  await expect(client.setCapability('nope', 'onoff', true)).rejects.toThrow();
  await expect(client.setCapability(lamp.id, 'dim', 0.1)).rejects.toThrow();
});

test('does not mutate the fixture and keeps clients independent', async () => {
  const before = JSON.stringify(raw);
  const a = createMockClient(raw);
  const b = createMockClient(raw);
  const lamp = Object.values((await a.connect()).devices).find((d) => d.deviceClass === 'light')!;
  await a.setCapability(lamp.id, 'onoff', !lamp.capabilities['onoff']!.value);
  expect(JSON.stringify(raw)).toBe(before);
  const other = (await b.connect()).devices[lamp.id]!;
  expect(other.capabilities['onoff']!.value).toBe(lamp.capabilities['onoff']!.value);
});

test('startFlow resolves for known flows and rejects otherwise', async () => {
  const client = createMockClient(raw);
  const snap = await client.connect();
  await expect(client.startFlow(snap.flows[0]!)).resolves.toBeUndefined();
  await expect(client.startFlow({ id: 'nope', kind: 'flow' })).rejects.toThrow();
});

test('disconnect removes all listeners', async () => {
  const client = createMockClient(raw);
  const events: ClientEvent[] = [];
  client.subscribe((e) => events.push(e));
  client.disconnect();
  client.emitCapability('x', 'y', 1);
  expect(events).toHaveLength(0);
});

test('simulate jitters measure_power by at most 5 percent every 2000 ms', async () => {
  const client = createMockClient(raw);
  const snap = await client.connect();
  let tick = () => {};
  const setIntervalFn = vi.fn((fn: () => void, _ms: number) => { tick = fn; return 1; });
  client.simulate({ setInterval: setIntervalFn, clearInterval: () => {} });
  expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 2000);
  const events: ClientEvent[] = [];
  client.subscribe((e) => events.push(e));
  tick();
  const power = events.filter((e) => e.type === 'capability');
  expect(power.length).toBeGreaterThan(0);
  for (const e of power) {
    if (e.type !== 'capability') continue;
    const cap = snap.devices[e.deviceId]!.capabilities[e.capabilityId]!;
    expect(cap.baseId).toBe('measure_power');
    const old = cap.value as number;
    expect(Math.abs((e.value as number) - old)).toBeLessThanOrEqual(Math.abs(old) * 0.05 + 1e-9);
  }
});

test('the example hub keeps history of the solar panel and the battery', async () => {
  const client = createMockClient(raw);
  const snap = await client.connect();
  const refs = await client.listHistory();
  const named = (name: string) => Object.values(snap.devices).find((d) => d.name === name)!.id;
  expect(refs).toContainEqual({ deviceId: named('Zonnepaneel'), capabilityId: 'measure_power' });
  expect(refs).toContainEqual({ deviceId: named('Thuisaccu'), capabilityId: 'battery_soc' });
  expect(refs).toContainEqual({ deviceId: named('Thuisaccu'), capabilityId: 'measure_power' });
  // A sensor's own battery is no home battery.
  expect(refs).not.toContainEqual({ deviceId: named('Sensor 1'), capabilityId: 'measure_battery' });
});
test('today gives points between midnight and now, oldest first, every five minutes', async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date(2026, 10, 22, 14, 32));
    const client = createMockClient(raw);
    const snap = await client.connect();
    const solar = Object.values(snap.devices).find((d) => d.name === 'Zonnepaneel')!;
    const points = await client.readHistory({ deviceId: solar.id, capabilityId: 'measure_power' }, 'today');
    const midnight = new Date(2026, 10, 22).getTime();
    expect(points.length).toBeGreaterThan(100);
    expect(points.every((p) => p.at >= midnight && p.at <= Date.now() && Number.isFinite(p.value))).toBe(true);
    expect(points.every((p, i) => i === 0 || p.at - points[i - 1]!.at === 300_000)).toBe(true);
    // The sun shines in the middle of the day only.
    expect(points.find((p) => new Date(p.at).getHours() === 3)!.value).toBe(0);
    expect(Math.max(...points.map((p) => p.value))).toBeGreaterThan(300);
    const battery = Object.values(snap.devices).find((d) => d.name === 'Thuisaccu')!;
    const day = await client.readHistory({ deviceId: battery.id, capabilityId: 'battery_soc' }, 'last24Hours');
    expect(day[0]!.at).toBeGreaterThanOrEqual(Date.now() - 86_400_000);
    expect(day.every((p) => p.value >= 52 && p.value <= 81)).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
test('a test can give its own history', async () => {
  const client = createMockClient(raw, { history: (_ref, period, now) => [{ at: now - 1000, value: period === 'today' ? 1 : 2 }] });
  await client.connect();
  expect(await client.readHistory({ deviceId: 'device-5', capabilityId: 'measure_power' }, 'today')).toEqual([{ at: expect.any(Number), value: 1 }]);
  expect(await client.readHistory({ deviceId: 'device-5', capabilityId: 'measure_power' }, 'last24Hours')).toEqual([{ at: expect.any(Number), value: 2 }]);
});
test('a log the hub does not keep is empty', async () => {
  const client = createMockClient(raw);
  await client.connect();
  expect(await client.readHistory({ deviceId: 'device-1', capabilityId: 'onoff' }, 'today')).toEqual([]);
  expect(await client.readHistory({ deviceId: 'nope', capabilityId: 'measure_power' }, 'today')).toEqual([]);
});

test('disconnect stops the simulation', async () => {
  const client = createMockClient(raw);
  await client.connect();
  let tick: (() => void) | null = null;
  const clearIntervalFn = vi.fn((_handle: unknown) => { tick = null; });
  client.simulate({ setInterval: (fn) => { tick = fn; return 'handle'; }, clearInterval: clearIntervalFn });
  client.disconnect();
  expect(clearIntervalFn).toHaveBeenCalledWith('handle');
  expect(tick).toBeNull();
});

test('the simulation can send a set number of reports per second, spread over the devices', async () => {
  const client = createMockClient(raw);
  await client.connect();
  let tick = () => {};
  let interval = 0;
  client.simulate({ setInterval: (fn, ms) => { tick = fn; interval = ms; return 1; }, clearInterval: () => {} }, { eventsPerSecond: 17 });
  const events: ClientEvent[] = [];
  client.subscribe((e) => events.push(e));
  const ticks = Math.round(1000 / interval);
  for (let i = 0; i < ticks; i += 1) tick();
  const reports = events.filter((e) => e.type === 'capability');
  expect(reports.length).toBeGreaterThanOrEqual(16);
  expect(reports.length).toBeLessThanOrEqual(18);
  expect(new Set(reports.map((e) => e.type === 'capability' && e.deviceId)).size).toBeGreaterThan(2);
});
