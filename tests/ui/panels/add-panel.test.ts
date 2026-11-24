// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { boardFromDashboard } from '../../../src/layout/board';
import { createTranslate } from '../../../src/i18n';
import type { TileLayout } from '../../../src/layout/types';
import '../../../src/ui/panels/add-panel';
import type { MhAddPanel } from '../../../src/ui/panels/add-panel';
import { deep, deepAll, deepText } from '../../helpers/deep';
import { camper } from '../../helpers/camper';
import { mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

async function panel(props: Record<string, unknown> = {}) {
  const fake = camper();
  let n = 0;
  const element = await mount<MhAddPanel>('mh-add-panel', {
    open: true, ctx: fake.ctx, sectionName: 'Klimaat', boardName: 'Overzicht', board: boardFromDashboard(fake.dashboard, 'overview'), newId: () => `t-${++n}`, ...props,
  });
  await settle(deep(element, 'mh-device-list') as never);
  const adds = record<{ tiles: TileLayout[]; name: string }>(element, 'add-tiles');
  const list = () => deep(element, 'mh-device-list');
  const row = (id: string) => list().shadowRoot!.querySelector<HTMLElement>(`[data-device="${id}"]`)!;
  const plus = (host: HTMLElement) => host.querySelector<HTMLElement>('mh-button')!;
  const expand = async (id: string) => { row(id).querySelector<HTMLElement>('.row-main')!.click(); await settle(list() as never); await settle(element); await settle(list() as never); };
  return { ...fake, element, adds, list, row, plus, expand };
}
const wait = async (element: MhAddPanel) => { await settle(element); for (const el of deepAll(element, 'mh-device-list')) await settle(el as never); };

test('the panel names the section and the dashboard', async () => {
  const { element } = await panel();
  const sheet = deep(element, 'mh-sheet') as HTMLElement & { heading: string; subheading: string };
  expect([sheet.heading, sheet.subheading]).toEqual(['Toevoegen aan Klimaat', 'Overzicht']);
});

test('the plus adds the tiles the app would choose to the section', async () => {
  const p = await panel();
  p.plus(p.row('device-13')).click();
  expect(p.adds).toEqual([{
    name: p.snapshot.devices['device-13']!.name,
    tiles: [
      { id: 't-1', spec: { kind: 'sensor', id: 't-1', deviceId: 'device-13', size: 'single', capabilityId: 'measure_temperature', showCapabilityTitle: true }, size: 'single', label: null, icon: null, source: 'device' },
      { id: 't-2', spec: { kind: 'sensor', id: 't-2', deviceId: 'device-13', size: 'single', capabilityId: 'measure_humidity', showCapabilityTitle: true }, size: 'single', label: null, icon: null, source: 'device' },
    ],
  }]);
  expect(p.plus(p.row('device-13')).getAttribute('label')).toBe(`${p.snapshot.devices['device-13']!.name} toevoegen`);
});

test('a value adds one tile from that value', async () => {
  const p = await panel();
  expect(p.row('device-3').querySelector('.row-main')!.getAttribute('aria-expanded')).toBe('false');
  await p.expand('device-3');
  expect(p.row('device-3').querySelector('.row-main')!.getAttribute('aria-expanded')).toBe('true');
  expect(deepText(p.list())).toContain('Of één waarde als eigen tegel:');
  const value = p.list().shadowRoot!.querySelector<HTMLElement>('[data-value="measure_starlink_download"]')!;
  p.plus(value).click();
  const title = p.snapshot.devices['device-3']!.capabilities['measure_starlink_download']!.title;
  expect(p.adds).toEqual([{
    name: `${p.snapshot.devices['device-3']!.name} · ${title}`,
    tiles: [{ id: 't-1', spec: { kind: 'sensor', id: 't-1', deviceId: 'device-3', size: 'single', capabilityId: 'measure_starlink_download', showCapabilityTitle: true }, size: 'single', label: null, icon: null, source: 'value' }],
  }]);
});

test('the same device can be added twice, with new ids', async () => {
  const p = await panel();
  p.plus(p.row('device-8')).click();
  p.plus(p.row('device-8')).click();
  expect(p.adds.map((a) => a.tiles[0]!.id)).toEqual(['t-1', 't-2']);
  expect(p.element.open).toBe(true);
});

test('what is in the hero is in the list as an ordinary device', async () => {
  const p = await panel();
  expect(p.row('device-9').textContent).toContain('In de blikvanger');
  p.plus(p.row('device-9')).click();
  expect(p.adds[0]!.tiles[0]!.spec).toMatchObject({ deviceId: 'device-9' });
  expect(p.row('device-1').textContent!.replace(/\s+/g, ' ')).toContain('Op dit dashboard · Verlichting');
});

test('searching narrows the list; no match says so', async () => {
  const p = await panel();
  const name = p.snapshot.devices['device-3']!.name;
  const field = deep(p.element, 'mh-text-field');
  field.dispatchEvent(new CustomEvent('input', { detail: { value: name }, bubbles: true, composed: true }));
  await wait(p.element);
  expect(p.row('device-3')).not.toBeNull();
  expect(p.list().shadowRoot!.querySelectorAll('[data-device]').length).toBeLessThan(27);
  field.dispatchEvent(new CustomEvent('input', { detail: { value: 'bestaat niet' }, bubbles: true, composed: true }));
  await wait(p.element);
  expect(deepText(p.element)).toContain('Geen apparaat met die naam.');
});

test('flows have their own list and add a flow tile', async () => {
  const p = await panel();
  deep(p.element, 'mh-choice-group').dispatchEvent(new CustomEvent('change', { detail: { value: 'flows' }, bubbles: true, composed: true }));
  await wait(p.element);
  const rows = deepAll(p.element, '[data-flow]');
  expect(rows).toHaveLength(2);
  expect(rows[0]!.textContent!.replace(/\s+/g, ' ')).toContain('Op dit dashboard · Flows');
  p.plus(rows[1]!).click();
  expect(p.adds).toEqual([{ name: 'Flow 2', tiles: [{ id: 't-1', spec: { kind: 'flow', id: 't-1', flowId: 'flow-2', flowKind: 'flow', size: 'single' }, size: 'single', label: null, icon: null, source: 'device' }] }]);
});

test('the current value of an opened device is live', async () => {
  const p = await panel();
  await p.expand('device-13');
  const shown = () => p.list().shadowRoot!.querySelector('[data-value="measure_temperature"]')!.textContent!;
  p.store.apply({ type: 'capability', deviceId: 'device-13', capabilityId: 'measure_temperature', value: 12.5, at: null });
  p.flush();
  await wait(p.element);
  expect(shown()).toContain('12,5');
});

test('the panel reports close, and follows the language', async () => {
  const p = await panel();
  const closes = record(p.element, 'close');
  deep(p.element, 'mh-sheet').dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  expect(closes).toHaveLength(1);
  p.element.ctx = { ...p.ctx, t: createTranslate('en') };
  await wait(p.element);
  expect((deep(p.element, 'mh-sheet') as HTMLElement & { heading: string }).heading).toBe('Add to Klimaat');
  expect(p.element.open).toBe(true);
});

test('the rooms are headings right under the title of the panel', async () => {
  const p = await panel();
  const list = deep(p.element, 'mh-device-list').shadowRoot!;
  expect(list.querySelectorAll('h3').length).toBeGreaterThan(0);
  expect(list.querySelectorAll('h4')).toHaveLength(0);
});

test('a button says what it is; on the app on the hub somebody without any hears how to get one', async () => {
  const flows = async (p: Awaited<ReturnType<typeof panel>>) => {
    deep(p.element, 'mh-choice-group').dispatchEvent(new CustomEvent('change', { detail: { value: 'flows' }, bubbles: true, composed: true }));
    await wait(p.element);
    return deepText(p.element);
  };
  const some = await panel();
  some.store.apply({ type: 'structure', zones: some.store.getSnapshot()!.zones, flows: [{ id: 'button:film', name: 'Film kijken', kind: 'flow', startable: true }] });
  some.flush();
  expect(await flows(some)).toContain('Knop van een flow');
  const none = await panel();
  none.state.served = true;
  none.store.apply({ type: 'structure', zones: none.store.getSnapshot()!.zones, flows: [] });
  none.flush();
  expect(await flows(none)).toContain('Er is op een dashboardknop gedrukt');
  const own = await panel();
  own.store.apply({ type: 'structure', zones: own.store.getSnapshot()!.zones, flows: [] });
  own.flush();
  expect(await flows(own)).toContain('Geen flow die je handmatig kunt starten.');
});
