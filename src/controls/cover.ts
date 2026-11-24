import type { Capability, Device } from '../homey/types';
import { find, fraction, words, yesNo } from './find';

/** An awning is out where a curtain is closed. */
export interface Cover { set: Capability | null; state: Capability | null; closed: Capability | null; tilt: Capability | null; awning: boolean }

export function coverOf(device: Device): Cover | null {
  // what those can be told goes another way
  if (device.deviceClass === 'garagedoor' || device.deviceClass === 'lock') return null;
  const set = find(device, 'windowcoverings_set', { setable: true, type: 'number' }) ?? null;
  const state = find(device, 'windowcoverings_state', { setable: true, type: 'enum' }) ?? null;
  const closed = find(device, 'windowcoverings_closed', { setable: true, type: 'boolean' }) ?? null;
  if (!set && !state && !closed) return null;
  return { set, state, closed, tilt: find(device, 'windowcoverings_tilt_set', { setable: true, type: 'number' }) ?? null, awning: device.deviceClass === 'sunshade' };
}

/** After so long without a report it has arrived, whatever it was told last. */
export const MOVING_MS = 60_000;

/** When it has arrived at the latest, as far as the hub tells the time of what it reports. */
export function coverRestsAt({ set, state }: Cover): number | null {
  const times = [set, state].map((cap) => Date.parse(cap?.lastUpdated ?? '')).filter((time) => !Number.isNaN(time));
  return times.length > 0 ? Math.max(...times) + MOVING_MS : null;
}

/** `part`: how far open, 0 to 1 (an awning: how far out); null when it does not tell. */
export interface CoverState { part: number | null; moving: 'up' | 'down' | null }

export function coverState(cover: Cover, now = Date.now()): CoverState {
  const { set, state, closed, awning } = cover;
  const said = words(state);
  const shut = yesNo(closed);
  const open = fraction(set) ?? (shut === null ? null : shut ? 0 : 1) ?? (said === 'up' ? 1 : said === 'down' ? 0 : null);
  // an app often keeps the last thing it was told: it only moves while it is not there yet, as far as that is known
  const goes = fraction(set);
  const arrived = now >= (coverRestsAt(cover) ?? Number.POSITIVE_INFINITY);
  const moving = goes === null || arrived ? null : said === 'up' && goes < 1 ? 'up' : said === 'down' && goes > 0 ? 'down' : null;
  const part = open === null ? null : awning ? 1 - open : open;
  return { part: part === null ? null : Math.round(part * 1000) / 1000, moving };
}

export interface CoverCommand { capabilityId: string; value: string | number | boolean }

/** Up, down, and standing still when it can be told that. Without a state of its own it goes all the way. */
export function coverCommands({ set, state, closed }: Cover): { up: CoverCommand; stop: CoverCommand | null; down: CoverCommand } {
  const knows = (id: string): boolean => state !== null && (state.options.length === 0 || state.options.some((option) => option.id === id));
  if (state && ((knows('up') && knows('down')) || (!set && !closed))) {
    const to = (value: string): CoverCommand => ({ capabilityId: state.id, value });
    return { up: to('up'), stop: knows('idle') ? to('idle') : null, down: to('down') };
  }
  if (set) return { up: { capabilityId: set.id, value: set.max ?? 1 }, stop: null, down: { capabilityId: set.id, value: set.min ?? 0 } };
  return { up: { capabilityId: closed!.id, value: false }, stop: null, down: { capabilityId: closed!.id, value: true } };
}
