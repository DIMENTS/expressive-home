import { netSources, pickHero } from '../dashboard/hero';
import { isKnownKind, roomTitleKey, type CapRef, type Dashboard, type HeroSpec, type HeroStat, type Section, type TileSpec } from '../dashboard/types';
import type { HomeySnapshot } from '../homey/types';
import { splitColumns } from '../ui/model/layout';
import { isNet } from './refs';
import { currentSpec, waitsForValue } from './tiles';
import { heroSectionId, type DashboardLayout, type HeroChoice, type SectionLayout, type TileLayout } from './types';

/** What stands in a column: a hero (null when there is nothing to show) or a section with its tiles. */
export type Block = { type: 'hero'; id: string; hero: HeroSpec | null } | { type: 'section'; section: Section };

/** A dashboard as it is drawn: the blocks of its two columns, in order. */
export interface BoardView { id: string; left: Block[]; right: Block[] }

const sectionBlock = (section: Section): Block => ({ type: 'section', section });

/** The automatic dashboard in columns, by the rules of 1B, 6.1; the hero is first on the left. */
export function boardFromDashboard(dashboard: Dashboard, boardId: string): BoardView {
  const { left, right } = splitColumns(dashboard.sections, dashboard.hero !== null);
  const hero: Block[] = dashboard.hero === null ? [] : [{ type: 'hero', id: heroSectionId(boardId), hero: dashboard.hero }];
  return { id: boardId, left: [...hero, ...left.map(sectionBlock)], right: right.map(sectionBlock) };
}

/** A stored tile as it is drawn now, or null when its device, flow or value is gone. */
export function drawnTile(tile: TileLayout, snapshot: HomeySnapshot): TileSpec | null {
  const { spec } = tile;
  if (!isKnownKind(spec.kind)) return null;
  if (spec.kind === 'flow') {
    return snapshot.flows.some((flow) => flow.id === spec.flowId) ? { ...spec, id: tile.id, size: 'single', label: tile.label, icon: tile.icon } : null;
  }
  return currentSpec(tile, snapshot.devices[spec.deviceId]);
}

/** The tiles of a section that are drawn now, with how; the others stay stored and hidden. */
export function drawnTiles(tiles: readonly TileLayout[], snapshot: HomeySnapshot): { tile: TileLayout; spec: TileSpec }[] {
  return tiles.flatMap((tile) => {
    const spec = waitsForValue(tile, tiles, snapshot.devices) ? null : drawnTile(tile, snapshot);
    return spec === null ? [] : [{ tile, spec }];
  });
}

function blockOf(section: SectionLayout, snapshot: HomeySnapshot, locale: string): Block {
  if (section.kind === 'hero') {
    return { type: 'hero', id: section.id, hero: section.hero ? heroFromChoice(section.hero, snapshot, locale) : pickHero(snapshot, locale) };
  }
  const tiles = drawnTiles(section.tiles, snapshot).map(({ spec }) => spec);
  const { zone } = section;
  return sectionBlock({
    id: section.id, kind: section.kind, titleKey: zone === undefined ? `section.${section.kind}` : roomTitleKey(zone), tiles, name: section.name, icon: section.icon,
    ...(zone === undefined ? {} : { zone }),
  });
}

/**
 * An own dashboard: its sections in their columns and order. Tiles of a device, flow or value that is gone are left
 * out; device tiles follow their device; each spec gets the layout tile's id, size, own name and icon. A hero block
 * is null when there is nothing to show.
 */
export function boardFromLayout(board: DashboardLayout, snapshot: HomeySnapshot, locale: string): BoardView {
  const sections = board.sections ?? [];
  const column = (which: SectionLayout['column']): Block[] => sections.filter((s) => s.column === which).map((s) => blockOf(s, snapshot, locale));
  return { id: board.id, left: column('left'), right: column('right') };
}

/**
 * The columns as they are shown: while editing both, so there is a place to drag to; otherwise without a
 * hero that has nothing to show, and in one column when the left one is empty.
 */
export function shownColumns(board: BoardView, editing: boolean): { left: Block[]; right: Block[] } {
  if (editing) return { left: board.left, right: board.right };
  const visible = (blocks: Block[]): Block[] => blocks.filter((block) => block.type === 'section' || block.hero !== null);
  const left = visible(board.left);
  const right = visible(board.right);
  return left.length === 0 ? { left: right, right: [] } : { left, right };
}

const exists = (ref: CapRef, snapshot: HomeySnapshot): boolean => {
  const device = snapshot.devices[ref.deviceId];
  return device !== undefined && Object.hasOwn(device.capabilities, ref.capabilityId);
};

/**
 * An own hero as a HeroSpec. Without its main value it is the automatic hero again; a stat or line that is
 * gone is left out. "Netto laden" always reads what the automatic hero of this hub finds.
 */
export function heroFromChoice(choice: HeroChoice, snapshot: HomeySnapshot, locale: string): HeroSpec | null {
  const automatic = pickHero(snapshot, locale);
  if (!exists(choice.main, snapshot)) return automatic;
  const sources = netSources(automatic);
  const stats = choice.stats.flatMap((stat): HeroStat[] => {
    if (isNet(stat)) return sources ? [{ role: 'net' }] : [];
    if (!exists(stat, snapshot)) return [];
    // what the automatic hero shows keeps its name there (Zon, Verbruik, Walstroom): an own hero begins with it
    const same = automatic?.stats.find((s) => s.role !== 'net' && s.ref.deviceId === stat.deviceId && s.ref.capabilityId === stat.capabilityId);
    return [same ?? { role: 'value', ref: stat }];
  });
  return {
    kind: 'own', deviceIds: [choice.main.deviceId], primary: choice.main, timeToGo: null, stats,
    line: choice.line && exists(choice.line, snapshot) ? choice.line : null,
    name: choice.name,
    net: stats.some((stat) => stat.role === 'net') ? sources : null,
  };
}
