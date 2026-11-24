import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';

/** Collects what must never happen: a blocked resource, an error in the console, a request to anyone else. */
function watch(page: Page): { problems: string[] } {
  const problems: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => problems.push(`error: ${error.message}`));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== 'localhost' && url.protocol !== 'data:') problems.push(`request to ${url.origin}`);
  });
  return { problems };
}

/** Opens the app and, from the connect screen, the example hub; listens for policy violations before anything loads. */
async function openExample(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { violations: string[] }).violations = seen;
    document.addEventListener('securitypolicyviolation', (event) => seen.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Verbind je Homey' })).toBeVisible();
  await page.getByRole('button', { name: 'Of in een camper' }).click();
  await expect(page.getByText('Voorbeeld', { exact: true })).toBeVisible();
}

async function expectClean(page: Page, problems: string[]): Promise<void> {
  expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
  expect(problems).toEqual([]);
}

/** Drags with the mouse from the middle of one thing to a point in another. */
async function drag(page: Page, from: Locator, to: Locator, at: { x: number; y: number }): Promise<void> {
  await from.scrollIntoViewIfNeeded();
  const start = (await from.boundingBox())!;
  await page.mouse.move(start.x + start.width / 3, start.y + start.height / 3);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 3 + 20, start.y + start.height / 3 + 10, { steps: 4 });
  // the sections make room while something is dragged over them, so look twice, as a person does
  for (let i = 0; i < 2; i += 1) {
    const end = (await to.boundingBox())!;
    await page.mouse.move(end.x + end.width * at.x, end.y + end.height * at.y, { steps: 12 });
  }
  await page.mouse.up();
}

const GREETINGS_EN = ['Good morning', 'Good afternoon', 'Good evening', 'Good night'];

test('the example hub from start to finish', async ({ page }) => {
  const { problems } = watch(page);
  await openExample(page);

  // a lamp: tap it, then drag its brightness
  const lamp = page.getByRole('button', { name: /^Badkamer/ }).first();
  const pressed = await lamp.getAttribute('aria-pressed');
  await lamp.click();
  await expect(lamp).toHaveAttribute('aria-pressed', pressed === 'true' ? 'false' : 'true');
  if (pressed === 'true') await lamp.click();
  const slider = page.getByRole('slider', { name: 'Helderheid Badkamer' });
  const before = await slider.getAttribute('aria-valuenow');
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(slider).not.toHaveAttribute('aria-valuenow', before ?? '');

  // the device window opens with "Meer" and closes with Escape
  await page.getByRole('button', { name: 'Meer over Badkamer' }).click();
  const sheet = page.getByRole('dialog', { name: 'Badkamer' });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // the theme: blue, dark, compact
  await page.getByRole('button', { name: 'Thema' }).click();
  await page.getByRole('radio', { name: 'Blauw' }).click();
  await page.getByRole('radio', { name: 'Donker' }).click();
  await page.getByRole('radio', { name: 'Compact' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.keyboard.press('Escape');

  // the menu of the water section: its own colour
  await page.getByRole('button', { name: 'Menu van Water' }).click();
  await page.getByRole('menuitemradio', { name: 'Terracotta' }).click();
  await expect(page.locator('mh-section[data-own-seed]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // the menu of the hero: its own colour too
  await page.getByRole('button', { name: 'Menu van Accu' }).click();
  await page.getByRole('menuitemradio', { name: 'Paars' }).click();
  await expect(page.locator('mh-hero[data-own-seed]')).toHaveCount(1);
  await page.keyboard.press('Escape');

  // Settings: English, and back to automatic
  await page.getByRole('button', { name: 'Instellingen' }).click();
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(GREETINGS_EN).toContain((await page.getByRole('heading', { level: 1 }).textContent())?.trim());
  await page.getByRole('radio', { name: 'Automatic' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Goede/);
  await page.keyboard.press('Escape');

  await expectClean(page, problems);
});

/** A section by its title, and the names on its tiles in order. */
const section = (page: Page, title: string) => page.locator('mh-section').filter({ has: page.locator('h2 .title', { hasText: new RegExp(`^${title}$`) }) });
const tileNames = (page: Page, title: string) => section(page, title).locator('.tiles > * .name').allTextContents();

test('the edit mode with the example hub', async ({ page }) => {
  const { problems } = watch(page);
  await openExample(page);
  const edit = page.getByRole('button', { name: 'Bewerken', exact: true });
  const undo = page.getByRole('toolbar', { name: 'Bewerken' }).getByRole('button', { name: 'Ongedaan maken' });

  // on: the note of the first time, and nothing to undo
  await edit.click();
  await expect(edit).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Je eerste aanpassing maakt van dit Overzicht')).toBeVisible();
  await expect(undo).toBeDisabled();

  // a tile to another section through its menu
  await page.getByRole('button', { name: 'Grijs water, menu openen' }).click();
  await page.getByRole('menuitem', { name: 'Verplaatsen naar…' }).click();
  await page.getByRole('menuitemradio', { name: 'Klimaat' }).click();
  await expect.poll(() => tileNames(page, 'Klimaat')).toContain('Grijs water');
  await expect(page.getByText('Je eerste aanpassing maakt van dit Overzicht')).toBeHidden();
  await expect(undo).toBeEnabled();

  // a tile dragged to another place, and a section by its grip
  const before = await tileNames(page, 'Water');
  await drag(page, section(page, 'Klimaat').locator('mh-tank-tile'), section(page, 'Water'), { x: 0.9, y: 0.5 });
  await expect.poll(() => tileNames(page, 'Water')).toEqual([...before, 'Grijs water']);
  await drag(page, page.getByRole('button', { name: 'Verplaats Water' }), page.locator('mh-section').first(), { x: 0.4, y: 0.1 });
  await expect(page.locator('.col[data-column="left"] mh-section').first().locator('h2 .title')).toHaveText('Water');

  // one value of a device as its own tile: the download of the Starlink
  await section(page, 'Klimaat').getByRole('button', { name: 'Tegel toevoegen' }).click();
  // what a panel holds is slotted into it, so it is looked up in the panel's own element
  const add = page.locator('mh-add-panel');
  await expect(page.getByRole('dialog', { name: 'Toevoegen aan Klimaat' })).toBeVisible();
  await add.getByRole('searchbox', { name: 'Zoek een apparaat' }).fill('starlink');
  await add.getByRole('button', { name: /^Starlink/ }).first().click();
  await add.getByRole('button', { name: 'Download toevoegen' }).click();
  await expect(page.getByText('Starlink · Download staat nu in Klimaat.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Toevoegen aan Klimaat' })).toBeHidden();
  await expect.poll(() => tileNames(page, 'Klimaat')).toContain('Starlink');

  // an RGBW lamp whose slider takes the white level, with a name and an icon of its own
  await page.getByRole('button', { name: 'Badkamer, menu openen' }).click();
  await page.getByRole('menuitem', { name: 'Tegel instellen…' }).click();
  const tile = page.locator('mh-tile-panel');
  await expect(page.getByRole('dialog', { name: 'Badkamer' })).toBeVisible();
  await tile.getByRole('radio', { name: /^Dim niveau wit/ }).click();
  await tile.getByRole('textbox', { name: 'Naam op de tegel' }).fill('Bad boven');
  await expect(page.getByRole('dialog', { name: 'Bad boven' })).toBeVisible();
  await tile.getByRole('button', { name: 'Wijzigen' }).click();
  await expect(page.getByRole('dialog', { name: 'Icoon kiezen' })).toBeVisible();
  await tile.getByRole('searchbox').fill('badkamer');
  await tile.getByRole('radio', { name: /badkamer bad/ }).click();
  await tile.getByRole('button', { name: 'Terug' }).click();
  await expect(tile.getByText('Eigen icoon')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Bad boven, menu openen' })).toBeVisible();

  // the hero: chosen by hand, the clean water with its wave
  await page.getByRole('button', { name: 'Accu, blikvanger instellen' }).click();
  const hero = page.locator('mh-hero-panel');
  await hero.getByRole('radio', { name: 'Zelf kiezen' }).click();
  await hero.getByRole('button', { name: 'Wijzigen' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Kies een waarde' })).toBeVisible();
  await hero.getByRole('button', { name: /^Schoon water/ }).click();
  await hero.locator('[data-value="tank_level"]').getByRole('button', { name: 'Kiezen' }).click();
  await expect(hero.getByText('met de golvende lijn')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('mh-hero h2 .title')).toHaveText('Schoon water');

  // undo goes back a step, and what was undone can be done again
  await undo.click();
  await expect(page.locator('mh-hero h2 .title')).toHaveText('Accu');

  // outside the edit mode the slider of the lamp sets the white level
  await page.getByRole('button', { name: 'Klaar' }).click();
  await expect(page.getByRole('toolbar', { name: 'Bewerken' })).toBeHidden();
  const slider = page.getByRole('slider', { name: 'Helderheid Bad boven' });
  await slider.scrollIntoViewIfNeeded();
  const level = await slider.getAttribute('aria-valuenow');
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(slider).not.toHaveAttribute('aria-valuenow', level ?? '');

  // the layout as a file: no key in it
  await page.getByRole('button', { name: 'Instellingen' }).click();
  const settings = page.locator('mh-settings-panel');
  const question = page.locator('mh-dialog.confirm');
  const download = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Bewaren' }).click();
  const file = await (await download).path();
  expect((await download).suggestedFilename()).toMatch(/^expressive-home-layout-\d{4}-\d{2}-\d{2}\.json$/);
  const content = await readFile(file, 'utf8');
  expect(content).not.toContain('apiKey');
  expect(JSON.parse(content)).toMatchObject({ format: 'expressive-home-layout', version: 1 });

  // back to automatic, after a question
  await settings.getByRole('button', { name: 'Terugzetten' }).click();
  await question.getByRole('button', { name: 'Terugzetten' }).click();
  await expect.poll(() => tileNames(page, 'Klimaat')).not.toContain('Starlink');
  await expect(settings.getByText('Het Overzicht is nu automatisch')).toBeVisible();

  // and the file brings everything back
  const chooser = page.waitForEvent('filechooser');
  await settings.getByRole('button', { name: 'Inladen' }).click();
  await (await chooser).setFiles({ name: 'mijn-indeling.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await expect(page.getByText('vervangen door die uit mijn-indeling.json')).toBeVisible();
  await question.getByRole('button', { name: 'Inladen' }).click();
  await expect.poll(() => tileNames(page, 'Klimaat')).toContain('Starlink');
  await expect(page.getByText('Bad boven')).toBeVisible();
  await expect(page.locator('.col[data-column="left"] mh-section').first().locator('h2 .title')).toHaveText('Water');

  await expectClean(page, problems);
});

test('more dashboards with the example hub', async ({ page }) => {
  const { problems } = watch(page);
  await openExample(page);
  const rail = page.getByRole('navigation', { name: 'Navigatie' });
  // without the rooms, which stand after them
  const boards = () => rail.locator('.boards button').allTextContents().then((names) => names.map((name) => name.trim()).filter((name) => name !== 'Kamers'));
  const bar = page.getByRole('toolbar', { name: 'Bewerken' });
  const menu = async (item: string) => {
    await bar.getByRole('button', { name: /^Menu van / }).click();
    await bar.getByRole('menuitem', { name: item }).click();
  };
  const add = page.locator('mh-add-panel');
  const question = page.locator('mh-dialog.confirm');
  const name = page.locator('mh-name-icon-dialog.board');

  // a new dashboard: a name and an icon, then empty and in the edit mode
  await expect(rail.getByRole('button', { name: 'Nieuw' })).toBeHidden();
  await rail.getByRole('button', { name: 'Bewerken' }).click();
  await rail.getByRole('button', { name: 'Nieuw' }).click();
  await expect(page.getByRole('dialog', { name: 'Nieuw dashboard' })).toBeVisible();
  await name.getByRole('textbox', { name: 'Naam' }).fill('Buiten');
  await name.getByRole('searchbox').fill('terras');
  await name.getByRole('radio', { name: /terras/ }).first().click();
  await name.getByRole('button', { name: 'Maken' }).click();
  await expect(page.getByRole('heading', { name: 'Buiten is nog leeg' })).toBeVisible();
  await expect(bar.getByText('Buiten bewerken')).toBeVisible();
  expect(await boards()).toEqual(['Overzicht', 'Buiten']);

  // a section with two tiles
  await page.getByRole('button', { name: 'Sectie toevoegen' }).click();
  await page.locator('mh-name-icon-dialog:not(.board)').getByRole('textbox', { name: 'Naam' }).fill('Terras');
  await page.locator('mh-name-icon-dialog:not(.board)').getByRole('button', { name: 'Toevoegen' }).click();
  await section(page, 'Terras').getByRole('button', { name: 'Tegel toevoegen' }).click();
  await expect(page.getByRole('dialog', { name: 'Toevoegen aan Terras' })).toBeVisible();
  for (const [search, button] of [['badkamer', 'Badkamer toevoegen'], ['keuken', 'Keuken toevoegen']] as const) {
    await add.getByRole('searchbox', { name: 'Zoek een apparaat' }).fill(search);
    await add.getByRole('button', { name: button, exact: true }).click();
  }
  await page.keyboard.press('Escape');
  await expect.poll(() => tileNames(page, 'Terras')).toEqual(['Badkamer', 'Keuken']);

  // another name, and a place higher in the rail
  await menu('Naam en icoon…');
  await expect(page.getByRole('dialog', { name: 'Naam en icoon' })).toBeVisible();
  await name.getByRole('textbox', { name: 'Naam' }).fill('Tuin');
  await name.getByRole('button', { name: 'Bewaren' }).click();
  await expect(bar.getByText('Tuin bewerken')).toBeVisible();
  await menu('Hoger in de balk');
  await expect.poll(boards).toEqual(['Tuin', 'Overzicht']);
  await expect(bar.getByRole('menuitem', { name: 'Hoger in de balk' })).toBeHidden();

  // from one to the other: the edit mode ends, and each shows its own sections
  await rail.getByRole('button', { name: 'Overzicht' }).click();
  await expect(bar).toBeHidden();
  await expect(section(page, 'Verlichting')).toBeVisible();
  await expect(section(page, 'Terras')).toBeHidden();
  await rail.getByRole('button', { name: 'Tuin' }).click();
  await expect(rail.getByRole('button', { name: 'Tuin' })).toHaveAttribute('aria-current', 'page');
  await expect(section(page, 'Terras')).toBeVisible();
  // and the tiles there work
  const lamp = page.getByRole('button', { name: /^Keuken/ }).first();
  const pressed = await lamp.getAttribute('aria-pressed');
  await lamp.click();
  await expect(lamp).toHaveAttribute('aria-pressed', pressed === 'true' ? 'false' : 'true');

  // the layout as a file
  await rail.getByRole('button', { name: 'Instellingen' }).click();
  const settings = page.locator('mh-settings-panel');
  const download = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Bewaren' }).click();
  const content = await readFile(await (await download).path(), 'utf8');
  expect(JSON.parse(content).dashboards.map((d: { name: string | null }) => d.name)).toEqual(['Tuin', null]);
  await page.keyboard.press('Escape');

  // removed, after a question
  await rail.getByRole('button', { name: 'Bewerken' }).click();
  await menu('Dashboard weghalen…');
  await expect(page.getByRole('alertdialog', { name: 'Tuin weghalen?' })).toBeVisible();
  await question.getByRole('button', { name: 'Annuleren' }).click();
  expect(await boards()).toEqual(['Tuin', 'Overzicht']);
  await menu('Dashboard weghalen…');
  await question.getByRole('button', { name: 'Weghalen' }).click();
  await expect.poll(boards).toEqual(['Overzicht']);
  await expect(page.getByText('Tuin is weggehaald.')).toBeVisible();
  await expect(section(page, 'Verlichting')).toBeVisible();

  // the menu of the Overzicht has no removing; it is still automatic, so there is nothing to put back either
  await bar.getByRole('button', { name: 'Menu van Overzicht' }).click();
  await expect(bar.getByRole('menuitem', { name: 'Dashboard weghalen…' })).toHaveCount(0);
  await expect(bar.getByRole('menuitem', { name: 'Terug naar automatisch…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Klaar' }).click();

  // and the file brings the dashboard back
  await rail.getByRole('button', { name: 'Instellingen' }).click();
  const chooser = page.waitForEvent('filechooser');
  await settings.getByRole('button', { name: 'Inladen' }).click();
  await (await chooser).setFiles({ name: 'mijn-indeling.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await question.getByRole('button', { name: 'Inladen' }).click();
  await expect.poll(boards).toEqual(['Tuin', 'Overzicht']);
  await expect.poll(() => tileNames(page, 'Terras')).toEqual(['Badkamer', 'Keuken']);

  await expectClean(page, problems);
});

test('dragging with a finger: scrolling first moves nothing, holding still picks up', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch is sent through the DevTools protocol');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', baseURL: 'http://localhost:5276/' });
  const page = await context.newPage();
  const { problems } = watch(page);
  await openExample(page);
  await page.getByRole('button', { name: 'Bewerken', exact: true }).tap();
  const client = await context.newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => {
    await client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  };
  const center = async (locator: Locator) => { const b = (await locator.boundingBox())!; return { x: b.x + b.width / 3, y: b.y + b.height / 3 }; };
  const tile = section(page, 'Klimaat').locator('mh-sensor-tile').first();

  // moving at once scrolls the page
  let at = await center(tile);
  await touch('touchStart', at.x, at.y);
  for (let i = 1; i <= 8; i += 1) await touch('touchMove', at.x, at.y - i * 20);
  await touch('touchEnd');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(40);
  expect(await page.locator('mh-dashboard .lifted').count()).toBe(0);
  expect(await tileNames(page, 'Klimaat')).toHaveLength(2);
  await page.evaluate(() => window.scrollTo(0, 0));

  // holding still first picks the tile up; the page stays where it is
  at = await center(tile);
  const water = (await section(page, 'Water').boundingBox())!;
  await touch('touchStart', at.x, at.y);
  await page.waitForTimeout(400);
  await expect(page.locator('mh-dashboard .lifted')).toHaveCount(1);
  for (let i = 1; i <= 10; i += 1) await touch('touchMove', at.x + ((water.x + water.width * 0.6 - at.x) * i) / 10, at.y + ((water.y + water.height * 0.4 - at.y) * i) / 10);
  await touch('touchEnd');
  await expect.poll(() => tileNames(page, 'Klimaat')).toHaveLength(1);
  expect((await tileNames(page, 'Water')).length).toBe(3);
  await expect(page.locator('mh-dashboard .lifted')).toHaveCount(0);

  await expectClean(page, problems);
  await context.close();
});
