// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { applySectionTheme, applyThemeTo } from '../../src/ui/apply-theme';
import { colorTokens, sectionTokens } from '../../src/theme/engine';
import { rustigExpressive } from '../../src/theme/rustig-expressive';

test('the theme lands on the element as variables, with the resolved mode and the density as attributes', () => {
  const root = document.createElement('div');
  applyThemeTo(root, { seed: '#3b6939', mode: 'auto', density: 'compact' }, true);
  expect(root.dataset['mode']).toBe('dark');
  expect(root.dataset['density']).toBe('compact');
  expect(root.style.getPropertyValue('--density-tile-height')).toBe('56px');
  expect(root.style.getPropertyValue('--c-surface')).toMatch(/^#[0-9a-f]{6}$/);
  applyThemeTo(root, { seed: '#3b6939', mode: 'auto', density: 'comfortable' }, false);
  expect(root.dataset['mode']).toBe('light');
  expect(root.style.getPropertyValue('--density-tile-height')).toBe('112px');
});

test('on a phone the sizes of the phone land on the element', () => {
  const root = document.createElement('div');
  applyThemeTo(root, { seed: '#3b6939', mode: 'light', density: 'phone' }, false);
  expect([root.dataset['density'], root.style.getPropertyValue('--density-tile-height')]).toEqual(['phone', '60px']);
});

test('a section gets its own palette on its element, and loses it again', () => {
  const section = document.createElement('section');
  applySectionTheme(section, '#3a5ba9', 'light');
  expect(section.style.getPropertyValue('--c-primary')).toBe(colorTokens('#3a5ba9', 'light', 0)['--c-primary']);
  expect(section.style.getPropertyValue('--tile-on-bg')).toBe('var(--c-primary-container)');
  expect(section.style.getPropertyValue('--c-error')).toBe('');
  expect(section.hasAttribute('data-own-seed')).toBe(true);
  applySectionTheme(section, null, 'light');
  const left = Object.keys(sectionTokens(rustigExpressive, '#3a5ba9', 'light')).filter((name) => section.style.getPropertyValue(name) !== '');
  expect(left).toEqual([]);
  expect(section.hasAttribute('data-own-seed')).toBe(false);
});

test('a section palette follows dark mode', () => {
  const section = document.createElement('section');
  applySectionTheme(section, '#3a5ba9', 'light');
  applySectionTheme(section, '#3a5ba9', 'dark');
  expect(section.style.getPropertyValue('--c-surface')).toBe(colorTokens('#3a5ba9', 'dark', 0)['--c-surface']);
});

test('an invalid seed is ignored: no own palette', () => {
  const section = document.createElement('section');
  applySectionTheme(section, '#3a5ba9', 'light');
  applySectionTheme(section, 'blauw', 'light');
  expect(section.style.getPropertyValue('--c-primary')).toBe('');
  expect(section.hasAttribute('data-own-seed')).toBe(false);
});

test('the bar of a phone gets the colour of the page, only for the document', () => {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  document.head.append(meta);
  applyThemeTo(document.documentElement, { seed: '#3b6939', mode: 'dark', density: 'phone' }, false);
  expect(meta.content).toBe(colorTokens('#3b6939', 'dark', 0)['--c-surface-container']);
  applyThemeTo(document.createElement('div'), { seed: '#3b6939', mode: 'light', density: 'phone' }, false);
  expect(meta.content).toBe(colorTokens('#3b6939', 'dark', 0)['--c-surface-container']);
  meta.remove();
});
