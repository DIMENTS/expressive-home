import { netSources } from '../../dashboard/hero';
import type { CapRef, HeroSpec } from '../../dashboard/types';
import type { Capability, Device } from '../../homey/types';
import { formatDuration, formatValue, joinValue, showsAsZero, type Formatted } from '../../i18n/format';
import type { Translate } from '../../i18n/index';
import { findCapability } from '../../recognition/recognize';
import type { IconName } from '../icons/icons';
import { iconForCapability } from './icon-for';

/** What the hero shows: one large number, a line, the wave for a battery or an own percentage, and up to four stats. */
export interface HeroView {
  kind: HeroSpec['kind']; title: string; icon: IconName; number: Formatted; line: string;
  /** 0–100: a battery, or an own hero whose number is a percentage. */
  progress: number | null;
  primaryDeviceId: string;
  stats: { role: 'solar' | 'consumption' | 'shore' | 'net' | 'value'; icon: IconName; value: string; label: string; deviceId: string | null }[];
}

/** A label with a word of at least so many letters: too long for a quarter of a phone. */
export const hasLongWord = (label: string, letters = 10): boolean => label.split(/\s+/).some((word) => word.length >= letters);

/** A value that is a word, such as the source of the shore power: it stands smaller. A number is not, however long. */
export const isWords =(value: string): boolean => value.length > 4 && !/\d/.test(value);

const MINUS = '−';

const TITLES = { battery: 'hero.battery', solar: 'hero.solar', consumption: 'hero.consumption' } as const;
const ICONS = { battery: 'battery_5_bar', solar: 'solar_power', consumption: 'bolt' } as const;

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Minutes from the hub's unit: minutes by default, hours and seconds converted. */
function minutesOf(cap: Capability | undefined): number | null {
  const value = finite(cap?.value);
  if (value === null || !cap) return null;
  if (cap.units === 'h') return value * 60;
  if (cap.units === 's') return value / 60;
  return value;
}

/** The hero of the dashboard as text, without a screen. Never throws: a missing device or value is left out. */
export function heroView(hero: HeroSpec, getDevice: (id: string) => Device | undefined, t: Translate): HeroView {
  const capOf = (ref: CapRef): Capability | undefined => getDevice(ref.deviceId)?.capabilities[ref.capabilityId];
  const primary = capOf(hero.primary);
  const primaryDevice = getDevice(hero.primary.deviceId);
  const number = formatValue(primary, 'tile', t);

  const stats: HeroView['stats'] = [];
  const boxes = hero.stats.flatMap((stat) => (stat.role === 'value' ? [stat.ref.deviceId] : []));
  /** A box is named after its device; a value of the device of the big number, or one of more of a device, after itself. */
  const boxLabel = (cap: Capability, device: Device | undefined): string =>
    (device?.id === hero.primary.deviceId || boxes.filter((id) => id === device?.id).length > 1 ? cap.title : device?.name.trim()) || t('tile.unnamed');
  for (const stat of hero.stats) {
    if (stat.role === 'net') {
      const net = netStat(hero.kind === 'own' ? hero.net ?? null : netSources(hero), capOf, t);
      if (net) stats.push(net);
      continue;
    }
    const cap = capOf(stat.ref);
    if (!cap) continue;
    const device = getDevice(stat.ref.deviceId);
    const value = joinValue(formatValue(cap, 'tile', t));
    if (stat.role === 'value') {
      stats.push({ role: 'value', icon: iconForCapability(cap, device), value, label: boxLabel(cap, device), deviceId: stat.ref.deviceId });
      continue;
    }
    if (cap.value === null && hero.kind !== 'own') continue;
    const icon: IconName = stat.role === 'solar' ? 'solar_power' : stat.role === 'consumption' ? 'bolt' : 'power';
    const label = t(stat.role === 'solar' ? 'hero.solar' : stat.role === 'consumption' ? 'hero.consumption' : 'hero.shore');
    stats.push({ role: stat.role, icon, value, label, deviceId: stat.ref.deviceId });
  }

  const own = hero.kind === 'own';
  const wave = hero.kind === 'battery' || (own && number.unit === '%');
  return {
    kind: hero.kind,
    title: hero.kind === 'own' ? hero.name ?? (primaryDevice?.name.trim() || t('tile.unnamed')) : t(TITLES[hero.kind]),
    icon: hero.kind === 'own' ? (primary ? iconForCapability(primary, primaryDevice) : 'category') : ICONS[hero.kind],
    number,
    line: lineOf(hero, getDevice, t),
    progress: wave ? percentOf(primary, own) : null,
    primaryDeviceId: hero.primary.deviceId,
    stats,
  };
}

/** Where the wave ends, 0–100: the value itself or, for a range of 0 to 1 that is shown as a percentage, a hundred times it. */
function percentOf(cap: Capability | undefined, own: boolean): number | null {
  const value = finite(cap?.value);
  if (value === null || !cap) return null;
  const percent = own && cap.min === 0 && cap.max === 1 ? value * 100 : value;
  return Math.round(Math.min(100, Math.max(0, percent)));
}

/** "Nog ongeveer …" for a remaining time; nothing when it is unknown. */
function timeLeft(cap: Capability | undefined, t: Translate): string {
  const minutes = minutesOf(cap);
  return minutes !== null && minutes >= 0 ? t('hero.timeLeft', { duration: formatDuration(minutes, t) }) : '';
}

/** The line under the number. */
function lineOf(hero: HeroSpec, getDevice: (id: string) => Device | undefined, t: Translate): string {
  switch (hero.kind) {
    case 'solar': return t('hero.solarNow');
    case 'consumption': return t('hero.consumptionNow');
    case 'battery': return hero.timeToGo ? timeLeft(getDevice(hero.timeToGo.deviceId)?.capabilities[hero.timeToGo.capabilityId], t) : '';
    case 'own': {
      const device = hero.line ? getDevice(hero.line.deviceId) : undefined;
      const cap = hero.line ? device?.capabilities[hero.line.capabilityId] : undefined;
      if (!device || !cap || cap.value === null) return '';
      return findCapability(device, 'battery.timeToGo')?.id === cap.id ? timeLeft(cap, t) : joinValue(formatValue(cap, 'tile', t));
    }
  }
}

function netStat(refs: { solar: CapRef; consumption: CapRef } | null, capOf: (ref: CapRef) => Capability | undefined, t: Translate): HeroView['stats'][number] | null {
  const solar = refs ? finite(capOf(refs.solar)?.value) : null;
  const consumption = refs ? finite(capOf(refs.consumption)?.value) : null;
  if (solar === null || consumption === null) return null;
  const amountCap: Capability = { id: 'net', baseId: 'net', title: '', type: 'number', getable: true, setable: false, units: 'W', min: null, max: null, step: null, decimals: null, options: [], titleTrue: null, titleFalse: null, value: Math.abs(solar - consumption), lastUpdated: null };
  // The sign follows the rounded amount: 0.2 W either way shows as 0 W, without a sign.
  const net = showsAsZero(amountCap, Math.abs(solar - consumption), 'tile') ? 0 : solar - consumption;
  return {
    role: 'net', icon: net >= 0 ? 'trending_up' : 'trending_down', value: `${net > 0 ? '+' : net < 0 ? MINUS : ''}${joinValue(formatValue(amountCap, 'tile', t))}`,
    label: t(net >= 0 ? 'hero.netCharging' : 'hero.netDischarging'), deviceId: null,
  };
}
