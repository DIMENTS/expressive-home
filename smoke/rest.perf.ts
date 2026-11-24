import { expect, test, type CDPSession } from '@playwright/test';

// The speed measurement of a wall tablet: Chromium with a four times slower processor, the example hub sending 17 reports
// a second. An hour of the rest screen with the heap measured every five minutes, two minutes of the night in which next to
// nothing may be drawn, and then two days and nights with a
// clock that runs ahead, a minute at a time: the first warms everything up, the second may not grow. Run with `npm run perf -- rest`; it prints its results as JSON.

const MINUTE = 60_000;
const REST_MINUTES = Number(process.env['REST_MINUTES'] ?? 60);
const SAMPLE_MINUTES = 5;

async function heap(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return usedSize;
}

test('an hour at rest, and two days with their nights', async ({ page }) => {
  test.setTimeout((REST_MINUTES + 25) * MINUTE);
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.clock.install({ time: new Date('2026-11-23T12:00:00+01:00') });
  await page.goto('/?simulatie=17');
  await page.getByRole('button', { name: /in een camper/i }).first().click();
  await expect(page.locator('mh-light-tile')).toHaveCount(8);
  await page.getByRole('button', { name: 'Instellingen', exact: true }).click();
  await page.getByRole('button', { name: 'Instellen', exact: true }).click();
  const panel = page.locator('mh-wall-panel');
  await panel.getByRole('switch', { name: 'Rustbeeld tonen' }).click();
  await panel.getByRole('button', { name: 'Binnen kiezen' }).click();
  await panel.getByRole('radio', { name: /Klimaatsensor/ }).click();
  await page.keyboard.press('Escape');
  await page.clock.fastForward('02:01');
  const rest = page.locator('mh-rest-screen');
  await expect(rest).toBeVisible();
  await page.waitForTimeout(3000);

  // at rest: long tasks, what is drawn, and the heap
  await page.evaluate(() => {
    const w = window as unknown as { long: number[]; looks: string[] };
    w.long = [];
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) w.long.push(entry.duration); }).observe({ type: 'longtask', buffered: false });
  });
  const samples: { minute: number; bytes: number }[] = [];
  for (let at = SAMPLE_MINUTES; at <= REST_MINUTES; at += SAMPLE_MINUTES) {
    await page.waitForTimeout(SAMPLE_MINUTES * MINUTE);
    samples.push({ minute: at, bytes: await heap(cdp) });
  }
  const long = await page.evaluate(() => (window as unknown as { long: number[] }).long);
  const growth = samples.length > 1 ? samples.at(-1)!.bytes / samples[0]!.bytes - 1 : 0;

  // two minutes of the night: the clock is all there is to draw, whatever the hub reports
  type Page = { wall: { setFlow(flow: { night: boolean; at: number } | null): void } };
  await page.evaluate(() => {
    const app = document.querySelector('mh-app') as unknown as Page & HTMLElement;
    app.wall.setFlow({ night: true, at: Date.now() });
    const w = window as unknown as { drawn: number };
    w.drawn = 0;
    const root = app.shadowRoot!.querySelector('mh-rest-screen')!.shadowRoot!;
    new MutationObserver(() => { w.drawn += 1; }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  await page.waitForTimeout(2 * MINUTE);
  const drawn = await page.evaluate(() => (window as unknown as { drawn: number }).drawn);
  await page.evaluate(() => (document.querySelector('mh-app') as unknown as Page).wall.setFlow(null));

  // two days and nights, a minute at a time
  await page.evaluate(() => {
    const w = window as unknown as { looks: string[] };
    w.looks = [];
    const root = document.querySelector('mh-app')!.shadowRoot!.querySelector('mh-rest-screen')!.shadowRoot!;
    const look = () => {
      const now = root.querySelector('.screen')!.classList.contains('night') ? 'night' : 'day';
      if (w.looks.at(-1) !== now) w.looks.push(now);
    };
    look();
    new MutationObserver(look).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  });
  const days: number[] = [];
  for (let day = 0; day < 2; day += 1) {
    for (let minute = 0; minute < 24 * 60; minute += 1) await page.clock.fastForward(MINUTE);
    await page.waitForTimeout(2000);
    days.push(await heap(cdp));
  }
  const dayGrowth = days[1]! / days[0]! - 1;
  const looks = await page.evaluate(() => (window as unknown as { looks: string[] }).looks);

  console.log(JSON.stringify({ longTasks: long.length, longestTaskMs: Math.max(0, ...long), samples, growth, drawnInTwoMinutesOfNight: drawn, days, dayGrowth, looks }, null, 2));
  await expect(rest).toBeVisible();
  expect(problems).toEqual([]);
  expect(Math.max(0, ...long)).toBeLessThanOrEqual(50);
  expect(growth).toBeLessThanOrEqual(0.05);
  // one for the night that began, and at most two a minute
  expect(drawn).toBeLessThanOrEqual(5);
  expect(looks).toEqual(['day', 'night', 'day', 'night', 'day']);
  expect(dayGrowth).toBeLessThanOrEqual(0.05);
});
