/**
 * The parts own CSS can reach, version 1: a name on this list stays and keeps its meaning while the version is 1.
 * States are part names too, on the same element (`tile on`). Nothing else of the page has a part name.
 */
export const PARTS_VERSION = 1;

export const PART_NAMES: readonly string[] = Object.freeze([
  'page', 'rail', 'rail-item', 'nav-bar', 'nav-item', 'header', 'greeting', 'date', 'chip',
  'section', 'section-title', 'section-count',
  'hero', 'hero-title', 'hero-number', 'hero-unit', 'hero-line', 'hero-stat',
  'tile', 'tile-icon', 'tile-name', 'tile-state', 'tile-value',
  'slider', 'slider-fill', 'slider-track', 'flow',
  'chart', 'chart-line', 'chart-area',
  'rest', 'rest-clock', 'rest-date', 'rest-weather', 'rest-stat',
]);

export const STATE_NAMES: readonly string[] = Object.freeze(['on', 'off', 'alert', 'unavailable', 'wide', 'active', 'own-colour', 'night']);

/** The parts that hold other parts: no letter sizes and no decoration with ::before/::after, which would add up over or push away what they hold. */
export const CONTAINER_PARTS: readonly string[] = Object.freeze(['page', 'rail', 'nav-bar', 'header', 'section', 'hero', 'tile', 'slider', 'chart', 'rest']);

/** The parts a picture (`url(data:…)`) may lie on: large surfaces, never a tile, so a picture cannot pass for a state. */
export const PICTURE_PARTS: readonly string[] = Object.freeze(['page', 'section', 'hero', 'rest']);

const PARTS = new Set(PART_NAMES);
const STATES = new Set(STATE_NAMES);
export const isPart = (name: string): boolean => PARTS.has(name);
export const isState = (name: string): boolean => STATES.has(name);
/** A part of the rest screen: its CSS comes from the device and the house, never from a dashboard. */
export const isRestPart = (name: string): boolean => name === 'rest' || name.startsWith('rest-');
