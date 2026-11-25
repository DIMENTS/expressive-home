import type { CapRef } from '../dashboard/types';
import type { HistorySource } from '../homey/client';
import { recordedLogId } from '../homey/history';
import type { CapabilityValue } from '../homey/types';
/** A log of this app in Insights, as the Homey Apps SDK gives it. */
export interface SdkInsightsLog { createEntry(value: number | boolean, date?: Date): Promise<unknown> }
/** The part of `this.homey.insights` of the Homey Apps SDK that the app uses. */
export interface SdkInsights {
  createLog(id: string, options: { title: Record<string, string>; type: 'number' | 'boolean'; units?: string; decimals?: number }): Promise<SdkInsightsLog>;
  getLog(id: string): Promise<SdkInsightsLog>;
  deleteLog(log: SdkInsightsLog): Promise<unknown>;
}

/** The test logs an earlier measurement left behind; they go at the start. */
const PROBE_LOGS = ['probe_number', 'probe_delete'];

export interface RecorderDeps {
  insights: SdkInsights | undefined;
  /** The values the heroes of the dashboards show, in the order in which they count. */
  wanted(): CapRef[];
  /** The live value of now; undefined when it is not known. */
  value(ref: CapRef): CapabilityValue | undefined;
  /** The logs Homey keeps itself: what is in them is not recorded. */
  kept(): Promise<HistorySource[]>;
  /** The title of a recorded log in Insights, per language. */
  title(ref: CapRef): Record<string, string>;
  load(): unknown;
  save(state: RecorderState): void;
  /** "Zelf opnemen wat Homey niet bijhoudt". */
  enabled(): boolean;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  log?(message: string): void;
}

/** What the recorder keeps of its logs: per log id the value and when it last wrote to it. */
export interface RecorderState { logs: Record<string, CapRef & { last: number }> }

/** At most this many values are recorded. */
export const RECORD_MAX = 8;
const MINUTE_MS = 60_000;
/** A log nothing was written to for this long goes. */
export const RECORD_FORGET_MS = 30 * 24 * 60 * MINUTE_MS;
/** What Homey keeps is asked again after this long. */
const KEPT_MS = 60 * MINUTE_MS;
/** Logs nothing was written to for long are looked for once a day. */
const TIDY_MS = 24 * 60 * MINUTE_MS;
/** The words of shore power that mean there is no power from outside. */
const NO_SHORE = new Set(['none', 'inverting']);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const keyOf = (ref: CapRef): string => `${ref.deviceId}\u0000${ref.capabilityId}`;

/** A value as the number it is recorded as: a number, or for shore power 1 (connected) or 0; null for anything else. */
export function recordedNumber(value: CapabilityValue | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && value !== '') return NO_SHORE.has(value) ? 0 : 1;
  return null;
}

function stateOf(raw: unknown): RecorderState {
  const logs: RecorderState['logs'] = {};
  const stored = isRecord(raw) && isRecord(raw['logs']) ? raw['logs'] : {};
  for (const [id, entry] of Object.entries(stored)) {
    if (!/^rec_[0-9a-f]{16}$/.test(id) || !isRecord(entry)) continue;
    const { deviceId, capabilityId, last } = entry;
    if (typeof deviceId === 'string' && typeof capabilityId === 'string' && typeof last === 'number' && Number.isFinite(last)) logs[id] = { deviceId, capabilityId, last };
  }
  return { logs };
}

/** What came in during the running minute: its area under the line and how long, and the value of now. */
interface Running { ref: CapRef; shore: boolean; current: number | null; since: number; area: number; span: number }

/**
 * The app on the hub records what Homey does not keep, such as the sun, the use and the shore power of a camper: one
 * point a minute into its own logs in Insights, the mean over that minute weighed by time (shore power: its state).
 * Homey sums them up per step as for any log. It begins with a point of now; a stop is a flat line, as Homey holds the
 * last value. It only records what a hero shows and Homey does not keep, at most eight values.
 */
export function createRecorder(deps: RecorderDeps) {
  let state = stateOf(deps.load());
  const handles = new Map<string, Promise<SdkInsightsLog | null>>();
  let running = new Map<string, Running>();
  let timer: unknown = null;
  let kept: { at: number; list: HistorySource[] } | null = null;
  /** Every start and stop takes a new number: what an earlier one still does after an await, writes nothing. */
  let run = 0;
  let stopped = true;
  /** This run has tidied up and written its points of now. */
  let begun = false;
  let tidied = Number.NEGATIVE_INFINITY;

  const save = (): void => deps.save(structuredClone(state));
  const current = (mine: number): boolean => mine === run && !stopped;

  /** What Homey keeps; null as long as it never said, so nothing is recorded that Homey may keep itself. */
  async function keptNow(): Promise<HistorySource[] | null> {
    if (kept && Math.abs(deps.now() - kept.at) < KEPT_MS) return kept.list;
    try {
      kept = { at: deps.now(), list: await deps.kept() };
    } catch {
      // a failed answer is not kept: it is asked again at the next minute
      return kept?.list ?? null;
    }
    return kept.list;
  }

  /** The values to record now: shown by a hero, a number or a word, not kept by Homey; at most eight. */
  async function chosen(): Promise<CapRef[]> {
    const keptLogs = await keptNow();
    if (keptLogs === null) return [];
    const seen = new Set<string>();
    const result: CapRef[] = [];
    for (const ref of deps.wanted()) {
      if (result.length >= RECORD_MAX) break;
      const key = keyOf(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      if (keptLogs.some((log) => log.kind === 'device' && log.deviceId === ref.deviceId && log.capabilityId === ref.capabilityId)) continue;
      if (recordedNumber(deps.value(ref)) === null) continue;
      result.push(ref);
    }
    return result;
  }

  /** The log of a value: the one that is there, or a new one. */
  function logOf(ref: CapRef): Promise<SdkInsightsLog | null> {
    const id = recordedLogId(ref.deviceId, ref.capabilityId);
    const found = handles.get(id);
    if (found) return found;
    const insights = deps.insights!;
    const made = (async () => {
      try {
        return await insights.getLog(id);
      } catch {
        // not there yet
      }
      try {
        return await insights.createLog(id, { title: deps.title(ref), type: 'number', decimals: 2 });
      } catch (error) {
        deps.log?.(`A log could not be made: ${error instanceof Error ? error.message : 'unknown'}`);
        return null;
      }
    })();
    handles.set(id, made);
    made.then((log) => { if (!log && handles.get(id) === made) handles.delete(id); }, () => handles.delete(id));
    return made;
  }

  async function write(mine: number, ref: CapRef, value: number): Promise<void> {
    if (!current(mine)) return;
    const log = await logOf(ref);
    if (!log || !current(mine)) return;
    try {
      await log.createEntry(Math.round(value * 100) / 100);
      if (current(mine)) state.logs[recordedLogId(ref.deviceId, ref.capabilityId)] = { ...ref, last: deps.now() };
    } catch (error) {
      deps.log?.(`A point could not be written: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  /** The mean of the minute that ends now, and a new minute begins. */
  function close(entry: Running, now: number): number | null {
    if (entry.current !== null && now > entry.since) {
      entry.area += entry.current * (now - entry.since);
      entry.span += now - entry.since;
    }
    const mean = entry.shore ? entry.current : entry.span > 0 ? entry.area / entry.span : entry.current;
    entry.since = Math.max(entry.since, now);
    entry.area = 0;
    entry.span = 0;
    return mean;
  }

  /** Brings the values to record up to date; those that are new are returned, with their value of now. */
  async function follow(mine: number): Promise<Running[]> {
    const refs = await chosen();
    if (!current(mine)) return [];
    const next = new Map<string, Running>();
    const fresh: Running[] = [];
    for (const ref of refs) {
      const key = keyOf(ref);
      const known = running.get(key);
      if (known) {
        next.set(key, known);
        continue;
      }
      const entry = { ref, shore: typeof deps.value(ref) === 'string', current: recordedNumber(deps.value(ref)), since: deps.now(), area: 0, span: 0 };
      next.set(key, entry);
      fresh.push(entry);
    }
    running = next;
    return fresh;
  }

  /** The points of now of values that begin to be recorded. */
  async function writeNow(mine: number, fresh: Running[]): Promise<void> {
    await Promise.all(fresh.flatMap((entry) => (entry.current === null ? [] : [write(mine, entry.ref, entry.current)])));
  }

  /** The first time in a run that recording is on: tidy up, and a point of now for every value. */
  async function begin(mine: number): Promise<void> {
    begun = true;
    const fresh = await follow(mine);
    if (!current(mine)) return;
    await tidy(mine);
    await writeNow(mine, fresh);
    if (current(mine)) save();
  }

  async function tick(mine: number): Promise<void> {
    timer = null;
    if (!current(mine)) return;
    if (deps.enabled() && deps.insights) {
      if (!begun) {
        await begin(mine);
      } else {
        const before = new Set(running.keys());
        const fresh = await follow(mine);
        if (!current(mine)) return;
        // the minute ends now: after the values were brought up to date, so nothing that came in counts twice
        const now = deps.now();
        const writes: Promise<void>[] = [writeNow(mine, fresh)];
        for (const [key, entry] of running) {
          if (!before.has(key)) continue;
          const mean = close(entry, now);
          if (mean !== null) writes.push(write(mine, entry.ref, mean));
        }
        await Promise.all(writes);
        if (current(mine) && now - tidied >= TIDY_MS) await tidy(mine);
        if (current(mine)) save();
      }
    }
    schedule(mine);
  }

  /** The next whole minute; never two timers. */
  function schedule(mine: number): void {
    if (!current(mine)) return;
    if (timer !== null) deps.clearTimeout(timer);
    const now = deps.now();
    timer = deps.setTimeout(() => { void tick(mine); }, MINUTE_MS - (now % MINUTE_MS) || MINUTE_MS);
  }

  /** Deletes the logs of the measurement, and those nothing was written to for thirty days. */
  async function tidy(mine: number): Promise<void> {
    const insights = deps.insights;
    if (!insights || !current(mine)) return;
    tidied = deps.now();
    for (const id of PROBE_LOGS) {
      try {
        await insights.deleteLog(await insights.getLog(id));
      } catch {
        // not there
      }
    }
    const now = deps.now();
    const still = new Set([...running.values()].map((entry) => recordedLogId(entry.ref.deviceId, entry.ref.capabilityId)));
    for (const [id, entry] of Object.entries(state.logs)) {
      if (still.has(id) || now - entry.last < RECORD_FORGET_MS) continue;
      try {
        await insights.deleteLog(await insights.getLog(id));
      } catch {
        // gone already
      }
      delete state.logs[id];
      handles.delete(id);
    }
    save();
  }

  return {
    /** Begins: when recording is on, tidies up and writes a point of now for every value; then one every minute. */
    async start(): Promise<void> {
      if (stopped) {
        stopped = false;
        run += 1;
        begun = false;
        schedule(run);
      }
      const mine = run;
      if (!begun && deps.enabled() && deps.insights) await begin(mine);
    },
    stop(): void {
      stopped = true;
      run += 1;
      if (timer !== null) deps.clearTimeout(timer);
      timer = null;
      running = new Map();
      begun = false;
    },
    /**
     * What is shown or known changed (the hub was read, a layout was saved): a value that begins to be recorded gets
     * its point of now at once.
     */
    async refresh(): Promise<void> {
      const mine = run;
      if (!current(mine) || !deps.enabled() || !deps.insights) return;
      if (!begun) { await begin(mine); return; }
      await writeNow(mine, await follow(mine));
      if (current(mine)) save();
    },
    /** A value of a device changed. */
    observe(deviceId: string, capabilityId: string, value: CapabilityValue): void {
      const entry = running.get(keyOf({ deviceId, capabilityId }));
      if (!entry) return;
      const now = deps.now();
      if (entry.current !== null && now > entry.since) {
        entry.area += entry.current * (now - entry.since);
        entry.span += now - entry.since;
      }
      entry.current = recordedNumber(value);
      entry.since = Math.max(entry.since, now);
    },
    /** What is recorded now. */
    recording: (): CapRef[] => [...running.values()].map((entry) => entry.ref),
    /** "Opname wissen": every recorded log goes; what is still under way writes nothing. */
    async wipe(): Promise<void> {
      run += 1;
      const insights = deps.insights;
      const ids = Object.keys(state.logs);
      state = { logs: {} };
      handles.clear();
      save();
      for (const id of ids) {
        try {
          if (insights) await insights.deleteLog(await insights.getLog(id));
        } catch {
          // gone already
        }
      }
    },
  };
}

export type Recorder = ReturnType<typeof createRecorder>;
