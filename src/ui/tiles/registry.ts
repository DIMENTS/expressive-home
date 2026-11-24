import type { TileSize, TileSpec } from '../../dashboard/types';
import type { ShownDensity } from '../../theme/types';
import type { UiContext } from '../app/context';

/** A kind of tile: the web component that shows it and the sizes it can take. */
export interface TileDefinition { kind: TileSpec['kind']; tag: string; sizes: readonly TileSize[] }

const definitions = new Map<TileSpec['kind'], TileDefinition>();

/** Registers a kind of tile; the built-in tiles and later own widgets use the same way in. */
export function registerTile(definition: TileDefinition): void {
  if (definitions.has(definition.kind)) throw new Error(`a tile for "${definition.kind}" is already registered`);
  definitions.set(definition.kind, definition);
}

function definitionOf(kind: TileSpec['kind']): TileDefinition {
  const definition = definitions.get(kind);
  if (!definition) throw new Error(`no tile is registered for "${kind}"`);
  return definition;
}

export function tileTag(kind: TileSpec['kind']): string {
  return definitionOf(kind).tag;
}

/** The sizes a kind of tile can take, the usual one first. */
export function tileSizes(kind: TileSpec['kind']): readonly TileSize[] {
  return definitionOf(kind).sizes;
}

/** Makes the tile element for a spec, with its spec, context and density set. */
export function createTile(spec: TileSpec, ctx: UiContext, density: ShownDensity): HTMLElement {
  const element = document.createElement(tileTag(spec.kind)) as HTMLElement & { spec: TileSpec; ctx: UiContext; density: ShownDensity };
  element.spec = spec;
  element.ctx = ctx;
  element.density = density;
  return element;
}
