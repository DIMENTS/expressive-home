import { clampTarget, targetStep } from '../../controls/climate';
import type { Capability, Device } from '../../homey/types';
import type { Translate } from '../../i18n/index';
import { degrees } from './tile-view';

export interface TargetView { value: string; unit: string; spoken: string; less: string; more: string; atLeast: boolean; atMost: boolean }

/** The target of a thermostat between its two buttons. */
export function targetView(device: Device, target: Capability, value: number | null, t: Translate): TargetView {
  const names = { less: t('climate.colder', { name: device.name }), more: t('climate.warmer', { name: device.name }) };
  if (value === null) return { value: '–', unit: '', spoken: '', ...names, atLeast: false, atMost: false };
  const step = targetStep(target);
  const text = degrees(value, t);
  return {
    value: text.slice(0, -1), unit: '°', spoken: t('climate.spoken', { name: device.name, target: text }), ...names,
    atLeast: clampTarget(target, value - step) >= value, atMost: clampTarget(target, value + step) <= value,
  };
}
