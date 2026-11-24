import { expect, test } from 'vitest';
import { columnAt, dropIndex, sectionAt, type Slot } from '../../../src/ui/model/drop';

/** Tiles of 100 by 80 with a gap of 10, four in a row; `wide` ones take two places. */
function grid(...widths: (1 | 2)[]): Slot[] {
  let column = 0;
  let row = 0;
  return widths.map((width, i) => {
    if (column + width > 4) { column = 0; row += 1; }
    const slot = { id: `t${i}`, left: column * 110, top: row * 90, width: width * 110 - 10, height: 80 };
    column += width;
    return slot;
  });
}

test('dropIndex: before the first, between two, after the last tile', () => {
  const slots = grid(1, 1, 1, 1);
  expect(dropIndex(slots, { x: 10, y: 40 }, 'grid')).toBe(0);
  expect(dropIndex(slots, { x: 100, y: 40 }, 'grid')).toBe(1);
  expect(dropIndex(slots, { x: 260, y: 40 }, 'grid')).toBe(2);
  expect(dropIndex(slots, { x: 430, y: 40 }, 'grid')).toBe(4);
});

test('dropIndex: a row is found by its height, also between rows and above the first', () => {
  const slots = grid(2, 2, 1, 1, 1);
  expect(dropIndex(slots, { x: 10, y: -20 }, 'grid')).toBe(0);
  expect(dropIndex(slots, { x: 300, y: 40 }, 'grid')).toBe(1);
  expect(dropIndex(slots, { x: 430, y: 40 }, 'grid')).toBe(2);
  expect(dropIndex(slots, { x: 10, y: 120 }, 'grid')).toBe(2);
  expect(dropIndex(slots, { x: 180, y: 120 }, 'grid')).toBe(4);
});

test('dropIndex: a point under the last row goes to the end', () => {
  expect(dropIndex(grid(1, 1, 1, 1, 1), { x: 10, y: 500 }, 'grid')).toBe(5);
  expect(dropIndex([], { x: 10, y: 10 }, 'grid')).toBe(0);
});

test('dropIndex: tiles of different heights in a row are one row', () => {
  const slots = [{ id: 'a', left: 0, top: 0, width: 100, height: 160 }, { id: 'b', left: 110, top: 0, width: 100, height: 80 }, { id: 'c', left: 0, top: 170, width: 100, height: 80 }];
  expect(dropIndex(slots, { x: 180, y: 130 }, 'grid')).toBe(2);
  expect(dropIndex(slots, { x: 10, y: 200 }, 'grid')).toBe(2);
});

test('dropIndex: sections by y within a column', () => {
  const slots = [0, 1, 2].map((i) => ({ id: `s${i}`, left: 0, top: i * 210, width: 400, height: 200 }));
  expect(dropIndex(slots, { x: 900, y: 20 }, 'column')).toBe(0);
  expect(dropIndex(slots, { x: 0, y: 150 }, 'column')).toBe(1);
  expect(dropIndex(slots, { x: 0, y: 400 }, 'column')).toBe(2);
  expect(dropIndex(slots, { x: 0, y: 5000 }, 'column')).toBe(3);
});

test('the section under a point, or none', () => {
  const sections = [{ id: 'a', rect: { id: 'a', left: 0, top: 0, width: 100, height: 100 } }, { id: 'b', rect: { id: 'b', left: 0, top: 120, width: 100, height: 100 } }];
  expect(sectionAt(sections, { x: 50, y: 130 })?.id).toBe('b');
  expect(sectionAt(sections, { x: 50, y: 110 })).toBeNull();
  expect(sectionAt(sections, { x: 150, y: 50 })).toBeNull();
});

test('the column under a point: side by side by x, also below a short one; under each other by y', () => {
  const beside = [{ column: 'left' as const, rect: { id: 'l', left: 0, top: 0, width: 500, height: 2000 } }, { column: 'right' as const, rect: { id: 'r', left: 520, top: 0, width: 400, height: 300 } }];
  expect(columnAt(beside, { x: 600, y: 1500 })?.column).toBe('right');
  expect(columnAt(beside, { x: 100, y: 1500 })?.column).toBe('left');
  expect(columnAt(beside, { x: 5000, y: 10 })?.column).toBe('right');
  const under = [{ column: 'left' as const, rect: { id: 'l', left: 0, top: 0, width: 500, height: 1000 } }, { column: 'right' as const, rect: { id: 'r', left: 0, top: 1020, width: 500, height: 300 } }];
  expect(columnAt(under, { x: 250, y: 900 })?.column).toBe('left');
  expect(columnAt(under, { x: 250, y: 1100 })?.column).toBe('right');
  expect(columnAt(under, { x: 250, y: 9000 })?.column).toBe('right');
});
