// The arithmetic of the clock's siblings: counting down to a date, a value on a dial, and the devices of a group.

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from today to a date ("2026-12-24"), by the clock of the device; null when it is no date. */
export function daysUntil(raw: unknown, now: Date): number | null {
  const match = typeof raw === 'string' ? DATE.exec(raw) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // around a change of summer time a day has 23 or 25 hours: rounding takes care of it
  return Math.round((date.getTime() - today.getTime()) / DAY_MS);
}

/** Where a value is between lowest and highest, from 0 to 1; null without a value. */
export function gaugeShare(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (!(max > min)) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** The devices of a group, as one setting holds them: ids with commas between. */
export const groupIds = (raw: unknown): string[] => (typeof raw === 'string' ? [...new Set(raw.split(',').filter((id) => id !== ''))] : []);
