import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page } from '@playwright/test';

// The dashboard on a phone, with the example hub, in Chromium and WebKit.

const BASE = 'http://localhost:5276/';
const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', baseURL: BASE };

/** A phone with the example hub open; collects what must never happen. */
async function phone(browser: Browser, options: BrowserContextOptions = {}) {
  const context = await browser.newContext({ ...PHONE, ...options });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => problems.push(`error: ${error.message}`));
  await page.addInitScript(() => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (event) => (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await page.goto('/');
  const clean = async () => {
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
  };
  const example = async () => {
    await page.getByRole('button', { name: /in een camper|camper van/i }).first().tap();
    await expect(page.locator('mh-nav-bar nav')).toBeVisible();
    await expect(page.locator('mh-light-tile')).toHaveCount(8);
  };
  return { context, page, clean, example };
}

// the width of the page, not that of the window: Chromium's grows along with what is too wide
const inside = (page: Page) => page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth) <= window.screen.width);
const state = (tile: Locator) => tile.locator('.state').innerText();
const pressed = (tile: Locator) => tile.locator('[role="button"]').getAttribute('aria-pressed');
const sheet = (page: Page, panel: string) => page.locator(`${panel} mh-sheet[open]`);
const middle = async (locator: Locator) => { const box = (await locator.boundingBox())!; return { x: box.x + box.width * 0.6, y: box.y + box.height / 2 }; };

/** Texts that stick out of the box they belong to. */
const textOver = (page: Page) => page.evaluate(() => {
  const found: string[] = [];
  const walk = (root: ParentNode): void => {
    for (const element of root.querySelectorAll<HTMLElement>('*')) {
      if (element.matches('.tile, .stat, .cell, .option, nav button, mh-flow-tile, .head') && element.offsetWidth > 0 && getComputedStyle(element).visibility !== 'hidden') {
        const box = element.getBoundingClientRect();
        for (const leaf of element.querySelectorAll<HTMLElement>('*')) {
          if (leaf.children.length > 0 || !leaf.textContent?.trim()) continue;
          const text = leaf.getBoundingClientRect();
          if (text.left < box.left - 1 || text.right > box.right + 1) found.push(`${element.className}: ${leaf.textContent.trim().slice(0, 40)}`);
        }
      }
      if (element.shadowRoot) walk(element.shadowRoot);
    }
  };
  walk(document);
  return found;
});

/** A finger, over the protocol of Chromium: the only one that makes real touches. */
async function finger(page: Page) {
  const client = await page.context().newCDPSession(page);
  return (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
}

for (const [width, colorScheme, locale] of [[320, 'light', 'nl-NL'], [320, 'dark', 'en-GB'], [360, 'light', 'en-GB'], [390, 'dark', 'nl-NL'], [430, 'light', 'nl-NL']] as const) {
  test(`nothing is outside the window: ${width} wide, ${colorScheme}, ${locale}`, async ({ browser }) => {
    const { context, page, clean, example } = await phone(browser, { viewport: { width, height: 800 }, screen: { width, height: 800 }, colorScheme, locale });
    expect(await inside(page)).toBe(true);
    await example();
    expect(await inside(page)).toBe(true);
    const more = page.locator('mh-nav-bar [aria-haspopup]');
    for (const [item, panel] of [[0, 'mh-theme-panel'], [1, 'mh-settings-panel']] as const) {
      await more.tap();
      await page.getByRole('menuitem').nth(item).tap();
      await expect(sheet(page, panel)).toHaveCount(1);
      const box = (await page.locator(`${panel} aside`).boundingBox())!;
      expect([Math.round(box.x), Math.round(box.width)]).toEqual([0, width]);
      // nothing in it is wider than it is
      expect(await page.locator(`${panel} .body`).evaluate((body) => body.scrollWidth <= body.clientWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(sheet(page, panel)).toHaveCount(0);
    }
    // no text of a tile runs over the next
    expect(await textOver(page)).toEqual([]);
    await clean();
    await context.close();
  });
}

/** As a phone does that makes the text larger: every size of text twice, the rest as it is. */
const twice = (page: Page) => page.evaluate(() => {
  const { style } = document.documentElement;
  for (const name of Array.from(style)) {
    if (!/^--(?:type-.*-size|density-(?:greeting|hero|hero-title|section-title)-size|tile-value-small)$/.test(name)) continue;
    const size = /^([0-9.]+)px$/.exec(style.getPropertyValue(name).trim());
    if (size) style.setProperty(name, `${Number(size[1]) * 2}px`);
  }
});

for (const [width, locale] of [[320, 'nl-NL'], [360, 'en-GB'], [390, 'nl-NL']] as const) test(`text twice as large stays inside the window: ${width} wide, ${locale}`, async ({ browser }) => {
  const { context, page, clean, example } = await phone(browser, { viewport: { width, height: 800 }, screen: { width, height: 800 }, locale });
  await twice(page);
  await page.waitForTimeout(200);
  expect(await inside(page)).toBe(true);
  await example();
  const height = () => page.evaluate(() => document.documentElement.scrollHeight);
  expect(await height()).toBeGreaterThan(2600);
  expect(await inside(page)).toBe(true);
  // the panels, and the window of every device
  const fits = async (panel: string) => {
    await expect(sheet(page, panel)).toHaveCount(1);
    expect([panel, await page.locator(`${panel} .body`).evaluate((body) => body.scrollWidth - body.clientWidth)]).toEqual([panel, 0]);
    await page.keyboard.press('Escape');
    await expect(sheet(page, panel)).toHaveCount(0);
  };
  for (const [item, panel] of [[0, 'mh-theme-panel'], [1, 'mh-settings-panel']] as const) {
    await page.locator('mh-nav-bar [aria-haspopup]').tap();
    await page.getByRole('menuitem').nth(item).tap();
    await fits(panel);
  }
  for (const tile of ['mh-multi-tile', 'mh-sensor-tile', 'mh-tank-tile']) {
    await page.locator(tile).first().scrollIntoViewIfNeeded();
    await page.locator(tile).first().tap();
    await fits('mh-device-panel');
  }
  expect(await textOver(page)).toEqual([]);
  await clean();
  await context.close();
});

test('looking and switching: all of it without scrolling', async ({ browser }) => {
  const { context, page, clean, example } = await phone(browser);
  await example();
  const bar = (await page.locator('mh-nav-bar nav').boundingBox())!;
  await expect(page.locator('mh-hero .number')).toBeInViewport();
  for (let i = 0; i < 8; i += 1) {
    const box = (await page.locator('mh-light-tile').nth(i).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
  }
  // a tap switches; the connection is an icon with a name; there is nothing to arrange with
  const lamp = page.locator('mh-light-tile').first();
  const before = await pressed(lamp);
  await lamp.tap();
  await expect.poll(() => pressed(lamp)).toBe(before === 'true' ? 'false' : 'true');
  await expect(page.getByRole('img', { name: 'Lokaal verbonden' })).toBeVisible();
  await expect(page.locator('mh-rail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bewerken' })).toHaveCount(0);
  await expect(page.locator('mh-light-tile mh-slider')).toHaveCount(0);
  // a flow starts, above the bar
  await page.locator('mh-flow-tile').first().scrollIntoViewIfNeeded();
  await page.locator('mh-flow-tile').first().tap();
  await expect(page.locator('mh-flow-tile').first().locator('mh-icon[name="check_circle"]')).toHaveCount(1);
  await clean();
  await context.close();
});

test('scrolling over the lamps switches nothing, dims nothing and opens nothing', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch is sent through the DevTools protocol');
  const { context, page, clean, example } = await phone(browser);
  await example();
  const touch = await finger(page);
  const states = () => page.locator('mh-light-tile .state').allInnerTexts();
  const before = await states();
  const at = await middle(page.locator('mh-light-tile').nth(4));
  await touch('touchStart', at.x, at.y);
  for (let i = 1; i <= 12; i += 1) await touch('touchMove', at.x, at.y - i * 20);
  // the finger rests on what is under it now, before it is lifted
  await page.waitForTimeout(600);
  await touch('touchEnd');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(60);
  await page.waitForTimeout(300);
  expect([await states(), await page.locator('mh-dimmer').count(), await sheet(page, 'mh-device-panel').count()]).toEqual([before, 0, 0]);
  await clean();
  await context.close();
});

test('holding a lamp and swiping dims it; holding only opens its window, that is swept down again', async ({ browser, browserName }) => {
  const { context, page, clean, example } = await phone(browser);
  await example();
  const lamp = page.locator('mh-light-tile').filter({ hasText: 'Keuken' });
  const at = await middle(lamp);
  const touch = browserName === 'chromium' ? await finger(page) : null;
  const down = () => (touch ? touch('touchStart', at.x, at.y) : page.mouse.move(at.x, at.y).then(() => page.mouse.down()));
  const move = (y: number) => (touch ? touch('touchMove', at.x, y) : page.mouse.move(at.x, y));
  const up = () => (touch ? touch('touchEnd') : page.mouse.up());
  expect(await state(lamp)).toBe('Aan · 10%');

  // the page went to its top when it opened: a finger right after scrolling begins nothing
  await page.waitForTimeout(400);
  await down();
  await expect(page.locator('mh-dimmer')).toHaveCount(1);
  for (let i = 1; i <= 10; i += 1) { await move(at.y - i * 11.8); await page.waitForTimeout(20); }
  await expect(page.locator('mh-dimmer .value').first()).toHaveText(/^60\s*%$/);
  // it follows live, and the page stays where it is
  await expect.poll(() => state(lamp)).toBe('Aan · 60%');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await up();
  await expect(page.locator('mh-dimmer')).toHaveCount(0);
  expect([await state(lamp), await pressed(lamp), await sheet(page, 'mh-device-panel').count()]).toEqual(['Aan · 60%', 'true', 0]);

  // only holding: the window, which stays open when the finger is lifted
  await page.waitForTimeout(400);
  await down();
  await expect(page.locator('mh-dimmer')).toHaveCount(1);
  await up();
  await expect(sheet(page, 'mh-device-panel')).toHaveCount(1);
  await page.waitForTimeout(700);
  await expect(sheet(page, 'mh-device-panel')).toHaveCount(1);
  expect(await state(lamp)).toBe('Aan · 60%');

  // swept down by its top
  const top = (await page.locator('mh-device-panel aside > .top').boundingBox())!;
  const from = { x: top.x + top.width / 2, y: top.y + 12 };
  if (touch) {
    await touch('touchStart', from.x, from.y);
    for (let i = 1; i <= 8; i += 1) { await touch('touchMove', from.x, from.y + i * 20); await page.waitForTimeout(16); }
    await touch('touchEnd');
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 160, { steps: 8 });
    await page.mouse.up();
  }
  await expect(sheet(page, 'mh-device-panel')).toHaveCount(0);
  await clean();
  await context.close();
});

test('the dashboards are in the bar, and the window can turn', async ({ browser }) => {
  // made on a wide screen, as the owner does
  const { context, page, clean, example } = await phone(browser, { viewport: { width: 1280, height: 800 }, isMobile: false });
  await page.getByRole('button', { name: /in een camper/i }).first().click();
  void example;
  await page.locator('mh-rail').getByRole('button', { name: 'Bewerken' }).click();
  await page.locator('mh-rail').getByRole('button', { name: 'Nieuw', exact: true }).click();
  const dialog = page.locator('mh-name-icon-dialog.board');
  await dialog.getByRole('textbox', { name: 'Naam' }).fill('Slapen');
  await dialog.getByRole('button', { name: 'Maken' }).click();
  await expect(page.locator('mh-edit-bar')).toHaveCount(1);

  // a phone: the edit mode ends, the dashboards are in the bar
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('mh-edit-bar')).toHaveCount(0);
  const bar = page.locator('mh-nav-bar');
  await expect(bar.getByRole('button')).toHaveText(['Overzicht', 'Slapen', 'Kamers', 'Meer']);
  await expect(page.getByText('Je richt dit dashboard in op een laptop of tablet.')).toBeVisible();
  await bar.getByRole('button', { name: 'Overzicht' }).tap();
  await expect(page.locator('mh-light-tile')).toHaveCount(8);
  await expect(bar.getByRole('button', { name: 'Overzicht' })).toHaveAttribute('aria-current', 'page');
  expect(await inside(page)).toBe(true);

  // turned, and back, with a window and a menu open
  await bar.locator('[aria-haspopup]').tap();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('mh-rail')).toBeVisible();
  expect(await inside(page)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(bar.locator('nav')).toBeVisible();
  await bar.locator('[aria-haspopup]').tap();
  await page.getByRole('menuitem', { name: 'Thema' }).tap();
  await expect(sheet(page, 'mh-theme-panel')).toHaveCount(1);
  await expect(page.locator('mh-theme-panel').getByText('Weergave')).toHaveCount(0);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('mh-theme-panel').getByText('Weergave')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('radio', { name: 'Donker' }).tap();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', /^#[0-9a-f]{6}$/);
  await clean();
  await context.close();
});

test('it can be put on the home screen', async ({ page }) => {
  await page.goto('/');
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
    const value = await (await fetch(link.href)).json() as { icons: { src: string }[]; display: string };
    const icons = await Promise.all(value.icons.map(async (icon) => (await fetch(new URL(icon.src, link.href))).status));
    return { display: value.display, icons };
  });
  expect(manifest).toEqual({ display: 'standalone', icons: [200, 200, 200] });
});

test('long names stay inside: the notice, and the choice of the dashboard to start with', async ({ browser }) => {
  for (const width of [320, 390]) {
    const { context, page, clean, example } = await phone(browser, { viewport: { width, height: 800 }, screen: { width, height: 800 } });
    await example();
    const bar = page.locator('mh-snackbar .bar');
    for (const name of ['Slaapkamerverlichting', 'Buitenverlichtingsschakelaarkast']) {
      await page.locator('mh-app').evaluate((app, text) => (app.shadowRoot!.querySelector('mh-snackbar') as HTMLElement & { show(m: unknown): void }).show({ text, icon: 'error', tone: 'error', action: { label: 'Opnieuw', run() {} } }), `${name} reageerde niet.`);
      await page.waitForTimeout(700);
      const box = (await bar.boundingBox())!;
      const button = (await bar.locator('mh-button').boundingBox())!;
      expect([box.x >= 0, box.x + box.width <= width, button.x + button.width <= box.x + box.width]).toEqual([true, true, true]);
    }
    await page.locator('mh-nav-bar [aria-haspopup]').tap();
    await page.getByRole('menuitem').nth(1).tap();
    await page.locator('mh-settings-panel').evaluate((panel) => {
      const settings = panel as HTMLElement & { boards: unknown; status: object };
      settings.status = { ...settings.status, demo: false };
      settings.boards = [{ id: 'overview', name: 'Overzicht' }, { id: 'd-1', name: 'Buitenverlichtingsschakelaarkastinstellingen en alles wat daarbij hoort' }];
    });
    await page.waitForTimeout(300);
    expect(await page.locator('mh-settings-panel .body').evaluate((body) => body.scrollWidth - body.clientWidth)).toBe(0);
    await clean();
    await context.close();
  }
});

test('the labels under the header have their whole touch target and do not move up and down', async ({ browser }) => {
  const { context, page, clean, example } = await phone(browser);
  await example();
  const row = page.locator('mh-header .chips');
  expect(await row.evaluate((chips) => chips.scrollHeight - chips.clientHeight)).toBe(0);
  const chip = (await page.locator('mh-header .chips mh-chip').first().boundingBox())!;
  const hit = (y: number) => page.evaluate(([x, at]) => {
    let element = document.elementFromPoint(x!, at!);
    while (element?.shadowRoot?.elementFromPoint(x!, at!) && element.shadowRoot.elementFromPoint(x!, at!) !== element) element = element.shadowRoot.elementFromPoint(x!, at!);
    return element?.closest('button.chip') !== null && element !== null;
  }, [chip.x + chip.width / 2, y]);
  expect([await hit(chip.y - 5), await hit(chip.y + chip.height + 5)]).toEqual([true, true]);
  await clean();
  await context.close();
});

test('an open colour menu stays clear of the bar, which stays in sight', async ({ browser }) => {
  const { context, page, clean, example } = await phone(browser);
  await example();
  const bar = (await page.locator('mh-nav-bar nav').boundingBox())!;
  // a section that runs under the bar
  await page.locator('mh-section').filter({ hasText: 'Stekkers' }).locator('mh-section-menu button').tap();
  await page.waitForTimeout(400);
  const menu = (await page.locator('mh-section-menu[open] .menu').boundingBox())!;
  expect(menu.y + menu.height).toBeLessThanOrEqual(bar.y);
  const top = await page.evaluate(([x, y]) => document.querySelector('mh-app')!.shadowRoot!.querySelector('mh-dashboard')!.shadowRoot!.elementFromPoint(x!, y!)?.localName, [bar.x + 20, bar.y + 30]);
  expect(top).toBe('mh-nav-bar');
  await clean();
  await context.close();
});

test('held sideways nothing lies under the island of the phone', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'the edges of a phone are set through the DevTools protocol');
  const { context, page, clean } = await phone(browser, { viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 } });
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: { left: 47, right: 47, bottom: 21 } } as never);
  await page.getByRole('button', { name: /in een camper/i }).first().tap();
  await expect(page.locator('mh-rail')).toBeVisible();
  const rail = (await page.locator('mh-rail').getByRole('button', { name: 'Overzicht' }).boundingBox())!;
  const section = (await page.locator('mh-section').first().boundingBox())!;
  expect([rail.x >= 47, section.x + section.width <= 844 - 47]).toEqual([true, true]);
  await page.locator('mh-rail').getByRole('button', { name: 'Thema' }).tap();
  await page.waitForTimeout(800);
  const panel = (await page.locator('mh-theme-panel aside').boundingBox())!;
  expect([panel.x + panel.width <= 844 - 47, panel.y + panel.height <= 390 - 21]).toEqual([true, true]);
  await clean();
  await context.close();
});

// ----- sliders under a finger: scrolling over them changes nothing, holding them does -----

/** Every slider in the window of a device: its place and its value. */
const slidersIn = (page: Page) => page.locator('mh-device-panel').evaluate((panel) => {
  const walk = (root: ParentNode): Element[] => [...root.querySelectorAll('*')].flatMap((e) => [...(e.localName === 'mh-slider' ? [e] : []), ...(e.shadowRoot ? walk(e.shadowRoot) : [])]);
  return walk(panel.shadowRoot!).map((slider) => {
    const control = slider.shadowRoot!.querySelector('[role="slider"]')!;
    const box = control.getBoundingClientRect();
    return { name: control.getAttribute('aria-label'), value: control.getAttribute('aria-valuenow'), x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width, bottom: box.bottom };
  });
});

test('in the window of a lamp a finger scrolls over every slider; held, a slider goes along with it', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'only Chromium can be given real touches one by one');
  const { context, page, clean, example } = await phone(browser, { viewport: { width: 390, height: 600 }, screen: { width: 390, height: 600 } });
  await example();
  await page.waitForTimeout(400);
  const touch = await finger(page);
  const lamp = await middle(page.locator('mh-light-tile').filter({ hasText: 'Badkamer' }));
  await touch('touchStart', lamp.x, lamp.y);
  await expect(page.locator('mh-dimmer')).toHaveCount(1);
  await touch('touchEnd');
  await expect(sheet(page, 'mh-device-panel')).toHaveCount(1);
  await page.waitForTimeout(700);
  const values = async () => (await slidersIn(page)).map((s) => [s.name, s.value]);
  const before = await values();
  expect(before.length).toBeGreaterThan(2);
  const body = page.locator('mh-device-panel .body').first();
  const scrolled = () => body.evaluate((e) => e.scrollTop);

  let tried = 0;
  for (let i = 0; i < before.length; i += 1) {
    // up, and a little sideways, as a thumb does
    const place = (await slidersIn(page))[i]!;
    if (place.bottom > 590) continue;
    tried += 1;
    const from = await scrolled();
    const up = from < 60;
    await touch('touchStart', place.x, place.y);
    for (let step = 1; step <= 8; step += 1) { await touch('touchMove', place.x + step, place.y + (up ? -1 : 1) * step * 12); await page.waitForTimeout(16); }
    await touch('touchEnd');
    await page.waitForTimeout(500);
    expect([i, await values()]).toEqual([i, before]);
    expect([i, await scrolled() !== from]).toEqual([i, true]);
  }
  expect(tried).toBeGreaterThan(1);
  // a tap changes nothing either, and says how it works
  const first = (await slidersIn(page)).find((s) => s.y > 120 && s.bottom < 560)!;
  await touch('touchStart', first.x + first.width * 0.3, first.y);
  await touch('touchEnd');
  await expect(page.getByText('Houd een schuif even vast en veeg dan opzij.')).toBeVisible();
  expect(await values()).toEqual(before);

  // held, and swiped sideways: along with the finger, and the window stays where it is
  await page.waitForTimeout(400);
  const [from, start] = [await scrolled(), Number(first.value)];
  const back = start > 50 ? -1 : 1;
  await touch('touchStart', first.x, first.y);
  // a finger never lies perfectly still
  await touch('touchMove', first.x + 2, first.y + 2);
  await page.waitForTimeout(450);
  for (let step = 1; step <= 10; step += 1) { await touch('touchMove', first.x + back * (step * first.width * 0.03 + 8), first.y - step); await page.waitForTimeout(16); }
  await touch('touchEnd');
  await expect.poll(async () => Number((await slidersIn(page)).find((s) => s.name === first.name)!.value)).toBe(start + back * 30);
  expect([await scrolled(), await sheet(page, 'mh-device-panel').count()]).toEqual([from, 1]);
  // held and lifted only: nothing
  await touch('touchStart', first.x, first.y);
  await page.waitForTimeout(700);
  await touch('touchEnd');
  await page.waitForTimeout(300);
  expect([Number((await slidersIn(page)).find((s) => s.name === first.name)!.value), await sheet(page, 'mh-device-panel').count()]).toEqual([start + back * 30, 1]);
  await clean();
  await context.close();
});

test('on a tablet a finger scrolls over the sliders of the lamps too; held, a lamp is dimmed', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'only Chromium can be given real touches one by one');
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, locale: 'nl-NL' });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: /in een camper/i }).first().tap();
  await expect(page.locator('mh-light-tile')).toHaveCount(8);
  await page.waitForTimeout(600);
  const touch = await finger(page);
  const lamps = () => page.locator('mh-light-tile .state').allInnerTexts();
  const before = await lamps();
  const slider = page.locator('mh-light-tile').nth(0).locator('mh-slider');
  const at = await middle(slider);
  await touch('touchStart', at.x, at.y);
  for (let step = 1; step <= 10; step += 1) { await touch('touchMove', at.x + step * 2, at.y - step * 20); await page.waitForTimeout(16); }
  await touch('touchEnd');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(40);
  await page.waitForTimeout(500);
  expect(await lamps()).toEqual(before);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  // held for long, as long as a window would need: it dims, and no window comes
  const box = (await slider.boundingBox())!;
  await touch('touchStart', box.x + box.width * 0.5, box.y + box.height / 2);
  await touch('touchMove', box.x + box.width * 0.5 + 3, box.y + box.height / 2);
  await page.waitForTimeout(900);
  const was = Number(/(\d+)/.exec(before[0]!)![1]);
  for (let step = 1; step <= 10; step += 1) { await touch('touchMove', box.x + box.width * (0.5 + step * 0.04) + 9, box.y + box.height / 2 - step); await page.waitForTimeout(16); }
  await touch('touchEnd');
  // from where it was, not to where the finger is
  await expect.poll(async () => Math.abs(Number(/(\d+)/.exec((await lamps())[0]!)![1]) - (was + 40))).toBeLessThanOrEqual(2);
  expect([await page.evaluate(() => window.scrollY), await page.locator('mh-device-panel mh-sheet[open]').count(), (await lamps()).slice(1)]).toEqual([0, 0, before.slice(1)]);
  await context.close();
});
