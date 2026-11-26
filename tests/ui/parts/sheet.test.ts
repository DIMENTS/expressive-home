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

/** What had the focus is taken away: the focus falls back to the page. */
function loseFocus(): void {
  const gone = document.createElement('button');
  document.body.append(gone);
  gone.focus();
  gone.remove();
  expect(document.activeElement === null || document.activeElement === document.body).toBe(true);
}

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

test('when what had the focus is taken away, Escape still closes the sheet and Tab goes into it', async () => {
  const sheet = await openSheet();
  const closes = record(sheet, 'close');
  const button = sheet.querySelector<HTMLElement>('mh-button')!;
  button.focus();
  // a list drawn anew takes away what was clicked: the focus falls back to the page
  button.remove();
  (document.activeElement as HTMLElement | null)?.blur();
  expect(document.activeElement === null || document.activeElement === document.body).toBe(true);
  key(document.body, 'Escape');
  expect(closes).toHaveLength(1);
  sheet.querySelector('mh-switch')!.remove();
  (document.activeElement as HTMLElement | null)?.blur();
  const tab = key(document.body, 'Tab');
  expect(tab.defaultPrevented).toBe(true);
  // through the shadow roots up to the sheet
  let at: Node | null = deepActive();
  while (at && at !== sheet) at = at.parentNode ?? (at instanceof ShadowRoot ? at.host : null);
  expect(at).toBe(sheet);
});

test('a sheet that is closed does nothing with keys on the page', async () => {
  const sheet = await openSheet();
  const closes = record(sheet, 'close');
  sheet.open = false;
  await settle(sheet);
  (document.activeElement as HTMLElement | null)?.blur();
  expect(key(document.body, 'Escape').defaultPrevented).toBe(false);
  expect(key(document.body, 'Tab').defaultPrevented).toBe(false);
  expect(closes).toHaveLength(0);
});

test('a sheet that is open but hidden, as on a narrow window, takes no keys from the page', async () => {
  const wrapper = document.createElement('div');
  document.body.append(wrapper);
  const sheet = await mount<MhSheet>('mh-sheet', { heading: 'Plafond' }, '<mh-button>Iets</mh-button>');
  wrapper.append(sheet);
  sheet.open = true;
  await settle(sheet);
  const closes = record(sheet, 'close');
  wrapper.hidden = true;
  loseFocus();
  expect(key(document.body, 'Tab').defaultPrevented).toBe(false);
  expect(key(document.body, 'Escape').defaultPrevented).toBe(false);
  expect(closes).toHaveLength(0);
});

test('opened, closed and opened again in one go, a sheet leaves nothing behind once it is closed', async () => {
  const sheet = await openSheet();
  sheet.open = false;
  sheet.open = true;
  await settle(sheet);
  sheet.open = false;
  await settle(sheet);
  loseFocus();
  expect(key(document.body, 'Tab').defaultPrevented).toBe(false);
});

test('a sheet taken off the page takes no keys from it', async () => {
  const sheet = await openSheet();
  const parent = sheet.parentNode!;
  const holder = document.createElement('div');
  holder.append(sheet);
  expect(sheet.isConnected).toBe(false);
  loseFocus();
  expect(key(document.body, 'Tab').defaultPrevented).toBe(false);
  parent.append(sheet);
});
