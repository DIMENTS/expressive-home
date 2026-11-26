import { expect, test } from 'vitest';
import { BARS_VIEW, barsOf, peakOf } from '../../src/charts/bars';

const slot = (generated: number | null, consumed: number | null) => ({ generated, consumed });

test('sun above the line and use under it, on one scale, the line in the middle', () => {
  const { bars, axis } = barsOf([slot(2, 1), slot(0, 2), slot(null, null), slot(1, 0)]);
  expect(axis).toBe(BARS_VIEW.height / 2);
  const half = BARS_VIEW.height / 2;
  expect(bars[0]!.up).toEqual({ y: axis - half, height: half });
  expect(bars[0]!.down).toEqual({ y: axis, height: half / 2 });
  expect(bars[1]!.up).toBeNull();
  expect(bars[1]!.down!.height).toBe(half);
  expect([bars[2]!.up, bars[2]!.down]).toEqual([null, null]);
  expect(bars[3]!.down).toBeNull();
  // the bars fill the width, with a gap between them
  expect(bars[0]!.x).toBe(0);
  expect(bars[3]!.x + bars[3]!.width).toBeCloseTo(BARS_VIEW.width);
  expect(bars[1]!.x - (bars[0]!.x + bars[0]!.width)).toBeCloseTo(BARS_VIEW.gap);
});

test('without any sun the line is on top and use takes the whole height', () => {
  const { bars, axis } = barsOf([slot(null, 1), slot(0, 2)]);
  expect(axis).toBe(0);
  expect(bars[1]!.down).toEqual({ y: 0, height: BARS_VIEW.height });
  expect(bars[0]!.up).toBeNull();
});

test('nothing at all draws nothing; the highest of each is found with its slot', () => {
  expect(barsOf([]).bars).toEqual([]);
  expect(barsOf([slot(0, 0)]).bars[0]).toMatchObject({ up: null, down: null });
  expect(peakOf([slot(1, 3), slot(4, 2), slot(null, null)])).toEqual({ use: { index: 0, value: 3 }, sun: { index: 1, value: 4 } });
  expect(peakOf([slot(null, 1)])).toEqual({ use: { index: 0, value: 1 }, sun: null });
});
