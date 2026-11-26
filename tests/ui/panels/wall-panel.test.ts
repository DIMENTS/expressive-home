// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/panels/wall-panel';
import type { MhWallPanel } from '../../../src/ui/panels/wall-panel';
import { createTranslate } from '../../../src/i18n';
import { defaultWall, emptyWallHub, type WallHub, type WallSettings } from '../../../src/wall/settings';
import { mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const ON: WallSettings = { ...defaultWall(), on: true };
const ref = (deviceId: string) => ({ deviceId, capabilityId: 'measure_temperature' });
const SOURCES = [{ ref: ref('a'), name: 'Kamersensor', zone: 'Woonkamer' }, { ref: ref('b'), name: 'Tuinsensor', zone: '' }];
const TANKS = [{ id: 't1', name: 'Afvalwater' }, { id: 't2', name: 'Schoon water' }];

async function open(props: Partial<MhWallPanel> = {}) {
  const panel = await mount<MhWallPanel>('mh-wall-panel', { open: true, wall: ON, hub: emptyWallHub(), sources: SOURCES, tanks: TANKS, hasBattery: true, served: true, ...props });
  const root = () => panel.shadowRoot!;
  const all = <E extends HTMLElement>(selector: string) => [...root().querySelectorAll<E>(selector)];
  const text = () => (root().textContent ?? '').replace(/\s+/g, ' ');
  const headings = () => all('h3').map((h) => h.textContent);
  const named = (tag: string, label: string) => all<HTMLElement & { value: string; checked: boolean; options: { id: string; label: string }[] }>(tag).find((e) => (e as unknown as { label: string }).label === label);
  const button = (label: string) => all<HTMLElement & { label: string }>('mh-button').find((b) => b.label === label || b.textContent?.trim() === label);
  const press = async (label: string) => { button(label)!.click(); await settle(panel); };
  const change = (element: HTMLElement, detail: unknown) => element.dispatchEvent(new CustomEvent('change', { detail, bubbles: true, composed: true }));
  return { panel, all, text, headings, named, button, press, change, changes: record<{ wall?: WallSettings; hub?: WallHub }>(panel, 'change') };
}

test('off: only the switch to turn it on', async () => {
  const s = await open({ wall: defaultWall() });
  expect(s.headings()).toEqual(['Rustbeeld']);
  expect(s.named('mh-switch', 'Rustbeeld tonen')!.checked).toBe(false);
  expect([s.all('mh-choice-group').length, s.all('mh-button').length]).toEqual([0, 0]);
  s.change(s.named('mh-switch', 'Rustbeeld tonen')!, { checked: true });
  expect(s.changes).toEqual([{ wall: ON }]);
});

test('on: everything there is to choose', async () => {
  const s = await open();
  expect(s.headings()).toEqual(['Rustbeeld', 'Nacht', 'Temperatuur', 'Wat aandacht vraagt']);
  expect(s.text()).toContain('Zet op de tablet zelf in dat het scherm aan blijft.');
  expect(s.text()).toContain('Een flow op je Homey kan de nacht eerder aan- of uitzetten.');
  expect(s.text()).toContain('Bijna leeg is onder 15%, bijna vol boven 90%.');
  expect(s.text()).toContain('Rode alarmen staan er altijd.');
});

test('every choice says the new settings, with the rest as they were', async () => {
  const s = await open();
  s.change(s.named('mh-choice-group', 'Na')!, { value: '5' });
  s.change(s.named('mh-switch', 'Nacht')!, { checked: false });
  s.change(s.named('mh-time-field', 'Van')!, { value: '21:00' });
  s.change(s.named('mh-time-field', 'Tot')!, { value: '06:45' });
  s.change(s.named('mh-switch', 'Accu bijna leeg')!, { checked: false });
  expect(s.changes).toEqual([
    { wall: { ...ON, after: 5 } }, { wall: { ...ON, night: { ...ON.night, on: false } } }, { wall: { ...ON, night: { ...ON.night, from: '21:00' } } },
    { wall: { ...ON, night: { ...ON.night, to: '06:45' } } }, { wall: { ...ON, lowBattery: false } },
  ]);
  expect(s.named('mh-choice-group', 'Na')!.options.map((o) => [o.id, o.label])).toEqual([['1', '1 min'], ['2', '2 min'], ['5', '5 min'], ['10', '10 min']]);
  expect(s.named('mh-choice-group', 'Na')!.value).toBe('2');
});

test('a value there is not changes nothing', async () => {
  const s = await open();
  s.change(s.named('mh-choice-group', 'Na')!, { value: '7' });
  s.change(s.named('mh-choice-group', 'Afvalwater')!, { value: 'x' });
  expect(s.changes).toEqual([]);
});

test('without a night there are no times; without the app on the hub there is no flow', async () => {
  const s = await open({ wall: { ...ON, night: { ...ON.night, on: false } } });
  expect([s.all('mh-time-field').length, s.text().includes('flow')]).toEqual([0, false]);
  expect((await open({ served: false })).text()).not.toContain('flow');
});

test('the temperatures: a list that opens, with a room where there is one, and none', async () => {
  const s = await open({ hub: { ...emptyWallHub(), inside: ref('a') } });
  expect(s.text()).toContain('Kamersensor');
  expect(s.all('mh-radio-list')).toHaveLength(0);
  const chooser = s.button('Binnen kiezen')!;
  const inner = chooser.shadowRoot!.querySelector('button')!;
  expect([inner.getAttribute('aria-expanded'), inner.getAttribute('aria-label')]).toEqual(['false', 'Binnen kiezen']);
  await s.press('Binnen kiezen');
  await settle(chooser as never);
  expect(inner.getAttribute('aria-expanded')).toBe('true');
  const list = s.named('mh-radio-list', 'Binnen')!;
  expect([list.options.map((o) => o.label), list.value]).toEqual([['Geen', 'Kamersensor · Woonkamer', 'Tuinsensor'], 'a/measure_temperature']);
  s.change(list, { value: 'b/measure_temperature' });
  s.change(list, { value: 'none' });
  expect(s.changes).toEqual([{ hub: { ...emptyWallHub(), inside: ref('b') } }, { hub: emptyWallHub() }]);
  // the other one opens, this one closes
  await s.press('Buiten kiezen');
  expect(s.all<HTMLElement & { label: string }>('mh-radio-list').map((l) => l.label)).toEqual(['Buiten']);
  await s.press('Buiten kiezen');
  expect(s.all('mh-radio-list')).toHaveLength(0);
});

test('a sensor that was chosen and went is none', async () => {
  const s = await open({ hub: { ...emptyWallHub(), outside: ref('gone') } });
  await s.press('Buiten kiezen');
  expect(s.named('mh-radio-list', 'Buiten')!.value).toBe('none');
});

test('the tanks, each with what it is watched for', async () => {
  const hub: WallHub = { ...emptyWallHub(), tanks: { t2: 'low' } };
  const s = await open({ hub });
  expect([s.named('mh-choice-group', 'Afvalwater')!.value, s.named('mh-choice-group', 'Schoon water')!.value]).toEqual(['off', 'low']);
  expect(s.named('mh-choice-group', 'Afvalwater')!.options.map((o) => o.label)).toEqual(['Niet', 'Bijna leeg', 'Bijna vol']);
  s.change(s.named('mh-choice-group', 'Afvalwater')!, { value: 'high' });
  s.change(s.named('mh-choice-group', 'Schoon water')!, { value: 'off' });
  expect(s.changes).toEqual([{ hub: { ...hub, tanks: { t2: 'low', t1: 'high' } } }, { hub: { ...hub, tanks: {} } }]);
});

test('what there is not cannot be chosen', async () => {
  const none = await open({ sources: [], tanks: [], hasBattery: false });
  expect(none.headings()).toEqual(['Rustbeeld', 'Nacht']);
  const battery = await open({ sources: [], tanks: [] });
  expect(battery.headings()).toEqual(['Rustbeeld', 'Nacht', 'Wat aandacht vraagt']);
  expect([battery.text().includes('bijna vol'), battery.text().includes('Rode alarmen staan er altijd.')]).toEqual([false, true]);
  expect((await open({ hasBattery: false })).named('mh-switch', 'Accu bijna leeg')).toBeUndefined();
});

test('having a look, at the day and at the night', async () => {
  const s = await open();
  const looks = record<{ look: string }>(s.panel, 'preview');
  await s.press('Rustbeeld bekijken');
  await s.press('Nacht bekijken');
  expect(looks).toEqual([{ look: 'day' }, { look: 'night' }]);
});

test('it closes, and begins anew the next time', async () => {
  const s = await open();
  await s.press('Binnen kiezen');
  const closes = record(s.panel, 'close');
  s.all('mh-sheet')[0]!.dispatchEvent(new CustomEvent('close'));
  expect(closes).toHaveLength(1);
  s.panel.open = false;
  await settle(s.panel);
  s.panel.open = true;
  await settle(s.panel);
  expect(s.all('mh-radio-list')).toHaveLength(0);
});

test('in English', async () => {
  const s = await open({ t: createTranslate('en') });
  expect(s.headings()).toEqual(['Rest screen', 'Night', 'Temperature', 'What needs attention']);
  expect(s.text()).toContain('On the tablet itself, set the screen to stay on.');
  expect(s.named('mh-choice-group', 'Afvalwater')!.options.map((o) => o.label)).toEqual(['Off', 'Almost empty', 'Almost full']);
});

test('while there is nothing to look at, there are no buttons for it', async () => {
  const s = await open({ canPreview: false });
  expect([s.button('Rustbeeld bekijken'), s.button('Nacht bekijken'), s.text().includes('Zo ziet het eruit')]).toEqual([undefined, undefined, false]);
});

test('with Fully Kiosk: how bright the rest screen is and what the night does to the screen', async () => {
  const s = await open({ fully: true });
  expect(s.headings()).toEqual(['Rustbeeld', 'Nacht', 'Scherm', 'Temperatuur', 'Wat aandacht vraagt']);
  const rest = s.named('mh-choice-group', 'Helderheid van het rustbeeld')!;
  const night = s.named('mh-choice-group', 'Het scherm in de nacht')!;
  expect([rest.options.map((o) => o.label), rest.value]).toEqual([['Niet dimmen', '50%', '25%', '10%'], 'none']);
  expect([night.options.map((o) => o.label), night.value]).toEqual([['Heel zwak', 'Niet dimmen'], 'none']);
  s.change(rest, { value: '10' });
  s.change(night, { value: 'dim' });
  s.change(night, { value: 'off' });
  expect(s.changes.map((c) => c.wall!.screen)).toEqual([{ rest: 10, night: 'none' }, { rest: 'none', night: 'dim' }]);
  expect(s.text()).not.toContain('Enable JavaScript Interface');
});

test('without Fully Kiosk: one sentence on how the screen could be dimmed, and no choices for it', async () => {
  const s = await open();
  expect(s.headings()).not.toContain('Scherm');
  expect(s.text()).toContain('Met Fully Kiosk op een Android-tablet kan het dashboard het scherm echt dimmen. Zet daarvoor in Fully onder Advanced Web Settings “Enable JavaScript Interface” aan.');
});
