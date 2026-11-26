// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/screens/rest-screen';
import type { MhRestScreen } from '../../../src/ui/screens/rest-screen';
import type { HeroSpec } from '../../../src/dashboard/types';
import type { Device } from '../../../src/homey/types';
import { createTranslate } from '../../../src/i18n';
import { colorTokens } from '../../../src/theme/engine';
import { rustigExpressive } from '../../../src/theme/rustig-expressive';
import { defaultWall, emptyWallHub } from '../../../src/wall/settings';
import { cap, device } from '../../helpers/build';
import { camper } from '../../helpers/camper';
import { mount, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

afterEach(() => { document.body.replaceChildren(); });

const NOW = new Date(2026, 10, 23, 20, 41);
const BATTERY = { deviceId: 'accu', capabilityId: 'battery_soc' };

function home(): Device[] {
  return [
    device({ id: 'accu', name: 'Accu', deviceClass: 'battery', caps: [cap('battery_soc', { units: '%', value: 78 }), cap('time_to_go', { units: 'min', value: 840 })] }),
    device({ id: 'sun', name: 'Zon', deviceClass: 'solarpanel', caps: [cap('measure_power', { units: 'W', value: 412 })] }),
    device({ id: 'room', name: 'Kamer', caps: [cap('measure_temperature', { units: '°C', value: 21.4 })] }),
    device({ id: 'yard', name: 'Tuin', caps: [cap('measure_temperature', { units: '°C', value: 8.2 })] }),
    device({ id: 'tank', name: 'Schoon water', caps: [cap('tank_level', { units: '%', value: 50 })] }),
    device({ id: 'leak', name: 'Badkamer', caps: [cap('alarm_water', { type: 'boolean', value: false, title: 'Wateralarm' })] }),
    device({ id: 'smoke', name: 'Keuken', caps: [cap('alarm_smoke', { type: 'boolean', value: false, title: 'Rook' })] }),
    device({ id: 'remote', name: 'Zender', caps: [cap('alarm_battery', { type: 'boolean', value: false, title: 'Batterij' })] }),
  ];
}
const HERO: HeroSpec = {
  kind: 'battery', deviceIds: ['accu', 'sun'], primary: BATTERY, timeToGo: { deviceId: 'accu', capabilityId: 'time_to_go' },
  stats: [{ role: 'solar', ref: { deviceId: 'sun', capabilityId: 'measure_power' } }],
};
const HUB = { inside: { deviceId: 'room', capabilityId: 'measure_temperature' }, outside: { deviceId: 'yard', capabilityId: 'measure_temperature' }, tanks: { tank: 'low' as const } };

async function setup(props: Partial<MhRestScreen> = {}, devices = home()) {
  const fake = fakeContext(devices);
  const element = await mount<MhRestScreen>('mh-rest-screen', { ctx: fake.ctx, hero: HERO, battery: BATTERY, wall: { ...defaultWall(), on: true }, hub: HUB, now: NOW, ...props });
  const all = (selector: string) => [...element.shadowRoot!.querySelectorAll<HTMLElement>(selector)];
  const text = (selector: string) => all(selector).map((e) => e.textContent!.replace(/\s+/g, ' ').trim());
  const report = async (deviceId: string, capabilityId: string, value: unknown) => {
    fake.store.apply({ type: 'capability', deviceId, capabilityId, value: value as number, at: null });
    fake.flush();
    await settle(element);
  };
  return { ...fake, element, all, text, report };
}

test('by day it shows the time, the day, the temperatures and the battery', async () => {
  const s = await setup();
  expect([s.text('.clock'), s.text('.date')]).toEqual([['20:41'], ['Maandag 23 november']]);
  expect(s.text('.temp')).toEqual(['21,4° Binnen', '8,2° Buiten']);
  expect([s.text('.number'), s.text('.line'), s.text('.stat')]).toEqual([['78%'], ['Nog ongeveer 14 uur'], ['412 W Zon']]);
  expect(s.all('svg.wave path')).toHaveLength(2);
  expect(s.text('.pill')).toEqual([]);
  expect(s.all('.title')).toHaveLength(0);
});

test('the time goes on', async () => {
  const s = await setup();
  s.element.now = new Date(2026, 10, 24, 0, 0);
  await settle(s.element);
  expect([s.text('.clock'), s.text('.date')]).toEqual([['00:00'], ['Dinsdag 24 november']]);
});

test('only what was chosen and has a value is shown', async () => {
  const s = await setup({ hub: { ...emptyWallHub(), outside: HUB.outside } });
  expect(s.text('.temp')).toEqual(['8,2° Buiten']);
  await s.report('yard', 'measure_temperature', null);
  expect(s.text('.temp')).toEqual([]);
  expect((await setup({ hub: emptyWallHub() })).text('.temp')).toEqual([]);
});

test('without a hero the bottom is empty; another hero says what it is', async () => {
  expect((await setup({ hero: null })).all('.hero')).toHaveLength(0);
  const solar: HeroSpec = { kind: 'solar', deviceIds: ['sun'], primary: { deviceId: 'sun', capabilityId: 'measure_power' }, timeToGo: null, stats: [] };
  const s = await setup({ hero: solar });
  expect([s.text('.title'), s.text('.number'), s.all('svg.wave').length]).toEqual([['Zon'], ['412W'], 0]);
});

test('the wave: nothing to the left of it when empty, nothing to the right of it when full', async () => {
  const s = await setup();
  await s.report('accu', 'battery_soc', 0);
  expect(s.all('svg.wave path').map((p) => p.getAttribute('class'))).toEqual(['rest']);
  await s.report('accu', 'battery_soc', 100);
  expect(s.all('svg.wave path').map((p) => p.getAttribute('class'))).toEqual(['active']);
});

test('what changes on the hub changes here', async () => {
  const s = await setup();
  await s.report('accu', 'battery_soc', 77);
  await s.report('sun', 'measure_power', 0);
  await s.report('room', 'measure_temperature', 20);
  expect([s.text('.number'), s.text('.stat'), s.text('.temp')]).toEqual([['77%'], ['0 W Zon'], ['20° Binnen', '8,2° Buiten']]);
  await s.report('leak', 'alarm_water', true);
  await s.report('tank', 'tank_level', 12);
  expect(s.all('.pill').map((p) => [p.className, p.textContent!.trim()])).toEqual([['pill alarm', 'Badkamer · Wateralarm'], ['pill warn', 'Schoon water bijna leeg · 12%']]);
});

test('what was told stays until it is well past its limit', async () => {
  const s = await setup();
  const told: boolean[] = [];
  for (const value of [20, 19, 21, 22, 21]) {
    await s.report('accu', 'battery_soc', value);
    told.push(s.all('.pill').length > 0);
  }
  expect(told).toEqual([false, true, true, false, false]);
});

test('more than three things to tell are counted', async () => {
  const s = await setup();
  for (const [id, alarm] of [['leak', 'alarm_water'], ['smoke', 'alarm_smoke'], ['remote', 'alarm_battery']] as const) await s.report(id, alarm, true);
  await s.report('tank', 'tank_level', 2);
  expect(s.text('.pill')).toEqual(['Badkamer · Wateralarm', 'Keuken · Rook', 'Zender · Batterij', '+1']);
});

test('a device that goes takes its things along, and what comes back is there again', async () => {
  const s = await setup();
  s.store.apply({ type: 'deviceRemoved', deviceId: 'accu' });
  s.store.apply({ type: 'deviceRemoved', deviceId: 'room' });
  s.flush();
  await settle(s.element);
  expect([s.text('.temp'), s.text('.pill')]).toEqual([['8,2° Buiten'], []]);
  expect(s.text('.number').join()).not.toContain('78');
  const fresh = home().find((d) => d.id === 'room')!;
  s.store.apply({ type: 'device', device: fresh });
  s.flush();
  await settle(s.element);
  expect(s.text('.clock')).toEqual(['20:41']);
});

test('a hub that does not answer: what is known stays, without its colour', async () => {
  const s = await setup({ away: true });
  expect(s.all('.pill').map((p) => p.textContent!.trim())).toEqual(['Je Homey antwoordt niet']);
  expect([s.all('.screen.stale').length, s.text('.number')]).toEqual([1, ['78%']]);
  s.element.away = false;
  await settle(s.element);
  expect([s.all('.screen.stale').length, s.text('.pill')]).toEqual([0, []]);
});

test('without anything known yet there is the clock', async () => {
  const s = await setup({ hero: null, battery: null, hub: emptyWallHub() }, []);
  expect([s.text('.clock'), s.text('.temp'), s.text('.pill'), s.all('.hero').length]).toEqual([['20:41'], [], [], 0]);
});

test('at night there is a clock, and alarms that matter', async () => {
  const s = await setup({ night: true, away: true });
  expect([s.text('.clock'), s.all('.date').length, s.all('.temp').length, s.all('.hero').length, s.all('.pill').length]).toEqual([['20:41'], 0, 0, 0, 0]);
  expect(s.all('.screen.night')).toHaveLength(1);
  await s.report('remote', 'alarm_battery', true);
  await s.report('tank', 'tank_level', 2);
  expect(s.text('.faint')).toEqual([]);
  await s.report('leak', 'alarm_water', true);
  await s.report('smoke', 'alarm_smoke', true);
  expect(s.text('.faint')).toEqual(['Badkamer · Wateralarm', 'Keuken · Rook']);
  // the morning comes
  s.element.night = false;
  await settle(s.element);
  expect([s.all('.screen.night').length, s.all('.hero').length, s.text('.pill').length]).toEqual([0, 1, 4]);
});

test('it moves a little every minute, against burning in', async () => {
  const s = await setup();
  const place = () => ['--_x', '--_y'].map((name) => s.element.style.getPropertyValue(name)).join();
  const places = new Set<string>();
  for (let minute = 0; minute < 8; minute += 1) {
    s.element.now = new Date(2026, 10, 23, 20, minute);
    await settle(s.element);
    places.add(place());
  }
  expect(places.size).toBe(8);
});

test('the battery has the colour of its hero', async () => {
  const s = await setup({ heroSeed: '#a6422a', mode: 'dark' });
  const hero = s.all('.hero')[0]!;
  expect(hero.style.getPropertyValue('--c-primary')).toBe(colorTokens('#a6422a', 'dark', 0)['--c-primary']);
  s.element.heroSeed = null;
  await settle(s.element);
  expect(s.all('.hero')[0]!.style.getPropertyValue('--c-primary')).toBe('');
});

test('a hero that comes later gets its colour too', async () => {
  const s = await setup({ hero: null, heroSeed: '#a6422a' });
  s.element.hero = HERO;
  await settle(s.element);
  expect(s.all('.hero')[0]!.style.getPropertyValue('--c-primary')).not.toBe('');
});

test('for a screen reader and the keyboard it is one button', async () => {
  const s = await setup();
  const buttons = s.all('button');
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Rustbeeld. Tik om het dashboard te openen.']);
  expect(s.all('.picture')[0]!.getAttribute('aria-hidden')).toBe('true');
  expect(s.element.shadowRoot!.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).toHaveLength(0);
  s.element.focus();
  expect(s.element.shadowRoot!.activeElement).toBe(buttons[0]);
});

test('in English', async () => {
  const s = await setup();
  s.element.ctx = { ...s.ctx, t: createTranslate('en') };
  await settle(s.element);
  expect([s.text('.date'), s.text('.temp')]).toEqual([['Monday 23 November'], ['21.4° Inside', '8.2° Outside']]);
});

test('it stops listening when it goes', async () => {
  const s = await setup();
  let redraws = 0;
  const update = s.element.requestUpdate.bind(s.element);
  s.element.requestUpdate = (...args) => { redraws += 1; return update(...args); };
  s.element.remove();
  s.store.apply({ type: 'capability', deviceId: 'accu', capabilityId: 'battery_soc', value: 5, at: null });
  s.flush();
  expect(redraws).toBe(0);
});

test('a device that has nothing to do with it does not draw it again', async () => {
  const s = await setup({}, [...home(), device({ id: 'lamp', name: 'Lamp', caps: [cap('dim', { value: 0 })] })]);
  let redraws = 0;
  const update = s.element.requestUpdate.bind(s.element);
  s.element.requestUpdate = (...args) => { redraws += 1; return update(...args); };
  await s.report('lamp', 'dim', 1);
  expect(redraws).toBe(0);
  await s.report('accu', 'battery_soc', 5);
  expect(redraws).toBeGreaterThan(0);
});

test('the camper, as it is', async () => {
  const fake = camper();
  const element = await mount<MhRestScreen>('mh-rest-screen', { ctx: fake.ctx, hero: fake.dashboard.hero, battery: fake.dashboard.hero!.primary, wall: defaultWall(), hub: emptyWallHub(), now: NOW });
  expect(element.shadowRoot!.querySelectorAll('.stat')).toHaveLength(4);
});

test('nothing moves by itself', async () => {
  const { MhRestScreen } = await import('../../../src/ui/screens/rest-screen');
  const css = MhRestScreen.styles.slice(1).map((s) => ('cssText' in s ? s.cssText : '')).join('\n');
  expect([...css.matchAll(/animation:\s*([^;]+);/g)].map((m) => m[1]!.trim()).filter((value) => value !== 'none')).toEqual(['show var(--motion-effects)']);
  expect(css).not.toContain('infinite');
});

test('the texts can be read: 4.5 to 1, large ones 3 to 1', () => {
  const luminance = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
  const { components } = rustigExpressive;
  const failures: string[] = [];
  for (const preset of rustigExpressive.color.presets) {
    for (const mode of ['light', 'dark'] as const) {
      const tokens = colorTokens(preset.seed, mode, 0);
      const colour = (name: string): string => tokens[/^var\((--c-[\w-]+)\)$/.exec(components[name]!)![1]!]!;
      for (const [fg, bg, least] of [
        ['rest-fg', 'rest-bg', 4.5], ['rest-fg-muted', 'rest-bg', 4.5], ['rest-accent', 'rest-bg', 3], ['rest-stale-wave', 'rest-bg', 3],
        ['rest-alarm-fg', 'rest-alarm-bg', 4.5], ['rest-warn-fg', 'rest-warn-bg', 4.5],
      ] as const) {
        const ratio = contrast(colour(fg), colour(bg));
        if (ratio < least) failures.push(`${preset.id} ${mode} ${fg}: ${ratio.toFixed(2)}`);
      }
    }
  }
  expect(failures).toEqual([]);
  expect(contrast(components['rest-night-alarm']!, components['rest-night-bg']!)).toBeGreaterThanOrEqual(3);
  // the clock of the night is faint on purpose
  expect(contrast(components['rest-night-fg']!, components['rest-night-bg']!)).toBeLessThan(3);
});

// ----- found by the review -----

const shore = (value: string): Device => device({ id: 'shore', name: 'Walstroom', caps: [cap('ac_input_source', { type: 'string', value })] });
const withShore: HeroSpec = { ...HERO, stats: [{ role: 'solar', ref: { deviceId: 'sun', capabilityId: 'measure_power' } }, { role: 'shore', ref: { deviceId: 'shore', capabilityId: 'ac_input_source' } }] };

test('a value that is a text stands smaller, over two lines; a number stays large', async () => {
  const s = await setup({ hero: withShore }, [...home(), shore('Niet aangesloten')]);
  expect(s.all('.stat').map((stat) => [stat.querySelector('b')!.textContent, stat.classList.contains('long')])).toEqual([['412 W', false], ['Niet aangesloten', true]]);
  await s.report('shore', 'ac_input_source', 'Net');
  expect(s.all('.stat.long')).toHaveLength(0);
  await s.report('sun', 'measure_power', -12_345);
  expect(s.all('.stat.long')).toHaveLength(0);
});

test('an own hero whose value is a text', async () => {
  const own: HeroSpec = { kind: 'own', deviceIds: ['shore'], primary: { deviceId: 'shore', capabilityId: 'ac_input_source' }, timeToGo: null, stats: [], name: 'Stroom' };
  const s = await setup({ hero: own }, [...home(), shore('Niet aangesloten')]);
  expect([s.text('.number'), s.all('.number.long').length]).toEqual([['Niet aangesloten'], 1]);
  await s.report('shore', 'ac_input_source', 'Net');
  expect(s.all('.number.long')).toHaveLength(0);
});

test('the name and what is the matter are apart, with a dot between them for an alarm', async () => {
  const s = await setup();
  await s.report('leak', 'alarm_water', true);
  await s.report('tank', 'tank_level', 3);
  expect(s.all('.pill .cut').map((e) => e.textContent)).toEqual(['Badkamer', 'Schoon water']);
  expect(s.all('.pill .what').map((e) => e.textContent)).toEqual(['Wateralarm', 'bijna leeg · 3%']);
  expect(s.text('.pill')).toEqual(['Badkamer · Wateralarm', 'Schoon water bijna leeg · 3%']);
});

test('the colours of the night are its own, also with forced colours', async () => {
  const { MhRestScreen } = await import('../../../src/ui/screens/rest-screen');
  const css = MhRestScreen.styles.slice(1).map((s) => ('cssText' in s ? s.cssText : '')).join('\n');
  expect(css).toMatch(/\.screen\.night \{[^}]*forced-color-adjust: none/);
});

// ----- the weather -----

async function withWeather(props: Partial<MhRestScreen>, when: Date) {
  const { readWeather } = await import('../../../src/widgets/weather');
  const fake = fakeContext(home());
  const weather = readWeather({ when: when.toISOString(), iconId: 'clouds_light_night', state: 'x', temperature: 7.6, temperatureMax: 12.4, temperatureMin: 3, forecast: [], forecastHourly: [] });
  let active = 0;
  let listened = 0;
  fake.ctx.widgets = { boards: () => [], openBoard: () => {}, weather: { get: () => ({ value: weather, at: Date.now(), error: null }), refresh: () => {}, listen: (fn: (s: unknown) => void) => { active += 1; listened += 1; fn({ value: weather, at: Date.now(), error: null }); return () => { active -= 1; }; } } as never };
  const element = await mount<MhRestScreen>('mh-rest-screen', { ctx: fake.ctx, hero: HERO, battery: BATTERY, wall: { ...defaultWall(), on: true }, hub: { ...emptyWallHub(), inside: HUB.inside }, now: NOW, ...props });
  const text = (selector: string) => [...element.shadowRoot!.querySelectorAll<HTMLElement>(selector)].map((e) => e.textContent!.replace(/\s+/g, ' ').trim());
  return { element, text, active: () => active, listened: () => listened };
}

test('by day the weather stands under the date: its icon, the temperature, the state and the highest of today', async () => {
  const s = await withWeather({}, new Date(2026, 10, 23, 20, 0));
  expect(s.text('.weather')).toEqual(['8° · half bewolkt · ↑ 12°']);
  expect(s.element.shadowRoot!.querySelector('.weather')!.getAttribute('part')).toBe('rest-weather');
  expect(s.element.shadowRoot!.querySelector('.weather mh-icon')!.getAttribute('name')).toBe('partly_cloudy_night');
  expect(s.active()).toBe(1);
  s.element.remove();
  expect(s.active()).toBe(0);
});

test('with an outside sensor the weather leaves out its own temperature; at night, or older than three hours, there is no weather', async () => {
  const outside = await withWeather({ hub: { ...emptyWallHub(), inside: HUB.inside, outside: HUB.outside } }, new Date(2026, 10, 23, 20, 0));
  expect(outside.text('.weather')).toEqual(['half bewolkt · ↑ 12°']);
  document.body.replaceChildren();
  const night = await withWeather({ night: true }, new Date(2026, 10, 23, 20, 0));
  expect(night.text('.weather')).toEqual([]);
  document.body.replaceChildren();
  const old = await withWeather({}, new Date(2026, 10, 23, 17, 40));
  expect(old.text('.weather')).toEqual([]);
});

test('the rest screen without weather is as it was', async () => {
  const s = await setup();
  expect(s.text('.weather')).toEqual([]);
});

test('the weather is a part own CSS reaches, as every other part of the rest screen', async () => {
  const { REST_PARTS } = await import('../../../src/ui/part-names');
  const s = await withWeather({}, new Date(2026, 10, 23, 20, 0));
  const listed = REST_PARTS.split(',').map((name) => name.trim());
  const used = [...s.element.shadowRoot!.querySelectorAll('[part]')].flatMap((element) => element.getAttribute('part')!.split(/\s+/));
  expect(used).toContain('rest-weather');
  expect(used.filter((name) => !listed.includes(name))).toEqual([]);
});

test('the same hub told anew does not listen to the weather anew', async () => {
  const s = await withWeather({}, new Date(2026, 10, 23, 20, 0));
  s.element.hub = { ...emptyWallHub(), inside: HUB.inside };
  await s.element.updateComplete;
  s.element.hub = { ...emptyWallHub(), inside: HUB.inside };
  await s.element.updateComplete;
  expect([s.listened(), s.active()]).toEqual([1, 1]);
});
