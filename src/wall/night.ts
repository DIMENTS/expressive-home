import type { NightTimes } from './settings';

/** What a flow on the hub said of the night, and when, on the clock of this device. */
export interface FlowNight { night: boolean; at: number }

/** A time of day ("22:30") of the day of `date`, or of days before it. */
function moment(date: Date, time: string, daysBefore: number): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  const at = new Date(date);
  at.setDate(at.getDate() - daysBefore);
  return at.setHours(hours, minutes, 0, 0);
}

/**
 * Whether it is night: by the fixed times, unless a flow said something since the last of them. Without a
 * night at all there is none, whatever a flow says.
 */
export function isNight(now: Date, times: NightTimes, flow: FlowNight | null): boolean {
  if (!times.on) return false;
  const passed = [0, 1].flatMap((days) => [{ at: moment(now, times.from, days), night: true }, { at: moment(now, times.to, days), night: false }])
    .filter((fixed) => fixed.at <= now.getTime())
    .sort((a, b) => b.at - a.at);
  // two that are the same make no night
  const last = passed[0];
  const fixed = last !== undefined && last.night && passed[1]?.at !== last.at;
  // a clock that was set back: what a flow said is not in the future
  if (flow && (last === undefined || Math.min(flow.at, now.getTime()) >= last.at)) return flow.night;
  return fixed;
}
