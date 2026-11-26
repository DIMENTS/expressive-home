import { expect, test } from 'vitest';
import type { ThemeFile } from '../../src/theme/look';
import { ownCss } from '../../src/ui/own-css';

const theme = (id: string, text: string): ThemeFile => ({ format: 2, id, name: id, maker: '', base: 'rustig', seed: null, userSeed: true, knobs: {}, app: '1.4.0', css: { version: 1, text } });
const house = theme('t-0000000000000001', '::part(tile) { box-shadow: 0 0 4px #3f3; color: #fff } ::part(rest-clock) { color: #3f3 }');
const board = theme('t-0000000000000002', '::part(section) { color: #ff0 } ::part(rest) { color: #f00 }');
const base = { shown: house, resting: house, cssFrom: { [house.id]: 'house' as const, [board.id]: 'other' as const }, allowed: () => false, role: 'edit' as const, off: false };

test('the house’s own CSS uses the wide list, on the dashboard and on the rest screen', () => {
  const out = ownCss(base);
  expect(out.dashboard).toContain('box-shadow:0 0 4px #3f3');
  expect(out.rest).toBe('mh-app::part(rest-clock){color:#3f3}');
});

test('a dashboard theme sets the dashboard, never the rest screen, which follows the device and the house', () => {
  const out = ownCss({ ...base, shown: board });
  expect(out.dashboard).toBe('mh-app::part(section){color:#ff0}');
  expect(out.rest).toBe('mh-app::part(rest-clock){color:#3f3}');
});

test('someone else’s CSS uses the narrow list until this device allowed exactly that text, and only a device that may edit can', () => {
  const other = { ...base, cssFrom: { [house.id]: 'other' as const } };
  expect(ownCss(other).dashboard).toBe('mh-app::part(tile){color:#fff}');
  expect(ownCss({ ...other, allowed: (id, text) => id === house.id && text === house.css!.text }).dashboard).toContain('box-shadow');
  expect(ownCss({ ...other, role: 'use', allowed: () => true }).dashboard).toBe('mh-app::part(tile){color:#fff}');
  expect(ownCss({ ...other, role: 'own', allowed: () => true }).dashboard).toContain('box-shadow');
});

test('no CSS when it is off (#veilig, Helder), and none for a theme without CSS', () => {
  expect(ownCss({ ...base, off: true })).toEqual({ dashboard: '', rest: '' });
  expect(ownCss({ ...base, shown: { ...house, css: undefined }, resting: { ...house, css: undefined } })).toEqual({ dashboard: '', rest: '' });
});

test('keyframes of two themes never meet', () => {
  const moving = (id: string) => theme(id, '@keyframes glow { to { color: #fff } } ::part(tile) { animation: glow 1s }');
  const a = ownCss({ ...base, shown: moving('t-00000000000000aa'), cssFrom: { 't-00000000000000aa': 'house' } }).dashboard;
  const b = ownCss({ ...base, shown: moving('t-00000000000000bb'), cssFrom: { 't-00000000000000bb': 'house' } }).dashboard;
  expect(a.match(/@keyframes (\S+)\{/)![1]).not.toBe(b.match(/@keyframes (\S+)\{/)![1]);
});
