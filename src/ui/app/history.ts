import type { HistoryPeriod, HistoryRef, HistorySeries, HistorySource, HistorySwitches, HomeyClient } from '../../homey/client';

export interface HistoryAccessDeps {
  /** The client of now; null without a connection. */
  client(): HomeyClient | null;
  /** Every value the page knows, so the logs the app on the hub records are found too. */
  known(): HistoryRef[];
  now(): number;
}

/** What the page asks the hub about history: the list of logs, the points of one, and the changes of on and off. */
export interface HistoryAccess {
  sources(): Promise<HistorySource[]>;
  series(source: HistorySource, period: HistoryPeriod): Promise<HistorySeries | null>;
  switches(source: HistorySource): Promise<HistorySwitches | null>;
}

/** A page asks at most this many at a time, so a wall of tiles does not flood the hub. */
const PARALLEL = 4;
/** An answer is kept this long; a chart asks again after it. */
export const HISTORY_FRESH_MS = 300_000;

/**
 * History for the page: the list of logs once per connection and every five minutes, answers kept for five minutes, equal questions joined,
 * and at most four at a time. A failure is not kept; without a connection there is nothing.
 */
export function createHistoryAccess(deps: HistoryAccessDeps): HistoryAccess {
  let listed: { client: HomeyClient; at: number; list: Promise<HistorySource[]> } | null = null;
  const kept = new Map<string, { client: HomeyClient; at: number; answer: Promise<unknown> }>();
  const waiting: (() => void)[] = [];
  let reading = 0;

  /** One slot of the few: a slot that frees up goes straight to who waited, so there are never more. */
  async function turn<T>(read: () => Promise<T>): Promise<T> {
    if (reading >= PARALLEL) await new Promise<void>((go) => waiting.push(go));
    else reading += 1;
    try {
      return await read();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else reading -= 1;
    }
  }


  function remembered<T>(key: string, read: (client: HomeyClient) => Promise<T>): Promise<T | null> {
    const client = deps.client();
    if (!client) return Promise.resolve(null);
    const now = deps.now();
    const found = kept.get(key);
    if (found && found.client === client && now - found.at >= 0 && now - found.at < HISTORY_FRESH_MS) return found.answer as Promise<T>;
    const entry = { client, at: now, answer: turn(() => read(client)) as Promise<unknown> };
    kept.set(key, entry);
    entry.answer.catch(() => { if (kept.get(key) === entry) kept.delete(key); });
    return entry.answer as Promise<T>;
  }

  return {
    sources() {
      const client = deps.client();
      if (!client) return Promise.resolve([]);
      const now = deps.now();
      // read again after a while: a value the app on the hub began to record, or a new device, shows up
      if (listed?.client !== client || now - listed.at < 0 || now - listed.at >= HISTORY_FRESH_MS) {
        const mine = { client, at: now, list: client.listHistory(deps.known()) };
        listed = mine;
        mine.list.catch(() => { if (listed === mine) listed = null; });
      }
      return listed.list;
    },
    series: (source, period) => remembered(`${source.log}\n${period}`, (client) => client.readSeries(source, period)),
    switches: (source) => remembered(`${source.log}\nswitches`, (client) => client.readSwitches(source)),
  };
}
