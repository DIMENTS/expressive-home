import { defineConfig, type Plugin } from 'vite';
import { appManifest } from './tools/app-manifest.mjs';
import { contentSecurityPolicy } from './tools/csp.mjs';
import packageJson from './package.json' with { type: 'json' };

/** The page without Athom's library, and with a policy that only allows its own address. */
function servedPage(): Plugin {
  return {
    name: 'served-page',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => ({
        html: html.replace(/\s*<script src="\.\/vendor\/homey-api\.js"><\/script>/, ''),
        tags: [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy('homey') }, injectTo: 'head-prepend' }],
      }),
    },
  };
}

// The dashboard for the app on the hub: the same app, that pairs instead of asking for a key.
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [servedPage(), appManifest()],
  define: { __APP_VERSION__: JSON.stringify(packageJson.version), __SERVED_BY_HOMEY__: 'true' },
  build: { outDir: 'homey-app/public', emptyOutDir: true, assetsInlineLimit: 0, rollupOptions: { input: { main: 'index.html' } } },
});
