import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

// The charts with the example hub: the window of a sensor and of a window, a wide sensor tile, and the hero.

const WIDE: BrowserContextOptions = { viewport: { width: 1280, height: 900 }, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', baseURL: 'http://localhost:5276/' };
const PHONE: BrowserContextOptions = { ...WIDE, viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function open(browser: Browser, house: 'camper' | 'voorbeeldhuis', options: BrowserContextOptions = WIDE) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const problems: string[] = [];
  const outside: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => problems.push(`error: ${error.message}`));
  page.on('request', (request) => { if (!request.url().startsWith('http://localhost:5276/') && !request.url().startsWith('data:')) outside.push(request.url()); });
  await page.addInitScript(() => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (event) => (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await page.goto('/');
  await page.getByRole('button', { name: house === 'camper' ? /camper/i : /voorbeeldhuis/i }).click();
  await page.locator('mh-dashboard').waitFor();
  const clean = async () => {
    expect(problems).toEqual([]);
    expect(outside).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
    await context.close();
  };
  return { page, clean };
}

const chartIn = (page: Page) => page.locator('mh-device-history mh-chart').first();

test('the window of a sensor has its history over a day, a week, a month and a year, read with the mouse and the keys', async ({ browser }) => {
  const { page, clean } = await open(browser, 'voorbeeldhuis');
  await page.getByText('Klimaatsensor', { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Verloop' })).toBeVisible();
  const chart = chartIn(page);
  await expect(chart.locator('path.line')).toHaveAttribute('d', /^M/);
  expect((await chart.boundingBox())!.width).toBeGreaterThan(200);
  await expect(chart.locator('.times span').last()).toHaveText('nu');
  for (const [period, first] of [['Week', /^(ma|di|wo|do|vr|za|zo)$/], ['Maand', /^\d+ [a-z]+$/], ['Jaar', /^(jan|apr|jul|okt)$/], ['Dag', /^\d\d:\d\d$/]] as const) {
    await page.getByRole('radio', { name: period }).click();
    await expect(chart.locator('.times span').first()).toHaveText(first);
  }
  const box = (await chart.locator('.plot').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(chart.locator('.tip')).toHaveText(/^\d\d:\d\d · .+°C$/);
  await page.mouse.move(box.x + box.width / 2, box.y - 200);
  await expect(chart.locator('.tip')).toHaveCount(0);
  const slider = chart.getByRole('slider', { name: 'Temperatuur' });
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', /^\d\d:\d\d, /);
  // Escape stops reading first; the window stays
  await page.keyboard.press('Escape');
  await expect(chart.locator('.tip')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Verloop' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Verloop' })).toBeHidden();
  await clean();
});

test('a window that opens and closes has its days of open and closed', async ({ browser }) => {
  const { page, clean } = await open(browser, 'voorbeeldhuis');
  await page.getByText('Raam', { exact: true }).first().click();
  const strip = page.locator('mh-onoff-strip');
  await expect(strip.locator('.row').first()).toBeVisible();
  await expect(strip.locator('.day').first()).toHaveText('Vandaag');
  await strip.locator('.row').first().click();
  await expect(strip.locator('.picked')).toHaveText(/^(Open|Dicht) \d\d:\d\d – (\d\d:\d\d|nu)$/);
  await clean();
});

test('on a phone a tap on the chart reads the nearest point', async ({ browser }) => {
  const { page, clean } = await open(browser, 'voorbeeldhuis', PHONE);
  await page.getByText('Klimaatsensor', { exact: true }).first().click();
  const chart = chartIn(page);
  await chart.scrollIntoViewIfNeeded();
  const box = (await chart.locator('.plot').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 3, box.y + box.height / 2);
  await expect(chart.locator('.tip')).toHaveText(/^\d\d:\d\d · /);
  await clean();
});

test('a wide sensor tile with its history behind the value', async ({ browser }) => {
  const { page, clean } = await open(browser, 'voorbeeldhuis');
  await page.evaluate(() => {
    const { controller } = document.querySelector('mh-app') as unknown as { controller: { getState(): { boardId: string; board: { left: Block[]; right: Block[] } }; edit(change: unknown): void; setEditing(on: boolean): void } };
    type Block = { type: string; section: { id: string; tiles: { id: string; kind: string; deviceId: string; capabilityId: string }[] } };
    const { board, boardId } = controller.getState();
    // a thermometer: Homey keeps its history
    const isWarm = (t: { kind: string; capabilityId: string }) => t.kind === 'sensor' && t.capabilityId === 'measure_temperature';
    const section = [...board.left, ...board.right].find((b) => b.type === 'section' && b.section.tiles.some(isWarm))!.section;
    const sensor = section.tiles.find(isWarm)!;
    controller.setEditing(true);
    controller.edit({ type: 'add-tiles', dashboardId: boardId, sectionId: section.id, tiles: [{ id: 't-trend', spec: { kind: 'sensor', id: 't-trend', deviceId: sensor.deviceId, size: 'wide', capabilityId: sensor.capabilityId, showCapabilityTitle: true, trend: true }, size: 'wide', label: null, icon: null, source: 'value' }] });
    controller.setEditing(false);
  });
  // a tile reads its history only once it is seen
  await page.locator('mh-sensor-tile[wide]').scrollIntoViewIfNeeded();
  const trend = page.locator('mh-sensor-tile[wide] mh-chart.trend');
  await expect(trend).toHaveCount(1);
  await expect(trend.locator('path.area')).toHaveAttribute('d', /Z$/);
  expect((await trend.boundingBox())!.width).toBeGreaterThan(200);
  await clean();
});

test('the hero of the camper gets its chart from its menu, and back', async ({ browser }) => {
  const { page, clean } = await open(browser, 'camper');
  await page.getByRole('button', { name: 'Menu van Accu' }).click();
  await page.getByRole('menuitemradio', { name: 'Accu, laatste 24 uur' }).click();
  const chart = page.locator('mh-hero-chart mh-chart');
  await expect(chart.locator('path.line')).toHaveAttribute('d', /^M/);
  expect((await chart.boundingBox())!.width).toBeGreaterThan(200);
  await expect(page.locator('mh-hero-chart .corner')).toHaveText(/^Laagste \d+% om \d\d:\d\d$/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Menu van Accu' }).click();
  await page.getByRole('menuitemradio', { name: 'Geen grafiek' }).click();
  await expect(page.locator('mh-hero-chart')).toHaveCount(0);
  await clean();
});
