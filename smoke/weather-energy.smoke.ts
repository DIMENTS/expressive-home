import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

// The weather and the energy with the example hub: both widgets in every size, on a laptop, a tablet and a phone, light,
// dark and compact, and the weather on the rest screen.

const BASE: BrowserContextOptions = { locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', baseURL: 'http://localhost:5276/' };
const LAPTOP: BrowserContextOptions = { ...BASE, viewport: { width: 1280, height: 900 } };
const TABLET: BrowserContextOptions = { ...BASE, viewport: { width: 1024, height: 768 }, hasTouch: true };
const PHONE: BrowserContextOptions = { ...BASE, viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

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

/** A section on top with the weather and the energy in their sizes. */
async function place(page: Page): Promise<void> {
  await page.evaluate(() => {
    const { controller } = document.querySelector('mh-app') as unknown as { controller: { getState(): { boardId: string }; edit(change: unknown): void; setEditing(on: boolean): void } };
    const { boardId } = controller.getState();
    const tile = (id: string, widget: string, size: 'single' | 'wide', settings: Record<string, unknown>) => ({ id, spec: { kind: 'widget', id, size, widget, settings }, size, label: null, icon: null, source: 'device' });
    controller.setEditing(true);
    controller.edit({ type: 'add-section', dashboardId: boardId, index: 0, section: { id: 'own:buiten', kind: 'own', column: 'left', name: 'Weer en energie', icon: null, tiles: [], hero: null } });
    controller.edit({ type: 'add-tiles', dashboardId: boardId, sectionId: 'own:buiten', tiles: [
      tile('w-wide', 'weather', 'wide', { days: true }), tile('w-one', 'weather', 'single', {}), tile('e-week', 'energy', 'single', { period: 'week' }),
      tile('e-wide', 'energy', 'wide', { devices: true }),
    ] });
    controller.setEditing(false);
  });
  await expect(page.locator('mh-widget-tile .weather .temp').first()).toHaveText(/°$/);
}

/** Nothing of a widget is cut off sideways, and the page does not scroll sideways. */
async function fits(page: Page): Promise<void> {
  const over = await page.evaluate(() => [...document.querySelectorAll('mh-app')].flatMap((app) => {
    const tiles: Element[] = [];
    const walk = (root: Element | ShadowRoot): void => { for (const child of root.querySelectorAll('*')) { if (child.tagName === 'MH-WIDGET-TILE') tiles.push(child); if (child.shadowRoot) walk(child.shadowRoot); } };
    walk(app.shadowRoot ?? app);
    return tiles.flatMap((tile) => [...(tile.shadowRoot?.querySelectorAll('.face') ?? [])].filter((face) => face.scrollWidth > face.clientWidth + 1).map((face) => `${tile.getAttribute('data-id') ?? '?'} ${face.className}`));
  }));
  expect(over).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('on a laptop: the weather with hours and days, the energy with bars and devices, one row higher where asked', async ({ browser }) => {
  const { page, clean } = await open(browser, LAPTOP);
  await place(page);
  const wide = page.locator('mh-widget-tile').filter({ has: page.locator('.weather .days') });
  await expect(wide.locator('.hours li')).toHaveCount(4);
  await expect(wide.locator('.days li')).toHaveCount(5);
  const tall = await wide.boundingBox();
  const narrow = await page.locator('mh-widget-tile').filter({ has: page.locator('.weather') }).filter({ hasNot: page.locator('.hours') }).boundingBox();
  expect(tall!.height).toBeGreaterThan(narrow!.height * 1.8);
  const energy = page.locator('mh-widget-tile').filter({ has: page.locator('.energy .devices') });
  await expect(energy.locator('svg rect.use').first()).toBeAttached();
  expect(await energy.locator('.devices li').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('mh-widget-tile .energy .used').filter({ hasText: /^deze week$/ })).toHaveCount(1);
  await fits(page);
  await clean();
});

test('on a tablet and on a phone everything fits; on a phone a widget with a second row has the whole width', async ({ browser }) => {
  for (const options of [TABLET, PHONE]) {
    const { page, clean } = await open(browser, options);
    await place(page);
    await fits(page);
    if (options === PHONE) {
      const wide = page.locator('mh-widget-tile').filter({ has: page.locator('.weather .days') });
      const box = await wide.boundingBox();
      expect(box!.width).toBeGreaterThan(300);
    }
    await clean();
  }
});

test('dark and compact: each widget one line, nothing cut off', async ({ browser }) => {
  const { page, clean } = await open(browser, LAPTOP, { mode: 'dark', density: 'compact' });
  await place(page);
  await expect(page.locator('mh-widget-tile .weather.line')).toHaveCount(2);
  await expect(page.locator('mh-widget-tile .energy.line')).toHaveCount(2);
  await fits(page);
  await clean();
});

test('the rest screen shows the weather under the date', async ({ browser }) => {
  const { page, clean } = await open(browser, LAPTOP);
  await page.evaluate(() => (document.querySelector('mh-app') as unknown as { wall: { preview(look: string): void } }).wall.preview('day'));
  await expect(page.locator('mh-rest-screen .weather')).toHaveText(/° · |·/);
  await clean();
});
