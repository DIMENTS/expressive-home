import type { HubLayout, TileLayout } from './types';

/** What a page sends along when it saves: the kinds of tile it knows, beyond those every version knows. */
export const KNOWN_KINDS = ['widget'] as const;

/** Whether what a page saves comes from a page that knows widgets. */
export const knowsWidgets = (raw: unknown): boolean =>
  typeof raw === 'object' && raw !== null && Array.isArray((raw as { knows?: unknown }).knows) && (raw as { knows: unknown[] }).knows.includes('widget');

/**
 * The layouts a page that does not know widgets saved, with the widgets put back where they were: such a page never
 * showed them, so leaving them out is no choice of anybody. A section or dashboard it removed takes its widgets along.
 */
export function keepWidgets(incoming: Record<string, HubLayout>, current: Record<string, HubLayout>): Record<string, HubLayout> {
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
          if (tile.spec.kind === 'widget' && !tiles.some((t) => t.id === tile.id)) tiles.splice(Math.min(index, tiles.length), 0, tile);
        });
        return tiles.length === section.tiles.length ? section : { ...section, tiles };
      });
      return { ...dashboard, sections };
    });
    return [hubId, { ...layout, dashboards }];
  }));
}
