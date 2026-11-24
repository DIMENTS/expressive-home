/**
 * A rounded blob as a CSS polygon: `lobes` bulges of relative size `amplitude`.
 * Every shape has the same number of points, so the browser can morph between them.
 * The circle is (0, 0), the cookie (12, 0.05), the clover (4, 0.13) and the flower (8, 0.08).
 */
export function blobPolygon(lobes: number, amplitude: number, points = 96): string {
  const corners: string[] = [];
  for (let i = 0; i < points; i += 1) {
    const angle = (i / points) * Math.PI * 2;
    const radius = 50 * (1 - amplitude + amplitude * Math.cos(lobes * angle));
    corners.push(`${(50 + radius * Math.cos(angle)).toFixed(2)}% ${(50 + radius * Math.sin(angle)).toFixed(2)}%`);
  }
  return `polygon(${corners.join(',')})`;
}

/** The four shapes of the design system, as CSS custom properties. */
export const SHAPE_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  '--shape-circle': blobPolygon(0, 0),
  '--shape-cookie': blobPolygon(12, 0.05),
  '--shape-clover': blobPolygon(4, 0.13),
  '--shape-flower': blobPolygon(8, 0.08),
});
