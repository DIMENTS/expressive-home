import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { CONTROL_PORT } from '../playwright.homey.config';

// The app on the hub from start to finish: pairing, controlling, live, the shared dashboards and the rights.

/** The hand of the test: what the owner does in the Homey app, and what the hub reports. */
async function hand<T = unknown>(action: string, body: unknown = {}): Promise<T> {
  return (await (await fetch(`http://127.0.0.1:${CONTROL_PORT}/${action}`, { method: 'POST', body: JSON.stringify(body) })).json()) as T;
}

/** A browser of its own, as another device has; collects what must never happen. */
async function device(browser: Browser, path = '/', viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('request', (request) => { if (new URL(request.url()).hostname !== 'localhost') problems.push(`request to ${request.url()}`); });
  await page.addInitScript(() => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (event) => (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await page.goto(path);
  return { page, context, problems, violations: () => page.evaluate(() => (window as unknown as { violations: string[] }).violations) };
}

async function pair(page: Page, role: 'use' | 'edit', name: string): Promise<void> {
  const { code } = await hand<{ code: string }>('code', { role });
  await page.getByRole('textbox', { name: 'Naam van dit apparaat' }).fill(name);
  await page.getByRole('textbox', { name: 'Code' }).fill(code);
  await page.getByRole('button', { name: 'Koppelen' }).click();
  await expect(page.getByText('Lokaal verbonden')).toBeVisible();
}

/** Without the rooms, which stand after them. */
const boards = (page: Page) => page.locator('mh-rail .boards button').allTextContents().then((names) => names.map((name) => name.trim()).filter((name) => name !== 'Kamers'));
const lampOf = (page: Page) => page.locator('mh-light-tile').first().locator('[role="button"]');

test.beforeEach(async () => {
  await hand('refuse', { on: false });
  await hand('unflow');
  await hand('reset');
  for (const { name } of await hand<{ name: string }[]>('devices')) await hand('remove', { name });
  await hand('stop');
  await hand('start');
});

test('pairing, controlling and following what happens elsewhere', async ({ browser }) => {
  const d = await device(browser);
  await expect(d.page.getByRole('heading', { name: 'Koppel dit apparaat' })).toBeVisible();
  await expect(d.page.getByText('API-sleutel')).toHaveCount(0);
  // a wrong code is said, and does nothing
  await d.page.getByRole('textbox', { name: 'Code' }).fill('000000');
  await d.page.getByRole('button', { name: 'Koppelen' }).click();
  await expect(d.page.getByText('Deze code klopt niet of is verlopen.')).toBeVisible();
  await pair(d.page, 'edit', 'Tablet');
  expect(await hand('devices')).toMatchObject([{ name: 'Tablet', role: 'edit' }]);

  // a lamp, and one that is turned elsewhere
  const lamp = lampOf(d.page);
  const before = await lamp.getAttribute('aria-pressed');
  await lamp.click();
  await expect(lamp).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  const other = await device(browser);
  await pair(other.page, 'use', 'Telefoon');
  await expect(lampOf(other.page)).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await lampOf(other.page).click();
  await expect(lamp).toHaveAttribute('aria-pressed', before ?? 'false');

  // the hub refuses: the tile turns back and it is said
  await hand('refuse', { on: true });
  await lamp.click();
  await expect(d.page.getByText(/reageerde niet.$/)).toBeVisible();
  await expect(lamp).toHaveAttribute('aria-pressed', before ?? 'false');
  await hand('refuse', { on: false });

  // it opens by itself the next time, and nothing of the hub stays in the storage of the browser
  await d.page.reload();
  await expect(d.page.getByText('Lokaal verbonden')).toBeVisible();
  const stored = await d.page.evaluate(() => JSON.stringify(localStorage) + document.cookie);
  expect(stored).not.toContain('mh_device');
  // a refused command is the only thing a browser may complain about
  expect(d.problems.filter((text) => !text.includes('502') && !text.includes('403'))).toEqual([]);
  expect([await d.violations(), await other.violations()]).toEqual([[], []]);
  await d.context.close();
  await other.context.close();
});

test('a scanned code: one tap, and the dashboard is there', async ({ browser }) => {
  const { code } = await hand<{ code: string }>('code', { role: 'edit' });
  const d = await device(browser, `/#pair=${code}`);
  await expect(d.page.getByText('De code is gescand.')).toBeVisible();
  expect(new URL(d.page.url()).hash).toBe('');
  await expect(d.page.getByRole('textbox')).toHaveCount(1);
  await expect(d.page.getByRole('textbox', { name: 'Naam van dit apparaat' })).toHaveValue('Laptop');
  await d.page.getByRole('button', { name: 'Koppelen' }).dblclick();
  await expect(d.page.getByText('Lokaal verbonden')).toBeVisible();
  expect(await hand('devices')).toMatchObject([{ name: 'Laptop', role: 'edit' }]);
  expect(await d.page.evaluate(() => JSON.stringify(localStorage))).not.toContain(code);

  // the same code on another device: it was used
  const late = await device(browser, `/#pair=${code}`);
  await late.page.getByRole('button', { name: 'Koppelen' }).click();
  await expect(late.page.getByRole('heading', { name: 'Deze code werkt niet meer' })).toBeVisible();
  const next = await hand<{ code: string }>('code', { role: 'use' });
  // a device that is paired opens, and the code is still good
  await d.page.goto('about:blank');
  await d.page.goto(`/#pair=${next.code}`);
  await expect(d.page.getByText('Lokaal verbonden')).toBeVisible();
  // typed over
  await late.page.getByRole('button', { name: 'Code typen' }).click();
  await late.page.getByRole('textbox', { name: 'Code' }).fill(next.code);
  await late.page.getByRole('button', { name: 'Koppelen' }).click();
  await expect(late.page.getByText('Lokaal verbonden')).toBeVisible();
  expect(await hand('devices')).toMatchObject([{ name: 'Laptop', role: 'edit' }, { name: 'Laptop', role: 'use' }]);

  // scanned again in the tab where the pair screen is open
  const open = await device(browser);
  await expect(open.page.getByRole('heading', { name: 'Koppel dit apparaat' })).toBeVisible();
  const third = await hand<{ code: string }>('code', { role: 'use' });
  await open.page.evaluate((hash) => { window.location.hash = hash; }, `#pair=${third.code}`);
  await open.page.getByRole('button', { name: 'Koppelen' }).click();
  await expect(open.page.getByText('Lokaal verbonden')).toBeVisible();

  expect([await d.violations(), await late.violations(), await open.violations()]).toEqual([[], [], []]);
  for (const each of [d, late, open]) {
    expect(each.problems.filter((text) => !text.includes('403'))).toEqual([]);
    await each.context.close();
  }
});

test('too many wrong codes: the scanned one is kept to try again', async ({ browser }) => {
  const { code } = await hand<{ code: string }>('code', { role: 'use' });
  const d = await device(browser, `/#pair=${code}`, { width: 390, height: 844 });
  for (let i = 0; i < 5; i += 1) await d.page.evaluate(async (wrong) => { await fetch('api/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: wrong, name: 'x' }) }); }, code === '999999' ? '888888' : '999999');
  await d.page.getByRole('button', { name: 'Koppelen' }).click();
  await expect(d.page.getByText('Te vaak een verkeerde code.')).toBeVisible();
  await expect(d.page.getByRole('button', { name: 'Opnieuw proberen' })).toBeVisible();
  // nothing sticks out on a phone
  expect(await d.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await d.context.close();
});

test('the right of a device changes while its page is open', async ({ browser }) => {
  const d = await device(browser);
  await pair(d.page, 'use', 'Tablet');
  const edit = d.page.locator('mh-rail').getByRole('button', { name: 'Bewerken' });
  await expect(edit).toHaveCount(0);
  await hand('role', { name: 'Tablet', role: 'edit' });
  await expect(edit).toBeVisible();
  await edit.click();
  await expect(d.page.getByRole('button', { name: 'Sectie toevoegen' }).first()).toBeVisible();
  // taken back in the middle of it
  await hand('role', { name: 'Tablet', role: 'use' });
  await expect(d.page.getByRole('button', { name: 'Sectie toevoegen' })).toHaveCount(0);
  await expect(edit).toHaveCount(0);
  await d.context.close();
});

test('the dashboards are the same on every device, at once', async ({ browser }) => {
  const laptop = await device(browser);
  const tablet = await device(browser);
  await pair(laptop.page, 'edit', 'Laptop');
  await pair(tablet.page, 'use', 'Tablet');

  // the tablet may only use it
  const rail = tablet.page.locator('mh-rail');
  await expect(rail.getByRole('button', { name: 'Thema' })).toBeVisible();
  await expect(rail.getByRole('button', { name: 'Bewerken' })).toHaveCount(0);
  await expect(tablet.page.getByRole('button', { name: /^Menu van / })).toHaveCount(0);

  // the laptop makes a dashboard; the tablet shows it
  await laptop.page.locator('mh-rail').getByRole('button', { name: 'Bewerken' }).click();
  await laptop.page.locator('mh-rail').getByRole('button', { name: 'Nieuw' }).click();
  const dialog = laptop.page.locator('mh-name-icon-dialog.board');
  await dialog.getByRole('textbox', { name: 'Naam' }).fill('Buiten');
  await dialog.getByRole('button', { name: 'Maken' }).click();
  await laptop.page.getByRole('button', { name: 'Sectie toevoegen' }).first().click();
  const section = laptop.page.locator('mh-name-icon-dialog:not(.board)');
  await section.getByRole('textbox', { name: 'Naam' }).fill('Terras');
  await section.getByRole('button', { name: 'Toevoegen' }).click();
  await expect.poll(() => boards(tablet.page)).toEqual(['Overzicht', 'Buiten']);
  await rail.getByRole('button', { name: 'Buiten' }).click();
  await expect(tablet.page.locator('mh-section h2 .title')).toHaveText('Terras');

  // the tablet follows the house; the laptop may choose a look of its own
  await laptop.page.getByRole('button', { name: 'Klaar' }).click();
  await laptop.page.locator('mh-rail').getByRole('button', { name: 'Thema' }).click();
  await laptop.page.getByRole('radiogroup', { name: 'Voor wie' }).getByRole('radio', { name: 'Dit apparaat' }).click();
  await laptop.page.getByRole('radio', { name: 'Donker' }).click();
  await expect(laptop.page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(tablet.page.locator('html')).toHaveAttribute('data-mode', 'light');
  await laptop.page.keyboard.press('Escape');

  // and it is all still there when the app on the hub starts again
  await hand('stop');
  await expect(tablet.page.getByText('Geen verbinding').first()).toBeVisible({ timeout: 20_000 });
  await hand('start');
  await expect(tablet.page.getByText('Lokaal verbonden')).toBeVisible({ timeout: 20_000 });
  await laptop.page.reload();
  await expect.poll(() => boards(laptop.page)).toEqual(['Overzicht', 'Buiten']);
  await laptop.context.close();
  await tablet.context.close();
});

test('per room and the rooms are chosen for every device, and kept', async ({ browser }) => {
  const laptop = await device(browser);
  const tablet = await device(browser);
  await pair(laptop.page, 'edit', 'Laptop');
  await pair(tablet.page, 'use', 'Tablet');
  const bar = (page: Page) => page.locator('mh-rail');
  // a device that only uses it has the rooms, and nothing to choose
  await bar(tablet.page).getByRole('button', { name: 'Kamers' }).click();
  await expect(tablet.page.locator('mh-room-card').first()).toBeVisible();
  await bar(tablet.page).getByRole('button', { name: 'Instellingen' }).click();
  await expect(tablet.page.locator('mh-settings-panel').getByRole('radio', { name: 'Per kamer' })).toHaveCount(0);
  await tablet.page.keyboard.press('Escape');
  await bar(tablet.page).getByRole('button', { name: 'Overzicht' }).click();
  const perKind = await tablet.page.locator('mh-section').count();

  await bar(laptop.page).getByRole('button', { name: 'Instellingen' }).click();
  await laptop.page.locator('mh-settings-panel').getByRole('radio', { name: 'Per kamer' }).click();
  await laptop.page.locator('mh-settings-panel').getByRole('switch', { name: 'Kamers in de balk' }).click();
  await expect(bar(tablet.page).getByRole('button', { name: 'Kamers' })).toHaveCount(0);
  await expect.poll(() => tablet.page.locator('mh-section').filter({ has: tablet.page.locator('mh-light-tile') }).count()).toBeGreaterThan(1);
  expect(perKind).toBeGreaterThan(1);
  // and it is still so when the app on the hub starts again
  await hand('stop');
  await hand('start');
  await laptop.page.reload();
  await expect(laptop.page.getByText('Lokaal verbonden')).toBeVisible();
  await expect(bar(laptop.page).getByRole('button', { name: 'Kamers' })).toHaveCount(0);
  await expect.poll(() => laptop.page.locator('mh-section').filter({ has: laptop.page.locator('mh-light-tile') }).count()).toBeGreaterThan(1);
  expect([await laptop.violations(), await tablet.violations()]).toEqual([[], []]);
  await laptop.context.close();
  await tablet.context.close();
});

test('a device that the owner takes away is out at once, and can be paired again', async ({ browser }) => {
  const d = await device(browser);
  await pair(d.page, 'edit', 'Oude tablet');
  await hand('remove', { name: 'Oude tablet' });
  await expect(d.page.getByText('Dit apparaat is losgekoppeld.')).toBeVisible();
  await d.page.reload();
  await expect(d.page.getByRole('heading', { name: 'Koppel dit apparaat' })).toBeVisible();
  await pair(d.page, 'use', 'Oude tablet');

  // and it can take itself away
  await d.page.getByRole('button', { name: 'Instellingen' }).click();
  await expect(d.page.getByText('Dit apparaat mag alleen gebruiken.')).toBeVisible();
  await d.page.getByRole('button', { name: 'Dit apparaat ontkoppelen' }).click();
  await d.page.locator('mh-settings-panel mh-dialog').getByRole('button', { name: 'Ontkoppelen' }).click();
  await expect(d.page.getByRole('heading', { name: 'Koppel dit apparaat' })).toBeVisible();
  expect(await hand('devices')).toEqual([]);
  await d.context.close();
});

test('"Nu proberen" works, and the page follows afterwards as it did before', async ({ browser }) => {
  const d = await device(browser);
  await pair(d.page, 'edit', 'Tablet');
  const lamp = lampOf(d.page);
  for (const moment of ['while it is away', 'when it is back']) {
    await hand('stop');
    await expect(d.page.getByText('Geen verbinding').first()).toBeVisible({ timeout: 20_000 });
    if (moment === 'when it is back') await hand('start');
    await d.page.getByRole('button', { name: 'Nu proberen' }).click();
    if (moment === 'while it is away') {
      await d.page.waitForTimeout(500);
      await hand('start');
    }
    await expect(d.page.getByText('Lokaal verbonden')).toBeVisible({ timeout: 20_000 });
    // a lamp that is turned on another device
    const other = await device(browser);
    await pair(other.page, 'use', 'Telefoon');
    const before = await lamp.getAttribute('aria-pressed');
    await lampOf(other.page).click();
    await expect(lamp).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
    await hand('remove', { name: 'Telefoon' });
    await other.context.close();
  }
  await d.context.close();
});

test('letters that are typed stay, also when they are saved meanwhile, and are one step to undo', async ({ browser }) => {
  const laptop = await device(browser);
  const tablet = await device(browser);
  await pair(laptop.page, 'edit', 'Laptop');
  await pair(tablet.page, 'use', 'Tablet');
  let puts = 0;
  laptop.page.on('request', (request) => { if (request.method() === 'PUT') puts += 1; });
  await laptop.page.locator('mh-rail').getByRole('button', { name: 'Bewerken' }).click();
  await laptop.page.locator('mh-light-tile').first().getByRole('button', { name: /menu openen$/ }).click();
  await laptop.page.getByRole('menuitem', { name: 'Tegel instellen…' }).click();
  const field = laptop.page.locator('mh-tile-panel').getByRole('textbox', { name: 'Naam op de tegel' });
  await field.click();
  await field.pressSequentially('Buitenkeuken links', { delay: 60 });
  await expect(field).toHaveValue('Buitenkeuken links');
  await expect(tablet.page.locator('mh-light-tile').first()).toContainText('Buitenkeuken links');
  // not one for every letter
  expect(puts).toBeLessThan(10);
  await expect(field).toHaveValue('Buitenkeuken links');
  await laptop.page.keyboard.press('Escape');
  await expect(field).toBeHidden();
  await laptop.page.locator('mh-edit-bar').getByRole('button', { name: /Ongedaan/ }).click();
  await expect(laptop.page.locator('mh-light-tile').first()).not.toContainText('Buitenkeuken');
  await expect(tablet.page.locator('mh-light-tile').first()).not.toContainText('Buitenkeuken');
  await laptop.context.close();
  await tablet.context.close();
});

test('a device that is paired again shows what the others made meanwhile, and leaves it be', async ({ browser }) => {
  const laptop = await device(browser);
  const tablet = await device(browser);
  await pair(laptop.page, 'edit', 'Laptop');
  await pair(tablet.page, 'edit', 'Tablet');
  const make = async (page: Page, name: string) => {
    await page.locator('mh-rail').getByRole('button', { name: 'Bewerken' }).click();
    await page.locator('mh-rail').getByRole('button', { name: 'Nieuw', exact: true }).click();
    const dialog = page.locator('mh-name-icon-dialog.board');
    await dialog.getByRole('textbox', { name: 'Naam' }).fill(name);
    await dialog.getByRole('button', { name: 'Maken' }).click();
    await page.locator('mh-edit-bar').getByRole('button', { name: 'Klaar' }).click();
  };
  await make(laptop.page, 'Oud');
  await expect.poll(() => boards(tablet.page)).toEqual(['Overzicht', 'Oud']);
  await hand('remove', { name: 'Tablet' });
  await expect(tablet.page.getByText('Dit apparaat is losgekoppeld.')).toBeVisible();
  await make(laptop.page, 'Nieuw werk');
  await pair(tablet.page, 'edit', 'Tablet');
  await expect.poll(() => boards(tablet.page)).toEqual(['Overzicht', 'Oud', 'Nieuw werk']);
  await make(tablet.page, 'Van de tablet');
  await expect.poll(() => boards(laptop.page)).toEqual(['Overzicht', 'Oud', 'Nieuw werk', 'Van de tablet']);
  await laptop.context.close();
  await tablet.context.close();
});

test('a flow that was made after the app started is there for who opens the page', async ({ browser }) => {
  const d = await device(browser);
  await pair(d.page, 'edit', 'Laptop');
  // ordinary flows are only offered with a key
  await hand('flowkey');
  await hand('flow', { name: 'Nieuwe flow' });
  // what was read a moment ago is not read again at once
  await d.page.waitForTimeout(10_500);
  await d.page.reload();
  await expect(d.page.locator('mh-flow-tile').filter({ hasText: 'Nieuwe flow' })).toHaveCount(1);
  await d.context.close();
});

test('the settings in the Homey app take a key, and keep the focus where it is', async ({ page }) => {
  const texts = (JSON.parse(readFileSync('homey-app/locales/nl.json', 'utf8')) as { settings: Record<string, string> }).settings;
  await page.route('**/settings-page', (route) => route.fulfill({ contentType: 'text/html', body: readFileSync('homey-app/settings/index.html', 'utf8') }));
  await page.route('**/homey.js', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    const texts = ${JSON.stringify(texts)};
    window.asked = [];
    window.flowKey = 'none';
    window.answer = 'no-right';
    window.devices = [{ id: 'a1', name: '<b>Tablet</b>', role: 'use', lastSeen: '2026-11-23T10:00:00.000Z' }];
    addEventListener('load', () => {
      for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = texts[element.dataset.i18n.replace('settings.', '')];
      onHomeyReady({
        __: (key, tokens) => (texts[key.replace('settings.', '')] ?? key).replace('__name__', tokens?.name ?? ''),
        ready() {}, alert() {}, confirm: (text, icon, done) => { window.question = text; done(null, true); },
        api(method, path, body, done) {
          window.asked.push([method, path, body]);
          if (path === '/state') done(null, { running: true, connected: true, address: 'http://192.168.1.20:8790', devices: window.devices, flowKey: window.flowKey, buttons: [], codes: { scan: { open: null, used: null }, here: { open: null, used: null } } });
          else if (path === '/code') done(null, { code: '123456', role: 'edit', serial: 'x', expiresAt: Date.now() + 600000, address: null, link: null, qr: null });
          else if (path === '/flow-key' && method === 'POST') { if (window.answer === 'works') window.flowKey = 'works'; done(null, { result: window.answer }); }
          else if (path === '/flow-key') { window.flowKey = 'none'; done(null, true); }
          else { window.devices = []; done(null, true); }
        },
      });
    });` }));
  // Homey styles its buttons; what is hidden stays hidden
  await page.addInitScript(() => addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = '[class^="homey-button"] { display: block; }'; document.head.append(style); }));
  await page.goto('/settings-page');
  // a name is text, never markup
  await expect(page.locator('.device')).toContainText('<b>Tablet</b>');
  // the list is only drawn anew when something changed: the focus stays where it is
  await page.getByRole('button', { name: 'Ontkoppelen' }).focus();
  await page.waitForTimeout(3500);
  await expect(page.getByRole('button', { name: 'Ontkoppelen' })).toBeFocused();
  // nothing is made while nobody asks for it
  expect(await page.evaluate(() => (window as unknown as { asked: unknown[] }).asked.some((a) => (a as string[])[1] === '/code'))).toBe(false);
  await page.getByRole('button', { name: 'Ontkoppelen' }).click();
  await expect(page.locator('#code')).toHaveText('123 456');
  expect(await page.evaluate(() => (window as unknown as { asked: unknown[] }).asked.some((a) => (a as string[])[1] === '/devices/a1'))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { asked: unknown[] }).asked.find((a) => (a as string[])[1] === '/code'))).toEqual(['POST', '/code', { slot: 'scan' }]);

  // the key for flows: one that is refused is said and stays to be looked at, one that works is gone from the page
  await page.getByRole('radio', { name: /^Alleen flows starten/ }).check();
  const key = page.getByLabel('Plak hier de nieuwe sleutel');
  await expect(page.getByText('Nu: geen sleutel.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sleutel verwijderen' })).toBeHidden();
  await key.fill('een-sleutel-zonder-recht');
  // with the keyboard: a click on a button does not focus it in every browser
  await page.getByRole('button', { name: 'Bewaren' }).focus();
  await page.keyboard.press('Enter');
  const result = page.locator('#keyResult');
  await expect(result).toHaveText('Deze sleutel mag geen flows starten. Maak er een met het recht Flows starten.');
  await expect(key).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Bewaren' })).toBeFocused();
  await expect(key).toHaveValue('een-sleutel-zonder-recht');
  await page.evaluate(() => { (window as unknown as { answer: string }).answer = 'works'; });
  await key.fill('een-goede-sleutel');
  await key.press('Enter');
  await expect(page.getByText('Nu: een sleutel die alleen flows mag starten.', { exact: false })).toBeVisible();
  await expect(key).toHaveValue('');
  await expect(result).toHaveText('De sleutel is bewaard.');
  await expect(key).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByText('my.homey.app')).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { asked: unknown[] }).asked.filter((a) => (a as string[])[1] === '/flow-key'))).toEqual([['POST', '/flow-key', { key: 'een-sleutel-zonder-recht' }], ['POST', '/flow-key', { key: 'een-goede-sleutel' }]]);
  await page.getByRole('button', { name: 'Sleutel verwijderen' }).click();
  await expect(page.getByText('Nu: geen sleutel.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { question: string }).question)).toContain('verwijder hem daar ook');
  await expect(result).toHaveText('');
  // the focus goes to the choice that is now true
  await expect(page.getByRole('radio', { name: /^Geen sleutel/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Geen sleutel/ })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Sleutel verwijderen' })).toBeHidden();
});

test('flows start with a key that only the hub has, and the page follows what may be done', async ({ browser }) => {
  const d = await device(browser);
  await pair(d.page, 'use', 'Tablet');
  const why = d.page.getByText('De grijze flows kunnen hier niet starten.');
  const flow = d.page.locator('mh-flow-tile button').first();
  // without a key there is nothing that cannot be started
  await expect(flow).toHaveCount(0);
  await expect(why).toHaveCount(0);
  expect(await hand('flowkey', { key: 'geen sleutel' })).toEqual({ result: 'not-a-key' });
  expect(await hand('flowkey', { key: 'x'.repeat(40) })).toEqual({ result: 'refused' });
  await expect(flow).toHaveCount(0);

  expect(await hand('flowkey')).toEqual({ result: 'works' });
  await expect(flow).toBeEnabled();
  await expect(why).toHaveCount(0);
  await flow.click();
  await expect.poll(() => hand('started')).toEqual([expect.stringMatching(/^\/api\/manager\/flow\/(advanced)?flow\/[^/]+\/trigger$/)]);

  // after a restart of the app, without doing anything, it still works
  await hand('stop');
  await hand('start');
  await d.page.reload();
  await expect(d.page.getByText('Lokaal verbonden')).toBeVisible();
  await flow.click();
  await expect.poll(async () => (await hand<string[]>('started')).length).toBe(2);
  expect(await d.page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]))).not.toContain('aaaaaaaa-bbbb');

  // the owner takes the key away in Homey itself
  const before = [...d.problems];
  await hand('revoke');
  await flow.click();
  await expect(d.page.getByText(/kon niet starten/)).toBeVisible();
  await expect(d.page.getByText('De Homey accepteert de sleutel voor flows niet meer.')).toBeVisible();
  await expect(flow).toBeDisabled();
  // a browser writes that a request was refused in its own log; nothing else
  expect([before, d.problems.filter((problem) => !/502/.test(problem)), await d.violations()]).toEqual([[], [], []]);
  await d.context.close();
});

// ----- the wall tablet -----

/** Makes a paired device a wall tablet, as somebody does it. */
async function wallTablet(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Instellingen', exact: true }).click();
  await page.getByRole('button', { name: 'Instellen', exact: true }).click();
  await page.locator('mh-wall-panel').getByRole('switch', { name: 'Rustbeeld tonen' }).click();
  await expect(page.getByText('Een flow op je Homey kan de nacht eerder aan- of uitzetten.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Wandtablet' })).toBeHidden();
}
/** Nobody touches it for two minutes. */
const silence = (page: Page) => page.evaluate(() => (document.querySelector('mh-app') as unknown as { wall: { restNow(): void } }).wall.restNow());
const rest = (page: Page) => page.locator('mh-rest-screen');

test('a flow on the hub makes it night on the wall tablet and ends it; an alarm is told', async ({ browser }) => {
  test.setTimeout(150_000);
  const d = await device(browser);
  // the middle of the day, so only the flow can make it night
  await d.page.clock.setSystemTime(new Date('2026-11-23T13:00:00'));
  await d.page.reload();
  await pair(d.page, 'use', 'Tablet');
  await wallTablet(d.page);
  await hand('night', { on: true });
  await expect(d.page.locator('html')).toHaveAttribute('data-mode', 'dark');
  // a real silence: half a minute at night
  await expect(rest(d.page).locator('.screen.night')).toBeVisible({ timeout: 45_000 });
  // one that comes later knows it too
  await d.page.reload();
  await expect(d.page.getByText('Lokaal verbonden')).toBeVisible();
  await expect(d.page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await silence(d.page);
  const alarm = (value: boolean) => hand('report', { deviceId: 'device-22', capabilityId: 'alarm_generic', value });
  await alarm(true);
  await expect(rest(d.page).locator('.faint')).toHaveCount(1);
  await hand('night', { on: false });
  await expect(rest(d.page).locator('.screen.night')).toHaveCount(0);
  await expect(rest(d.page).locator('.number')).toBeVisible();
  await expect(rest(d.page).locator('.pill.alarm')).toHaveCount(1);
  await alarm(false);
  await expect(rest(d.page).locator('.pill')).toHaveCount(0);
  // it is not told to who is no wall tablet
  const laptop = await device(browser);
  await pair(laptop.page, 'edit', 'Laptop');
  await hand('night', { on: true });
  await expect(rest(d.page).locator('.screen.night')).toBeVisible();
  await expect(laptop.page.locator('html')).toHaveAttribute('data-mode', 'light');
  expect([d.problems, await d.violations(), laptop.problems]).toEqual([[], [], []]);
  await d.context.close();
  await laptop.context.close();
});

test('a wall tablet with another version of the app on the hub loads it when nobody is there, and rests again', async ({ browser }) => {
  const [tablet, other] = [await device(browser), await device(browser)];
  for (const { page } of [tablet, other]) {
    await page.clock.setSystemTime(new Date('2026-11-23T13:00:00'));
    await page.reload();
  }
  await pair(tablet.page, 'use', 'Tablet');
  await pair(other.page, 'use', 'Nog een');
  for (const { page } of [tablet, other]) {
    await wallTablet(page);
    await page.evaluate(() => { (window as unknown as { old: boolean }).old = true; });
  }
  await silence(tablet.page);
  await expect(rest(tablet.page)).toBeVisible();
  const old = (page: Page) => page.evaluate(() => (window as unknown as { old?: boolean }).old === true).catch(() => null);
  // the same version again: nothing happens
  await hand('stop');
  await expect(rest(tablet.page).getByText('Je Homey antwoordt niet')).toBeVisible();
  await hand('start');
  await expect(rest(tablet.page).getByText('Je Homey antwoordt niet')).toHaveCount(0, { timeout: 20_000 });
  expect(await old(tablet.page)).toBe(true);
  // another one
  await hand('stop');
  await hand('rebuild');
  await hand('start');
  await expect.poll(() => old(tablet.page), { timeout: 30_000 }).toBe(false);
  await expect(rest(tablet.page)).toBeVisible();
  await expect(rest(tablet.page).locator('.number')).toBeVisible();
  // the one in use goes on as it is
  await expect(other.page.getByText('Lokaal verbonden')).toBeVisible({ timeout: 20_000 });
  expect([await old(other.page), await rest(other.page).count()]).toEqual([true, 0]);
  await tablet.page.mouse.click(400, 400);
  await expect(rest(tablet.page)).toHaveCount(0);
  await expect(tablet.page.getByText('Lokaal verbonden')).toBeVisible();
  await tablet.context.close();
  await other.context.close();
});

test('themes: the laptop chooses for the house and the phone follows; flow cards and the rescue reach every device', async ({ browser }) => {
  const laptop = await device(browser);
  await pair(laptop.page, 'edit', 'Laptop');
  const phone = await device(browser);
  await pair(phone.page, 'use', 'Telefoon');
  const look = (page: Page) => page.evaluate(() => [document.documentElement.dataset['look'], document.documentElement.dataset['mode']].join(' '));

  await laptop.page.getByRole('button', { name: 'Thema', exact: true }).click();
  await expect(laptop.page.getByRole('radio', { name: 'Hele huis' })).toHaveAttribute('aria-checked', 'true');
  await laptop.page.getByRole('radio', { name: /^Glas,/ }).click();
  await laptop.page.getByRole('radio', { name: 'Donker' }).click();
  await expect.poll(() => look(laptop.page)).toBe('glas dark');
  await expect.poll(() => look(phone.page)).toBe('glas dark');

  // the phone may only use: it says so, and the hub refuses a change sent by hand
  await phone.page.getByRole('button', { name: 'Thema', exact: true }).click();
  await expect(phone.page.getByText(/^Dit apparaat volgt het huis\./)).toBeVisible();
  await expect(phone.page.getByRole('button', { name: 'Bijstellen' })).toHaveCount(0);
  const refused = await phone.page.evaluate(async () => (await fetch('/api/looks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops: [{ house: { theme: 'helder', seed: null, mode: 'light' } }] }) })).status);
  expect(refused).toBe(403);
  // the browser says so of that refusal, which was meant
  phone.problems.splice(0, phone.problems.length, ...phone.problems.filter((problem) => !problem.includes('403')));
  await phone.page.keyboard.press('Escape');

  // the cards of a flow
  await hand('theme', { id: 'helder' });
  await hand('mode', { mode: 'light' });
  await expect.poll(() => look(phone.page)).toBe('helder light');
  await expect.poll(() => look(laptop.page)).toBe('helder light');
  expect(await hand('theme', { id: 't-gone000000000000' })).toBe(false);

  // "Alle apparaten weer in Rustig"
  await hand('looks-reset');
  await expect.poll(() => look(phone.page)).toBe('rustig light');
  await expect.poll(() => look(laptop.page)).toBe('rustig light');

  for (const one of [laptop, phone]) {
    expect(one.problems).toEqual([]);
    expect(await one.violations()).toEqual([]);
    await one.context.close();
  }
});

test('a widget of another app, through the app with a key that may do everything, in its sandbox (a trial)', async ({ browser }) => {
  const d = await device(browser);
  await pair(d.page, 'edit', 'Laptop');
  await hand('widekey');
  await d.page.getByRole('button', { name: 'Bewerken', exact: true }).first().click();
  await d.page.getByRole('button', { name: 'Tegel toevoegen' }).first().click();
  const panel = d.page.locator('mh-add-panel');
  await panel.getByRole('radio', { name: 'Widgets' }).click();
  await panel.getByRole('button', { name: 'Weer vandaag toevoegen' }).click();
  // its setting with a search list: what is typed goes to the app on the hub, the choice stays with the tile
  const settings = d.page.locator('mh-widget-panel');
  await settings.getByLabel('Zoek Stad').fill('Utr');
  await settings.locator('[data-choice]').filter({ hasText: 'Utrecht' }).click();
  await expect(settings).toContainText('Gekozen: Utrecht');
  await settings.getByRole('button', { name: 'Sluiten' }).click();
  await d.page.getByRole('button', { name: 'Klaar' }).first().click();
  await expect(d.page.frameLocator('mh-app-widget iframe').locator('#out')).toHaveText('Vandaag in Utrecht 7 graden');
  await hand('unflowkey');
  expect(d.problems).toEqual([]);
  expect(await d.violations()).toEqual([]);
  await d.context.close();
});

test('the theme gallery is a link on the hub too, with its address to type over; nothing is fetched from it', async ({ browser }) => {
  const laptop = await device(browser);
  await pair(laptop.page, 'edit', 'Laptop');
  await laptop.page.getByRole('button', { name: 'Thema', exact: true }).click();
  await laptop.page.getByRole('button', { name: 'Thema van een ander' }).click();
  await expect(laptop.page.getByText('github.com/DIMENTS/expressive-home-themes')).toBeVisible();
  const open = laptop.page.getByRole('link', { name: /^Galerij openen/ });
  await expect(open).toHaveAttribute('href', 'https://github.com/DIMENTS/expressive-home-themes');
  await expect(open).toHaveAttribute('target', '_blank');
  const box = (await open.boundingBox())!;
  expect([box.width >= 48, box.height >= 48]).toEqual([true, true]);
  expect(laptop.problems).toEqual([]);
  expect(await laptop.violations()).toEqual([]);
  await laptop.context.close();
});

test('a theme taken in on one device is someone else\'s on every device: only a theme made here can be sent in to the gallery', async ({ browser }) => {
  const laptop = await device(browser);
  await pair(laptop.page, 'edit', 'Laptop');
  const tablet = await device(browser);
  await pair(tablet.page, 'edit', 'Tablet');
  // a theme made here, and its code, taken in as someone else's under another name on the other device
  await laptop.page.getByRole('button', { name: 'Thema', exact: true }).click();
  await laptop.page.getByRole('button', { name: 'Bijstellen' }).click();
  await laptop.page.getByRole('radio', { name: 'Hoekig' }).click();
  await laptop.page.getByRole('textbox', { name: 'Naam van het thema' }).fill('Zeewind');
  await laptop.page.getByRole('button', { name: 'Bewaren als mijn thema' }).click();
  await laptop.page.getByRole('button', { name: /^Zeewind/ }).click();
  await expect(laptop.page.getByRole('link', { name: /^Insturen bij de galerij/ })).toBeVisible();
  const code = (await laptop.page.locator('mh-theme-panel').evaluate((panel) => panel.shadowRoot!.querySelector('.code')!.textContent))!;
  await tablet.page.getByRole('button', { name: 'Thema', exact: true }).click();
  await tablet.page.getByRole('button', { name: 'Thema van een ander' }).click();
  await tablet.page.getByRole('textbox', { name: 'Plak een deelcode' }).fill(code);
  await tablet.page.getByRole('radio', { name: 'Erbij' }).click();
  await tablet.page.getByRole('button', { name: 'Bewaren en gebruiken' }).click();
  // the copy on the laptop, which never took it in itself, knows it is someone else's
  await laptop.page.getByRole('button', { name: 'Terug' }).click();
  await expect.poll(() => laptop.page.locator('mh-theme-panel').evaluate((panel) => panel.shadowRoot!.querySelectorAll('.theme-row').length)).toBe(2);
  const rows = laptop.page.locator('mh-theme-panel').getByRole('button', { name: /^Zeewind/ });
  await rows.nth(1).click();
  await expect(laptop.page.getByText('Deelcode')).toBeVisible();
  await expect(laptop.page.getByRole('link', { name: /^Insturen bij de galerij/ })).toHaveCount(0);
  for (const one of [laptop, tablet]) {
    expect(one.problems).toEqual([]);
    expect(await one.violations()).toEqual([]);
    await one.context.close();
  }
});
