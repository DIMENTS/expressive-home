import { expect, test } from 'vitest';
import { cssFakesAlarm } from '../../../src/theme/css/fake-alarm';
import { BUILT_IN } from '../../../src/theme/look';
import { computeLook, styleOf } from '../../../src/theme/styles';

const tokens = computeLook(styleOf(BUILT_IN[0]!), { seed: '#3b6939', mode: 'light', density: 'comfortable' }, false);
const alarm = tokens['--c-error-container']!;
expect(alarm).toBe('#ffdad6');

test('plain tiles in the colour of an alarm are a fake alarm; other colours, or only alarm tiles, are not', () => {
  expect(cssFakesAlarm(`::part(tile) { background: ${alarm} }`, tokens)).toBe(true);
  expect(cssFakesAlarm(`::part(tile off) { background-color: ${alarm} }`, tokens)).toBe(true);
  expect(cssFakesAlarm('::part(tile) { background: var(--c-error-container) }', tokens)).toBe(false);
  expect(cssFakesAlarm('::part(tile) { background: #062010 }', tokens)).toBe(false);
  expect(cssFakesAlarm(`::part(tile alert) { background: ${alarm} }`, tokens)).toBe(false);
  expect(cssFakesAlarm(`::part(section) { color: ${alarm} }`, tokens)).toBe(false);
  expect(cssFakesAlarm('', tokens)).toBe(false);
});

test('every way to give plain tiles the colour of an alarm is seen', () => {
  for (const css of [
    '::part(tile) { background: rgb(255, 218, 214) }',
    '::part(tile) { background: rgb(255 218 214 / 100%) }',
    '::part(page), ::part(tile) { background: #ffdad6 }',
    '::part(tile) { background-image: linear-gradient(#ffdad6, #ffdad6) }',
    '::part(tile) { box-shadow: inset 0 0 0 16px #ffdad6 }',
    '::part(section) { --tile-bg: #ffdad6 }',
    '::part(tile on) { background: #FFDAD6 }',
  ]) expect([css, cssFakesAlarm(css, tokens)]).toEqual([css, true]);
  expect(cssFakesAlarm('::part(tile) { background: rgb(6, 32, 16) }', tokens)).toBe(false);
});
