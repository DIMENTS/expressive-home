/** What a flow said of the night, and how long ago in ms: the clocks of the hub and of a tablet need not be the same. */
export interface NightWord { night: boolean; age: number }

export interface NightDeps {
  load(): unknown;
  save(value: { night: boolean; at: number }): void;
  now(): number;
}

/** The night of the wall tablets, as the flow cards of the app say it. It outlives a restart. */
export function createNight(deps: NightDeps) {
  let said: { night: boolean; at: number } | null = null;
  const listeners = new Set<() => void>();
  try {
    const stored = deps.load() as { night?: unknown; at?: unknown } | null | undefined;
    if (typeof stored?.night === 'boolean' && typeof stored.at === 'number' && stored.at >= 0) said = { night: stored.night, at: stored.at };
  } catch {
    // nothing was kept
  }
  return {
    get: (): NightWord | null => (said ? { night: said.night, age: Math.max(0, deps.now() - said.at) } : null),
    set(night: boolean): void {
      said = { night, at: deps.now() };
      try {
        deps.save(said);
      } catch {
        // it lasts until the app stops
      }
      for (const listener of [...listeners]) listener();
    },
    /** Hears of everything that is said. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type Night = ReturnType<typeof createNight>;
