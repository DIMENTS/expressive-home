// A page with a key that is paired with the app on its hub, through the door of that app: the dashboards, the looks and the
// own widgets of the house come from the hub, at home and away; the key, the devices and controlling stay as they are.
import { cloudUrl, isHomeyId } from '../../homey/routes';
import { createDoorLink, type DoorLink, type Mismatch } from '../../served/door-link';
import { createLooksSync } from '../../served/looks-sync';
import { createServedStore } from '../../served/store';
import type { LooksDoc } from '../../theme/looks-doc';
import type { LookOp } from '../../theme/look-ops';
import { createServedWidgets, type WidgetLibrary } from '../../widgets/library-source';
import type { ConfigStore } from '../../storage/config';

/** Where this browser keeps its pairing with the app on a hub: one, with the hub it is for. */
export const AWAY_KEY = 'dashboard.away';
const TOKEN = /^[\w-]{20,100}$/;
const CODE = /^\d{8}$/;
const PATH = '/api/app/app.expressive.home/sync';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type AwayPairResult = 'ok' | 'code' | 'locked' | 'full' | 'busy' | 'unreachable';

/** The pairing of this browser with the app on this hub; null for any other hub, or none. */
export function awayPairing(storage: Storage, homeyId: string | null): string | null {
  if (homeyId === null) return null;
  try {
    const kept: unknown = JSON.parse(storage.getItem(AWAY_KEY) ?? 'null');
    if (typeof kept !== 'object' || kept === null) return null;
    const { homeyId: id, token } = kept as Record<string, unknown>;
    return id === homeyId && typeof token === 'string' && TOKEN.test(token) ? token : null;
  } catch {
    return null;
  }
}

/** Keeps the pairing with the app on this hub, or (null) forgets it. */
export function keepAwayPairing(storage: Storage, homeyId: string, token: string | null): void {
  try {
    if (token === null) storage.removeItem(AWAY_KEY);
    else storage.setItem(AWAY_KEY, JSON.stringify({ homeyId, token }));
  } catch {
    // a browser that keeps nothing: the page pairs again next time
  }
}

/** Pairs this browser with the app on its hub, with a code for away made in the settings of the app; through the cloud. */
export async function pairAway(storage: Storage, fetch: (url: string, init?: RequestInit) => Promise<Response>, homeyId: string, code: string, name: string): Promise<AwayPairResult> {
  if (!CODE.test(code) || !isHomeyId(homeyId)) return 'code';
  try {
    const response = await fetch(`${cloudUrl(homeyId)}${PATH}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ call: 'pair', code, name }), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    });
    const answer: unknown = await response.json().catch(() => null);
    if (typeof answer !== 'object' || answer === null) return 'unreachable';
    const { token, error } = answer as Record<string, unknown>;
    if (typeof token === 'string' && TOKEN.test(token)) {
      keepAwayPairing(storage, homeyId, token);
      return 'ok';
    }
    return error === 'code' || error === 'locked' || error === 'full' || error === 'busy' ? error : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

/** What the app needs of a page with a key that is paired with its hub. */
export interface Synced {
  configStore: ConfigStore;
  mayArrange(): boolean;
  knownRole(): 'edit' | 'use' | null;
  widgets: WidgetLibrary;
  sendLooks(ops: LookOp[]): void;
  onLooks(listener: (doc: LooksDoc) => void): void;
  onLooksRefused(listener: () => void): void;
  onLooksTooBig(listener: () => void): void;
  onConflict(listener: () => void): void;
  onUnsaved(listener: () => void): void;
  /** The pairing was taken away on the hub: the copy here is its own from now on. */
  onUnpaired(listener: (by: 'hub' | 'here') => void): void;
  /** The hub will never take a change as it is: too big, another shape of the documents, or not one it can read. */
  onRefused(listener: (why: 'too-big' | 'format' | 'bad') => void): void;
  /** Whether the app on the hub keeps the documents in another shape, and which side is older; null when they agree. */
  mismatch(): Mismatch | null;
  /** Whether the hub answered the last look. */
  up(): boolean;
  /** Takes this device off the hub and forgets the pairing here. */
  unpair(): Promise<void>;
  /** The page may be closed, or closes: what waits to be saved on the hub goes now. */
  flush(closing?: boolean): void;
  link: DoorLink;
}

/** The parts of a page with a key that come from the app on its hub, through its door. */
export function createSynced(storage: Storage, homeyId: string, deps: {
  fetch(url: string, init?: RequestInit): Promise<Response>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}): Synced {
  const link = createDoorLink({
    fetch: deps.fetch,
    // always through the cloud: at home that answers in a fifth of a second too, and the page needs no permission for the local network
    base: () => (isHomeyId(homeyId) ? cloudUrl(homeyId) : null),
    token: () => awayPairing(storage, homeyId),
    keepToken: (token) => keepAwayPairing(storage, homeyId, token),
    setTimeout: deps.setTimeout, clearTimeout: deps.clearTimeout, now: deps.now,
  });
  const served = createServedStore(storage, link, { key: { paired: () => awayPairing(storage, homeyId) !== null, forgetPairing: () => keepAwayPairing(storage, homeyId, null) } });
  let lastLooks: LooksDoc | null = null;
  let onLooks: (doc: LooksDoc) => void = () => {};
  let onRefused: () => void = () => {};
  let onTooBig: () => void = () => {};
  const looks = createLooksSync({
    link: link as unknown as Parameters<typeof createLooksSync>[0]['link'],
    adopt: (doc) => { lastLooks = doc; onLooks(doc); },
    refused: () => onRefused(),
    tooBig: () => onTooBig(),
    setTimeout: deps.setTimeout, clearTimeout: deps.clearTimeout,
  });
  link.hold();
  // a page that opens out of sight does not look until it is seen
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') link.sleep();
  return {
    configStore: served.store,
    mayArrange: () => served.mayArrange(),
    knownRole: () => served.knownRole(),
    widgets: createServedWidgets(link),
    sendLooks: (ops) => looks.send(ops),
    onLooks: (listener) => { onLooks = listener; if (lastLooks) listener(lastLooks); },
    onLooksRefused: (listener) => { onRefused = listener; },
    onLooksTooBig: (listener) => { onTooBig = listener; },
    onConflict: (listener) => served.onConflict(listener),
    onUnsaved: (listener) => served.onUnsaved(listener),
    onUnpaired: (listener) => served.onUnpaired(listener),
    onRefused: (listener) => served.onRefused(listener),
    mismatch: () => link.mismatch(),
    up: () => link.up(),
    flush: (closing = false) => served.flush(closing),
    async unpair() {
      // a hub that cannot be reached now keeps the device in its list; the owner can take it away there
      await link.request('POST', 'api/unpair', {}).catch(() => {});
      keepAwayPairing(storage, homeyId, null);
    },
    link,
  };
}
