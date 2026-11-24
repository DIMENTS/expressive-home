// The built dashboard with the example house in a browser, always at the same moment, for the pictures of it.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PORT = 5281;
export const at = (path) => fileURLToPath(new URL(path, import.meta.url));

/** Serves what `npm run build` made and opens a browser, for as long as `work` takes. */
export async function withBrowser(work) {
  const server = spawn(process.execPath, [at('../node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: at('..'), stdio: 'ignore' });
  const browser = await chromium.launch();
  try {
    for (let tries = 0; ; tries += 1) {
      try {
        await fetch(`http://localhost:${PORT}/`);
        break;
      } catch (error) {
        if (tries > 50) throw error;
        await new Promise((done) => { setTimeout(done, 200); });
      }
    }
    await work(browser);
  } finally {
    await browser.close();
    server.kill();
  }
}

/** A page with the dashboard of the example house, in English; `prepare` gets the app before the picture. */
export async function houseOn(browser, { width, height, scale = 1, scheme = 'light', touch = false, prepare = async () => {} }) {
  const context = await browser.newContext({ viewport: { width, height }, screen: { width, height }, locale: 'en-GB', timezoneId: 'Europe/Amsterdam', deviceScaleFactor: scale, colorScheme: scheme, hasTouch: touch });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-11-24T10:08:00') });
  await page.goto(`http://localhost:${PORT}/`);
  await page.getByRole('button', { name: /example house/i }).click();
  await page.locator('mh-dashboard').waitFor();
  await prepare(page);
  await page.mouse.move(0, 0);
  await page.clock.runFor(2500);
  // what moves has arrived
  await page.waitForTimeout(1500);
  return page;
}
