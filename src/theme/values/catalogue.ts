import { BASE_COMPONENTS, PROTECTED_NAMES } from '../bases';
import { KNOB_VALUES, type Knobs } from '../look';
import { knobComponents, knobSystem } from '../knobs';
import { rustigExpressive } from '../rustig-expressive';
import { LEEG_COMPONENTS, LEEG_SYSTEM } from '../leeg';
import { SHAPE_TOKENS } from '../shapes';
import { CURVES, SETTABLE_ROLES, checkColour, type Kind, type Unit } from './kinds';

/** The version of the listed names: a name on the list keeps its meaning as long as this is 1. */
export const LISTED_VERSION = 1;

export const GROUPS = [
  'colour', 'shape', 'letter', 'space', 'sections', 'tiles', 'sliders', 'hero', 'bar', 'buttons', 'sheets', 'charts', 'rest', 'motion', 'other',
] as const;
export type Group = (typeof GROUPS)[number];

/** A value of a theme as the editor knows it. */
export interface Entry {
  /** Without the leading dashes, as a theme file writes it. */
  name: string;
  kind: Kind;
  group: Group;
  /** The words for it, part and role, as keys of the texts; only for the listed names. */
  words?: readonly [string, string];
  listed: boolean;
}

/** The colour roles as names of values. */
const roleName = (role: string): string => `c-${role}`;

/** Every value of the dashboard and Rustig's own text for it; colour roles are worked out, so they have none. */
function rustigValues(): Record<string, string | null> {
  const values: Record<string, string | null> = {};
  for (const role of SETTABLE_ROLES) values[roleName(role)] = null;
  Object.assign(values, rustigExpressive.system, rustigExpressive.density.comfortable, rustigExpressive.components);
  for (const name of Object.keys(SHAPE_TOKENS)) values[name.slice(2)] = SHAPE_TOKENS[name]!;
  return values;
}

/** What the built-in styles and their knobs write for a name, besides Rustig. */
function builtInTexts(): Map<string, Set<string>> {
  const texts = new Map<string, Set<string>>();
  const add = (values: Record<string, string>): void => {
    for (const [name, value] of Object.entries(values)) {
      if (!texts.has(name)) texts.set(name, new Set());
      texts.get(name)!.add(value);
    }
  };
  add(rustigExpressive.system);
  add(rustigExpressive.components);
  for (const density of Object.values(rustigExpressive.density)) add(density);
  for (const components of Object.values(BASE_COMPONENTS)) add(components);
  add({ ...LEEG_SYSTEM });
  add({ ...LEEG_COMPONENTS });
  const knobNames = Object.keys(KNOB_VALUES) as (keyof Knobs)[];
  const base: Knobs = { roundness: 'round', strength: 'normal', contrast: 'normal', letter: 'sans', weight: 600, surfaces: 'solid', background: 'plain' };
  for (const knob of knobNames) {
    for (const value of KNOB_VALUES[knob]) {
      const knobs = { ...base, [knob]: value } as Knobs;
      add(knobSystem(knobs));
      add(knobComponents(knobs));
    }
  }
  return texts;
}

const FIXED: Kind = { kind: 'fixed' };
const PROTECTED = new Set(PROTECTED_NAMES.map((name) => name.slice(2)));

/** Whether a text is a colour, following references to other values. */
function colourLike(value: string, values: Record<string, string | null>, depth = 0): boolean {
  if (depth > 6) return false;
  if (checkColour(value) !== null || value.startsWith('color-mix(')) return true;
  const reference = /^var\(--([a-z0-9-]+)\)$/.exec(value);
  if (!reference) return false;
  if (reference[1]!.startsWith('c-')) return true;
  const next = values[reference[1]!];
  return typeof next === 'string' && colourLike(next, values, depth + 1);
}

function range(name: string, unit: Unit | 'number', value: number): [number, number] {
  if (unit === '%' || unit === 'vw' || unit === 'dvh') return [0, 100];
  if (unit === 'number') {
    if (name === 'hero-wave-scale') return [0, 2];
    if (/scale/.test(name)) return [0.8, 1.25];
    if (/opacity|disabled-content|stale/.test(name)) return [0.1, 1];
    if (/-line$/.test(name)) return [0.6, 2.5];
  }
  const floor = unit === 'px' ? 64 : 1;
  const reach = Math.min(Math.max(Math.abs(value) * 4, floor), 4000);
  return value < 0 ? [-reach, reach] : [0, reach];
}

const SIZE = /^(-?[\d.]+)(px|em|%|vw|dvh)$/;
const NUMBER = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

/** The kind of a value, worked out from its name and Rustig's own text. */
export function kindOf(name: string, value: string | null, also: readonly string[], values: Record<string, string | null>): Kind {
  if (PROTECTED.has(name)) return FIXED;
  if (name.startsWith('c-')) return SETTABLE_ROLES.includes(name.slice(2)) ? { kind: 'colour', also, plain: true } : FIXED;
  if (value === null || `--${name}` in SHAPE_TOKENS) return FIXED;
  if (/var\(--density-|calc\(|min\(|max\(/.test(value)) return FIXED;
  if (name === 'font-family') return { kind: 'choice', also };
  if (name.startsWith('easing-')) return { kind: 'choice', also: [...new Set([...also, ...CURVES])] };
  if (name.startsWith('weight-')) return { kind: 'weight', also };
  if (colourLike(value, values)) return { kind: 'colour', also };
  if (/gradient\(|^\d+px \d+px /.test(value)) return { kind: 'choice', also };
  if (/radius/.test(name) && (/^var\(--shape-/.test(value) || /^\d+px$/.test(value))) return { kind: 'corner', min: 0, max: 999, also };
  if (/^[\d.]+m?s(?:\s|$)/.test(value)) return { kind: 'time', max: 10_000, also };
  const size = SIZE.exec(value);
  const paired = also.find((text) => text.split(' ').length === 2 && text.split(' ').every((part) => SIZE.test(part)));
  if (size && paired) {
    const [min, max] = range(name, size[2] as Unit, Math.max(Number(size[1]), ...paired.split(' ').map((part) => Number(SIZE.exec(part)![1]))));
    return { kind: 'sizes', unit: size[2] as Unit, min, max, also };
  }
  if (size) {
    const [min, max] = range(name, size[2] as Unit, Number(size[1]));
    return { kind: 'size', unit: size[2] as Unit, min, max, also };
  }
  const pair = value.split(' ');
  if (pair.length === 2 && pair.every((part) => SIZE.test(part)) && SIZE.exec(pair[0]!)![2] === SIZE.exec(pair[1]!)![2]) {
    const unit = SIZE.exec(pair[0]!)![2] as Unit;
    const [min, max] = range(name, unit, Math.max(...pair.map((part) => Number(SIZE.exec(part)![1]))));
    return { kind: 'sizes', unit, min, max, also };
  }
  if (NUMBER.test(value)) {
    const [min, max] = range(name, 'number', Number(value));
    return { kind: 'number', min, max, also };
  }
  return FIXED;
}

/** The group of a name, by its first part. */
export function groupOf(name: string): Group {
  const rules: [RegExp, Group][] = [
    [/^c-/, 'colour'], [/^shape-/, 'shape'], [/^(font-|weight-|type-|tracking-)/, 'letter'], [/^(density-|space-)/, 'space'],
    [/^section-hero-|^hero-/, 'hero'], [/^section-/, 'sections'], [/^(tile-|tank-|dimmer-|room-card-)/, 'tiles'], [/^slider-/, 'sliders'],
    [/^(page-|rail-|nav-bar-|header-|chip-|edit-bar-)/, 'bar'], [/^(control-|flow-|button-|icon-button-|field-|switch-|choice-|swatch-|radio-)/, 'buttons'],
    [/^(sheet-|dialog-|snackbar-|banner-|note-|top-)/, 'sheets'], [/^chart-/, 'charts'], [/^rest-/, 'rest'], [/^(motion-|easing-|duration-|press-|focus-|state-)/, 'motion'],
  ];
  return rules.find(([rule]) => rule.test(name))?.[1] ?? 'other';
}

/**
 * The names a theme of another can count on, with their words: part and role, as keys under `values.part.` and
 * `values.role.`. A name on this list stays and keeps its meaning while the list is version 1.
 */
const LISTED: Record<string, readonly [string, string]> = {
  ...Object.fromEntries(SETTABLE_ROLES.map((role) => [roleName(role), ['colour', `c-${role}`] as const])),
  'font-family': ['letter', 'family'], 'weight-regular': ['letter', 'regular'], 'weight-medium': ['letter', 'medium'], 'weight-strong': ['letter', 'strong'],
  'type-hero-size': ['letter', 'hero'], 'type-greeting-size': ['letter', 'greeting'], 'type-value-size': ['letter', 'value'],
  'type-title-size': ['letter', 'title'], 'type-body-l-size': ['letter', 'body'], 'type-label-m-size': ['letter', 'label'],
  'shape-xs': ['shape', 'xs'], 'shape-sm': ['shape', 'sm'], 'shape-md': ['shape', 'md'], 'shape-lg': ['shape', 'lg'],
  'shape-xl': ['shape', 'xl'], 'shape-2xl': ['shape', '2xl'], 'shape-full': ['shape', 'full'],
  'motion-spatial': ['motion', 'spatial'], 'motion-effects': ['motion', 'effects'], 'press-scale': ['motion', 'press'],
  'focus-width': ['focus', 'width'], 'focus-color': ['focus', 'colour'],
  ...Object.fromEntries(Object.keys(rustigExpressive.density.comfortable).map((name) => [name, ['space', name.slice('density-'.length)] as const])),
  'page-bg': ['page', 'bg'], 'page-fg': ['page', 'fg'], 'page-max-width': ['page', 'max-width'],
  'rail-indicator-bg': ['rail', 'indicator'], 'rail-item-fg': ['rail', 'fg'], 'nav-bar-bg': ['navbar', 'bg'],
  'chip-bg': ['chip', 'bg'], 'chip-fg': ['chip', 'fg'], 'chip-radius': ['chip', 'radius'],
  'section-bg': ['section', 'bg'], 'section-fg': ['section', 'fg'], 'section-radius': ['section', 'radius'],
  'section-outline': ['section', 'outline'], 'section-outline-width': ['section', 'outline-width'],
  'section-hero-bg': ['hero', 'bg'], 'section-hero-fg': ['hero', 'fg'],
  'hero-wave-fg': ['hero', 'line'], 'hero-wave-track': ['hero', 'track'], 'hero-stat-bg': ['hero-stat', 'bg'], 'hero-stat-radius': ['hero-stat', 'radius'],
  'tile-bg': ['tile', 'bg'], 'tile-fg': ['tile', 'fg'], 'tile-state-fg': ['tile', 'state'], 'tile-radius': ['tile', 'radius'],
  'tile-outline': ['tile', 'outline'], 'tile-outline-width': ['tile', 'outline-width'],
  'tile-on-bg': ['tile-on', 'bg'], 'tile-on-fg': ['tile-on', 'fg'], 'tile-on-slider-fill': ['tile-on', 'fill'], 'tile-on-slider-track': ['tile-on', 'track'],
  'tile-icon-bg': ['tile-icon', 'bg'], 'tile-icon-fg': ['tile-icon', 'fg'], 'tile-icon-on-bg': ['tile-icon-on', 'bg'], 'tile-icon-on-fg': ['tile-icon-on', 'fg'],
  'tile-cell-bg': ['tile-cell', 'bg'], 'tank-fill': ['tank', 'fill'], 'tank-track': ['tank', 'track'],
  'dimmer-bg': ['dimmer', 'bg'], 'dimmer-fill': ['dimmer', 'fill'],
  'slider-fill': ['slider', 'fill'], 'slider-track': ['slider', 'track'], 'slider-radius': ['slider', 'radius'],
  'slider-off-fill': ['slider-off', 'fill'], 'slider-off-track': ['slider-off', 'track'],
  'control-bg': ['control', 'bg'], 'control-radius': ['control', 'radius'], 'control-main-bg': ['control-main', 'bg'], 'control-main-fg': ['control-main', 'fg'],
  'flow-bg': ['flow', 'bg'], 'flow-fg': ['flow', 'fg'], 'flow-radius': ['flow', 'radius'],
  'button-radius': ['button', 'radius'], 'button-filled-bg': ['button-filled', 'bg'], 'button-filled-fg': ['button-filled', 'fg'],
  'button-tonal-bg': ['button-tonal', 'bg'], 'button-tonal-fg': ['button-tonal', 'fg'], 'button-text-fg': ['button-text', 'fg'],
  'field-bg': ['field', 'bg'], 'field-fg': ['field', 'fg'], 'field-radius': ['field', 'radius'], 'field-focus': ['field', 'focus'],
  'switch-on-bg': ['switch-on', 'bg'], 'switch-on-thumb': ['switch-on', 'thumb'], 'switch-off-bg': ['switch-off', 'bg'], 'switch-off-thumb': ['switch-off', 'thumb'],
  'choice-bg': ['choice', 'bg'], 'choice-fg': ['choice', 'fg'], 'choice-on-bg': ['choice-on', 'bg'], 'choice-on-fg': ['choice-on', 'fg'],
  'sheet-bg': ['sheet', 'bg'], 'sheet-fg': ['sheet', 'fg'], 'sheet-radius': ['sheet', 'radius'], 'sheet-row-bg': ['sheet-row', 'bg'],
  'dialog-bg': ['dialog', 'bg'], 'dialog-radius': ['dialog', 'radius'],
  'snackbar-bg': ['snackbar', 'bg'], 'snackbar-fg': ['snackbar', 'fg'], 'banner-ok-bg': ['banner-ok', 'bg'], 'banner-ok-fg': ['banner-ok', 'fg'],
  'note-bg': ['note', 'bg'], 'note-fg': ['note', 'fg'],
  'chart-line': ['chart', 'line'], 'chart-line-2': ['chart', 'line-2'], 'chart-area': ['chart', 'area'],
  'chart-tip-bg': ['chart-tip', 'bg'], 'chart-tip-fg': ['chart-tip', 'fg'],
  'rest-bg': ['rest', 'bg'], 'rest-fg': ['rest', 'fg'], 'rest-accent': ['rest', 'accent'],
  'edit-bar-bg': ['edit-bar', 'bg'], 'edit-bar-fg': ['edit-bar', 'fg'],
};

function build(): readonly Entry[] {
  const values = rustigValues();
  const texts = builtInTexts();
  return Object.freeze(Object.entries(values).map(([name, value]) => {
    const also = Object.freeze([...(texts.get(name) ?? [])]);
    const words = LISTED[name];
    const kind = kindOf(name, value, also, values);
    const listed = words !== undefined && kind.kind !== 'fixed';
    return Object.freeze({ name, kind, group: groupOf(name), listed, ...(listed ? { words } : {}) });
  }));
}

/** Every value of the dashboard, the listed ones first in the order of the list. */
export const CATALOGUE: readonly Entry[] = build();
const BY_NAME = new Map(CATALOGUE.map((entry) => [entry.name, entry]));

export const entryOf = (name: string): Entry | undefined => BY_NAME.get(name);
export const LISTED_NAMES: readonly string[] = Object.freeze(Object.keys(LISTED).filter((name) => BY_NAME.get(name)?.listed));
