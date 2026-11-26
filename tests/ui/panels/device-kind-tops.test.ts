// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/panels/device-panel';
import type { MhDevicePanel } from '../../../src/ui/panels/device-panel';
import type { MhHoldButton } from '../../../src/ui/parts/hold-button';

import type { DashboardStatus } from '../../../src/ui/app/context';
import type { Device } from '../../../src/homey/types';

import { appliances, cars, chargers, fans, vacuums } from '../../helpers/devices';
import { inside, mount, record, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

// The top of the window of a fan, a vacuum cleaner, white goods, a charge point and a car, and what of it stands below.

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
/** What is seen; the line that is only read out is not. */
const texts = (el: Element) => [...el.children].filter((child) => !child.classList.contains('unseen')).map((child) => child.textContent!.trim()).join('|');
const commit = (slider: HTMLElement, fraction: number, type = 'commit') => slider.dispatchEvent(new CustomEvent(type, { detail: { fraction }, bubbles: true, composed: true }));


test('a fan: its state large, on and off and swinging, its speed, and its mode as it would stand below', async () => {
  const s = await open(fans.standing);
  expect(texts(inside(s.panel, '.stands'))).toBe('|Aan · 60%');
  expect(s.buttons()).toEqual(['Ventilator aan of uit', 'Ventilator zwenken']);
  expect(s.sliders().map((slider) => [slider.label, slider.valueText])).toEqual([['Snelheid van Ventilator', '60%']]);
  commit(s.sliders()[0]!, 0.25);
  expect(s.actions.slide.mock.calls).toEqual([['fan', 'fan_speed', 0.25, true]]);
  expect(s.top()!.textContent).toContain('fan_mode');
  expect(s.below()).toEqual(['measure_temperature']);
});

test('a vacuum cleaner: its battery as a bar, start and to the dock, and how hard it sucks', async () => {
  const s = await open(vacuums.full);
  expect(texts(inside(s.panel, '.stands'))).toBe('|In het dock · 100%');
  expect(inside(s.panel, '.top-of .bar').getAttribute('data-part')).toBe('1');
  expect(s.buttons()).toEqual(['Robotstofzuiger starten', 'Robotstofzuiger naar het dock']);
  s.tap('Robotstofzuiger naar het dock');
  expect(s.actions.setCapability.mock.calls).toEqual([['robot', 'vacuumcleaner_state', 'docked']]);
  // what is wrong is only hidden below when it stands on top
  expect(s.below()).toEqual(['volume_set', 'alarm_bin_full', 'alarm_stuck']);
});

test('a washing machine: how far, how long still, and switched off only by holding', async () => {
  const s = await open(appliances.washer);
  expect(texts(inside(s.panel, '.stands'))).toBe('|Bezig · nog 42 min');
  expect(inside(s.panel, '.top-of .bar').getAttribute('data-part')).toBe('0.6');
  const [off] = s.holds('.top-of');
  expect([off!.large, off!.guarded, off!.label]).toEqual([true, true, 'Wasmachine uitzetten']);
  off!.dispatchEvent(new CustomEvent('ask', { bubbles: true, composed: true }));
  expect(s.asked).toEqual([{ deviceId: 'washer', capabilityId: 'onoff', value: false }]);
  expect(s.below()).toEqual(['laundry_washer_program', 'measure_power', 'alarm_contact']);
});

test('a charge point: what it charges, this time, stopping by holding, and its power to aim at', async () => {
  const s = await open(chargers.full);
  expect(texts(inside(s.panel, '.stands'))).toBe('|Laadt · 11 kW|12 kWh deze keer');
  const [stop] = s.holds('.top-of');
  expect([stop!.guarded, stop!.label]).toEqual([true, 'Laadpaal: laden stoppen']);
  expect(s.top()!.textContent).toContain('target_power');
  expect(s.below()).toEqual(['meter_power', 'alarm_generic.car_connected']);
});

test('a car: its battery as a bar, how far it goes, and unlocking by holding; the rest below, held too', async () => {
  const s = await open(cars.tesla);
  expect(texts(inside(s.panel, '.stands'))).toBe('|64% · 240 km|Op slot · aan de lader');
  expect(inside(s.panel, '.top-of .bar').getAttribute('data-part')).toBe('0.64');
  const [unlock] = s.holds('.top-of');
  expect([unlock!.guarded, unlock!.label]).toEqual([true, 'Auto ontgrendelen']);
  expect(s.below()).toContain('target_temperature');
  // what can open it stands below, held
  const below = s.holds('.below');
  expect([below.length > 3, below.every((hold) => hold.guarded)]).toEqual([true, true]);
});

test('the window of a car says whether it is locked and plugged in; only the word of a state is read out when it changes', async () => {
  const s = await open(cars.tesla);
  expect(texts(inside(s.panel, '.stands'))).toBe('|64% · 240 km|Op slot · aan de lader');
  document.body.replaceChildren();
  const v = await open(vacuums.full);
  expect(inside(v.panel, '.stands [role="status"]').textContent).toBe('In het dock');
});
