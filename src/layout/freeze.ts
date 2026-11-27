import type { Dashboard, Section, TileSpec } from '../dashboard/types';
import { offeredFlows } from '../homey/flows';
import type { HomeySnapshot } from '../homey/types';
import { splitColumns } from '../ui/model/layout';
import { flowRef, heroSectionId, OVERVIEW_ID, type Column, type SectionLayout, type TileLayout } from './types';

const tileOf = (spec: TileSpec): TileLayout => ({ id: spec.id, spec, size: spec.size, label: null, icon: null, source: 'device' });

/** A section of the automatic Overzicht as it is stored, in a column. */
export const sectionOf = (section: Section, column: Column): SectionLayout =>
  ({
    id: section.id, kind: section.kind, column, name: section.name ?? null, icon: section.icon ?? null, tiles: section.tiles.map(tileOf), hero: null,
    ...(section.zone === undefined ? {} : { zone: section.zone }),
  });

/** Every device on the hub and every flow that can be chosen, with its name: what the app knows after freezing or loading a file. */
export function everythingOn(snapshot: HomeySnapshot): { known: string[]; names: Record<string, string> } {
  const entries: [string, string][] = [
    ...Object.values(snapshot.devices).map((device): [string, string] => [device.id, device.name]),
    ...offeredFlows(snapshot).map((flow): [string, string] => [flowRef(flow.id), flow.name]),
  ];
  return { known: entries.map(([ref]) => ref), names: Object.fromEntries(entries) };
}

/** The automatic Overzicht as it is shown now, as an own layout; also what the app knows and the names. */
export function freezeOverview(dashboard: Dashboard, snapshot: HomeySnapshot): { sections: SectionLayout[]; known: string[]; names: Record<string, string> } {
  const { left, right } = splitColumns(dashboard.sections, dashboard.hero !== null);
  const hero: SectionLayout[] = dashboard.hero === null ? []
    : [{ id: heroSectionId(OVERVIEW_ID), kind: 'hero', column: 'left', name: null, icon: null, tiles: [], hero: null }];
  return {
    sections: [...hero, ...left.map((section) => sectionOf(section, 'left')), ...right.map((section) => sectionOf(section, 'right'))],
    ...everythingOn(snapshot),
  };
}
