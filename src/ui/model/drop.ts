import type { Column } from '../../layout/types';

/** A place on the page, in page coordinates. */
export interface Slot { id: string; left: number; top: number; width: number; height: number }
export interface Point { x: number; y: number }

const right = (slot: Slot): number => slot.left + slot.width;
const bottom = (slot: Slot): number => slot.top + slot.height;
const inside = (slot: Slot, point: Point): boolean => point.x >= slot.left && point.x <= right(slot) && point.y >= slot.top && point.y <= bottom(slot);

/** The slots per row, in order: a slot that begins below the middle of the first of a row begins a new one. */
function rowsOf(slots: readonly Slot[]): { from: number; slots: Slot[] }[] {
  const rows: { from: number; slots: Slot[] }[] = [];
  slots.forEach((slot, index) => {
    const row = rows.at(-1);
    const first = row?.slots[0];
    if (row && first && slot.top < first.top + first.height / 2 && slot.left > row.slots.at(-1)!.left) row.slots.push(slot);
    else rows.push({ from: index, slots: [slot] });
  });
  return rows;
}

/**
 * Where a dragged item goes: the index before which it lands among the slots (without the dragged one).
 * 'grid': rows from top to bottom, within a row by x; 'column': by y.
 */
export function dropIndex(slots: Slot[], point: Point, layout: 'grid' | 'column'): number {
  if (layout === 'column') {
    const before = slots.findIndex((slot) => point.y < slot.top + slot.height / 2);
    return before === -1 ? slots.length : before;
  }
  const row = rowsOf(slots).find(({ slots: list }) => point.y <= Math.max(...list.map(bottom)));
  if (!row) return slots.length;
  const before = row.slots.findIndex((slot) => point.x < slot.left + slot.width / 2);
  return row.from + (before === -1 ? row.slots.length : before);
}

/** The section under a point; null between sections. */
export function sectionAt<T extends { rect: Slot }>(sections: T[], point: Point): T | null {
  return sections.find(({ rect }) => inside(rect, point)) ?? null;
}

/** The column under a point. Side by side the x decides, also below a short column; under each other the y does. */
export function columnAt<T extends { column: Column; rect: Slot }>(columns: T[], point: Point): T | null {
  const [first, second] = columns;
  if (!first || !second) return first ?? null;
  const beside = right(first.rect) <= second.rect.left;
  const boundary = beside ? (right(first.rect) + second.rect.left) / 2 : (bottom(first.rect) + second.rect.top) / 2;
  return (beside ? point.x : point.y) < boundary ? first : second;
}
