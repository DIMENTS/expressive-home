// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/screens/hero';
import type { MhHero } from '../../../src/ui/screens/hero';
import { inside, mount, record, settle } from '../../helpers/mount';
import { camper } from '../../helpers/camper';

afterEach(() => { document.body.replaceChildren(); });

async function setup() {
  const fake = camper();
  const hero = fake.dashboard.hero!;
  const element = await mount<MhHero>('mh-hero', { hero, ctx: fake.ctx });
  return { ...fake, hero, element };
}

test('the hero shows its title, number and stats', async () => {
  const { element } = await setup();
  expect(inside(element, 'h2').textContent).toContain('Accu');
  expect(element.shadowRoot!.querySelectorAll('.stat')).toHaveLength(4);
  expect(inside(element, '.main').getAttribute('aria-label')).toMatch(/^Accu, .+\. Meer over Accu$/);
});

test('the hero follows a device it only reads a stat from', async () => {
  const { element, hero, store, flush } = await setup();
  const consumption = hero.stats.find((s) => s.role === 'consumption');
  if (!consumption || consumption.role === 'net') throw new Error('the camper has a consumption stat');
  const statText = () => [...element.shadowRoot!.querySelectorAll('.stat')].map((s) => s.textContent).join('|');
  const before = statText();
  store.apply({ type: 'capability', deviceId: consumption.ref.deviceId, capabilityId: consumption.ref.capabilityId, value: 186, at: null });
  flush();
  await settle(element);
  expect(statText()).not.toBe(before);
  expect(statText()).toContain('186 W');
});

test('tapping the hero number opens the battery and a stat opens its own device', async () => {
  const { element, hero, actions } = await setup();
  inside(element, '.main').click();
  expect(actions.openDevice).toHaveBeenLastCalledWith(hero.primary.deviceId);
  const solar = hero.stats.find((s) => s.role === 'solar');
  if (!solar || solar.role === 'net') throw new Error('the camper has a solar stat');
  (element.shadowRoot!.querySelector('button.stat') as HTMLElement).click();
  expect(actions.openDevice).toHaveBeenLastCalledWith(solar.ref.deviceId);
});

test('the computed net stat is not a button', async () => {
  const { element } = await setup();
  const stats = [...element.shadowRoot!.querySelectorAll('.stat')];
  expect(stats.at(-1)!.tagName).toBe('DIV');
});

test('the wave follows the width of the hero, also after it went away and came back', async () => {
  const observers: { callback: ResizeObserverCallback; targets: Set<Element> }[] = [];
  class FakeResizeObserver {
    private entry: { callback: ResizeObserverCallback; targets: Set<Element> };
    constructor(callback: ResizeObserverCallback) { this.entry = { callback, targets: new Set() }; observers.push(this.entry); }
    observe(target: Element) { this.entry.targets.add(target); }
    unobserve(target: Element) { this.entry.targets.delete(target); }
    disconnect() { this.entry.targets.clear(); }
  }
  /** Reports a new width for an element, to the observers that watch it. */
  const resize = (target: Element, width: number) => {
    for (const o of observers) if (o.targets.has(target)) o.callback([{ target, contentRect: { width } } as unknown as ResizeObserverEntry], {} as ResizeObserver);
  };
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  try {
    const { element, hero, store } = await setup();
    const viewBoxWidth = () => element.shadowRoot!.querySelector('svg')?.getAttribute('viewBox')?.split(' ')[2];
    resize(inside(element, '.main'), 480);
    await settle(element);
    expect(viewBoxWidth()).toBe('480');
    const panel = store.getDevices().find((d) => d.deviceClass === 'solarpanel')!;
    element.hero = { kind: 'solar', deviceIds: [panel.id], primary: { deviceId: panel.id, capabilityId: 'measure_power' }, timeToGo: null, stats: [] };
    await settle(element);
    expect(element.shadowRoot!.querySelector('svg')).toBeNull();
    resize(inside(element, '.main'), 620);
    element.hero = hero;
    await settle(element);
    expect(viewBoxWidth()).toBe('620');
    // a hero that had nothing to show draws another area; its width is followed too
    element.hero = null;
    await settle(element);
    element.hero = hero;
    await settle(element);
    resize(inside(element, '.main'), 333);
    await settle(element);
    expect(viewBoxWidth()).toBe('333');
  } finally {
    globalThis.ResizeObserver = original;
  }
});

test('the hero has a menu too, and keeps its colour under hero:main', async () => {
  const { HERO_SECTION_ID } = await import('../../../src/dashboard/types');
  expect(HERO_SECTION_ID).toBe('hero:main');
  const { element } = await setup();
  const menu = element.shadowRoot!.querySelector('mh-section-menu')!;
  expect(menu.shadowRoot!.querySelector('button.trigger')!.getAttribute('aria-label')).toBe('Menu van Accu');
  const seeds: { sectionId: string; seed: string | null }[] = [];
  element.addEventListener('section-seed', (e) => seeds.push((e as CustomEvent).detail));
  menu.shadowRoot!.querySelector('mh-menu')!.dispatchEvent(new CustomEvent('select', { detail: { group: 'seed', id: '#a6422a' }, bubbles: true, composed: true }));
  expect(seeds).toEqual([{ sectionId: 'hero:main', seed: '#a6422a' }]);
  element.seed = '#a6422a';
  await settle(element);
  expect(element.hasAttribute('data-own-seed')).toBe(true);
});

test('while editing a tap on the hero opens its settings instead of a device', async () => {
  const fake = camper();
  const element = await mount<MhHero>('mh-hero', { hero: fake.dashboard.hero, ctx: fake.ctx, sectionId: 'hero:d-1', editing: true });
  const opens = record(element, 'open-hero');
  inside(element, '.main').click();
  expect(opens).toEqual([{ sectionId: 'hero:d-1' }]);
  expect(inside(element, '.main').getAttribute('aria-label')).toBe('Accu, blikvanger instellen');
  expect(inside(element, '.head .grip').getAttribute('aria-label')).toBe('Verplaats Accu');
  // the stats are no buttons now, and a tap on one goes to the settings as well
  expect(element.shadowRoot!.querySelector('button.stat')).toBeNull();
  inside(element, '.stat').click();
  expect(opens).toHaveLength(2);
  expect(fake.actions.openDevice).not.toHaveBeenCalled();
  element.editing = false;
  await settle(element);
  inside(element, '.main').click();
  expect(fake.actions.openDevice).toHaveBeenCalledTimes(1);
  expect(opens).toHaveLength(2);
});

test('the colour of a hero is kept under its own section id', async () => {
  const fake = camper();
  const element = await mount<MhHero>('mh-hero', { hero: fake.dashboard.hero, ctx: fake.ctx, sectionId: 'hero:d-1' });
  const seeds = record(element, 'section-seed');
  inside(element, 'mh-section-menu').dispatchEvent(new CustomEvent('select', { detail: { group: 'seed', id: '#a6422a' } }));
  expect(seeds).toEqual([{ sectionId: 'hero:d-1', seed: '#a6422a' }]);
});

test('a value that is a word is told apart from a number, so it stands smaller', async () => {
  const { element, store, flush } = await setup();
  const kinds = () => [...element.shadowRoot!.querySelectorAll('.stat')].map((stat) => [stat.querySelector('b')!.textContent, stat.classList.contains('long')]);
  const stats = () => [...element.shadowRoot!.querySelector('.stats')!.classList].join(' ');
  expect(kinds().map(([, long]) => long)).toEqual([false, false, false, false]);
  const report = async (value: string) => {
    store.apply({ type: 'capability', deviceId: 'device-23', capabilityId: 'ac_input_source', value, at: null });
    flush();
    await settle(element);
  };
  await report('none');
  expect([kinds()[2], stats()]).toEqual([['Off-grid', true], 'stats word label']);
  await report('grid');
  expect([kinds()[2], stats()]).toEqual([['Net', false], 'stats label']);
});
