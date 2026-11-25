import { expect, test, type Browser, type Page } from '@playwright/test';

// Themes in the example house: every style on the whole page, adjusting, sharing, a dashboard of its own; never
// anything from outside, and the danger question always the same.

const OPTIONS = { viewport: { width: 1440, height: 900 }, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', baseURL: 'http://localhost:5276/' };

async function house(browser: Browser) {
  const context = await browser.newContext(OPTIONS);
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => problems.push(`error: ${error.message}`));
  await page.addInitScript(() => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (event) => (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  await page.goto('/');
  await page.getByRole('button', { name: /voorbeeldhuis/ }).click();
  await expect(page.locator('mh-dashboard')).toBeVisible();
  const clean = async () => {
    expect(problems).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
    await context.close();
  };
  return { page, context, clean };
}

const look = (page: Page) => page.evaluate(() => document.documentElement.dataset['look']);
const token = (page: Page, name: string) => page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name);
const openPanel = async (page: Page) => {
  await page.getByRole('button', { name: 'Thema', exact: true }).click();
  await expect(page.getByRole('radiogroup', { name: 'Stijl' })).toBeVisible();
};
const closePanel = async (page: Page) => {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('radiogroup', { name: 'Stijl' })).toBeHidden();
};
const chooseStyle = async (page: Page, name: string) => {
  await page.getByRole('radio', { name: new RegExp(`^${name},`) }).click();
};

/** The danger question: what its window looks like. */
async function dangerLooks(page: Page) {
  await page.evaluate(() => {
    const { controller } = document.querySelector('mh-app') as unknown as { controller: { setEditing(on: boolean): void; getState(): { boardId: string; board: { left: Block[]; right: Block[] } }; edit(change: unknown): void } };
    type Block = { type: string; section: { tiles: { id: string; kind: string }[] } };
    controller.setEditing(true);
    const { board, boardId } = controller.getState();
    for (const tile of [...board.left, ...board.right].flatMap((b) => (b.type === 'section' ? b.section.tiles : [])).filter((t) => t.kind === 'guard')) {
      controller.edit({ type: 'set-tile', dashboardId: boardId, tileId: tile.id, patch: { size: 'wide' } });
    }
    controller.setEditing(false);
  });
  const unlock = page.getByRole('button', { name: 'Voordeur ontgrendelen', exact: true });
  await unlock.scrollIntoViewIfNeeded();
  await unlock.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('mh-dialog.confirm[open]');
  await expect(dialog).toHaveCount(1);
  const shown = await dialog.evaluate((host) => {
    const panel = host.shadowRoot!.querySelector('[role="alertdialog"], [role="dialog"], dialog') as HTMLElement;
    const style = getComputedStyle(panel);
    return [style.backgroundColor, style.borderRadius, style.fontFamily].join(' | ');
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  return shown;
}

test('every style lands on the whole page; nothing comes from outside; the danger question stays as it is', async ({ browser }) => {
  const { page, clean } = await house(browser);
  expect(await look(page)).toBe('rustig');
  const rustig = await dangerLooks(page);
  for (const [name, base] of [['Uitbundig', 'uitbundig'], ['Glas', 'glas'], ['Helder', 'helder']]) {
    await openPanel(page);
    await chooseStyle(page, name!);
    await closePanel(page);
    expect(await look(page)).toBe(base);
    expect(await dangerLooks(page)).toBe(rustig);
  }
  expect(await token(page, '--tile-outline-width')).toBe('2px');
  await clean();
});

test('adjusting changes the page at once; a saved theme can be shared and taken in by another browser', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await openPanel(page);
  await page.getByRole('button', { name: 'Bijstellen' }).click();
  await page.getByRole('radio', { name: 'Hoekig' }).click();
  expect(await token(page, '--shape-xl')).toBe('6px');
  await page.getByRole('textbox', { name: 'Naam van het thema' }).fill('Zee');
  await page.getByRole('button', { name: 'Bewaren als mijn thema' }).click();
  await expect(page.getByRole('radio', { name: /^Zee,/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /^Zee/ }).click();
  const code = (await page.locator('mh-theme-panel').evaluate((panel) => panel.shadowRoot!.querySelector('.code')!.textContent))!;
  expect(code).toMatch(/^EH1\./);
  await clean();

  const other = await house(browser);
  await openPanel(other.page);
  await other.page.getByRole('button', { name: 'Thema van een ander' }).click();
  await other.page.getByRole('textbox', { name: 'Plak een deelcode' }).fill(code);
  await expect(other.page.getByText(/^Nagekeken:/)).toBeVisible();
  await other.page.getByRole('button', { name: 'Bewaren en gebruiken' }).click();
  await expect(other.page.getByRole('radio', { name: /^Zee,/ })).toHaveAttribute('aria-checked', 'true');
  expect(await token(other.page, '--shape-xl')).toBe('6px');
  await other.clean();
});

test('a dashboard with a theme of its own shows it; the rooms follow the rest', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await page.getByRole('button', { name: 'Bewerken' }).click();
  await page.getByRole('button', { name: /^Menu van Overzicht/ }).click();
  await page.getByRole('menuitem', { name: 'Uiterlijk…' }).click();
  await page.getByRole('radio', { name: 'Eigen thema' }).click();
  await page.getByRole('radio', { name: /^Glas,/ }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Klaar' }).click();
  expect(await look(page)).toBe('glas');
  await page.getByRole('button', { name: 'Kamers' }).click();
  await expect.poll(() => look(page)).toBe('rustig');
  await clean();
});

test('#veilig opens the dashboard in Rustig, whatever was chosen', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await openPanel(page);
  await chooseStyle(page, 'Helder');
  await closePanel(page);
  // a new page, not a jump within this one
  await page.goto('about:blank');
  await page.goto('/#veilig');
  await page.getByRole('button', { name: /voorbeeldhuis/ }).click();
  await expect(page.locator('mh-dashboard')).toBeVisible();
  expect(await look(page)).toBe('rustig');
  await openPanel(page);
  await expect(page.getByText(/^Veilig geopend/)).toBeVisible();
  await clean();
});
