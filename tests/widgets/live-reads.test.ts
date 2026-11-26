import { beforeEach, expect, test, vi } from 'vitest';
import { createReadSource, type ReadState } from '../../src/widgets/live-reads';

beforeEach(() => { vi.useFakeTimers(); return () => { vi.useRealTimers(); }; });
const settle = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

function setup(read = vi.fn(async (): Promise<unknown> => ({ n: 1 }))) {
  let visible = true;
  let onVisible: () => void = () => {};
  const source = createReadSource({
    read, parse: (raw) => (typeof raw === 'object' && raw !== null && 'n' in raw ? (raw as { n: number }).n : null), everyMs: 60_000,
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => Date.now(),
    visible: () => visible, onVisible: (fn) => { onVisible = fn; return () => {}; },
  });
  const heard: ReadState<number>[] = [];
  return { source, read, heard, setVisible: (on: boolean) => { visible = on; if (on) onVisible(); } };
}

test('nothing is asked until something listens; then at once, and again every while', async () => {
  const s = setup();
  await vi.advanceTimersByTimeAsync(300_000);
  expect(s.read).not.toHaveBeenCalled();
  const stop = s.source.listen((state) => s.heard.push(state));
  await settle();
  expect(s.read).toHaveBeenCalledTimes(1);
  expect(s.heard.at(-1)).toMatchObject({ value: 1, error: null });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(s.read).toHaveBeenCalledTimes(2);
  stop();
  await vi.advanceTimersByTimeAsync(300_000);
  expect(s.read).toHaveBeenCalledTimes(2);
});

test('two listeners share one asking; a late one gets what is known at once', async () => {
  const s = setup();
  s.source.listen(() => {});
  await settle();
  const late: ReadState<number>[] = [];
  s.source.listen((state) => late.push(state));
  expect(late[0]).toMatchObject({ value: 1 });
  expect(s.read).toHaveBeenCalledTimes(1);
});

test('a page out of sight asks nothing; back in sight it asks when what it has is old', async () => {
  const s = setup();
  s.source.listen(() => {});
  await settle();
  s.setVisible(false);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(s.read).toHaveBeenCalledTimes(1);
  s.setVisible(true);
  await settle();
  expect(s.read).toHaveBeenCalledTimes(2);
});

test('a refusal is said by its kind, and what was known stays', async () => {
  let answer: () => Promise<unknown> = async () => ({ n: 4 });
  const s = setup(vi.fn(() => answer()));
  s.source.listen((state) => s.heard.push(state));
  await settle();
  answer = async () => { throw Object.assign(new Error('x'), { status: 403 }); };
  await vi.advanceTimersByTimeAsync(60_000);
  expect(s.heard.at(-1)).toMatchObject({ value: 4, error: 'no-right' });
  answer = async () => { throw new Error('away'); };
  await vi.advanceTimersByTimeAsync(60_000);
  expect(s.heard.at(-1)).toMatchObject({ value: 4, error: 'failed' });
  // a hub that has none: nothing is kept
  answer = async () => { throw Object.assign(new Error('x'), { statusCode: 404 }); };
  await vi.advanceTimersByTimeAsync(60_000);
  expect(s.heard.at(-1)).toMatchObject({ value: null, error: 'none' });
});

test('asked again while an asking runs: asked once more when it is done, not a while later', async () => {
  let done: (value: unknown) => void = () => {};
  const read = vi.fn(() => new Promise<unknown>((resolve) => { done = resolve; }));
  const s = setup(read);
  s.source.listen(() => {});
  expect(read).toHaveBeenCalledTimes(1);
  s.source.refresh();
  expect(read).toHaveBeenCalledTimes(1);
  done({ n: 2 });
  await settle();
  expect(read).toHaveBeenCalledTimes(2);
});

test('listening anew soon after an asking failed asks nothing: once a while, also when it fails', async () => {
  const read = vi.fn(async (): Promise<unknown> => { throw Object.assign(new Error('x'), { status: 403 }); });
  const s = setup(read);
  const stop = s.source.listen(() => {});
  await settle();
  expect(read).toHaveBeenCalledTimes(1);
  stop();
  await vi.advanceTimersByTimeAsync(30_000);
  s.source.listen(() => {});
  await settle();
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(read).toHaveBeenCalledTimes(2);
});

test('cleared, as for another hub: what was known is gone, a late answer of before is dropped, and it is asked anew', async () => {
  let done: (value: unknown) => void = () => {};
  const read = vi.fn(() => new Promise<unknown>((resolve) => { done = resolve; }));
  const s = setup(read);
  s.source.listen((state) => s.heard.push(state));
  done({ n: 1 });
  await settle();
  expect(s.source.get()).toMatchObject({ value: 1 });
  s.source.refresh();
  const old = done;
  s.source.clear();
  expect(s.heard.at(-1)).toEqual({ value: null, at: null, error: null });
  old({ n: 1 });
  await settle();
  expect(s.source.get().value).toBeNull();
  expect(read).toHaveBeenCalledTimes(3);
  done({ n: 7 });
  await settle();
  expect(s.source.get().value).toBe(7);
});

test('a value of a period that is over is gone at its end, and the new one is asked for at once', async () => {
  vi.setSystemTime(new Date(2026, 10, 25, 23, 58));
  const midnight = (now: number) => { const d = new Date(now); d.setHours(24, 0, 0, 0); return d.getTime(); };
  const read = vi.fn(async (): Promise<unknown> => ({ n: new Date().getDate() }));
  const source = createReadSource({
    read, parse: (raw) => (raw as { n: number }).n, everyMs: 300_000,
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => Date.now(),
    visible: () => true, onVisible: () => () => {},
    period: { keyOf: (now) => new Date(now).toDateString(), nextAt: midnight },
  });
  const heard: ReadState<number>[] = [];
  source.listen((state) => heard.push(state));
  await settle();
  expect(source.get().value).toBe(25);
  await vi.advanceTimersByTimeAsync(2 * 60_000 + 1_000);
  expect(heard.some((state) => state.value === null)).toBe(true);
  expect(source.get().value).toBe(26);
  expect(read).toHaveBeenCalledTimes(2);
});
