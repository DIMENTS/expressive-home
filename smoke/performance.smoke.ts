import { expect, test, type CDPSession, type Page } from '@playwright/test';

// The speed measurement: Chromium with a four times slower processor and the example hub sending
// 17 reports a second, on an Overzicht that was made an own one first: the edit mode, one tile moved, Klaar.
// One minute of measuring long tasks while a slider is dragged, half a minute of dragging a tile back and forth in the
// edit mode, then an hour open with the heap measured every five minutes. Run on its own with `npm run perf`; it
// prints its results as JSON.

const MINUTE = 60_000;
const SOAK_MINUTES = Number(process.env['SOAK_MINUTES'] ?? 60);
const SAMPLE_MINUTES = 5;

interface Measured { longTasks: number; longestTaskMs: number; longTasksWhileDragging: number; longestWhileDraggingMs: number; slideToTileMs: number[] }

/** Starts counting long tasks and the time from a slide to the new state on its tile, in the page. */
async function startMeasuring(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { measured: Measured & { dragging: boolean; lastSlide: number | null } };
    w.measured = { longTasks: 0, longestTaskMs: 0, longTasksWhileDragging: 0, longestWhileDraggingMs: 0, slideToTileMs: [], dragging: false, lastSlide: null };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        w.measured.longTasks += 1;
        w.measured.longestTaskMs = Math.max(w.measured.longestTaskMs, entry.duration);
        if (w.measured.dragging) {
          w.measured.longTasksWhileDragging += 1;
          w.measured.longestWhileDraggingMs = Math.max(w.measured.longestWhileDraggingMs, entry.duration);
        }
      }
    }).observe({ type: 'longtask', buffered: false });
    document.addEventListener('slide', () => { w.measured.lastSlide = performance.now(); }, true);
  });
}

/** Watches the text of the tile of the lamp being dragged; each change after a slide is one measurement. */
async function watchTile(page: Page, name: string): Promise<void> {
  await page.evaluate((lamp) => {
    const w = window as unknown as { measured: Measured & { lastSlide: number | null } };
    const deep = (root: Document | ShadowRoot): Element[] => [...root.querySelectorAll('*')].flatMap((el) => [el, ...(el.shadowRoot ? deep(el.shadowRoot) : [])]);
    const face = deep(document).find((el) => el.getAttribute('role') === 'button' && (el.getAttribute('aria-label') ?? '').startsWith(lamp));
    if (!face) throw new Error(`no tile for ${lamp}`);
    new MutationObserver(() => {
      if (w.measured.lastSlide === null) return;
      w.measured.slideToTileMs.push(performance.now() - w.measured.lastSlide);
      w.measured.lastSlide = null;
    }).observe(face, { attributes: true, attributeFilter: ['aria-label'] });
  }, name);
}

interface EditDrag { editModeOnMs: number; longTasks: number; longestTaskMs: number; frames: number; medianFrameMs: number; slowFrameMs: number; longestFrameMs: number }

/** Half a minute of dragging a tile between two columns in the edit mode: long tasks and the time between frames. */
async function dragATile(page: Page): Promise<EditDrag> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const w = window as unknown as { edit: { tasks: number[]; frames: number[]; on: boolean } };
    w.edit = { tasks: [], frames: [], on: true };
    new PerformanceObserver((list) => { if (w.edit.on) w.edit.tasks.push(...list.getEntries().map((entry) => entry.duration)); }).observe({ type: 'longtask', buffered: false });
  });
  // the edit mode coming on is one longer task; it is measured by itself
  await page.getByRole('button', { name: 'Bewerken', exact: true }).click();
  await page.waitForTimeout(2000);
  const editModeOnMs = await page.evaluate(() => {
    const w = window as unknown as { edit: { tasks: number[] } };
    const longest = Math.round(Math.max(0, ...w.edit.tasks));
    w.edit.tasks = [];
    return longest;
  });
  const tile = (await page.locator('mh-section').filter({ has: page.locator('h2 .title', { hasText: /^Klimaat$/ }) }).locator('mh-sensor-tile').first().boundingBox())!;
  const left = (await page.locator('.col[data-column="left"]').boundingBox())!;
  await page.evaluate(() => {
    const w = window as unknown as { edit: { tasks: number[]; frames: number[]; on: boolean } };
    let last = performance.now();
    const frame = (now: number): void => {
      if (!w.edit.on) return;
      w.edit.frames.push(now - last);
      last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  const from = { x: tile.x + tile.width / 3, y: tile.y + tile.height / 3 };
  const to = { x: left.x + left.width / 3, y: 700 };
  const started = Date.now();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  while (Date.now() - started < MINUTE / 2) {
    await page.mouse.move(to.x, to.y, { steps: 40 });
    await expect(page.locator('mh-dashboard .lifted')).toHaveCount(1);
    await page.mouse.move(from.x, from.y, { steps: 40 });
  }
  const dragged = await page.evaluate(() => {
    const w = window as unknown as { edit: { tasks: number[]; frames: number[]; on: boolean } };
    w.edit.on = false;
    const frames = w.edit.frames.slice(1).sort((a, b) => a - b);
    const at = (part: number): number => Math.round(frames[Math.min(frames.length - 1, Math.floor(frames.length * part))] ?? 0);
    return { longTasks: w.edit.tasks.length, longestTaskMs: Math.round(Math.max(0, ...w.edit.tasks)), frames: frames.length, medianFrameMs: at(0.5), slowFrameMs: at(0.95), longestFrameMs: at(1) };
  });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Klaar' }).click();
  return { editModeOnMs, ...dragged };
}

async function heap(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage');
  const usage = await cdp.send('Runtime.getHeapUsage');
  return usage.usedSize;
}

test('the dashboard stays fluent at 17 reports a second on a slow processor', async ({ page }) => {
  test.setTimeout((SOAK_MINUTES + 10) * MINUTE);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('HeapProfiler.enable');
  await page.goto('/?simulatie=17');
  await page.getByRole('button', { name: 'Of in een camper' }).click();
  await expect(page.getByText('Voorbeeld', { exact: true })).toBeVisible();

  // the Overzicht becomes an own one: one tile moved
  await page.getByRole('button', { name: 'Bewerken', exact: true }).click();
  await page.getByRole('button', { name: 'Grijs water, menu openen' }).click();
  await page.getByRole('menuitem', { name: 'Naar achteren' }).click();
  await expect(page.getByText('Je eerste aanpassing maakt van dit Overzicht')).toBeHidden();
  await page.getByRole('button', { name: 'Klaar' }).click();

  await startMeasuring(page);
  await watchTile(page, 'Badkamer');

  // one minute: half of it dragging the slider of a lamp back and forth
  const slider = page.getByRole('slider', { name: 'Helderheid Badkamer' });
  const box = (await slider.boundingBox())!;
  const started = Date.now();
  await page.evaluate(() => { (window as unknown as { measured: { dragging: boolean } }).measured.dragging = true; });
  while (Date.now() - started < MINUTE / 2) {
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 0; i <= 20; i += 1) await page.mouse.move(box.x + box.width * (0.1 + 0.04 * i), box.y + box.height / 2, { steps: 2 });
    await page.mouse.up();
  }
  await page.evaluate(() => { (window as unknown as { measured: { dragging: boolean } }).measured.dragging = false; });
  await page.waitForTimeout(MINUTE / 2);
  const minute = await page.evaluate(() => (window as unknown as { measured: Measured }).measured);

  // half a minute in the edit mode, dragging a tile
  const editDrag = await dragATile(page);

  // an hour open: the heap after a garbage collection, every five minutes
  const samples: { minute: number; bytes: number }[] = [];
  for (let at = SAMPLE_MINUTES; at <= SOAK_MINUTES; at += SAMPLE_MINUTES) {
    await page.waitForTimeout(SAMPLE_MINUTES * MINUTE);
    samples.push({ minute: at, bytes: await heap(cdp) });
  }

  const slowest = Math.max(0, ...minute.slideToTileMs);
  const growth = samples.length > 1 ? samples.at(-1)!.bytes / samples[0]!.bytes - 1 : 0;
  console.log(JSON.stringify({ minute: { ...minute, slideToTileMs: undefined, slides: minute.slideToTileMs.length, slowestSlideToTileMs: Math.round(slowest) }, editDrag, samples, growth }, null, 2));
  expect(minute.longestWhileDraggingMs).toBeLessThanOrEqual(200);
  expect(slowest).toBeLessThanOrEqual(100);
  expect(editDrag.longestTaskMs).toBeLessThanOrEqual(200);
  expect(editDrag.editModeOnMs).toBeLessThanOrEqual(500);
  expect(growth).toBeLessThanOrEqual(0.2);
});
