import { capRefs, cleanName, isNet, tileRefs } from './refs';
import { LIMITS, OVERVIEW_ID, type Column, type DashboardLayout, type HeroChoice, type HubLayout, type SectionLayout, type TileLayout } from './types';

export type LayoutEdit =
  | { type: 'move-tile'; dashboardId: string; tileId: string; toSectionId: string; index: number }
  | { type: 'remove-tile'; dashboardId: string; tileId: string }
  | { type: 'add-tiles'; dashboardId: string; sectionId: string; tiles: TileLayout[] }
  | { type: 'set-tile'; dashboardId: string; tileId: string; patch: Partial<Pick<TileLayout, 'spec' | 'size' | 'label' | 'icon'>> }
  /** `index` counts within the section's column, here and in move-section. */
  | { type: 'add-section'; dashboardId: string; section: SectionLayout; index: number }
  | { type: 'move-section'; dashboardId: string; sectionId: string; column: Column; index: number }
  | { type: 'set-section'; dashboardId: string; sectionId: string; name: string | null; icon: string | null }
  | { type: 'remove-section'; dashboardId: string; sectionId: string }
  | { type: 'set-hero'; dashboardId: string; hero: HeroChoice | null }
  | { type: 'add-dashboard'; dashboard: DashboardLayout }
  | { type: 'set-dashboard'; dashboardId: string; name: string | null; icon: string | null }
  | { type: 'move-dashboard'; dashboardId: string; index: number }
  | { type: 'remove-dashboard'; dashboardId: string }
  | { type: 'know'; refs: string[] }
  | { type: 'forget-gone'; refs: string[] };

const clamp = (index: number, length: number): number => Math.min(Math.max(0, Math.trunc(index) || 0), length);

function insert<T>(list: readonly T[], item: T, index: number): T[] {
  const at = clamp(index, list.length);
  return [...list.slice(0, at), item, ...list.slice(at)];
}

/** Puts a section at `index` of its column; the sections of the other column keep their places. */
function insertSection(sections: readonly SectionLayout[], section: SectionLayout, index: number): SectionLayout[] {
  const column = sections.filter((s) => s.column === section.column);
  const before = column[clamp(index, column.length)];
  return before === undefined ? [...sections, section] : insert(sections, section, sections.indexOf(before));
}

const tilesOf = (sections: readonly SectionLayout[]): TileLayout[] => sections.flatMap((s) => s.tiles);

/** The sections of one own dashboard after `change`; an automatic or unknown dashboard, or null, leaves the layout as it is. */
function withSections(layout: HubLayout, dashboardId: string, change: (sections: SectionLayout[]) => SectionLayout[] | null): HubLayout {
  const dashboard = layout.dashboards.find((d) => d.id === dashboardId);
  const sections = dashboard?.sections ? change(dashboard.sections) : null;
  if (sections === null) return layout;
  return { ...layout, dashboards: layout.dashboards.map((d) => (d.id === dashboardId ? { ...d, sections } : d)) };
}

/** One section of an own dashboard after `change`. */
const withSection = (layout: HubLayout, dashboardId: string, sectionId: string, change: (section: SectionLayout) => SectionLayout | null): HubLayout =>
  withSections(layout, dashboardId, (sections) => {
    const section = sections.find((s) => s.id === sectionId);
    const next = section ? change(section) : null;
    return next === null ? null : sections.map((s) => (s === section ? next : s));
  });

const cleanHero = (hero: HeroChoice): HeroChoice => ({ ...hero, stats: hero.stats.slice(0, LIMITS.heroStats), name: cleanName(hero.name) });

const cleanSection = (section: SectionLayout): SectionLayout =>
  ({ ...section, name: cleanName(section.name), hero: section.hero && cleanHero(section.hero) });

function moveTile(sections: SectionLayout[], tileId: string, toSectionId: string, index: number): SectionLayout[] | null {
  const tile = tilesOf(sections).find((t) => t.id === tileId);
  const target = sections.find((s) => s.id === toSectionId);
  if (!tile || !target || target.kind === 'hero') return null;
  return sections
    .map((s) => (s.tiles.includes(tile) ? { ...s, tiles: s.tiles.filter((t) => t !== tile) } : s))
    .map((s) => (s.id === toSectionId ? { ...s, tiles: insert(s.tiles, tile, index) } : s));
}

function addTiles(layout: HubLayout, dashboardId: string, sectionId: string, tiles: TileLayout[]): HubLayout {
  const used = new Set(layout.dashboards.flatMap((d) => tilesOf(d.sections ?? [])).map((t) => t.id));
  const fresh = tiles.every((tile) => !used.has(tile.id) && used.add(tile.id));
  if (!fresh) return layout;
  return withSections(layout, dashboardId, (sections) => {
    const target = sections.find((s) => s.id === sectionId);
    if (!target || target.kind === 'hero' || tilesOf(sections).length + tiles.length > LIMITS.tilesPerDashboard) return null;
    const named = tiles.map((tile) => ({ ...tile, label: cleanName(tile.label) }));
    return sections.map((s) => (s === target ? { ...s, tiles: [...s.tiles, ...named] } : s));
  });
}

function addSection(layout: HubLayout, dashboardId: string, section: SectionLayout, index: number): HubLayout {
  if (layout.dashboards.some((d) => (d.sections ?? []).some((s) => s.id === section.id))) return layout;
  return withSections(layout, dashboardId, (sections) => {
    if (sections.length >= LIMITS.sectionsPerDashboard) return null;
    if (section.kind === 'hero' && sections.some((s) => s.kind === 'hero')) return null;
    return insertSection(sections, cleanSection(section), index);
  });
}

/** Everything that stands on a gone device, flow or value leaves the layout, and so do their names. */
function forgetGone(layout: HubLayout, refs: string[]): HubLayout {
  const gone = new Set(refs);
  const isGone = (list: string[]): boolean => list.some((ref) => gone.has(ref));
  const heroAfter = (hero: HeroChoice): HeroChoice | null => (isGone(capRefs(hero.main)) ? null : {
    ...hero,
    line: hero.line && isGone(capRefs(hero.line)) ? null : hero.line,
    stats: hero.stats.filter((stat) => isNet(stat) || !isGone(capRefs(stat))),
  });
  return {
    ...layout,
    dashboards: layout.dashboards.map((d) => ({
      ...d,
      sections: d.sections && d.sections.map((s) => ({ ...s, tiles: s.tiles.filter((tile) => !isGone(tileRefs(tile))), hero: s.hero && heroAfter(s.hero) })),
    })),
    names: Object.fromEntries(Object.entries(layout.names).filter(([ref]) => !gone.has(ref))),
  };
}

function apply(layout: HubLayout, edit: LayoutEdit): HubLayout {
  switch (edit.type) {
    case 'move-tile': return withSections(layout, edit.dashboardId, (sections) => moveTile(sections, edit.tileId, edit.toSectionId, edit.index));
    case 'remove-tile': return withSections(layout, edit.dashboardId, (sections) => sections.map((s) => ({ ...s, tiles: s.tiles.filter((t) => t.id !== edit.tileId) })));
    case 'add-tiles': return addTiles(layout, edit.dashboardId, edit.sectionId, edit.tiles);
    case 'set-tile': {
      const patch = { ...edit.patch, ...(edit.patch.label === undefined ? {} : { label: cleanName(edit.patch.label) }) };
      return withSections(layout, edit.dashboardId, (sections) =>
        sections.map((s) => ({ ...s, tiles: s.tiles.map((t) => (t.id === edit.tileId ? { ...t, ...patch } : t)) })));
    }
    case 'add-section': return addSection(layout, edit.dashboardId, edit.section, edit.index);
    case 'move-section': return withSections(layout, edit.dashboardId, (sections) => {
      const section = sections.find((s) => s.id === edit.sectionId);
      return section ? insertSection(sections.filter((s) => s !== section), { ...section, column: edit.column }, edit.index) : null;
    });
    case 'set-section': return withSection(layout, edit.dashboardId, edit.sectionId, (section) => ({ ...section, name: cleanName(edit.name), icon: edit.icon }));
    case 'remove-section': return withSections(layout, edit.dashboardId, (sections) => sections.filter((s) => s.id !== edit.sectionId));
    case 'set-hero': return withSections(layout, edit.dashboardId, (sections) =>
      sections.map((s) => (s.kind === 'hero' ? { ...s, hero: edit.hero && cleanHero(edit.hero) } : s)));
    case 'add-dashboard': {
      if (layout.dashboards.length >= LIMITS.dashboards || layout.dashboards.some((d) => d.id === edit.dashboard.id)) return layout;
      return { ...layout, dashboards: [...layout.dashboards, { ...edit.dashboard, name: cleanName(edit.dashboard.name), sections: edit.dashboard.sections ?? [] }] };
    }
    case 'set-dashboard': return { ...layout, dashboards: layout.dashboards.map((d) => (d.id === edit.dashboardId ? { ...d, name: cleanName(edit.name), icon: edit.icon } : d)) };
    case 'move-dashboard': {
      const dashboard = layout.dashboards.find((d) => d.id === edit.dashboardId);
      return dashboard ? { ...layout, dashboards: insert(layout.dashboards.filter((d) => d !== dashboard), dashboard, edit.index) } : layout;
    }
    case 'remove-dashboard': return edit.dashboardId === OVERVIEW_ID ? layout : { ...layout, dashboards: layout.dashboards.filter((d) => d.id !== edit.dashboardId) };
    case 'know': return { ...layout, known: [...new Set([...layout.known, ...edit.refs])] };
    case 'forget-gone': return forgetGone(layout, edit.refs);
  }
}

/**
 * One edit, without side effects. An edit that does not apply (an unknown id, over a limit, the sections
 * of an automatic dashboard) or changes nothing gives the same object back, so nothing is saved or undone for it.
 */
export function applyEdit(layout: HubLayout, edit: LayoutEdit): HubLayout {
  const next = apply(layout, edit);
  return next === layout || JSON.stringify(next) === JSON.stringify(layout) ? layout : next;
}

const ID_LENGTH = 8;

/** A short id, unique enough within one hub's layout. From getRandomValues: randomUUID only exists on a secure origin. */
export function newLayoutId(prefix: 't' | 's' | 'd'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  return `${prefix}-${[...bytes].map((byte) => (byte % 36).toString(36)).join('')}`;
}
