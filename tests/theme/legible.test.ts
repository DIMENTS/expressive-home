import { expect, test } from 'vitest';
import { coloursOf, contrastOf, legibility, TEXT_PAIRS } from '../../src/theme/legible';
import { BUILT_IN } from '../../src/theme/look';
import { rustigExpressive } from '../../src/theme/rustig-expressive';
import { computeLook, sectionLook, styleOf } from '../../src/theme/styles';

const rgb = (r: number, g: number, b: number, a = 1) => ({ r: r / 255, g: g / 255, b: b / 255, a });

test('black on white is 21, a colour on itself is 1', () => {
  expect(contrastOf(rgb(0, 0, 0), rgb(255, 255, 255))).toBeCloseTo(21, 5);
  expect(contrastOf(rgb(59, 105, 57), rgb(59, 105, 57))).toBe(1);
});

test('references, mixes, transparency and gradients are followed as a browser does', () => {
  const tokens = { '--a': '#ff0000', '--b': 'var(--a)', '--half': 'color-mix(in srgb, var(--a) 50%, transparent)', '--grey': 'color-mix(in srgb, #000000 50%, #ffffff)', '--g': 'linear-gradient(160deg, var(--a), #0000ff 55%, #00ff00)' };
  expect(coloursOf('var(--b)', tokens)).toEqual([rgb(255, 0, 0)]);
  expect(coloursOf('var(--half)', tokens)).toEqual([{ r: 1, g: 0, b: 0, a: 0.5 }]);
  expect(coloursOf('var(--grey)', tokens)![0]!.r).toBeCloseTo(0.5, 5);
  expect(coloursOf('var(--g)', tokens)).toHaveLength(3);
  expect(coloursOf('var(--missing)', tokens)).toBeNull();
  expect(coloursOf('url(x)', tokens)).toBeNull();
  expect(coloursOf('var(--loop)', { '--loop': 'var(--loop)' })).toBeNull();
});

test('a text that sinks into its background is caught, also through a see-through surface over a gradient', () => {
  const base = computeLook(styleOf(BUILT_IN[0]!), { seed: '#3b6939', mode: 'light', density: 'comfortable' }, false);
  const same = legibility({ ...base, '--tile-fg': 'var(--tile-bg)' }).find((r) => r.id === 'tile')!;
  expect(same).toEqual({ id: 'tile', ratio: 1, ok: false });
  // fine over the dark start of the gradient, not over its light end
  const gradient = { ...base, '--page-bg': 'linear-gradient(160deg, #000000, #ffffff)', '--section-bg': 'color-mix(in srgb, #000000 30%, transparent)', '--section-fg': '#ffffff' };
  expect(legibility(gradient).find((r) => r.id === 'section')!.ok).toBe(false);
  expect(legibility({ ...gradient, '--page-bg': '#000000' }).find((r) => r.id === 'section')!.ok).toBe(true);
  expect(legibility({ ...base, '--tile-fg': 'url(x)' }).find((r) => r.id === 'tile')).toEqual({ id: 'tile', ratio: 0, ok: false });
});

test('every built-in style is readable in light and dark, with every base colour and every colour per section', () => {
  const failures: string[] = [];
  for (const file of BUILT_IN) {
    for (const mode of ['light', 'dark'] as const) {
      for (const { seed } of rustigExpressive.color.presets) {
        const base = computeLook(styleOf(file), { seed, mode, density: 'comfortable' }, false);
        for (const own of [null, ...rustigExpressive.color.presets.map((preset) => preset.seed)]) {
          const tokens = own === null ? base : { ...base, ...sectionLook(styleOf(file), own, mode) };
          for (const result of legibility(tokens)) if (!result.ok) failures.push(`${file.base} ${mode} ${seed} ${own ?? '-'} ${result.id} ${result.ratio}`);
        }
      }
    }
  }
  expect(failures).toEqual([]);
});

test('the pairs cover every surface a theme can change', () => {
  const stacks = new Set(TEXT_PAIRS.flatMap((pair) => pair.stack));
  for (const name of ['--page-bg', '--section-bg', '--section-hero-bg', '--tile-bg', '--tile-on-bg', '--tile-icon-bg', '--chip-bg', '--sheet-bg']) expect(stacks).toContain(name);
});

test('the charts are measured too: the lines, the tip, on against its track, and the text of a tile on its area', () => {
  const ids = TEXT_PAIRS.map((pair) => pair.id);
  for (const id of ['hero-chart', 'window-chart', 'chart-tip', 'chart-band', 'tile-trend', 'tile-trend-state']) expect(ids).toContain(id);
  // an area in the colour of the text is measured with that colour
  const tokens = { '--page-bg': '#ffffff', '--section-bg': '#ffffff', '--tile-bg': '#ffffff', '--tile-fg': '#000000', '--area': 'color-mix(in srgb, currentColor 90%, transparent)' };
  const [dark] = legibility(tokens, [{ id: 'x', fg: '--tile-fg', stack: ['--area', '--tile-bg'], current: '--tile-fg', min: 4.5 }]);
  expect(dark!.ok).toBe(false);
});
