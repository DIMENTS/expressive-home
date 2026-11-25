import type { HistoryPeriod, HistorySeries, HistorySource, HistorySwitches } from '../homey/client';

export interface HistoryCacheDeps {
  read(source: HistorySource, period: HistoryPeriod): Promise<HistorySeries | null>;
  switches(source: HistorySource): Promise<HistorySwitches | null>;
  now(): number;
  /** How many answers are kept at most; the oldest goes first. */
  limit?: number;
  /** How many logs are read from the hub at the same time. */
  parallel?: number;
}

/** An answer is never kept longer than this, whatever the hub says. */
export const HISTORY_KEEP_MS = 300_000;
/** The changes of on and off have no time to keep from the hub: a minute. */
const SWITCHES_KEEP_MS = 60_000;
const LIMIT = 200;
const PARALLEL = 3;

/**
 * Remembers what the hub answered about history, so that many devices do not ask it the same: equal requests are
 * joined, an answer is kept as long as the hub says it stays the same, and only a few logs are read at a time.
 */
export function createHistoryCache(deps: HistoryCacheDeps) {
  const limit = deps.limit ?? LIMIT;
  const parallel = deps.parallel ?? PARALLEL;
  const kept = new Map<string, { until: number; answer: Promise<unknown> }>();
  const waiting: (() => void)[] = [];
  let reading = 0;

  /** One slot of the few: a slot that frees up goes straight to who waited, so there are never more. */
  async function turn<T>(read: () => Promise<T>): Promise<T> {
    if (reading >= parallel) await new Promise<void>((go) => waiting.push(go));
    else reading += 1;
    try {
      return await read();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else reading -= 1;
    }
  }

  function remembered<T>(key: string, read: () => Promise<T>, keep: (answer: T) => number): Promise<T> {
    const now = deps.now();
    const found = kept.get(key);
    if (found && found.until > now) {
      // the newest use goes to the end, so the least used goes first
      kept.delete(key);
      kept.set(key, found);
      return found.answer as Promise<T>;
    }
    const entry = { until: Number.POSITIVE_INFINITY, answer: turn(read) as Promise<unknown> };
    kept.delete(key);
    kept.set(key, entry);
    while (kept.size > limit) kept.delete(kept.keys().next().value!);
    entry.answer.then(
      (answer) => { entry.until = deps.now() + Math.min(Math.max(keep(answer as T), 0), HISTORY_KEEP_MS); },
      () => { if (kept.get(key) === entry) kept.delete(key); },
    );
    return entry.answer as Promise<T>;
  }

  return {
    series: (source: HistorySource, period: HistoryPeriod): Promise<HistorySeries | null> =>
      remembered(`${source.log}\n${period}`, () => deps.read(source, period), (answer) => answer?.updatesIn ?? HISTORY_KEEP_MS),
    switches: (source: HistorySource): Promise<HistorySwitches | null> =>
      remembered(`${source.log}\nswitches`, () => deps.switches(source), () => SWITCHES_KEEP_MS),
    /** Forgets everything, for a new connection with the hub. */
    clear: (): void => { kept.clear(); },
  };
}

export type HistoryCache = ReturnType<typeof createHistoryCache>;
