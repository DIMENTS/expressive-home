// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { createTranslate } from '../../../src/i18n';
import '../../../src/ui/panels/name-icon-dialog';
import type { MhNameIconDialog } from '../../../src/ui/panels/name-icon-dialog';
import { deep, deepAll, deepText } from '../../helpers/deep';
import { key, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

async function dialog(props: Record<string, unknown> = {}) {
  const element = await mount<MhNameIconDialog>('mh-name-icon-dialog', {
    heading: 'Sectie toevoegen', confirmLabel: 'Toevoegen', name: '', namePlaceholder: 'Bijvoorbeeld Buiten', icon: 'view_agenda', autoIcon: null, kindChoice: 'section', heroTaken: false, ...props,
  });
  element.open = true;
  await settle(element);
  const confirms = record<{ kind: string; name: string | null; icon: string | null }>(element, 'confirm');
  const cancels = record(element, 'cancel');
  const button = (text: string) => deepAll(element, 'mh-button').find((b) => b.textContent!.trim() === text)!;
  const type = (value: string) => deep(element, 'mh-text-field').dispatchEvent(new CustomEvent('input', { detail: { value }, bubbles: true, composed: true }));
  const pick = async (icon: string | null) => { deep(element, 'mh-icon-picker').dispatchEvent(new CustomEvent('change', { detail: { icon }, bubbles: true, composed: true })); await settle(element); };
  return { element, confirms, cancels, button, type, pick };
}

test('it asks for a name and an icon, and reports both', async () => {
  const d = await dialog();
  expect(deep(d.element, 'mh-dialog').getAttribute('heading')).toBe('Sectie toevoegen');
  expect(deep(d.element, '[role="dialog"]').getAttribute('aria-modal')).toBe('true');
  expect((deep(d.element, 'mh-text-field') as HTMLElement & { placeholder: string }).placeholder).toBe('Bijvoorbeeld Buiten');
  d.type('Buiten');
  await d.pick('park');
  d.button('Toevoegen').click();
  expect(d.confirms).toEqual([{ kind: 'own', name: 'Buiten', icon: 'park' }]);
});

test('an empty name is no name', async () => {
  const d = await dialog({ name: 'Oud' });
  d.type('   ');
  d.button('Toevoegen').click();
  expect(d.confirms[0]).toMatchObject({ name: null });
});

test('Enter in the name field confirms', async () => {
  const d = await dialog({ name: 'Buiten' });
  deep(d.element, 'mh-text-field').dispatchEvent(new CustomEvent('submit', { bubbles: true, composed: true }));
  expect(d.confirms).toEqual([{ kind: 'own', name: 'Buiten', icon: 'view_agenda' }]);
});

test('the kind can be the hero; then there is no name or icon to give', async () => {
  const d = await dialog();
  const kinds = deep(d.element, 'mh-choice-group') as HTMLElement & { options: { id: string; label: string; disabled?: boolean }[] };
  expect(kinds.options.map((o) => [o.label, o.disabled ?? false])).toEqual([['Eigen sectie', false], ['Blikvanger', false]]);
  kinds.dispatchEvent(new CustomEvent('change', { detail: { value: 'hero' }, bubbles: true, composed: true }));
  await settle(d.element);
  expect(deepAll(d.element, 'mh-icon-picker')).toHaveLength(0);
  d.button('Toevoegen').click();
  expect(d.confirms).toEqual([{ kind: 'hero', name: null, icon: null }]);
});

test('the hero choice is disabled when the board has a hero, with the reason', async () => {
  const d = await dialog({ heroTaken: true });
  const option = deep(d.element, '[data-id="hero"]');
  expect(option.getAttribute('aria-disabled')).toBe('true');
  option.click();
  await settle(d.element);
  expect(deepAll(d.element, 'mh-icon-picker')).toHaveLength(1);
  expect(deepText(d.element)).toContain('Er staat al een blikvanger op dit dashboard.');
});

test('without a kind to choose there is only the name and the icon, with Automatisch for a section of the app', async () => {
  const d = await dialog({ kindChoice: 'none', heading: 'Naam en icoon', confirmLabel: 'Bewaren', icon: 'bed', autoIcon: 'lightbulb' });
  expect(deepAll(d.element, 'mh-choice-group')).toHaveLength(0);
  expect((deep(d.element, 'mh-icon-picker') as HTMLElement & { auto: string; value: string })).toMatchObject({ auto: 'lightbulb', value: 'bed' });
  await d.pick(null);
  d.button('Bewaren').click();
  expect(d.confirms).toEqual([{ kind: 'own', name: null, icon: null }]);
});

test('it starts anew each time it opens', async () => {
  const d = await dialog({ name: 'Buiten' });
  d.type('Anders');
  await d.pick('bed');
  d.element.open = false;
  await settle(d.element);
  d.element.open = true;
  await settle(d.element);
  d.button('Toevoegen').click();
  expect(d.confirms).toEqual([{ kind: 'own', name: 'Buiten', icon: 'view_agenda' }]);
});

test('the dialog keeps the focus inside and Escape cancels', async () => {
  const outside = document.createElement('button');
  document.body.append(outside);
  outside.focus();
  const d = await dialog();
  const focused = (): Element | null => { let active = document.activeElement; while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement; return active; };
  expect(focused()?.tagName).toBe('INPUT');
  key(focused()!, 'Escape');
  expect(d.cancels).toHaveLength(1);
  d.element.open = false;
  await settle(d.element);
  await settle(deep(d.element, 'mh-dialog') as never);
  expect(focused()).toBe(outside);
  d.button('Annuleren').click();
  expect(d.cancels).toHaveLength(2);
});

test('the text follows the language', async () => {
  const d = await dialog({ t: createTranslate('en') });
  expect(deepText(d.element)).toContain('Own section');
  expect(d.button('Cancel')).toBeDefined();
});

test('while it fades out it keeps what it showed, and the next time it starts afresh', async () => {
  const d = await dialog({ heading: 'Naam en icoon', kindChoice: 'none', confirmLabel: 'Bewaren', name: 'Buiten' });
  const picker = deep(d.element, 'mh-icon-picker');
  Object.assign(d.element, { open: false, heading: 'Sectie toevoegen', text: 'Anders', kindChoice: 'section', confirmLabel: 'Toevoegen', name: '', namePlaceholder: 'x', autoIcon: 'bed' });
  await settle(d.element);
  expect(deep(d.element, 'mh-dialog').getAttribute('heading')).toBe('Naam en icoon');
  expect(deepAll(d.element, 'mh-choice-group')).toHaveLength(0);
  expect(deep(d.element, 'mh-icon-picker')).toBe(picker);
  expect(deepText(d.element)).not.toContain('Anders');
  expect(d.button('Bewaren')).toBeDefined();
  d.element.open = true;
  await settle(d.element);
  expect(deep(d.element, 'mh-dialog').getAttribute('heading')).toBe('Sectie toevoegen');
  expect(deepAll(d.element, 'mh-choice-group')).toHaveLength(1);
  expect(deep(d.element, 'mh-icon-picker')).not.toBe(picker);
});

test('the dialog keeps its height while searching an icon', () => {
  const css = (customElements.get('mh-name-icon-dialog') as unknown as { styles: { cssText?: string }[] }).styles.map((part) => part.cssText ?? '').join('\n');
  expect(css).toMatch(/\.scroll\s*\{[^}]*[ {]height:\s*var\(--icon-scroll-height\)/);
});
