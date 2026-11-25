import { defineConfig, devices } from '@playwright/test';

// The smoke test of the app on the hub: the dashboard as it serves it, over the real server with a stand-in for
// Homey. Run it with `npm run smoke:homey`.
const PORT = 5279;
export const CONTROL_PORT = 5280;
const shared = { locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' };

export default defineConfig({
  testDir: 'smoke',
  testMatch: ['**/homey-app.smoke.ts', '**/app-settings.smoke.ts'],
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}/`, trace: 'off' },
  webServer: { command: `node smoke/homey-server.mjs ${PORT} ${CONTROL_PORT}`, url: `http://localhost:${PORT}/`, reuseExistingServer: false, timeout: 30_000 },
  projects: [
    // PW_CHROMIUM: a Chromium of another version than the one Playwright expects
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...shared, ...(process.env['PW_CHROMIUM'] ? { launchOptions: { executablePath: process.env['PW_CHROMIUM'] } } : {}) } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], ...shared } },
  ],
});
