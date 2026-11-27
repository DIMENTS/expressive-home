import { generateDashboard } from '../dashboard/generate';
import { HERO_SECTION_ID, type Section } from '../dashboard/types';
import type { HomeySnapshot } from '../homey/types';
import { everythingOn, sectionOf } from '../layout/freeze';
import { heroSectionId, OVERVIEW_ID, type SectionLayout, type TileLayout } from '../layout/types';
import { HERO_ROWS, heightOf, type Side } from '../ui/model/layout';
import type { Choices, Extra } from './choices';

/** The Overzicht as an own layout, with what the app then knows. */
export interface Arranged { sections: SectionLayout[]; known: string[]; names: Record<string, string> }

export interface ArrangeOptions {
  locale: string;
  /** The name of the section with the widgets, in the language of the app. */
  today: string;
  newId(prefix: 't' | 's'): string;
}

type Item = { kind: 'hero' } | { kind: 'section'; section: Section };

const idOf = (item: Item): string => (item.kind === 'hero' ? HERO_SECTION_ID : item.section.id);
const rowsOf = (item: Item, side: Side): number => (item.kind === 'hero' ? HERO_ROWS : heightOf(item.section, side));

function widgetTile(widget: Extra, newId: ArrangeOptions['newId']): TileLayout {
  const id = newId('t');
  return { id, spec: { kind: 'widget', id, size: 'wide', widget, settings: {} }, size: 'wide', label: null, icon: null, source: 'device' };
}

/**
 * The Overzicht of the choices of a first start: a section with the widgets of weather and energy on top, then what was
 * chosen first, in the order it was tapped, on the left; the rest one by one in the column that is the shortest by then.
 * Null when nothing of it changes the automatic Overzicht.
 */
export function arrangeOverview(snapshot: HomeySnapshot, choices: Pick<Choices, 'grouping' | 'first' | 'extras'>, options: ArrangeOptions): Arranged | null {
  const dashboard = generateDashboard(snapshot, { grouping: choices.grouping, locale: options.locale });
  const items: Item[] = [...(dashboard.hero ? [{ kind: 'hero' } as const] : []), ...dashboard.sections.map((section) => ({ kind: 'section', section }) as const)];
  const picked = choices.first.flatMap((id) => items.filter((item) => idOf(item) === id));
  if (picked.length === 0 && choices.extras.length === 0) return null;
  const today: SectionLayout[] = choices.extras.length === 0 ? [] : [{
    id: `own:${options.newId('s')}`, kind: 'own', column: 'left', name: options.today, icon: choices.extras.includes('weather') ? 'partly_cloudy_day' : 'bolt',
    tiles: choices.extras.map((extra) => widgetTile(extra, options.newId)), hero: null,
  }];
  // a hero that was not chosen stays high on the left, right after what was: on a phone too, where the columns follow each other
  const hero = items.find((item) => item.kind === 'hero' && !picked.includes(item));
  const left = hero ? [...picked, hero] : [...picked];
  const columns: Record<Side, Item[]> = { left, right: [] };
  const high = { left: left.reduce((sum, item) => sum + rowsOf(item, 'left'), today.length > 0 ? HERO_ROWS : 0), right: 0 };
  for (const item of items.filter((one) => !left.includes(one))) {
    const side: Side = high.left <= high.right ? 'left' : 'right';
    columns[side].push(item);
    high[side] += rowsOf(item, side);
  }
  const stored = (item: Item, side: Side): SectionLayout => (item.kind === 'hero'
    ? { id: heroSectionId(OVERVIEW_ID), kind: 'hero', column: side, name: null, icon: null, tiles: [], hero: null }
    : sectionOf(item.section, side));
  return {
    sections: [...today, ...columns.left.map((item) => stored(item, 'left')), ...columns.right.map((item) => stored(item, 'right'))],
    ...everythingOn(snapshot),
  };
}
