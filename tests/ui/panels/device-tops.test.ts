// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/panels/device-panel';
import type { MhDevicePanel } from '../../../src/ui/panels/device-panel';
import type { MhHoldButton } from '../../../src/ui/parts/hold-button';
import type { MhStepper } from '../../../src/ui/parts/stepper';
import type { DashboardStatus } from '../../../src/ui/app/context';
import type { Device } from '../../../src/homey/types';
import { cap, device } from '../../helpers/build';
import { covers, guards, heating, media } from '../../helpers/devices';
import { inside, mount, record, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

// The top of the window of a device of a house, and what of it stands below.

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

type SliderElement = HTMLElement & { fraction: number; label: string; valueText: string; disabled: boolean };
async function open(dev: Device, status: Partial<DashboardStatus> = {}) {
  const fake = fakeContext([structuredClone(dev)], status);
  const panel = await mount<MhDevicePanel>('mh-device-panel', { ctx: fake.ctx, deviceId: dev.id });
  await settle(panel);
  const all = <E extends HTMLElement = HTMLElement>(selector: string) => [...panel.shadowRoot!.querySelectorAll<E>(selector)];
  return {
    ...fake, panel, all, asked: record(panel, 'confirm-danger'),
    top: () => panel.shadowRoot!.querySelector<HTMLElement>('.top-of'),
    sheet: () => inside(panel, 'mh-sheet') as HTMLElement & { heading: string; subheading: string; icon: string; iconOn: boolean },
    buttons: () => all('.top-of .b').map((b) => b.getAttribute('aria-label')),
    tap: (label: string) => all('.top-of .b').find((b) => b.getAttribute('aria-label') === label)!.click(),
    sliders: () => all<SliderElement>('.top-of mh-slider'),
    holds: (where = '') => all<MhHoldButton>(`${where} mh-hold-button`.trim()),
    /** What stands in the lists below. */
    below: () => all('.below .label, .below .cell span').map((el) => el.textContent!.trim()),
    async change(id: string, value: unknown) {
      fake.store.apply({ type: 'capability', deviceId: dev.id, capabilityId: id, value: value as never, at: null });
      fake.flush();
      await settle(panel);
    },
  };
}
const texts = (el: Element) => [...el.children].map((child) => child.textContent!.trim()).join('|');
const commit = (slider: HTMLElement, fraction: number, type = 'commit') => slider.dispatchEvent(new CustomEvent(type, { detail: { fraction }, bubbles: true, composed: true }));

test('a device that is no such thing has the window it had', async () => {
  const s = await open(heating.fridge);
  expect([s.top(), s.sheet().subheading]).toEqual([null, '']);
});

// ----- climate -----

test('heating: the target large, where it can go, and its mode', async () => {
  const s = await open(heating.airco);
  const stepper = inside<MhStepper>(s.panel, '.top-of mh-stepper');
  expect([stepper.large, stepper.value, stepper.less]).toEqual([true, '22', 'Werkkamer kouder']);
  stepper.dispatchEvent(new CustomEvent('step', { detail: { steps: -1 }, bubbles: true, composed: true }));
  expect(s.actions.nudge.mock.calls).toEqual([['airco', -1]]);
  const [slider] = s.sliders();
  expect([slider!.fraction, slider!.label, slider!.valueText, texts(s.top()!.querySelector('.ends')!)]).toEqual([expect.closeTo(12 / 21), 'Doel van Werkkamer', '22°', '10°|31°']);
  commit(slider!, 0.2, 'slide');
  commit(slider!, 1);
  expect(s.actions.slide.mock.calls).toEqual([['airco', 'target_temperature', 31, true]]);
  // between the steps of the app it is the nearest one
  commit(slider!, 0.21);
  expect(s.actions.slide.mock.calls.at(-1)).toEqual(['airco', 'target_temperature', 14, true]);
  expect(s.all('.top-of mh-radio-list, .top-of mh-choice-group')).toHaveLength(1);
  s.all('.top-of mh-radio-list, .top-of mh-choice-group')[0]!.dispatchEvent(new CustomEvent('change', { detail: { value: 'heat' }, bubbles: true, composed: true }));
  expect(s.actions.setCapability.mock.calls).toEqual([['airco', 'thermostat_mode', 'heat']]);
  expect(s.sheet()).toMatchObject({ icon: 'ac_unit', subheading: 'Nu 24,1°', iconOn: true });
  expect(s.top()!.textContent).toContain('47');
  // the rest stays, without what stands above
  expect(s.below()).toEqual(['se_onoff']);
});

test('heating without a measurement, a range or a mode: only what there is', async () => {
  const s = await open({ ...heating.valveBlind, available: true });
  expect([s.sheet().subheading, s.all('.top-of mh-radio-list, .top-of mh-choice-group').length]).toEqual(['', 0]);
  expect(s.below()).toEqual(['measure_battery']);
  const zone = await open(heating.zone);
  expect(texts(zone.top()!.querySelector('.ends')!)).toBe('4°|35°');
  // a mode that can only be read stands below
  const ro = await open(heating.modeReadOnly);
  expect([ro.below().includes('thermostat_mode'), ro.all('.top-of mh-choice-group, .top-of mh-radio-list').length]).toEqual([true, 0]);
  // a mode of the app itself is operated below
  expect((await open(heating.ownMode)).below()).toEqual(['netatmo_thermostat_mode']);
  // more zones: the others stay
  expect((await open(heating.zones)).below()).toEqual(expect.arrayContaining(['target_temperature.tank_water', 'target_temperature.zone2', 'onoff']));
});

test('a target that is not known has no place on its slider', async () => {
  const s = await open(heating.zone);
  await s.change('target_temperature', null);
  expect([inside<MhStepper>(s.panel, '.top-of mh-stepper').value, s.sliders()[0]!.fraction]).toEqual(['–', 0]);
});

// ----- cover -----

test('a curtain: a window that goes along, its buttons, its position and its slats', async () => {
  const s = await open(covers.both);
  expect(s.buttons()).toEqual(['Rolluik openen', 'Rolluik stoppen', 'Rolluik sluiten']);
  s.tap('Rolluik stoppen');
  expect(s.actions.setCapability.mock.calls).toEqual([['both', 'windowcoverings_state', 'idle']]);
  const win = inside(s.panel, '.win');
  expect([win.style.getPropertyValue('--_shut'), win.getAttribute('aria-hidden')]).toEqual(['0.75', 'true']);
  expect(s.sliders().map((x) => [x.label, x.valueText])).toEqual([['Stand van Rolluik', '25% open'], ['windowcoverings_tilt_set', '50%']]);
  commit(s.sliders()[0]!, 0.6);
  commit(s.sliders()[1]!, 0.1);
  expect(s.actions.slide.mock.calls).toEqual([['both', 'windowcoverings_set', 0.6, true], ['both', 'windowcoverings_tilt_set', 0.1, true]]);
  await s.change('windowcoverings_set', 1);
  expect(win.style.getPropertyValue('--_shut')).toBe('0');
  expect([s.below(), s.sheet().subheading]).toEqual([[], 'Gaat dicht…']);
});

test('two motors are two sliders, and an awning says how far out it is', async () => {
  const two = await open(covers.twoMotors);
  expect(two.sliders().map((x) => [x.label, x.fraction])).toEqual([['windowcoverings_set.top', 1], ['windowcoverings_set.bottom', 0.2]]);
  commit(two.sliders()[1]!, 0.5);
  expect(two.actions.slide.mock.calls).toEqual([['two', 'windowcoverings_set.bottom', 0.5, true]]);
  const awning = await open(covers.awning);
  expect([awning.sliders()[0]!.fraction, awning.sliders()[0]!.valueText, inside(awning.panel, '.win').style.getPropertyValue('--_shut')]).toEqual([0, 'Ingerold', '0']);
  commit(awning.sliders()[0]!, 1);
  expect(awning.actions.slide.mock.calls).toEqual([['awning', 'windowcoverings_set', 0, true]]);
});

test('a curtain that only opens and closes has no window to go along', async () => {
  const s = await open(covers.stateOnly);
  expect([s.all('.win').length, s.sliders().length, s.buttons().length]).toEqual([0, 0, 3]);
  // one that is also a switch keeps that below
  expect((await open(covers.withSwitch)).below()).toEqual(['onoff']);
});

// ----- media -----

test('a speaker: the song, where it is, its buttons and the volume', async () => {
  const s = await open(media.full);
  const song = texts(inside(s.panel, '.song'));
  expect([song, texts(inside(s.panel, '.times'))]).toEqual(['Nummer|Artiest · Album', '1:34|3:42']);
  expect(Number(inside(s.panel, '.bar').style.getPropertyValue('--_part'))).toBeCloseTo(94 / 222);
  expect(s.buttons()).toEqual(['Keuken: willekeurig', 'Keuken: vorige', 'Keuken: pauzeren', 'Keuken: volgende', 'Keuken: herhalen', 'Keuken dempen']);
  s.tap('Keuken: willekeurig');
  s.tap('Keuken: herhalen');
  s.tap('Keuken: volgende');
  expect(s.actions.setCapability.mock.calls).toEqual([['full', 'speaker_shuffle', true], ['full', 'speaker_repeat', 'track']]);
  expect(s.actions.press.mock.calls).toEqual([['full', 'speaker_next', true]]);
  commit(s.sliders()[0]!, 0.4);
  expect([s.sliders()[0]!.label, s.actions.slide.mock.calls]).toEqual(['Volume van Keuken', [['full', 'volume_set', 0.4, true]]]);
  expect([s.below(), s.sheet().subheading]).toEqual([[], 'Speelt']);
});

test('a speaker that cannot tell what it plays shows no song', async () => {
  const s = await open(media.bare);
  expect([s.all('.song, .bar').length, s.buttons()]).toEqual([0, ['Badkamer: vorige', 'Badkamer: afspelen', 'Badkamer: volgende', 'Badkamer dempen']]);
  await s.change('speaker_playing', null);
  expect(s.buttons()).toContain('Badkamer: afspelen');
});

test('a long title and a duration of nothing break nothing', async () => {
  const long = 'Een heel lange titel '.repeat(8).trim();
  const dev = structuredClone(media.full);
  dev.capabilities['speaker_track']!.value = long;
  dev.capabilities['speaker_duration']!.value = 0;
  const s = await open(dev);
  expect([inside(s.panel, '.song b').textContent, s.all('.bar').length]).toEqual([long, 0]);
  // an app that counts in thousandths
  dev.capabilities['speaker_duration']!.value = 222_000;
  dev.capabilities['speaker_position']!.value = 94_000;
  expect(texts(inside((await open(dev)).panel, '.times'))).toBe('1:34|3:42');
});

test('a television: on and off, muted, channels and volume', async () => {
  const s = await open(media.tv);
  expect(s.buttons()).toEqual(['Televisie uitzetten', 'Televisie dempen', 'Televisie: vorige zender', 'Televisie: volgende zender']);
  s.tap('Televisie: volgende zender');
  s.tap('Televisie uitzetten');
  expect([s.actions.press.mock.calls, s.actions.setCapability.mock.calls]).toEqual([[['tv', 'channel_up', true]], [['tv', 'onoff', false]]]);
  expect([s.sheet().icon, s.sheet().iconOn, s.below()]).toEqual(['tv', true, []]);
  const only = await open(media.tvButtons);
  expect(only.buttons()).toEqual(['Tv boven aanzetten', 'Tv boven dempen', 'Tv boven zachter', 'Tv boven harder', 'Tv boven: vorige zender', 'Tv boven: volgende zender']);
});

// ----- guard -----

test('a lock: where it is, since when, and the other way by holding', async () => {
  const dev = structuredClone(guards.lock);
  const at = new Date();
  at.setHours(8, 12, 0, 0);
  dev.capabilities['locked']!.lastUpdated = at.toISOString();
  const s = await open(dev);
  expect(texts(inside(s.panel, '.stands'))).toBe('|Op slot|Laatst veranderd om 08:12');
  const [unlock] = s.holds('.top-of');
  expect([unlock!.large, unlock!.guarded, unlock!.label]).toEqual([true, true, 'Voordeur ontgrendelen']);
  unlock!.dispatchEvent(new CustomEvent('ask', { bubbles: true, composed: true }));
  expect([s.asked, s.actions.guard.mock.calls]).toEqual([[{ deviceId: 'lock', capabilityId: 'locked', value: false }], []]);
  unlock!.dispatchEvent(new CustomEvent('go', { bubbles: true, composed: true }));
  expect(s.actions.guard.mock.calls).toEqual([['lock', 'locked', false]]);
  expect([s.sheet().icon, s.below()]).toEqual(['lock', ['alarm_contact', 'alarm_battery']]);
});

test('what changed another day says the day too; without a time nothing', async () => {
  const dev = structuredClone(guards.lock);
  dev.capabilities['locked']!.lastUpdated = '2020-03-04T07:05:00.000Z';
  expect((await open(dev)).top()!.textContent).toMatch(/Laatst veranderd op 4 maart/);
  dev.capabilities['locked']!.lastUpdated = 'no time';
  expect((await open(dev)).top()!.textContent).not.toContain('Laatst');
});

test('an alarm has its three states, and one that can only be read none', async () => {
  const s = await open(guards.alarm);
  expect(s.holds('.top-of').map((b) => [b.text, b.main])).toEqual([['Uit', true], ['Deels', false], ['Aan', false]]);
  const ro = await open(guards.readOnly);
  expect([ro.holds('.top-of').length, ro.top()!.textContent!.includes('Op slot')]).toEqual([0, true]);
});

test('whatever else of a lock or a garage door can be operated is held or asked too', async () => {
  const s = await open(guards.garageBusy);
  expect(s.all('.below mh-switch, .below mh-slider, .below mh-choice-group, .below mh-radio-list').length).toBe(0);
  expect(s.holds('.below').map((b) => [b.label, b.guarded])).toEqual([
    ['onoff: aanzetten', true], ['onoff.light: aanzetten', true], ['windowcoverings_set: 0%', true], ['windowcoverings_set: 100%', true], ['locked.remote: aanzetten', false], ['button.re_sync: uitvoeren', true],
  ]);
  s.holds('.below')[0]!.dispatchEvent(new CustomEvent('go', { bubbles: true, composed: true }));
  s.holds('.below')[3]!.dispatchEvent(new CustomEvent('ask', { bubbles: true, composed: true }));
  expect([s.actions.guard.mock.calls, s.asked]).toEqual([[['garage2', 'onoff', true]], [{ deviceId: 'garage2', capabilityId: 'windowcoverings_set', value: 1 }]]);
  expect([s.actions.setCapability.mock.calls, s.actions.slide.mock.calls, s.actions.press.mock.calls]).toEqual([[], [], []]);
});

test('a choice of a lock is a button per option; a number is asked about', async () => {
  const s = await open(guards.lockMode);
  expect(s.holds('.below').map((b) => [b.text, b.guarded, b.main])).toEqual([['always_locked', false, false], ['always_unlocked', true, false], ['locked_until_unlock', true, true]]);
  const dev = { ...guards.lock, capabilities: { ...guards.lock.capabilities, delay: cap('delay', { setable: true, title: 'Vertraging', value: 5 }) }, capabilityOrder: [...guards.lock.capabilityOrder, 'delay'] };
  const n = await open(dev);
  const field = inside(n.panel, 'mh-text-field');
  field.dispatchEvent(new CustomEvent('input', { detail: { value: '9' } }));
  await settle(n.panel);
  field.dispatchEvent(new CustomEvent('submit'));
  expect([n.asked, n.actions.setCapability.mock.calls, n.actions.guard.mock.calls]).toEqual([[{ deviceId: 'lock', capabilityId: 'delay', value: 9 }], [], []]);
});

test('a lock of a thermostat can lock it with one tap, and unlock it by holding', async () => {
  const s = await open(heating.childLock);
  expect(s.holds('.below').map((b) => [b.label, b.guarded])).toEqual([['locked: uitzetten', true]]);
});

test('while it works every button of it waits', async () => {
  const s = await open(guards.withLatch);
  s.busy.set('latch', { capabilityId: 'open', value: true });
  s.store.touch('latch');
  s.flush();
  await settle(s.panel);
  expect([s.holds().map((b) => b.busy), s.top()!.textContent!.includes('Bezig…')]).toEqual([[true, true], true]);
});

// ----- all of them -----

test.each<[string, Device]>([['climate', heating.airco], ['cover', covers.both], ['media', media.full], ['guard', guards.garageBusy]])('%s without a route, without a right and out of reach: to look at', async (_kind, dev) => {
  for (const s of [await open(dev, { route: null }), await open(dev, { canControl: false }), await open({ ...dev, available: false, unavailableMessage: 'Weg' })]) {
    expect(s.top()).not.toBeNull();
    for (const b of s.all<HTMLButtonElement>('.top-of .b')) expect(b.disabled).toBe(true);
    for (const slider of s.sliders()) expect(slider.disabled).toBe(true);
    for (const b of s.holds()) expect(b.disabled).toBe(true);
    for (const stepper of s.all<MhStepper>('mh-stepper')) expect([stepper.atLeast, stepper.atMost]).toEqual([true, true]);
  }
});

test('a press that only can be told is a button, and no switch', async () => {
  const dev = device({ id: 'x', deviceClass: 'other', caps: [cap('reset', { type: 'boolean', getable: false, setable: true, title: 'Herstellen' }), cap('onoff', { type: 'boolean', getable: false, setable: true, title: 'Aan' })] });
  const s = await open(dev);
  expect([s.all('.below mh-button').length, s.all('.below mh-switch').length]).toEqual([1, 1]);
});
