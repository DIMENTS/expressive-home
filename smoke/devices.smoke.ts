import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

// The fan, robot vacuum, white goods, charge point and car of the example house: their sections, narrow and wide, on a
// laptop, a tablet and a phone, light, dark and compact, and their windows.

const BASE: BrowserContextOptions = { locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', baseURL: 'http://localhost:5276/' };
const LAPTOP: BrowserContextOptions = { ...BASE, viewport: { width: 1280, height: 900 } };
const TABLET: BrowserContextOptions = { ...BASE, viewport: { width: 1024, height: 768 }, hasTouch: true };
const PHONE: BrowserContextOptions = { ...BASE, viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const KINDS = [['fan', 'bedroom-fan'], ['vacuum', 'living-robot'], ['appliance', 'bathroom-washer'], ['charger', 'garage-charger'], ['car', 'garage-car']] as const;
const TAGS = KINDS.map(([kind]) => `mh-${kind}-tile`);

async function open(browser: Browser, options: BrowserContextOptions, theme: { mode?: 'light' | 'dark'; density?: 'comfortable' | 'compact' } = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const problems: string[] = [];
  const outside: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => problems.push(`error: ${error.message}`));
  page.on('request', (request) => { if (!request.url().startsWith('http://localhost:5276/') && !request.url().startsWith('data:')) outside.push(request.url()); });
  await page.addInitScript((stored) => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (event) => (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`));
    if (stored) localStorage.setItem('dashboard.config', stored);
  }, theme.mode || theme.density ? JSON.stringify({ version: 3, connection: { homeyId: null, localAddress: null, apiKey: null }, theme: { seed: '#3b6939', mode: theme.mode ?? 'light', density: theme.density ?? 'comfortable' }, sectionSeeds: {}, language: 'nl', layouts: {}, startBoard: null }) : null);
  await page.goto('/');
  await page.getByRole('button', { name: /voorbeeldhuis/i }).click();
  await page.locator('mh-dashboard').waitFor();
  const clean = async () => {
    expect(problems).toEqual([]);
    expect(outside).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
    await context.close();
  };
  return { page, clean };
}

/** A section on top with each of them wide. */
async function place(page: Page): Promise<void> {
  await page.evaluate((kinds) => {
    const { controller } = document.querySelector('mh-app') as unknown as { controller: { getState(): { boardId: string }; edit(change: unknown): void; setEditing(on: boolean): void } };
    const { boardId } = controller.getState();
    controller.setEditing(true);
    controller.edit({ type: 'add-section', dashboardId: boardId, index: 0, section: { id: 'own:apparaten', kind: 'own', column: 'left', name: 'Apparaten', icon: null, tiles: [], hero: null } });
    controller.edit({ type: 'add-tiles', dashboardId: boardId, sectionId: 'own:apparaten', tiles: kinds.map(([kind, deviceId]) => ({ id: `wide-${kind}`, spec: { kind, id: `wide-${kind}`, deviceId, size: 'wide' }, size: 'wide', label: null, icon: null, source: 'device' })) });
    controller.setEditing(false);
  }, KINDS);
  await expect(page.locator('mh-car-tile').first()).toBeVisible();
}

/** Nothing of the row of buttons of these tiles is cut off sideways, and the page does not scroll sideways. (The tile itself is as every tile.) */
async function fits(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate((tags) => {
    const found: Element[] = [];
    const walk = (root: Element | ShadowRoot): void => { for (const child of root.querySelectorAll('*')) { if (tags.includes(child.tagName.toLowerCase())) found.push(child); if (child.shadowRoot) walk(child.shadowRoot); } };
    walk(document.body);
    return found.flatMap((tile) => [...(tile.shadowRoot?.querySelectorAll('.controls, .controls .line') ?? [])].filter((part) => part.scrollWidth > part.clientWidth + 1).map((part) => `${tile.tagName} ${part.className} ${part.scrollWidth}/${part.clientWidth}`));
  }, TAGS)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('on a laptop: Huishouden and Auto en laden, each wide with its buttons; charging starts with one tap', async ({ browser }) => {
  const { page, clean } = await open(browser, LAPTOP);
  await expect(page.locator('mh-section').filter({ hasText: 'Huishouden' })).toHaveCount(1);
  await expect(page.locator('mh-section').filter({ hasText: 'Auto en laden' })).toHaveCount(1);
  await place(page);
  for (const tag of TAGS) await expect(page.locator(`mh-section:has-text("Apparaten") ${tag} .controls`)).toHaveCount(1);
  await fits(page);
  const charger = page.locator('mh-section:has-text("Apparaten") mh-charger-tile');
  await charger.getByRole('button', { name: 'Laadpaal: laden' }).click();
  await expect(charger.locator('.state')).toHaveText(/^Laadt/);
  await expect(page.locator('mh-section:has-text("Auto en laden")').getByText('Laadt', { exact: true })).toBeVisible();
  // stopping is held: a tap asks first
  await charger.getByRole('button', { name: 'Laadpaal: laden stoppen' }).click();
  await expect(page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: 'laden stoppen?' })).toBeVisible();
  await clean();
});

test('on a tablet and on a phone everything fits', async ({ browser }) => {
  for (const options of [TABLET, PHONE]) {
    const { page, clean } = await open(browser, options);
    await place(page);
    await fits(page);
    await clean();
  }
});

test('dark and compact: each tile one line, nothing cut off', async ({ browser }) => {
  const { page, clean } = await open(browser, LAPTOP, { mode: 'dark', density: 'compact' });
  await place(page);
  await fits(page);
  await clean();
});

test('each opens its window with its own top', async ({ browser }) => {
  const { page, clean } = await open(browser, LAPTOP);
  for (const [kind, name, text] of [['car', 'Auto', /64%/], ['charger', 'Laadpaal', /aangesloten/], ['appliance', 'Wasmachine', /Bezig/], ['vacuum', 'Robotstofzuig', /dock/], ['fan', 'Ventilator', /Aan/]] as const) {
    await page.locator(`mh-${kind}-tile`).filter({ hasText: name }).first().locator('.tile').click({ position: { x: 20, y: 20 } });
    const panel = page.locator('mh-device-panel');
    await expect(panel.locator('.top-of .stands')).toHaveText(text);
    expect(await panel.evaluate((element) => { const sheet = element.shadowRoot!.querySelector('mh-sheet'); return sheet ? sheet.scrollWidth <= sheet.clientWidth + 1 : true; })).toBe(true);
    await page.keyboard.press('Escape');
    await expect(panel.locator('mh-sheet[open]')).toHaveCount(0);
  }
  await clean();
});
