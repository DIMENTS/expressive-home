import { expect, test, type Browser, type Page } from '@playwright/test';
import { CONTROL_PORT } from '../playwright.homey.config';

// The first start of a hub, as the app on it serves the dashboard: a hub nobody arranged, the first device that pairs,
// the choices, practising, and the dashboard that comes of it; then a second device, and a page loaded anew halfway.

async function hand<T = unknown>(action: string, body: unknown = {}): Promise<T> {
  return (await (await fetch(`http://127.0.0.1:${CONTROL_PORT}/${action}`, { method: 'POST', body: JSON.stringify(body) })).json()) as T;
}

async function device(browser: Browser, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const problems: string[] = [];
  // the stand-in for Homey has no weather and no Homey Energy: the first start asks once, and hears no
  const missing = (url: string) => /\/api\/(weather|energy)(\?|$)/.test(new URL(url).pathname + new URL(url).search);
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource: the server responded with a status of 404')) problems.push(message.text()); });
  page.on('response', (response) => { if (response.status() === 404 && !missing(response.url())) problems.push(`404 ${response.url()}`); });
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('request', (request) => { if (new URL(request.url()).hostname !== 'localhost') problems.push(`request to ${request.url()}`); });
  await page.addInitScript(() => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (event) => (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await page.goto('/');
  return { page, context, problems, violations: () => page.evaluate(() => (window as unknown as { violations: string[] }).violations) };
}

async function pair(page: Page, name: string): Promise<void> {
  const { code } = await hand<{ code: string }>('code', { role: 'edit' });
  await page.getByRole('textbox', { name: 'Naam van dit apparaat' }).fill(name);
  await page.getByRole('textbox', { name: 'Code' }).fill(code);
  await page.getByRole('button', { name: 'Koppelen' }).click();
}

const next = (page: Page) => page.getByRole('button', { name: 'Verder', exact: true }).click();
const heading = (page: Page) => page.locator('mh-onboarding h1');

test.beforeEach(async () => {
  await hand('reset');
  for (const { name } of await hand<{ name: string }[]>('devices')) await hand('remove', { name });
  await hand('fresh');
  await hand('stop');
  await hand('start');
});

test('the first device of a hub nobody arranged: the choices, practising, and the dashboard of them', async ({ browser }) => {
  const d = await device(browser);
  await pair(d.page, 'Tablet');
  await expect(heading(d.page)).toHaveText('Gekoppeld met je Homey');
  await d.page.getByRole('button', { name: 'Beginnen' }).click();
  await expect(heading(d.page)).toHaveText('Hoe mag het eruitzien?');
  await d.page.getByRole('radio', { name: /^Glas/ }).click();
  await d.page.getByRole('radio', { name: 'Blauw' }).click();
  await next(d.page);
  await expect(heading(d.page)).toHaveText('Licht of donker?');
  await d.page.getByRole('radio', { name: 'Donker' }).click();
  await next(d.page);
  await expect(heading(d.page)).toHaveText('Hoe deel je het in?');
  await next(d.page);
  await expect(heading(d.page)).toHaveText('Wat gebruik je het meest?');
  await d.page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(d.page.getByRole('button', { name: 'Water, nummer 1' })).toHaveAttribute('aria-pressed', 'true');
  await next(d.page);
  await expect(heading(d.page)).toHaveText('Je dashboard staat klaar', { timeout: 5000 });
  await d.page.getByRole('button', { name: 'Even oefenen' }).click();
  await expect(heading(d.page)).toHaveText('Even oefenen');
  // the practice lamp: one tap
  await d.page.locator('mh-practice-tiles mh-light-tile [role="button"]').first().click();
  await expect(d.page.locator('.exercise').first()).toHaveAttribute('data-done', '');
  // the practice lock: a click asks, as on the dashboard, and yes does it
  await d.page.locator('mh-practice-tiles mh-guard-tile mh-hold-button').first().click();
  await expect(d.page.getByRole('alertdialog', { name: 'Oefenslot ontgrendelen?' })).toBeVisible();
  await d.page.waitForTimeout(700);
  await d.page.getByRole('button', { name: 'Ontgrendelen', exact: true }).click();
  await expect(d.page.locator('.exercise').nth(2)).toHaveAttribute('data-done', '');
  await d.page.getByRole('button', { name: 'Naar mijn dashboard' }).click();

  // the dashboard: Water on top, in the chosen look, with the card and the pointer
  await expect(d.page.getByText('Lokaal verbonden')).toBeVisible();
  await expect(d.page.getByRole('heading', { name: 'Verder inrichten' })).toBeVisible();
  await expect(d.page.getByRole('note').filter({ hasText: 'Hier pas je je dashboard aan' })).toBeVisible();
  await expect(d.page.locator('html')).toHaveAttribute('data-look', 'glas');
  await expect(d.page.locator('html')).toHaveAttribute('data-mode', 'dark');
  const first = await d.page.locator('mh-dashboard .col[data-column="left"] > *').first().getAttribute('data-section-id');
  expect(first).toBe('type:water');
  await d.page.getByRole('button', { name: 'Begrepen' }).click();
  await expect(d.page.getByRole('note').filter({ hasText: 'Hier pas je je dashboard aan' })).toHaveCount(0);

  // a second device gets the dashboard at once, with the look of the house
  const other = await device(browser, { width: 400, height: 860 });
  await pair(other.page, 'Telefoon');
  // a phone shows no label of the connection: a tile says the dashboard is there
  await expect(other.page.locator('mh-dashboard mh-light-tile').first()).toBeVisible();
  await expect(other.page.locator('mh-onboarding')).toHaveCount(0);
  await expect(other.page.getByRole('heading', { name: 'Verder inrichten' })).toHaveCount(0);
  await expect(other.page.locator('html')).toHaveAttribute('data-look', 'glas');

  // the first device again, loaded anew: the card is still there, the first start is not
  await d.page.reload();
  await expect(d.page.getByText('Lokaal verbonden')).toBeVisible();
  await expect(d.page.locator('mh-onboarding')).toHaveCount(0);
  await expect(d.page.getByRole('heading', { name: 'Verder inrichten' })).toBeVisible();
  expect([...d.problems, ...other.problems]).toEqual([]);
  expect([...await d.violations(), ...await other.violations()]).toEqual([]);
});

test('a page loaded anew halfway goes on where it was; skipping gives the dashboard as the app makes it', async ({ browser }) => {
  const d = await device(browser, { width: 820, height: 1180 });
  await pair(d.page, 'Tablet');
  await d.page.getByRole('button', { name: 'Beginnen' }).click();
  await d.page.getByRole('radio', { name: /^Uitbundig/ }).click();
  await next(d.page);
  await expect(heading(d.page)).toHaveText('Licht of donker?');
  await d.page.reload();
  await expect(heading(d.page)).toHaveText('Licht of donker?');
  await d.page.getByRole('button', { name: 'Overslaan' }).click();
  await expect(d.page.getByText('Lokaal verbonden')).toBeVisible();
  await expect(d.page.getByRole('heading', { name: 'Verder inrichten' })).toBeVisible();
  // and the next device is no first start, although nothing was arranged
  const other = await device(browser);
  await pair(other.page, 'Laptop');
  await expect(other.page.getByText('Lokaal verbonden')).toBeVisible();
  await expect(other.page.locator('mh-onboarding')).toHaveCount(0);
  expect([...d.problems, ...other.problems]).toEqual([]);
});
