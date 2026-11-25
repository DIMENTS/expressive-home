import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';

// Widgets in the example house: the clock, a note and a link, and own widgets in their sandboxed frame.

async function house(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', baseURL: 'http://localhost:5276/' });
  const page = await context.newPage();
  const problems: string[] = [];
  const outside: string[] = [];
  page.on('pageerror', (error) => problems.push(`error: ${error.message}`));
  page.on('request', (request) => { if (!request.url().startsWith('http://localhost:5276/') && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) outside.push(request.url()); });
  await page.addInitScript(() => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (event) => (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await page.goto('/');
  await page.getByRole('button', { name: /voorbeeldhuis|example house/ }).click();
  await expect(page.locator('mh-guard-tile')).not.toHaveCount(0);
  const clean = async () => {
    expect(problems).toEqual([]);
    expect(outside).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
    await context.close();
  };
  return { page, clean };
}

const addPanel = (page: Page) => page.locator('mh-add-panel');
const widgetPanel = (page: Page) => page.locator('mh-widget-panel');

async function openWidgets(page: Page) {
  await page.getByRole('button', { name: 'Bewerken', exact: true }).first().click();
  await page.getByRole('button', { name: 'Tegel toevoegen' }).first().click();
  await addPanel(page).getByRole('radio', { name: 'Widgets' }).click();
}

async function install(page: Page, text: string) {
  await addPanel(page).getByRole('button', { name: 'Widget toevoegen' }).click();
  await addPanel(page).locator('mh-own-widgets textarea').fill(text);
  await addPanel(page).getByRole('button', { name: 'Toevoegen', exact: true }).click();
}

async function done(page: Page) {
  if (await widgetPanel(page).getByRole('button', { name: 'Sluiten' }).isVisible()) await widgetPanel(page).getByRole('button', { name: 'Sluiten' }).click();
  if (await addPanel(page).getByRole('button', { name: 'Sluiten' }).isVisible()) await addPanel(page).getByRole('button', { name: 'Sluiten' }).click();
  await page.getByRole('button', { name: 'Klaar' }).first().click();
}

const example = (name: string): string => readFileSync(new URL(`../docs/widgets/${name}.widget.json`, import.meta.url), 'utf8');
const widget = (id: string, js: string, settings: unknown[] = []): string =>
  JSON.stringify({ format: 'expressive-home-widget', version: 1, id, name: id, html: '<p id="p">…</p>', css: '', js, settings });

test('nothing comes by itself; the clock, a note and a link are added by hand and work', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await expect(page.locator('mh-widget-tile')).toHaveCount(0);
  await openWidgets(page);
  await addPanel(page).getByRole('button', { name: 'Klok toevoegen' }).click();
  await addPanel(page).getByRole('button', { name: 'Notitie toevoegen' }).click();
  await widgetPanel(page).getByLabel('Titel').fill('Boodschappen');
  await widgetPanel(page).locator('textarea').fill('Melk\nbrood');
  await done(page);
  await expect(page.locator('mh-widget-tile').filter({ hasText: 'Boodschappen' })).toContainText('Melk');
  await expect(page.locator('mh-widget-tile .time, mh-widget-tile >> .time')).toHaveText(/^\d\d:\d\d$/);
  await openWidgets(page);
  await addPanel(page).getByRole('button', { name: 'Naar dashboard toevoegen' }).click();
  await widgetPanel(page).getByRole('radio', { name: 'Kamers' }).click();
  await done(page);
  await page.getByRole('button', { name: 'Open dashboard Kamers' }).click();
  await expect(page.locator('mh-rooms-screen, mh-room-card').first()).toBeVisible();
  await clean();
});

test('an own widget runs in its frame, reads and switches the lamp chosen for it, and reaches nothing outside', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await openWidgets(page);
  await install(page, example('big-switch'));
  await addPanel(page).getByRole('button', { name: 'Grote knop toevoegen' }).click();
  await widgetPanel(page).getByRole('radio', { name: 'Tuinverlichting' }).click();
  await done(page);
  const frame = page.frameLocator('mh-own-widget iframe');
  await expect(frame.getByRole('button', { name: /Tuinverlichting/ })).toHaveAttribute('aria-pressed', 'false');
  await frame.getByRole('button', { name: /Tuinverlichting/ }).click();
  await expect(frame.getByRole('button', { name: /Tuinverlichting/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('mh-switch-tile, mh-light-tile').filter({ hasText: 'Tuinverlichting' }).first()).toHaveAttribute('state', 'on');
  // the frame cannot fetch anything, also not of the dashboard itself
  const tried = await frame.locator('body').evaluate(async () => { try { await fetch('/index.html'); return 'fetched'; } catch { return 'blocked'; } });
  expect(tried).toBe('blocked');
  await clean();
});

test('a widget that wants to open a lock gets the question of the dashboard, with its name', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await openWidgets(page);
  await install(page, widget('opener', `function onHomeyReady(Homey) {
    const p = document.getElementById('p');
    p.textContent = 'wacht';
    document.body.addEventListener('click', () => Homey.devices.setCapabilityValue(Homey.getSettings().lock, 'locked', false).then((a) => { p.textContent = a; }));
    Homey.ready();
  }`, [{ id: 'lock', type: 'device', title: 'Slot' }]));
  await addPanel(page).getByRole('button', { name: 'opener toevoegen' }).click();
  await widgetPanel(page).getByRole('radio', { name: 'Voordeur' }).click();
  await done(page);
  const frame = page.frameLocator('mh-own-widget iframe');
  await frame.locator('#p').click();
  await expect(page.locator('mh-dialog.confirm')).toContainText('opener');
  // the second tap of a double one never answers a question
  await page.waitForTimeout(1200);
  await page.locator('mh-dialog.confirm').getByRole('button', { name: 'Annuleren' }).click();
  await expect(frame.locator('#p')).toHaveText('declined');
  await expect(page.locator('mh-guard-tile').filter({ hasText: 'Voordeur' })).toContainText('Op slot');
  await clean();
});

test('a widget that hangs is stopped and the dashboard keeps working', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await openWidgets(page);
  await install(page, widget('hang', 'function onHomeyReady(Homey) { Homey.ready(); setTimeout(() => { for (;;) {} }, 300); }'));
  await addPanel(page).getByRole('button', { name: 'hang toevoegen' }).click();
  await done(page);
  await expect(page.locator('mh-own-widget')).toContainText('reageert niet', { timeout: 25_000 });
  await page.getByRole('button', { name: 'Kamers', exact: true }).first().click();
  await expect(page.locator('mh-room-card').first()).toBeVisible();
  await clean();
});
