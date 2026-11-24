import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { computeTokens } from '../../src/theme/engine';
import { rustigExpressive } from '../../src/theme/rustig-expressive';

const css = readFileSync('docs/design/tokens.css', 'utf8');
const norm = (v: string) => v.replace(/\s+/g, ' ').trim().toLowerCase();

/** All custom-property declarations of the blocks whose selector list contains `selector`. */
function declarations(source: string, selector: string): Map<string, string> {
  const found = new Map<string, string>();
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const block of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = block[1]!.split(',').map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    for (const declaration of block[2]!.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      const name = declaration.slice(0, colon).trim();
      if (name.startsWith('--')) found.set(name, declaration.slice(colon + 1).trim());
    }
  }
  return found;
}

test.each([
  ['light and comfortable', ':root', { seed: '#3b6939', mode: 'light', density: 'comfortable' }],
  ['dark', ':root[data-mode="dark"]', { seed: '#3b6939', mode: 'dark', density: 'comfortable' }],
  ['compact', ':root[data-density="compact"]', { seed: '#3b6939', mode: 'light', density: 'compact' }],
  ['phone', ':root[data-density="phone"]', { seed: '#3b6939', mode: 'light', density: 'phone' }],
] as const)('every token the mockup declares comes out of the engine: %s', (_name, selector, settings) => {
  const tokens = computeTokens(rustigExpressive, settings, false);
  const declared = declarations(css, selector);
  expect(declared.size).toBeGreaterThan(8);
  for (const [name, value] of declared) expect([name, norm(tokens[name] ?? '')]).toEqual([name, norm(value)]);
});

test('every value the theme adds is declared in the mockup too, so the two never drift apart', () => {
  const declared = new Set([...declarations(css, ':root').keys(), ...declarations(css, ':root[data-density="compact"]').keys()]);
  const names = [
    ...Object.keys(rustigExpressive.system), ...Object.keys(rustigExpressive.density.comfortable), ...Object.keys(rustigExpressive.components),
  ].map((name) => `--${name}`);
  expect(names.filter((name) => !declared.has(name))).toEqual([]);
});
