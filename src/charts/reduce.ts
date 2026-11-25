import type { HistorySeries } from '../homey/client';

type Point = HistorySeries['points'][number];

/**
 * At most two points per pixel of `width`: per stretch of time the lowest and the highest, in their order, so a peak
 * stays. A stretch with only empty points stays one empty point, so a gap stays a gap.
 */
export function reduce(points: readonly Point[], width: number): Point[] {
  const slots = Math.max(1, Math.floor(width));
  if (points.length <= slots * 2) return [...points];
  const first = points[0]!.at;
  const span = points.at(-1)!.at - first || 1;
  const result: Point[] = [];
  let slot = -1;
  let low: Point | null = null;
  let high: Point | null = null;
  let empty: Point | null = null;
  const flush = (): void => {
    if (low && high) result.push(...(low === high ? [low] : low.at <= high.at ? [low, high] : [high, low]));
    else if (empty) result.push(empty);
    low = high = empty = null;
  };
  for (const point of points) {
    const at = Math.min(slots - 1, Math.floor(((point.at - first) / span) * slots));
    if (at !== slot) { flush(); slot = at; }
    if (point.value === null) { empty ??= point; continue; }
    if (!low || point.value < low.value!) low = point;
    if (!high || point.value > high.value!) high = point;
  }
  flush();
  return result;
}
