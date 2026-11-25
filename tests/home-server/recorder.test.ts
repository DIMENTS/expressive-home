import { afterEach, expect, test, vi } from 'vitest';
import type { HistorySource } from '../../src/homey/client';
import { recordedLogId } from '../../src/homey/history';
import type { CapabilityValue } from '../../src/homey/types';
import { createRecorder, RECORD_MAX } from '../../src/home-server/recorder';

afterEach(() => { vi.useRealTimers(); });

const MIN = 60_000;
const START = Date.parse('2026-11-25T10:00:30.000Z');
const solar = { deviceId: 'd-sun', capabilityId: 'measure_power' };
const use = { deviceId: 'd-use', capabilityId: 'measure_power' };
const shore = { deviceId: 'd-ac', capabilityId: 'ac_input_source' };
const battery = { deviceId: 'd-bat', capabilityId: 'measure_battery' };

/** Insights of the SDK in memory. */
function insights() {
  const logs = new Map<string, { type: string; title: Record<string, string>; entries: { at: number; value: number }[] }>();
  const handle = (id: string) => ({ id, createEntry: vi.fn(async (value: number) => { logs.get(id)!.entries.push({ at: Date.now(), value }); }) });
  return {
    logs,
    createLog: vi.fn(async (id: string, options: { type: 'number' | 'boolean'; title: Record<string, string> }) => { if (logs.has(id)) throw new Error('exists'); logs.set(id, { type: options.type, title: options.title, entries: [] }); return handle(id); }),
    getLog: vi.fn(async (id: string) => { if (!logs.has(id)) throw Object.assign(new Error('not found'), { statusCode: 404 }); return handle(id); }),
    deleteLog: vi.fn(async (log: unknown) => { logs.delete((log as { id: string }).id); }),
  };
}

function setup(options: { wanted?: typeof solar[]; kept?: HistorySource[]; stored?: unknown; enabled?: boolean } = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  const values = new Map<string, CapabilityValue>([['d-sun:measure_power', 400], ['d-use:measure_power', 100], ['d-ac:ac_input_source', 'grid'], ['d-bat:measure_battery', 70]]);
  let saved: unknown = options.stored;
  const sdk = insights();
  const state = { enabled: options.enabled ?? true };
  const recorder = createRecorder({
    insights: sdk,
    wanted: () => options.wanted ?? [solar, use, shore, battery],
    value: (ref) => values.get(`${ref.deviceId}:${ref.capabilityId}`),
    kept: async () => options.kept ?? [{ log: 'homey:device:d-bat:measure_battery', kind: 'device', type: 'number', ...battery }],
    title: (ref) => ({ en: `Expressive Home: ${ref.deviceId}`, nl: `Expressive Home: ${ref.deviceId}` }),
    load: () => saved, save: (value) => { saved = structuredClone(value); },
    enabled: () => state.enabled,
    now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  const entries = (ref: typeof solar) => sdk.logs.get(recordedLogId(ref.deviceId, ref.capabilityId))?.entries.map((e) => e.value) ?? null;
  const set = (ref: typeof solar, value: CapabilityValue) => { values.set(`${ref.deviceId}:${ref.capabilityId}`, value); recorder.observe(ref.deviceId, ref.capabilityId, value); };
  return { recorder, sdk, entries, set, state, saved: () => saved };
}

test('it begins with a point of now, and only for what Homey does not keep itself', async () => {
  const s = setup();
  await s.recorder.start();
  expect(s.entries(solar)).toEqual([400]);
  expect(s.entries(use)).toEqual([100]);
  expect(s.entries(shore)).toEqual([1]);
  // the battery has a log of its own device
  expect(s.entries(battery)).toBeNull();
  expect(s.sdk.logs.get(recordedLogId('d-sun', 'measure_power'))!).toMatchObject({ type: 'number', title: { nl: 'Expressive Home: d-sun' } });
  s.recorder.stop();
});

test('one point a minute, on the minute: the mean over the minute, weighed by time', async () => {
  const s = setup();
  await s.recorder.start();
  // 10:00:30 → the next whole minute is 10:01:00; the sun was 400 for 30 s
  await vi.advanceTimersByTimeAsync(30_000);
  expect(s.entries(solar)).toEqual([400, 400]);
  await vi.advanceTimersByTimeAsync(15_000);
  s.set(solar, 0);
  await vi.advanceTimersByTimeAsync(45_000);
  // 15 s of 400 and 45 s of 0
  expect(s.entries(solar)).toEqual([400, 400, 100]);
  await vi.advanceTimersByTimeAsync(5 * MIN);
  expect(s.entries(solar)).toHaveLength(8);
  expect(s.entries(solar)!.at(-1)).toBe(0);
  s.recorder.stop();
});

test('shore power is 1 when connected and 0 without power from outside, also when only inverting', async () => {
  const s = setup();
  await s.recorder.start();
  s.set(shore, 'none');
  await vi.advanceTimersByTimeAsync(30_000);
  s.set(shore, 'inverting');
  await vi.advanceTimersByTimeAsync(MIN);
  s.set(shore, 'shore');
  await vi.advanceTimersByTimeAsync(MIN);
  s.set(shore, 'generator');
  await vi.advanceTimersByTimeAsync(MIN);
  expect(s.entries(shore)).toEqual([1, 0, 0, 1, 1]);
  s.recorder.stop();
});

test('at most eight values; switched off nothing is written; a value Homey begins to keep is no longer written', async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ deviceId: `d-${i}`, capabilityId: 'measure_power' }));
  const s = setup({ wanted: many, kept: [] });
  for (const ref of many) s.set(ref, 5);
  await s.recorder.start();
  expect(s.recorder.recording()).toHaveLength(RECORD_MAX);
  s.recorder.stop();
  const off = setup({ enabled: false });
  await off.recorder.start();
  await vi.advanceTimersByTimeAsync(3 * MIN);
  expect(off.sdk.createLog).not.toHaveBeenCalled();
  off.recorder.stop();
});

test('"Opname wissen" deletes every recorded log, and the test logs of the measurement go at the start', async () => {
  const s = setup();
  s.sdk.logs.set('probe_number', { type: 'number', title: {}, entries: [] });
  s.sdk.logs.set('probe_delete', { type: 'number', title: {}, entries: [] });
  await s.recorder.start();
  expect(s.sdk.logs.has('probe_number')).toBe(false);
  expect(s.sdk.logs.has('probe_delete')).toBe(false);
  s.recorder.stop();
  await s.recorder.wipe();
  expect([...s.sdk.logs.keys()]).toEqual([]);
  expect(s.saved()).toEqual({ logs: {} });
});

test('a log nothing was written to for thirty days goes; one that is still recorded stays', async () => {
  const old = recordedLogId('d-gone', 'measure_power');
  const s = setup({ stored: { logs: { [old]: { deviceId: 'd-gone', capabilityId: 'measure_power', last: START - 31 * 24 * 60 * MIN } } } });
  s.sdk.logs.set(old, { type: 'number', title: {}, entries: [] });
  await s.recorder.start();
  expect(s.sdk.logs.has(old)).toBe(false);
  expect(s.sdk.logs.has(recordedLogId('d-sun', 'measure_power'))).toBe(true);
  expect(Object.keys((s.saved() as { logs: Record<string, unknown> }).logs)).not.toContain(old);
  s.recorder.stop();
});

test('a value Homey begins to keep is no longer written once that is known', async () => {
  const kept: HistorySource[] = [];
  const s = setup({ wanted: [solar], kept });
  await s.recorder.start();
  kept.push({ log: 'homey:device:d-sun:measure_power', kind: 'device', type: 'number', ...solar });
  await vi.advanceTimersByTimeAsync(30 * MIN);
  const before = s.entries(solar)!.length;
  await vi.advanceTimersByTimeAsync(45 * MIN);
  expect(s.entries(solar)!.length).toBe(before);
  expect(s.recorder.recording()).toEqual([]);
  s.recorder.stop();
});

test('a value that becomes known later begins with a point of now at once', async () => {
  const s = setup({ wanted: [solar], kept: [] });
  s.set(solar, null as unknown as CapabilityValue);
  await s.recorder.start();
  expect(s.entries(solar)).toBeNull();
  s.set(solar, 250);
  await s.recorder.refresh();
  expect(s.entries(solar)).toEqual([250]);
  s.recorder.stop();
});

test('until Homey has said what it keeps, nothing is recorded; a failed answer is not kept', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  const sdk = insights();
  let ready = false;
  const kept = vi.fn(async (): Promise<HistorySource[]> => {
    if (!ready) throw new Error('not connected');
    return [{ log: 'homey:device:d-sun:measure_power', kind: 'device', type: 'number', ...solar }];
  });
  const recorder = createRecorder({
    insights: sdk, wanted: () => [solar, use], value: () => 300, kept, title: () => ({ en: 'x', nl: 'x' }), load: () => undefined, save: () => {},
    enabled: () => true, now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  await recorder.start();
  expect(sdk.createLog).not.toHaveBeenCalled();
  ready = true;
  await recorder.refresh();
  // the sun is kept by Homey: only the use is recorded
  expect([...sdk.logs.keys()]).toEqual([recordedLogId('d-use', 'measure_power')]);
  recorder.stop();
});

test('wiping while a minute is being written does not bring a log back, and starting twice is one timer', async () => {
  const s = setup({ kept: [] });
  await s.recorder.start();
  // a slow hub: the write of the next minute is under way when the wipe comes
  let release: () => void = () => {};
  s.sdk.createLog.mockImplementation(async () => { await new Promise<void>((go) => { release = go; }); throw new Error('late'); });
  await s.recorder.start();
  await s.recorder.start();
  await vi.advanceTimersByTimeAsync(30_000);
  s.recorder.stop();
  await s.recorder.wipe();
  release();
  await vi.advanceTimersByTimeAsync(3 * MIN);
  expect([...s.sdk.logs.keys()]).toEqual([]);
  // and once started again: one point a minute, not two
  s.sdk.createLog.mockImplementation(async (id: string, options: { type: 'number' | 'boolean'; title: Record<string, string> }) => {
    s.sdk.logs.set(id, { type: options.type, title: options.title, entries: [] });
    return { id, createEntry: vi.fn(async (value: number) => { s.sdk.logs.get(id)!.entries.push({ at: Date.now(), value }); }) };
  });
  await s.recorder.start();
  await s.recorder.start();
  const before = s.entries(solar)!.length;
  await vi.advanceTimersByTimeAsync(3 * MIN);
  expect(s.entries(solar)!.length - before).toBe(3);
  s.recorder.stop();
});

test('switched on later, it begins as at the start: tidying up and a point of now', async () => {
  const s = setup({ enabled: false });
  s.sdk.logs.set('probe_number', { type: 'number', title: {}, entries: [] });
  await s.recorder.start();
  s.state.enabled = true;
  await s.recorder.start();
  expect(s.sdk.logs.has('probe_number')).toBe(false);
  expect(s.entries(solar)).toEqual([400]);
  s.recorder.stop();
});

test('a value that is chosen while it runs gets a point of now at the next minute, and old logs go also after months', async () => {
  const wanted = [solar];
  const s = setup({ wanted, kept: [] });
  await s.recorder.start();
  wanted.push(use);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(s.entries(use)).toEqual([100]);
  s.recorder.stop();
});

test('a log nothing was written to goes after thirty days, also on a hub that runs for months', async () => {
  const old = recordedLogId('d-gone', 'measure_power');
  const s = setup({ stored: { logs: { [old]: { deviceId: 'd-gone', capabilityId: 'measure_power', last: START - 29 * 24 * 60 * MIN } } } });
  s.sdk.logs.set(old, { type: 'number', title: {}, entries: [] });
  await s.recorder.start();
  expect(s.sdk.logs.has(old)).toBe(true);
  await vi.advanceTimersByTimeAsync(2 * 24 * 60 * MIN);
  expect(s.sdk.logs.has(old)).toBe(false);
  s.recorder.stop();
});
