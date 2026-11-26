import { defineConfig } from 'vite';
import app from './vite.config';

// The app alone, for GitHub Pages: the build of `npm run build` without the inspection page, which reads the same key
// and is for measuring, not for use. Without the development and preview servers and the tests, which are not built.
const { server: _server, preview: _preview, test: _test, ...shared } = app;

export default defineConfig({
  ...shared,
  build: { ...shared.build, outDir: 'dist-pages', rollupOptions: { ...shared.build?.rollupOptions, input: { main: 'index.html' } } },
});
