import { applyLookOps, type LookOp } from '../theme/look-ops';
import { normalizeLooksDoc, type LooksDoc } from '../theme/looks-doc';
import { RequestError, type LinkEvents } from './link';

/** A change that did not reach the hub is tried again after this long, and when the stream is back. */
export const LOOKS_RETRY_MS = 5000;
/** What the hub takes at once. */
const BATCH = 20;

interface LinkLike {
  on<K extends keyof LinkEvents>(type: K, listener: (value: LinkEvents[K]) => void): () => void;
  request(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<unknown>;
}

export interface LooksSyncDeps {
  link: LinkLike;
  /** What the hub has, with the changes that still wait on top; a rescue comes with it. */
  adopt(doc: LooksDoc): void;
  /** A change was refused: this device may only use the dashboard. */
  refused(): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * The looks of the house on a served device: read when the hub has news, changes sent in order. A change is shown at once
 * and waits while the hub cannot be reached; whatever the hub sends meanwhile is shown with the waiting changes on top.
 */
export function createLooksSync(deps: LooksSyncDeps) {
  let known = -1;
  /** The number of rescues of what was shown last. */
  let rescues = -1;
  /** Goes up when the app on the hub began anew: what was asked of the one before says nothing any more. */
  let era = 0;
  let queue: LookOp[] = [];
  let sending = false;
  let reading = false;
  /** News came while the looks were being read: they are read once more after that. */
  let again = false;
  let retry: unknown = null;

  const show = (doc: LooksDoc): void => {
    // overtaken by a newer answer; a rescue that was not seen yet always counts
    if (doc.revision < known && doc.rescue <= rescues) return;
    known = doc.revision;
    rescues = doc.rescue;
    deps.adopt(queue.length > 0 ? applyLookOps(doc, queue) : doc);
  };

  async function read(): Promise<void> {
    if (reading) {
      again = true;
      return;
    }
    reading = true;
    try {
      do {
        again = false;
        const asked = era;
        try {
          const doc = normalizeLooksDoc(await deps.link.request('GET', 'api/looks'));
          if (asked === era) show(doc);
        } catch {
          // the next news, or the stream coming back, reads again
        }
      } while (again);
    } finally {
      reading = false;
    }
  }

  function later(): void {
    if (retry !== null) return;
    retry = deps.setTimeout(() => { retry = null; void flush(); }, LOOKS_RETRY_MS);
  }

  async function flush(): Promise<void> {
    if (sending || queue.length === 0) return;
    sending = true;
    const batch = queue.slice(0, BATCH);
    const asked = era;
    try {
      const doc = normalizeLooksDoc(await deps.link.request('POST', 'api/looks', { ops: batch }));
      queue = queue.slice(batch.length);
      if (asked === era) show(doc);
    } catch (error) {
      if (error instanceof RequestError && (error.status === 403 || error.status === 400)) {
        // refused: what waits is dropped and what the hub has is shown
        queue = error.status === 403 ? [] : queue.slice(batch.length);
        if (error.status === 403) deps.refused();
        sending = false;
        await read();
        return;
      }
      later();
      return;
    } finally {
      sending = false;
    }
    if (queue.length > 0) void flush();
  }

  deps.link.on('open', ({ looks, rescue }) => {
    if (looks === null) return;
    if (looks < known) {
      // fewer changes than this page knows: the app on the hub began anew, and what it has now is what there is
      era += 1;
      known = -1;
      rescues = -1;
    }
    if (looks !== known || (rescue ?? -1) > rescues) void read();
    void flush();
  });
  // a rescue comes with what is read: also a device that missed this word sees it, as soon as it reads again
  deps.link.on('looks', ({ revision }) => {
    if (revision !== known) void read();
  });

  return {
    /** Changes of the house's looks, sent as soon as they can be. */
    send(ops: readonly LookOp[]): void {
      queue = [...queue, ...ops];
      void flush();
    },
    pending: (): number => queue.length,
  };
}
