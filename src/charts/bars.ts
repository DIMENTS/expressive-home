// Bars per hour or per day: what the sun gave above the line, what was used under it, on one scale. Without any sun
// the line is on top and use has the whole height. In units of a view box that the page stretches to its size.

export const BARS_VIEW = { width: 240, height: 80, gap: 2 } as const;

export interface BarSlot { generated: number | null; consumed: number | null }
export interface Bar { x: number; width: number; up: { y: number; height: number } | null; down: { y: number; height: number } | null }

/** The bars of the slots, and where the line is. */
export function barsOf(slots: readonly BarSlot[]): { bars: Bar[]; axis: number } {
  const sun = slots.some((slot) => (slot.generated ?? 0) > 0);
  const axis = sun ? BARS_VIEW.height / 2 : 0;
  const room = sun ? BARS_VIEW.height / 2 : BARS_VIEW.height;
  const top = Math.max(0, ...slots.map((slot) => Math.max(slot.generated ?? 0, slot.consumed ?? 0)));
  const count = slots.length;
  const width = count === 0 ? 0 : (BARS_VIEW.width - BARS_VIEW.gap * (count - 1)) / count;
  const length = (value: number | null): number => (value === null || value <= 0 || top <= 0 ? 0 : (value / top) * room);
  const bars = slots.map((slot, index): Bar => {
    const up = length(slot.generated);
    const down = length(slot.consumed);
    return {
      x: index * (width + BARS_VIEW.gap), width,
      up: up > 0 ? { y: axis - up, height: up } : null,
      down: down > 0 ? { y: axis, height: down } : null,
    };
  });
  return { bars, axis };
}

/** The slot with the most use and the one with the most sun; null where there is none. */
export function peakOf(slots: readonly BarSlot[]): { use: { index: number; value: number } | null; sun: { index: number; value: number } | null } {
  const most = (pick: (slot: BarSlot) => number | null) => slots.reduce<{ index: number; value: number } | null>((best, slot, index) => {
    const value = pick(slot);
    return value !== null && value > 0 && (best === null || value > best.value) ? { index, value } : best;
  }, null);
  return { use: most((slot) => slot.consumed), sun: most((slot) => slot.generated) };
}
