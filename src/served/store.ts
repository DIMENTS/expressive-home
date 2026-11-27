import { KNOWN_KINDS } from '../layout/keep-widgets';
import { createDefaultConfig, type AppConfig, type ConfigStore, type OwnConfig as Own } from '../storage/config';
import { hubChoices } from '../storage/layout-normalize';
import { createLocalConfigStore } from '../storage/local-store';
import { RequestError, type Link, type Role } from './link';

export type { Role };
export type PairResult = 'ok' | 'code' | 'locked' | 'full' | 'unreachable';

/** What belongs to this device, and stays in its browser. */
const ownOf = ({ theme, language, startBoard, wall }: Own): Own => ({ theme, language, startBoard, wall });
/** What all devices share. */
type Content = Pick<AppConfig, 'layouts' | 'sectionSeeds'>;
/** The content with its number on the hub; -1: not read yet. */
interface Shared extends Content { revision: number }

/** Stands in the place of a key: there is none on this device. */
const PAIRED = 'paired';
/** The hub this browser was paired with, so a hub that does not answer is told apart from a device that is not paired. */
export const PAIRED_KEY = 'dashboard.paired';
/** Saved at once, but at most this often: the letters of a name go together. */
export const SAVE_EVERY_MS = 400;
/** A page with a key saves through the door of the app, often through the cloud: not more often than this. */
export const KEY_SAVE_EVERY_MS = 2000;
/** A page with a key: the revision of the hub that the copy here is of, and whether something of it is not on the hub yet. */
export const AWAY_STATE_KEY = 'dashboard.away.state';
/** Why the hub will never take a change as it is: too big to keep, another shape of the documents, or not a change it can read. */
export type Refusal = 'too-big' | 'format' | 'bad';
/** Who ended the pairing of a page with a key: the owner on the hub, or this page itself. */
export type Unpaired = 'hub' | 'here';
/** Saving or reading did not work: how long until it is tried again, when the live stream does not come back earlier. */
export const SAVE_RETRY_MS = 5000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nothing = (): Shared => ({ revision: -1, layouts: {}, sectionSeeds: {} });
const contentOf = ({ layouts, sectionSeeds }: Content): Content => structuredClone({ layouts, sectionSeeds });
const same = (a: Content, b: Content): boolean => JSON.stringify([a.layouts, a.sectionSeeds]) === JSON.stringify([b.layouts, b.sectionSeeds]);
/** What the owner arranged, without the names and devices that the app keeps of the hub. */
const arranged = ({ layouts, sectionSeeds }: Content): string =>
  JSON.stringify([Object.entries(layouts).map(([id, layout]) => [id, layout.dashboards]).sort(), Object.entries(sectionSeeds).sort()]);

/** What is chosen for the whole hub goes together with what others arrange: what was chosen here goes on top of theirs. */
function withChoices(theirs: Content, mine: Content, before: Content): Content {
  const layouts = Object.fromEntries(Object.entries(theirs.layouts).map(([id, layout]) => {
    const here = mine.layouts[id];
    if (!here) return [id, layout];
    const was = before.layouts[id];
    const { grouping, rooms, ...rest } = layout;
    const next = { ...rest, ...hubChoices({ grouping: here.grouping === was?.grouping ? grouping : here.grouping, rooms: here.rooms === was?.rooms ? rooms : here.rooms }) };
    return [id, next.grouping === grouping && next.rooms === rooms ? layout : next];
  }));
  return { layouts, sectionSeeds: theirs.sectionSeeds };
}

/**
 * The hub's layouts with the devices that were skipped or placed here put to what is known there, and what is not
 * known here any more taken out; everything else is as the hub has it.
 */
function withKnown(theirs: Content, mine: Content, before: Content): Content {
  const layouts = Object.fromEntries(Object.entries(theirs.layouts).map(([id, layout]) => {
    const [here, was] = [new Set(mine.layouts[id]?.known), new Set(before.layouts[id]?.known)];
    if (!mine.layouts[id]) return [id, layout];
    const known = [...new Set([...layout.known.filter((ref) => here.has(ref) || !was.has(ref)), ...[...here].filter((ref) => !was.has(ref))])];
    return [id, known.length === layout.known.length && known.every((ref) => layout.known.includes(ref)) ? layout : { ...layout, known }];
  }));
  return { layouts, sectionSeeds: theirs.sectionSeeds };
}

/**
 * The settings of a page that the app on the hub served: theme, language, the dashboard to start with and what
 * is set up for a wall tablet in this browser, the layouts and the colours per section on the hub. What another device saves comes in as a change from another tab does.
 *
 * A change here counts at once and is sent to the hub in the background, one sending at a time, again and again until
 * the hub has it. As long as something is on its way nothing of the hub is taken over: the hub itself refuses what was
 * not based on its newest version, and only then is looked at whose work it is.
 */
export interface ServedStoreOptions {
  /**
   * A page with a key, paired with the app on its hub: the connection is the key, kept in this browser with the settings of
   * this device; the hub keeps the shared dashboards, and a copy of them stays here for when the hub cannot be reached.
   * `paired` says whether this page has a pairing with the app here; `forgetPairing` forgets it.
   */
  key?: { paired(): boolean; forgetPairing(): void };
}

/** The part of a link the store uses: the one of a page the hub served, or the door of the app for a page with a key. */
type StoreLink = Pick<Link, 'request' | 'on' | 'later' | 'now'>;

export function createServedStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, link: StoreLink, options: ServedStoreOptions = {}) {
  const local = createLocalConfigStore(storage);
  const keyed = options.key !== undefined;
  const saveEvery = keyed ? KEY_SAVE_EVERY_MS : SAVE_EVERY_MS;
  /** A page with a key: the app on the hub knows this device. */
  let linked = false;
  /** The last version of the hub that what is shown here was made from. */
  let base = nothing();
  /** What is shown here. */
  let mine: Content = contentOf(base);
  /** Something of `mine` is not on the hub yet. */
  let dirty = false;
  /** The newest revision that was heard of. */
  let heard = -1;
  /** What was heard while something was being asked: the newest revision, and whether the stream opened anew. */
  let news = -1;
  let anew = false;
  /** What was sent without an answer: the hub can have it. */
  let unsure: string[] = [];
  /** The one that is sending and reading now. */
  let worker: object | null = null;
  let sentAt = Number.NEGATIVE_INFINITY;
  /** What is on its way to the hub. */
  let sending: Content | null = null;
  let soon: (() => void) | null = null;
  /** That something is not on the hub yet was said. */
  let told = false;
  /** What the browser refused to keep of this device: it lasts as long as the page. */
  let refused: Own | null = null;
  let role: Role = 'use';
  /** The hub said what this device may, since the page opened. */
  let roleKnown = false;
  let connection: AppConfig['connection'] | null = null;
  /** Every time this device is paired or taken away it begins anew; an older answer is ignored. */
  let epoch = 0;
  /** The hub said, when this device paired on this page, that it is the first start of the hub. */
  let fresh = false;
  /** The epoch of the settings that the app was given last: only what was made from those says something about the hub. */
  let given = -1;
  let loading: Promise<void> | null = null;
  let changed: () => void = () => {};
  let conflict: () => void = () => {};
  let unsaved: () => void = () => {};
  let gone: (by: Unpaired) => void = () => {};
  /** That the pairing ended was told: once, the page starts anew. */
  let ended = false;
  const end = (by: Unpaired): void => {
    if (ended) return;
    ended = true;
    gone(by);
  };
  let refusedWhy: (why: Refusal) => void = () => {};

  const paired = (): boolean => (keyed ? linked : connection !== null && connection.apiKey !== null);
  const read = (raw: unknown): Shared | null => (isRecord(raw) && typeof raw['revision'] === 'number' && isRecord(raw['layouts']) && isRecord(raw['sectionSeeds']) ? raw as unknown as Shared : null);

  const remembered = (): string | null => {
    try { return storage.getItem(PAIRED_KEY); } catch { return null; }
  };
  const remember = (homeyId: string | null): void => {
    try {
      if (homeyId === null) storage.removeItem(PAIRED_KEY);
      else storage.setItem(PAIRED_KEY, homeyId);
    } catch {
      // a browser that keeps nothing: the cookie alone decides
    }
  };

  function forget(): void {
    epoch += 1;
    base = nothing();
    mine = contentOf(base);
    dirty = false;
    heard = -1;
    told = false;
    unsure = [];
    worker = null;
    stopWaiting();
  }

  /** A page with a key: the connection is the one kept here; the app says whether it knows this device, and what it may. */
  async function readKeySession(): Promise<AppConfig['connection']> {
    const session = await link.request('GET', 'api/session').catch(() => null);
    if (isRecord(session) && session['paired'] === false) {
      // taken away while this page was closed: the copy here is its own from now on
      const had = options.key?.paired() ?? false;
      linked = false;
      options.key?.forgetPairing();
      if (had) end('hub');
    } else {
      // no answer: the copy here is shown, and the hub is asked again
      linked = true;
      const device = isRecord(session) && isRecord(session['device']) ? session['device'] : null;
      if (device) {
        role = device['role'] === 'edit' ? 'edit' : 'use';
        roleKnown = true;
      }
    }
    return (await local.load()).connection;
  }

  /** A page with a key: what the hub has is kept here too, for when it cannot be reached; a hub without any never empties it. */
  function mirror(): void {
    if (!keyed || base.revision < 0) return;
    keepState();
    const content = contentOf(mine);
    if (Object.keys(content.layouts).length === 0) return;
    void local.load().then((kept) => local.save({ ...kept, layouts: { ...kept.layouts, ...content.layouts }, sectionSeeds: content.sectionSeeds })).catch(() => {});
  }

  /** A page with a key: the revision the copy here is of, and whether something of it waits for the hub. */
  function keepState(): void {
    if (!keyed) return;
    try { storage.setItem(AWAY_STATE_KEY, JSON.stringify({ revision: base.revision, dirty })); } catch { /* best effort */ }
  }
  function keptState(): { revision: number; dirty: boolean } | null {
    try {
      const raw: unknown = JSON.parse(storage.getItem(AWAY_STATE_KEY) ?? 'null');
      return isRecord(raw) && typeof raw['revision'] === 'number' && typeof raw['dirty'] === 'boolean' ? { revision: raw['revision'], dirty: raw['dirty'] } : null;
    } catch {
      return null;
    }
  }

  async function readSession(): Promise<AppConfig['connection']> {
    if (keyed) return readKeySession();
    const none = { homeyId: null, localAddress: null, apiKey: null };
    const session = await link.request('GET', 'api/session').catch(() => null);
    if (!isRecord(session) || typeof session['paired'] !== 'boolean') {
      // no answer, or half of one
      const homeyId = remembered();
      return homeyId === null ? none : { homeyId: homeyId || null, localAddress: null, apiKey: PAIRED };
    }
    const device = isRecord(session['device']) ? session['device'] : null;
    if (session['paired'] !== true || !device) {
      remember(null);
      return none;
    }
    role = device['role'] === 'edit' ? 'edit' : 'use';
    roleKnown = true;
    const homeyId = typeof session['homeyId'] === 'string' ? session['homeyId'] : null;
    remember(homeyId ?? '');
    return { homeyId, localAddress: null, apiKey: PAIRED };
  }

  /** The hub's version replaces what is shown here. */
  function takeOver(doc: Shared, tell = true): void {
    base = doc;
    dirty = false;
    told = false;
    unsure = [];
    mine = contentOf(doc);
    mirror();
    if (tell) changed();
  }

  // ----- what goes to the hub and comes from it, one thing at a time -----

  async function ask(method: 'GET' | 'PUT', body?: unknown): Promise<unknown> {
    news = -1;
    anew = false;
    return link.request(method, 'api/layouts', body);
  }

  /** The hub answered with this revision; what was heard meanwhile can be newer, or of an app that began anew. */
  function hear(revision: number): void {
    if (!anew) heard = Math.max(news, revision);
  }

  function stopWaiting(): void {
    soon?.();
    soon = null;
  }

  function wait(ms: number): void {
    stopWaiting();
    soon = link.later(() => { soon = null; void work(); }, ms);
  }

  /** Saves what is not on the hub yet, then reads what is newer there, until there is nothing left to do. */
  async function work(): Promise<void> {
    if (worker) return;
    const own = {};
    worker = own;
    try {
      while (worker === own && paired()) {
        if (dirty && base.revision >= 0 && role === 'edit') {
          const left = sentAt + saveEvery - link.now();
          // more than that: the clock of this device was set back
          if (left > 0 && left <= saveEvery) { wait(left); return; }
          if (!(await put())) return;
        } else if (base.revision !== heard || base.revision < 0) {
          if (!(await get())) return;
        } else {
          return;
        }
      }
    } finally {
      if (worker === own) worker = null;
    }
  }

  /** Whether to go on; on a failure it is tried again later. */
  async function put(): Promise<boolean> {
    stopWaiting();
    const mark = epoch;
    const sent = mine;
    sending = sent;
    sentAt = link.now();
    try {
      const doc = read(await ask('PUT', { base: base.revision, ...sent, knows: KNOWN_KINDS }));
      if (mark !== epoch) return true;
      if (!doc) throw new Error('no document');
      if (role !== 'edit') {
        // the right went while it was on its way: what the hub has is what there is
        takeOver(doc);
        hear(doc.revision);
        return true;
      }
      base = doc;
      hear(doc.revision);
      unsure = [];
      // what is shown stays as it is here, also where the hub keeps it a little differently
      dirty = mine !== sent;
      told = false;
      keepState();
      return true;
    } catch (error) {
      if (mark !== epoch) return true;
      const status = error instanceof RequestError ? error.status : null;
      const doc = status === 409 && error instanceof RequestError ? read(error.body) : null;
      if (doc) { settle(doc); return true; }
      if (status === 401) return false;
      if (status === 403 && error instanceof RequestError && isRecord(error.body) && error.body['error'] === 'use-only') {
        mayOnlyUse();
        return true;
      }
      // a page with a key: what the hub will never take is said for what it is, not promised for later
      const why: Refusal | null = keyed ? (status === 413 ? 'too-big' : status === 412 ? 'format' : status === 400 ? 'bad' : null) : null;
      if (why !== null) {
        if (!told) {
          told = true;
          refusedWhy(why);
        }
        return false;
      }
      if (!told) {
        told = true;
        unsaved();
      }
      // a refusal will be one again; anything else is an app or a network that is away
      if (status === null || status >= 500) {
        unsure = [...new Set([...unsure, arranged(sent)])];
        wait(SAVE_RETRY_MS);
      }
      return false;
    } finally {
      if (sending === sent) sending = null;
    }
  }

  /** What this device may do from now on. */
  function become(now: Role): void {
    const first = !roleKnown;
    roleKnown = true;
    if (now === role) { if (first) changed(); return; }
    if (now === 'use') { mayOnlyUse(); return; }
    role = now;
    changed();
  }

  /** The right to arrange is gone, and what was not saved yet with it. */
  function mayOnlyUse(): void {
    role = 'use';
    if (dirty) takeOver(base);
    else changed();
  }

  /** Another device saved first. */
  function settle(theirs: Shared): void {
    const [me, them, before] = [arranged(mine), arranged(theirs), arranged(base)];
    if (me !== them && (them === before || unsure.includes(them))) {
      // only what the app keeps of the hub is different there, or it is what this device sent itself: the owner's change goes on top of it
      const merged = withChoices(mine, theirs, base);
      base = theirs;
      unsure = [];
      hear(theirs.revision);
      // what another device chose for the whole hub goes with it
      if (!same(merged, mine)) {
        mine = contentOf(merged);
        changed();
      }
      return;
    }
    const lost = me !== them && me !== before;
    const merged = withChoices(lost ? theirs : withKnown(theirs, mine, base), mine, base);
    takeOver(theirs, false);
    hear(theirs.revision);
    if (!same(merged, theirs)) {
      mine = contentOf(merged);
      dirty = true;
    }
    changed();
    // two devices that worked out the same, or only what the app keeps of the hub here: nobody's work was lost
    if (lost) conflict();
  }

  async function get(tell = true): Promise<boolean> {
    stopWaiting();
    const mark = epoch;
    try {
      const doc = read(await ask('GET'));
      if (mark !== epoch) return true;
      if (!doc) throw new Error('no document');
      // changed here meanwhile: saving that tells what to do
      if (dirty && base.revision >= 0 && role === 'edit') return true;
      if (doc.revision !== base.revision) takeOver(doc, tell);
      hear(doc.revision);
      return true;
    } catch (error) {
      if (mark === epoch && !(error instanceof RequestError && error.status === 401)) wait(SAVE_RETRY_MS);
      return false;
    }
  }

  // a newer version on the hub, saved by another device or while this one was away; an app that began anew counts lower
  link.on('layouts', ({ revision }) => {
    heard = Math.max(heard, revision);
    news = Math.max(news, revision);
    void work();
  });
  link.on('open', ({ revision, role: now }) => {
    if (!paired()) return;
    heard = revision;
    anew = true;
    if (now !== null) become(now);
    stopWaiting();
    void work();
  });
  link.on('role', (now) => { if (paired()) become(now); });
  // a page with a key taken away on the hub: the copy here stays, as its own
  link.on('unpaired', () => {
    if (!keyed || !linked) return;
    linked = false;
    options.key?.forgetPairing();
    forget();
    end('hub');
  });

  /** Who this device is and what the hub has, once for everyone who asks at the same time. */
  async function begin(): Promise<void> {
    forget();
    const mark = epoch;
    const found = await readSession();
    if (mark !== epoch) return;
    connection = found;
    if (!paired()) return;
    // a page with a key: what was here before the hub's comes in, and whether some of it never reached the hub
    const here = keyed ? contentOf(await local.load()) : null;
    const before = keyed ? keptState() : null;
    const own = {};
    worker = own;
    await get(false);
    if (worker !== own) return;
    worker = null;
    if (here && base.revision >= 0) carryOver(here, before);
    // a newer one was heard of while it was being read, or something here waits for the hub
    if (base.revision >= 0 && (base.revision !== heard || dirty)) void work();
  }

  /**
   * A page with a key that opened: a change that did not reach the hub before the page closed goes there now, unless another
   * device saved in between (then that is said); and a hub without any dashboards gets those of a device that may arrange.
   */
  function carryOver(here: Content, before: { revision: number; dirty: boolean } | null): void {
    const differs = arranged(here) !== arranged(mine);
    if (before?.dirty && before.revision >= 0 && differs) {
      if (role === 'edit' && before.revision === base.revision) {
        mine = contentOf(here);
        dirty = true;
      } else {
        conflict();
      }
    } else if (role === 'edit' && Object.keys(base.layouts).length === 0 && Object.keys(here.layouts).length > 0) {
      mine = contentOf(here);
      dirty = true;
    }
    keepState();
  }

  const store: ConfigStore = {
    peek: () => ownOf(refused ?? local.peek()),
    async load() {
      while (!connection) {
        const own = loading ?? begin();
        loading = own;
        await own;
        if (loading === own) loading = null;
        // paired while that was being read: it is read anew
      }
      given = epoch;
      if (keyed) {
        // the hub's dashboards once they were read; until then the copy here
        const kept = await local.load();
        return base.revision >= 0 && linked ? { ...kept, ...contentOf(mine) } : kept;
      }
      const own = ownOf(refused ?? await local.load());
      return { ...createDefaultConfig(), ...own, connection: { ...connection ?? createDefaultConfig().connection }, ...contentOf(mine) };
    },
    async save(config) {
      if (keyed) {
        if (given === epoch && config.connection.apiKey === null && linked) {
          // the key is gone: the pairing with the app goes with it, and the page starts anew without it
          linked = false;
          await link.request('POST', 'api/unpair', {}).catch(() => {});
          options.key?.forgetPairing();
          forget();
          end('here');
        } else if (given === epoch && paired() && role === 'edit' && base.revision >= 0 && !same(config, mine)) {
          mine = contentOf(config);
          dirty = true;
          keepState();
          void work();
        }
        // everything stays here: the key, the settings of this device, and a copy of the hub's dashboards
        await local.save(paired() && base.revision >= 0 ? { ...config, ...contentOf(mine) } : config);
        return;
      }
      if (given === epoch) {
        if (config.connection.apiKey === null && paired()) {
          // the owner took this device away: only that it was paired is forgotten too
          connection = { ...config.connection };
          forget();
          remember(null);
        } else if (paired() && role === 'edit' && base.revision >= 0 && !same(config, mine)) {
          mine = contentOf(config);
          dirty = true;
          void work();
        }
      }
      // what is of this device only: nothing of the hub stays in the browser
      const own = ownOf(config);
      const isOwn = (other: Own | null): boolean => other !== null && JSON.stringify(own) === JSON.stringify(ownOf(other));
      if (isOwn(refused)) return;
      if (!isOwn(await local.load())) {
        try {
          await local.save({ ...createDefaultConfig(), ...own });
        } catch (error) {
          refused = own;
          throw error;
        }
      }
      refused = null;
    },
    async clearConnection() {
      if (keyed) {
        if (linked) await link.request('POST', 'api/unpair', {}).catch(() => {});
        linked = false;
        options.key?.forgetPairing();
        forget();
        connection = null;
        loading = null;
        const cleared = await local.clearConnection();
        end('here');
        return cleared;
      }
      try {
        await link.request('POST', 'api/unpair', {});
      } catch (error) {
        // already taken away, then there is nothing to do
        if (!(error instanceof RequestError) || error.status !== 401) throw error;
      }
      remember(null);
      connection = null;
      return store.load();
    },
  };

  return {
    store,
    /** Whether this device may arrange the dashboards now: it has the right, and has read what there is. */
    mayArrange: (): boolean => role === 'edit' && base.revision >= 0,
    /** What the hub says this device may; null until it said so. */
    knownRole: (): Role | null => (roleKnown ? role : null),
    /** This device paired on this page as the first of a hub that nobody arranged yet: the first start of that hub. */
    fresh: (): boolean => fresh,
    /** Everything that was arranged here is on the hub. */
    settled: (): boolean => !dirty,
    onChanged(listener: () => void): () => void {
      changed = listener;
      return () => { changed = () => {}; };
    },
    /** What this device saved last was refused, because another device saved something else first. */
    onConflict(listener: () => void): void { conflict = listener; },
    /** A change could not be saved on the hub now; it is tried again by itself. */
    onUnsaved(listener: () => void): void { unsaved = listener; },
    /** A page with a key is no longer paired: taken away on the hub, or here; the copy here is its own from now on. */
    onUnpaired(listener: (by: Unpaired) => void): void { gone = listener; },
    /** A page with a key: the hub will never take a change as it is. */
    onRefused(listener: (why: Refusal) => void): void { refusedWhy = listener; },
    /** The page may be closed, or closes: what is waiting is sent now. */
    flush(closing = false): void {
      if (!dirty || told) return;
      stopWaiting();
      sentAt = Number.NEGATIVE_INFINITY;
      if (worker && sending && closing && mine !== sending) {
        // there is no time to wait for the answer: on the revision that the one on its way makes
        link.request('PUT', 'api/layouts', { base: base.revision + 1, ...mine, knows: KNOWN_KINDS }).catch(() => {});
      }
      void work();
    },
    async pair(code: string, name: string): Promise<PairResult> {
      let answer: unknown;
      try {
        answer = await link.request('POST', 'api/pair', { code, name });
      } catch (error) {
        const reason = error instanceof RequestError && isRecord(error.body) ? error.body['error'] : null;
        return reason === 'code' || reason === 'locked' || reason === 'full' ? reason : 'unreachable';
      }
      epoch += 1;
      loading = null;
      connection = null;
      fresh = isRecord(answer) && answer['first'] === true;
      return 'ok';
    },
  };
}

export type ServedStore = ReturnType<typeof createServedStore>;
