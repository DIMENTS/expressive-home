// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/parts/sheet';
import '../../../src/ui/parts/button';
import '../../../src/ui/parts/switch';
import type { MhSheet } from '../../../src/ui/parts/sheet';
import { inside, key, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const deepActive = (): Element | null => {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
};

async function openSheet(): Promise<MhSheet> {
  const sheet = await mount<MhSheet>('mh-sheet', { heading: 'Plafond', subheading: 'Woonkamer', icon: 'lightbulb' },
    '<mh-switch label="Aan"></mh-switch><mh-button variant="tonal">Uitvoeren</mh-button>');
  sheet.open = true;
  await settle(sheet);
  return sheet;
}

test('an open sheet is a modal dialog named after its heading', async () => {
  const sheet = await openSheet();
  const dialog = inside(sheet, '[role="dialog"]');
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(inside(sheet, `#${dialog.getAttribute('aria-labelledby')}`).textContent).toBe('Plafond');
});

test('a closed sheet cannot be reached', async () => {
  const sheet = await mount<MhSheet>('mh-sheet', { heading: 'Plafond' });
  expect(inside(sheet, '[role="dialog"]').hasAttribute('inert')).toBe(true);
});

test('opening moves focus into the sheet and closing gives it back', async () => {
  const before = document.createElement('button');
  document.body.append(before);
  before.focus();
  const sheet = await openSheet();
  expect(sheet.shadowRoot!.activeElement).not.toBeNull();
  sheet.open = false;
  await settle(sheet);
  expect(document.activeElement).toBe(before);
});

test('Tab stays inside the sheet', async () => {
  const sheet = await openSheet();
  const close = inside(sheet, 'mh-button');
  const last = sheet.querySelector('mh-button')!;
  last.focus();
  const forward = key(deepActive()!, 'Tab');
  expect(forward.defaultPrevented).toBe(true);
  expect(deepActive()).toBe(close.shadowRoot!.querySelector('button'));
  key(deepActive()!, 'Tab', { shiftKey: true });
  expect(deepActive()).toBe(last.shadowRoot!.querySelector('button'));
});

test('Escape, the close button and the scrim each fire close once', async () => {
  const sheet = await openSheet();
  const closes = record(sheet, 'close');
  key(inside(sheet, '[role="dialog"]'), 'Escape');
  inside(inside(sheet, 'mh-button'), 'button').click();
  inside(sheet, '.scrim').click();
  expect(closes).toHaveLength(3);
});

test('a panel with a second stand has a back button with a name', async () => {
  const sheet = await mount<MhSheet>('mh-sheet', { open: true, heading: 'Icoon kiezen' });
  expect(sheet.shadowRoot!.querySelector('mh-button[label="Terug"]')).toBeNull();
  sheet.back = true;
  await settle(sheet);
  const backs = record(sheet, 'back');
  sheet.shadowRoot!.querySelector<HTMLElement>('mh-button[label="Terug"]')!.click();
  expect(backs).toHaveLength(1);
});

test('going to a second stand and back keeps the focus in the panel, so Escape still closes it', async () => {
  const sheet = await mount<MhSheet>('mh-sheet', { heading: 'Tegel' }, '<button id="change">Wijzigen</button>');
  sheet.open = true;
  await settle(sheet);
  const closes = record(sheet, 'close');
  const panel = inside(sheet, '.panel');
  // what had the focus goes away with the stand it was in
  for (const back of [true, false]) {
    const change = sheet.querySelector<HTMLElement>('#change') ?? sheet.appendChild(Object.assign(document.createElement('button'), { id: 'change' }));
    change.focus();
    expect(document.activeElement).toBe(change);
    change.remove();
    sheet.back = back;
    await settle(sheet);
    expect(sheet.shadowRoot!.activeElement).toBe(panel);
    key(panel, 'Escape');
  }
  expect(closes).toHaveLength(2);
});

test('an open panel whose focused part is gone takes the focus itself', async () => {
  const sheet = await mount<MhSheet>('mh-sheet', { heading: 'Nieuw' });
  const inner = document.createElement('button');
  sheet.append(inner);
  sheet.open = true;
  await settle(sheet);
  inner.focus();
  sheet.keepFocus();
  expect(document.activeElement).toBe(inner);
  inner.remove();
  sheet.keepFocus();
  expect(sheet.shadowRoot!.activeElement).toBe(sheet.shadowRoot!.querySelector('.panel'));
});

test('on a phone it can be swept down by its top; there is nothing to focus for that', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const sheet = await openSheet();
  const top = inside(sheet, '.top');
  expect([top.contains(inside(sheet, '.head')), inside(sheet, '.grab').tabIndex, inside(sheet, '.grab').getAttribute('aria-hidden')]).toEqual([true, -1, 'true']);
  const closes = record(sheet, 'close');
  const point = (type: string, y: number) => top.dispatchEvent(new PointerEvent(type, { clientY: y, pointerId: 1, isPrimary: true, button: 0, bubbles: true, composed: true }));
  point('pointerdown', 0);
  point('pointermove', 60);
  point('pointermove', 200);
  point('pointerup', 200);
  expect(closes).toHaveLength(1);
  vi.unstubAllGlobals();
});

test('in a wide window it cannot be swept away', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const sheet = await openSheet();
  const closes = record(sheet, 'close');
  const point = (type: string, y: number) => inside(sheet, '.top').dispatchEvent(new PointerEvent(type, { clientY: y, pointerId: 1, isPrimary: true, button: 0, bubbles: true, composed: true }));
  point('pointerdown', 0);
  point('pointermove', 200);
  point('pointerup', 200);
  expect(closes).toHaveLength(0);
  vi.unstubAllGlobals();
});
