// The way to the app on the hub for a page with a key, at home or away: the same requests as a page the hub served, but as
// questions to the door of the app (its one open question of the web API), with the pairing in the body, because the app sees
// nothing else of a request. Instead of a live stream it looks at the revisions every so often while somebody sees the page.
import { SHARED_FORMAT, type DoorCall } from '../sync/protocol';
import { RequestError, type LinkEvents, type Role } from './link';

export interface DoorLinkDeps {
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /** The address of the hub on the route of the key (local or cloud); null when there is none now. */
  base(): string | null;
  /** The pairing of this page with the app on this hub; null before it paired. */
  token(): string | null;
  /** Keeps the pairing the door gave, or (null) forgets it. */
  keepToken(token: string | null): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

/** How often a page that is seen looks at the revisions; at rest, as on a wall tablet, less often. */
export const POLL_MS = 15_000;
export const REST_POLL_MS = 60_000;
/** A question without an answer after this long has failed; a large layout through the cloud takes a while. */
export const DOOR_REQUEST_MS = 30_000;
/** How long whoever waits for the first look waits. */
const UP_WAIT_MS = 3000;
const PATH = '/api/app/app.expressive.home/sync';
/** A browser finishes a request of a page that closes up to 64 kB. */
const KEEPALIVE_BYTES = 60_000;

/** The requests of the stores of a served page, and the question each one is at the door. */
const CALLS: Record<string, DoorCall> = {
  'GET api/session': 'session', 'POST api/pair': 'pair', 'POST api/unpair': 'unpair',
  'GET api/layouts': 'layouts', 'PUT api/layouts': 'put-layouts', 'GET api/looks': 'looks', 'POST api/looks': 'looks-ops', 'GET api/widgets': 'widgets', 'POST api/widgets': 'widgets-ops',
};
const CHANGES = new Set<DoorCall>(['put-layouts', 'looks-ops', 'widgets-ops']);

/** A no of the door as the answer the stores know from a hub at home. */
const REFUSALS: Record<string, [number, unknown]> = {
  'not-paired': [401, { error: 'not-paired' }], role: [403, { error: 'use-only' }], 'too-big': [413, { error: 'too-big' }], bad: [400, { error: 'bad' }],
  busy: [503, { error: 'busy' }], 'not-running': [503, { error: 'not-running' }], format: [412, { error: 'format' }],
  code: [403, { error: 'code' }], locked: [429, { error: 'locked' }], full: [403, { error: 'full' }],
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

interface Session { role: Role; boot: string; format: number; revisions: { layouts: number; looks: number; rescue: number; widgets: number } }

/** Which side is older when the shape of the documents differs: the app on the hub, or this page. */
export type Mismatch = 'update-app' | 'reload';

function sessionOf(value: unknown): Session | null {
  if (!isRecord(value) || !isRecord(value['device']) || !isRecord(value['revisions'])) return null;
  const role = value['device']['role'];
  const { layouts, looks, rescue, widgets } = value['revisions'];
  if ((role !== 'use' && role !== 'edit') || typeof value['boot'] !== 'string' || typeof value['format'] !== 'number') return null;
  if (![layouts, looks, rescue, widgets].every((n) => typeof n === 'number')) return null;
  // another shape of the documents: this page only looks, so neither side loses what the other knows
  return { role: value['format'] === SHARED_FORMAT ? role : 'use', boot: value['boot'], format: value['format'], revisions: { layouts, looks, rescue, widgets } as Session['revisions'] };
}

export function createDoorLink(deps: DoorLinkDeps) {
  const listeners: { [K in keyof LinkEvents]: Set<(value: LinkEvents[K]) => void> } = { open: new Set(), lost: new Set(), hub: new Set(), layouts: new Set(), looks: new Set(), widgets: new Set(), night: new Set(), build: new Set(), role: new Set(), unpaired: new Set(), 'app-event': new Set(), 'app-gap': new Set() };
  const holders = new Set<object>();
  let timer: unknown = null;
  let asleep = false;
  let resting = false;
  let up = false;
  let looked = false;
  /** What the last look saw; null before the first, or after a failure. */
  let last: Session | null = null;

  const emit = <K extends keyof LinkEvents>(type: K, value: LinkEvents[K]): void => { for (const listener of [...listeners[type]]) listener(value); };

  /** One question to the door; its no comes back as the error of a hub at home. */
  async function ask(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const base = deps.base();
    if (base === null) throw new RequestError(503, { error: 'no-route' });
    const abort = new AbortController();
    const text = JSON.stringify(body);
    const handle = deps.setTimeout(() => abort.abort(), DOOR_REQUEST_MS);
    try {
      const response = await deps.fetch(`${base}${PATH}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: abort.signal,
        // what is being saved when the page closes still arrives
        ...(CHANGES.has(body['call'] as DoorCall) && new TextEncoder().encode(text).byteLength < KEEPALIVE_BYTES ? { keepalive: true } : {}),
      });
      const value: unknown = await response.json().catch(() => null);
      // a no of the cloud or of the hub itself is never a no of the door: only the door says whether a page is paired
      if (!response.ok || !isRecord(value)) throw new RequestError(503, { error: 'unreachable' });
      if (typeof value['error'] === 'string') {
        if (value['error'] === 'conflict') throw new RequestError(409, value['doc']);
        const [status, refusal] = REFUSALS[value['error']] ?? [400, { error: 'bad' }];
        throw new RequestError(status, refusal);
      }
      return value;
    } finally {
      deps.clearTimeout(handle);
    }
  }

  async function request(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<unknown> {
    const call = CALLS[`${method} ${path}`];
    if (!call) throw new RequestError(404, { error: 'not-found' });
    const sent = isRecord(body) ? body : {};
    if (call === 'pair') {
      const answer = await ask({ call, code: sent['code'], name: sent['name'] });
      if (typeof answer['token'] !== 'string') throw new RequestError(502, null);
      deps.keepToken(answer['token']);
      return { device: answer['device'] };
    }
    const token = deps.token();
    if (call === 'session' && token === null) return { paired: false };
    if (token === null) throw new RequestError(401, { error: 'not-paired' });
    if (call === 'session') {
      try {
        const answer = await ask({ call, token });
        const seen = sessionOf(answer);
        const device = isRecord(answer['device']) ? answer['device'] : {};
        // the same rule as every look: another shape of the documents only looks
        return { paired: true, device: { ...device, ...(seen ? { role: seen.role } : {}) } };
      } catch (error) {
        if (error instanceof RequestError && error.status === 401) return { paired: false };
        throw error;
      }
    }
    const answer = await ask({ call, token, ...(CHANGES.has(call) ? { format: SHARED_FORMAT } : {}), ...sent });
    return call === 'put-layouts' ? answer['doc'] : call === 'looks-ops' || call === 'widgets-ops' ? answer['doc'] : answer;
  }

  function stopTimer(): void {
    if (timer !== null) deps.clearTimeout(timer);
    timer = null;
  }

  function schedule(): void {
    stopTimer();
    if (holders.size > 0 && !asleep) timer = deps.setTimeout(() => { void look(); }, resting ? REST_POLL_MS : POLL_MS);
  }

  /** A look is on its way: another waits for it. */
  let looking = false;

  /** One look at the revisions: what changed is told, and the first look after nothing or a failure opens. */
  async function look(): Promise<void> {
    stopTimer();
    if (looking) return;
    const token = deps.token();
    if (token === null || holders.size === 0) return;
    looking = true;
    try {
      await lookWith(token);
    } finally {
      looking = false;
    }
    schedule();
  }

  async function lookWith(token: string): Promise<void> {
    let seen: Session | null = null;
    try {
      seen = sessionOf(await ask({ call: 'session', token }));
    } catch (error) {
      if (error instanceof RequestError && error.status === 401) {
        holders.clear();
        up = false;
        last = null;
        emit('unpaired', null);
        return;
      }
    }
    looked = true;
    if (seen === null) {
      if (up) emit('lost', null);
      up = false;
      last = null;
    } else {
      const before = last;
      [up, last] = [true, seen];
      const { revisions } = seen;
      if (before === null || before.boot !== seen.boot) {
        emit('open', { revision: revisions.layouts, role: seen.role, looks: revisions.looks, rescue: revisions.rescue, widgets: revisions.widgets });
      } else {
        if (revisions.layouts !== before.revisions.layouts) emit('layouts', { revision: revisions.layouts });
        if (revisions.looks !== before.revisions.looks || revisions.rescue !== before.revisions.rescue) emit('looks', { revision: revisions.looks });
        if (revisions.widgets !== before.revisions.widgets) emit('widgets', { revision: revisions.widgets });
        if (seen.role !== before.role) emit('role', seen.role);
      }
    }
  }

  function on<K extends keyof LinkEvents>(type: K, listener: (value: LinkEvents[K]) => void): () => void {
    listeners[type].add(listener);
    return () => { listeners[type].delete(listener); };
  }

  function later(fn: () => void, ms: number): () => void {
    const handle = deps.setTimeout(fn, ms);
    return () => deps.clearTimeout(handle);
  }

  return {
    request, on, later, now: deps.now,
    up: (): boolean => up,
    /** Whether the app on the hub keeps the documents in another shape than this page, and which side is older. */
    mismatch: (): Mismatch | null => (last === null || last.format === SHARED_FORMAT ? null : last.format < SHARED_FORMAT ? 'update-app' : 'reload'),
    /** Looks at once, and every so often, until what is returned is called. */
    hold(): () => void {
      const holder = {};
      holders.add(holder);
      if (holders.size === 1) timer = deps.setTimeout(() => { void look(); }, 0);
      return () => {
        if (holders.delete(holder) && holders.size === 0) stopTimer();
      };
    },
    /** Settles after the first look, or when it keeps one waiting. */
    whenUp(): Promise<void> {
      if (looked || holders.size === 0) return Promise.resolve();
      return new Promise((resolve) => {
        const done = (): void => {
          for (const stop of stops) stop();
          resolve();
        };
        const stops = [on('open', done), on('lost', done), on('unpaired', done), later(done, UP_WAIT_MS)];
      });
    },
    /** Nobody looks at the page: no looking. */
    sleep(): void {
      asleep = true;
      stopTimer();
    },
    /** The page is looked at again, or the network came back: a look at once. */
    wake(): void {
      asleep = false;
      if (holders.size > 0) {
        stopTimer();
        timer = deps.setTimeout(() => { void look(); }, 0);
      }
    },
    /** At rest (the rest screen of a wall tablet) it looks less often. */
    rest(on: boolean): void {
      if (resting === on) return;
      resting = on;
      if (timer !== null) schedule();
    },
  };
}

export type DoorLink = ReturnType<typeof createDoorLink>;
