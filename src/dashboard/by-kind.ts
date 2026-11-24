import type { Device } from '../homey/types';
import { sectionFor, tilesFor } from './classify';
import { SECTION_ORDER, sectionId, type Section, type SectionKind, type TileSpec } from './types';

/** `first`: before what is not. */
export interface Entry { tile: TileSpec; name: string; first?: boolean }

function sortEntries(entries: Entry[], locale: string): TileSpec[] {
  return entries
    .sort((a, b) => Number(b.tile.size === 'wide') - Number(a.tile.size === 'wide') || Number(b.first ?? false) - Number(a.first ?? false) || a.name.localeCompare(b.name, locale))
    .map((e) => e.tile);
}

/** The tiles of some devices, a section per kind; `adapt` changes a tile before it is sorted. */
export function sectionsByKind(devices: readonly Device[], locale: string, adapt: (spec: TileSpec) => TileSpec = (spec) => spec, flows: Entry[] = []): Section[] {
  const bySection = new Map<SectionKind, Entry[]>(flows.length > 0 ? [['flows', flows]] : []);
  for (const device of devices) {
    const kind = sectionFor(device);
    const list = bySection.get(kind) ?? [];
    for (const tile of tilesFor(device)) list.push({ tile: adapt(tile), name: device.name });
    bySection.set(kind, list);
  }
  return SECTION_ORDER.flatMap((kind): Section[] => {
    const entries = bySection.get(kind) ?? [];
    return entries.length > 0 ? [{ id: sectionId('type', kind), kind, titleKey: `section.${kind}`, tiles: sortEntries(entries, locale) }] : [];
  });
}
