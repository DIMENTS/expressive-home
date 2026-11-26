import { defineConfig, devices } from '@playwright/test';

// The smoke test: the built app with the example hub, in Chromium and WebKit. It runs against `vite preview` on its own port.
const PORT = 5276;
const shared = { locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' };

export default defineConfig({
  testDir: 'smoke',
  testMatch: ['**/app.smoke.ts', '**/phone.smoke.ts', '**/wall.smoke.ts', '**/fit.smoke.ts', '**/motion.smoke.ts', '**/house.smoke.ts', '**/themes.smoke.ts', '**/charts.smoke.ts', '**/widgets.smoke.ts', '**/weather-energy.smoke.ts', '**/devices.smoke.ts', '**/framed.smoke.ts'],
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}/`, trace: 'off' },
  webServer: { command: `npx vite preview --port ${PORT} --strictPort`, url: `http://localhost:${PORT}/`, reuseExistingServer: false, timeout: 60_000 },
  projects: [
    // PW_CHROMIUM: a Chromium of another version than the one Playwright expects
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...shared, ...(process.env['PW_CHROMIUM'] ? { launchOptions: { executablePath: process.env['PW_CHROMIUM'] } } : {}) } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], ...shared } },
  ],
});
