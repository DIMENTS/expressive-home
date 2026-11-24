import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { computeTokens } from '../../src/theme/engine';
import { rustigExpressive } from '../../src/theme/rustig-expressive';
import { appManifest, ICON_FILES, MANIFEST } from '../../tools/app-manifest.mjs';

const page = '<!doctype html><html><head></head><body></body></html>';
type Tag = { tag: string; attrs: Record<string, string> };

test('the manifest opens the dashboard on its own, in the colours of the theme', () => {
  const surface = computeTokens(rustigExpressive, { seed: rustigExpressive.color.defaultSeed, mode: 'light', density: 'comfortable' }, false)['--c-surface-container'];
  expect(MANIFEST).toMatchObject({ name: 'Expressive Home', short_name: 'Expressive', start_url: './', scope: './', display: 'standalone', lang: 'nl', theme_color: surface, background_color: surface });
  expect(MANIFEST.icons.map((icon) => [icon.src, icon.sizes, icon.type, icon.purpose ?? 'any'])).toEqual([
    ['icons/icon-192.png', '192x192', 'image/png', 'any'], ['icons/icon-512.png', '512x512', 'image/png', 'any'], ['icons/icon-maskable-512.png', '512x512', 'image/png', 'maskable'],
  ]);
});

test('every icon is there, in the size it says', () => {
  const sizes: Record<string, number> = { 'icon-192.png': 192, 'icon-512.png': 512, 'icon-maskable-512.png': 512, 'apple-touch-icon.png': 180 };
  expect([...ICON_FILES].sort()).toEqual([...Object.keys(sizes), 'icon.svg'].sort());
  for (const [name, size] of Object.entries(sizes)) {
    const png = readFileSync(`src/app-icon/${name}`);
    expect([name, png.subarray(1, 4).toString('latin1'), png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([name, 'PNG', size, size]);
  }
  expect(readFileSync('src/app-icon/icon.svg', 'utf8')).toMatch(/^<svg/);
});

test('the dashboard points at them, the inspection page does not', () => {
  const transform = appManifest().transformIndexHtml as (html: string, context: { path: string }) => Tag[] | undefined;
  const tags = transform(page, { path: '/index.html' })!;
  const of = (tag: string) => tags.filter((t) => t.tag === tag).map((t) => t.attrs);
  expect(of('link')).toEqual([{ rel: 'manifest', href: './manifest.webmanifest' }, { rel: 'icon', type: 'image/svg+xml', href: './icons/icon.svg' }, { rel: 'apple-touch-icon', href: './icons/apple-touch-icon.png' }]);
  expect(of('meta')).toEqual([
    { name: 'theme-color', content: MANIFEST.theme_color }, { name: 'mobile-web-app-capable', content: 'yes' }, { name: 'apple-mobile-web-app-capable', content: 'yes' }, { name: 'apple-mobile-web-app-title', content: 'Expressive' },
  ]);
  expect(transform(page, { path: '/inspectie.html' })).toBeUndefined();
});

test('the build holds the manifest and the icons under fixed names', () => {
  const files: Record<string, unknown> = {};
  const generate = appManifest().generateBundle as unknown as (this: { emitFile(file: { fileName: string; source: unknown }): void }) => void;
  generate.call({ emitFile: (file) => { files[file.fileName] = file.source; } });
  expect(Object.keys(files).sort()).toEqual(['manifest.webmanifest', ...ICON_FILES.map((name) => `icons/${name}`)].sort());
  expect(JSON.parse(String(files['manifest.webmanifest']))).toEqual(MANIFEST);
});
