import type { HistorySeries } from '../homey/client';
import type { Scale } from './scale';

export interface Box { width: number; height: number }
/** A jump in time of more than this many steps breaks the line. */
const JUMP = 1.5;

const num = (value: number): string => String(Math.round(value * 100) / 100);

/** The stretches without a gap, as points in the box. */
function stretches(series: HistorySeries, scale: Scale, box: Box): [number, number][][] {
  const span = series.end - series.start;
  const x = (at: number): number => (span > 0 ? ((at - series.start) / span) * box.width : 0);
  const y = (value: number): number => {
    const part = (Math.min(Math.max(value, scale.min), scale.max) - scale.min) / (scale.max - scale.min || 1);
    return box.height - part * box.height;
  };
  const result: [number, number][][] = [];
  let current: [number, number][] = [];
  let last: number | null = null;
  for (const point of series.points) {
    const jumped = last !== null && series.step > 0 && point.at - last > series.step * JUMP;
    if (point.value === null || jumped) {
      if (current.length > 0) result.push(current);
      current = [];
    }
    if (point.value !== null) current.push([x(point.at), y(point.value)]);
    last = point.at;
  }
  if (current.length > 0) result.push(current);
  return result;
}

/** The line of a series; it breaks at gaps, and a point on its own is a dot (with round line ends). */
export function linePath(series: HistorySeries, scale: Scale, box: Box): string {
  return stretches(series, scale, box).map((part) => {
    const [head, ...rest] = part;
    const tail = rest.length > 0 ? rest : [head!];
    return `M${num(head![0])} ${num(head![1])}${tail.map(([x, y]) => `L${num(x)} ${num(y)}`).join('')}`;
  }).join('');
}

/** The area under the line, down to the bottom of the box; per stretch without a gap. */
export function areaPath(series: HistorySeries, scale: Scale, box: Box): string {
  return stretches(series, scale, box).map((part) => {
    const first = part[0]!;
    const last = part.at(-1)!;
    const line = part.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${num(x)} ${num(y)}`).join('');
    return `${line}L${num(last[0])} ${num(box.height)}L${num(first[0])} ${num(box.height)}Z`;
  }).join('');
}
