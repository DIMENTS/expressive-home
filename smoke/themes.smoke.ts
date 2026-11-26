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

test('all values: a colour typed in changes the page at once, the panel keeps to its width, and the theme goes as EH2 to another browser', async ({ browser }) => {
  const { page, clean } = await house(browser);
  await openPanel(page);
  await page.getByRole('button', { name: 'Alle waarden' }).click();
  await page.getByRole('button', { name: 'Tegels', exact: true }).click();
  await page.getByRole('button', { name: 'Kiezen: Tegel aan: achtergrond' }).click();
  await page.getByRole('textbox', { name: 'Tegel aan: achtergrond: Kleurcode' }).fill('#7d4cff');
  expect(await token(page, '--tile-on-bg')).toBe('#7d4cff');
  // nothing in the editor is wider than its panel
  const wider = await page.locator('mh-theme-panel').evaluate((panel) => {
    const body = panel.shadowRoot!.querySelector('mh-sheet')!.shadowRoot!.querySelector('.body')!;
    return body.scrollWidth - body.clientWidth;
  });
  expect(wider).toBeLessThanOrEqual(0);
  await page.getByRole('radio', { name: 'Leeg' }).click();
  expect(await look(page)).toBe('leeg');
  expect(await token(page, '--shape-xl')).toBe('0px');
  await page.getByRole('textbox', { name: 'Naam van het thema' }).fill('Strak');
  await page.getByRole('button', { name: 'Bewaren als mijn thema' }).click();
  await expect(page.getByRole('radio', { name: /^Strak,/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /^Strak/ }).click();
  const code = (await page.locator('mh-theme-panel').evaluate((panel) => panel.shadowRoot!.querySelector('.code')!.textContent))!;
  expect(code).toMatch(/^EH2\./);
  await clean();

  const other = await house(browser);
  await openPanel(other.page);
  await other.page.getByRole('button', { name: 'Thema van een ander' }).click();
  await other.page.getByRole('textbox', { name: 'Plak een deelcode' }).fill(code);
  await other.page.getByRole('button', { name: 'Bewaren en gebruiken' }).click();
  await expect(other.page.getByRole('radio', { name: /^Strak,/ })).toHaveAttribute('aria-checked', 'true');
  expect(await token(other.page, '--tile-on-bg')).toBe('#7d4cff');
  expect(await look(other.page)).toBe('leeg');
  await other.clean();
});

test('own CSS: the widest the list allows changes the page, yet an alarm stays red, visible and in its place, and every button keeps its size', async ({ browser }) => {
  const { page, clean } = await house(browser);
  const raiseAlarms = (on = true) => page.evaluate((value) => {
    type Store = { getDevices(): { id: string; capabilities: Record<string, { id: string; baseId: string; type: string }> }[]; apply(event: unknown): void };
    const { store } = document.querySelector('mh-app') as unknown as { store: Store };
    for (const device of store.getDevices()) {
      for (const cap of Object.values(device.capabilities)) if (cap.baseId.startsWith('alarm_') && cap.type === 'boolean') store.apply({ type: 'capability', deviceId: device.id, capabilityId: cap.id, value, at: null });
    }
  }, on);
  // where the first alarm tile is, and how large, without own CSS
  await raiseAlarms();
  const tileHost = page.locator('[data-tile-id][state="danger"]').first();
  const alarmId = await tileHost.getAttribute('data-tile-id');
  const own = page.locator(`[data-tile-id="${alarmId}"]`);
  const alarmBefore = await own.evaluate((element) => element.shadowRoot!.querySelector('.tile')!.getBoundingClientRect().toJSON());
  await raiseAlarms(false);
  const plainHost = page.locator('mh-section [state="neutral"]').first();
  await expect(plainHost).toHaveCount(1);
  await openPanel(page);
  await page.getByRole('button', { name: 'Alle waarden' }).click();
  await page.getByRole('button', { name: 'Eigen CSS' }).click();
  await page.getByRole('textbox', { name: 'Eigen CSS' }).fill(`
    ::part(page), ::part(section), ::part(tile), ::part(tile-name), ::part(tile-state), ::part(tile-icon), ::part(rail-item) {
      background: #00ff00; color: #00ff00; border: 16px solid #00ff00; box-shadow: inset 0 0 64px 16px #00ff00, inset 16px 16px 64px 16px #00ff00; text-shadow: 16px 16px 64px #00ff00;
      transition: background-color 2s, color 2s, box-shadow 2s;
      padding: 64px; font-size: .75em; letter-spacing: -4px; opacity: 0; transform: scale(0); display: none; position: fixed; z-index: 9; margin: -400px;
    }
    ::part(tile)::before { content: ""; padding: 64px; background: #00ff00; }
    ::part(section) { --tile-alert-bg: #00ff00; --hold-step: 1ms; --target-min: 0px; }
  `);
  await page.waitForTimeout(2600);
  const plain = await plainHost.evaluate((element) => getComputedStyle(element.shadowRoot!.querySelector('.tile')!).backgroundColor);
  expect(plain).toBe('rgb(0, 255, 0)');
  const before = await plainHost.evaluate((element) => element.shadowRoot!.querySelector('.tile')!.getBoundingClientRect().toJSON());
  // the alarms go off now, with the CSS and its slow colour changes in place: an alarm shows at once
  await page.mouse.move(1, 1);
  await raiseAlarms();
  await expect(own).toHaveAttribute('state', 'danger');
  await page.waitForTimeout(400);
  const alarm = await own.evaluate((element) => {
    const tile = element.shadowRoot!.querySelector('.tile')!;
    const style = getComputedStyle(tile);
    const probe = document.createElement('div');
    probe.style.background = 'var(--tile-alert-bg)';
    element.shadowRoot!.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const rect = tile.getBoundingClientRect();
    let visible = true;
    for (let node: Element | null = tile; node; node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host ?? null)) {
      const own = getComputedStyle(node);
      if (own.opacity !== '1' || own.visibility === 'hidden' || own.display === 'none' || (own.transform !== 'none' && own.transform !== 'matrix(1, 0, 0, 1, 0, 0)')) visible = false;
    }
    return { background: style.backgroundColor, expected, visible, x: rect.x, y: rect.y, width: rect.width, height: rect.height, shadow: style.boxShadow, name: getComputedStyle(tile.querySelector('.name')!).color, fg: getComputedStyle(probe).color };
  });
  expect(alarm.background).toBe(alarm.expected);
  expect(alarm.background).not.toBe('rgb(0, 255, 0)');
  expect(alarm.name).not.toBe('rgb(0, 255, 0)');
  expect(alarm.visible).toBe(true);
  expect(alarm.width).toBeGreaterThanOrEqual(48);
  expect(alarm.height).toBeGreaterThanOrEqual(48);
  expect(alarm.shadow).not.toContain('0, 255, 0');
  // never smaller than it was, and nothing lies over it: what a finger touches in its middle is the alarm tile itself
  expect(alarm.width).toBeGreaterThanOrEqual(alarmBefore.width - 1);
  expect(alarm.height).toBeGreaterThanOrEqual(alarmBefore.height - 1);
  await own.scrollIntoViewIfNeeded();
  const onTop = await own.evaluate((element) => {
    const rect = element.shadowRoot!.querySelector('.tile')!.getBoundingClientRect();
    // the editor lies over the right of the page: a point of the tile beside it
    const panel = document.querySelector('mh-app')!.shadowRoot!.querySelector('mh-theme-panel')!.shadowRoot!.querySelector('mh-sheet')!.shadowRoot!.querySelector('.panel')!.getBoundingClientRect();
    const x = Math.min(rect.x + rect.width / 2, panel.x - 8);
    if (x <= rect.x) return true;
    const y = rect.y + rect.height / 2;
    let hit: Element | null = document.elementFromPoint(x, y);
    while (hit?.shadowRoot) {
      const deeper = hit.shadowRoot.elementFromPoint(x, y);
      if (!deeper || deeper === hit) break;
      hit = deeper;
    }
    for (let node: Node | null = hit; node; node = node.parentNode ?? (node as ShadowRoot).host ?? null) if (node === element) return true;
    return false;
  });
  expect(onTop).toBe(true);
  void before;
  for (const size of await page.locator('mh-rail').evaluate((rail) => [...rail.shadowRoot!.querySelectorAll('button')].map((button) => { const rect = button.getBoundingClientRect(); return [rect.width, rect.height]; }))) {
    expect(size[0]).toBeGreaterThanOrEqual(48);
    expect(size[1]).toBeGreaterThanOrEqual(48);
  }
  // the theme window is still Rustig and usable: back, and away
  await page.getByRole('button', { name: 'Terug naar alle waarden' }).click();
  await page.getByRole('button', { name: 'Weggooien' }).click();
  await clean();
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

test('the gallery: a link to open it among the themes of others, and one to send in a theme made here; both 48 by 48 at least, by keyboard', async ({ browser }) => {
  const { page, context, clean } = await house(browser);
  const outside: string[] = [];
  context.on('request', (request) => { if (new URL(request.url()).hostname !== 'localhost') outside.push(request.url()); });
  await openPanel(page);
  await page.getByRole('button', { name: 'Thema van een ander' }).click();
  await expect(page.getByText('github.com/DIMENTS/expressive-home-themes')).toBeVisible();
  const open = page.getByRole('link', { name: /^Galerij openen/ });
  await expect(open).toHaveAttribute('href', 'https://github.com/DIMENTS/expressive-home-themes');
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  const size = async (link: typeof open) => { const box = (await link.boundingBox())!; return box.width >= 48 && box.height >= 48; };
  expect(await size(open)).toBe(true);
  // by keyboard: it takes the focus with Tab, and shows it
  await page.getByRole('button', { name: 'Of kies een bestand' }).focus();
  for (let tries = 0; tries < 5 && !(await open.evaluate((link) => link.matches(':focus'))); tries += 1) await page.keyboard.press('Tab');
  expect(await open.evaluate((link) => link.matches(':focus-visible'))).toBe(true);
  await page.getByRole('button', { name: 'Terug' }).click();

  await page.getByRole('button', { name: 'Bijstellen' }).click();
  await page.getByRole('textbox', { name: 'Naam van het thema' }).fill('Zee & lucht');
  await page.getByRole('button', { name: 'Bewaren als mijn thema' }).click();
  await page.getByRole('button', { name: /^Zee & lucht/ }).click();
  const send = page.getByRole('link', { name: /^Insturen bij de galerij/ });
  expect(await size(send)).toBe(true);
  const url = new URL((await send.getAttribute('href'))!);
  expect(url.searchParams.get('name')).toBe('Zee & lucht');
  expect(url.searchParams.get('code')).toMatch(/^EH1\./);
  expect(outside).toEqual([]);
  await clean();
});
