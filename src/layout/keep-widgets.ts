import type { HubLayout, TileLayout } from './types';

/** What a page sends along when it saves: the kinds of tile it knows, beyond those every version knows. */
export const KNOWN_KINDS = ['widget', 'widget:weather', 'widget:energy'] as const;

/** Widgets that came after widgets themselves: a page knows them by name. */
const NAMED_LATER: readonly string[] = ['weather', 'energy'];

/** What a page says it knows when it saves. */
export const knowsOf = (raw: unknown): readonly string[] => {
  const knows = typeof raw === 'object' && raw !== null ? (raw as { knows?: unknown }).knows : undefined;
  return Array.isArray(knows) ? knows.filter((kind): kind is string => typeof kind === 'string') : [];
};

/** Whether what a page saves comes from a page that knows widgets. */
export const knowsWidgets = (raw: unknown): boolean => knowsOf(raw).includes('widget');

/** Whether a page that says this could have left a widget out on purpose. */
const couldKnow = (tile: TileLayout, knows: readonly string[]): boolean =>
  tile.spec.kind !== 'widget' || (knows.includes('widget') && (!NAMED_LATER.includes(tile.spec.widget) || knows.includes(`widget:${tile.spec.widget}`)));

/** Whether anything of what a page saved could be a widget it did not know. */
export const mayMissWidgets = (raw: unknown): boolean => KNOWN_KINDS.some((kind) => !knowsOf(raw).includes(kind));

/**
 * The layouts a page saved, with the widgets it did not know put back where they were: such a page never showed them,
 * so leaving them out is no choice of anybody. A section or dashboard it removed takes its widgets along.
 */
export function keepWidgets(incoming: Record<string, HubLayout>, current: Record<string, HubLayout>, knows: readonly string[] = []): Record<string, HubLayout> {
  return Object.fromEntries(Object.entries(incoming).map(([hubId, layout]) => {
    const before = current[hubId];
    if (!before) return [hubId, layout];
    const dashboards = layout.dashboards.map((dashboard) => {
      const was = before.dashboards.find((d) => d.id === dashboard.id);
      if (!dashboard.sections || !was?.sections) return dashboard;
      const sections = dashboard.sections.map((section) => {
        const old = was.sections!.find((s) => s.id === section.id);
        if (!old) return section;
        const tiles: TileLayout[] = [...section.tiles];
        old.tiles.forEach((tile, index) => {
          if (tile.spec.kind === 'widget' && !couldKnow(tile, knows) && !tiles.some((t) => t.id === tile.id)) tiles.splice(Math.min(index, tiles.length), 0, tile);
        });
        return tiles.length === section.tiles.length ? section : { ...section, tiles };
      });
      return { ...dashboard, sections };
    });
    return [hubId, { ...layout, dashboards }];
  }));
}
