import { climateOf, climateState } from '../../controls/climate';
import { coverOf, coverState } from '../../controls/cover';
import { guardOf, guardState, type GuardState } from '../../controls/guard';
import { mediaOf, mediaState } from '../../controls/media';
import { HOUSE_KINDS, type DeviceTileSpec, type FlowTileSpec } from '../../dashboard/types';
import type { Capability, CapabilityValue, Device, Flow } from '../../homey/types';
import { formatValue, joinValue, type Formatted } from '../../i18n/format';
import type { MessageKey, Translate } from '../../i18n/index';
import { alarmKind, dangerAlarms, hasLowBattery, tankPercent } from '../../recognition/recognize';
import type { IconName } from '../icons/icons';
import { coverText, partly } from './cover-view';
import { isLibraryIcon } from '../icons/library';
import { iconFor } from './icon-for';

export type TileState = 'off' | 'on' | 'danger' | 'neutral' | 'unavailable';

/** Everything a tile shows, worked out without a screen. */
export interface TileView {
  name: string; icon: IconName; state: TileState; stateText: string; warn: boolean;
  /** The large value of a sensor or tank tile. */
  value: Formatted | null;
  /** Sensor: the capability title; tank: the volume line. */
  subText: string;
  /** Multi-value tile. */
  cells: { value: Formatted; label: string }[];
  /** 0–100: slider position or tank level. */
  level: number | null;
  tap: 'toggle' | 'press' | 'open';
  ariaLabel: string;
}

const capOf = (device: Device | undefined, id: string | null | undefined): Capability | undefined => (device && id ? device.capabilities[id] : undefined);
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Where a value lies in its range, 0–100; a capability without a range is read as 0 to 1. */
function percentOf(cap: Capability | undefined): number | null {
  const value = finite(cap?.value);
  if (value === null || !cap) return null;
  const min = cap.min ?? 0;
  const max = cap.max ?? 1;
  if (max <= min) return null;
  return Math.round(Math.min(1, Math.max(0, (value - min) / (max - min))) * 100);
}

const isNone = (f: Formatted, t: Translate): boolean => f.text === t('value.none') && f.unit === '';

function base(name: string, icon: IconName): TileView {
  return { name, icon, state: 'neutral', stateText: '', warn: false, value: null, subText: '', cells: [], level: null, tap: 'open', ariaLabel: name };
}

function light(spec: Extract<DeviceTileSpec, { kind: 'light' }>, device: Device, view: TileView, t: Translate): void {
  const dim = capOf(device, spec.dimCapabilityId);
  const onoff = capOf(device, spec.onoffCapabilityId);
  view.level = percentOf(dim);
  const on = spec.onoffCapabilityId ? onoff?.value === true : (view.level ?? 0) > 0;
  view.state = on ? 'on' : 'off';
  const dimText = formatValue(dim, 'tile', t);
  view.stateText = !on ? t('tile.off') : isNone(dimText, t) ? t('tile.on') : t('tile.join', { a: t('tile.on'), b: joinValue(dimText) });
  view.tap = 'toggle';
}

function toggle(spec: Extract<DeviceTileSpec, { kind: 'switch' }>, device: Device, view: TileView, t: Translate): void {
  const on = capOf(device, spec.onoffCapabilityId)?.value === true;
  view.state = on ? 'on' : 'off';
  const detail = formatValue(capOf(device, spec.detailCapabilityId), 'tile', t);
  view.stateText = !on ? t('tile.off') : isNone(detail, t) ? t('tile.on') : t('tile.join', { a: t('tile.on'), b: joinValue(detail) });
  view.tap = 'toggle';
}

function tank(spec: Extract<DeviceTileSpec, { kind: 'tank' }>, device: Device, view: TileView, t: Translate): void {
  const volume = capOf(device, spec.volumeCapabilityId);
  const capacity = capOf(device, spec.capacityCapabilityId);
  const v = finite(volume?.value);
  const c = finite(capacity?.value);
  view.level = tankPercent(capOf(device, spec.levelCapabilityId), volume, capacity);
  view.value = view.level === null ? { text: t('value.none'), unit: '' } : { text: String(view.level), unit: '%' };
  if (v !== null && c !== null) view.subText = t('tank.of', { volume: formatValue(volume, 'tile', t).text, capacity: formatValue(capacity, 'tile', t).text });
  else if (v !== null) view.subText = joinValue(formatValue(volume, 'tile', t));
}

function multi(spec: Extract<DeviceTileSpec, { kind: 'multi' }>, device: Device, view: TileView, t: Translate): void {
  // the status: the first readable capability of the device that is a choice list or text
  const status = device.capabilityOrder.map((id) => device.capabilities[id]).find((c) => c !== undefined && c.getable && (c.type === 'enum' || c.type === 'string'));
  const statusText = formatValue(status, 'tile', t);
  view.stateText = status && !isNone(statusText, t) ? joinValue(statusText) : '';
  view.cells = spec.capabilityIds.map((id) => {
    const cap = capOf(device, id);
    return { value: formatValue(cap, 'tile', t), label: cap?.title ?? '' };
  });
}

function generic(spec: Extract<DeviceTileSpec, { kind: 'generic' }>, device: Device, view: TileView, t: Translate): void {
  const cap = capOf(device, spec.capabilityId);
  if (!cap) return;
  const text = formatValue(cap, 'tile', t);
  view.stateText = isNone(text, t) && cap.value === null ? '' : joinValue(text);
  if (cap.value === true && (cap.baseId.startsWith('alarm_') || cap.baseId === 'presence')) {
    const kind = alarmKind(cap.baseId);
    view.state = kind === 'danger' ? 'danger' : kind === 'activity' ? 'on' : 'neutral';
  }
}

/** "20,5°": degrees as they are said, with one decimal at most. */
export const degrees = (value: number, t: Translate): string => `${new Intl.NumberFormat(t.locale, { maximumFractionDigits: 1 }).format(value)}°`;

function climate(device: Device, view: TileView, t: Translate): void {
  const found = climateOf(device);
  if (!found) return;
  const { off, active, target, measure } = climateState(found);
  const now = measure === null ? '' : degrees(measure, t);
  view.state = off === true ? 'off' : active ? 'on' : 'neutral';
  view.stateText = off === true ? (now ? t('tile.join', { a: t('tile.off'), b: now }) : t('tile.off'))
    : target === null ? now
      : now ? t('climate.toward', { now, target: degrees(target, t) }) : t('climate.target', { target: degrees(target, t) });
}

function cover(device: Device, view: TileView, t: Translate): void {
  const found = coverOf(device);
  if (!found) return;
  const { part, moving } = coverState(found);
  const { awning } = found;
  const percent = part === null ? null : partly(part);
  view.state = percent === null ? 'neutral' : percent > 0 || moving ? 'on' : 'off';
  view.level = percent;
  view.stateText = moving === 'up' ? t(awning ? 'awning.goesIn' : 'cover.opening')
    : moving === 'down' ? t(awning ? 'awning.goesOut' : 'cover.closing')
      : coverText(part, awning, t);
}

function media(device: Device, view: TileView, t: Translate): void {
  const found = mediaOf(device);
  if (!found) return;
  const { on, playing, title, volume, muted } = mediaState(found);
  const loud = muted === true ? t('media.muted') : volume === null ? '' : t('media.volume', { n: Math.round(volume * 100) });
  view.level = volume === null ? null : Math.round(volume * 100);
  if (playing === true) {
    view.state = 'on';
    view.stateText = title ? t('media.playsTitle', { title }) : t('media.plays');
  } else if (found.playing?.value === false && (on !== false || found.onoff === null || !found.onoff.getable)) {
    view.stateText = t('media.paused');
  } else if (on !== null) {
    view.state = on ? 'on' : 'off';
    view.stateText = !on ? t('tile.off') : loud ? t('tile.join', { a: t('tile.on'), b: loud }) : t('tile.on');
  } else if (loud) {
    view.stateText = loud.charAt(0).toLocaleUpperCase(t.locale) + loud.slice(1);
  }
}

/** What a lock, a door or an alarm was told and did not answer yet. */
export type Busy = { capabilityId: string; value: CapabilityValue } | null;

const GUARD_TEXT: Record<GuardState, MessageKey> = {
  locked: 'guard.locked', unlocked: 'guard.unlocked', closed: 'cover.closed', open: 'cover.open',
  armed: 'guard.armed', partially_armed: 'guard.partly', disarmed: 'guard.disarmed',
};
const SAFE: readonly (GuardState | null)[] = ['locked', 'closed', 'disarmed'];

/** "Ontgrendelt…" */
function busyText(kind: 'lock' | 'door' | 'alarm', capabilityId: string, busy: NonNullable<Busy>, t: Translate): string {
  if (busy.capabilityId !== capabilityId || kind === 'alarm' || typeof busy.value !== 'boolean') return t('guard.busy');
  if (kind === 'lock') return t(busy.value ? 'guard.locking' : 'guard.unlocking');
  return t(busy.value ? 'cover.closing' : 'cover.opening');
}

/** What a lock, a door or an alarm says: what it was told, until it answers; otherwise where it is. */
export function guardText(device: Device, t: Translate, busy: Busy): string {
  const found = guardOf(device);
  if (!found) return '';
  const said = guardState(found);
  return busy ? busyText(found.kind, found.cap.id, busy, t) : said === null ? t('cover.unknown') : t(GUARD_TEXT[said]);
}

function guard(device: Device, view: TileView, t: Translate, busy: Busy): void {
  const found = guardOf(device);
  if (!found) return;
  const said = guardState(found);
  view.state = said === null ? 'neutral' : SAFE.includes(said) ? 'off' : 'on';
  view.stateText = guardText(device, t, busy);
}

/** The alarm a device raises that is danger; an empty battery is none. */
export const dangerOf = (device: Device): Capability | undefined => dangerAlarms(device).find((cap) => cap.baseId !== 'alarm_battery');

/** Danger is red, with its own name; what a lock or a door says of itself stays in front of it. */
function alarmed(spec: DeviceTileSpec, device: Device, view: TileView, t: Translate): void {
  const alarm = dangerOf(device);
  if (!alarm || !HOUSE_KINDS.some((kind) => kind === spec.kind)) return;
  const guard = spec.kind === 'guard' ? guardOf(device) : null;
  const known = guard === null || guardState(guard) !== null;
  const own = known ? view.stateText : '';
  const [a, b] = guard !== null && guard.kind !== 'alarm' ? [own, alarm.title] : [alarm.title, own];
  view.state = 'danger';
  view.stateText = a && b ? t('tile.join', { a, b }) : a || b;
}

function ariaLabel(view: TileView, t: Translate): string {
  const lowBatteryText = t('tile.lowBattery');
  const parts: string[] = [];
  if (view.value) parts.push([view.subText, joinValue(view.value)].filter(Boolean).join(' '));
  if (view.stateText) parts.push(view.stateText);
  for (const cell of view.cells) parts.push([cell.label, joinValue(cell.value)].filter(Boolean).join(' '));
  if (view.warn && !parts.includes(lowBatteryText)) parts.push(lowBatteryText);
  return [view.name, ...parts].join(', ');
}

/**
 * What a device tile shows: name, icon, state, values and what a tap does. Never throws: a device or
 * capability that is missing gives a dash or an empty line, a vanished device an unavailable tile.
 */
export function tileView(spec: DeviceTileSpec, device: Device | undefined, t: Translate, busy: Busy = null): TileView {
  if (!device) {
    const view = base(t('tile.gone'), 'link_off');
    view.state = 'unavailable';
    return view;
  }
  // the owner's own name and icon go first; an icon the library does not have is drawn as the app's own
  const icon = spec.icon && isLibraryIcon(spec.icon) ? spec.icon : iconFor(spec, device);
  const view = base(spec.label?.trim() || device.name.trim() || t('tile.unnamed'), icon);
  switch (spec.kind) {
    case 'light': light(spec, device, view, t); break;
    case 'switch': toggle(spec, device, view, t); break;
    case 'sensor': {
      const cap = capOf(device, spec.capabilityId);
      view.value = formatValue(cap, 'tile', t);
      view.subText = spec.showCapabilityTitle && cap ? cap.title : '';
      break;
    }
    case 'tank': tank(spec, device, view, t); break;
    case 'multi': multi(spec, device, view, t); break;
    case 'button': view.stateText = t('tile.press'); view.tap = 'press'; break;
    case 'generic': generic(spec, device, view, t); break;
    case 'climate': climate(device, view, t); break;
    case 'cover': cover(device, view, t); break;
    case 'media': media(device, view, t); break;
    case 'guard': guard(device, view, t, busy); break;
  }
  alarmed(spec, device, view, t);
  view.warn = hasLowBattery(device);
  if (view.warn && !view.stateText && !view.subText) view.stateText = t('tile.lowBattery');
  if (!device.available) {
    view.state = 'unavailable';
    view.stateText = device.unavailableMessage?.trim() || t('tile.unavailable');
    view.icon = 'link_off';
    view.tap = 'open';
  }
  view.ariaLabel = view.state === 'unavailable' ? `${view.name}, ${view.stateText}` : ariaLabel(view, t);
  return view;
}

/** What a flow button shows. */
export function flowView(_spec: FlowTileSpec, flow: Flow | undefined, t: Translate): { name: string; ariaLabel: string } {
  const name = !flow ? t('flows.gone') : flow.name.trim() || t('flows.unnamed');
  return { name, ariaLabel: name };
}

