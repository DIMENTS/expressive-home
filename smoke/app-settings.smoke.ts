import { expect, test, type Browser, type Page } from '@playwright/test';
import { CONTROL_PORT } from '../playwright.homey.config';
import { readQr } from '../tests/helpers/qr-reader';

// The settings of the app in the Homey app, over the app itself: a code to scan, the devices, the buttons and the key.

async function hand<T = unknown>(action: string, body: unknown = {}): Promise<T> {
  return (await (await fetch(`http://127.0.0.1:${CONTROL_PORT}/${action}`, { method: 'POST', body: JSON.stringify(body) })).json()) as T;
}

const BASE = 'http://localhost:5279';

async function settings(browser: Browser, { lang = 'nl', width = 390, height = 844 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, screen: { width, height }, locale: lang === 'nl' ? 'nl-NL' : 'en-GB' });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('favicon')) problems.push(message.text()); });
  page.on('pageerror', (error) => problems.push(error.message));
  await page.goto(`http://127.0.0.1:${CONTROL_PORT}/settings/?lang=${lang}`);
  return { page, context, problems };
}

/** What a camera would read: the squares as they are painted. */
async function scan(page: Page): Promise<string> {
  const rows = await page.locator('#qr').evaluate((svg: SVGSVGElement) => {
    const box = svg.viewBox.baseVal;
    const path = svg.querySelector('path') as SVGPathElement;
    const size = box.width - 8;
    const point = svg.createSVGPoint();
    return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (__, x) => { point.x = x + 0.5; point.y = y + 0.5; return path.isPointInFill(point) ? '1' : '0'; }).join(''));
  });
  return readQr(rows);
}

/** Pairs a device as its browser does. */
async function pairWith(link: string, name: string): Promise<number> {
  const code = /#pair=(\d{6})$/.exec(link)![1];
  return (await fetch(`${BASE}/api/pair`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ code, name }) })).status;
}

test.beforeEach(async () => {
  await hand('address', { known: true });
  await hand('refuse-settings', { on: false });
  await hand('slow-settings', { ms: 0 });
  await hand('reset');
  for (const { name } of await hand<{ name: string }[]>('devices')) await hand('remove', { name });
  await hand('stop');
  await hand('start');
});

test('the first time there is a code to scan at once; after that the devices', async ({ browser }) => {
  const s = await settings(browser);
  await expect(s.page.getByText('Zo zet je het op een apparaat:')).toBeVisible();
  const image = s.page.getByRole('img', { name: /^QR-code/ });
  await expect(image).toBeVisible();
  const link = await scan(s.page);
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:5279\/#pair=\d{6}$/);
  // the same in words
  await expect(s.page.locator('#address')).toHaveText('http://127.0.0.1:5279');
  expect((await s.page.locator('#code').textContent())!.replace(' ', '')).toBe(link.slice(-6));
  await expect(s.page.getByRole('radio', { name: 'Ook bewerken' })).toBeChecked();
  await expect(s.page.getByText('Gekoppelde apparaten')).toBeHidden();
  // black on white, with room around it
  expect(await image.evaluate((svg) => [getComputedStyle(svg).backgroundColor, svg.querySelector('path')!.getAttribute('fill'), (svg as SVGSVGElement).viewBox.baseVal.x])).toEqual(['rgb(255, 255, 255)', '#000', -4]);

  expect(await pairWith(link, 'Tablet <b>')).toBe(200);
  await expect(s.page.getByText('Tablet <b> is gekoppeld.')).toBeVisible();
  await expect(image).toBeHidden();
  await expect(s.page.getByText('Gekoppelde apparaten')).toBeVisible();
  await expect(s.page.getByLabel('Wat mag Tablet <b>?')).toHaveValue('edit');
  expect(await s.page.locator('#code').textContent()).toBe('');

  // one more
  await s.page.getByRole('button', { name: 'Apparaat toevoegen' }).click();
  await expect(image).toBeVisible();
  await expect(s.page.getByRole('radio', { name: 'Alleen gebruiken' })).toBeChecked();
  expect(await pairWith(await scan(s.page), 'Telefoon')).toBe(200);
  await expect(s.page.getByText('Telefoon is gekoppeld.')).toBeVisible();
  expect(await hand('devices')).toMatchObject([{ name: 'Tablet <b>', role: 'edit' }, { name: 'Telefoon', role: 'use' }]);
  expect(s.problems).toEqual([]);
  await s.context.close();
});

test('another right counts for the code that is on the screen; a new code ends it', async ({ browser }) => {
  const s = await settings(browser);
  await expect(s.page.locator('#qr')).toBeVisible();
  const first = await scan(s.page);
  await s.page.getByRole('radio', { name: 'Alleen gebruiken' }).check();
  await expect.poll(async () => (await hand<{ role: string }>('getcode')).role).toBe('use');
  expect(await scan(s.page)).toBe(first);
  await s.page.getByRole('button', { name: 'Nieuwe code' }).click();
  await expect.poll(() => scan(s.page)).not.toBe(first);
  expect(await pairWith(first, 'x')).toBe(403);
  expect(await pairWith(await scan(s.page), 'Tablet')).toBe(200);
  expect(await hand('devices')).toMatchObject([{ role: 'use' }]);
  await s.context.close();
});

test('the settings on two phones, and opened again, show one and the same code', async ({ browser }) => {
  const a = await settings(browser);
  const b = await settings(browser);
  await expect(a.page.locator('#qr')).toBeVisible();
  await expect(b.page.locator('#qr')).toBeVisible();
  const first = await scan(a.page);
  expect(await scan(b.page)).toBe(first);
  await b.page.reload();
  await expect(b.page.locator('#qr')).toBeVisible();
  expect(await scan(b.page)).toBe(first);
  // a new one on one of them comes on the other by itself, and so does another right
  await a.page.getByRole('button', { name: 'Nieuwe code' }).click();
  await expect.poll(() => scan(a.page)).not.toBe(first);
  const second = await scan(a.page);
  await expect.poll(() => scan(b.page), { timeout: 10_000 }).toBe(second);
  await a.page.getByRole('radio', { name: 'Alleen gebruiken' }).check();
  await expect(b.page.getByRole('radio', { name: 'Alleen gebruiken' })).toBeChecked({ timeout: 10_000 });
  expect(await pairWith(second, 'Tablet')).toBe(200);
  for (const each of [a, b]) {
    await expect(each.page.getByText('Tablet is gekoppeld.')).toBeVisible({ timeout: 10_000 });
    expect(each.problems).toEqual([]);
    await each.context.close();
  }
});

test('a code that is gone says so; the app that starts again as well', async ({ browser }) => {
  const s = await settings(browser);
  await expect(s.page.locator('#qr')).toBeVisible();
  await hand('stop');
  await hand('start');
  await expect(s.page.getByText('Deze code is verlopen. Maak een nieuwe.')).toBeVisible({ timeout: 10_000 });
  await expect(s.page.locator('#qr')).toBeHidden();
  await s.page.getByRole('button', { name: 'Nieuwe code' }).click();
  await expect(s.page.locator('#qr')).toBeVisible();
  await expect(s.page.getByText('Deze code is verlopen. Maak een nieuwe.')).toBeHidden();
  await s.context.close();
});

test('the dashboard where the settings are open', async ({ browser }) => {
  const s = await settings(browser);
  await expect(s.page.locator('#qr')).toBeVisible();
  const scanned = await scan(s.page);
  await s.page.getByRole('button', { name: 'Open het dashboard hier' }).click();
  await expect.poll(() => s.page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toHaveLength(1);
  const [link] = await s.page.evaluate(() => (window as unknown as { opened: string[] }).opened);
  expect([link === scanned, /^http:\/\/127\.0\.0\.1:5279\/#pair=\d{6}$/.test(link!)]).toEqual([false, true]);
  await expect(s.page.getByRole('link', { name: 'Opent er niets? Tik dan hier.' })).toHaveAttribute('href', link!);
  expect(await pairWith(link!, 'Telefoon')).toBe(200);
  await expect(s.page.getByText('Telefoon is gekoppeld.')).toBeVisible({ timeout: 10_000 });
  await expect(s.page.getByRole('link', { name: 'Opent er niets? Tik dan hier.' })).toBeHidden();
  // a phone only uses it; the code to scan is still good, and for one that may arrange it
  expect(await hand('devices')).toMatchObject([{ name: 'Telefoon', role: 'use' }]);
  expect(await pairWith(scanned, 'Tablet')).toBe(200);
  expect(await hand('devices')).toMatchObject([{ role: 'use' }, { name: 'Tablet', role: 'edit' }]);
  await s.context.close();
  // on a laptop, while nobody may arrange it yet
  for (const { name } of await hand<{ name: string }[]>('devices')) await hand('remove', { name });
  const laptop = await settings(browser, { width: 1280, height: 900 });
  await laptop.page.getByRole('button', { name: 'Open het dashboard hier' }).click();
  await expect.poll(() => laptop.page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toHaveLength(1);
  const [own] = await laptop.page.evaluate(() => (window as unknown as { opened: string[] }).opened);
  await pairWith(own!, 'Laptop');
  expect(await hand('devices')).toMatchObject([{ name: 'Laptop', role: 'edit' }]);
  await laptop.context.close();
});

test('a hub that does not know its address has a code to type, and says where the address is', async ({ browser }) => {
  await hand('address', { known: false });
  await hand('stop');
  await hand('start');
  const s = await settings(browser);
  await expect(s.page.locator('#code')).toHaveText(/^\d{3} \d{3}$/);
  await expect(s.page.locator('#qr')).toBeHidden();
  await expect(s.page.getByText('Het adres van deze Homey is nu niet bekend.')).toBeVisible();
  await expect(s.page.getByText('Open het adres op dat apparaat en typ de code over.')).toBeVisible();
  await expect(s.page.getByText('Open dit adres in de browser')).toBeHidden();
  await s.page.getByRole('button', { name: 'Open het dashboard hier' }).click();
  await expect.poll(() => s.page.evaluate(() => (window as unknown as { asked: string[]; opened: string[] }).asked.length)).toBe(1);
  expect(await s.page.evaluate(() => (window as unknown as { opened: string[] }).opened)).toEqual([]);
  await s.context.close();
});

test('the right of a device, and taking it away', async ({ browser }) => {
  const { link } = await hand<{ link: string }>('getcode', { role: 'use' });
  await pairWith(link, 'Tablet');
  const s = await settings(browser, { width: 360 });
  const right = s.page.getByLabel('Wat mag Tablet?');
  await expect(right).toHaveValue('use');
  await right.selectOption('edit');
  await expect.poll(() => hand('devices')).toMatchObject([{ role: 'edit' }]);
  await expect(right).toHaveValue('edit');
  // what does not work goes back
  await hand('refuse-settings', { on: true });
  await right.selectOption('use');
  await expect(right).toHaveValue('edit');
  await hand('refuse-settings', { on: false });
  await s.page.getByRole('button', { name: 'Tablet ontkoppelen' }).click();
  await expect(s.page.getByText('Zo zet je het op een apparaat:')).toBeVisible();
  expect(await s.page.evaluate(() => (window as unknown as { asked: string[] }).asked.some((text) => text.startsWith('Tablet ontkoppelen?')))).toBe(true);
  // and the next one can be paired at once
  await expect(s.page.locator('#qr')).toBeVisible();
  await s.context.close();
});

test('the buttons of the flows are named, and the key for flows is one of three choices', async ({ browser }) => {
  await hand('buttons', { names: ['Welterusten', 'Film <i>kijken</i>'] });
  const s = await settings(browser);
  await expect(s.page.getByText('Knoppen nu: Film <i>kijken</i>, Welterusten')).toBeVisible();
  // without a key nothing has to be typed; a choice shows its own steps
  await expect(s.page.getByRole('radio', { name: /^Geen sleutel/ })).toBeChecked();
  await expect(s.page.getByLabel('Plak hier de nieuwe sleutel')).toBeHidden();
  await s.page.getByRole('radio', { name: /^Volledige toegang/ }).check();
  await expect(s.page.getByText('Maak een nieuwe sleutel en vink alle rechten aan.')).toBeVisible();
  await s.page.getByRole('radio', { name: /^Alleen flows starten/ }).check();
  await expect(s.page.getByText('Maak een nieuwe sleutel en vink alleen Flows starten aan.')).toBeVisible();
  await s.page.getByLabel('Plak hier de nieuwe sleutel').fill('geen sleutel');
  await s.page.getByRole('button', { name: 'Bewaren' }).click();
  await expect(s.page.getByText('Dit is geen sleutel.')).toBeVisible();
  await hand('flowkey');
  await expect(s.page.getByText('Nu: een sleutel die alleen flows mag starten. Al je flows werken op het dashboard.')).toBeVisible({ timeout: 10_000 });
  await expect(s.page.getByRole('radio', { name: /^Alleen flows starten/ })).toBeChecked();
  await hand('buttons', { names: [] });
  await expect(s.page.locator('#buttons')).toBeHidden({ timeout: 10_000 });
  await s.context.close();
});

for (const [lang, width] of [['nl', 320], ['en', 320], ['nl', 900], ['en', 390]] as const) {
  test(`every text is there and nothing sticks out, ${lang} at ${width}`, async ({ browser }) => {
    const { link } = await hand<{ link: string }>('getcode', { role: 'use' });
    const s = await settings(browser, { lang, width });
    await expect(s.page.locator('#qr')).toBeVisible();
    await pairWith(link, 'Een apparaat met een heel lange naam die ergens afgebroken moet worden');
    await hand('buttons', { names: ['Een-knop-met-een-heel-lange-naam-zonder-spaties-die-niet-past', 'Film'] });
    await expect(s.page.locator('.device')).toHaveCount(1, { timeout: 10_000 });
    await s.page.locator('#add').click();
    await expect(s.page.locator('#qr')).toBeVisible();
    expect(await s.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const text = await s.page.evaluate(() => document.body.innerText);
    expect([text.includes('settings.'), /__\w+__/.test(text), text.includes('undefined')]).toEqual([false, false, false]);
    // what can be pressed has a name, and is large enough for a finger
    for (const element of await s.page.locator('button:visible, select:visible, label:visible, summary:visible').all()) {
      expect((await element.evaluate((e) => e.getAttribute('aria-label') ?? e.textContent ?? '')).trim()).not.toBe('');
    }
    expect(s.problems).toEqual([]);
    await s.context.close();
  });
}

test('the whole way: scan in the settings, one tap on the tablet, a button that starts a flow', async ({ browser }) => {
  const s = await settings(browser);
  await expect(s.page.locator('#qr')).toBeVisible();
  const link = (await scan(s.page)).replace('127.0.0.1', 'localhost');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'nl-NL' });
  const tablet = await context.newPage();
  await tablet.goto(link);
  await tablet.getByRole('button', { name: 'Koppelen' }).click();
  await expect(tablet.getByText('Lokaal verbonden')).toBeVisible();
  await expect(s.page.getByText('Laptop is gekoppeld.')).toBeVisible({ timeout: 10_000 });
  // without a key only what works is there
  await expect(tablet.locator('mh-flow-tile')).toHaveCount(0);
  await hand('buttons', { names: ['Film kijken'] });
  const button = tablet.locator('mh-flow-tile').getByRole('button', { name: 'Film kijken' });
  await expect(button).toBeVisible({ timeout: 10_000 });
  await button.click();
  await expect.poll(() => hand('pressed')).toEqual([{ device: 'Laptop', started: ['Film kijken'] }]);
  // a key comes: the other flows are there too, after the button
  await hand('flowkey');
  await expect.poll(() => tablet.locator('mh-flow-tile').count(), { timeout: 10_000 }).toBeGreaterThan(1);
  await expect(tablet.locator('mh-flow-tile').first()).toContainText('Film kijken');
  // and goes
  await hand('unflowkey');
  await expect.poll(() => tablet.locator('mh-flow-tile').count(), { timeout: 10_000 }).toBe(1);
  await context.close();
  await s.context.close();
});

test('the right on the screen is the right of the code, also when the app refuses or is slow', async ({ browser }) => {
  const s = await settings(browser);
  await expect(s.page.locator('#qr')).toBeVisible();
  await hand('refuse-settings', { on: true });
  await s.page.getByRole('radio', { name: 'Alleen gebruiken' }).check({ force: true }).catch(() => {});
  await expect.poll(() => s.page.evaluate(() => (window as unknown as { asked: string[] }).asked.length)).toBeGreaterThan(0);
  await expect(s.page.getByRole('radio', { name: 'Ook bewerken' })).toBeChecked();
  await hand('refuse-settings', { on: false });
  // a choice while another one is on its way is not lost
  await hand('slow-settings', { ms: 600 });
  await s.page.getByRole('radio', { name: 'Alleen gebruiken' }).click();
  await s.page.getByRole('radio', { name: 'Ook bewerken' }).click();
  await s.page.getByRole('radio', { name: 'Alleen gebruiken' }).click();
  await hand('slow-settings', { ms: 0 });
  await expect.poll(async () => (await hand<{ role: string }>('getcode')).role).toBe('use');
  await expect(s.page.getByRole('radio', { name: 'Alleen gebruiken' })).toBeChecked();
  expect(s.problems).toEqual([]);
  await s.context.close();
});

test('a device that pairs at the very moment another right is chosen is told all the same', async ({ browser }) => {
  const s = await settings(browser);
  await expect(s.page.locator('#qr')).toBeVisible();
  const link = await scan(s.page);
  await pairWith(link, 'Tablet');
  await s.page.getByRole('radio', { name: 'Alleen gebruiken' }).click();
  await expect(s.page.getByText('Tablet is gekoppeld.')).toBeVisible({ timeout: 10_000 });
  await s.context.close();
});

test('a device that was paired before the settings opened is not told as new', async ({ browser }) => {
  const { link } = await hand<{ link: string }>('getcode');
  await pairWith(link, 'Tablet');
  const s = await settings(browser);
  await expect(s.page.locator('.device')).toHaveCount(1);
  await s.page.waitForTimeout(3500);
  await expect(s.page.getByText('Tablet is gekoppeld.')).toHaveCount(0);
  await s.context.close();
});

test('the focus stays where somebody is, and goes on when that is gone', async ({ browser }) => {
  for (const name of ['Tablet', 'Telefoon']) {
    const { link } = await hand<{ link: string }>('getcode', { fresh: true });
    await pairWith(link, name);
  }
  const s = await settings(browser);
  const focused = () => s.page.evaluate(() => [document.activeElement?.id, document.activeElement?.getAttribute('aria-label')].filter(Boolean).join(' '));
  await s.page.getByLabel('Wat mag Tablet?').focus();
  await hand('role', { name: 'Tablet', role: 'use' });
  await expect(s.page.getByLabel('Wat mag Tablet?')).toHaveValue('use', { timeout: 10_000 });
  expect(await focused()).toBe('Wat mag Tablet?');
  // with the keyboard: every choice in the list
  await s.page.getByLabel('Wat mag Telefoon?').selectOption('edit');
  await s.page.getByLabel('Wat mag Telefoon?').focus();
  await expect.poll(async () => (await hand<{ name: string; role: string }[]>('devices')).find((d) => d.name === 'Telefoon')?.role).toBe('edit');
  await s.page.waitForTimeout(3500);
  expect(await focused()).toBe('Wat mag Telefoon?');
  // the row is gone
  await s.page.getByRole('button', { name: 'Telefoon ontkoppelen' }).focus();
  await s.page.keyboard.press('Enter');
  await expect(s.page.locator('.device')).toHaveCount(1);
  await expect.poll(focused).toBe('add');
  // the code is gone
  await s.page.keyboard.press('Enter');
  await expect(s.page.locator('#qr')).toBeVisible();
  await s.page.getByRole('radio', { name: 'Alleen gebruiken' }).focus();
  await pairWith(await scan(s.page), 'Nieuw');
  await expect(s.page.getByText('Nieuw is gekoppeld.')).toBeVisible({ timeout: 10_000 });
  await expect.poll(focused).toBe('add');
  // what is read out is there before there is something to read
  for (const id of ['paired', 'expired', 'keyResult']) expect(await s.page.locator(`#${id}`).evaluate((e) => getComputedStyle(e).display)).not.toBe('none');
  await s.context.close();
});

test('two devices that open the dashboard themselves do not take each other\'s code', async ({ browser }) => {
  const phone = await settings(browser);
  const laptop = await settings(browser, { width: 1280, height: 900 });
  const opened = (page: Page) => page.evaluate(() => (window as unknown as { opened: string[] }).opened);
  await phone.page.getByRole('button', { name: 'Open het dashboard hier' }).dblclick();
  await expect.poll(() => opened(phone.page)).toHaveLength(1);
  await laptop.page.getByRole('button', { name: 'Open het dashboard hier' }).click();
  await expect.poll(() => opened(laptop.page)).toHaveLength(1);
  // the link of the phone is still there and still good
  await phone.page.waitForTimeout(3500);
  await expect(phone.page.getByRole('link', { name: 'Opent er niets? Tik dan hier.' })).toBeVisible();
  expect(await pairWith((await opened(phone.page))[0]!, 'Telefoon')).toBe(200);
  expect(await pairWith((await opened(laptop.page))[0]!, 'Laptop')).toBe(200);
  expect(await hand('devices')).toMatchObject([{ name: 'Telefoon', role: 'use' }, { name: 'Laptop', role: 'edit' }]);
  for (const each of [phone, laptop]) await each.context.close();
});

test('without the last device there is a code to scan at once, also when there were none to begin with', async ({ browser }) => {
  const s = await settings(browser);
  await expect(s.page.locator('#qr')).toBeVisible();
  await pairWith(await scan(s.page), 'Tablet');
  await expect(s.page.getByText('Tablet is gekoppeld.')).toBeVisible({ timeout: 10_000 });
  await s.page.getByRole('button', { name: 'Tablet ontkoppelen' }).click();
  await expect(s.page.locator('#qr')).toBeVisible({ timeout: 10_000 });
  await expect(s.page.getByText('Tablet is gekoppeld.')).toHaveCount(0);
  await s.context.close();
});

test('recording what Homey does not keep is on, can be switched off, and wiped after a question', async ({ browser }) => {
  const s = await settings(browser);
  const record = s.page.getByLabel('Zelf opnemen wat Homey niet bijhoudt');
  await expect(record).toBeChecked();
  await record.uncheck();
  await expect(record).not.toBeChecked();
  await record.check();
  await s.page.getByRole('button', { name: 'Opname wissen' }).click();
  await expect(s.page.getByText('De opname is gewist.')).toBeVisible();
  expect(s.problems).toEqual([]);
  await s.context.close();
});

/** A question to the door of the app, as the cloud brings it from a page with a key elsewhere. */
async function door<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const answer = await (await fetch(`http://127.0.0.1:${CONTROL_PORT}/settings-api`, { method: 'POST', body: JSON.stringify({ method: 'POST', path: '/sync', body }) })).json() as { result: T };
  return answer.result;
}

test('a phone for away from home: a code of eight digits made on purpose, pairing through the door, and marked as through the cloud', async ({ browser }) => {
  const s = await settings(browser, { width: 360 });
  await s.page.getByRole('button', { name: 'Een telefoon voor onderweg koppelen' }).click();
  const shown = s.page.locator('#awayCode');
  await expect(shown).toHaveText(/^\d{4} \d{4}$/);
  const code = (await shown.textContent())!.replace(' ', '');
  // a wrong code first: nothing is paired, and the code still works
  expect(await door({ call: 'pair', code: '00000000', name: 'Raden' })).toEqual({ error: 'code' });
  const paired = await door<{ token: string; device: { role: string } }>({ call: 'pair', code, name: 'Telefoon onderweg' });
  expect(paired.device.role).toBe('use');
  await expect(s.page.getByText('Telefoon onderweg is gekoppeld, via de cloud.')).toBeVisible();
  await expect(s.page.getByText(/^Via de cloud · Laatst gezien/)).toBeVisible();
  expect(await door({ call: 'session', token: paired.token })).toMatchObject({ device: { name: 'Telefoon onderweg', role: 'use' }, format: 1 });
  expect(await door({ call: 'layouts', token: paired.token })).toMatchObject({ revision: expect.any(Number) });
  // controlling never goes through the door
  expect(await door({ call: 'control', token: paired.token })).toEqual({ error: 'bad' });
  // taken away in the settings: the door knows it no more
  await s.page.getByRole('button', { name: 'Telefoon onderweg ontkoppelen' }).click();
  await expect.poll(() => door({ call: 'session', token: paired.token })).toEqual({ error: 'not-paired' });
  expect(s.problems).toEqual([]);
  await s.context.close();
});
