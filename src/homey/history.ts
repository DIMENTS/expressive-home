import type { HistoryPoint, HistoryRef, HistorySeries, HistorySource, HistorySwitches } from './client';

const DEVICE_URI = /^homey:device:([^:]+)$/;
const DEVICE_LOG = /^homey:device:([^:]+):(.+)$/;

/**
 * The device capability an Insights log is about, or null for a log that is not about a device.
 * The library gives either the full id (`homey:device:<id>:<capability>`) or the capability with its owner apart.
 */
export function historyRefFromLog(raw: unknown): HistoryRef | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, ownerUri } = raw as { id?: unknown; ownerUri?: unknown };
  if (typeof id !== 'string' || id === '') return null;
  const full = DEVICE_LOG.exec(id);
  if (full) return { deviceId: full[1]!, capabilityId: full[2]! };
  if (typeof ownerUri !== 'string') return null;
  const owner = DEVICE_URI.exec(ownerUri);
  return owner && !id.includes(':') ? { deviceId: owner[1]!, capabilityId: id } : null;
}

/** The usable points of a log's entries, oldest first: a finite number at a valid time. */
export function historyPointsFrom(raw: unknown): HistoryPoint[] {
  const values = typeof raw === 'object' && raw !== null ? (raw as { values?: unknown }).values : undefined;
  if (!Array.isArray(values)) return [];
  const points: HistoryPoint[] = [];
  for (const entry of values) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { t, v } = entry as { t?: unknown; v?: unknown };
    const at = typeof t === 'string' ? Date.parse(t) : typeof t === 'number' ? t : Number.NaN;
    if (!Number.isFinite(at) || typeof v !== 'number' || !Number.isFinite(v)) continue;
    points.push({ at, value: v });
  }
  return points.sort((a, b) => a.at - b.at);
}

/** The id of this app on the hub; its recorded logs are `homey:app:<id>:<recordedLogId>`. */
export const APP_ID = 'app.expressive.home';
const APP_LOG = /^homey:app:([^:]+):(.+)$/;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK = (1n << 64n) - 1n;

/**
 * The id of the log in which the app records a value: a hash of device and capability, so whoever reads can find it
 * without a list and without a name in it. FNV-1a of 64 bits over the UTF-8 bytes.
 */
export function recordedLogId(deviceId: string, capabilityId: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(`${deviceId}\u0000${capabilityId}`)) hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK;
  return `rec_${hash.toString(16).padStart(16, '0')}`;
}

const timeOf = (value: unknown): number => (typeof value === 'string' ? Date.parse(value) : typeof value === 'number' ? value : Number.NaN);
const listOf = (raw: unknown): unknown[] | null => {
  if (Array.isArray(raw)) return raw;
  const values = typeof raw === 'object' && raw !== null ? (raw as { values?: unknown }).values : undefined;
  return Array.isArray(values) ? values : null;
};

/**
 * The logs with history of values: every log of a device with numbers or yes/no, and the recorded logs of this app
 * that belong to one of `known` (the values the reader has).
 */
export function sourcesFrom(rawLogs: unknown, known: readonly HistoryRef[]): HistorySource[] {
  const logs = Array.isArray(rawLogs) ? rawLogs : typeof rawLogs === 'object' && rawLogs !== null ? Object.values(rawLogs) : [];
  const recorded = new Map(known.map((ref) => [recordedLogId(ref.deviceId, ref.capabilityId), ref]));
  const sources: HistorySource[] = [];
  for (const raw of logs) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { type } = raw as { type?: unknown };
    if (type !== 'number' && type !== 'boolean') continue;
    const ref = historyRefFromLog(raw);
    if (ref) {
      sources.push({ log: `homey:device:${ref.deviceId}:${ref.capabilityId}`, kind: 'device', type, ...ref });
      continue;
    }
    const { id } = raw as { id?: unknown };
    const app = typeof id === 'string' ? APP_LOG.exec(id) : null;
    const found = app && app[1] === APP_ID ? recorded.get(app[2]!) : undefined;
    if (found && type === 'number') sources.push({ log: id as string, kind: 'recorded', type, deviceId: found.deviceId, capabilityId: found.capabilityId });
  }
  return sources;
}

/** The points of a log over a period, with empty points kept as gaps; null when there are none. */
export function seriesFrom(raw: unknown): HistorySeries | null {
  const list = listOf(raw);
  if (!list) return null;
  const points: HistorySeries['points'] = [];
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { t, v } = entry as { t?: unknown; v?: unknown };
    const at = timeOf(t);
    if (!Number.isFinite(at)) continue;
    points.push({ at, value: typeof v === 'number' && Number.isFinite(v) ? v : null });
  }
  if (points.length === 0) return null;
  points.sort((a, b) => a.at - b.at);
  const meta = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}) as { start?: unknown; end?: unknown; step?: unknown; updatesIn?: unknown };
  const start = timeOf(meta.start);
  const end = timeOf(meta.end);
  const gaps = points.slice(1).map((point, i) => point.at - points[i]!.at).filter((gap) => gap > 0).sort((a, b) => a - b);
  const step = typeof meta.step === 'number' && meta.step > 0 ? meta.step : gaps[Math.floor(gaps.length / 2)] ?? 0;
  return {
    start: Number.isFinite(start) ? start : points[0]!.at,
    end: Number.isFinite(end) ? end : points.at(-1)!.at,
    step,
    updatesIn: typeof meta.updatesIn === 'number' && Number.isFinite(meta.updatesIn) ? meta.updatesIn : null,
    points,
  };
}

/** The changes of a yes/no log, oldest first. */
export function switchesFrom(raw: unknown): HistorySwitches {
  const changes: HistorySwitches['changes'] = [];
  for (const entry of listOf(raw) ?? []) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { t, v } = entry as { t?: unknown; v?: unknown };
    const at = timeOf(t);
    if (!Number.isFinite(at) || (typeof v !== 'boolean' && typeof v !== 'number')) continue;
    changes.push({ at, on: v === true || (typeof v === 'number' && v !== 0) });
  }
  return { changes: changes.sort((a, b) => a.at - b.at) };
}

const YEAR_MS = 365 * 86_400_000;

/** The last twelve months: the end of last year and this year, at the step of this year; points of this year win. */
export function yearFrom(lastYear: HistorySeries | null, thisYear: HistorySeries | null, now: number): HistorySeries | null {
  if (!lastYear && !thisYear) return null;
  const from = now - YEAR_MS;
  const byTime = new Map<number, number | null>();
  for (const point of lastYear?.points ?? []) if (point.at >= from) byTime.set(point.at, point.value);
  for (const point of thisYear?.points ?? []) if (point.at >= from) byTime.set(point.at, point.value);
  const points = [...byTime].map(([at, value]) => ({ at, value })).sort((a, b) => a.at - b.at);
  if (points.length === 0) return null;
  return { start: from, end: thisYear?.end ?? now, step: thisYear?.step ?? lastYear!.step, updatesIn: thisYear?.updatesIn ?? lastYear!.updatesIn, points };
}
