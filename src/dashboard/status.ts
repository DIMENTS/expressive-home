import type { Device, Route } from '../homey/types';
import { dangerAlarms } from '../recognition/recognize';

export type StatusLabel =
  | { kind: 'route'; route: Route | null }
  | { kind: 'alarm'; deviceId: string; capabilityId: string }
  | { kind: 'more'; count: number };

const MAX_ALARM_LABELS = 3;

/** The header labels: the connection route first, then up to three active danger alarms, then a count of the rest. */
export function statusLabels(devices: Device[], route: Route | null, locale = 'nl'): StatusLabel[] {
  const alarms: StatusLabel[] = [...devices]
    .sort((a, b) => a.name.localeCompare(b.name, locale))
    .flatMap((device) => dangerAlarms(device).map((c): StatusLabel => ({ kind: 'alarm', deviceId: device.id, capabilityId: c.id })));
  const shown = alarms.slice(0, MAX_ALARM_LABELS);
  const rest = alarms.length - shown.length;
  return [
    { kind: 'route', route },
    ...shown,
    ...(rest > 0 ? [{ kind: 'more', count: rest } as StatusLabel] : []),
  ];
}
