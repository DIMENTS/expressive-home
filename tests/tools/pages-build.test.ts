import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import app from '../../vite.config';
import pages from '../../vite.pages.config';

// The page on GitHub Pages is the app alone: the inspection page reads the same key and is for measuring, not for use.

type Built = { build?: { outDir?: string; rollupOptions?: { input?: Record<string, string> } }; plugins?: unknown[]; base?: string; define?: Record<string, string> };
const [appConfig, pagesConfig] = [app as Built, pages as Built];

test('the page for GitHub Pages builds only the app, into a folder of its own', () => {
  expect(pagesConfig.build?.rollupOptions?.input).toEqual({ main: 'index.html' });
  expect(pagesConfig.build?.outDir).toBe('dist-pages');
});

test('and otherwise is the app as it is built: the policy, the manifest, the widget frame and relative addresses', () => {
  expect(pagesConfig.plugins).toBe(appConfig.plugins);
  expect(pagesConfig.base).toBe('./');
  expect(pagesConfig.define).toEqual(appConfig.define);
  expect(pagesConfig.build?.outDir).not.toBe(appConfig.build?.outDir ?? 'dist');
});

test('the ordinary build keeps both pages', () => {
  expect(appConfig.build?.rollupOptions?.input).toEqual({ main: 'index.html', inspectie: 'inspectie.html' });
});

test('there is a command for it, and its folder is never committed', () => {
  const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;
  expect(scripts['build:pages']).toBe('tsc --noEmit && vite build -c vite.pages.config.ts');
  expect(readFileSync('.gitignore', 'utf8').split('\n')).toContain('dist-pages/');
});

test('the page tells nobody where it comes from: the Homey cloud does not need its address', () => {
  expect(readFileSync('index.html', 'utf8')).toMatch(/<meta name="referrer" content="no-referrer">/);
});

test('it takes nothing of the development and preview servers of the app, nor of its tests', () => {
  const extra = pages as { server?: unknown; preview?: unknown; test?: unknown };
  expect([extra.server, extra.preview, extra.test]).toEqual([undefined, undefined, undefined]);
});
