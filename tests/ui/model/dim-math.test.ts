import { expect, test } from 'vitest';
import { dimBox, dimLevel } from '../../../src/ui/model/dim-math';

const tile = { left: 20, top: 400, width: 160 };
const size = { height: 236, grow: 4 };
const view = { top: 0, bottom: 844 };
const near = (value: number) => Number(value.toFixed(6));

test('the edge of the fill lies under the finger and goes with it', () => {
  const box = dimBox(tile, 420, 0.64, size, view);
  expect([box.left, box.width, box.height, near(box.top)]).toEqual([16, 168, 236, near(420 - 0.36 * 236)]);
  expect(dimLevel(box, 420)).toBe(0.64);
  expect(near(dimLevel(box, 420 - 59))).toBe(0.89);
  expect(near(dimLevel(box, 420 + 59))).toBe(0.39);
});

test('above the top and below the bottom it stays full and empty', () => {
  const box = dimBox(tile, 420, 0.5, size, view);
  expect([dimLevel(box, 0), dimLevel(box, 844)]).toEqual([1, 0]);
});

test('near an edge of the window it moves in; the finger still begins at the level of the lamp', () => {
  const top = dimBox({ ...tile, top: 0 }, 20, 0.1, size, { top: 8, bottom: 836 });
  expect([top.top, dimLevel(top, 20), near(dimLevel(top, 20 + 23.6))]).toEqual([8, 0.1, 0]);
  const bottom = dimBox({ ...tile, top: 790 }, 820, 0.9, size, { top: 8, bottom: 836 });
  expect([bottom.top, dimLevel(bottom, 820)]).toEqual([836 - 236, 0.9]);
});

test('a lamp that is off begins at the bottom, and a window lower than the dimmer keeps its top in view', () => {
  expect(dimBox(tile, 420, 0, size, view).top).toBe(420 - 236);
  expect(dimBox(tile, 60, 0.5, size, { top: 8, bottom: 200 }).top).toBe(8);
});

test('a level that cannot be is taken as the nearest that can', () => {
  for (const [level, taken] of [[-1, 0], [2, 1], [Number.NaN, 0]] as const) expect(dimLevel(dimBox(tile, 420, level, size, view), 420)).toBe(taken);
});
