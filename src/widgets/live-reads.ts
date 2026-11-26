// Something the page asks the hub every while, shared by everything that shows it: the weather, a period of energy.
// It is asked only while something listens and the page is in sight.

export interface ReadState<T> {
  value: T | null;
  /** When it was last read, in ms; null before. */
  at: number | null;
  /** Why the last asking failed: the key may not, the hub has none, or no answer; null when it worked. */
  error: 'no-right' | 'none' | 'failed' | null;
}

export interface ReadSourceDeps<T> {
  read(): Promise<unknown>;
  parse(raw: unknown): T | null;
  everyMs: number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
  visible(): boolean;
  /** Calls back when the page comes in sight again; returns how to stop. */
  onVisible(fn: () => void): () => void;
  /** What a value is of, such as today, and when that is over: then the value is gone and the next one asked for. */
  period?: { keyOf(now: number): string; nextAt(now: number): number };
}

const statusOf = (error: unknown): number | null => {
  const { statusCode, status } = (typeof error === 'object' && error !== null ? error : {}) as { statusCode?: unknown; status?: unknown };
  return typeof statusCode === 'number' ? statusCode : typeof status === 'number' ? status : null;
};

export function createReadSource<T>(deps: ReadSourceDeps<T>) {
  const listeners = new Set<(state: ReadState<T>) => void>();
  const empty: ReadState<T> = { value: null, at: null, error: null };
  let state: ReadState<T> = empty;
  let timer: unknown = null;
  let asking = false;
  /** Asked for again while an asking ran. */
  let again = false;
  /** When it was last asked, whatever came of it. */
  let tried: number | null = null;
  /** What the value is of. */
  let key: string | null = null;
  /** Counts up when what is known is dropped: an answer of before is then for nobody. */
  let round = 0;
  let stopVisible: (() => void) | null = null;

  const tell = (): void => { for (const listener of [...listeners]) listener(state); };
  const keyNow = (): string | null => deps.period?.keyOf(deps.now()) ?? null;
  /** Nothing asked for a while, or what is known is of a period that is over. */
  const due = (): boolean => tried === null || deps.now() - tried >= deps.everyMs || (state.value !== null && key !== keyNow());

  function schedule(): void {
    if (timer !== null) deps.clearTimeout(timer);
    const now = deps.now();
    // a while after it was last asked, or when the period is over if that comes first
    const next = tried === null ? deps.everyMs : tried + deps.everyMs - now;
    const wait = Math.max(0, Math.min(next, deps.period ? deps.period.nextAt(now) - now : next));
    timer = listeners.size > 0 ? deps.setTimeout(() => { timer = null; void ask(); }, wait) : null;
  }

  async function ask(): Promise<void> {
    if (listeners.size === 0) return;
    if (asking) { again = true; return; }
    // out of sight: asked again when it comes back
    if (!deps.visible()) return;
    const of = keyNow();
    if (state.value !== null && key !== of) {
      state = empty;
      tell();
    }
    const mine = round;
    asking = true;
    tried = deps.now();
    try {
      const value = deps.parse(await deps.read());
      if (mine !== round) return;
      state = { value, at: deps.now(), error: null };
      key = of;
    } catch (error) {
      if (mine !== round) return;
      const status = statusOf(error);
      state = { ...state, error: status === 401 || status === 403 ? 'no-right' : status === 404 ? 'none' : 'failed', ...(status === 404 ? { value: null } : {}) };
    } finally {
      if (mine === round) asking = false;
    }
    tell();
    if (again) {
      again = false;
      void ask();
    } else schedule();
  }

  return {
    get: (): ReadState<T> => state,
    listen(listener: (state: ReadState<T>) => void): () => void {
      listeners.add(listener);
      if (state.at !== null || state.error !== null) listener(state);
      if (listeners.size === 1) {
        stopVisible = deps.onVisible(() => { if (due()) void ask(); else schedule(); });
        if (due()) void ask();
        else schedule();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        if (timer !== null) deps.clearTimeout(timer);
        timer = null;
        stopVisible?.();
        stopVisible = null;
      };
    },
    /** Asks again now, as when the hub came back. */
    refresh(): void { void ask(); },
    /** Forgets what is known, as for another hub, and asks anew for who listens. */
    clear(): void {
      round += 1;
      state = empty;
      [asking, again, tried, key] = [false, false, null, null];
      tell();
      void ask();
    },
  };
}

export type ReadSource<T> = ReturnType<typeof createReadSource<T>>;
