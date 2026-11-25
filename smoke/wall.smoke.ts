import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page } from '@playwright/test';

// A wall tablet with the example hub, in Chromium and WebKit.

const AT = (time: string): Date => new Date(`2026-11-23T${time}:00+01:00`);

/** A tablet with the example hub open at some time; collects what must never happen. */
async function tablet(browser: Browser, options: BrowserContextOptions & { time?: string } = {}) {
  const { time = '20:40', ...rest } = options;
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', ...rest });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => problems.push(`error: ${error.message}`));
  await page.addInitScript(() => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (event) => (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await page.clock.install({ time: AT(time) });
  await page.goto('/');
  await page.getByRole('button', { name: /in een camper|camper van/i }).first().click();
  await expect(page.locator('mh-light-tile')).toHaveCount(8);
  const clean = async () => {
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
    await context.close();
  };
  return { context, page, clean };
}

const rest = (page: Page) => page.locator('mh-rest-screen');
const english = (page: Page) => page.evaluate(() => document.documentElement.lang === 'en');

const dialog = (page: Page) => page.getByRole('dialog', { name: /^(Wandtablet|Wall tablet)$/ });

/** The panel of the wall tablet, as somebody opens it. */
async function openPanel(page: Page): Promise<Locator> {
  const en = await english(page);
  await page.getByRole('button', { name: en ? 'Settings' : 'Instellingen', exact: true }).click();
  await page.getByRole('button', { name: en ? 'Set up' : 'Instellen', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  return page.locator('mh-wall-panel');
}

async function turnOn(page: Page): Promise<void> {
  const panel = await openPanel(page);
  await panel.getByRole('switch', { name: /Rustbeeld tonen|Show the rest screen/ }).click();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
}

/** Chooses both temperatures and every tank, so there is as much to see as there can be. */
async function chooseEverything(page: Page): Promise<void> {
  const panel = await openPanel(page);
  for (const name of [/Binnen kiezen|Choose Inside/, /Buiten kiezen|Choose Outside/]) {
    await panel.getByRole('button', { name }).click();
    await panel.getByRole('radio').filter({ hasText: /Omvormer|Klimaatsensor/ }).first().click();
  }
  for (const choice of await panel.getByRole('radio', { name: /Bijna leeg|Almost empty/ }).all()) await choice.click();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
}

/** The texts of the hero that are cut off before their end. */
const cut = (page: Page) => page.evaluate(() => [...document.querySelector('mh-app')!.shadowRoot!.querySelector('mh-rest-screen')!.shadowRoot!.querySelectorAll<HTMLElement>('.number, .stat b, .what')]
  .filter((e) => getComputedStyle(e).overflow === 'hidden' && (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 2)).map((e) => e.textContent!.trim()));

type Hub = { apply(event: unknown): void; getDevices(): { id: string; name: string; capabilities: Record<string, { id: string; baseId: string }> }[] };
/** What the example hub reports, from inside the page. */
const report = (page: Page, what: 'long names' | 'trouble') => page.evaluate((kind) => {
  const { store } = document.querySelector('mh-app') as unknown as { store: Hub };
  const devices = store.getDevices();
  const set = (baseId: string, value: unknown, only = 99) => {
    for (const device of devices) for (const cap of Object.values(device.capabilities)) if (cap.baseId === baseId && only-- > 0) store.apply({ type: 'capability', deviceId: device.id, capabilityId: cap.id, value, at: null });
  };
  if (kind === 'long names') {
    for (const device of devices) store.apply({ type: 'device', device: { ...device, name: `${device.name} in het achterste gedeelte van de ontzettendlangekampeerautonaam` } });
    return;
  }
  set('tank_level', 3);
  set('battery_soc', 12);
  for (const [id, name, title] of [['a1', 'Badkamer', 'Wateralarm'], ['a2', 'Keuken', 'Rookalarm'], ['a3', 'Slaapkamer', 'Koolmonoxide']] as const) {
    const cap = { id: 'alarm_water', baseId: 'alarm_water', title, type: 'boolean', getable: true, setable: false, units: null, min: null, max: null, step: null, decimals: null, options: [], titleTrue: null, titleFalse: null, value: true, lastUpdated: null };
    store.apply({ type: 'device', device: { id, name, zoneId: null, deviceClass: 'sensor', driverId: null, available: true, unavailableMessage: null, capabilityOrder: ['alarm_water'], capabilities: { alarm_water: cap }, energy: { cumulative: false, homeBattery: false } } });
  }
}, what);

const pressed = (tile: Locator) => tile.locator('[role="button"]').getAttribute('aria-pressed');
const middle = async (locator: Locator) => { const box = (await locator.boundingBox())!; return { x: box.x + box.width / 2, y: box.y + Math.min(40, box.height / 2) }; };

/** Texts of the rest screen that are outside the window, outside what they belong to, or over one another. */
const crowded = (page: Page) => page.evaluate(() => {
  const root = document.querySelector('mh-app')!.shadowRoot!.querySelector('mh-rest-screen')!.shadowRoot!;
  const found: string[] = [];
  const boxes: { text: string; box: DOMRect }[] = [];
  const printed = (element: HTMLElement, own: DOMRect): DOMRect => {
    if (getComputedStyle(element).overflow === 'hidden' || element.matches('.pill, .wave, .faint')) return own;
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    const [left, top] = [Math.min(own.left, ...rects.map((r) => r.left)), own.top];
    return new DOMRect(left, top, Math.max(own.right, ...rects.map((r) => r.right)) - left, own.height);
  };
  for (const element of root.querySelectorAll<HTMLElement>('.clock, .date, .temp b, .temp span, .pill, .number, .line, .title, .stat b, .stat span, .wave, .faint')) {
    const own = element.getBoundingClientRect();
    if (own.width === 0) continue;
    const box = printed(element, own);
    const text = `${element.className || element.localName}: ${element.textContent!.trim().slice(0, 40)}`;
    if (box.left < -1 || box.top < -1 || box.right > window.innerWidth + 1 || box.bottom > window.innerHeight + 1) found.push(`outside ${text} ${Math.round(box.left)},${Math.round(box.top)},${Math.round(box.right)},${Math.round(box.bottom)}`);
    boxes.push({ text, box });
  }
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const x = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
      const y = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
      if (x > 3 && y > 3) found.push(`${a.text} over ${b.text}`);
    }
  }
  return found;
});

test('set up in the settings, it comes after two minutes of silence, and any touch takes it away', async ({ browser }) => {
  const { page, clean } = await tablet(browser);
  await page.clock.fastForward('10:00');
  await expect(rest(page)).toHaveCount(0);
  await turnOn(page);
  await page.clock.fastForward('01:50');
  await expect(rest(page)).toHaveCount(0);
  await page.clock.fastForward('00:11');
  await expect(rest(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rustbeeld. Tik om het dashboard te openen.' })).toBeFocused();
  // the dashboard is not there for a screen reader or the keyboard
  expect(await page.locator('mh-dashboard').evaluate((e) => e.hasAttribute('inert'))).toBe(true);
  await page.mouse.click(600, 400);
  await expect(rest(page)).toHaveCount(0);
  expect(await page.locator('mh-dashboard').evaluate((e) => e.hasAttribute('inert'))).toBe(false);
  await clean();
});

for (const by of ['finger', 'mouse'] as const) {
  test(`the first touch does nothing but wake, exactly on a lamp: ${by}`, async ({ browser }) => {
    const { page, clean } = await tablet(browser);
    await turnOn(page);
    const lamp = page.locator('mh-light-tile').first();
    const [at, before] = [await middle(lamp), await pressed(lamp)];
    const touch = () => (by === 'finger' ? page.touchscreen.tap(at.x, at.y) : page.mouse.click(at.x, at.y));
    await page.clock.fastForward('02:01');
    await expect(rest(page)).toBeVisible();
    await touch();
    await expect(rest(page)).toHaveCount(0);
    await page.clock.runFor(1000);
    expect(await pressed(lamp)).toBe(before);
    // and it still stands there, so the same place is the lamp
    expect(await middle(lamp)).toEqual(at);
    await touch();
    await expect(lamp.locator('[role="button"]')).not.toHaveAttribute('aria-pressed', before ?? '');
    await expect(rest(page)).toHaveCount(0);
    await clean();
  });
}

test('a finger that stays and sweeps before it is lifted does nothing either', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'only Chromium can be given real touches one by one');
  const { page, context, clean } = await tablet(browser);
  await turnOn(page);
  const lamp = page.locator('mh-light-tile').first();
  const [at, before] = [await middle(lamp), await pressed(lamp)];
  const level = () => lamp.locator('[role="slider"]').getAttribute('aria-valuenow');
  const dim = await level();
  await page.clock.fastForward('02:01');
  await expect(rest(page)).toBeVisible();
  const client = await context.newCDPSession(page);
  const finger = (type: string, x = 0, y = 0) => client.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await finger('touchStart', at.x, at.y);
  await page.clock.runFor(1500);
  for (let i = 1; i <= 8; i += 1) await finger('touchMove', at.x + i * 20, at.y - i * 10);
  await finger('touchEnd');
  await expect(rest(page)).toHaveCount(0);
  await page.clock.runFor(1000);
  expect([await pressed(lamp), await level(), await page.locator('mh-device-panel mh-sheet[open]').count(), await page.evaluate(() => window.scrollY)]).toEqual([before, dim, 0, 0]);
  await clean();
});

for (const key of ['Space', 'Enter']) {
  test(`${key} wakes and switches nothing, also what had the focus`, async ({ browser }) => {
    const { page, clean } = await tablet(browser);
    await turnOn(page);
    const face = page.locator('mh-light-tile').first().locator('[role="button"]');
    await face.focus();
    const before = await face.getAttribute('aria-pressed');
    await page.clock.fastForward('02:01');
    await expect(rest(page)).toBeVisible();
    await page.keyboard.press(key, { delay: 700 });
    await expect(rest(page)).toHaveCount(0);
    await expect(face).toBeFocused();
    expect(await face.getAttribute('aria-pressed')).toBe(before);
    await page.keyboard.press(key);
    await expect(face).not.toHaveAttribute('aria-pressed', before ?? '');
    await clean();
  });
}

test('a mouse that lies still keeps it there; one that moves wakes', async ({ browser }) => {
  const { page, clean } = await tablet(browser);
  await turnOn(page);
  await page.mouse.move(640, 400);
  await page.clock.fastForward('02:01');
  await expect(rest(page)).toBeVisible();
  await page.mouse.move(640, 400);
  await page.mouse.move(642, 401);
  await page.clock.fastForward('05:00');
  await expect(rest(page)).toBeVisible();
  await page.mouse.move(700, 430);
  await expect(rest(page)).toHaveCount(0);
  await clean();
});

test('the night comes by itself and goes by itself, and using it then is dark', async ({ browser }) => {
  const { page, clean } = await tablet(browser, { time: '22:25' });
  await turnOn(page);
  const html = page.locator('html');
  const night = rest(page).locator('.screen.night');
  await page.clock.runFor(3 * 60_000);
  await expect(rest(page)).toBeVisible();
  await expect(night).toHaveCount(0);
  await page.clock.runFor(3 * 60_000);
  await expect(night).toBeVisible();
  expect(await night.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(0, 0, 0)');
  await expect(rest(page).locator('.clock')).toHaveText('22:31');
  await page.mouse.click(300, 300);
  await expect(rest(page)).toHaveCount(0);
  await expect(html).toHaveAttribute('data-mode', 'dark');
  await page.clock.fastForward('00:31');
  await expect(night).toBeVisible();
  await page.clock.fastForward('09:00:00');
  await expect(rest(page)).toBeVisible();
  await expect(night).toHaveCount(0);
  await expect(html).toHaveAttribute('data-mode', 'light');
  await clean();
});

test('not in the edit mode, however long', async ({ browser }) => {
  const { page, clean } = await tablet(browser);
  await turnOn(page);
  await page.getByRole('button', { name: 'Bewerken', exact: true }).click();
  await page.clock.fastForward('30:00');
  await expect(rest(page)).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Bewerken' })).toBeVisible();
  await page.getByRole('toolbar', { name: 'Bewerken' }).getByRole('button', { name: 'Klaar' }).click();
  await page.clock.fastForward('02:01');
  await expect(rest(page)).toBeVisible();
  await clean();
});

test('having a look at the day and at the night, by hand and with the keyboard', async ({ browser }) => {
  const { page, clean } = await tablet(browser);
  await turnOn(page);
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Rustbeeld bekijken' }).click();
  await expect(rest(page).locator('.hero')).toBeVisible();
  await page.mouse.move(100, 100);
  await page.mouse.move(400, 400);
  await expect(rest(page)).toBeVisible();
  await page.mouse.click(400, 400);
  await expect(rest(page)).toHaveCount(0);
  await expect(dialog(page)).toBeVisible();
  const button = panel.getByRole('button', { name: 'Nacht bekijken' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(rest(page).locator('.screen.night')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(rest(page)).toHaveCount(0);
  // the key that woke did not close the panel as well
  await expect(dialog(page)).toBeVisible();
  await clean();
});

test('a window as narrow as a phone has no wall tablet', async ({ browser }) => {
  const { page, clean } = await tablet(browser);
  await turnOn(page);
  await page.clock.fastForward('02:01');
  await expect(rest(page)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(rest(page)).toHaveCount(0);
  await page.clock.fastForward('30:00');
  await expect(rest(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Meer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Instellingen' }).click();
  await expect(page.getByRole('heading', { name: 'Indeling' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Instellen', exact: true })).toHaveCount(0);
  await clean();
});

const SIZES = [[1280, 800], [960, 600], [1366, 1024], [800, 1280], [600, 480], [1920, 1080], [768, 1024]] as const;
for (const [index, [width, height]] of SIZES.entries()) {
  const [colorScheme, locale] = index % 2 === 0 ? ['light', 'nl-NL'] as const : ['dark', 'en-GB'] as const;
  test(`everything fits: ${width} by ${height}, ${colorScheme}, ${locale}`, async ({ browser }) => {
    const { page, clean } = await tablet(browser, { viewport: { width, height }, colorScheme, locale });
    await turnOn(page);
    await chooseEverything(page);
    await page.clock.fastForward('02:01');
    await expect(rest(page).locator('.number')).toBeVisible();
    expect(await crowded(page)).toEqual([]);
    await report(page, 'trouble');
    await expect(rest(page).locator('.pill')).toHaveCount(4);
    expect(await crowded(page)).toEqual([]);
    await report(page, 'long names');
    await page.clock.runFor(3000);
    await expect(rest(page).locator('.pill').first()).toContainText('achterste');
    expect(await crowded(page)).toEqual([]);
    // every place it takes against burning in
    for (let minute = 0; minute < 8; minute += 1) {
      await page.clock.runFor(60_000);
      expect(await crowded(page)).toEqual([]);
    }
    expect(await page.evaluate(() => [document.documentElement.scrollWidth <= window.innerWidth, window.scrollY])).toEqual([true, 0]);
    // the same at night
    await page.clock.fastForward('02:00:00');
    await expect(rest(page).locator('.screen.night')).toBeVisible();
    await expect(rest(page).locator('.faint')).toHaveCount(3);
    for (let minute = 0; minute < 8; minute += 1) {
      await page.clock.runFor(60_000);
      expect(await crowded(page)).toEqual([]);
    }
    await clean();
  });
}

test('nothing moves by itself', async ({ browser, browserName }) => {
  const { page, clean } = await tablet(browser);
  await turnOn(page);
  await page.clock.fastForward('02:01');
  await expect(rest(page)).toBeVisible();
  await page.waitForTimeout(1500);
  await page.clock.runFor(2000);
  await page.clock.pauseAt(AT('20:50'));
  await page.waitForTimeout(800);
  // for a picture Playwright puts styles in the page of WebKit, which the content security policy refuses
  if (browserName === 'chromium') {
    const first = await page.screenshot({ caret: 'initial' });
    await page.waitForTimeout(1500);
    expect((await page.screenshot({ caret: 'initial' })).equals(first)).toBe(true);
  }
  expect(await page.evaluate(() => {
    const running: string[] = [];
    const walk = (root: Document | ShadowRoot): void => {
      for (const animation of root.getAnimations()) if (animation.playState === 'running') running.push(String((animation as CSSAnimation).animationName ?? 'transition'));
      for (const element of root.querySelectorAll('*')) if (element.shadowRoot) walk(element.shadowRoot);
    };
    walk(document.querySelector('mh-app')!.shadowRoot!.querySelector('mh-rest-screen')!.shadowRoot!);
    return running;
  })).toEqual([]);
  await clean();
});

test('with less motion it is there and gone at once', async ({ browser }) => {
  const { page, clean } = await tablet(browser, { reducedMotion: 'reduce' });
  await turnOn(page);
  await page.clock.fastForward('02:01');
  await expect(rest(page)).toBeVisible();
  expect(await rest(page).locator('.screen').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  await page.mouse.click(10, 10);
  await expect(rest(page)).toHaveCount(0);
  await clean();
});

// ----- found by the review -----

const SHORE = ['Niet aangesloten', 'Net', 'Generator', 'Landstroom', 'Omvormen (eiland)', 'Overig'];
for (const [width, height] of [[1280, 800], [960, 600], [1024, 768], [800, 1280], [600, 480], [768, 1024]] as const) {
  test(`the camper with and without shore power fits, and can be read: ${width} by ${height}`, async ({ browser }) => {
    const { page, clean } = await tablet(browser, { viewport: { width, height } });
    await turnOn(page);
    await chooseEverything(page);
    await page.clock.fastForward('02:01');
    await expect(rest(page).locator('.stat')).toHaveCount(4);
    for (const value of SHORE) {
      await page.evaluate((text) => {
        const { store } = document.querySelector('mh-app') as unknown as { store: Hub };
        const owner = store.getDevices().find((device) => Object.values(device.capabilities).some((cap) => cap.baseId === 'ac_input_source'))!;
        store.apply({ type: 'capability', deviceId: owner.id, capabilityId: 'ac_input_source', value: { 'Niet aangesloten': 'none', Net: 'grid', Generator: 'generator', Landstroom: 'shore', 'Omvormen (eiland)': 'inverting', Overig: 'other' }[text], at: null });
      }, value);
      // without power from outside the word is off-grid, or inverting when the inverter inverts
      const shown = value === 'Niet aangesloten' || value === 'Omvormen (eiland)' ? /^(Off-grid|Omvormen)$/ : value;
      await expect(rest(page).locator('.stat b', { hasText: shown })).toHaveCount(1);
      expect([value, await crowded(page)]).toEqual([value, []]);
      expect([value, await cut(page)]).toEqual([value, []]);
    }
    await clean();
  });
}

test('own heroes with texts and long names stay inside, and leave the alarms their room', async ({ browser }) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 960, height: 600 }, { width: 800, height: 1280 }]) {
    const { page, clean } = await tablet(browser, { viewport });
    await turnOn(page);
    await page.clock.fastForward('02:01');
    await expect(rest(page).locator('.number')).toBeVisible();
    await report(page, 'trouble');
    await page.evaluate(() => {
      const root = document.querySelector('mh-app')!.shadowRoot!.querySelector('mh-rest-screen') as unknown as { hero: unknown };
      const text = { deviceId: 'device-23', capabilityId: 'ac_input_source' };
      root.hero = { kind: 'own', deviceIds: ['device-23'], primary: text, timeToGo: null, line: text, name: 'De stroom van de ontzettendlangekampeerautonaam aan de achterkant van het terrein', stats: [1, 2, 3, 4].map(() => ({ role: 'value', ref: text })) };
      const { store } = document.querySelector('mh-app') as unknown as { store: Hub };
      store.apply({ type: 'capability', deviceId: 'device-23', capabilityId: 'ac_input_source', value: 'inverting', at: null });
    });
    await page.clock.runFor(1000);
    expect(await crowded(page)).toEqual([]);
    await clean();
  }
});

test('a double tap wakes and switches nothing', async ({ browser }) => {
  const { page, clean } = await tablet(browser);
  await turnOn(page);
  const lamp = page.locator('mh-light-tile').first();
  const [at, before] = [await middle(lamp), await pressed(lamp)];
  await page.clock.fastForward('02:01');
  await expect(rest(page)).toBeVisible();
  await page.touchscreen.tap(at.x, at.y);
  await page.touchscreen.tap(at.x, at.y);
  await expect(rest(page)).toHaveCount(0);
  await page.clock.runFor(1000);
  expect(await pressed(lamp)).toBe(before);
  await page.touchscreen.tap(at.x, at.y);
  await expect(lamp.locator('[role="button"]')).not.toHaveAttribute('aria-pressed', before ?? '');
  await clean();
});

test('a mouse that is grabbed and clicked at once does not switch what is underneath', async ({ browser }) => {
  const { page, clean } = await tablet(browser);
  await turnOn(page);
  const lamp = page.locator('mh-light-tile').first();
  const [at, before] = [await middle(lamp), await pressed(lamp)];
  await page.mouse.move(at.x - 300, at.y);
  await page.clock.fastForward('02:01');
  await expect(rest(page)).toBeVisible();
  await page.mouse.move(at.x - 299, at.y);
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await page.mouse.click(at.x, at.y);
  await expect(rest(page)).toHaveCount(0);
  await page.clock.runFor(1000);
  expect(await pressed(lamp)).toBe(before);
  await clean();
});

test('a finger that lies still on a slider keeps the rest screen away, and the slider works afterwards', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'only Chromium can be given real touches one by one');
  const { page, context, clean } = await tablet(browser, { time: '23:00' });
  await turnOn(page);
  const slider = page.locator('mh-light-tile').first().locator('mh-slider');
  const box = (await slider.boundingBox())!;
  const client = await context.newCDPSession(page);
  const finger = (type: string, x = 0, y = 0) => client.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await finger('touchStart', box.x + box.width / 2, box.y + box.height / 2);
  await page.clock.runFor(45_000);
  await expect(rest(page)).toHaveCount(0);
  await finger('touchEnd');
  await page.clock.runFor(1000);
  expect(await slider.evaluate((e) => e.hasAttribute('dragging'))).toBe(false);
  const value = await slider.locator('[role="slider"]').getAttribute('aria-valuenow');
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.clock.runFor(1000);
  expect(await slider.locator('[role="slider"]').getAttribute('aria-valuenow')).toBe(value);
  await clean();
});

test('a look that is left alone before the night is black in the night', async ({ browser }) => {
  const { page, clean } = await tablet(browser, { time: '22:20' });
  await turnOn(page);
  const panel = await openPanel(page);
  await panel.getByRole('button', { name: 'Rustbeeld bekijken' }).click();
  await expect(rest(page)).toBeVisible();
  await page.clock.fastForward('02:01');
  await page.clock.fastForward('10:00');
  await expect(rest(page).locator('.screen.night')).toBeVisible();
  await page.mouse.click(300, 300);
  await expect(rest(page)).toHaveCount(0);
  await expect(dialog(page)).toBeHidden();
  await clean();
});

test('a menu that was open is closed afterwards', async ({ browser }) => {
  const { page, clean } = await tablet(browser);
  await turnOn(page);
  await page.getByRole('button', { name: 'Menu van Accu' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.clock.fastForward('02:01');
  await expect(rest(page)).toBeVisible();
  await page.mouse.click(700, 700);
  await expect(rest(page)).toHaveCount(0);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await clean();
});

test('with forced colours the night is still black', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit has no forced colours');
  const { page, clean } = await tablet(browser, { time: '23:00', forcedColors: 'active' });
  await turnOn(page);
  await page.clock.fastForward('00:31');
  expect(await rest(page).locator('.screen.night').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(0, 0, 0)');
  await clean();
});

test('a scroll that wakes does not move the dashboard', async ({ browser }) => {
  const { page, clean } = await tablet(browser);
  await turnOn(page);
  await page.mouse.move(600, 400);
  await page.clock.fastForward('02:01');
  await expect(rest(page)).toBeVisible();
  for (let i = 0; i < 5; i += 1) await page.mouse.wheel(0, 120);
  await expect(rest(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await clean();
});
