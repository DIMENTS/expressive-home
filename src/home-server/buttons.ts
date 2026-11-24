import { buttonId, buttonKey, buttonName } from '../homey/buttons';
import type { Flow } from '../homey/types';

/** The part of a trigger card of the Homey Apps SDK that is used. */
export interface ButtonCard {
  getArgumentValues(): Promise<unknown>;
  on(event: 'update', listener: () => void): unknown;
  registerRunListener(listener: (args: unknown, state: unknown) => unknown): unknown;
  trigger(tokens: Record<string, unknown>, state: Record<string, unknown>): Promise<unknown>;
}

export interface ButtonsDeps {
  /** The names as they were the last time; kept, so a button does not go with a restart. */
  load(): unknown;
  save(names: string[]): void;
  /** Null when the app does not have the card. */
  card: ButtonCard | null;
  /** The flows of the hub as they are known now. */
  flows(): Flow[];
  /** A flow with the card was saved: the flows of the hub can be others. */
  updated?(): void;
  /** How long the hub may take to start a button. */
  pressTimeout?: number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export const MAX_BUTTONS = 100;
/** Nobody waits longer than this for the names. */
export const BUTTONS_WAIT_MS = 1500;
/** A button that is not started in this time has not been started. */
export const PRESS_MS = 8000;
/** A hub that did not answer for this long is asked again. */
export const HUNG_MS = 30_000;

const argument = (args: unknown): unknown => (typeof args === 'object' && args !== null ? (args as Record<string, unknown>)['button'] : undefined);

const byName = (a: string, b: string): number => a.localeCompare(b) || (a < b ? -1 : a > b ? 1 : 0);

/** The names in a list, once each and on the alphabet: in a spelling that was used before, otherwise in that of the first. */
function unique(list: unknown, before: readonly string[] = []): string[] {
  const all = (Array.isArray(list) ? list : []).flatMap((raw): string[] => { const name = buttonName(raw); return name === null ? [] : [name]; });
  const names = new Map<string, string>();
  for (const name of all) if (!names.has(buttonKey(name))) names.set(buttonKey(name), name);
  for (const name of before) if (all.includes(name)) names.set(buttonKey(name), name);
  return [...names.values()].sort(byName);
}

/**
 * The buttons of the dashboard: the app starts its own flow card, which needs no key. The names are those that the hub
 * says are filled in; as long as it does not say so, those of the last time.
 */
export function createButtons(deps: ButtonsDeps) {
  const { card } = deps;
  const listeners = new Set<() => void>();
  let known: string[] = [];
  let reading: Promise<void> | null = null;
  let askedAt = Number.NEGATIVE_INFINITY;
  let turn = 0;
  try {
    if (card) known = unique(deps.load());
  } catch {
    // nothing was kept
  }

  function take(names: string[]): void {
    if (JSON.stringify(names) === JSON.stringify(known)) return;
    known = names;
    try {
      deps.save(names);
    } catch {
      // they last until the app stops
    }
    for (const listener of [...listeners]) listener();
  }

  function ask(): Promise<void> {
    if (!card) return Promise.resolve();
    const mine = ++turn;
    askedAt = deps.now();
    const own = (async () => card.getArgumentValues())().then((values) => {
      if (mine === turn && Array.isArray(values)) take(unique(values.map(argument), known));
    }, () => {
      // what was known stays
    }).finally(() => { if (reading === own) reading = null; });
    reading = own;
    return own;
  }

  /** Every button, with the flow in the shape of any other; it cannot be started when all flows with it are off. */
  function list(): Flow[] {
    if (!card) return [];
    const found = new Map<string, { name: string; on: boolean | null }>(known.map((name) => [buttonKey(name), { name, on: null }]));
    for (const flow of deps.flows()) {
      for (const name of flow.buttons ?? []) {
        const button = found.get(buttonKey(name)) ?? { name, on: null };
        found.set(buttonKey(name), { ...button, on: button.on === true || flow.off !== true });
      }
    }
    return [...found.values()]
      .sort((a, b) => byName(a.name, b.name))
      .slice(0, MAX_BUTTONS)
      .map(({ name, on }): Flow => ({ id: buttonId(name), name, kind: 'flow', startable: on !== false }));
  }

  if (card) {
    card.registerRunListener((args, state) => {
      const name = buttonName(argument(args));
      return name !== null && buttonKey(name) === argument(state);
    });
    card.on('update', () => {
      void ask();
      deps.updated?.();
    });
  }

  return {
    list,
    /** Asks what there is now when that was asked longer ago than `age`; who waits does not wait long. */
    async refresh(age = 0): Promise<void> {
      const since = deps.now() - askedAt;
      if (reading && since >= 0 && since <= HUNG_MS) {
        // already asked
      } else {
        // below zero: the clock of the hub was set back
        if (since >= 0 && since < age) return;
        void ask();
      }
      if (!reading) return;
      let timer: unknown = null;
      await Promise.race([reading, new Promise<void>((done) => { timer = deps.setTimeout(done, BUTTONS_WAIT_MS); })]);
      deps.clearTimeout(timer);
    },
    /** Starts the flows with this button; false when there is none, or all are off. */
    async press(id: string, device: string): Promise<boolean> {
      const button = list().find((flow) => flow.id === id && flow.startable);
      if (!card || !button) return false;
      let timer: unknown = null;
      const late = new Promise<never>((_done, fail) => { timer = deps.setTimeout(() => fail(new Error('The hub is slow')), deps.pressTimeout ?? PRESS_MS); });
      try {
        await Promise.race([card.trigger({ device }, { button: buttonKey(button.name) }), late]);
      } finally {
        deps.clearTimeout(timer);
      }
      return true;
    },
    /** Hears that there are other buttons. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type Buttons = ReturnType<typeof createButtons>;
