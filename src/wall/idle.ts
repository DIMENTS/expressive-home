export interface IdleDeps {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** After how long without a touch it is due. */
  delay(): number;
  /** Nobody touched anything for that long. Whether something came of it; if not it is asked again after a change. */
  due(): boolean;
}

/** How long nobody touched anything. */
export function createIdle(deps: IdleDeps) {
  let last = deps.now();
  let timer: unknown = null;
  /** Something came of it: quiet until a touch. */
  let taken = false;
  let stopped = false;

  function clear(): void {
    if (timer !== null) deps.clearTimeout(timer);
    timer = null;
  }

  function check(): void {
    clear();
    if (taken || stopped) return;
    const now = deps.now();
    // the clock was set back: the waiting begins anew
    if (now < last) last = now;
    const left = last + deps.delay() - now;
    if (left > 0) timer = deps.setTimeout(check, left);
    else taken = deps.due();
  }

  check();
  return {
    /** Somebody did something. The timer that runs finds out by itself that it is too early. */
    touched(): void {
      last = deps.now();
      taken = false;
      if (timer === null) check();
    },
    /** The delay, or whether something can come of it, can be another one. */
    changed: check,
    stop(): void {
      stopped = true;
      clear();
    },
  };
}

export type Idle = ReturnType<typeof createIdle>;
