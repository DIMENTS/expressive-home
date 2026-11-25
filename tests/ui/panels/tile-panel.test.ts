// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { tilesFor } from '../../../src/dashboard/classify';
import { createTranslate } from '../../../src/i18n';
import type { Device } from '../../../src/homey/types';
import type { TileLayout } from '../../../src/layout/types';
import '../../../src/ui/tiles/index';
import '../../../src/ui/panels/tile-panel';
import type { MhTilePanel } from '../../../src/ui/panels/tile-panel';
import { climate, dimLamp, dish, plug, tank } from '../../dashboard/samples';
import { deep, deepAll, deepText } from '../../helpers/deep';
import { camperSnapshot } from '../../helpers/fake-hub';
import { tileLayout } from '../../helpers/layout';
import { mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const rgbw = () => camperSnapshot().devices['device-1']!;
const tileOf = (device: Device, partial: Partial<TileLayout> = {}) => tileLayout(tilesFor(device)[0]!, { id: 't-1', ...partial });
type Patch = { patch: Partial<TileLayout>; typing?: boolean };

async function panel(device: Device, tile = tileOf(device), props: Record<string, unknown> = {}) {
  const element = await mount<MhTilePanel>('mh-tile-panel', { open: true, tile, device, sectionName: 'Verlichting', ...props });
  await settle(element);
  const patches = record<Patch>(element, 'set-tile');
  const group = (title: string) => [...element.shadowRoot!.querySelectorAll('section')].find((s) => s.querySelector('h3')?.textContent === title);
  const titles = () => [...element.shadowRoot!.querySelectorAll('h3')].map((h) => h.textContent);
  const choose = (host: Element, value: string) => host.dispatchEvent(new CustomEvent('change', { detail: { value }, bubbles: true, composed: true }));
  const options = (title: string) => (group(title)!.querySelector('mh-radio-list') as HTMLElement & { options: { id: string; label: string }[]; value: string });
  const apply = async (patch: Partial<TileLayout>) => { element.tile = { ...element.tile!, ...patch }; await settle(element); };
  return { element, patches, group, titles, choose, options, apply };
}
const sheet = (element: MhTilePanel) => deep(element, 'mh-sheet') as HTMLElement & { heading: string; subheading: string; back: boolean };

test('the RGBW lamp lets the slider take the white dim level', async () => {
  const p = await panel(rgbw());
  expect(p.options('De schuif regelt').options.map((o) => o.id)).toEqual(['dim', 'dim.white']);
  expect(p.options('De schuif regelt').options[1]!.label).toMatch(new RegExp(`^${rgbw().capabilities['dim.white']!.title} · `));
  expect(p.options('De schuif regelt').value).toBe('dim');
  p.choose(p.options('De schuif regelt'), 'dim.white');
  expect(p.patches).toEqual([{ patch: { spec: { ...tileOf(rgbw()).spec, dimCapabilityId: 'dim.white' } } }]);
});

test('a tap can switch the white mode instead', async () => {
  const p = await panel(rgbw());
  expect(p.options('Een tik op de tegel').options.map((o) => o.label)).toEqual(['Zet aan of uit', `${rgbw().capabilities['onoff.whitemode']!.title} aan of uit`]);
  p.choose(p.options('Een tik op de tegel'), 'onoff.whitemode');
  expect(p.patches).toEqual([{ patch: { spec: { ...tileOf(rgbw()).spec, onoffCapabilityId: 'onoff.whitemode' } } }]);
});

test('a sensor with two values lets you choose the big one', async () => {
  const p = await panel(climate);
  expect(p.options('Grote waarde').options.map((o) => o.id)).toEqual(['measure_temperature', 'measure_humidity']);
  p.choose(p.options('Grote waarde'), 'measure_humidity');
  expect(p.patches).toEqual([{ patch: { spec: { ...tileOf(climate).spec, capabilityId: 'measure_humidity' } } }]);
});

test('a sensor tile can have its history behind the value, narrow or wide', async () => {
  const narrow = await panel(climate);
  expect(narrow.titles()).toContain('Verloop');
  const p = await panel(climate, tileOf(climate, { size: 'wide' }));
  const toggle = p.group('Verloop')!.querySelector('mh-switch') as HTMLElement & { checked: boolean; label: string };
  expect([toggle.label, toggle.checked]).toEqual(['Verloop achter de waarde', false]);
  toggle.dispatchEvent(new CustomEvent('change', { detail: { checked: true }, bubbles: true, composed: true }));
  expect(p.patches).toEqual([{ patch: { spec: { ...tileOf(climate).spec, trend: true } } }]);
});

test('a switch can show another side value, or none', async () => {
  const p = await panel(plug);
  expect(p.options('Bijwaarde').options.map((o) => o.label)).toEqual(['measure_power · 45', 'Geen']);
  expect(p.options('Bijwaarde').value).toBe('measure_power');
  p.choose(p.options('Bijwaarde'), 'none');
  expect(p.patches).toEqual([{ patch: { spec: { ...tileOf(plug).spec, detailCapabilityId: null } } }]);
});

test('a multi-value tile takes three values in the order they are ticked', async () => {
  const p = await panel(dish);
  const boxes = () => [...p.group('Waarden op de tegel (drie)')!.querySelectorAll<HTMLElement>('[role="checkbox"]')];
  expect(boxes().map((b) => [b.getAttribute('aria-checked'), b.getAttribute('aria-disabled')])).toEqual([['true', null], ['true', null], ['true', null], ['false', 'true']]);
  boxes()[3]!.click();
  expect(p.patches).toEqual([]);
  boxes()[0]!.click();
  const two = { ...tileOf(dish).spec, capabilityIds: ['measure_upload', 'measure_latency'] } as TileLayout['spec'];
  expect(p.patches).toEqual([{ patch: { spec: two } }]);
  await p.apply({ spec: two });
  boxes()[3]!.click();
  const three = { ...two, capabilityIds: ['measure_upload', 'measure_latency', 'measure_obstruction'] } as TileLayout['spec'];
  expect(p.patches.at(-1)).toEqual({ patch: { spec: three } });
  // the last one cannot be taken away: a tile needs a value
  await p.apply({ spec: { ...two, capabilityIds: ['measure_upload'] } as TileLayout['spec'] });
  expect(boxes().find((b) => b.getAttribute('aria-checked') === 'true')!.getAttribute('aria-disabled')).toBe('true');
  expect(deepText(p.element)).toContain('Altijd breed: drie waarden passen niet in een smalle tegel.');
});

test('a plain lamp shows no slider group', async () => {
  const p = await panel(dimLamp);
  expect(p.titles()).toEqual(['Naam op de tegel', 'Icoon', 'Formaat']);
  expect((await panel(tank)).titles()).toEqual(['Naam op de tegel', 'Icoon', 'Formaat']);
});

test('an own name shows on the tile at once; empty goes back to the Homey name', async () => {
  const p = await panel(dimLamp);
  const field = p.group('Naam op de tegel')!.querySelector('mh-text-field') as HTMLElement & { value: string; placeholder: string; help: string };
  expect([field.value, field.placeholder, field.help]).toEqual(['', 'Plafond', 'Leeg laten volgt de naam in je Homey (Plafond).']);
  expect([sheet(p.element).heading, sheet(p.element).subheading]).toEqual(['Plafond', 'Tegel in Verlichting']);
  field.dispatchEvent(new CustomEvent('input', { detail: { value: 'Boven' }, bubbles: true, composed: true }));
  field.dispatchEvent(new CustomEvent('input', { detail: { value: '' }, bubbles: true, composed: true }));
  expect(p.patches).toEqual([{ patch: { label: 'Boven' }, typing: true }, { patch: { label: null }, typing: true }]);
  await p.apply({ label: 'Boven' });
  expect(sheet(p.element).heading).toBe('Boven');
});

test('choosing an icon and going back to Automatisch', async () => {
  const p = await panel(dimLamp);
  const row = () => p.group('Icoon')!;
  expect(deepText(row())).toContain('Automatisch');
  expect(deepText(row())).toContain('Het icoon dat de app bij dit apparaat kiest');
  row().querySelector<HTMLElement>('mh-button')!.click();
  await settle(p.element);
  expect([sheet(p.element).heading, sheet(p.element).back]).toEqual(['Icoon kiezen', true]);
  const picker = deep(p.element, 'mh-icon-picker') as HTMLElement & { value: string | null; auto: string };
  expect([picker.value, picker.auto]).toEqual([null, 'lightbulb']);
  picker.dispatchEvent(new CustomEvent('change', { detail: { icon: 'bed' }, bubbles: true, composed: true }));
  expect(p.patches).toEqual([{ patch: { icon: 'bed' } }]);
  await p.apply({ icon: 'bed' });
  sheet(p.element).dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }));
  await settle(p.element);
  expect(deepText(row())).toContain('Eigen icoon');
  expect(deepText(row())).toContain('Zelf gekozen uit de bibliotheek');
  row().querySelector<HTMLElement>('mh-button')!.click();
  await settle(p.element);
  deep(p.element, 'mh-icon-picker').dispatchEvent(new CustomEvent('change', { detail: { icon: null }, bubbles: true, composed: true }));
  expect(p.patches.at(-1)).toEqual({ patch: { icon: null } });
});

test('the size, and removing the tile', async () => {
  const p = await panel(dimLamp);
  const size = p.group('Formaat')!.querySelector('mh-choice-group') as HTMLElement & { value: string; options: { label: string }[] };
  expect([size.value, size.options.map((o) => o.label)]).toEqual(['wide', ['Enkel, zonder schuif', 'Breed, met schuif']]);
  p.choose(size, 'single');
  expect(p.patches).toEqual([{ patch: { size: 'single' } }]);
  const removes = record(p.element, 'remove');
  deepAll(p.element, 'mh-button').find((b) => b.textContent!.includes('Tegel weghalen'))!.click();
  expect(removes).toHaveLength(1);
});

test('switching the language keeps the panel open', async () => {
  const p = await panel(rgbw());
  p.element.t = createTranslate('en');
  await settle(p.element);
  expect(p.element.open).toBe(true);
  expect(p.titles()).toEqual(['Name on the tile', 'Icon', 'The slider controls', 'A tap on the tile', 'Size']);
});

test('opening the panel again starts at the settings, not at the icons', async () => {
  const p = await panel(dimLamp);
  p.group('Icoon')!.querySelector<HTMLElement>('mh-button')!.click();
  await settle(p.element);
  p.element.open = false;
  await settle(p.element);
  p.element.open = true;
  await settle(p.element);
  expect(sheet(p.element).back).toBe(false);
  expect(p.titles()).toContain('Naam op de tegel');
});
