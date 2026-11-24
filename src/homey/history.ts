import type { HistoryPoint, HistoryRef } from './client';

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
