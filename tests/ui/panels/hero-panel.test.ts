// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { pickHero } from '../../../src/dashboard/hero';
import { createTranslate } from '../../../src/i18n';
import { boardFromDashboard } from '../../../src/layout/board';
import type { HeroChoice } from '../../../src/layout/types';
import '../../../src/ui/panels/hero-panel';
import type { MhHeroPanel } from '../../../src/ui/panels/hero-panel';
import { cap, device } from '../../helpers/build';
import { camper } from '../../helpers/camper';
import { deep, deepAll, deepText } from '../../helpers/deep';
import { key, mount, record, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

afterEach(() => { document.body.replaceChildren(); });

const ref = (deviceId: string, capabilityId: string) => ({ deviceId, capabilityId });
const FROM_AUTO: HeroChoice = {
  main: ref('device-9', 'measure_battery'), line: ref('device-9', 'time_to_go'),
  stats: [ref('device-22', 'measure_power'), ref('device-23', 'measure_power'), ref('device-23', 'ac_input_source'), { net: true }], name: null,
};
const TANK: HeroChoice = { main: ref('device-4', 'tank_level'), line: null, stats: [ref('device-13', 'measure_temperature')], name: null };

async function panel(choice: HeroChoice | null, props: Record<string, unknown> = {}) {
  const fake = camper();
  const element = await mount<MhHeroPanel>('mh-hero-panel', {
    ctx: fake.ctx, choice, automatic: pickHero(fake.snapshot, 'nl'), board: boardFromDashboard(fake.dashboard, 'overview'), boardName: 'Overzicht', ...props,
  });
  element.open = true;
  await settle(element);
  const sets = record<{ hero: HeroChoice | null; typing?: boolean }>(element, 'set-hero');
  const mode = () => element.shadowRoot!.querySelector('mh-choice-group') as HTMLElement & { value: string; options: { label: string }[] };
  const chooseMode = async (value: string) => { mode().dispatchEvent(new CustomEvent('change', { detail: { value }, bubbles: true, composed: true })); await settle(element); };
  const group = (title: string) => [...element.shadowRoot!.querySelectorAll('section')].find((s) => s.querySelector('h3')?.textContent === title)!;
  const press = async (root: ParentNode, text: string) => { deepAll(root, 'mh-button').find((b) => (b.getAttribute('label') || b.textContent!.trim()) === text)!.click(); await settle(element); await settle(element); };
  const sheet = () => deep(element, 'mh-sheet') as HTMLElement & { heading: string; subheading: string; back: boolean };
  const pick = async (deviceId: string, capabilityId: string) => { deep(element, 'mh-device-list').dispatchEvent(new CustomEvent('choose', { detail: { deviceId, capabilityId }, bubbles: true, composed: true })); await settle(element); };
  const apply = async (next: HeroChoice | null) => { element.choice = next; await settle(element); };
  return { ...fake, element, sets, mode, chooseMode, group, press, sheet, pick, apply };
}

/** The names of the buttons that take a box away. */
const removeLabels = (root: ParentNode) => deepAll(root, 'mh-button').flatMap((b) => (/^Vakje .+ weghalen$/.test(b.getAttribute('label') ?? '') ? [b.getAttribute('label')!] : []));

test('automatic explains itself and shows no choices', async () => {
  const p = await panel(null);
  expect([p.sheet().heading, p.sheet().subheading]).toEqual(['Blikvanger instellen', 'Overzicht']);
  expect([p.mode().value, p.mode().options.map((o) => o.label)]).toEqual(['auto', ['Automatisch', 'Zelf kiezen']]);
  expect(deepText(p.element)).toContain('De blikvanger kiest nu zelf, zoals bij de eerste keer.');
  expect(p.group('Groot getal')).toBeUndefined();
});

test('Zelf kiezen starts with what the automatic hero shows', async () => {
  const p = await panel(null);
  await p.chooseMode('own');
  expect(p.sets).toEqual([{ hero: FROM_AUTO }]);
});

test('Automatisch sets the choice back to null', async () => {
  const p = await panel(TANK);
  expect(p.mode().value).toBe('own');
  await p.chooseMode('auto');
  expect(p.sets).toEqual([{ hero: null }]);
});

test('a hub with nothing for an automatic hero first asks for the big number', async () => {
  const p = await panel(null, { automatic: null });
  await p.chooseMode('own');
  expect(p.sets).toEqual([]);
  expect(p.sheet().heading).toBe('Kies een waarde');
  await p.pick('device-4', 'tank_level');
  expect(p.sets).toEqual([{ hero: { main: ref('device-4', 'tank_level'), line: null, stats: [], name: null } }]);
});

test('choosing the clean-water level as the big number shows the wave', async () => {
  const p = await panel(FROM_AUTO);
  expect(deepText(p.group('Groot getal'))).toContain('met de golvende lijn');
  await p.press(p.group('Groot getal'), 'Wijzigen');
  expect([p.sheet().heading, p.sheet().subheading, p.sheet().back]).toEqual(['Kies een waarde', 'Het grote getal in de blikvanger', true]);
  await p.pick('device-4', 'tank_level');
  expect(p.sets).toEqual([{ hero: { ...FROM_AUTO, main: ref('device-4', 'tank_level') } }]);
  expect(p.sheet().heading).toBe('Blikvanger instellen');
  await p.apply({ ...FROM_AUTO, main: ref('device-4', 'tank_level') });
  expect(deepText(p.group('Groot getal'))).toContain(p.snapshot.devices['device-4']!.name);
  await p.apply({ ...FROM_AUTO, main: ref('device-22', 'measure_power') });
  expect(deepText(p.group('Groot getal'))).not.toContain('met de golvende lijn');
});

test('the big number offers only values with a number', async () => {
  const p = await panel(FROM_AUTO);
  const list = () => deep(p.element, 'mh-device-list') as HTMLElement & { numericOnly: boolean; mode: string };
  await p.press(p.group('Groot getal'), 'Wijzigen');
  expect([list().mode, list().numericOnly]).toEqual(['choose', true]);
  list().shadowRoot!.querySelector<HTMLElement>('[data-device="device-11"] .row-main')!.click();
  await settle(list() as never);
  const shown = [...list().shadowRoot!.querySelectorAll<HTMLElement>('[data-value]')].map((v) => v.dataset['value']);
  expect(shown).toEqual(['viewers']);
  p.sheet().dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }));
  await settle(p.element);
  await p.press(p.group('Vakjes (hooguit vier)'), removeLabels(p.group('Vakjes (hooguit vier)'))[0]!);
  await p.apply({ ...FROM_AUTO, stats: [] });
  await p.press(p.group('Vakjes (hooguit vier)'), 'Vakje toevoegen');
  expect(list().numericOnly).toBe(false);
  list().shadowRoot!.querySelector<HTMLElement>('[data-device="device-1"] .row-main')!.click();
  await settle(list() as never);
  const values = [...list().shadowRoot!.querySelectorAll<HTMLElement>('[data-value]')].map((v) => v.dataset['value']);
  expect(values).toContain('onoff');
  // a button shows nothing
  expect(values).not.toContain('button.enable_ble_script');
});

test('the line can be added, changed and removed', async () => {
  const p = await panel(TANK);
  await p.press(p.group('Regel eronder'), 'Regel toevoegen');
  expect(p.sheet().subheading).toBe('De regel onder het getal');
  await p.pick('device-4', 'measure_content_volume');
  expect(p.sets.at(-1)).toEqual({ hero: { ...TANK, line: ref('device-4', 'measure_content_volume') } });
  await p.apply({ ...TANK, line: ref('device-4', 'measure_content_volume') });
  await p.press(p.group('Regel eronder'), 'Regel weghalen');
  expect(p.sets.at(-1)).toEqual({ hero: { ...TANK, line: null } });
});

test('a stat can be added, also net charging as long as the hub has both', async () => {
  const p = await panel(TANK);
  await p.press(p.group('Vakjes (hooguit vier)'), 'Vakje toevoegen');
  const net = p.element.shadowRoot!.querySelector<HTMLElement>('[data-net]')!;
  expect(net.textContent).toContain('Netto laden');
  await p.press(net, 'Kiezen');
  expect(p.sets).toEqual([{ hero: { ...TANK, stats: [...TANK.stats, { net: true }] } }]);
  await p.apply({ ...TANK, stats: [...TANK.stats, { net: true }] });
  await p.press(p.group('Vakjes (hooguit vier)'), 'Vakje toevoegen');
  expect(p.element.shadowRoot!.querySelector('[data-net]')).toBeNull();
  document.body.replaceChildren();
  const without = await panel(TANK, { automatic: null });
  await without.press(without.group('Vakjes (hooguit vier)'), 'Vakje toevoegen');
  expect(without.element.shadowRoot!.querySelector('[data-net]')).toBeNull();
});

test('a fifth stat cannot be added', async () => {
  const p = await panel(FROM_AUTO);
  expect(p.group('Vakjes (hooguit vier)').querySelectorAll('.stat')).toHaveLength(4);
  expect(deepText(p.group('Vakjes (hooguit vier)'))).not.toContain('Vakje toevoegen');
});

test('stats can be reordered and removed', async () => {
  const p = await panel(FROM_AUTO);
  const rows = () => [...p.group('Vakjes (hooguit vier)').querySelectorAll<HTMLElement>('.stat')];
  expect(rows()[3]!.textContent).toContain('Netto laden');
  const grip = rows()[1]!.querySelector<HTMLElement>('.grip')!;
  expect(grip.getAttribute('aria-label')).toMatch(/^Verplaats /);
  key(grip, 'ArrowUp');
  const [solar, use, shore, net] = FROM_AUTO.stats;
  expect(p.sets.at(-1)).toEqual({ hero: { ...FROM_AUTO, stats: [use, solar, shore, net] } });
  key(rows()[0]!.querySelector<HTMLElement>('.grip')!, 'ArrowUp');
  expect(p.sets).toHaveLength(1);
  await p.press(rows()[2]!, removeLabels(rows()[2]!)[0]!);
  expect(p.sets.at(-1)).toEqual({ hero: { ...FROM_AUTO, stats: [solar, use, net] } });
});

test('stats can be dragged to another place', async () => {
  const p = await panel(FROM_AUTO);
  const rows = () => [...p.group('Vakjes (hooguit vier)').querySelectorAll<HTMLElement>('.stat')];
  const rect = (top: number, height: number) => ({ left: 0, top, width: 300, height, right: 300, bottom: top + height, x: 0, y: top, toJSON: () => ({}) });
  const list = p.group('Vakjes (hooguit vier)').querySelector<HTMLElement>('.stats')!;
  list.getBoundingClientRect = () => rect(0, 240);
  rows().forEach((row, i) => { row.getBoundingClientRect = () => rect(i * 60, 56); });
  const pointer = (target: EventTarget, type: string, y: number) => target.dispatchEvent(new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', clientX: 20, clientY: y, bubbles: true, composed: true, cancelable: true }));
  pointer(rows()[0]!.querySelector('.grip')!, 'pointerdown', 20);
  pointer(window, 'pointermove', 40);
  pointer(window, 'pointermove', 170);
  pointer(window, 'pointerup', 170);
  const [solar, use, shore, net] = FROM_AUTO.stats;
  expect(p.sets.at(-1)).toEqual({ hero: { ...FROM_AUTO, stats: [use, shore, solar, net] } });
  // the click that ends the drag is swallowed until the next turn of the event loop
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test('the hero can have a name of its own', async () => {
  const p = await panel(TANK);
  const field = p.group('Naam van de blikvanger').querySelector('mh-text-field') as HTMLElement & { placeholder: string; help: string };
  expect([field.placeholder, field.help]).toEqual([p.snapshot.devices['device-4']!.name, 'Leeg laten volgt het apparaat van het grote getal.']);
  field.dispatchEvent(new CustomEvent('input', { detail: { value: 'Water' }, bubbles: true, composed: true }));
  expect(p.sets).toEqual([{ hero: { ...TANK, name: 'Water' }, typing: true }]);
});

test('the hero can be removed, and the list of values can be searched', async () => {
  const p = await panel(TANK);
  const removes = record(p.element, 'remove');
  await p.press(p.element, 'Blikvanger weghalen');
  expect(removes).toHaveLength(1);
  await p.press(p.group('Groot getal'), 'Wijzigen');
  deep(p.element, 'mh-text-field').dispatchEvent(new CustomEvent('input', { detail: { value: 'bestaat niet' }, bubbles: true, composed: true }));
  await settle(p.element);
  await settle(deep(p.element, 'mh-device-list') as never);
  expect(deepText(p.element)).toContain('Geen apparaat met die naam.');
});

test('a value that is gone does not break the panel, and it follows the language', async () => {
  const p = await panel({ ...TANK, main: ref('gone', 'x'), line: ref('device-4', 'gone') });
  expect(p.group('Groot getal')).toBeDefined();
  p.element.ctx = { ...p.ctx, t: createTranslate('en') };
  await settle(p.element);
  expect(p.sheet().heading).toBe('Highlight settings');
  expect(p.element.open).toBe(true);
});

test('a value is live', async () => {
  const tank = device({ id: 'w', name: 'Water', caps: [cap('tank_level', { title: 'Niveau', units: '%', value: 64 })] });
  const fake = fakeContext([tank]);
  const p = await panel({ main: ref('w', 'tank_level'), line: null, stats: [], name: null }, { ctx: fake.ctx, automatic: null });
  expect(deepText(p.group('Groot getal'))).toContain('64%');
  fake.store.apply({ type: 'capability', deviceId: 'w', capabilityId: 'tank_level', value: 12, at: null });
  fake.flush();
  await settle(p.element);
  expect(deepText(p.group('Groot getal'))).toContain('12%');
});

test('a box with a long name has room around its two lines', () => {
  const css = (customElements.get('mh-hero-panel') as unknown as { styles: { cssText?: string }[] }).styles.map((part) => part.cssText ?? '').join('\n');
  expect(css).toMatch(/\.stat\s*\{[^}]*padding:\s*var\(--space-8\)/);
});

test('every button that takes a box away says which one', async () => {
  const p = await panel(FROM_AUTO);
  const labels = removeLabels(p.group('Vakjes (hooguit vier)'));
  expect(labels).toHaveLength(4);
  expect(new Set(labels).size).toBe(4);
  expect(labels[3]).toBe('Vakje Netto laden weghalen');
});

test('after taking a box away the focus stays in the panel', async () => {
  const p = await panel(FROM_AUTO);
  const closes = record(p.element, 'close');
  const remove = () => [...p.group('Vakjes (hooguit vier)').querySelectorAll<HTMLElement>('.stat mh-button')];
  const last = remove().at(-1)!;
  last.focus();
  last.click();
  await p.apply({ ...FROM_AUTO, stats: FROM_AUTO.stats.slice(0, 3) });
  const active = (): Element | null => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; };
  expect((active()!.getRootNode() as ShadowRoot).host).toBe(remove().at(-1));
  active()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }));
  expect(closes).toHaveLength(1);
});
