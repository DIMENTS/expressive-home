// Live news of other apps on the hub for their widgets on the dashboards: the app listens with the key that may do
// everything, only to apps of widgets that pages listen to, that stand on a dashboard of the house and that Homey has;
// it passes on only the names a page asked for, to that page's stream, within limits per app. It recovers by itself:
// the library only subscribes again after a first connection that worked.

import { RECOVERY_DELAYS_MS } from '../homey/api-client';
import type { SharedDocument } from './shared-layouts';
import { withoutSecrets } from './hub-link';
import { normalizeAppWidgets } from './app-widgets';
import { LIVE_LIMITS } from '../widgets/crossframe';
import { isWidgetRef } from '../widgets/widget-ref';

export const HUB_LIVE = {
  /** The apps listened to follow what pages want this long after the last change. */
  syncMs: 1000,
  /** Per app in a window of time: messages, and their size in bytes. */
  messages: 20,
  bytes: 64 * 1024,
  windowMs: 1000,
  /** One message at most, in bytes. */
  messageBytes: 32 * 1024,
  /** When something did not work, it is tried again after these times; the last one keeps on. */
  retryMs: RECOVERY_DELAYS_MS,
  /** An app no longer wanted is let go after this long: a page that comes back soon goes on without a gap. */
  releaseMs: 60_000,
  /** A session that is not there after this long is given up, and tried again. */
  openMs: 15_000,
  /** A session without connection for this long is replaced; it is looked at this often. */
  silentMs: 120_000,
  watchMs: 30_000,
  /** What one page may ask for. */
  refs: LIVE_LIMITS.widgets,
  names: LIVE_LIMITS.listeners,
  /** What was left out of an app is said at most this often. */
  noteMs: 60_000,
} as const;

export interface LiveSubscription { unsubscribe(): void }
export interface LiveHandlers {
  onEvent(event: string, data: unknown): void;
  onConnect?(): void;
  onDisconnect?(reason?: unknown): void;
  onReconnect?(): void;
  onReconnectError?(error: unknown): void;
}
/** The part of a session of the library with the hub that is used. */
export interface LiveSession {
  subscribe(uri: string, handlers: LiveHandlers): Promise<LiveSubscription>;
  isConnected(): boolean;
  destroy(): void;
}

export interface Want { ref: string; events: string[] }
export type LiveState = { state: 'none' | 'idle' | 'waiting' | 'on' | 'refused'; apps: number };

export interface HubLiveDeps {
  /** Whether there is a key that may do everything. */
  hasKey(): boolean;
  /** A session with the hub with that key; null when there is none; it throws when the hub cannot be reached yet. */
  open(): Promise<LiveSession | null>;
  /** The refs of the widgets of apps that Homey has; null when that cannot be told now, 'refused' when the key may not. */
  listed(): Promise<Set<string> | null | 'refused'>;
  /** The refs of the widgets of apps on the dashboards of the house. */
  placed(): Set<string>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
  log?(message: string): void;
}

const appOf = (ref: string): string => ref.slice(4, ref.indexOf('/'));
const isAppRef = (ref: unknown): ref is string => isWidgetRef(ref) && ref.startsWith('app:');

/** What a page says it wants, or null when it is not that; odd entries and names are left out, too many cut off. */
export function parseWants(raw: unknown): Want[] | null {
  if (!Array.isArray(raw)) return null;
  const wants: Want[] = [];
  for (const entry of raw) {
    if (wants.length >= HUB_LIVE.refs) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const { ref, events } = entry as { ref?: unknown; events?: unknown };
    if (!isAppRef(ref) || !Array.isArray(events)) continue;
    const names = [...new Set(events.filter((name): name is string => typeof name === 'string' && LIVE_LIMITS.name.test(name)))];
    wants.push({ ref, events: names.slice(0, HUB_LIVE.names) });
  }
  return wants;
}

/** What the hub answered when asked for its list of widgets: their refs, nothing to go by, or a refusal of the key. */
export function listedFrom(answer: { status: number; body: unknown } | null): Set<string> | null | 'refused' {
  if (answer === null) return null;
  if (answer.status === 401 || answer.status === 403) return 'refused';
  return answer.status === 200 ? new Set(normalizeAppWidgets(answer.body).map((row) => row.ref)) : null;
}

/** The widgets of apps that stand on any dashboard of the house. */
export function placedAppWidgets(doc: SharedDocument): Set<string> {
  const refs = new Set<string>();
  for (const layout of Object.values(doc.layouts)) {
    for (const board of layout.dashboards) {
      for (const section of board.sections ?? []) {
        for (const tile of section.tiles) if (tile.spec.kind === 'widget' && isAppRef(tile.spec.widget)) refs.add(tile.spec.widget);
      }
    }
  }
  return refs;
}

const isRefusal = (error: unknown): boolean => {
  const code = typeof error === 'object' && error !== null ? (error as { statusCode?: unknown }).statusCode : undefined;
  return code === 401 || code === 403 || (error instanceof Error && /unauthori[sz]ed/i.test(error.message));
};

/** `releaseAt`: when an app that is no longer wanted is let go; null while it is wanted. */
interface Entry { app: string; state: 'new' | 'subscribing' | 'on' | 'failed'; sub: LiveSubscription | null; tries: number; retry: unknown; broke: boolean; releaseAt: number | null }
interface Budget { start: number; count: number; bytes: number; pending: Map<string, { text: string; size: number }>; timer: unknown }

const sizeOf = (text: string): number => Buffer.byteLength(text, 'utf8');

export function createHubLive(deps: HubLiveDeps) {
  /** Per stream: per ref the names asked for. */
  const wants = new Map<string, Map<string, Set<string>>>();
  const listeners = new Set<(streams: string[], event: 'app-event' | 'app-gap', text: string, app: string) => void>();
  const subs = new Map<string, Entry>();
  const budgets = new Map<string, Budget>();
  const noted = new Map<string, number>();
  let activeRefs = new Set<string>();
  /** The apps there should be listened to; null while that is not known. */
  let target: Set<string> | null = null;
  let knownListed: Set<string> | null = null;
  let syncTimer: unknown = null;
  let syncDue = 0;
  let syncTurn = 0;
  let listTries = 0;
  let session: LiveSession | null = null;
  let sessionTurn = 0;
  let opening = false;
  let renewTimer: unknown = null;
  let sessionTries = 0;
  let watchTimer: unknown = null;
  let lastConnectedAt = 0;
  let noKey = false;
  let refused = false;
  let stopped = false;

  const delayOf = (tries: number): number => HUB_LIVE.retryMs[Math.min(tries, HUB_LIVE.retryMs.length - 1)]!;
  const emit = (streams: string[], event: 'app-event' | 'app-gap', text: string, app: string): void => {
    if (streams.length > 0) for (const listener of [...listeners]) listener(streams, event, text, app);
  };

  function note(app: string, why: string): void {
    const last = noted.get(app);
    if (last !== undefined && deps.now() - last < HUB_LIVE.noteMs) return;
    noted.set(app, deps.now());
    deps.log?.(`Live news of ${app}: some left out (${why})`);
  }

  function streamsFor(app: string, event: string | null): string[] {
    const found: string[] = [];
    for (const [stream, refs] of wants) {
      for (const [ref, names] of refs) {
        if (activeRefs.has(ref) && appOf(ref) === app && (event === null || names.has(event))) { found.push(stream); break; }
      }
    }
    return found;
  }

  // ----- news, within the limits of its app -----

  function budgetOf(app: string): Budget {
    let budget = budgets.get(app);
    if (!budget) {
      budget = { start: deps.now(), count: 0, bytes: 0, pending: new Map(), timer: null };
      budgets.set(app, budget);
    }
    if (deps.now() - budget.start >= HUB_LIVE.windowMs) Object.assign(budget, { start: deps.now(), count: 0, bytes: 0 });
    return budget;
  }

  function spend(budget: Budget, size: number): boolean {
    if (budget.count >= HUB_LIVE.messages || budget.bytes + size > HUB_LIVE.bytes) return false;
    budget.count += 1;
    budget.bytes += size;
    return true;
  }

  function flush(app: string): void {
    const budget = budgetOf(app);
    budget.timer = null;
    for (const [event, { text, size }] of [...budget.pending]) {
      if (!spend(budget, size)) break;
      budget.pending.delete(event);
      emit(streamsFor(app, event), 'app-event', text, app);
    }
    if (budget.pending.size > 0) budget.timer = deps.setTimeout(() => flush(app), HUB_LIVE.windowMs);
  }

  function news(app: string, event: string, data: unknown): void {
    if (typeof event !== 'string' || !LIVE_LIMITS.name.test(event) || streamsFor(app, event).length === 0) return;
    let text: string;
    try {
      text = JSON.stringify({ app, event, data });
    } catch {
      note(app, 'not plain data');
      return;
    }
    const size = sizeOf(text);
    if (size > HUB_LIVE.messageBytes) { note(app, 'too big'); return; }
    const budget = budgetOf(app);
    if (budget.pending.size === 0 && spend(budget, size)) { emit(streamsFor(app, event), 'app-event', text, app); return; }
    // the newest of every name waits for its turn, where it was
    if (budget.pending.has(event)) note(app, 'too much at once');
    budget.pending.set(event, { text, size });
    budget.timer ??= deps.setTimeout(() => flush(app), Math.max(0, budget.start + HUB_LIVE.windowMs - deps.now()));
  }

  const gap = (app: string): void => emit(streamsFor(app, null), 'app-gap', JSON.stringify({ app }), app);

  // ----- the session and the subscriptions -----

  function watch(): void {
    if (watchTimer !== null) deps.clearTimeout(watchTimer);
    watchTimer = deps.setTimeout(() => {
      watchTimer = null;
      if (session === null) return;
      if (session.isConnected()) lastConnectedAt = deps.now();
      else if (deps.now() - lastConnectedAt > HUB_LIVE.silentMs) { renew(); return; }
      watch();
    }, HUB_LIVE.watchMs);
  }

  function forget(entry: Entry): void {
    if (entry.retry !== null) deps.clearTimeout(entry.retry);
    entry.retry = null;
    try {
      entry.sub?.unsubscribe();
    } catch {
      // gone already
    }
    entry.sub = null;
  }

  /** The session goes; what listened will listen again, and may have missed news. */
  function dropSession(): void {
    sessionTurn += 1;
    const old = session;
    session = null;
    if (watchTimer !== null) deps.clearTimeout(watchTimer);
    watchTimer = null;
    for (const entry of subs.values()) {
      if (entry.retry !== null) deps.clearTimeout(entry.retry);
      entry.retry = null;
      entry.sub = null;
      if (entry.state === 'on' || entry.state === 'failed') entry.broke = true;
      entry.state = 'new';
    }
    try {
      old?.destroy();
    } catch {
      // gone already
    }
  }

  /** A new session, after a while. */
  function renew(): void {
    if (renewTimer !== null || stopped) return;
    dropSession();
    renewTimer = deps.setTimeout(() => { renewTimer = null; pump(); }, delayOf(sessionTries));
    sessionTries += 1;
  }

  function pump(): void {
    if (stopped || subs.size === 0) return;
    if (session === null) { void openSession(); return; }
    // an app on its way out is not listened to anew
    for (const entry of subs.values()) if (entry.state === 'new' && entry.releaseAt === null) void attempt(entry);
  }

  /** The session, unless it does not come in time: then it is given up, and closed should it come later. */
  function inTime(asked: Promise<LiveSession | null>): Promise<LiveSession | null> {
    return new Promise((done, fail) => {
      let late = false;
      const timer = deps.setTimeout(() => { late = true; fail(new Error('The hub did not answer in time')); }, HUB_LIVE.openMs);
      asked.then((made) => {
        if (late) { made?.destroy(); return; }
        deps.clearTimeout(timer);
        done(made);
      }, (error: unknown) => {
        if (late) return;
        deps.clearTimeout(timer);
        fail(error);
      });
    });
  }

  async function openSession(): Promise<void> {
    if (opening || renewTimer !== null || noKey) return;
    opening = true;
    const turn = sessionTurn;
    let made: LiveSession | null;
    try {
      made = await inTime(deps.open());
    } catch (error) {
      opening = false;
      deps.log?.(`Live news: no connection yet (${withoutSecrets(error)})`);
      if (turn === sessionTurn) renew(); else pump();
      return;
    }
    opening = false;
    if (turn !== sessionTurn || stopped || subs.size === 0) {
      made?.destroy();
      pump();
      return;
    }
    if (made === null) { noKey = true; return; }
    session = made;
    lastConnectedAt = deps.now();
    watch();
    pump();
  }

  async function attempt(entry: Entry): Promise<void> {
    const current = session;
    if (current === null) return;
    const turn = sessionTurn;
    const mine = (): boolean => turn === sessionTurn && subs.get(entry.app) === entry;
    entry.state = 'subscribing';
    try {
      const sub = await current.subscribe(`homey:app:${entry.app}`, {
        onEvent: (event, data) => { if (mine()) news(entry.app, event, data); },
        // the library came back by itself: what came in between is gone
        onReconnect: () => { if (mine()) gap(entry.app); },
        onReconnectError: () => { if (turn === sessionTurn) renew(); },
      });
      if (!mine()) { sub.unsubscribe(); return; }
      Object.assign(entry, { sub, state: 'on', tries: 0 });
      refused = false;
      sessionTries = 0;
      lastConnectedAt = deps.now();
      if (entry.broke) {
        entry.broke = false;
        gap(entry.app);
      }
    } catch (error) {
      if (!mine()) return;
      entry.state = 'failed';
      entry.broke = true;
      if (isRefusal(error)) refused = true;
      deps.log?.(`Live news of ${entry.app}: not now (${withoutSecrets(error)})`);
      if (!current.isConnected()) { renew(); return; }
      entry.retry = deps.setTimeout(() => {
        entry.retry = null;
        if (subs.get(entry.app) === entry && entry.state === 'failed') { entry.state = 'new'; pump(); }
      }, delayOf(entry.tries));
      entry.tries += 1;
    }
  }

  // ----- what pages want, and what that means -----

  /** A sync, at the latest this long from now: a change that keeps coming never holds it up. */
  function schedule(ms: number = HUB_LIVE.syncMs): void {
    if (stopped) return;
    const due = deps.now() + ms;
    if (syncTimer !== null && syncDue <= due) return;
    if (syncTimer !== null) deps.clearTimeout(syncTimer);
    syncDue = due;
    syncTimer = deps.setTimeout(() => { syncTimer = null; void sync(); }, ms);
  }

  /** The apps to listen to; one no longer wanted is let go after a while, or at once. */
  function setApps(apps: Set<string>, atOnce = false): void {
    target = apps;
    const now = deps.now();
    let soonest: number | null = null;
    for (const [app, entry] of subs) {
      if (apps.has(app)) { entry.releaseAt = null; continue; }
      entry.releaseAt ??= now + HUB_LIVE.releaseMs;
      if (atOnce || entry.releaseAt <= now) {
        forget(entry);
        subs.delete(app);
      } else {
        soonest = Math.min(soonest ?? entry.releaseAt, entry.releaseAt);
      }
    }
    if (soonest !== null) schedule(soonest - now);
    if (subs.size === 0 && apps.size === 0) {
      if (renewTimer !== null) deps.clearTimeout(renewTimer);
      renewTimer = null;
      sessionTries = 0;
      dropSession();
      return;
    }
    for (const app of apps) if (!subs.has(app)) subs.set(app, { app, state: 'new', sub: null, tries: 0, retry: null, broke: false, releaseAt: null });
    pump();
  }

  async function sync(): Promise<void> {
    const turn = ++syncTurn;
    const placed = deps.placed();
    const candidates = new Set<string>();
    for (const refs of wants.values()) for (const ref of refs.keys()) if (placed.has(ref)) candidates.add(ref);
    if (candidates.size === 0) { activeRefs = new Set(); setApps(new Set()); return; }
    if (!deps.hasKey()) {
      noKey = true;
      activeRefs = new Set();
      setApps(new Set(), true);
      return;
    }
    const read = await deps.listed().catch(() => null);
    if (turn !== syncTurn || stopped) return;
    refused = read === 'refused' || (refused && read === null);
    if (read !== null && read !== 'refused') {
      knownListed = read;
      listTries = 0;
    }
    if (knownListed === null) {
      target = null;
      schedule(delayOf(listTries));
      listTries += 1;
      return;
    }
    const listed = knownListed;
    activeRefs = new Set([...candidates].filter((ref) => listed.has(ref)));
    setApps(new Set([...activeRefs].map(appOf)));
  }

  return {
    /** What one stream listens to now; it replaces what it said before. */
    want(stream: string, list: Want[]): void {
      const refs = new Map<string, Set<string>>();
      for (const { ref, events } of list) if (events.length > 0) refs.set(ref, new Set([...(refs.get(ref) ?? []), ...events]));
      if (refs.size > 0) wants.set(stream, refs);
      else wants.delete(stream);
      schedule();
    },
    /** A stream that went. */
    drop(stream: string): void {
      if (wants.delete(stream)) schedule();
    },
    /** The dashboards of the house changed. */
    placedChanged(): void {
      if (wants.size > 0) schedule();
    },
    /** Another key, or the app's own connection with the hub began anew: everything begins anew now. */
    restart(): void {
      if (renewTimer !== null) deps.clearTimeout(renewTimer);
      renewTimer = null;
      sessionTries = 0;
      noKey = false;
      refused = false;
      dropSession();
      for (const entry of subs.values()) entry.tries = 0;
      if (syncTimer !== null) deps.clearTimeout(syncTimer);
      syncTimer = null;
      void sync();
    },
    /** Hears the news to pass on: to which streams, as what, as text, and of which app. */
    subscribe(listener: (streams: string[], event: 'app-event' | 'app-gap', text: string, app: string) => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    state(): LiveState {
      if (noKey) return { state: 'none', apps: 0 };
      if (wants.size === 0 || target?.size === 0) return { state: 'idle', apps: 0 };
      const on = [...subs.values()].filter((entry) => entry.state === 'on' && entry.releaseAt === null).length;
      if (on > 0) return { state: 'on', apps: on };
      return { state: refused ? 'refused' : 'waiting', apps: 0 };
    },
    stop(): void {
      stopped = true;
      for (const handle of [syncTimer, renewTimer]) if (handle !== null) deps.clearTimeout(handle);
      for (const budget of budgets.values()) if (budget.timer !== null) deps.clearTimeout(budget.timer);
      for (const entry of subs.values()) forget(entry);
      subs.clear();
      dropSession();
      listeners.clear();
    },
  };
}

export type HubLive = ReturnType<typeof createHubLive>;
