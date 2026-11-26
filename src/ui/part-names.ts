/**
 * What each layer passes up of the parts own CSS can reach (`exportparts`), from a tile to the app. The names are the
 * list of `src/theme/css/parts.ts`; a test walks the whole app and checks that every part arrives there.
 */
const join = (...lists: string[]): string => [...new Set(lists.join(',').split(',').map((name) => name.trim()).filter(Boolean))].join(', ');

const TILE_STATES = 'on, off, alert, unavailable, wide';
export const SLIDER_PARTS = 'slider, slider-fill, slider-track, on, off';
export const CHART_PARTS = 'chart, chart-line, chart-area';
export const TILE_PARTS = join('tile, tile-icon, tile-name, tile-state, tile-value, flow', TILE_STATES, SLIDER_PARTS, CHART_PARTS);
export const SECTION_PARTS = join('section, section-title, section-count, own-colour', TILE_PARTS);
export const HERO_PARTS = join('hero, hero-title, hero-number, hero-unit, hero-line, hero-stat, own-colour', CHART_PARTS);
export const HEADER_PARTS = 'header, greeting, date, chip, alert';
export const RAIL_PARTS = 'rail, rail-item, active';
export const NAV_PARTS = 'nav-bar, nav-item, active';
export const DASHBOARD_PARTS = join('page', RAIL_PARTS, NAV_PARTS, HEADER_PARTS, HERO_PARTS, SECTION_PARTS);
export const REST_PARTS = 'rest, rest-clock, rest-date, rest-weather, rest-stat, night, alert';

/** The state of a tile as a part name. */
export const tileStatePart = (state: string): string => ({ on: 'on', neutral: 'off', danger: 'alert', unavailable: 'unavailable' } as Record<string, string>)[state] ?? 'off';
