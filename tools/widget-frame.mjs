// The page an own widget runs in: made from src/widgets/frame/runtime.ts by the build and the dev server.
// It has a policy of its own, stricter than the dashboard's: no network at all, nothing of its own address,
// only its one script (by its hash) and the code that script starts.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';

export const FRAME_FILE = 'widget-frame.html';
const RUNTIME = fileURLToPath(new URL('../src/widgets/frame/runtime.ts', import.meta.url));

/** @param {string} script @returns {string} */
export const scriptHash = (script) => `sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}`;

/** @param {string} script @returns {string} */
export function framePolicy(script) {
  return [
    "default-src 'none'",
    `script-src '${scriptHash(script)}' 'unsafe-eval'`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data: blob:',
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** The runtime as one classic script that starts itself. @returns {Promise<string>} */
export async function frameScript() {
  const { code } = await transformWithOxc(readFileSync(RUNTIME, 'utf8'), 'runtime.ts', { lang: 'ts', sourcemap: false });
  const body = code.replace(/^export function startFrame/m, 'function startFrame').replace(/\n\/\/# sourceMappingURL=.*$/m, '');
  if (/<\/script/i.test(body) || /^\s*(?:import|export)\b/m.test(body)) throw new Error('The runtime of the widget frame must stand alone');
  return `(function () {\n${body}\nstartFrame(window);\n})();`;
}

/** @returns {Promise<string>} */
export async function framePage() {
  const script = await frameScript();
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${framePolicy(script)}">
<meta name="referrer" content="no-referrer">
<style>:root { color-scheme: light dark; } html, body { margin: 0; background: transparent; } body { font-family: var(--font-family, system-ui, sans-serif); color: var(--tile-fg, CanvasText); }</style>
<script>${script}</script>
</head><body></body></html>
`;
}

/** Makes the page in a build, and serves it on the dev server. @returns {import('vite').Plugin} */
export function widgetFrame() {
  return {
    name: 'widget-frame',
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: FRAME_FILE, source: await framePage() });
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if ((request.url ?? '').split('?')[0] !== `/${FRAME_FILE}`) { next(); return; }
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end(await framePage());
      });
    },
  };
}
