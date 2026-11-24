// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import type { SectionKind } from '../../../src/dashboard/types';
import { createTranslate, t } from '../../../src/i18n';
import type { NewItem } from '../../../src/layout/reconcile';
import '../../../src/ui/panels/news-panel';
import type { MhNewsPanel } from '../../../src/ui/panels/news-panel';
import { cap, device } from '../../helpers/build';
import { deep, deepAll, deepText } from '../../helpers/deep';
import { mount, record, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

afterEach(() => { document.body.replaceChildren(); });

const items: NewItem[] = [
  { ref: 's1', kind: 'device', name: 'Bewegingssensor', zoneName: 'Hal', suggest: 'security' },
  { ref: 'flow:f1', kind: 'flow', name: 'Slaapstand', zoneName: null, suggest: 'flows' },
];
async function panel(props: Record<string, unknown> = {}) {
  const { ctx } = fakeContext([device({ id: 's1', name: 'Bewegingssensor', deviceClass: 'sensor', caps: [cap('alarm_motion', { type: 'boolean', value: false })] })]);
  const element = await mount<MhNewsPanel>('mh-news-panel', { open: true, ctx, news: items, sectionName: (kind: SectionKind) => t(`section.${kind}`), ...props });
  const row = (ref: string) => element.shadowRoot!.querySelector<HTMLElement>(`[data-ref="${ref}"]`)!;
  const button = (root: ParentNode, name: string) => deepAll(root, 'mh-button').find((b) => (b.getAttribute('label') || b.textContent!.trim()) === name)!;
  return { element, ctx, row, button };
}

test('the list has per device the suggestion and the three choices', async () => {
  const { element, row, button } = await panel();
  const sheet = deep(element, 'mh-sheet') as HTMLElement & { heading: string; subheading: string };
  expect([sheet.heading, sheet.subheading]).toEqual(['Nieuw op je Homey', '2 nieuw']);
  expect(row('s1').textContent!.replace(/\s+/g, ' ')).toContain('Hal · Voorstel: in Beveiliging');
  expect(row('s1').querySelector('mh-icon')!.getAttribute('name')).toBe('sensors');
  expect(row('flow:f1').querySelector('mh-icon')!.getAttribute('name')).toBe('play_arrow');
  const places = record(element, 'place');
  const skips = record(element, 'skip');
  button(row('s1'), 'Toevoegen').click();
  button(row('flow:f1'), 'Niet tonen').click();
  expect(places).toEqual([{ ref: 's1', sectionId: null }]);
  expect(skips).toEqual([{ ref: 'flow:f1' }]);
});

test('everything can be placed at once, and the hint says where the rest goes', async () => {
  const { element, button } = await panel();
  const all = record(element, 'place-all');
  button(element, 'Alles op de voorgestelde plek').click();
  expect(all).toHaveLength(1);
  expect(deepText(element)).toContain('Niet tonen laat een apparaat weg; je kunt het later toevoegen met "Tegel toevoegen".');
});

test('it reports close and follows the language', async () => {
  const { element, ctx } = await panel();
  const closes = record(element, 'close');
  deep(element, 'mh-sheet').dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  expect(closes).toHaveLength(1);
  element.ctx = { ...ctx, t: createTranslate('en') };
  await settle(element);
  expect((deep(element, 'mh-sheet') as HTMLElement & { heading: string }).heading).toBe('New on your Homey');
});

test('Andere plek is a second stand with the sections and a new one', async () => {
  const { element, row, button } = await panel({ sections: [{ id: 'type:lights', title: 'Verlichting', icon: 'lightbulb' }, { id: 'own:a', title: 'Binnen', icon: 'cabin' }] });
  const sheet = deep(element, 'mh-sheet') as HTMLElement & { heading: string; back: boolean };
  button(row('s1'), 'Andere plek').click();
  await settle(element);
  expect([sheet.heading, sheet.back]).toEqual(['Bewegingssensor op het Overzicht, in', true]);
  const choices = () => [...element.shadowRoot!.querySelectorAll<HTMLElement>('button.row-main')];
  expect(choices().map((c) => c.textContent!.trim())).toEqual(['Verlichting', 'Binnen', 'Een nieuwe sectie…']);
  const places = record(element, 'place');
  const sections = record(element, 'new-section');
  choices()[1]!.click();
  await settle(element);
  expect(places).toEqual([{ ref: 's1', sectionId: 'own:a' }]);
  expect(sheet.back).toBe(false);
  button(row('s1'), 'Andere plek').click();
  await settle(element);
  choices()[2]!.click();
  expect(sections).toEqual([{ ref: 's1' }]);
  await settle(element);
  button(row('s1'), 'Andere plek').click();
  await settle(element);
  sheet.dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }));
  await settle(element);
  expect(sheet.heading).toBe('Nieuw op je Homey');
});

test('the panel counts devices as devices, and devices and flows together as new', async () => {
  const under = async (news: NewItem[]) => (deep((await panel({ news })).element, 'mh-sheet') as HTMLElement & { subheading: string }).subheading;
  expect(await under([items[0]!, { ...items[0]!, ref: 's2' }])).toBe('2 apparaten');
  expect(await under(items)).toBe('2 nieuw');
});

const focused = (): Element | null => { let active = document.activeElement; while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement; return active; };

test('after placing one the focus goes to the next, so the panel can still be closed with Escape', async () => {
  const p = await panel({ news: [items[0]!, { ...items[0]!, ref: 's2', name: 'Tweede' }] });
  const closes = record(p.element, 'close');
  const add = p.button(p.row('s1'), 'Toevoegen');
  add.focus();
  add.click();
  p.element.news = [{ ...items[0]!, ref: 's2', name: 'Tweede' }];
  await settle(p.element);
  expect((focused()!.getRootNode() as ShadowRoot).host).toBe(p.button(p.row('s2'), 'Toevoegen'));
  focused()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
  expect(closes).toHaveLength(1);
});
