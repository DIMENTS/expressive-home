import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { appManifest } from './tools/app-manifest.mjs';
import { contentSecurityPolicy } from './tools/csp.mjs';
import { widgetFrame } from './tools/widget-frame.mjs';
import packageJson from './package.json' with { type: 'json' };

/** Puts the content security policy into every page: the strict one in a build, the dev one on the dev server. */
function cspPlugin(): Plugin {
  let mode: 'build' | 'dev' = 'dev';
  return {
    name: 'content-security-policy',
    configResolved(config) {
      mode = config.command === 'build' ? 'build' : 'dev';
    },
    transformIndexHtml() {
      // First in the head, so it applies to every script and style that follows.
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(mode) }, injectTo: 'head-prepend' }];
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [cspPlugin(), appManifest(), widgetFrame()],
  define: { __APP_VERSION__: JSON.stringify(packageJson.version), __SERVED_BY_HOMEY__: 'false' },
  // Two pages: the app, and the inspection page with the route log and the event counter.
  // Never inline a file as a data: address: the policy allows fonts only from our own origin.
  build: { assetsInlineLimit: 0, rollupOptions: { input: { main: 'index.html', inspectie: 'inspectie.html' } } },
  // An own strict port: the inspection page keeps the key in localStorage, which every page on the same origin can read.
  server: { port: 5273, strictPort: true },
  preview: { port: 5274, strictPort: true },
  test: {
    // A checkout can hold worktrees of other branches; their tests are not ours.
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // a computer that has just started is slow; what hangs is still found
    testTimeout: 20_000,
    // The colour library ships extensionless ESM imports that Node cannot resolve; let Vite process it.
    server: { deps: { inline: ['@material/material-color-utilities'] } },
  },
});
