import type { ReadState } from '../widgets/live-reads';
import { weatherAge, type Weather } from '../widgets/weather';
import type { ModePreference } from './types';

// Light and dark with the sun: dark from sunset to sunrise at the place of the hub, as its weather tells. The place
// itself never reaches the page.

/** Whether it is dark outside now; null when the weather does not tell, or is too old to tell. */
export function sunDark(state: ReadState<Weather> | null, now: number): boolean | null {
  const weather = state?.value ?? null;
  if (!weather || weather.daylight === null || weatherAge(weather, now) !== 'fresh') return null;
  return !weather.daylight;
}

/** The choice of light and dark as the theme takes it: with the sun is light or dark, or as the system when it does not tell. */
export function withSun(preference: ModePreference, dark: boolean | null): Exclude<ModePreference, 'sun'> {
  if (preference !== 'sun') return preference;
  return dark === null ? 'auto' : dark ? 'dark' : 'light';
}

/** So long what was known of the sun still counts, until the weather says otherwise: a page that starts at night starts dark. */
export const SUN_KEPT_MS = 12 * 3_600_000;

/** The darkness of the sun as it was kept, with its time; null when there is none, it is old, or it is nonsense. */
export function keptSunOf(raw: string | null, now: number): boolean | null {
  try {
    const kept = JSON.parse(raw ?? 'null') as { dark?: unknown; at?: unknown } | null;
    const { dark, at } = kept ?? {};
    return typeof dark === 'boolean' && typeof at === 'number' && at <= now && now - at < SUN_KEPT_MS ? dark : null;
  } catch {
    return null;
  }
}

/** Whether the weather is heard for the sun: while what is shown, the rest screen or the house follows it. */
export function followsSun(modes: { shown: ModePreference; resting: ModePreference; house: ModePreference | null }): boolean {
  return modes.shown === 'sun' || modes.resting === 'sun' || modes.house === 'sun';
}
