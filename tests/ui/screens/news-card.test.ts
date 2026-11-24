// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import type { SectionKind } from '../../../src/dashboard/types';
import { createTranslate, t } from '../../../src/i18n';
import type { GoneItem, NewItem } from '../../../src/layout/reconcile';
import '../../../src/ui/screens/news-card';
import type { MhNewsCard } from '../../../src/ui/screens/news-card';
import { deepAll } from '../../helpers/deep';
import { mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const sensor: NewItem = { ref: 's1', kind: 'device', name: 'Bewegingssensor', zoneName: 'Hal', suggest: 'security' };
const loose: NewItem = { ref: 's2', kind: 'device', name: 'Luchtkwaliteit', zoneName: null, suggest: 'climate' };
const flow: NewItem = { ref: 'flow:f1', kind: 'flow', name: 'Slaapstand', zoneName: null, suggest: 'flows' };
const gone: GoneItem = { ref: 'd1', name: 'Luifel', boards: ['overview', 'd-buiten'], heroFallback: false };

const card = (props: Record<string, unknown> = {}) => mount<MhNewsCard>('mh-news-card', {
  news: [], gone: [], sectionName: (kind: SectionKind) => t(`section.${kind}`), boardName: (id: string) => (id === 'overview' ? 'Overzicht' : 'Buiten'), ...props,
});
const text = (host: MhNewsCard) => host.shadowRoot!.textContent!.replace(/\s+/g, ' ').trim();
const button = (host: MhNewsCard, name: string) => deepAll(host, 'mh-button').find((b) => b.textContent!.trim() === name)!;

test('one new device shows its name, zone and suggestion with three choices', async () => {
  const host = await card({ news: [sensor] });
  expect(text(host)).toContain('Nieuw op je Homey: Bewegingssensor');
  expect(text(host)).toContain('Hal · Voorstel: in Beveiliging');
  const places = record(host, 'place');
  const skips = record(host, 'skip');
  button(host, 'Toevoegen').click();
  button(host, 'Niet tonen').click();
  expect(places).toEqual([{ ref: 's1', sectionId: null }]);
  expect(skips).toEqual([{ ref: 's1' }]);
});

test('a device without a room names only the suggestion; a flow goes to Flows', async () => {
  const host = await card({ news: [loose] });
  expect(text(host)).toContain('Voorstel: in Klimaat');
  expect(text(host)).not.toContain('· Voorstel');
  host.news = [flow];
  await settle(host);
  expect(text(host)).toContain('Nieuw op je Homey: Slaapstand');
  expect(text(host)).toContain('Voorstel: in Flows');
});

test('several new devices make one notice that opens the list', async () => {
  const host = await card({ news: [sensor, loose, flow] });
  expect(text(host)).toContain('3 nieuw op je Homey');
  expect(text(host)).toContain('Bewegingssensor, Luchtkwaliteit en Slaapstand');
  expect(deepAll(host, '.card')).toHaveLength(1);
  const views = record(host, 'view-all');
  button(host, 'Bekijken').click();
  expect(views).toHaveLength(1);
});

test('a gone device says which dashboards lost a tile; OK removes the card', async () => {
  const host = await card({ gone: [gone] });
  expect(text(host)).toContain('Luifel staat niet meer op je Homey');
  expect(text(host)).toContain('De tegel is van je dashboards gehaald (Overzicht en Buiten).');
  expect(host.shadowRoot!.querySelector('.card')!.getAttribute('role')).toBe('status');
  const oks = record(host, 'gone-ok');
  button(host, 'OK').click();
  expect(oks).toHaveLength(1);
  host.gone = [];
  await settle(host);
  expect(deepAll(host, '.card')).toHaveLength(0);
});

test('several gone devices share one card, before what is new', async () => {
  const host = await card({ gone: [gone, { ref: 'd2', name: 'Pomp', boards: ['d-buiten'], heroFallback: false }], news: [sensor] });
  const cards = deepAll(host, '.card');
  expect(cards).toHaveLength(2);
  expect(cards[0]!.textContent).toContain('Luifel staat niet meer op je Homey');
  expect(cards[0]!.textContent).toContain('Pomp staat niet meer op je Homey');
  expect(deepAll(cards[0]!, 'mh-button')).toHaveLength(1);
  expect(cards[1]!.textContent).toContain('Bewegingssensor');
});

test('a gone hero value says the hero chooses again', async () => {
  const host = await card({ gone: [{ ...gone, heroFallback: true }] });
  expect(text(host)).toContain('De blikvanger kiest weer zelf.');
});

test('names are shown as text, and the card follows the language', async () => {
  const host = await card({ news: [{ ...sensor, name: '<b>x</b>' }], t: createTranslate('en') });
  expect(text(host)).toContain('New on your Homey: <b>x</b>');
});

test('Andere plek lists the sections of the overview', async () => {
  const host = await card({ news: [sensor], sections: [{ id: 'type:lights', title: 'Verlichting', icon: 'lightbulb' }, { id: 'own:a', title: 'Binnen', icon: 'cabin' }] });
  const menu = () => host.shadowRoot!.querySelector('mh-menu') as HTMLElement & { open: boolean; label: string; groups: { title: string; items: { label: string; icon: string }[] }[] };
  expect(menu().open).toBe(false);
  button(host, 'Andere plek').click();
  await settle(host);
  expect(menu().open).toBe(true);
  expect(menu().groups.map((g) => [g.title, g.items.map((i) => i.label)])).toEqual([['Bewegingssensor op het Overzicht, in', ['Verlichting', 'Binnen']], ['', ['Een nieuwe sectie…']]]);
  const places = record(host, 'place');
  const sections = record(host, 'new-section');
  const choose = (group: string, id: string) => menu().dispatchEvent(new CustomEvent('select', { detail: { group, id }, bubbles: true, composed: true }));
  choose('section', 'own:a');
  await settle(host);
  expect(places).toEqual([{ ref: 's1', sectionId: 'own:a' }]);
  expect(menu().open).toBe(false);
  button(host, 'Andere plek').click();
  await settle(host);
  choose('new', 'new');
  expect(sections).toEqual([{ ref: 's1' }]);
  button(host, 'Andere plek').click();
  await settle(host);
  menu().dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  await settle(host);
  expect(menu().open).toBe(false);
});

test('something new that is not only devices is not called devices', async () => {
  expect(text(await card({ news: [sensor, loose] }))).toContain('2 nieuwe apparaten op je Homey');
  expect(text(await card({ news: [sensor, flow] }))).toContain('2 nieuw op je Homey');
});
