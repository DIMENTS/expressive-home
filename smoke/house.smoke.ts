import { expect, test, type Browser, type BrowserContextOptions, type Locator, type Page } from '@playwright/test';
import { sticksOut } from './fits';

// The example house: its tiles, its windows and its rooms, in Chromium and WebKit.

const WIDE: BrowserContextOptions = { viewport: { width: 1440, height: 900 }, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', baseURL: 'http://localhost:5276/' };
const PHONE: BrowserContextOptions = { ...WIDE, viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
/** Longer than holding takes. */
const HELD = 950;

async function house(browser: Browser, options: BrowserContextOptions = WIDE, theme: Record<string, string> = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => problems.push(`error: ${error.message}`));
  await page.addInitScript((own) => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (event) => (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`));
    if (Object.keys(own).length > 0) localStorage.setItem('dashboard.config', JSON.stringify({ version: 3, theme: { seed: '#3b6939', mode: 'light', density: 'comfortable', ...own } }));
  }, theme);
  await page.goto('/');
  await page.getByRole('button', { name: /voorbeeldhuis|example house/ }).click();
  await expect(page.locator('mh-guard-tile')).not.toHaveCount(0);
  const clean = async () => {
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
    await context.close();
  };
  return { page, clean };
}

/** Every tile with buttons wide, as the owner can make them one by one. */
const makeWide = async (page: Page) => {
  await page.evaluate(() => {
    const { controller } = document.querySelector('mh-app') as unknown as { controller: { setEditing(on: boolean): void; getState(): { boardId: string; board: { left: Block[]; right: Block[] } }; edit(change: unknown): void } };
    type Block = { type: string; section: { tiles: { id: string; kind: string }[] } };
    controller.setEditing(true);
    const { board, boardId } = controller.getState();
    const tiles = [...board.left, ...board.right].flatMap((b) => (b.type === 'section' ? b.section.tiles : [])).filter((t) => ['climate', 'cover', 'media', 'guard'].includes(t.kind));
    for (const tile of tiles) controller.edit({ type: 'set-tile', dashboardId: boardId, tileId: tile.id, patch: { size: 'wide' } });
    controller.setEditing(false);
  });
  await expect(page.locator('mh-guard-tile .controls').first()).toBeVisible();
};

const tile = (page: Page, name: string): Locator => page.locator('mh-climate-tile, mh-cover-tile, mh-media-tile, mh-guard-tile').filter({ has: page.locator('.name', { hasText: new RegExp(`^${name}$`) }) }).first();
const state = (page: Page, name: string) => tile(page, name).locator('.state');
const button = (page: Page, name: string, label: string) => tile(page, name).getByRole('button', { name: label, exact: true });
const question = (page: Page) => page.locator('mh-dialog.confirm[open]');
const press = async (page: Page, target: Locator, ms: number, then?: (x: number, y: number) => Promise<void>) => {
  await target.scrollIntoViewIfNeeded();
  // a press that stops the scrolling begins nothing
  await page.waitForTimeout(300);
  const box = (await target.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await then?.(x, y);
  await page.mouse.up();
};

test('the sections of a house, with what is open, plays and is unlocked', async ({ browser }) => {
  const { page, clean } = await house(browser);
  for (const title of ['Verlichting', 'Klimaat', 'Gordijnen', 'Muziek en tv', 'Beveiliging', 'Flows']) await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(state(page, 'Thermostaat')).toHaveText('20,5° · naar 21°');
  await expect(state(page, 'Radiator')).toHaveText('Naar 17°');
  await expect(state(page, 'Rolgordijn')).toHaveText('60% open');
  await expect(state(page, 'Zonwering')).toHaveText('Ingerold');
  await expect(state(page, 'Muziek')).toHaveText('Speelt: Zonlicht op het water');
  await expect(state(page, 'Voordeur')).toHaveText('Op slot');
  await expect(page.getByText('1 speelt')).toBeVisible();
  await expect(page.getByText('3 open')).toBeVisible();
  await clean();
});

test('a tile is made wide in its menu, and gets its buttons', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await page.getByRole('button', { name: 'Bewerken', exact: true }).first().click();
  await page.getByRole('button', { name: 'Thermostaat bewerken' }).or(page.getByRole('button', { name: /^Thermostaat/ })).first().click();
  await page.getByRole('menuitemradio', { name: 'Breed, met knoppen' }).or(page.getByRole('menuitem', { name: 'Breed, met knoppen' })).first().click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Klaar' }).first().click();
  await expect(tile(page, 'Thermostaat').locator('mh-stepper')).toBeVisible();
  await clean();
});

test('the target is stepped on the tile, and the room gets there', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await makeWide(page);
  const more = button(page, 'Thermostaat', 'Thermostaat warmer');
  for (let i = 0; i < 3; i += 1) await more.click();
  await expect(tile(page, 'Thermostaat').locator('.value')).toHaveText(/22,5\s*°/);
  await expect(state(page, 'Thermostaat')).toHaveText(/naar 22,5°/);
  // the tile itself opens its window; its buttons did not
  await expect(page.locator('mh-device-panel mh-sheet[open]')).toHaveCount(0);
  await tile(page, 'Thermostaat').locator('.head').click();
  await expect(page.locator('mh-device-panel mh-sheet[open]')).toHaveCount(1);
  await clean();
});

test('a curtain goes down, stops and says where it is', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await makeWide(page);
  await button(page, 'Gordijn', 'Gordijn sluiten').click();
  await expect(state(page, 'Gordijn')).toHaveText('Gaat dicht…');
  await page.waitForTimeout(1200);
  await button(page, 'Gordijn', 'Gordijn stoppen').click();
  await expect(state(page, 'Gordijn')).toHaveText(/^\d+% open$/);
  // and to where it is dragged
  const slider = tile(page, 'Rolgordijn').locator('mh-slider');
  const box = (await slider.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
  await expect(state(page, 'Rolgordijn')).toHaveText(/^2\d% open$/);
  await clean();
});

test('music pauses and skips, without a notice for every press', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await makeWide(page);
  await button(page, 'Muziek', 'Muziek: volgende').click();
  await expect(state(page, 'Muziek')).toHaveText('Speelt: Langs de rivier');
  await button(page, 'Muziek', 'Muziek: pauzeren').click();
  await expect(state(page, 'Muziek')).toHaveText('Gepauzeerd');
  await expect(page.locator('mh-snackbar')).not.toContainText('Muziek');
  await button(page, 'Televisie', 'Televisie uitzetten').click();
  await expect(state(page, 'Televisie')).toHaveText('Uit');
  await clean();
});

test('a lock is unlocked by holding, and not by anything less', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await makeWide(page);
  const unlock = button(page, 'Voordeur', 'Voordeur ontgrendelen');
  // let go too soon
  await press(page, unlock, 600);
  await page.waitForTimeout(400);
  await expect(question(page)).toHaveCount(0);
  // moved away
  await press(page, unlock, 300, async (x, y) => { await page.mouse.move(x + 30, y, { steps: 4 }); await page.waitForTimeout(HELD); });
  await expect(state(page, 'Voordeur')).toHaveText('Op slot');
  await expect(question(page)).toHaveCount(0);
  // held
  await press(page, unlock, HELD);
  await expect(state(page, 'Voordeur')).toHaveText(/Ontgrendelt…|Van slot/);
  await expect(state(page, 'Voordeur')).toHaveText('Van slot');
  await expect(page.locator('mh-device-panel mh-sheet[open]')).toHaveCount(0);
  // the other way with one tap
  await button(page, 'Voordeur', 'Voordeur vergrendelen').click();
  await expect(state(page, 'Voordeur')).toHaveText('Op slot');
  await clean();
});

test('a short tap and a key ask, and a double tap does not answer', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await makeWide(page);
  const unlock = button(page, 'Voordeur', 'Voordeur ontgrendelen');
  await unlock.scrollIntoViewIfNeeded();
  await unlock.dblclick();
  await expect(question(page)).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Voordeur ontgrendelen?' })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(state(page, 'Voordeur')).toHaveText('Op slot');
  await page.getByRole('button', { name: 'Annuleren' }).last().click();
  await expect(question(page)).toHaveCount(0);
  // with the keyboard: it stays there when nothing is done, and does it when that is meant
  await unlock.focus();
  await page.keyboard.press('Enter');
  await expect(question(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(question(page)).toHaveCount(0);
  await expect(state(page, 'Voordeur')).toHaveText('Op slot');
  await unlock.focus();
  await page.keyboard.press('Space');
  await expect(question(page)).toHaveCount(1);
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Ontgrendelen', exact: true }).last().click();
  await expect(state(page, 'Voordeur')).toHaveText('Van slot');
  await clean();
});

test('a garage door and an alarm, from their windows', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await tile(page, 'Garagedeur').locator('.tile').click();
  const open = page.locator('mh-device-panel').getByRole('button', { name: 'Garagedeur openen' });
  await page.waitForTimeout(600);
  await press(page, open, HELD);
  await expect(page.locator('mh-device-panel .stands b')).toHaveText('Gaat open…');
  await expect(page.locator('mh-device-panel .stands b')).toHaveText('Open', { timeout: 8000 });
  await page.keyboard.press('Escape');
  await tile(page, 'Huisalarm').locator('.tile').click();
  await page.waitForTimeout(600);
  const alarm = page.locator('mh-device-panel');
  await alarm.getByRole('button', { name: 'Huisalarm inschakelen' }).click();
  await expect(alarm.locator('.stands b')).toHaveText('Ingeschakeld');
  await alarm.getByRole('button', { name: 'Huisalarm uitschakelen' }).click();
  await expect(question(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(alarm.locator('.stands b')).toHaveText('Ingeschakeld');
  await press(page, alarm.getByRole('button', { name: 'Huisalarm uitschakelen' }), HELD);
  await expect(alarm.locator('.stands b')).toHaveText('Uit');
  await clean();
});

test('a finger on a phone: holding unlocks, scrolling over the button does not', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'only its protocol makes real touches');
  const { page, clean } = await house(browser, PHONE);
  await tile(page, 'Voordeur').locator('.tile').tap();
  await page.waitForTimeout(700);
  const unlock = page.locator('mh-device-panel').getByRole('button', { name: 'Voordeur ontgrendelen' });
  const client = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const box = (await unlock.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await touch('touchStart', x, y);
  for (let i = 1; i <= 8; i += 1) await touch('touchMove', x, y - i * 8);
  await page.waitForTimeout(HELD);
  await touch('touchEnd');
  await expect(page.locator('mh-device-panel .stands b')).toHaveText('Op slot');
  await page.waitForTimeout(500);
  const again = (await unlock.boundingBox())!;
  await touch('touchStart', again.x + again.width / 2, again.y + again.height / 2);
  await page.waitForTimeout(HELD);
  await touch('touchEnd');
  await expect(page.locator('mh-device-panel .stands b')).toHaveText('Van slot');
  await expect(question(page)).toHaveCount(0);
  await clean();
});

test('every kind of window has what it needs and nothing stands outside it', async ({ browser }) => {
  for (const options of [WIDE, PHONE]) {
    const { page, clean } = await house(browser, options);
    for (const name of ['Thermostaat', 'Airco', 'Gordijn', 'Jaloezie', 'Zonwering', 'Rolluik', 'Muziek', 'Televisie', 'Slaapkamer-tv', 'Voordeur', 'Garagedeur', 'Huisalarm', 'Poort']) {
      const target = tile(page, name).locator('.face');
      await target.scrollIntoViewIfNeeded();
      await target.click();
      await expect(page.locator('mh-device-panel mh-sheet[open]')).toHaveCount(1);
      await expect(page.locator('mh-device-panel .top-of')).toBeVisible();
      await page.waitForTimeout(500);
      expect([name, await page.locator('mh-device-panel .body').evaluate((body) => body.scrollWidth <= body.clientWidth)]).toEqual([name, true]);
      expect([name, await sticksOut(page)]).toEqual([name, []]);
      await page.keyboard.press('Escape');
      await expect(page.locator('mh-device-panel mh-sheet[open]')).toHaveCount(0);
      await page.waitForTimeout(300);
    }
    await clean();
  }
});

for (const density of ['comfortable', 'compact']) {
  for (const width of [1920, 1440, 1280, 1180, 1024, 820, 700, ...(density === 'comfortable' ? [430, 390, 360, 320] : [])]) {
    test(`the tiles of a house stay in their blocks: ${width} wide, ${density}`, async ({ browser }) => {
      const { page, clean } = await house(browser, { ...WIDE, viewport: { width, height: 900 } }, { density });
      expect(['narrow', await sticksOut(page)]).toEqual(['narrow', []]);
      if (width >= 600) await makeWide(page);
      await page.waitForTimeout(200);
      expect(['wide', await sticksOut(page)]).toEqual(['wide', []]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      // every button can be hit, and lies in its own tile
      const loose = await page.evaluate(() => {
        const found: string[] = [];
        const walk = (root: ParentNode): void => {
          for (const element of root.querySelectorAll<HTMLElement>('*')) {
            if (element.shadowRoot) walk(element.shadowRoot);
            if (!element.matches('.controls') || element.offsetWidth === 0) continue;
            const box = element.closest('.tile')!.getBoundingClientRect();
            for (const part of element.querySelectorAll<HTMLElement>('button, mh-slider, mh-stepper, mh-hold-button')) {
              const rect = part.getBoundingClientRect();
              if (rect.width === 0) continue;
              if (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.bottom > box.bottom + 1) found.push(`${part.getAttribute('aria-label') ?? part.localName} outside`);
              if (rect.height < 20 || rect.width < 24) found.push(`${part.getAttribute('aria-label') ?? part.localName} too small: ${Math.round(rect.width)}x${Math.round(rect.height)}`);
            }
          }
        };
        walk(document);
        return found;
      });
      expect(loose).toEqual([]);
      await clean();
    });
  }
}

test('dark and in English too, and with less motion a curtain does not slide', async ({ browser }) => {
  const { page, clean } = await house(browser, { ...WIDE, locale: 'en-GB', colorScheme: 'dark', reducedMotion: 'reduce' }, { mode: 'dark' });
  await makeWide(page);
  await expect(state(page, 'Front door')).toHaveText('Locked');
  await expect(button(page, 'Curtain', 'Close Curtain')).toBeVisible();
  await tile(page, 'Curtain').locator('.head').click();
  expect(await page.locator('mh-device-panel .cloth').first().evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  // less motion fills in steps
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const unlock = button(page, 'Front door', 'Unlock Front door');
  await press(page, unlock, 450, async () => {
    expect(await tile(page, 'Front door').locator('mh-hold-button').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--_part'))).toBe('0.75');
  });
  await clean();
});

// ----- rooms -----

const bar = (page: Page) => page.locator('mh-rail, mh-nav-bar');
const card = (page: Page, name: string) => page.locator('mh-room-card').filter({ has: page.locator('b', { hasText: new RegExp(`^${name}$`) }) });
const toRooms = async (page: Page) => {
  await bar(page).getByRole('button', { name: /^(Kamers|Rooms)$/ }).click();
  await expect(page.locator('mh-room-card')).toHaveCount(8);
};
const perRoom = (page: Page) => page.evaluate(() => (document.querySelector('mh-app') as unknown as { controller: { setGrouping(g: string): void } }).controller.setGrouping('zone'));

test('a wide tile opens its window beside its buttons, whatever its kind', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await makeWide(page);
  for (const name of ['Thermostaat', 'Gordijn', 'Rolluik', 'Muziek', 'Televisie', 'Voordeur', 'Huisalarm']) {
    await tile(page, name).locator('.head').click();
    await expect(page.locator('mh-device-panel mh-sheet[open]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('mh-device-panel mh-sheet[open]')).toHaveCount(0);
    await page.waitForTimeout(300);
  }
  await clean();
});

test('into a room and back, with the mouse and with the keyboard', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await toRooms(page);
  await expect(card(page, 'Woonkamer').locator('.facts')).toContainText('2 aan');
  await card(page, 'Woonkamer').locator('b').click();
  await expect(page.locator('mh-room-head h2')).toHaveText('Woonkamer');
  await expect(tile(page, 'Thermostaat').locator('mh-stepper')).toBeVisible();
  await page.getByRole('button', { name: 'Terug naar Kamers' }).click();
  await expect(page.locator('mh-room-card')).toHaveCount(8);
  // back at the card that was left, and in again with Enter
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await expect(page.locator('mh-room-head h2')).toHaveText('Woonkamer');
  await bar(page).getByRole('button', { name: 'Overzicht' }).click();
  await expect(page.locator('mh-hero')).toBeVisible();
  await clean();
});

test('the switch of a room turns its lamps off and on', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await toRooms(page);
  const lamps = card(page, 'Woonkamer').getByRole('switch', { name: 'Lampen van Woonkamer' });
  await expect(lamps).toHaveAttribute('aria-checked', 'true');
  await lamps.click();
  await expect(lamps).toHaveAttribute('aria-checked', 'false');
  await expect(card(page, 'Woonkamer').locator('.facts')).not.toContainText('aan');
  await lamps.click();
  await expect(card(page, 'Woonkamer').locator('.facts')).toContainText('3 aan');
  await expect(page.locator('mh-room-head')).toHaveCount(0);
  await clean();
});

test('a lock in a room is held as everywhere', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await toRooms(page);
  await card(page, 'Hal').locator('b').click();
  await press(page, button(page, 'Voordeur', 'Voordeur ontgrendelen'), HELD);
  await expect(state(page, 'Voordeur')).toHaveText('Van slot');
  await expect(page.locator('mh-room-head .facts')).toContainText('1 van slot');
  await page.getByRole('button', { name: 'Terug naar Kamers' }).click();
  await expect(card(page, 'Hal').locator('.facts')).toContainText('1 van slot');
  await clean();
});

test('the Overzicht per room, from the settings; editing keeps the rooms', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await bar(page).getByRole('button', { name: 'Instellingen' }).click();
  await page.locator('mh-settings-panel').getByRole('radio', { name: 'Per kamer' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Woonkamer' })).toBeVisible();
  await expect(page.locator('mh-section').filter({ has: page.locator('h2', { hasText: 'Woonkamer' }) }).locator('.count')).toHaveText('20,8°');
  await bar(page).getByRole('button', { name: 'Bewerken' }).click();
  await page.getByRole('button', { name: /^Thermostaat/ }).first().click();
  await page.getByText('Breed, met knoppen').first().click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Klaar' }).first().click();
  for (const title of ['Woonkamer', 'Keuken', 'Hal', 'Slaapkamer', 'Werkkamer', 'Badkamer', 'Garage', 'Tuin', 'Flows']) await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(tile(page, 'Thermostaat').locator('mh-stepper')).toBeVisible();
  // the rooms can be hidden
  await bar(page).getByRole('button', { name: 'Instellingen' }).click();
  await page.locator('mh-settings-panel').getByRole('switch', { name: 'Kamers in de balk' }).click();
  await page.keyboard.press('Escape');
  await expect(bar(page).getByRole('button', { name: 'Kamers' })).toHaveCount(0);
  await clean();
});

test('on a phone the rooms are in the bar, and in the menu when there is no room for them', async ({ browser }) => {
  const { page, clean } = await house(browser, PHONE);
  await bar(page).getByRole('button', { name: 'Kamers' }).tap();
  await expect(page.locator('mh-room-card')).toHaveCount(8);
  await card(page, 'Keuken').locator('b').tap();
  await expect(page.locator('mh-room-head h2')).toHaveText('Keuken');
  await page.evaluate(() => {
    const { controller } = document.querySelector('mh-app') as unknown as { controller: { edit(change: unknown): void } };
    for (let i = 0; i < 5; i += 1) controller.edit({ type: 'add-dashboard', dashboard: { id: `d-${i}`, name: `Dashboard ${i}`, icon: 'home', sections: [] } });
  });
  await expect(page.locator('mh-nav-bar .boards').getByRole('button', { name: 'Kamers' })).toHaveCount(0);
  await page.locator('mh-nav-bar [aria-haspopup]').tap();
  await page.getByRole('menuitem', { name: 'Kamers' }).tap();
  await expect(page.locator('mh-room-card')).toHaveCount(8);
  await clean();
});

for (const [width, density] of [[1920, 'comfortable'], [1440, 'compact'], [1280, 'comfortable'], [1024, 'comfortable'], [820, 'compact'], [700, 'comfortable'], [430, 'comfortable'], [360, 'comfortable'], [320, 'comfortable']] as const) {
  test(`the rooms stay in their blocks: ${width} wide, ${density}`, async ({ browser }) => {
    const { page, clean } = await house(browser, { ...WIDE, viewport: { width, height: 900 } }, { density });
    const fits = async (what: string) => {
      await page.waitForTimeout(200);
      expect([what, await sticksOut(page)]).toEqual([what, []]);
      expect([what, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)]).toEqual([what, true]);
      // nothing of a card lies outside it
      expect([what, await page.evaluate(() => {
        const found: string[] = [];
        for (const host of [...document.querySelector('mh-app')!.shadowRoot!.querySelector('mh-dashboard')!.shadowRoot!.querySelector('mh-rooms')?.shadowRoot?.querySelectorAll('mh-room-card') ?? []]) {
          const box = host.shadowRoot!.querySelector('.card')!.getBoundingClientRect();
          for (const part of host.shadowRoot!.querySelectorAll('b, .fact, mh-switch')) {
            const rect = part.getBoundingClientRect();
            if (rect.left < box.left || rect.right > box.right || rect.bottom > box.bottom) found.push(part.textContent!.trim() || part.localName);
          }
        }
        return found;
      })]).toEqual([what, []]);
    };
    await toRooms(page);
    await fits('rooms');
    for (const name of ['Woonkamer', 'Garage']) {
      await card(page, name).locator('b').click();
      await fits(name);
      await page.getByRole('button', { name: 'Terug naar Kamers' }).click();
    }
    await perRoom(page);
    await bar(page).getByRole('button', { name: 'Overzicht' }).first().click();
    await fits('per room');
    await clean();
  });
}

test('a card goes along with what the hub says', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await toRooms(page);
  await page.evaluate(() => {
    const app = document.querySelector('mh-app') as unknown as { store: { getDevices(): { id: string }[]; apply(event: unknown): void } };
    for (const device of app.store.getDevices()) app.store.apply({ type: 'capability', deviceId: device.id, capabilityId: 'onoff', value: false, at: null });
  });
  await expect(card(page, 'Woonkamer').getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await clean();
});
