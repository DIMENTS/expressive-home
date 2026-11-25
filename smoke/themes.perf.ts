import { expect, test, type Page } from '@playwright/test';

// Themes on a slow device: Chromium with a six times slower processor. Switching a style may take no longer than
// switching the base colour, which the dashboard could always do; both restyle the whole page. Scrolling with Glas, which
// lets the page show through, must stay as smooth as with Rustig. Prints its results, with the aim of 200 ms beside them.

const SLOWER = 6;

async function exampleHouse(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: /voorbeeldhuis/ }).click();
  await expect(page.locator('mh-dashboard')).toBeVisible();
  await page.waitForTimeout(1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOWER });
}

/** From the choice until the page with the new style (or colour) has been painted. */
const switchTo = (page: Page, change: Record<string, string>): Promise<number> => page.evaluate(async (look) => {
  const { controller } = document.querySelector('mh-app') as unknown as { controller: { setDeviceLook(change: unknown): boolean } };
  const start = performance.now();
  controller.setDeviceLook({ ...look, followStyle: false });
  await new Promise((done) => { requestAnimationFrame(() => requestAnimationFrame(done)); });
  return performance.now() - start;
}, change);

/** The time between frames while the page is scrolled down and up for a few seconds. */
async function scrolling(page: Page): Promise<number[]> {
  await page.evaluate(() => {
    const w = window as unknown as { frames: number[]; counting: boolean };
    w.frames = [];
    w.counting = true;
    let last = performance.now();
    const tick = (now: number): void => {
      w.frames.push(now - last);
      last = now;
      if (w.counting) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(700, 450);
  for (let i = 0; i < 30; i += 1) {
    await page.mouse.wheel(0, i < 15 ? 160 : -160);
    await page.waitForTimeout(100);
  }
  return page.evaluate(() => {
    const w = window as unknown as { frames: number[]; counting: boolean };
    w.counting = false;
    return w.frames.slice(2);
  });
}

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const slow = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.9)] ?? 0;

test('switching a style is no slower than switching the colour on a slow device, and Glas scrolls as smoothly as Rustig', async ({ page }) => {
  test.setTimeout(180_000);
  await exampleHouse(page);
  const styles: number[] = [];
  const colours: number[] = [];
  for (let round = 0; round < 3; round += 1) {
    for (const theme of ['uitbundig', 'glas', 'helder', 'rustig']) styles.push(await switchTo(page, { theme }));
    for (const seed of ['#3a5ba9', '#6750a4', '#a6422a', '#3b6939']) colours.push(await switchTo(page, { seed }));
  }
  const rustig = await scrolling(page);
  await switchTo(page, { theme: 'glas' });
  const glas = await scrolling(page);
  const result = {
    aimMs: 200, styleMedianMs: Math.round(median(styles)), styleSlowestMs: Math.round(Math.max(...styles)), colourMedianMs: Math.round(median(colours)),
    rustigFrameMs: [Math.round(median(rustig)), Math.round(slow(rustig))], glasFrameMs: [Math.round(median(glas)), Math.round(slow(glas))],
  };
  console.log(JSON.stringify(result));
  expect(median(styles)).toBeLessThanOrEqual(median(colours) * 1.15);
  expect(median(glas)).toBeLessThanOrEqual(median(rustig) * 1.25 + 2);
});
