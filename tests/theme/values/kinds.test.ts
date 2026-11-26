import { expect, test } from 'vitest';
import { checkColour, checkValue, SETTABLE_ROLES, type Kind } from '../../../src/theme/values/kinds';

const colour: Kind = { kind: 'colour', also: [] };
const px: Kind = { kind: 'size', unit: 'px', min: 0, max: 400, also: [] };

test('a colour is a hex, a role, transparent, the text colour or a mix of two', () => {
  expect(checkColour('#7D4CFF')).toBe('#7d4cff');
  expect(checkColour('#7d4cff80')).toBe('#7d4cff80');
  expect(checkColour('var(--c-primary)')).toBe('var(--c-primary)');
  expect(checkColour('transparent')).toBe('transparent');
  expect(checkColour('currentcolor')).toBe('currentColor');
  expect(checkColour('color-mix(in srgb,var(--c-primary) 24%,  transparent)')).toBe('color-mix(in srgb, var(--c-primary) 24%, transparent)');
  expect(checkColour('color-mix(in srgb, var(--c-secondary-container), var(--c-secondary) 14%)')).toBe('color-mix(in srgb, var(--c-secondary-container), var(--c-secondary) 14%)');
  expect(checkColour('color-mix(in srgb, #ffffff 50.5%, #000000)')).toBe('color-mix(in srgb, #ffffff 50.5%, #000000)');
});

test('a colour never refers to danger, to a value of a part, or to something outside', () => {
  for (const bad of [
    'var(--c-error)', 'var(--c-on-error-container)', 'var(--tile-alert-bg)', 'var(--tile-bg)', 'var(--c-nope)', 'red', '#fff', '#12345', 'rgb(1,2,3)',
    'url(x)', 'image-set("a.png" 1x)', 'attr(data-x)', 'env(safe-area-inset-top)', 'expression(alert(1))', '#ffffff !important', '#ffffff;',
    '#ffffff}', '/*x*/#ffffff', 'color-mix(in srgb, url(x) 5%, #fff)', 'color-mix(in srgb, #fff 150%, #000)', 'color-mix(in srgb, #fff, #000, #111)',
    'color-mix(in srgb, var(--c-error) 5%, #fff)', 'color-mix(in oklch, #fff, #000)', 'var(--c-primary, url(x))',
  ]) expect([bad, checkColour(bad)]).toEqual([bad, null]);
});

test('the colour roles a theme may set leave out the error roles', () => {
  expect(SETTABLE_ROLES).toHaveLength(29);
  expect(SETTABLE_ROLES.some((role) => role.includes('error'))).toBe(false);
  expect(SETTABLE_ROLES).toContain('scrim');
});

test('a size is a number in its own unit, within its range', () => {
  expect(checkValue(px, '14px')).toBe('14px');
  expect(checkValue(px, ' 14.50px ')).toBe('14.5px');
  expect(checkValue(px, '0px')).toBe('0px');
  for (const bad of ['14', '14em', '-1px', '401px', '1e3px', 'NaNpx', 'Infinitypx', '14px 2px', 'calc(1px)', '99999999px']) expect([bad, checkValue(px, bad)]).toEqual([bad, null]);
  const negative: Kind = { kind: 'size', unit: 'em', min: -1, max: 4, also: [] };
  expect(checkValue(negative, '-.02em')).toBe('-0.02em');
});

test('two sizes, a corner, a number, a time and a weight', () => {
  const sizes: Kind = { kind: 'sizes', unit: 'px', min: 0, max: 64, also: [] };
  expect(checkValue(sizes, '10px  12px')).toBe('10px 12px');
  expect(checkValue(sizes, '10px')).toBe('10px');
  expect(checkValue(sizes, '10px 12px 4px')).toBeNull();
  expect(checkValue(sizes, '10px 12em')).toBeNull();
  const corner: Kind = { kind: 'corner', min: 0, max: 999, also: [] };
  expect(checkValue(corner, 'var(--shape-xl)')).toBe('var(--shape-xl)');
  expect(checkValue(corner, '0px')).toBe('0px');
  expect(checkValue(corner, 'var(--shape-cookie)')).toBeNull();
  expect(checkValue(corner, 'var(--tile-radius)')).toBeNull();
  const scale: Kind = { kind: 'number', min: 0.8, max: 1.25, also: [] };
  expect(checkValue(scale, '.97')).toBe('0.97');
  expect(checkValue(scale, '0.5')).toBeNull();
  const time: Kind = { kind: 'time', max: 10_000, also: [] };
  expect(checkValue(time, '200ms cubic-bezier(.34, .8, .34, 1)')).toBe('200ms cubic-bezier(.34,.8,.34,1)');
  expect(checkValue(time, '1.8s')).toBe('1.8s');
  expect(checkValue(time, '0ms')).toBe('0ms');
  expect(checkValue(time, '11s')).toBeNull();
  expect(checkValue(time, '200ms steps(4)')).toBeNull();
  const weight: Kind = { kind: 'weight', also: [] };
  expect(checkValue(weight, '700')).toBe('700');
  expect(checkValue(weight, '650')).toBeNull();
  expect(checkValue(weight, '1000')).toBeNull();
});

test('a choice takes only the texts it lists, and fixed takes nothing', () => {
  const choice: Kind = { kind: 'choice', also: ['system-ui, sans-serif'] };
  expect(checkValue(choice, 'system-ui,   sans-serif')).toBe('system-ui, sans-serif');
  expect(checkValue(choice, 'Comic Sans')).toBeNull();
  expect(checkValue({ kind: 'fixed' }, '1px')).toBeNull();
});

test('a thousand random texts never give anything outside what a value may hold', () => {
  let state = 3;
  const random = (): number => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const bits = ['#', 'f', '0', '9', 'px', 'em', '%', ' ', ',', '(', ')', 'var', '--c-', 'primary', 'url', ';', '{', '}', '!', 'important', 'color-mix(in srgb,', '-', '.', 'e', 'ms', 's', '"', "'", '\\', '/*'];
  const kinds: Kind[] = [colour, px, { kind: 'sizes', unit: 'px', min: 0, max: 64, also: [] }, { kind: 'corner', min: 0, max: 999, also: [] }, { kind: 'number', min: 0, max: 4, also: [] }, { kind: 'time', max: 10_000, also: [] }, { kind: 'weight', also: [] }];
  for (let i = 0; i < 1000; i += 1) {
    const text = Array.from({ length: 1 + Math.floor(random() * 12) }, () => bits[Math.floor(random() * bits.length)]).join('');
    for (const kind of kinds) {
      const out = checkValue(kind, text);
      if (out === null) continue;
      expect(out).toMatch(/^[a-z0-9#%.,() -]*$/i);
      expect(out).not.toMatch(/url|important|[;{}!"'\\]|\/\*/);
    }
  }
});
