import { defineConfig, devices } from '@playwright/test';

// The speed measurement: Chromium only, on its own build and port, so it can run for an hour
// beside the smoke test. Run it with `npm run perf`.
const PORT = 5277;

export default defineConfig({
  testDir: 'smoke',
  testMatch: ['**/performance.smoke.ts', '**/rest.perf.ts'],
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}/`, trace: 'off', actionTimeout: 60_000, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' },
  webServer: { command: `npx vite preview --outDir dist-perf --port ${PORT} --strictPort`, url: `http://localhost:${PORT}/`, reuseExistingServer: false, timeout: 60_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
