import { expect, test, type Browser, type Page } from '@playwright/test';

// Who asks the system for less motion gets none: no waves, no changing shapes, nothing that slides in.

/** Everything in the page that would move: an animation, or a change that takes time. */
const moving = (page: Page) => page.evaluate(() => {
  const found = new Set<string>();
  const walk = (root: ParentNode): void => {
    for (const element of root.querySelectorAll('*')) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo);
        const takesTime = style.transitionProperty !== 'none' && style.transitionDuration.split(',').some((time) => parseFloat(time) > 0);
        if (style.animationName === 'none' && !takesTime) continue;
        const host = (element.getRootNode() as ShadowRoot).host?.localName ?? 'page';
        found.add(`${host} ${element.localName}.${element.getAttribute('class') ?? ''}${pseudo ?? ''}: ${style.animationName === 'none' ? style.transitionProperty : style.animationName}`);
      }
      if (element.shadowRoot) walk(element.shadowRoot);
    }
  };
  walk(document);
  return [...found];
});

async function open(browser: Browser, reducedMotion: 'reduce' | 'no-preference', viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, reducedMotion, locale: 'nl-NL' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Verbind je Homey' })).toBeVisible();
  return { page, context };
}
async function example(page: Page): Promise<void> {
  await page.getByRole('button', { name: /in een camper/i }).first().click();
  await expect(page.locator('mh-light-tile')).toHaveCount(8);
}

test('with less motion nothing moves, on no screen', async ({ browser }) => {
  const { page, context } = await open(browser, 'reduce');
  const still = async (where: string) => expect([where, await moving(page)]).toEqual([where, []]);
  await still('connect');
  await example(page);
  await still('dashboard');
  // what changes is there at once
  const lamp = page.getByRole('button', { name: /^Badkamer/ }).first();
  await lamp.click();
  await lamp.click();
  await still('a lamp that was switched');

  await page.getByRole('button', { name: 'Meer over Badkamer' }).click();
  await expect(page.getByRole('dialog', { name: 'Badkamer' })).toBeVisible();
  await still('device window');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Thema' }).click();
  await page.getByRole('radio', { name: 'Donker' }).click();
  await still('theme');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Menu van Water' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await still('section menu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Instellingen' }).click();
  await still('settings');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Bewerken' }).first().click();
  await still('edit mode');
  await page.locator('mh-section').first().getByRole('button', { name: 'Tegel toevoegen' }).click();
  await expect(page.getByRole('dialog', { name: /^Toevoegen aan/ })).toBeVisible();
  await still('add panel');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Nieuw', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Nieuw dashboard' })).toBeVisible();
  await still('a question');
  await page.keyboard.press('Escape');
  const grip = page.locator('mh-light-tile').first();
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 3 + 40, box.y + box.height / 3 + 30, { steps: 6 });
  await still('dragging');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await context.close();
});

test('on a phone nothing moves either, and a window is there at once', async ({ browser }) => {
  const { page, context } = await open(browser, 'reduce', { width: 390, height: 844 });
  await example(page);
  expect(await moving(page)).toEqual([]);
  await page.getByRole('button', { name: 'Meer', exact: true }).click();
  expect(await moving(page)).toEqual([]);
  await page.getByRole('menuitem', { name: 'Thema' }).click();
  // not a moment later: where it stands now is where it stays
  const panel = page.locator('mh-theme-panel').locator('.panel').first();
  const first = await panel.boundingBox();
  await page.waitForTimeout(600);
  expect(await panel.boundingBox()).toEqual(first);
  await context.close();
});

test('with less motion a lamp that is on keeps its round icon', async ({ browser }) => {
  const shape = (page: Page, state: string) => page.evaluate((wanted) => {
    const walk = (root: ParentNode): Element[] => [...root.querySelectorAll('*')].flatMap((element) => [...(element.localName === 'mh-light-tile' && element.getAttribute('state') === wanted ? [element] : []), ...(element.shadowRoot ? walk(element.shadowRoot) : [])]);
    const tile = walk(document)[0];
    return tile ? getComputedStyle(tile.shadowRoot!.querySelector('.icon')!).clipPath : null;
  }, state);
  for (const [reducedMotion, same] of [['reduce', true], ['no-preference', false]] as const) {
    const { page, context } = await open(browser, reducedMotion);
    await example(page);
    await page.waitForTimeout(700);
    const [on, off] = [await shape(page, 'on'), await shape(page, 'off')];
    expect([reducedMotion, on !== null, off !== null, on === off]).toEqual([reducedMotion, true, true, same]);
    await context.close();
  }
});

test('without that wish everything moves as before', async ({ browser }) => {
  const { page, context } = await open(browser, 'no-preference');
  expect((await moving(page)).join('\n')).toContain('spin');
  await example(page);
  const found = await moving(page);
  expect(found.join('\n')).toContain('mh-hero path.active: shift');
  expect(found.length).toBeGreaterThan(20);
  await context.close();
});
