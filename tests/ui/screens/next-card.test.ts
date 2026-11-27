// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { createTranslate } from '../../../src/i18n';
import '../../../src/ui/screens/next-card';
import type { MhNextCard } from '../../../src/ui/screens/next-card';
import { record } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

async function card(props: Partial<MhNextCard>) {
  const element = document.createElement('mh-next-card') as MhNextCard;
  Object.assign(element, { t: createTranslate('nl'), steps: ['edit', 'widget', 'wall', 'pair', 'away'], done: [] }, props);
  document.body.append(element);
  await element.updateComplete;
  return element;
}

const rows = (element: MhNextCard) => [...element.shadowRoot!.querySelectorAll<HTMLButtonElement>('button.step')];

test('a card with a title, a line and one button per step, each saying whether it is done', async () => {
  const element = await card({ done: ['pair'] });
  expect(element.shadowRoot!.querySelector('h2')!.textContent).toBe('Verder inrichten');
  expect(rows(element).map((row) => [row.dataset['step'], row.querySelector('.name')!.textContent!.trim(), row.hasAttribute('data-done')])).toEqual([
    ['edit', 'Tegels en secties aanpassen', false], ['widget', 'Een widget toevoegen', false], ['wall', 'Een wandtablet instellen', false],
    ['pair', 'Nog een apparaat koppelen', true], ['away', 'Onderweg kijken', false],
  ]);
  // the name, and whether it is done, is what a screen reader names; the line under it describes it
  const named = (row: HTMLElement, attribute: string) => row.getAttribute(attribute)!.split(' ').map((id) => element.shadowRoot!.getElementById(id)!.textContent!.trim()).join(' ');
  expect([named(rows(element)[3]!, 'aria-labelledby'), named(rows(element)[3]!, 'aria-describedby')]).toEqual(['Nog een apparaat koppelen , gedaan', 'Een telefoon, tablet of laptop']);
  expect([named(rows(element)[0]!, 'aria-labelledby'), rows(element)[0]!.hasAttribute('aria-label')]).toEqual(['Tegels en secties aanpassen', false]);
});

test('a step reports itself; the cross, called Weghalen, takes the card away', async () => {
  const element = await card({});
  const steps = record<{ step: string }>(element, 'next-step');
  const away = record(element, 'next-dismiss');
  rows(element)[2]!.click();
  expect(steps).toEqual([{ step: 'wall' }]);
  const close = element.shadowRoot!.querySelector<HTMLElement & { label: string }>('mh-button.close')!;
  expect(close.label).toBe('Weghalen');
  close.click();
  expect(away).toHaveLength(1);
});

test('on a phone only what a phone can do, with a line about the rest; all done says so, with Klaar', async () => {
  const phone = await card({ steps: ['pair', 'away'], phone: true });
  expect(rows(phone)).toHaveLength(2);
  expect(phone.shadowRoot!.textContent).toContain('Op een tablet of laptop kun je je dashboard verder aanpassen.');
  const all = await card({ steps: ['pair', 'away'], done: ['pair', 'away'] });
  expect(all.shadowRoot!.textContent).toContain('Alles gedaan.');
  const away = record(all, 'next-dismiss');
  [...all.shadowRoot!.querySelectorAll<HTMLElement>('mh-button')].find((b) => b.textContent!.trim() === 'Klaar')!.click();
  expect(away).toHaveLength(1);
});
