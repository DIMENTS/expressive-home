/** The range a chart shows, from bottom to top; `fromZero` when the bottom is zero, so an area means an amount. */
export interface Scale { min: number; max: number; fromZero: boolean }

/** Values that are an amount: their chart starts at zero. */
const AMOUNTS = new Set(['measure_power', 'measure_battery']);
/** The smallest height of a scale per kind, so that noise is no mountain. */
const LEAST: Record<string, number> = { measure_temperature: 2, measure_humidity: 10, measure_pressure: 10, measure_co2: 200 };
/** Room above and below the range, as a part of it. */
const ROOM = 0.1;

/** The scale for a value: amounts from zero (a charge up to 100), the rest its own range with some room. */
export function scaleFor(kind: { baseId: string; units: string | null }, values: readonly number[]): Scale {
  const finite = values.filter(Number.isFinite);
  const amount = AMOUNTS.has(kind.baseId) || kind.baseId.startsWith('meter_') || (kind.units === '%' && kind.baseId !== 'measure_humidity');
  if (finite.length === 0) return { min: 0, max: 1, fromZero: amount };
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  if (amount) {
    if (kind.units === '%' && kind.baseId !== 'measure_humidity') return { min: 0, max: 100, fromZero: true };
    const top = Math.max(high, 0);
    return { min: 0, max: top > 0 ? top * (1 + ROOM) : 1, fromZero: true };
  }
  const middle = (low + high) / 2;
  const least = LEAST[kind.baseId] ?? Math.max(Math.abs(middle) * 0.1, 1e-6);
  const span = Math.max(high - low, least) * (1 + 2 * ROOM);
  // nothing at all: still a height, so a flat line stands in the middle
  const height = span > 0 ? span : 1;
  return { min: middle - height / 2, max: middle + height / 2, fromZero: false };
}
