import { chromium, expect, test, type Page } from '@playwright/test';

// Another website that puts the dashboard in a frame gets only a card that says how to open it: nothing to tap on
// under something laid over it.

const APP = 'http://localhost:5276/';
// another origin on this computer: a public one would be held back by the browser's rules for the local network
const OTHER = 'http://127.0.0.1:5276/other-site';

test('in a frame of another website the app only shows how to open it in a tab of its own', async ({ page: own, browserName }) => {
  // Chromium holds back a frame from this computer in a page it does not know; that rule is not what is tested here
  const browser = browserName === 'chromium'
    ? await chromium.launch({ ...(process.env['PW_CHROMIUM'] ? { executablePath: process.env['PW_CHROMIUM'] } : {}), args: ['--disable-features=LocalNetworkAccessChecks'] })
    : null;
  const page: Page = browser ? await (await browser.newContext({ locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' })).newPage() : own;
  try {
    await framed(page);
  } finally {
    await browser?.close();
  }
});

async function framed(page: Page): Promise<void> {
  await page.route(OTHER, (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Other</title><button>Before</button><iframe src="${APP}" width="1000" height="700"></iframe>` }));
  await page.goto(OTHER);
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('heading', { name: 'Open je dashboard in een eigen tabblad' })).toBeVisible();
  await expect(frame.getByRole('heading', { name: 'Verbind je Homey' })).toHaveCount(0);
  await expect(frame.getByRole('button', { name: /voorbeeldhuis|camper/i })).toHaveCount(0);

  const link = frame.getByRole('link', { name: /^Openen in een eigen tabblad\s*, opent in een nieuw tabblad$/ });
  await expect(link).toHaveAttribute('href', APP);
  await expect(link).toHaveAttribute('target', '_blank');
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expect(frame.getByText(APP, { exact: true })).toBeVisible();

  // reached with the keyboard, from the page around it
  await page.getByRole('button', { name: 'Before' }).focus();
  await page.keyboard.press('Tab');
  await expect(link).toBeFocused();

  // and it wrote nothing in the storage it was given
  expect(await page.frames()[1]!.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
}

test('on its own the same address is the app as always', async ({ page }) => {
  await page.goto(APP);
  await expect(page.getByRole('heading', { name: 'Verbind je Homey' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open je dashboard in een eigen tabblad' })).toHaveCount(0);
});
