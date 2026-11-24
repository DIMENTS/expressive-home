import type { Capability } from '../../homey/types';

type Range = Pick<Capability, 'min' | 'max' | 'step'>;

/** A slider sends at most this often while it is dragged. */
export const SLIDER_SEND_MS = 200;

const bounds = (range: Range): [number, number] => [range.min ?? 0, range.max ?? 1];

/** Rounds away the float noise of binary arithmetic (0.51 + 0.1 = 0.6100000000000001). */
const clean = (value: number): number => Math.round(value * 1e9) / 1e9;

/** The step of the hub, otherwise a hundredth of the range. */
export function stepOf(range: Range): number {
  if (range.step !== null && range.step > 0) return range.step;
  const [min, max] = bounds(range);
  return max > min ? clean((max - min) / 100) : 0.01;
}

/** The value at a fraction of the range: clamped, snapped to the step, without float noise. */
export function valueAt(fraction: number, range: Range): number {
  const [min, max] = bounds(range);
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const step = stepOf(range);
  const snapped = min + Math.round(((max - min) * f) / step) * step;
  return clean(Math.min(max, Math.max(min, snapped)));
}

/** Where a value lies in the range, 0 to 1, clamped. */
export function fractionOf(value: number, range: Range): number {
  const [min, max] = bounds(range);
  if (!(max > min) || !Number.isFinite(value)) return 0;
  return clean(Math.min(1, Math.max(0, (value - min) / (max - min))));
}

interface Timers { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void }

/**
 * Sends the first value at once, then at most once per `ms`, always ending with the latest value pushed;
 * `finish` sends a final value now and drops anything pending, `cancel` drops it without sending.
 */
export function createThrottle(send: (value: number) => void, ms: number, timers: Timers): { push(value: number): void; finish(value: number): void; cancel(): void } {
  let lastSent = Number.NEGATIVE_INFINITY;
  let pending: { value: number } | null = null;
  let handle: unknown = null;
  const stopTimer = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };
  const flush = () => {
    handle = null;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    lastSent = timers.now();
    send(value);
  };
  return {
    push(value) {
      const wait = lastSent + ms - timers.now();
      if (wait <= 0 && handle === null) {
        lastSent = timers.now();
        send(value);
        return;
      }
      pending = { value };
      if (handle === null) handle = timers.setTimeout(flush, Math.max(0, wait));
    },
    finish(value) {
      stopTimer();
      pending = null;
      lastSent = timers.now();
      send(value);
    },
    cancel() {
      stopTimer();
      pending = null;
    },
  };
}

/** Whether a value goes along while its slider is dragged: a motor and a boiler are told once, where it is let go. */
export const goesAlong = (baseId: string): boolean => baseId !== 'target_temperature' && !baseId.startsWith('windowcoverings_');
