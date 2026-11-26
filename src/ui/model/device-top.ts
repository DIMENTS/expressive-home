import { applianceOf } from '../../controls/appliance';
import { carOf } from '../../controls/car';
import { chargerOf } from '../../controls/charger';
import { climateOf } from '../../controls/climate';
import { fanOf } from '../../controls/fan';
import { vacuumOf, vacuumState } from '../../controls/vacuum';
import { coverOf, coverState, type Cover } from '../../controls/cover';
import { guardOf } from '../../controls/guard';
import { mediaOf, mediaState, type Media } from '../../controls/media';
import type { HouseKind } from '../../dashboard/types';
import type { Capability, Device } from '../../homey/types';
import { timeText } from '../../i18n/format';
import type { Translate } from '../../i18n/index';
import { degrees, tileView, type Busy, type TileView } from './tile-view';

const caps = (device: Device): Capability[] => device.capabilityOrder.map((id) => device.capabilities[id]).filter((c): c is Capability => c !== undefined);

/** Every motor of a cover, and every set of slats. */
export const positionsOf = (device: Device): Capability[] => caps(device).filter((c) => c.baseId === 'windowcoverings_set' && c.setable && c.type === 'number');
export const slatsOf = (device: Device): Capability[] => caps(device).filter((c) => c.baseId === 'windowcoverings_tilt_set' && c.setable && c.type === 'number');

/** The mode of heating or cooling when it can be chosen. */
export function modeOf(device: Device): Capability | null {
  const mode = climateOf(device)?.mode;
  return mode?.setable && mode.options.length > 0 ? mode : null;
}

/** What stands at the top of the window of a device, and so not below it once more. */
export function shownOnTop(device: Device, kind: HouseKind): ReadonlySet<string> {
  const ids = (...shown: (Capability | null | undefined)[]): Set<string> => new Set(shown.flatMap((cap) => (cap ? [cap.id] : [])));
  switch (kind) {
    case 'climate': {
      const climate = climateOf(device);
      return ids(climate?.target, climate?.measure, climate?.humidity, modeOf(device));
    }
    case 'cover': {
      const cover = coverOf(device);
      return ids(cover?.state, cover?.closed, ...positionsOf(device), ...slatsOf(device));
    }
    case 'media': {
      const media = mediaOf(device);
      if (!media) return new Set();
      const { onoff, ...rest } = media;
      return ids(...Object.values(rest) as (Capability | null)[], media.playing ? null : onoff);
    }
    case 'guard': return ids(guardOf(device)?.cap);
    case 'fan': { const fan = fanOf(device); return ids(fan?.onoff, fan?.speed, fan?.oscillating, fan?.mode); }
    case 'vacuum': { const vacuum = vacuumOf(device); return ids(vacuum?.state, vacuum?.onoff, vacuum?.docked, vacuum?.battery, vacuum?.job, vacuum ? vacuumState(vacuum).problem : null); }
    case 'appliance': { const appliance = applianceOf(device); return ids(appliance?.operational, appliance?.running, appliance?.progress, appliance?.remaining, appliance?.onoff); }
    case 'charger': { const charger = chargerOf(device); return ids(charger?.charging, charger?.onoff, charger?.state, charger?.power, charger?.session, charger?.target); }
    case 'car': { const car = carOf(device); return ids(car?.battery, car?.range, car?.charging, car?.lock); }
  }
}

/** The line under the name at the top of the window. */
export function topLine(device: Device, kind: HouseKind, view: TileView, t: Translate): string {
  // what these say stands large under it
  if (kind === 'guard' || kind === 'fan' || kind === 'vacuum' || kind === 'appliance' || kind === 'charger' || kind === 'car') return '';
  if (kind === 'climate') {
    const measure = climateOf(device)?.measure;
    const now = measure && typeof measure.value === 'number' ? degrees(measure.value, t) : null;
    return now ? t('climate.now', { now }) : '';
  }
  const media = kind === 'media' ? mediaOf(device) : null;
  return media && mediaState(media).playing ? t('media.plays') : view.stateText;
}

export const houseTile = (device: Device, kind: HouseKind, t: Translate, busy: Busy): TileView =>
  tileView({ kind, id: `${device.id}:window`, deviceId: device.id, size: 'single' }, device, t, busy);

/** How far the window is covered, 0 to 1: closed, or an awning that is out. Null when nothing is drawn. */
export function shutOf(cover: Cover): number | null {
  if (!cover.set && !cover.closed) return null;
  const { part } = coverState(cover);
  return part === null ? 0 : cover.awning ? part : Math.round((1 - part) * 1000) / 1000;
}

/** Longer than this it is counted in thousandths of a second. */
const LONGEST = 36_000;

const clock = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  const two = (n: number): string => String(n).padStart(2, '0');
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60];
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
};

/** Where the song is, when the app tells. */
export function songPlace({ position, duration }: Media): { part: number; at: string; of: string } | null {
  if (typeof position?.value !== 'number' || typeof duration?.value !== 'number' || !(duration.value > 0) || !(position.value >= 0)) return null;
  const scale = duration.value > LONGEST ? 1000 : 1;
  const [at, of] = [position.value / scale, duration.value / scale];
  return { part: Math.min(1, at / of), at: clock(Math.min(at, of)), of: clock(of) };
}

const REPEATS: readonly string[] = ['none', 'track', 'playlist'];

/** What repeating becomes with the next tap. */
export function nextRepeat(cap: Capability): string {
  const options = cap.options.length > 0 ? cap.options.map((option) => option.id) : REPEATS;
  return options[(options.indexOf(String(cap.value)) + 1) % options.length]!;
}

/** "Laatst veranderd om 08:12"; empty when nobody knows. */
export function changedText(cap: Capability, now: Date, t: Translate): string {
  const at = cap.lastUpdated ? new Date(cap.lastUpdated) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  const time = timeText(at, t);
  if (at.toDateString() === now.toDateString()) return t('panel.changed.today', { time });
  const day = new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'long', ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) }).format(at);
  return t('panel.changed.day', { day, time });
}
