// What a phone needs to put the dashboard on its home screen: a manifest, icons under fixed names, and the
// tags in the page that point at them. Shared by the build of the web app and that for the app on the hub.
import { readFileSync } from 'node:fs';

/** surface-container of the default theme in light; a test keeps it equal. The app follows the theme from there. */
const SURFACE = '#ecefe6';
const NAME = 'Expressive Home';
/** Under an icon there is room for one word. */
const SHORT_NAME = 'Expressive';

export const ICON_FILES = ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

export const MANIFEST = {
  name: NAME, short_name: SHORT_NAME, lang: 'nl', start_url: './', scope: './', display: 'standalone', theme_color: SURFACE, background_color: SURFACE,
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

const TYPES = { svg: 'image/svg+xml', png: 'image/png' };
const icon = (name) => readFileSync(new URL(`../src/app-icon/${name}`, import.meta.url));

/** @returns {import('vite').Plugin} */
export function appManifest() {
  return {
    name: 'app-manifest',
    transformIndexHtml(_html, { path }) {
      if (!path.endsWith('/index.html')) return undefined;
      const link = (attrs) => ({ tag: 'link', attrs, injectTo: 'head' });
      const meta = (name, content) => ({ tag: 'meta', attrs: { name, content }, injectTo: 'head' });
      return [
        link({ rel: 'manifest', href: './manifest.webmanifest' }),
        link({ rel: 'icon', type: 'image/svg+xml', href: './icons/icon.svg' }),
        link({ rel: 'apple-touch-icon', href: './icons/apple-touch-icon.png' }),
        meta('theme-color', SURFACE),
        meta('mobile-web-app-capable', 'yes'),
        meta('apple-mobile-web-app-capable', 'yes'),
        meta('apple-mobile-web-app-title', SHORT_NAME),
      ];
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(MANIFEST) });
      for (const name of ICON_FILES) this.emitFile({ type: 'asset', fileName: `icons/${name}`, source: icon(name) });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0];
        const name = path.startsWith('/icons/') ? path.slice('/icons/'.length) : '';
        if (path === '/manifest.webmanifest') {
          response.setHeader('content-type', 'application/manifest+json');
          response.end(JSON.stringify(MANIFEST));
        } else if (ICON_FILES.includes(name)) {
          response.setHeader('content-type', TYPES[name.split('.')[1]]);
          response.end(icon(name));
        } else next();
      });
    },
  };
}
