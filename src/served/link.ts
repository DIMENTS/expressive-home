// The way to the app on the hub that served this page: requests to its own address, and one live stream.

/** The part of EventSource that is used. */
export interface EventStream {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: { data?: string }) => void): void;
  close(): void;
}

export interface LinkDeps {
  fetch(path: string, init?: RequestInit): Promise<Response>;
  openStream(path: string): EventStream;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

/** What a paired device may do: use the dashboard, or also arrange it. */
export type Role = 'use' | 'edit';

export type LinkEvents = {
  /**
   * The stream is there: again, or for the first time. `looks`: the number of the looks of the house, null from a hub
   * that has none; `rescue`: how often the owner put every device back in Rustig, absent where that is not counted.
   */
  open: { revision: number; role: Role | null; looks: number | null; rescue?: number; widgets?: number };
  /** The stream went, or did not come; it is tried again by itself. */
  lost: null;
  hub: unknown;
  layouts: { revision: number };
  /** The looks of the house changed. */
  looks: { revision: number };
  /** The own widgets of the house changed. */
  widgets: { revision: number };
  /** What a flow on the hub said of the night of the wall tablets, and how long ago in ms; null: nothing. */
  night: { night: boolean; age: number } | null;
  /** The mark of the version of the dashboard that the hub has. */
  build: string;
  /** What this device may do from now on. */
  role: Role;
  /** This device was taken away by the owner. */
  unpaired: null;
};

/** Without any sign of life for this long the stream counts as gone: the server sends one every twenty seconds. */
export const SILENT_MS = 50_000;
/** A new stream that has not greeted after this long did not come. */
export const HELLO_MS = 10_000;
export const REOPEN_MS = 3000;
/** A request without an answer after this long has failed. */
export const REQUEST_MS = 10_000;
/** How long whoever waits for the stream waits: without it everything can still be read. */
export const UP_WAIT_MS = 3000;
/** A page that is looked at again trusts a stream that gave a sign of life this recently, and one that was only just asked for. */
const FRESH_MS = 25_000;
const ASKED_MS = 2000;
/** EventSource.CLOSED */
const CLOSED = 2;
/** A browser finishes a request of a page that closes up to 64 kB. */
const KEEPALIVE_BYTES = 60_000;

export class RequestError extends Error {
  constructor(readonly status: number, readonly body: unknown) { super(`status ${status}`); }
}

export function createLink(deps: LinkDeps) {
  const listeners: { [K in keyof LinkEvents]: Set<(value: LinkEvents[K]) => void> } = { open: new Set(), lost: new Set(), hub: new Set(), layouts: new Set(), looks: new Set(), widgets: new Set(), night: new Set(), build: new Set(), role: new Set(), unpaired: new Set() };
  /** Who needs the stream: it is open, or tried again, as long as there is one. */
  const holders = new Set<object>();
  let stream: EventStream | null = null;
  let silent: unknown = null;
  let reopen: unknown = null;
  let up = false;
  let asleep = false;
  let heardAt = 0;

  const emit = <K extends keyof LinkEvents>(type: K, value: LinkEvents[K]): void => { for (const listener of [...listeners[type]]) listener(value); };
  const parse = (data: string | undefined): Record<string, unknown> => {
    try {
      const value: unknown = JSON.parse(data ?? '');
      return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
    } catch {
      return {};
    }
  };

  function night(raw: unknown): void {
    if (raw === null) { emit('night', null); return; }
    const { night: on, age } = (typeof raw === 'object' ? raw : {}) as { night?: unknown; age?: unknown };
    if (typeof on === 'boolean' && typeof age === 'number' && age >= 0) emit('night', { night: on, age });
  }

  function clear(): void {
    if (silent !== null) deps.clearTimeout(silent);
    if (reopen !== null) deps.clearTimeout(reopen);
    silent = null;
    reopen = null;
    stream?.close();
    stream = null;
    up = false;
  }

  function lost(): void {
    clear();
    emit('lost', null);
    if (holders.size > 0 && stream === null && !asleep) reopen = deps.setTimeout(connect, REOPEN_MS);
  }

  function watch(ms: number): void {
    if (silent !== null) deps.clearTimeout(silent);
    silent = deps.setTimeout(lost, ms);
  }

  function connect(): void {
    clear();
    asleep = false;
    heardAt = deps.now();
    const own = deps.openStream('api/events');
    stream = own;
    const on = (type: string, act: (data: Record<string, unknown>) => void): void => {
      own.addEventListener(type, (event) => {
        if (stream !== own) return;
        heardAt = deps.now();
        watch(SILENT_MS);
        act(parse(event.data));
      });
    };
    watch(HELLO_MS);
    on('hello', (data) => {
      up = true;
      emit('open', {
        revision: Number(data['revision']) || 0, role: data['role'] === 'use' || data['role'] === 'edit' ? data['role'] : null, looks: typeof data['looks'] === 'number' ? data['looks'] : null,
        ...(typeof data['rescue'] === 'number' ? { rescue: data['rescue'] } : {}),
        ...(typeof data['widgets'] === 'number' ? { widgets: data['widgets'] } : {}),
      });
      if (data['night'] !== undefined) night(data['night']);
      if (typeof data['build'] === 'string' && data['build'] !== '') emit('build', data['build']);
    });
    on('ping', () => {});
    on('hub', (data) => emit('hub', data));
    on('layouts', (data) => emit('layouts', { revision: Number(data['revision']) || 0 }));
    on('looks', (data) => emit('looks', { revision: Number(data['revision']) || 0 }));
    on('widgets', (data) => emit('widgets', { revision: Number(data['revision']) || 0 }));
    on('night', night);
    on('role', ({ role }) => { if (role === 'use' || role === 'edit') emit('role', role); });
    on('unpaired', unpaired);
    own.addEventListener('error', () => {
      if (stream !== own) return;
      // refused (not paired any more), or the server is away: the browser gives up on the first, and tries the second again
      if (own.readyState === CLOSED) void refused();
      else lost();
    });
  }

  async function refused(): Promise<void> {
    lost();
    try {
      const session = await request('GET', 'api/session') as { paired?: unknown };
      if (session.paired === false && holders.size > 0) unpaired();
    } catch {
      // no answer: it is tried again
    }
  }

  function unpaired(): void {
    holders.clear();
    clear();
    emit('unpaired', null);
  }

  async function request(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<unknown> {
    const abort = new AbortController();
    const timer = deps.setTimeout(() => abort.abort(), REQUEST_MS);
    const text = body === undefined ? undefined : JSON.stringify(body);
    try {
      const response = await deps.fetch(path, {
        method, credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
        ...(text === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: text }),
        // what is being saved when the page closes still arrives
        ...(method === 'PUT' && text !== undefined && new TextEncoder().encode(text).byteLength < KEEPALIVE_BYTES ? { keepalive: true } : {}),
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new RequestError(response.status, value);
      return value;
    } finally {
      deps.clearTimeout(timer);
    }
  }

  function on<K extends keyof LinkEvents>(type: K, listener: (value: LinkEvents[K]) => void): () => void {
    listeners[type].add(listener);
    return () => { listeners[type].delete(listener); };
  }

  /** Runs something a while later; returns how to call it off. */
  function later(fn: () => void, ms: number): () => void {
    const handle = deps.setTimeout(fn, ms);
    return () => deps.clearTimeout(handle);
  }

  return {
    request, on, later, now: deps.now,
    /** Whether the stream is there now. */
    up: (): boolean => up,
    /** Opens the stream, at once when it was waiting to be tried again, and keeps it open until what is returned is called. */
    hold(): () => void {
      const holder = {};
      holders.add(holder);
      if (stream === null) connect();
      return () => {
        if (holders.delete(holder) && holders.size === 0) clear();
      };
    },
    /** Settles when the stream is there, did not come, or keeps one waiting. */
    whenUp(): Promise<void> {
      if (up || stream === null) return Promise.resolve();
      return new Promise((resolve) => {
        const done = (): void => {
          for (const stop of stops) stop();
          resolve();
        };
        const stops = [on('open', done), on('lost', done), on('unpaired', done), later(done, UP_WAIT_MS)];
      });
    },
    /** Nobody looks at the page: the stream is given back, without saying that it went. */
    sleep(): void {
      if (holders.size === 0) return;
      clear();
      asleep = true;
    },
    /** The page is looked at (again), or the network came back: the stream is opened anew unless it is surely alive. */
    wake(): void {
      const age = deps.now() - heardAt;
      // an age below zero: the clock was set back
      if (holders.size === 0 || (stream !== null && age >= 0 && age < (up ? FRESH_MS : ASKED_MS))) return;
      connect();
    },
  };
}

export type Link = ReturnType<typeof createLink>;
