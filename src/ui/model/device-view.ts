import { houseKind } from '../../dashboard/classify';
import type { HouseKind } from '../../dashboard/types';
import type { Capability, Device, Zone } from '../../homey/types';
import { formatValue, joinValue } from '../../i18n/format';
import type { Language, Translate } from '../../i18n/index';
import { alarmKind, isMinor } from '../../recognition/recognize';
import type { IconName } from '../icons/icons';
import { houseTile, shownOnTop, topLine } from './device-top';
import { iconFor } from './icon-for';
import { fractionOf } from './slider-math';
import type { Busy } from './tile-view';

/** The control for one settable capability. */
export type Control =
  | { kind: 'switch'; capabilityId: string; label: string; checked: boolean }
  | { kind: 'action'; capabilityId: string; label: string }
  | { kind: 'slider'; capabilityId: string; label: string; fraction: number; valueText: string; variant: 'plain' | 'hue' | 'temperature' }
  | { kind: 'number'; capabilityId: string; label: string; value: number | null; unit: string }
  | { kind: 'choice'; capabilityId: string; label: string; options: { id: string; label: string }[]; value: string | null; layout: 'buttons' | 'list' }
  | { kind: 'text'; capabilityId: string; label: string; value: string };

/** What the device window shows: controls, values in two columns, and the technical details. */
export interface DeviceView {
  name: string; zoneName: string; icon: IconName; on: boolean; unavailable: string | null;
  /** A device of a house has a top of its own in its window; `line` says in short how it is. */
  house: HouseKind | null; line: string;
  controls: Control[]; values: { capabilityId: string; label: string; text: string; danger: boolean }[]; technical: { label: string; text: string }[];
}

/** At most three options of at most twelve characters sit side by side; anything else is a list. */
const SHORT_OPTION = 12;
const MAX_BUTTONS = 3;

/** The control that suits a capability, or null when the capability cannot be set. */
export function controlFor(cap: Capability, t: Translate): Control | null {
  if (!cap.setable) return null;
  const base = { capabilityId: cap.id, label: cap.title };
  if (cap.type === 'boolean') {
    // what can only be told and never says how it is, is something to press
    return cap.baseId === 'button' || (!cap.getable && cap.baseId !== 'onoff') ? { kind: 'action', ...base } : { kind: 'switch', ...base, checked: cap.value === true };
  }
  if (cap.type === 'enum') {
    const options = cap.options.map((o) => ({ id: o.id, label: o.title }));
    const short = options.length <= MAX_BUTTONS && options.every((o) => o.label.length <= SHORT_OPTION);
    return { kind: 'choice', ...base, options, value: cap.value === null ? null : String(cap.value), layout: short ? 'buttons' : 'list' };
  }
  if (cap.type === 'number') {
    if (cap.min !== null && cap.max !== null && cap.max > cap.min) {
      const variant = cap.baseId === 'light_hue' ? 'hue' : cap.baseId === 'light_temperature' ? 'temperature' : 'plain';
      const value = typeof cap.value === 'number' ? cap.value : Number.NaN;
      return {
        kind: 'slider', ...base, variant,
        fraction: Number.isFinite(value) ? fractionOf(value, cap) : 0,
        // the hue slider shows no number
        valueText: variant === 'hue' ? '' : joinValue(formatValue(cap, 'full', t)),
      };
    }
    return { kind: 'number', ...base, value: typeof cap.value === 'number' && Number.isFinite(cap.value) ? cap.value : null, unit: cap.units ?? '' };
  }
  return { kind: 'text', ...base, value: cap.value === null ? '' : String(cap.value) };
}

/** The device window as data, in the order in which the hub reports the capabilities. Never throws. */
export function deviceView(device: Device, zones: Record<string, Zone>, t: Translate, busy: Busy = null): DeviceView {
  const house = houseKind(device);
  const top = house ? shownOnTop(device, house) : null;
  const tile = house ? houseTile(device, house, t, busy) : null;
  const caps = device.capabilityOrder.map((id) => device.capabilities[id]).filter((c): c is Capability => c !== undefined && !top?.has(c.id));
  const controls: Control[] = [];
  const values: DeviceView['values'] = [];
  const technical: DeviceView['technical'] = [];
  for (const cap of caps) {
    const control = controlFor(cap, t);
    if (control) controls.push(control);
    else if (isMinor(cap.baseId)) technical.push({ label: cap.title, text: joinValue(formatValue(cap, 'full', t)) });
    else if (cap.getable) {
      values.push({ capabilityId: cap.id, label: cap.title, text: joinValue(formatValue(cap, 'full', t)), danger: cap.value === true && alarmKind(cap.baseId) === 'danger' });
    }
  }
  const unavailable = device.available ? null : device.unavailableMessage?.trim() || t('tile.unavailable');
  return {
    name: device.name.trim() || t('tile.unnamed'),
    zoneName: (device.zoneId && zones[device.zoneId]?.name) || '',
    house, line: house && tile && !unavailable ? topLine(device, house, tile, t) : '',
    icon: unavailable ? 'link_off' : tile ? tile.icon : iconFor({ kind: 'generic', id: `${device.id}:window`, deviceId: device.id, size: 'single', capabilityId: null }, device),
    on: tile ? tile.state === 'on' || tile.state === 'danger' : caps.some((c) => c.baseId === 'onoff' && c.value === true),
    unavailable,
    controls, values, technical,
  };
}

/** The mark that separates thousands in a language: a number with it before exactly three digits is ambiguous. */
const THOUSANDS: Record<Language, string> = { nl: '.', en: ',' };

/**
 * A typed number, strictly: digits with at most one decimal comma or point and an optional sign.
 * No exponent, no hexadecimal and no thousands separators; null for anything else. A number that reads as
 * thousands in the language ("1.500" in Dutch, "1,500" in English) is refused too, never sent as a fraction.
 */
export function parseNumberInput(text: string, language: Language): number | null {
  const trimmed = text.trim();
  const match = /^[-+]?\d+(?:([.,])(\d+))?$/.exec(trimmed);
  if (!match) return null;
  if (match[1] === THOUSANDS[language] && match[2]?.length === 3) return null;
  return Number(trimmed.replace(',', '.'));
}
