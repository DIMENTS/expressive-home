// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createTranslate } from '../../../src/i18n';
import { defaultChoices, stepsFor, type Choices, type StepId } from '../../../src/onboarding/choices';
import { rustigExpressive } from '../../../src/theme/rustig-expressive';
import '../../../src/ui/onboarding/onboarding';
import { BUILD_MS, type MhOnboarding } from '../../../src/ui/onboarding/onboarding';
import type { MhMiniBoard } from '../../../src/ui/onboarding/mini-board';
import { key, record } from '../../helpers/mount';
import { camperSnapshot } from '../../helpers/fake-hub';

let reduced = false;
beforeEach(() => {
  reduced = false;
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') ? reduced : false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.useRealTimers(); });

type Change = { step: StepId; choices: Choices };

/** The onboarding as the app holds it: what it reports is put back on it. */
async function onboarding(props: Partial<MhOnboarding> = {}) {
  const element = document.createElement('mh-onboarding') as MhOnboarding;
  const snapshot = camperSnapshot();
  Object.assign(element, {
    t: createTranslate('nl'), snapshot, steps: stepsFor({ hasRooms: true }), step: 'welcome', choices: defaultChoices('#3b6939'),
    presets: rustigExpressive.color.presets, extras: ['weather', 'energy'], phone: false, systemDark: false, sunDark: null, touch: false,
  }, props);
  const changes = record<Change>(element, 'onboarding-change');
  element.addEventListener('onboarding-change', (event) => { Object.assign(element, (event as CustomEvent<Change>).detail); });
  document.body.append(element);
  await element.updateComplete;
  const settle = async () => { for (let i = 0; i < 3; i += 1) { await new Promise((done) => { setTimeout(done, 0); }); await element.updateComplete; } };
  return { element, changes, settle };
}

const $ = <E extends Element = HTMLElement>(element: MhOnboarding, selector: string) => element.shadowRoot!.querySelector<E>(selector)!;
const $$ = (element: MhOnboarding, selector: string) => [...element.shadowRoot!.querySelectorAll<HTMLElement>(selector)];
const button = (element: MhOnboarding, text: string) => $$(element, 'mh-button').find((b) => b.textContent!.trim() === text)!;
const heading = (element: MhOnboarding) => $(element, 'h1').textContent!.trim();
const board = (element: MhOnboarding) => $<MhMiniBoard>(element, 'mh-mini-board');

test('the welcome after pairing, with the steps to come; Beginnen goes to the first choice', async () => {
  const { element, changes, settle } = await onboarding();
  expect(heading(element)).toBe('Gekoppeld met je Homey');
  expect($$(element, '.dots li')).toHaveLength(7);
  expect($(element, '.dots li[aria-current]').dataset['step']).toBe('welcome');
  // where it is, is said with the heading; the live line is for what happens
  const where = element.shadowRoot!.getElementById($(element, 'h1').getAttribute('aria-describedby')!)!;
  expect(where.textContent!.trim()).toBe('Stap 1 van 7');
  button(element, 'Beginnen').click();
  await settle();
  expect(changes.at(-1)!.step).toBe('look');
  expect(heading(element)).toBe('Hoe mag het eruitzien?');
  // the focus goes to the heading of the new step
  expect(element.shadowRoot!.activeElement).toBe($(element, 'h1'));
});

test('Overslaan is there on every step; Escape does nothing', async () => {
  for (const step of ['welcome', 'look', 'first', 'practice'] as const) {
    const { element } = await onboarding({ step });
    const skipped = record(element, 'onboarding-skip');
    key($(element, 'h1'), 'Escape');
    expect(skipped).toHaveLength(0);
    button(element, 'Overslaan').click();
    expect(skipped).toHaveLength(1);
    element.remove();
  }
});

test('the style and the colour: the little dashboard shows them at once, and so does the page', async () => {
  const { element, changes, settle } = await onboarding({ step: 'look' });
  const picker = $(element, 'mh-look-picker');
  picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'glas' }, bubbles: true, composed: true }));
  await settle();
  expect(changes.at(-1)!.choices.theme).toBe('glas');
  expect(board(element).file!.id).toBe('glas');
  $(element, 'mh-swatch-group').dispatchEvent(new CustomEvent('change', { detail: { seed: '#a6422a' }, bubbles: true, composed: true }));
  await settle();
  expect([changes.at(-1)!.choices.seed, board(element).seed]).toEqual(['#a6422a', '#a6422a']);
  expect(element.style.getPropertyValue('--c-primary')).not.toBe('');
  expect(board(element).label).toBe('Voorbeeld van je dashboard: Glas, Terracotta, Licht');
  button(element, 'Terug').click();
  await settle();
  expect(changes.at(-1)!.step).toBe('welcome');
});

test('light or dark; roomy or compact, which a phone does not ask', async () => {
  const { element, changes, settle } = await onboarding({ step: 'light' });
  $(element, 'mh-radio-list').dispatchEvent(new CustomEvent('change', { detail: { value: 'dark' }, bubbles: true, composed: true }));
  await settle();
  expect([changes.at(-1)!.choices.mode, board(element).mode]).toEqual(['dark', 'dark']);
  $(element, 'mh-choice-group[data-density]').dispatchEvent(new CustomEvent('change', { detail: { value: 'compact' }, bubbles: true, composed: true }));
  await settle();
  expect([changes.at(-1)!.choices.density, board(element).density]).toEqual(['compact', 'compact']);
  const phone = await onboarding({ step: 'light', phone: true });
  expect(phone.element.shadowRoot!.querySelector('mh-choice-group[data-density]')).toBeNull();
  expect(board(phone.element).density).toBe('phone');
});

test('with the sun, while the hub does not know the weather, says what it follows then', async () => {
  const { element } = await onboarding({ step: 'light', choices: { ...defaultChoices('#3b6939'), mode: 'sun' } });
  expect(element.shadowRoot!.textContent).toContain('Zonder het weer van de Homey volgt het dit apparaat.');
  const known = await onboarding({ step: 'light', sunDark: true, choices: { ...defaultChoices('#3b6939'), mode: 'sun' } });
  expect(known.element.shadowRoot!.textContent).not.toContain('Zonder het weer van de Homey');
  expect(board(known.element).mode).toBe('dark');
});

test('per kind or per room: another grouping starts what goes first anew; the rooms in the rail are a switch', async () => {
  const { element, changes, settle } = await onboarding({ step: 'layout', choices: { ...defaultChoices('#3b6939'), first: ['type:lights'] } });
  $(element, 'mh-layout-picker').dispatchEvent(new CustomEvent('change', { detail: { value: 'zone' }, bubbles: true, composed: true }));
  await settle();
  expect(changes.at(-1)!.choices).toMatchObject({ grouping: 'zone', first: [] });
  expect(board(element).columns.left.every((block) => block.kind !== 'section' || block.id.startsWith('own:zone:'))).toBe(true);
  $(element, 'mh-switch').dispatchEvent(new CustomEvent('change', { detail: { checked: false }, bubbles: true, composed: true }));
  await settle();
  expect(changes.at(-1)!.choices.rooms).toBe(false);
});

test('what goes first is tapped in order, with its number; a second tap takes it away; the little dashboard follows', async () => {
  const { element, changes, settle } = await onboarding({ step: 'first' });
  const pick = (id: string) => $(element, `[data-pick="${id}"]`);
  expect(pick('hero:main').textContent).toContain('Accu');
  pick('type:water').click();
  await settle();
  pick('type:lights').click();
  await settle();
  expect(changes.at(-1)!.choices.first).toEqual(['type:water', 'type:lights']);
  expect([pick('type:water').getAttribute('aria-pressed'), pick('type:water').querySelector('.badge')!.textContent!.trim()]).toEqual(['true', '1']);
  expect(pick('type:lights').getAttribute('aria-label')).toContain('nummer 2');
  expect(board(element).columns.left.slice(0, 2).map((block) => block.id)).toEqual(['type:water', 'type:lights']);
  pick('type:water').click();
  await settle();
  expect(changes.at(-1)!.choices.first).toEqual(['type:lights']);
  // the widgets of today, as switches
  const weather = $$(element, 'mh-switch').find((s) => s.getAttribute('label') === 'Het weer van vandaag')!;
  weather.dispatchEvent(new CustomEvent('change', { detail: { checked: true }, bubbles: true, composed: true }));
  await settle();
  expect(changes.at(-1)!.choices.extras).toEqual(['weather']);
  expect(board(element).columns.left[0]!.kind).toBe('today');
});

test('a widget the hub cannot fill is not offered', async () => {
  const { element } = await onboarding({ step: 'first', extras: ['energy'] });
  expect($$(element, 'mh-switch').map((s) => s.getAttribute('label'))).toEqual(['De energie van vandaag']);
  const none = await onboarding({ step: 'first', extras: [] });
  expect(none.element.shadowRoot!.querySelector('.extras')).toBeNull();
});

test('making the dashboard takes a moment, then practising or going straight to it', async () => {
  vi.useFakeTimers();
  const { element } = await onboarding({ step: 'build' });
  expect(heading(element)).toBe('Je dashboard wordt gemaakt');
  expect(board(element).building).toBe(true);
  vi.advanceTimersByTime(BUILD_MS);
  await element.updateComplete;
  expect(heading(element)).toBe('Je dashboard staat klaar');
  const finished = record(element, 'onboarding-finish');
  const changes = record<Change>(element, 'onboarding-change');
  button(element, 'Even oefenen').click();
  expect(changes.at(-1)!.step).toBe('practice');
  button(element, 'Naar mijn dashboard').click();
  expect(finished).toHaveLength(1);
});

test('with less motion it is ready at once', async () => {
  reduced = true;
  const { element } = await onboarding({ step: 'build' });
  expect(heading(element)).toBe('Je dashboard staat klaar');
});

test('practising: three exercises that each get a tick, with words for a finger or a mouse', async () => {
  const { element, settle } = await onboarding({ step: 'practice', touch: true });
  const rows = () => $$(element, '.exercise');
  expect(rows().map((row) => row.querySelector('.say')!.textContent!.trim())).toEqual([
    'Tik op de lamp om hem aan te zetten', 'Houd de schuif even vast en schuif dan', 'Houd de knop vast om het slot te openen',
  ]);
  expect(rows().map((row) => row.hasAttribute('data-done'))).toEqual([false, false, false]);
  const practice = (element as unknown as { practice: { ctx: { actions: { toggle(spec: unknown): void; guard(d: string, c: string, v: boolean): void } }; lamp: unknown } }).practice;
  practice.ctx.actions.toggle(practice.lamp);
  await settle();
  expect(rows().map((row) => row.hasAttribute('data-done'))).toEqual([true, false, false]);
  expect([rows()[0]!.hasAttribute('aria-label'), rows()[0]!.querySelector('.unseen')!.textContent!.trim(), rows()[1]!.querySelector('.unseen')!.textContent!.trim()]).toEqual([false, 'Gelukt', 'Nog te doen']);
  // each tick is told
  expect($(element, '[aria-live]').textContent!.trim()).toBe('Gelukt: Tik op de lamp om hem aan te zetten');
  // a short tap on the lock says why it asks
  $(element, 'mh-practice-tiles').dispatchEvent(new CustomEvent('practice-ask', { bubbles: true, composed: true }));
  await settle();
  expect(element.shadowRoot!.textContent).toContain('gaat nooit met één tik: je houdt vast, of je bevestigt.');
  $(element, 'mh-practice-tiles').dispatchEvent(new CustomEvent('practice-open', { bubbles: true, composed: true }));
  await settle();
  expect(element.shadowRoot!.textContent).toContain('Op je dashboard opent hier het venster');
  practice.ctx.actions.guard('practice:lock', 'locked', false);
  await settle();
  expect(rows()[2]!.hasAttribute('data-done')).toBe(true);
  const mouse = await onboarding({ step: 'practice', touch: false });
  expect(mouse.element.shadowRoot!.querySelectorAll('.exercise')[1]!.textContent).toContain('Sleep de schuif, of gebruik de pijltjes');
  expect(mouse.element.shadowRoot!.querySelectorAll('.exercise')[2]!.textContent).toContain('of klik en bevestig');
  const phone = await onboarding({ step: 'practice', touch: true, phone: true });
  expect(phone.element.shadowRoot!.querySelectorAll('.exercise')[1]!.textContent).toContain('Houd de lamp vast en schuif omhoog of omlaag');
  const finished = record(mouse.element, 'onboarding-finish');
  button(mouse.element, 'Naar mijn dashboard').click();
  expect(finished).toHaveLength(1);
});

test('when the dashboard is ready it says in short what was chosen', async () => {
  reduced = true;
  const choices = { ...defaultChoices('#a6422a'), theme: 'glas', mode: 'dark' as const, first: ['type:water', 'hero:main'], extras: ['weather' as const] };
  const { element } = await onboarding({ step: 'build', choices });
  const text = (li: HTMLElement) => li.textContent!.replace(/\s+/g, ' ').trim();
  expect([...element.shadowRoot!.querySelectorAll<HTMLElement>('.summary li')].map(text)).toEqual(['Glas, Terracotta', 'Donker', 'Per soort', 'Bovenaan: Water en Accu', 'Ook erbij: Het weer van vandaag']);
  const plain = await onboarding({ step: 'build', choices: { ...defaultChoices('#123456') } });
  expect([...plain.element.shadowRoot!.querySelectorAll<HTMLElement>('.summary li')].map(text)).toEqual(['Rustig, Eigen kleur', 'Automatisch', 'Per soort']);
});
