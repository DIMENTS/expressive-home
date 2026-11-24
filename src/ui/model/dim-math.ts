/** Where the dimmer stands in the window, and what the finger began with. */
export interface DimBox { left: number; top: number; width: number; height: number; startLevel: number; startY: number }

const within = (value: number, min: number, max: number): number => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min);

/**
 * The dimmer that a tile grows into: the edge of its fill lies under the finger at `y`. When it does not
 * fit in the window there it moves in, and the finger still begins at the level of the lamp.
 */
export function dimBox(
  tile: { left: number; top: number; width: number }, y: number, level: number, size: { height: number; grow: number }, view: { top: number; bottom: number },
): DimBox {
  const startLevel = within(level, 0, 1);
  const top = y - (1 - startLevel) * size.height;
  return {
    left: tile.left - size.grow, top: Math.max(view.top, Math.min(top, view.bottom - size.height)), width: tile.width + 2 * size.grow, height: size.height,
    startLevel, startY: y,
  };
}

/** The level for a finger at `y`: one height of the dimmer is the whole range. */
export const dimLevel = (box: DimBox, y: number): number => within(box.startLevel + (box.startY - y) / box.height, 0, 1);
