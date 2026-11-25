import { coverOf, coverState } from '../../controls/cover';
import { guardOf, guardState } from '../../controls/guard';
import { mediaOf, mediaState } from '../../controls/media';
import { isDeviceTile, SECTION_ORDER, type Section, type SectionKind, type SectionLayoutKind } from '../../dashboard/types';
import { roomTemperature } from '../../rooms/rooms';
import type { Device } from '../../homey/types';
import type { MessageKey, Translate } from '../../i18n/index';
import type { IconName } from '../icons/icons';
import { isLibraryIcon } from '../icons/library';
import { degrees, tileView } from './tile-view';

const LEFT: readonly SectionLayoutKind[] = ['lights', 'switches'];
/** A kind of section the app puts in the left column. */
export const isLeftKind = (kind: SectionLayoutKind): boolean => LEFT.includes(kind);
const order = (s: Section) => SECTION_ORDER.indexOf(s.kind as SectionKind);

/** So many tiles stand beside each other in the two columns. */
const ACROSS = { left: 4, right: 2 } as const;
type Side = keyof typeof ACROSS;
/** In rows of tiles: the head of a section, a hero, and a row of flows, which are lower. */
const [HEAD_ROWS, HERO_ROWS, FLOW_ROW] = [0.7, 2.2, 0.6];

/** About how high a section is in a column, in rows of tiles. */
function heightOf(section: Section, side: Side): number {
  const flows = section.tiles.filter((tile) => tile.kind === 'flow').length;
  const places = section.tiles.reduce((sum, tile) => sum + (tile.kind === 'flow' ? 0 : tile.size === 'wide' ? 2 : 1), 0);
  return HEAD_ROWS + Math.ceil(places / ACROSS[side]) + Math.ceil(flows / 2) * FLOW_ROW;
}

/** Puts sections one by one in the column that is the shortest by then. */
function balance(sections: readonly Section[], columns: Record<Side, Section[]>, hasHero: boolean): void {
  const high = { left: hasHero ? HERO_ROWS : 0, right: 0 };
  for (const side of ['left', 'right'] as const) for (const section of columns[side]) high[side] += heightOf(section, side);
  for (const section of sections) {
    const side = high.left <= high.right ? 'left' : 'right';
    columns[side].push(section);
    high[side] += heightOf(section, side);
  }
}

/** These go where there is room: in a house the right column is long already. */
const ANYWHERE: readonly SectionLayoutKind[] = ['covers', 'media'];

/**
 * The two columns: hero, Verlichting and Stekkers left; the rest right, and rooms each in the shortest. When one side would be
 * empty, every section goes into one column in the fixed order.
 */
export function splitColumns(sections: Section[], hasHero: boolean): { left: Section[]; right: Section[]; single: boolean } {
  const rooms = sections.some((section) => section.zone !== undefined);
  const sorted = rooms ? sections : [...sections].sort((a, b) => order(a) - order(b));
  const columns: Record<Side, Section[]> = rooms ? { left: [], right: [] }
    : { left: sorted.filter((s) => isLeftKind(s.kind)), right: sorted.filter((s) => !isLeftKind(s.kind) && !ANYWHERE.includes(s.kind)) };
  balance(rooms ? sorted : sorted.filter((s) => ANYWHERE.includes(s.kind)), columns, hasHero);
  const { left } = columns;
  const right = rooms ? columns.right : columns.right.sort((a, b) => order(a) - order(b));
  const leftEmpty = !hasHero && left.length === 0;
  if (leftEmpty || right.length === 0) return { left: sorted, right: [], single: true };
  return { left, right, single: false };
}

/** True for a section with a lamp or switch in it: it counts what is on. */
export const countsOn = (section: Section): boolean => section.tiles.some((spec) => spec.kind === 'light' || spec.kind === 'switch');

/** "2 open · 1 speelt": what is open, plays or is unlocked; nothing when that is nothing. */
export function houseCount(devices: readonly (Device | undefined)[], t: Translate): string {
  const n = { unlocked: 0, open: 0, playing: 0 };
  for (const device of devices) {
    if (!device?.available) continue;
    const guard = guardOf(device);
    const said = guard && guardState(guard);
    if (said === 'unlocked') n.unlocked += 1;
    else if (said === 'open') n.open += 1;
    else if (!guard) {
      const cover = coverOf(device);
      const media = cover ? null : mediaOf(device);
      if (cover && !cover.awning && (coverState(cover).part ?? 0) > 0) n.open += 1;
      if (media && mediaState(media).playing === true) n.playing += 1;
    }
  }
  return [n.unlocked && t('count.unlocked', { n: n.unlocked }), n.open && t('count.open', { n: n.open }), n.playing && t('count.playing', { n: n.playing })]
    .filter((text): text is string => typeof text === 'string').reduce((a, b) => (a === '' ? b : t('tile.join', { a, b })), '');
}

const HOUSE: readonly string[] = ['cover', 'media', 'guard'];

/** Whether the head of a section says something that changes with its devices. */
export const countsSomething = (section: Section): boolean => section.zone !== undefined || countsOn(section) || section.tiles.some((spec) => HOUSE.includes(spec.kind));

/**
 * "3 aan" or "Alles uit" for a section with a lamp or switch in it, "2 open" for one with curtains; nothing for other
 * sections. That of a room says the temperature there, when something measures it.
 */
export function sectionCount(section: Section, getDevice: (id: string) => Device | undefined, t: Translate, inRoom: readonly Device[] = []): string {
  const temperature = section.zone === undefined ? null : roomTemperature(inRoom);
  if (temperature) return degrees(temperature.value, t);
  if (!countsOn(section)) return houseCount(section.tiles.flatMap((spec) => (HOUSE.includes(spec.kind) && isDeviceTile(spec) ? [getDevice(spec.deviceId)] : [])), t);
  const on = section.tiles.filter((spec) => (spec.kind === 'light' || spec.kind === 'switch') && isDeviceTile(spec) && tileView(spec, getDevice(spec.deviceId), t).state === 'on').length;
  return on === 0 ? t('count.allOff') : t('count.on', { n: on });
}

const SECTION_ICONS: Record<SectionLayoutKind, IconName> = {
  lights: 'lightbulb', switches: 'power', climate: 'thermostat', covers: 'blinds', media: 'speaker', water: 'water_drop', security: 'shield', other: 'category', flows: 'play_circle', own: 'view_agenda',
};

export function sectionIcon(kind: SectionLayoutKind): IconName {
  return SECTION_ICONS[kind];
}

/** The title of a section: the owner's own name, otherwise that of the app in the language of the app. */
export function sectionTitle(section: Section, t: Translate): string {
  return section.name ?? t(section.titleKey as MessageKey);
}

/** The icon of a section: the owner's own when the library has it, otherwise that of its kind. */
export function shownSectionIcon(section: Section): IconName {
  return section.icon && isLibraryIcon(section.icon) ? section.icon : sectionIcon(section.kind);
}
