// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { AppEnvironment, MhApp } from '../../../src/ui/app/app';
import type { HubLayout } from '../../../src/layout/types';
import type { LookOp } from '../../../src/theme/look-ops';
import { PROGRESS_KEY, defaultChoices, writeProgress } from '../../../src/onboarding/choices';
import { NEXT_KEY } from '../../../src/onboarding/next-steps';
import { deepAll } from '../../helpers/deep';

const media = { matches: false, addEventListener: () => {}, removeEventListener: () => {} };
const phoneMedia = { matches: false, addEventListener: () => {}, removeEventListener: () => {} };

beforeAll(async () => { await import('../../../src/ui/app/app'); }, 60_000);
beforeEach(() => {
  phoneMedia.matches = false;
  vi.stubGlobal('matchMedia', (query: string) => (query === '(width < 600px)' ? phoneMedia : media));
  window.localStorage.clear();
});
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

const settle = async (app: MhApp) => { for (let i = 0; i < 6; i += 1) { await new Promise((r) => setTimeout(r, 0)); await app.updateComplete; } };

/** The app as the app on the hub serves it; `role` null: not paired yet; `first`: what the hub says when it pairs. */
async function startServed(role: 'use' | 'edit' | null, { first = false, layout }: { first?: boolean; layout?: HubLayout } = {}) {
  const { fakeHub, memoryConfig, HOMEY_ID } = await import('../../helpers/fake-hub');
  const hub = fakeHub();
  const configStore = memoryConfig(role === null ? null : { homeyId: HOMEY_ID, apiKey: 'paired' });
  if (layout) configStore.stored().layouts = { [HOMEY_ID]: layout };
  const sent: LookOp[][] = [];
  let paired = false;
  const pair = vi.fn(async (): Promise<'ok'> => {
    configStore.stored().connection = { homeyId: HOMEY_ID, localAddress: null, apiKey: 'paired' };
    paired = true;
    return 'ok';
  });
  const app = document.createElement('mh-app') as MhApp;
  app.environment = {
    configStore, createRealClient: () => hub, createDemoClient: () => hub,
    schedule: (flush) => { setTimeout(flush, 0); }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), browserLanguages: ['nl-NL'],
    served: {
      pair, mayArrange: () => role !== 'use', knownRole: () => (role === 'use' ? 'use' : 'edit'), onConflict: () => {}, onUnsaved: () => {}, onNight: () => {}, onNewBuild: () => {},
      settled: () => true, reload: () => {}, scanned: () => null, onScanned: () => {}, kind: () => 'tablet', fresh: () => paired && first, sendLooks: (ops) => { sent.push(ops); },
    } satisfies NonNullable<AppEnvironment['served']>,
  };
  document.body.append(app);
  await settle(app);
  const pairNow = async () => {
    app.shadowRoot!.querySelector('mh-pair-screen')!.dispatchEvent(new CustomEvent('pair', { detail: { code: '123456', name: 'Tablet' } }));
    await settle(app);
  };
  return { app, hub, configStore, pair, pairNow, sent, HOMEY_ID };
}

const onboarding = (app: MhApp) => app.shadowRoot!.querySelector('mh-onboarding') as (HTMLElement & { step: string; choices: ReturnType<typeof defaultChoices>; updateComplete: Promise<unknown> }) | null;
const dashboard = (app: MhApp) => app.shadowRoot!.querySelector('mh-dashboard') as (HTMLElement & { next: unknown; arriving: boolean; pointEdit: boolean }) | null;
const change = async (app: MhApp, detail: unknown) => { onboarding(app)!.dispatchEvent(new CustomEvent('onboarding-change', { detail, bubbles: true, composed: true })); await settle(app); };
const end = async (app: MhApp, type: 'onboarding-skip' | 'onboarding-finish') => { onboarding(app)!.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true })); await settle(app); };

test('the first device of a hub that pairs here gets the first start instead of the dashboard, and the page keeps where it is', async () => {
  const { app, pairNow, HOMEY_ID } = await startServed(null, { first: true });
  await pairNow();
  expect(dashboard(app)).toBeNull();
  expect(onboarding(app)!.step).toBe('welcome');
  expect(JSON.parse(window.localStorage.getItem(PROGRESS_KEY)!)).toMatchObject({ hub: HOMEY_ID, step: 'welcome' });
});

test('a device the hub does not call the first goes straight to the dashboard, without a card', async () => {
  const { app, pairNow } = await startServed(null, { first: false });
  await pairNow();
  expect(onboarding(app)).toBeNull();
  expect(dashboard(app)!.next).toBeNull();
  expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull();
});

test('a device that was paired already (the camper) sees nothing new; one that may only use neither', async () => {
  const { app } = await startServed('edit', { first: true });
  expect(onboarding(app)).toBeNull();
  expect([dashboard(app)!.next, dashboard(app)!.arriving, dashboard(app)!.pointEdit]).toEqual([null, false, false]);
  document.body.replaceChildren();
  const use = await startServed(null, { first: true });
  (use.app as unknown as { env: { served: { knownRole(): string; mayArrange(): boolean } } }).env.served.knownRole = () => 'use';
  (use.app as unknown as { env: { served: { knownRole(): string; mayArrange(): boolean } } }).env.served.mayArrange = () => false;
  await use.pairNow();
  expect(onboarding(use.app)).toBeNull();
});

test('a page loaded anew halfway goes on where it was, with the choices of then; of another hub it is thrown away', async () => {
  const { HOMEY_ID } = await import('../../helpers/fake-hub');
  const choices = { ...defaultChoices('#3a5ba9'), theme: 'glas' };
  window.localStorage.setItem(PROGRESS_KEY, writeProgress({ hub: HOMEY_ID, step: 'first', choices, since: Date.now() }));
  const { app } = await startServed('edit');
  expect([onboarding(app)!.step, onboarding(app)!.choices.theme]).toEqual(['first', 'glas']);
  document.body.replaceChildren();
  window.localStorage.setItem(PROGRESS_KEY, writeProgress({ hub: 'other', step: 'first', choices, since: Date.now() }));
  const other = await startServed('edit');
  expect(onboarding(other.app)).toBeNull();
  expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull();
});

test('making the dashboard applies the choices: the look of the house, the density of this device, the grouping and what goes first', async () => {
  const { app, pairNow, sent, configStore, HOMEY_ID } = await startServed(null, { first: true });
  await pairNow();
  const choices = { ...defaultChoices('#a6422a'), theme: 'uitbundig', mode: 'dark' as const, density: 'compact' as const, grouping: 'type' as const, rooms: false, first: ['type:water'], extras: ['weather' as const] };
  await change(app, { step: 'first', choices });
  expect(sent).toEqual([]);
  await change(app, { step: 'build', choices });
  expect(sent.flat()).toContainEqual({ house: { theme: 'uitbundig', seed: '#a6422a', mode: 'dark' } });
  const stored = configStore.stored();
  expect(stored.theme.density).toBe('compact');
  const layout = stored.layouts[HOMEY_ID]!;
  expect(layout.rooms).toBe(false);
  const overview = layout.dashboards.find((d) => d.id === 'overview')!;
  expect(overview.sections!.map((s) => s.id).slice(0, 2)).toEqual([expect.stringMatching(/^own:/), 'type:water']);
  expect(overview.sections![0]!.tiles.map((tile) => tile.spec.kind === 'widget' && tile.spec.widget)).toEqual(['weather']);
  // the first layout is no step to undo
  await end(app, 'onboarding-finish');
  expect((app.shadowRoot!.querySelector('mh-dashboard') as unknown as { canUndo: boolean }).canUndo).toBe(false);
});

test('nothing chosen to go first: the Overzicht stays automatic', async () => {
  const { app, pairNow, configStore, HOMEY_ID } = await startServed(null, { first: true });
  await pairNow();
  await change(app, { step: 'build', choices: defaultChoices('#3b6939') });
  expect(configStore.stored().layouts[HOMEY_ID]?.dashboards.find((d) => d.id === 'overview')?.sections ?? null).toBeNull();
});

test('skipping or finishing ends it for good on this device: the dashboard comes in, with the pointer and the card', async () => {
  const { app, pairNow, HOMEY_ID } = await startServed(null, { first: true });
  await pairNow();
  await end(app, 'onboarding-skip');
  expect(onboarding(app)).toBeNull();
  expect([dashboard(app)!.arriving, dashboard(app)!.pointEdit]).toEqual([true, true]);
  expect(dashboard(app)!.next).toEqual({ steps: ['edit', 'widget', 'wall', 'pair', 'away'], done: [] });
  expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull();
  expect(JSON.parse(window.localStorage.getItem(NEXT_KEY)!)).toEqual({ dismissed: false, done: [] });
  expect(JSON.parse(window.localStorage.getItem('dashboard.onboarded')!)).toEqual([HOMEY_ID]);
  // understood
  dashboard(app)!.dispatchEvent(new CustomEvent('pointer-ok', { bubbles: true, composed: true }));
  await settle(app);
  expect(dashboard(app)!.pointEdit).toBe(false);
});

test('the steps of the card: Bewerken, the window to pair another device, and away for good', async () => {
  window.localStorage.setItem(NEXT_KEY, JSON.stringify({ dismissed: false, done: [] }));
  const { app } = await startServed('edit');
  const step = async (id: string) => { dashboard(app)!.dispatchEvent(new CustomEvent('next-step', { detail: { step: id }, bubbles: true, composed: true })); await settle(app); };
  await step('edit');
  expect((dashboard(app) as unknown as { editing: boolean }).editing).toBe(true);
  dashboard(app)!.dispatchEvent(new CustomEvent('done', { bubbles: true, composed: true }));
  await settle(app);
  expect((dashboard(app)!.next as { done: string[] }).done).toEqual(['edit']);
  await step('pair');
  const dialog = app.shadowRoot!.querySelector<HTMLElement & { open: boolean; heading: string }>('mh-dialog.next')!;
  expect([dialog.open, dialog.heading]).toEqual([true, 'Nog een apparaat koppelen']);
  expect(dialog.textContent).toContain('Apparaat toevoegen');
  // each step is one block of text beside its number, also with bold words in it
  expect([...dialog.querySelectorAll('li')].map((li) => [li.children.length, li.firstElementChild!.localName])).toEqual([[1, 'div'], [1, 'div'], [1, 'div']]);
  [...dialog.querySelectorAll<HTMLElement>('mh-button')].find((b) => b.textContent!.trim() === 'Begrepen')!.click();
  await settle(app);
  expect([dialog.open, (dashboard(app)!.next as { done: string[] }).done]).toEqual([false, ['edit', 'pair']]);
  await step('away');
  expect(dialog.textContent).toContain('my.homey.app');
  dashboard(app)!.dispatchEvent(new CustomEvent('next-dismiss', { bubbles: true, composed: true }));
  await settle(app);
  expect(dashboard(app)!.next).toBeNull();
  expect(JSON.parse(window.localStorage.getItem(NEXT_KEY)!)).toMatchObject({ dismissed: true });
});

test('on a phone the card has only what a phone can do, and there is no pointer', async () => {
  phoneMedia.matches = true;
  const { app, pairNow } = await startServed(null, { first: true });
  await pairNow();
  await end(app, 'onboarding-skip');
  expect([(dashboard(app)!.next as { steps: string[] }).steps, dashboard(app)!.pointEdit]).toEqual([['pair', 'away'], false]);
  expect(deepAll(app, 'mh-next-card')).toHaveLength(1);
});

/** Whether the dashboard was ever drawn while the app ran: the first start comes before it, never after a glimpse of it. */
function watchDashboard(app: MhApp): () => boolean {
  let seen = false;
  const look = () => { if (app.shadowRoot!.querySelector('mh-dashboard')) seen = true; };
  new MutationObserver(look).observe(app.shadowRoot!, { childList: true, subtree: true });
  return () => seen;
}

test('after pairing the first start comes at once: the dashboard is never drawn before it', async () => {
  const { app, pairNow } = await startServed(null, { first: true });
  const seen = watchDashboard(app);
  await pairNow();
  expect(onboarding(app)).not.toBeNull();
  expect(seen()).toBe(false);
});

test('a page loaded anew halfway shows the first start at once, and applies the choices again from making the dashboard on', async () => {
  const { HOMEY_ID } = await import('../../helpers/fake-hub');
  const choices = { ...defaultChoices('#3a5ba9'), theme: 'glas' };
  window.localStorage.setItem(PROGRESS_KEY, writeProgress({ hub: HOMEY_ID, step: 'practice', choices, since: Date.now() }));
  const { fakeHub, memoryConfig } = await import('../../helpers/fake-hub');
  void fakeHub; void memoryConfig;
  const { app, sent } = await startServed('edit');
  expect(onboarding(app)!.step).toBe('practice');
  expect(sent.flat()).toContainEqual({ house: { theme: 'glas', seed: '#3a5ba9' } });
});

test('with #veilig behind the address there is no first start, also not one under way', async () => {
  window.location.hash = '#veilig';
  try {
    const { app, pairNow } = await startServed(null, { first: true });
    await pairNow();
    expect(onboarding(app)).toBeNull();
    document.body.replaceChildren();
    const { HOMEY_ID } = await import('../../helpers/fake-hub');
    window.localStorage.setItem(PROGRESS_KEY, writeProgress({ hub: HOMEY_ID, step: 'look', choices: defaultChoices('#3b6939'), since: Date.now() }));
    const again = await startServed('edit');
    expect(onboarding(again.app)).toBeNull();
  } finally {
    window.location.hash = '';
  }
});

test('a browser that did the first start of a hub never gets it again for that hub, even when the hub says first', async () => {
  const { HOMEY_ID } = await import('../../helpers/fake-hub');
  window.localStorage.setItem('dashboard.onboarded', JSON.stringify([HOMEY_ID]));
  const { app, pairNow } = await startServed(null, { first: true });
  await pairNow();
  expect(onboarding(app)).toBeNull();
});

test('a pairing that is no first start lets go of a first start that was left under way', async () => {
  const { HOMEY_ID } = await import('../../helpers/fake-hub');
  window.localStorage.setItem(PROGRESS_KEY, writeProgress({ hub: HOMEY_ID, step: 'look', choices: defaultChoices('#3b6939'), since: Date.now() }));
  const { app, pairNow } = await startServed(null, { first: false });
  await pairNow();
  expect(onboarding(app)).toBeNull();
  expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull();
});

test('the right to arrange goes halfway: the first start ends quietly, without a card, and nothing is applied', async () => {
  const { app, pairNow, sent } = await startServed(null, { first: true });
  await pairNow();
  const served = (app as unknown as { env: { served: { knownRole(): string; mayArrange(): boolean } } }).env.served;
  served.mayArrange = () => false;
  await change(app, { step: 'build', choices: { ...defaultChoices('#a6422a'), theme: 'glas' } });
  // not without the right: it stays where it was
  expect(onboarding(app)!.step).toBe('welcome');
  expect(sent).toEqual([]);
  served.knownRole = () => 'use';
  (app as unknown as { controller: { closeDevice(): void } }).controller.closeDevice();
  await settle(app);
  expect(onboarding(app)).toBeNull();
  expect([window.localStorage.getItem(PROGRESS_KEY), dashboard(app)!.next]).toEqual([null, null]);
});

test('a device that is taken away leaves the first start too', async () => {
  const { app, pairNow, hub } = await startServed(null, { first: true });
  await pairNow();
  hub.emit({ type: 'authError' });
  await settle(app);
  expect(onboarding(app)).toBeNull();
  expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull();
});
