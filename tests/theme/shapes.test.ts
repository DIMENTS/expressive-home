import { expect, test } from 'vitest';
import { blobPolygon } from '../../src/theme/shapes';

test('all shapes have the same number of points, so the browser can morph between them', () => {
  const count = (p: string) => p.split(',').length;
  expect(blobPolygon(0, 0)).toMatch(/^polygon\(/);
  expect(new Set([blobPolygon(0, 0), blobPolygon(12, 0.05), blobPolygon(4, 0.13), blobPolygon(8, 0.08)].map(count))).toEqual(new Set([96]));
});
test('the circle has every point at the same distance from the centre', () => {
  const points = blobPolygon(0, 0).slice('polygon('.length, -1).split(',');
  for (const point of points) {
    const [x, y] = point.trim().split(' ').map((v) => parseFloat(v) - 50);
    expect(Math.hypot(x!, y!)).toBeCloseTo(50, 1);
  }
});
test('the cookie reaches the edge at a bulge and dips by its amplitude between two bulges', () => {
  const points = blobPolygon(12, 0.05).slice('polygon('.length, -1).split(',');
  const distance = (point: string) => { const [x, y] = point.trim().split(' ').map((v) => parseFloat(v) - 50); return Math.hypot(x!, y!); };
  expect(distance(points[0]!)).toBeCloseTo(50, 1);
  // 96 points, 12 bulges: point 4 lies halfway between the first two bulges
  expect(distance(points[4]!)).toBeCloseTo(45, 1);
});
