// Live news of apps on the hub for their widgets on this page: which widget listens to what goes to the app on the hub
// for this page's stream; what comes back goes to the widgets of that app that listen to that name.

import { RequestError, type LinkEvents } from '../served/link';
import { LIVE_LIMITS } from './crossframe';

export const LIVE_TIMES = {
  /** What widgets listen to is told this long after the last change. */
  sendMs: 300,
  /** A hub that said nothing for longer than this may have missed news: the widgets of apps start anew. */
  restartAfterMs: 30_000,
  /** Over how long they start, so that not every tablet asks at once. */
  spreadMs: 5_000,
  /** When what was told did not arrive, it is told again after these times; the last one keeps on. */
  retryMs: [5_000, 10_000, 30_000, 60_000],
} as const;

type LiveEvents = Pick<LinkEvents, 'open' | 'app-event' | 'app-gap'>;

/** The part of the link that is used. */
export interface LiveLink {
  on<K extends keyof LiveEvents>(type: K, listener: (value: LiveEvents[K]) => void): () => void;
  request(method: 'POST', path: string, body: unknown): Promise<unknown>;
}

export interface AppLiveDeps {
  link: LiveLink;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** A number from 0 up to 1. */
  random(): number;
}

/** A widget of an app on this page. */
export interface LiveListener {
  /** The names of the news it listens to now. */
  names(): string[];
  news(event: string, data: unknown): void;
  /** It starts anew, to show how things are now. */
  restart(): void;
}

export interface LiveHandle {
  /** The names it listens to changed. */
  changed(): void;
  stop(): void;
}

const APP_REF = /^app:([a-z0-9][a-z0-9._-]{0,79})\/[a-z0-9][a-z0-9._-]{0,79}$/;

interface Entry { ref: string; app: string; listener: LiveListener; restart: unknown }

export function createAppLive(deps: AppLiveDeps) {
  const entries = new Set<Entry>();
  let stream: string | null = null;
  /** What this stream was last told, as text. */
  let told = '';
  let timer: unknown = null;
  let tries = 0;
  /** One telling at a time per stream: what changes meanwhile is told after it. */
  let sending: string | null = null;
  let again = false;

  function wants(): { ref: string; events: string[] }[] {
    const byRef = new Map<string, Set<string>>();
    for (const entry of entries) {
      const names = byRef.get(entry.ref) ?? new Set<string>();
      for (const name of entry.listener.names()) names.add(name);
      byRef.set(entry.ref, names);
    }
    // as much as the hub takes, and no more
    return [...byRef].filter(([, names]) => names.size > 0).slice(0, LIVE_LIMITS.widgets).map(([ref, names]) => ({ ref, events: [...names].slice(0, LIVE_LIMITS.listeners) }));
  }

  function schedule(ms: number = LIVE_TIMES.sendMs): void {
    if (timer !== null) deps.clearTimeout(timer);
    timer = deps.setTimeout(() => { timer = null; void tell(); }, ms);
  }

  async function tell(): Promise<void> {
    if (stream === null) return;
    if (sending === stream) { again = true; return; }
    const body = { stream, wants: wants() };
    const text = JSON.stringify(body);
    if (text === told) return;
    const before = told;
    told = text;
    sending = body.stream;
    try {
      await deps.link.request('POST', 'api/app-live', body);
      tries = 0;
    } catch (error) {
      // the hub refused it: telling it again does not help; another stream by now tells it anyway
      if (!(error instanceof RequestError && error.status >= 400 && error.status < 500) && stream === body.stream && told === text) {
        told = before;
        schedule(LIVE_TIMES.retryMs[Math.min(tries, LIVE_TIMES.retryMs.length - 1)]);
        tries += 1;
      }
    } finally {
      if (sending === body.stream) sending = null;
      if (again && sending === null) {
        again = false;
        schedule();
      }
    }
  }

  function restartLater(entry: Entry): void {
    if (entry.restart !== null) return;
    entry.restart = deps.setTimeout(() => {
      entry.restart = null;
      if (entries.has(entry)) entry.listener.restart();
    }, Math.floor(deps.random() * LIVE_TIMES.spreadMs));
  }

  deps.link.on('open', (open) => {
    if (open.gap !== undefined && open.gap > LIVE_TIMES.restartAfterMs) for (const entry of [...entries]) restartLater(entry);
    if (open.stream === undefined || open.stream === stream) return;
    stream = open.stream;
    // a new stream knows nothing yet
    told = JSON.stringify({ stream, wants: [] });
    tries = 0;
    schedule();
  });
  deps.link.on('app-event', ({ app, event, data }) => {
    for (const entry of [...entries]) if (entry.app === app && entry.listener.names().includes(event)) entry.listener.news(event, data);
  });
  deps.link.on('app-gap', ({ app }) => {
    for (const entry of [...entries]) if (entry.app === app) restartLater(entry);
  });

  return {
    listen(ref: string, listener: LiveListener): LiveHandle {
      const app = APP_REF.exec(ref)?.[1];
      if (app === undefined) return { changed: () => {}, stop: () => {} };
      const entry: Entry = { ref, app, listener, restart: null };
      entries.add(entry);
      return {
        changed: () => { if (entries.has(entry)) schedule(); },
        stop: () => {
          if (!entries.delete(entry)) return;
          if (entry.restart !== null) deps.clearTimeout(entry.restart);
          entry.restart = null;
          schedule();
        },
      };
    },
  };
}

export type AppLive = ReturnType<typeof createAppLive>;
