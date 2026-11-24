// The content security policy of the app, shared by the build and the dev server (see vite.config.ts).
// Only our own scripts, styles, fonts and images, and connections only to our own origin and the two hub addresses.

const DEV_PORT = 5273;

/** The local and the cloud address of a Homey, for requests and for the live connection. */
const HUB = ['https://*.homey.homeylocal.com', 'wss://*.homey.homeylocal.com', 'https://*.connect.athom.com', 'wss://*.connect.athom.com'];

/**
 * @param {'build' | 'dev' | 'homey'} mode `dev` only adds what the Vite dev server needs: injected style elements and its own
 *   socket; `homey` is the page that the app on the hub serves: it talks to nothing but that app.
 * @returns {string}
 */
export function contentSecurityPolicy(mode) {
  const dev = mode === 'dev';
  return [
    "default-src 'self'",
    "script-src 'self'",
    dev ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    `connect-src ${["'self'", ...(mode === 'homey' ? [] : HUB), ...(dev ? [`ws://localhost:${DEV_PORT}`] : [])].join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
