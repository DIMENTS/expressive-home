import { statusLabels } from '../../dashboard/status';
import type { Device, Route } from '../../homey/types';
import type { Translate } from '../../i18n/index';

export type HeaderChip =
  | { kind: 'route'; route: Route | null; connecting: boolean }
  | { kind: 'alarm'; deviceId: string; text: string }
  | { kind: 'more'; count: number }
  | { kind: 'readonly' }
  | { kind: 'demo' };

/**
 * The labels in the header: always the connection, then at most three danger alarms as
 * "‹device› · ‹alarm›" and a counter, then "Alleen bekijken" and "Voorbeeld" when they apply.
 */
export function headerChips(
  input: { devices: Device[]; route: Route | null; connecting: boolean; canControl: boolean; demo: boolean },
  t: Translate,
): HeaderChip[] {
  const byId = new Map(input.devices.map((d) => [d.id, d]));
  const chips: HeaderChip[] = statusLabels(input.devices, input.route, t.locale).map((label): HeaderChip => {
    if (label.kind === 'route') return { kind: 'route', route: label.route, connecting: input.connecting };
    if (label.kind === 'more') return { kind: 'more', count: label.count };
    const device = byId.get(label.deviceId);
    const alarm = device?.capabilities[label.capabilityId]?.title ?? label.capabilityId;
    return { kind: 'alarm', deviceId: label.deviceId, text: t('chip.alarm', { device: device?.name ?? '', alarm }) };
  });
  if (!input.canControl) chips.push({ kind: 'readonly' });
  if (input.demo) chips.push({ kind: 'demo' });
  return chips;
}
