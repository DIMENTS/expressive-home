import { expect, test, type Page } from '@playwright/test';
import { sticksOut } from './fits';

// No text of the dashboard sticks out of the block it belongs to, on wide windows and tablets,
// and on phones.

type Store = { apply(event: unknown): void; getDevices(): { id: string; capabilities: Record<string, { id: string; baseId: string; type: string; min: number | null }> }[] };
const state = (page: Page, kind: string) => page.evaluate((what) => {
  const { store } = document.querySelector('mh-app') as unknown as { store: Store };
  const set = (deviceId: string, capabilityId: string, value: unknown) => store.apply({ type: 'capability', deviceId, capabilityId, value, at: null });
  for (const device of store.getDevices()) {
    for (const cap of Object.values(device.capabilities)) {
      if (cap.baseId === 'ac_input_source') set(device.id, cap.id, what === 'large' ? 'none' : what);
      if (what === 'large' && cap.type === 'number' && /measure|meter/.test(cap.baseId) && cap.min !== 0) set(device.id, cap.id, 12_345.6);
    }
  }
}, kind);

for (const density of ['comfortable', 'compact'] as const) {
  // on a phone roomy and compact are the same
  for (const width of [1920, 1440, 1280, 1180, 1024, 900, 820, 768, 700, ...(density === 'comfortable' ? [599, 430, 412, 390, 375, 360, 320] : [])]) {
    test(`every text stays in its block: ${width} wide, ${density}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'nl-NL' });
      const page = await context.newPage();
      await page.addInitScript((d) => localStorage.setItem('dashboard.config', JSON.stringify({ version: 3, theme: { seed: '#3b6939', mode: 'light', density: d } })), density);
      await page.goto('/');
      await page.getByRole('button', { name: /in een camper/i }).first().click();
      await expect(page.locator('mh-light-tile')).toHaveCount(8);
      for (const kind of ['none', 'inverting', 'grid', 'large']) {
        await state(page, kind);
        await page.waitForTimeout(150);
        expect([kind, await sticksOut(page)]).toEqual([kind, []]);
      }
      await context.close();
    });
  }
}

test('an own hero whose value is a text stays in its block too', async ({ browser }) => {
  for (const width of [1440, 1180, 820, 390, 360, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'nl-NL' });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: /in een camper/i }).first().click();
    await expect(page.locator('mh-light-tile')).toHaveCount(8);
    await page.evaluate(() => {
      const walk = (root: ParentNode): Element | null => { for (const e of root.querySelectorAll('*')) { if (e.localName === 'mh-hero') return e; const inside = e.shadowRoot && walk(e.shadowRoot); if (inside) return inside; } return null; };
      const text = { deviceId: 'device-23', capabilityId: 'ac_input_source' };
      (walk(document) as unknown as { hero: unknown }).hero = { kind: 'own', deviceIds: ['device-23'], primary: text, timeToGo: null, line: text, name: 'Stroom', stats: [1, 2, 3, 4].map(() => ({ role: 'value', ref: text })) };
    });
    for (const kind of ['none', 'inverting']) {
      await state(page, kind);
      await page.waitForTimeout(150);
      expect([width, kind, await sticksOut(page)]).toEqual([width, kind, []]);
    }
    await context.close();
  }
});

/** Words of the hero that are broken in the middle, and labels that are cut off. */
const brokenInHero = (page: Page) => page.evaluate(() => {
  const found: string[] = [];
  const walk = (root: ParentNode): void => {
    for (const element of root.querySelectorAll<HTMLElement>('*')) {
      if (element.shadowRoot) walk(element.shadowRoot);
      if (!element.matches('.stat b, .stat span')) continue;
      if (element.scrollHeight > element.clientHeight + 1) found.push(`cut off: ${element.textContent!.trim()}`);
      for (const node of element.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        for (const word of node.textContent!.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, word.index);
          range.setEnd(node, word.index + word[0].length);
          if (new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size > 1) found.push(`broken: ${word[0]}`);
        }
      }
    }
  };
  walk(document);
  return found;
});

for (const locale of ['nl-NL', 'en-GB']) {
  test(`no word of the hero is broken or cut off on a phone: ${locale}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 430, height: 900 }, locale });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: /in een camper|camper van/i }).first().click();
    await expect(page.locator('mh-light-tile')).toHaveCount(8);
    for (const width of [599, 520, 480, 430, 412, 404, 393, 390, 375, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      expect([width, await brokenInHero(page)]).toEqual([width, []]);
    }
    await context.close();
  });
}
