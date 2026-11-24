// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import type { DeviceTileSpec, HouseKind } from '../../../src/dashboard/types';
import type { Device } from '../../../src/homey/types';
import type { ShownDensity } from '../../../src/theme/types';
import type { DashboardStatus } from '../../../src/ui/app/context';
import { LONG_PRESS_MS } from '../../../src/ui/parts/long-press';
import type { MhHoldButton } from '../../../src/ui/parts/hold-button';
import type { MhStepper } from '../../../src/ui/parts/stepper';
import '../../../src/ui/tiles/index';
import { createTile, tileSizes } from '../../../src/ui/tiles/registry';
import type { TileElement } from '../../../src/ui/tiles/tile-base';
import { inside, record, settle } from '../../helpers/mount';
import { covers, guards, heating, media } from '../../helpers/devices';
import { fakeContext } from '../../helpers/ui-context';

// The tiles of a house: narrow ones show, wide ones have buttons.

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

type Options = { size?: 'single' | 'wide'; density?: ShownDensity; status?: Partial<DashboardStatus>; editing?: boolean };
async function setup(kind: HouseKind, d: Device, { size = 'wide', density = 'comfortable', status = {}, editing = false }: Options = {}) {
  const fake = fakeContext([structuredClone(d)], status);
  const spec: DeviceTileSpec = { kind, id: 't', deviceId: d.id, size };
  const tile = createTile(spec, fake.ctx, density) as TileElement;
  tile.editing = editing;
  document.body.append(tile);
  await tile.updateComplete;
  const all = <E extends HTMLElement>(selector: string) => [...tile.shadowRoot!.querySelectorAll<E>(selector)];
  return {
    ...fake, tile, asked: record(tile, 'confirm-danger'), all,
    buttons: () => all('.controls button').map((b) => b.getAttribute('aria-label')),
    tap: (label: string) => all<HTMLButtonElement>('.controls button').find((b) => b.getAttribute('aria-label') === label)!.click(),
    slider: () => tile.shadowRoot!.querySelector<HTMLElement & { fraction: number; label: string; valueText: string }>('mh-slider'),
    holds: () => all<MhHoldButton>('mh-hold-button'),
    async change(id: string, value: unknown) {
      fake.store.apply({ type: 'capability', deviceId: d.id, capabilityId: id, value: value as never, at: null });
      fake.flush();
      await tile.updateComplete;
    },
  };
}
const slide = (slider: HTMLElement | null, type: 'slide' | 'commit', fraction: number) => slider!.dispatchEvent(new CustomEvent(type, { detail: { fraction }, bubbles: true, composed: true }));

test('every kind can be narrow and wide', () => {
  for (const kind of ['climate', 'cover', 'media', 'guard'] as const) expect(tileSizes(kind)).toEqual(['single', 'wide']);
});

test.each<[HouseKind, Device]>([['climate', heating.ownMode], ['cover', covers.both], ['media', media.full], ['guard', guards.lock]])('a narrow %s tile only shows; a tap opens its window', async (kind, d) => {
  const s = await setup(kind, d, { size: 'single' });
  expect(s.all('.controls')).toEqual([]);
  inside(s.tile, '.tile').click();
  expect(s.actions.openDevice.mock.calls).toEqual([[d.id]]);
  // and so it is on a phone, whatever its size
  expect((await setup(kind, d, { density: 'phone' })).all('.controls')).toEqual([]);
});

test.each<[HouseKind, Device]>([['climate', heating.ownMode], ['cover', covers.both], ['media', media.full], ['guard', guards.lock]])('a wide %s tile opens its window beside its buttons, and not with them', async (kind, d) => {
  vi.useFakeTimers();
  const s = await setup(kind, d);
  const controls = inside(s.tile, '.controls');
  for (const type of ['pointerdown', 'click', 'contextmenu']) controls.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, cancelable: true }));
  controls.firstElementChild!.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, bubbles: true, composed: true }));
  vi.advanceTimersByTime(LONG_PRESS_MS + 10);
  expect(s.actions.openDevice).not.toHaveBeenCalled();
  inside(s.tile, '.head').click();
  expect(s.actions.openDevice).toHaveBeenCalledTimes(1);
});

test.each<[HouseKind, Device]>([['climate', heating.ownMode], ['cover', covers.both], ['media', media.full], ['guard', guards.lock]])('a wide %s tile that cannot be reached has no buttons, and while editing they do nothing', async (kind, d) => {
  expect((await setup(kind, { ...d, available: false })).all('.controls')).toEqual([]);
  const s = await setup(kind, d, { editing: true });
  expect(inside(s.tile, '.controls').hasAttribute('inert')).toBe(true);
});

test.each<ShownDensity>(['comfortable', 'compact'])('a wide tile has its buttons when %s', async (density) => {
  for (const [kind, d] of [['climate', heating.ownMode], ['cover', covers.both], ['media', media.full], ['guard', guards.lock]] as const) {
    expect((await setup(kind, d, { density })).all('.controls')).toHaveLength(1);
  }
});

// ----- climate -----

const stepper = (s: Awaited<ReturnType<typeof setup>>) => s.all<MhStepper>('mh-stepper')[0]!;

test('the target is stepped, and says so', async () => {
  const s = await setup('climate', heating.ownMode);
  const { value, unit, spoken, less, more, atLeast, atMost } = stepper(s);
  expect({ value, unit, spoken, less, more, atLeast, atMost }).toEqual({ value: '21', unit: '°', spoken: 'Woonkamer naar 21°', less: 'Woonkamer kouder', more: 'Woonkamer warmer', atLeast: false, atMost: false });
  stepper(s).dispatchEvent(new CustomEvent('step', { detail: { steps: 1 }, bubbles: true, composed: true }));
  expect(s.actions.nudge.mock.calls).toEqual([['own', 1]]);
  await s.change('target_temperature', 30);
  expect([stepper(s).value, stepper(s).atMost]).toEqual(['30', true]);
  await s.change('target_temperature', 7);
  expect([stepper(s).atLeast, stepper(s).atMost]).toEqual([true, false]);
  // somewhere between the steps, below the lowest one
  await s.change('target_temperature', 21.55);
  expect(stepper(s).value).toBe('21,6');
  await s.change('target_temperature', null);
  expect([stepper(s).value, stepper(s).unit]).toEqual(['–', '']);
});

// ----- cover -----

test('a cover goes up, stops and goes down, or to where it is dragged', async () => {
  const s = await setup('cover', covers.both);
  expect(s.buttons()).toEqual(['Rolluik openen', 'Rolluik stoppen', 'Rolluik sluiten']);
  s.tap('Rolluik openen');
  s.tap('Rolluik stoppen');
  s.tap('Rolluik sluiten');
  expect(s.actions.setCapability.mock.calls).toEqual([['both', 'windowcoverings_state', 'up'], ['both', 'windowcoverings_state', 'idle'], ['both', 'windowcoverings_state', 'down']]);
  expect([s.slider()!.fraction, s.slider()!.label, s.slider()!.valueText]).toEqual([0.25, 'Stand van Rolluik', '25% open']);
  slide(s.slider(), 'slide', 0.4);
  slide(s.slider(), 'commit', 0.5);
  expect(s.actions.slide.mock.calls).toEqual([['both', 'windowcoverings_set', 0.5, true]]);
});

test('without a state it goes all the way, and cannot be stopped', async () => {
  const s = await setup('cover', covers.hundred);
  expect(s.buttons()).toEqual(['Screen openen', 'Screen sluiten']);
  s.tap('Screen openen');
  s.tap('Screen sluiten');
  expect(s.actions.setCapability.mock.calls).toEqual([['hundred', 'windowcoverings_set', 100], ['hundred', 'windowcoverings_set', 0]]);
  slide(s.slider(), 'commit', 0.333);
  expect(s.actions.slide.mock.calls).toEqual([['hundred', 'windowcoverings_set', 33, true]]);
});

test('a cover that only opens and closes has no slider', async () => {
  const state = await setup('cover', covers.stateOnly);
  expect([state.buttons(), state.slider()]).toEqual([['Gordijn openen', 'Gordijn stoppen', 'Gordijn sluiten'], null]);
  const closed = await setup('cover', covers.closedOnly);
  closed.tap('Luik openen');
  closed.tap('Luik sluiten');
  expect([closed.buttons(), closed.actions.setCapability.mock.calls]).toEqual([['Luik openen', 'Luik sluiten'], [['closed', 'windowcoverings_closed', false], ['closed', 'windowcoverings_closed', true]]]);
  // an app that cannot stop it says so
  const states = covers.stateOnly.capabilities['windowcoverings_state']!;
  const noStop = { ...covers.stateOnly, capabilities: { windowcoverings_state: { ...states, options: states.options.filter((o) => o.id !== 'idle') } } };
  expect((await setup('cover', noStop)).buttons()).toEqual(['Gordijn openen', 'Gordijn sluiten']);
});

test('an awning rolls in and out, and its slider says how far out it is', async () => {
  const s = await setup('cover', covers.awning);
  expect(s.buttons()).toEqual(['Zonwering inrollen', 'Zonwering stoppen', 'Zonwering uitrollen']);
  s.tap('Zonwering inrollen');
  expect(s.actions.setCapability.mock.calls).toEqual([['awning', 'windowcoverings_state', 'up']]);
  expect([s.slider()!.fraction, s.slider()!.valueText]).toEqual([0, 'Ingerold']);
  slide(s.slider(), 'commit', 0.7);
  expect(s.actions.slide.mock.calls[0]![2]).toBeCloseTo(0.3);
});

// ----- media -----

test('a speaker plays, skips and gets louder', async () => {
  const s = await setup('media', media.full);
  expect(s.buttons()).toEqual(['Keuken: vorige', 'Keuken: pauzeren', 'Keuken: volgende']);
  s.tap('Keuken: pauzeren');
  s.tap('Keuken: vorige');
  s.tap('Keuken: volgende');
  expect(s.actions.setCapability.mock.calls).toEqual([['full', 'speaker_playing', false]]);
  expect(s.actions.press.mock.calls).toEqual([['full', 'speaker_prev', true], ['full', 'speaker_next', true]]);
  expect([s.slider()!.label, s.slider()!.valueText]).toEqual(['Volume van Keuken', '32%']);
  slide(s.slider(), 'commit', 0.5);
  expect(s.actions.slide.mock.calls).toEqual([['full', 'volume_set', 0.5, true]]);
  await s.change('speaker_playing', false);
  expect(s.buttons()[1]).toBe('Keuken: afspelen');
  s.tap('Keuken: afspelen');
  expect(s.actions.setCapability.mock.calls.at(-1)).toEqual(['full', 'speaker_playing', true]);
});

test('a television goes on and off, and can be muted', async () => {
  const s = await setup('media', media.tv);
  expect(s.buttons()).toEqual(['Televisie uitzetten', 'Televisie dempen']);
  s.tap('Televisie uitzetten');
  s.tap('Televisie dempen');
  expect(s.actions.setCapability.mock.calls).toEqual([['tv', 'onoff', false], ['tv', 'volume_mute', true]]);
  await s.change('volume_mute', true);
  await s.change('onoff', false);
  expect(s.buttons()).toEqual(['Televisie aanzetten', 'Geluid van Televisie aan']);
  slide(s.slider(), 'commit', 0.4);
  expect(s.actions.slide.mock.calls).toEqual([['tv', 'volume_set', 40, true]]);
});

test('a television with only buttons has a button for softer and one for louder', async () => {
  const s = await setup('media', media.tvButtons);
  expect([s.buttons(), s.slider()]).toEqual([['Tv boven aanzetten', 'Tv boven dempen', 'Tv boven zachter', 'Tv boven harder'], null]);
  s.tap('Tv boven harder');
  s.tap('Tv boven zachter');
  expect(s.actions.press.mock.calls).toEqual([['tvb', 'volume_up', true], ['tvb', 'volume_down', true]]);
});

test('a device that does not tell whether it is on says neither', async () => {
  const s = await setup('media', media.tvInfrared);
  expect(s.buttons()).toEqual(['Tv gang aan of uit', 'Tv gang zachter', 'Tv gang harder']);
  s.tap('Tv gang aan of uit');
  expect(s.actions.setCapability.mock.calls).toEqual([['tvir', 'onoff', true]]);
});

// ----- guard -----

test('a lock is unlocked by holding, and locked with one tap', async () => {
  const s = await setup('guard', guards.lock);
  const [unlock] = s.holds();
  expect([s.holds().length, unlock!.guarded, unlock!.text, unlock!.short, unlock!.label, unlock!.icon]).toEqual([1, true, 'Houd vast om te ontgrendelen', 'Ontgrendelen', 'Voordeur ontgrendelen', 'lock_open']);
  unlock!.dispatchEvent(new CustomEvent('go', { bubbles: true, composed: true }));
  expect([s.actions.guard.mock.calls, s.asked]).toEqual([[['lock', 'locked', false]], []]);
  await s.change('locked', false);
  const [lock] = s.holds();
  expect([s.holds().length, lock!.guarded, lock!.text, lock!.label, lock!.icon, lock!.main]).toEqual([1, false, 'Vergrendelen', 'Voordeur vergrendelen', 'lock', true]);
  lock!.dispatchEvent(new CustomEvent('go', { bubbles: true, composed: true }));
  expect(s.actions.guard.mock.calls.at(-1)).toEqual(['lock', 'locked', true]);
});

test('a short tap asks first, and the tile itself sends nothing', async () => {
  const s = await setup('guard', guards.lock);
  s.holds()[0]!.dispatchEvent(new CustomEvent('ask', { bubbles: true, composed: true }));
  expect([s.asked, s.actions.guard.mock.calls]).toEqual([[{ deviceId: 'lock', capabilityId: 'locked', value: false }], []]);
});

test('without a route or a right nothing is asked: the notice says why', async () => {
  for (const status of [{ route: null }, { canControl: false }]) {
    const s = await setup('guard', guards.lock, { status });
    s.holds()[0]!.dispatchEvent(new CustomEvent('ask', { bubbles: true, composed: true }));
    s.holds()[0]!.dispatchEvent(new CustomEvent('go', { bubbles: true, composed: true }));
    // this way never leads to a lock, and tells why it cannot
    expect([s.asked, s.actions.setCapability.mock.calls, s.actions.guard.mock.calls]).toEqual([[], [['lock', 'locked', false]], [['lock', 'locked', false]]]);
  }
});

test('a lock that does not tell can go both ways', async () => {
  const s = await setup('guard', guards.lock);
  await s.change('locked', null);
  expect(s.holds().map((b) => [b.label, b.guarded])).toEqual([['Voordeur ontgrendelen', true], ['Voordeur vergrendelen', false]]);
});

test('a garage door opens by holding; one that is moved as a curtain also closes so', async () => {
  const s = await setup('guard', guards.garage);
  expect(s.holds().map((b) => [b.text, b.label, b.guarded])).toEqual([['Houd vast om te openen', 'Garage openen', true]]);
  await s.change('garagedoor_closed', false);
  expect(s.holds().map((b) => [b.text, b.label, b.guarded])).toEqual([['Sluiten', 'Garage sluiten', false]]);
  const cover = await setup('guard', guards.garageAsCover);
  cover.holds()[0]!.dispatchEvent(new CustomEvent('go', { bubbles: true, composed: true }));
  expect(cover.actions.guard.mock.calls).toEqual([['garage3', 'windowcoverings_set', 1]]);
  await cover.change('windowcoverings_set', 0.5);
  expect(cover.holds().map((b) => [b.text, b.guarded])).toEqual([['Houd vast om te sluiten', true]]);
  cover.holds()[0]!.dispatchEvent(new CustomEvent('go', { bubbles: true, composed: true }));
  expect(cover.actions.guard.mock.calls.at(-1)).toEqual(['garage3', 'windowcoverings_set', 0]);
});

test('an alarm is off, partly on or on; going down is held', async () => {
  const s = await setup('guard', guards.alarm);
  const all = () => s.holds().map((b) => [b.text, b.label, b.guarded, b.main]);
  expect(all()).toEqual([['Uit', 'Alarm uitschakelen', false, true], ['Deels', 'Alarm deels inschakelen', false, false], ['Aan', 'Alarm inschakelen', false, false]]);
  s.holds()[2]!.dispatchEvent(new CustomEvent('go', { bubbles: true, composed: true }));
  expect(s.actions.guard.mock.calls).toEqual([['alarm', 'homealarm_state', 'armed']]);
  await s.change('homealarm_state', 'armed');
  expect(all()).toEqual([['Uit', 'Alarm uitschakelen', true, false], ['Deels', 'Alarm deels inschakelen', true, false], ['Aan', 'Alarm inschakelen', false, true]]);
  // what it is already is not told again
  s.actions.guard.mockClear();
  s.holds()[2]!.dispatchEvent(new CustomEvent('go', { bubbles: true, composed: true }));
  expect(s.actions.guard).not.toHaveBeenCalled();
});

test('while it works its buttons wait', async () => {
  const s = await setup('guard', guards.lock);
  s.busy.set('lock', { capabilityId: 'locked', value: false });
  s.store.touch('lock');
  s.flush();
  await settle(s.tile);
  expect([s.holds()[0]!.busy, inside(s.tile, '.state').textContent]).toEqual([true, 'Ontgrendelt…']);
});

test('one that can only be read has no buttons', async () => {
  expect((await setup('guard', guards.readOnly)).all('.controls')).toEqual([]);
});
