import { defineConfig } from 'vite';

// The server of the app on the hub, as one file for Node.
export default defineConfig({
  publicDir: false,
  ssr: { noExternal: true },
  build: { ssr: 'src/home-server/index.ts', outDir: 'homey-app/lib', emptyOutDir: true, target: 'node22', minify: false, rollupOptions: { output: { entryFileNames: 'server.mjs', format: 'es' } } },
});
