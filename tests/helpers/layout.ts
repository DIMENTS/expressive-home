import type { TileSpec } from '../../src/dashboard/types';
import { OVERVIEW_ID, type Column, type DashboardLayout, type HeroChoice, type HubLayout, type SectionLayout, type TileLayout } from '../../src/layout/types';

/** A stored tile for a spec, as added to a layout. */
export function tileLayout(spec: TileSpec, partial: Partial<TileLayout> = {}): TileLayout {
  return { id: spec.id, spec, size: spec.size, label: null, icon: null, source: 'device', ...partial };
}

/** A sensor tile for one value of a device, under an id of its own. */
export function sensorTile(id: string, deviceId: string, capabilityId = 'measure_temperature', partial: Partial<TileLayout> = {}): TileLayout {
  return tileLayout({ kind: 'sensor', id, deviceId, size: 'single', capabilityId, showCapabilityTitle: false }, partial);
}

export function flowTile(id: string, flowId: string): TileLayout {
  return tileLayout({ kind: 'flow', id, flowId, flowKind: 'flow', size: 'single' });
}

export function ownSection(id: string, tiles: TileLayout[] = [], partial: Partial<SectionLayout> = {}): SectionLayout {
  return { id, kind: 'own', column: 'left', name: id, icon: null, tiles, hero: null, ...partial };
}

export function heroSection(id = 'hero:main', hero: HeroChoice | null = null, column: Column = 'left'): SectionLayout {
  return { id, kind: 'hero', column, name: null, icon: null, tiles: [], hero };
}

export function board(id: string, sections: SectionLayout[] | null, partial: Partial<DashboardLayout> = {}): DashboardLayout {
  return { id, name: null, icon: null, sections, ...partial };
}

export function hubLayout(dashboards: DashboardLayout[], partial: Partial<HubLayout> = {}): HubLayout {
  return { dashboards, known: [], names: {}, ...partial };
}

export const overview = (sections: SectionLayout[] | null): DashboardLayout => board(OVERVIEW_ID, sections);

/** The ids of the tiles of a section, in order. */
export function tileIds(layout: HubLayout, dashboardId: string, sectionId: string): string[] {
  return layout.dashboards.find((d) => d.id === dashboardId)!.sections!.find((s) => s.id === sectionId)!.tiles.map((tile) => tile.id);
}

/** The ids of the sections of one column, in order. */
export function column(layout: HubLayout, dashboardId: string, which: Column): string[] {
  return layout.dashboards.find((d) => d.id === dashboardId)!.sections!.filter((s) => s.column === which).map((s) => s.id);
}

/** Freezes a value and everything in it, so a function that changes its input throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
