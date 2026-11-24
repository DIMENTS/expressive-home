import { expect, test } from 'vitest';
import { extractCss, findFixedCssom, findFixedValues } from '../../tools/fixed-values.mjs';

const reasons = (css: string) => findFixedValues(css).map((f) => f.reason);

test.each([
  ['color: #fff', 'colour'], ['background: rgb(0 0 0 / .2)', 'colour'], ['color: white', 'colour'],
  ['padding: 12px', 'length'], ['gap: var(--space-8, 8px)', 'length'], ['margin: 0 0 .5rem', 'length'],
  ['transition: opacity 200ms', 'time'], ['animation: spin 2s linear infinite', 'time'],
  ['transition-timing-function: cubic-bezier(.3, 1, .2, 1)', 'easing'], ['transition: transform var(--x) ease-out', 'easing'],
  ['font-size: 1.2em', 'length'], ['font-weight: 600', 'type'], ['line-height: 1.3', 'type'], ['opacity: .6', 'opacity'],
])('%s is a fixed value', (declaration, reason) => { expect(reasons(`:host { ${declaration}; }`)).toEqual([reason]); });

test.each([
  'color: var(--tile-fg)', 'background: color-mix(in srgb, currentColor var(--state-hover), transparent)', 'padding: 0', 'width: 100%', 'flex: 1 1 0',
  'grid-template-columns: repeat(4, minmax(0, 1fr))', 'opacity: 0', 'opacity: 1', 'opacity: var(--state-stale)', 'font-weight: var(--weight-strong)',
  'height: calc(var(--target-min) - var(--slider-height))', 'inset: 0', 'z-index: var(--layer-sheet)', 'z-index: 0', 'animation: spin var(--motion-loader) linear infinite',
  'transform: translate(-50%, calc(100% + var(--space-40)))', 'transform: scale(1)', 'transform: scale(var(--flow-press-scale))', 'filter: none', 'flex: 0 0 100%',
  'border-radius: var(--shape-full)', 'background: transparent', 'color: currentColor', 'grid-template-columns: 1fr 2fr', 'animation-name: shift',
  'transform: translateX(calc(100% + 2 * var(--sheet-margin)))', 'transform: translateY(calc(var(--x) / 2))',
])('%s is allowed', (declaration) => { expect(reasons(`:host { ${declaration}; }`)).toEqual([]); });

test('conditions of @media and @container are not checked', () => {
  expect(reasons('@container (max-width: 600px) { .tiles { gap: var(--tile-gap); } }')).toEqual([]);
});

test('names of variables are not read as values', () => {
  expect(reasons(':host { border-radius: var(--shape-2xl); gap: var(--space-24); }')).toEqual([]);
});

test('a local variable cannot smuggle a fixed value in', () => {
  expect(reasons(':host { --_gap: 12px; }')).toEqual(['length']);
});

test('a finding names its line and declaration', () => {
  expect(findFixedValues(':host {\n  gap: var(--tile-gap);\n  color: red;\n}')).toEqual([{ line: 3, declaration: 'color: red', reason: 'colour' }]);
});

test('extractCss reads every css template and marks each inserted expression', () => {
  expect(extractCss('const a = css`:host { gap: ${x}; }`; const b = css`p { color: red; }`;')).toEqual([':host { gap: __interpolated__; }', 'p { color: red; }']);
});

test('extractCss copes with braces inside an expression', () => {
  expect(extractCss('css`@container (max-width: ${px({ a: 1 })}px) { p { gap: 0; } }`')).toEqual(['@container (max-width: __interpolated__px) { p { gap: 0; } }']);
});

test.each([
  ['height: 100vh', 'length'], ['max-width: calc(100vw - var(--space-32))', 'length'], ['min-height: 50dvh', 'length'], ['width: 40vmin', 'length'], ['height: 10vmax', 'length'],
  ['width: 50cqw', 'length'], ['height: 20cqh', 'length'], ['inline-size: 30cqi', 'length'], ['block-size: 30cqb', 'length'],
  ['transform: rotate(90deg)', 'angle'], ['transform: rotate(.25turn)', 'angle'], ['rotate: 1rad', 'angle'],
  ['color: rebeccapurple', 'colour'], ['background: tomato', 'colour'], ['border-color: lightgoldenrodyellow', 'colour'], ['fill: navy', 'colour'],
  ['z-index: 80', 'layer'], ['z-index: -1', 'layer'],
  ['transform: scale(.96)', 'transform'], ['transform: scale(1.2) translateX(10%)', 'transform'], ['filter: brightness(1.1)', 'transform'], ['filter: blur(var(--x)) saturate(2)', 'transform'],
  ['border-radius: 50%', 'radius'], ['border-top-left-radius: 20%', 'radius'], ['flex: 0 0 52%', 'length'], ['flex-basis: 30%', 'length'],
  ['gap: __interpolated__', 'interpolated'], ['width: calc(__interpolated__ * 1px)', 'interpolated'],
])('%s is a fixed value too', (declaration, reason) => { expect(reasons(`:host { ${declaration}; }`)).toEqual([reason]); });

test('an inserted constant in a condition of @media or @container is allowed', () => {
  expect(reasons(extractCss('css`@container (width < ${HERO_STACK_MAX_PX}px) { .grid { gap: var(--x); } }`')[0]!)).toEqual([]);
  expect(reasons(extractCss('css`.grid { gap: ${GAP}; }`')[0]!)).toEqual(['interpolated']);
});

test('a value put in through the CSSOM with a unit is a fixed value', () => {
  expect(findFixedCssom("this.style.setProperty('--_wave-length', `${WAVE_LENGTH}px`);")).toEqual([{ line: 1, call: "setProperty('--_wave-length', `${WAVE_LENGTH}px`)" }]);
  expect(findFixedCssom("el.style.setProperty('--_gap', '12px');\nel.style.setProperty('--_t', '200ms');").map((f) => f.line)).toEqual([1, 2]);
  // a share or a seed carries no unit
  expect(findFixedCssom("this.style.setProperty('--_v', String(fraction * 100));\nswatch.style.setProperty('--_seed', seed);")).toEqual([]);
});
