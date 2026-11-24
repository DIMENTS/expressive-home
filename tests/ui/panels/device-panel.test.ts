// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/panels/device-panel';
import type { MhDevicePanel } from '../../../src/ui/panels/device-panel';
import type { DashboardStatus } from '../../../src/ui/app/context';
import type { Device } from '../../../src/homey/types';
import { cap, device } from '../../helpers/build';
import { inside, mount, record, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

afterEach(() => { document.body.replaceChildren(); });

const lamp = (extra: Partial<Device> = {}) => device({ id: 'l', name: 'Plafond', deviceClass: 'light', ...extra, caps: [
  cap('onoff', { type: 'boolean', setable: true, title: 'Aan', value: true }), cap('dim', { setable: true, min: 0, max: 1, title: 'Helderheid', value: 0.8 }),
  cap('button.identify', { type: 'boolean', setable: true, getable: false, title: 'Knipperen' }),
  cap('measure_power', { title: 'Vermogen', units: 'W', decimals: 2, value: 6.2 }), cap('rssi', { title: 'Signaalsterkte', units: 'dBm', value: -61 }),
] });

async function open(dev: Device = lamp(), status: Partial<DashboardStatus> = {}) {
  const fake = fakeContext([dev], status);
  const panel = await mount<MhDevicePanel>('mh-device-panel', { ctx: fake.ctx, deviceId: dev.id });
  await settle(panel);
  return { ...fake, panel };
}
const all = (panel: MhDevicePanel, selector: string) => [...panel.shadowRoot!.querySelectorAll(selector)] as HTMLElement[];
const sheet = (panel: MhDevicePanel) => inside(panel, 'mh-sheet') as HTMLElement & { open: boolean; heading: string; subheading: string };

test('the panel shows the three groups and follows live changes', async () => {
  const { panel, store, flush } = await open();
  expect(sheet(panel).open).toBe(true);
  expect(sheet(panel).heading).toBe('Plafond');
  expect(all(panel, 'h3').map((h) => h.textContent)).toEqual(['Bedienen', 'Waarden']);
  const technical = inside(panel, 'details') as HTMLDetailsElement;
  expect(technical.open).toBe(false);
  expect(technical.querySelector('summary')!.textContent).toContain('Technisch');
  expect(panel.shadowRoot!.textContent).toContain('6,2 W');
  store.apply({ type: 'capability', deviceId: 'l', capabilityId: 'measure_power', value: 7.45, at: null });
  flush();
  await settle(panel);
  expect(panel.shadowRoot!.textContent).toContain('7,45 W');
});

test('a closed panel has no device', async () => {
  const fake = fakeContext([lamp()]);
  const panel = await mount<MhDevicePanel>('mh-device-panel', { ctx: fake.ctx, deviceId: null });
  expect(sheet(panel).open).toBe(false);
});

test('a control sends its change through the actions', async () => {
  const { panel, actions } = await open();
  const sw = inside(panel, 'mh-switch');
  sw.dispatchEvent(new CustomEvent('change', { detail: { checked: false }, bubbles: true, composed: true }));
  expect(actions.setCapability).toHaveBeenCalledWith('l', 'onoff', false);
  const slider = inside(panel, 'mh-slider');
  slider.dispatchEvent(new CustomEvent('slide', { detail: { fraction: 0.42 }, bubbles: true, composed: true }));
  slider.dispatchEvent(new CustomEvent('commit', { detail: { fraction: 0.5 }, bubbles: true, composed: true }));
  expect(actions.slide.mock.calls).toEqual([['l', 'dim', 0.42, false], ['l', 'dim', 0.5, true]]);
  const run = all(panel, 'mh-button').find((b) => b.textContent?.includes('Uitvoeren'))!;
  run.shadowRoot!.querySelector('button')!.click();
  expect(actions.press).toHaveBeenCalledWith('l', 'button.identify');
});

test('a number without a range is sent with Enter, also with a decimal comma', async () => {
  const thermostat = device({ id: 't', name: 'Kachel', caps: [cap('target', { setable: true, title: 'Doel', units: '°C', value: 20 })] });
  const { panel, actions } = await open(thermostat);
  const field = inside(panel, 'mh-text-field');
  field.dispatchEvent(new CustomEvent('input', { detail: { value: '21,5' }, bubbles: true, composed: true }));
  field.dispatchEvent(new CustomEvent('submit', { bubbles: true, composed: true }));
  expect(actions.setCapability).toHaveBeenCalledWith('t', 'target', 21.5);
  field.dispatchEvent(new CustomEvent('input', { detail: { value: 'warm' }, bubbles: true, composed: true }));
  field.dispatchEvent(new CustomEvent('submit', { bubbles: true, composed: true }));
  expect(actions.setCapability).toHaveBeenCalledTimes(1);
});

test('a choice sends the option id', async () => {
  const inverter = device({ id: 'o', name: 'Omvormer', caps: [cap('mode', { type: 'enum', setable: true, title: 'Modus', value: 'on', options: [{ id: 'on', title: 'Aan' }, { id: 'charge', title: 'Alleen laden' }, { id: 'invert', title: 'Alleen omvormen' }, { id: 'off', title: 'Uit' }] })] });
  const { panel, actions } = await open(inverter);
  inside(panel, 'mh-radio-list').dispatchEvent(new CustomEvent('change', { detail: { value: 'charge' }, bubbles: true, composed: true }));
  expect(actions.setCapability).toHaveBeenCalledWith('o', 'mode', 'charge');
});

test('controls are switched off, with a note, when the device is unavailable, the route is gone or the key may not control', async () => {
  const cases: [Device, Partial<DashboardStatus>, string][] = [
    [lamp({ available: false, unavailableMessage: 'Apparaat is offline' }), {}, 'Niet bereikbaar.'],
    [lamp(), { route: null }, 'Geen verbinding.'],
    [lamp(), { canControl: false }, 'Deze sleutel mag geen apparaten bedienen.'],
  ];
  for (const [dev, status, note] of cases) {
    const { panel } = await open(dev, status);
    expect(inside(panel, 'mh-note').textContent).toContain(note);
    expect((inside(panel, 'mh-switch') as HTMLElement & { disabled: boolean }).disabled).toBe(true);
    expect((inside(panel, 'mh-slider') as HTMLElement & { disabled: boolean }).disabled).toBe(true);
    expect(panel.shadowRoot!.textContent).toContain('6,2 W');
    document.body.replaceChildren();
  }
});

test('the panel closes when its device disappears', async () => {
  const { panel, store, flush } = await open();
  const closes = record(panel, 'close');
  store.apply({ type: 'deviceRemoved', deviceId: 'l' });
  flush();
  await settle(panel);
  expect(closes.length).toBeGreaterThanOrEqual(1);
});

test('closing gives the focus back to the tile', async () => {
  const tile = document.createElement('button');
  document.body.append(tile);
  tile.focus();
  const { panel } = await open();
  panel.deviceId = null;
  await settle(panel);
  await settle(sheet(panel) as unknown as { updateComplete: Promise<unknown> });
  expect(document.activeElement).toBe(tile);
});

test('Escape and the close button ask to close', async () => {
  const { panel } = await open();
  const closes = record(panel, 'close');
  sheet(panel).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  expect(closes).toHaveLength(1);
});

// Final review, issue 2: a control in the window that is refused shows the real state again.
test('controls in the window spring back when nothing changes in the store', async () => {
  const { panel } = await open();
  const sw = inside(panel, 'mh-switch') as HTMLElement & { checked: boolean };
  sw.checked = false;
  sw.dispatchEvent(new CustomEvent('change', { detail: { checked: false }, bubbles: true, composed: true }));
  const slider = inside(panel, 'mh-slider') as HTMLElement & { fraction: number };
  slider.fraction = 0.1;
  slider.dispatchEvent(new CustomEvent('commit', { detail: { fraction: 0.1 }, bubbles: true, composed: true }));
  await settle(panel);
  expect(sw.checked).toBe(true);
  expect(slider.fraction).toBe(0.8);
});

test('after sending, a number or text field follows the hub again instead of keeping the typed text', async () => {
  const thermostat = device({ id: 't', name: 'Kachel', caps: [cap('target', { setable: true, title: 'Doel', units: '°C', value: 20 }), cap('note', { type: 'string', setable: true, title: 'Notitie', value: 'oud' })] });
  const { panel, actions, store, flush } = await open(thermostat);
  const [number, text] = all(panel, 'mh-text-field') as (HTMLElement & { value: string })[];
  number!.dispatchEvent(new CustomEvent('input', { detail: { value: '21,5' }, bubbles: true, composed: true }));
  number!.dispatchEvent(new CustomEvent('submit', { bubbles: true, composed: true }));
  text!.dispatchEvent(new CustomEvent('input', { detail: { value: 'nieuw' }, bubbles: true, composed: true }));
  text!.dispatchEvent(new CustomEvent('submit', { bubbles: true, composed: true }));
  expect(actions.setCapability).toHaveBeenCalledWith('t', 'target', 21.5);
  expect(actions.setCapability).toHaveBeenCalledWith('t', 'note', 'nieuw');
  // the hub settles on other values: the fields show what the hub has, not what was typed
  store.apply({ type: 'capability', deviceId: 't', capabilityId: 'target', value: 21, at: null });
  store.apply({ type: 'capability', deviceId: 't', capabilityId: 'note', value: 'bewaard', at: null });
  flush();
  await settle(panel);
  expect(number!.value).toBe('21');
  expect(text!.value).toBe('bewaard');
});

test('an invalid number shows an error at the field and sends nothing', async () => {
  const thermostat = device({ id: 't', name: 'Kachel', caps: [cap('target', { setable: true, title: 'Doel', units: '°C', value: 20 })] });
  const { panel, actions } = await open(thermostat);
  const field = inside(panel, 'mh-text-field') as HTMLElement & { state: string; help: string };
  for (const bad of ['0x10', '1e3', '1.000,5']) {
    field.dispatchEvent(new CustomEvent('input', { detail: { value: bad }, bubbles: true, composed: true }));
    field.dispatchEvent(new CustomEvent('submit', { bubbles: true, composed: true }));
  }
  await settle(panel);
  expect(actions.setCapability).not.toHaveBeenCalled();
  expect(field.state).toBe('error');
  expect(field.help).toBe('Vul een getal in, zoals 21,5.');
  // typing again clears the error
  field.dispatchEvent(new CustomEvent('input', { detail: { value: '21' }, bubbles: true, composed: true }));
  await settle(panel);
  expect(field.state).not.toBe('error');
});

test('a number field writes its value in the notation of the language', async () => {
  const { createTranslate } = await import('../../../src/i18n');
  const thermostat = device({ id: 't', name: 'Kachel', caps: [cap('target', { setable: true, title: 'Doel', units: '°C', value: 20.5 })] });
  const dutch = await open(thermostat);
  expect((inside(dutch.panel, 'mh-text-field') as HTMLElement & { value: string }).value).toBe('20,5');
  document.body.replaceChildren();
  const fake = fakeContext([thermostat]);
  const panel = await mount<MhDevicePanel>('mh-device-panel', { ctx: { ...fake.ctx, t: createTranslate('en') }, deviceId: 't' });
  await settle(panel);
  expect((inside(panel, 'mh-text-field') as HTMLElement & { value: string }).value).toBe('20.5');
  expect((inside(panel, 'mh-sheet') as HTMLElement & { t: { language: string } }).t.language).toBe('en');
});
