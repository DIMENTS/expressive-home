import { afterEach, expect, test, vi } from 'vitest';
import { PAIRED_KEY } from '../../src/served/store';
import { HOMEY_ID } from '../helpers/fake-hub';
import { bed, closeBeds, device, sleep, until, type Bed, type Page } from './bed';

// The whole way, from the hub to what the screens of several devices show, when things go wrong on the way.

afterEach(closeBeds);

const rename = (page: Page, name: string): void => {
  const section = page.controller.getState().dashboard!.sections.find((s) => s.tiles.length > 1)!;
  page.edit({ type: 'set-section', dashboardId: 'overview', sectionId: section.id, name, icon: null });
};
const turnLamp = (b: Bed, value: boolean): void => b.hub.emit({ type: 'capability', deviceId: 'device-1', capabilityId: 'onoff', value, at: null });

// ----- the connection -----

test('"Nu proberen" while the wifi is still away does not keep it from coming back', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair();
  d.leave();
  await until('gone', () => d.route() === null);
  d.controller.retry();
  await sleep(50);
  d.comeBack();
  await until('back by itself', () => d.route() === 'local');
});

test('"Nu proberen" that works stays live afterwards', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair();
  d.leave();
  await until('gone', () => d.route() === null);
  d.comeBack();
  d.controller.retry();
  await until('back', () => d.route() === 'local');
  await sleep(50);
  expect(b.server.streams()).toBe(1);
  const before = d.lamp() === true;
  turnLamp(b, !before);
  await until('the lamp follows', () => d.lamp() === !before);
  b.hub.emit({ type: 'route', route: null });
  await until('the hub itself is gone', () => d.route() === null);
});

test('the stream is back but reading everything failed at first: it is tried again', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair();
  d.leave();
  await until('gone', () => d.route() === null);
  d.net.failing = 'GET api/snapshot';
  d.comeBack();
  await until('the stream', () => d.link.up());
  await sleep(50);
  expect(d.route()).toBeNull();
  d.net.failing = '';
  await until('back', () => d.route() === 'local');
});

test('what happens while a page opens is not missed', async () => {
  for (const moment of [0, 5, 10, 15, 20, 25, 30]) {
    const b = await bed();
    const d = device(b, { up: 10, down: 10, stream: 5 });
    const pairing = d.pair('use');
    await until('it reads', () => d.log.includes('GET api/snapshot') || d.log.includes('GET api/layouts'));
    await sleep(moment);
    const before = b.hubLink.snapshot()!.devices['device-1']!.capabilities['onoff']!.value === true;
    turnLamp(b, !before);
    await pairing;
    await until(`the lamp is right (${moment})`, () => d.lamp() === !before, 1000);
  }
});

test('a page that cannot get the live stream says so', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair();
  d.link.sleep();
  d.net.away = true;
  d.link.wake();
  await until('no route', () => d.route() === null);
  d.net.away = false;
  await until('back', () => d.route() === 'local');
});

test('a tab that nobody looks at gives its stream back, and follows again when it is looked at', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair();
  d.link.sleep();
  await until('no stream', () => b.server.streams() === 0);
  expect(d.route()).toBe('local');
  const before = d.lamp() === true;
  turnLamp(b, !before);
  d.link.wake();
  await until('the lamp is right', () => d.lamp() === !before);
  expect([d.route(), d.controller.getState().restored]).toEqual(['local', false]);
});

test('a flow and a room that are made while the app runs come by themselves', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair();
  const { zones, flows } = b.hubLink.snapshot()!;
  b.hub.structure = { zones: { ...zones, dak: { id: 'dak', name: 'Dak', parentId: null } }, flows: [...flows, { id: 'new', name: 'Nieuwe flow', kind: 'flow', startable: true }] };
  await b.hubLink.refresh(0);
  await until('the flow', () => d.store.getSnapshot()!.flows.some((f) => f.id === 'new'));
  expect(d.store.getSnapshot()!.zones['dak']!.name).toBe('Dak');
});

test('a page that opens has the flow that was made a moment ago', async () => {
  const b = await bed();
  const { zones, flows } = b.hubLink.snapshot()!;
  await sleep(1200);
  b.hub.structure = { zones, flows: [...flows, { id: 'new', name: 'Nieuwe flow', kind: 'flow', startable: true }] };
  const d = device(b);
  await d.pair();
  expect(d.store.getSnapshot()!.flows.some((f) => f.id === 'new')).toBe(true);
});

// ----- the dashboards -----

test('pairing again on the same page shows what the others made meanwhile, and writes nothing over it', async () => {
  const b = await bed();
  const tablet = device(b);
  const laptop = device(b);
  await tablet.pair();
  const { id } = b.pairing.list()[0]!;
  await laptop.pair();
  laptop.add('d-1', 'Oud');
  await until('both have it', () => tablet.boards().includes('Oud'));
  b.pairing.remove(id);
  await until('out', () => tablet.controller.getState().phase === 'connect');
  laptop.add('d-2', 'Nieuw werk');
  await until('kept', () => b.boards().includes('Nieuw werk'));
  await tablet.pair('edit');
  await until('shown', () => tablet.boards().includes('Nieuw werk'));
  // a change of the hub that makes it work out its layout again
  const lamp = b.hubLink.snapshot()!.devices['device-1']!;
  b.hub.emit({ type: 'device', device: { ...lamp, name: 'Nieuwe naam' } });
  b.hub.emit({ type: 'deviceRemoved', deviceId: 'device-2' });
  await sleep(400);
  tablet.add('d-9', 'Van de tablet');
  await until('both on the hub', () => b.boards().includes('Van de tablet'));
  expect(b.boards()).toEqual(['overview', 'Oud', 'Nieuw werk', 'Van de tablet']);
  expect([...tablet.notices, ...laptop.notices]).toEqual([]);
});

test('a device that was paired again with another right has that one at once', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair('edit');
  expect(d.controller.status().canArrange).toBe(true);
  const { id } = b.pairing.list()[0]!;
  b.pairing.remove(id);
  await until('out', () => d.controller.getState().phase === 'connect');
  await d.pair('use');
  expect(d.controller.status().canArrange).toBe(false);
});

for (const [delay, up, down, stream] of [[15, 1, 1, 1], [40, 10, 12, 5], [40, 30, 35, 5], [60, 30, 60, 20], [30, 20, 40, 60], [10, 60, 60, 1]] as const) {
  test(`typing a name is never turned back: a letter every ${delay} ms, ${up} ms there, ${down} ms back, stream ${stream} ms`, async () => {
    const b = await bed();
    const d = device(b, { up, down, stream });
    await d.pair();
    rename(d, 'Anders');
    await until('kept', () => b.boards().length > 0);
    await sleep(150);
    const tiles = () => d.controller.getState().layout.dashboards[0]!.sections!.flatMap((s) => s.tiles);
    const { id } = tiles()[0]!;
    const label = (): string => tiles().find((t) => t.id === id)!.label ?? '';
    let typed = '';
    for (const letter of 'Buitenkeuken links') {
      // as the settings of a tile do it: every letter reports the whole text of the field, which shows the label again when that is another
      typed += letter;
      d.edit({ type: 'set-tile', dashboardId: 'overview', tileId: id, patch: { label: typed } }, `label:${id}`);
      expect(label()).toBe(typed.trim());
      await sleep(delay);
      expect(label()).toBe(typed.trim());
    }
    const onHub = () => b.layouts.get().layouts[HOMEY_ID]!.dashboards[0]!.sections!.flatMap((s) => s.tiles).find((t) => t.id === id)!.label;
    await until('kept on the hub', () => onHub() === typed);
    await sleep(200);
    expect([label(), d.notices]).toEqual([typed, []]);
    expect(d.controller.getState().canUndo).toBe(true);
    d.controller.undo();
    expect(label()).toBe('');
  });
}

test('the letters of a name are not each saved on the hub', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair();
  d.add('d-1', 'Nieuw');
  await until('kept', () => b.boards().includes('Nieuw'));
  const before = b.saves();
  for (let i = 1; i <= 20; i += 1) {
    d.edit({ type: 'set-dashboard', dashboardId: 'd-1', name: 'x'.repeat(i), icon: null }, 'name');
    await sleep(5);
  }
  await until('kept', () => b.boards().includes('x'.repeat(20)));
  expect(b.saves() - before).toBeLessThan(12);
});

test('what is changed while the wifi is away is kept on the hub once it is back; it is said, every time', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair();
  for (const [id, name] of [['d-1', 'Buiten'], ['d-2', 'Energie']] as const) {
    d.leave();
    await until('gone', () => d.route() === null);
    d.add(id, name);
    await until('said', () => d.notices.includes('UNSAVED'));
    d.add(`${id}-b`, `${name} 2`);
    await sleep(100);
    d.comeBack();
    await until('kept', () => b.boards().includes(name) && b.boards().includes(`${name} 2`));
    expect([d.boards(), d.notices.splice(0)]).toEqual([b.boards(), ['UNSAVED']]);
    await until('back', () => d.route() === 'local');
  }
});

test('when another device saved meanwhile, that one stays, and it is said', async () => {
  const b = await bed();
  const tablet = device(b);
  const laptop = device(b);
  await tablet.pair();
  await laptop.pair();
  tablet.leave();
  await until('gone', () => tablet.route() === null);
  tablet.add('d-1', 'Van de tablet');
  laptop.add('d-2', 'Van de laptop');
  await until('kept', () => b.boards().includes('Van de laptop'));
  tablet.comeBack();
  await until('said', () => tablet.notices.includes('CONFLICT'));
  await until('taken over', () => tablet.boards().includes('Van de laptop'));
  expect([tablet.boards(), b.boards(), laptop.notices]).toEqual([['overview', 'Van de laptop'], ['overview', 'Van de laptop'], []]);
  // and the next change is saved as ever
  tablet.add('d-3', 'Daarna');
  await until('kept', () => b.boards().includes('Daarna'));
});

test('a layout that only got other names meanwhile does not cost the owner a change', async () => {
  const b = await bed();
  const d = device(b, { stream: 100 });
  await d.pair();
  rename(d, 'Anders');
  await until('kept', () => b.boards().length > 0);
  await sleep(200);
  const doc = b.layouts.get();
  const layouts = structuredClone(doc.layouts);
  const [ref] = Object.keys(layouts[HOMEY_ID]!.names);
  layouts[HOMEY_ID]!.names[ref!] = 'Andere naam';
  b.layouts.put(doc.revision, { layouts, sectionSeeds: doc.sectionSeeds });
  d.add('d-1', 'Mijn werk');
  await until('kept', () => b.boards().includes('Mijn werk'));
  await sleep(200);
  expect([d.boards().includes('Mijn werk'), d.notices]).toEqual([true, []]);
});

test('a browser that keeps nothing still keeps the dashboards on the hub', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair();
  d.values.set = () => { throw new Error('quota'); };
  d.add('d-1', 'Buiten');
  await until('kept', () => b.boards().includes('Buiten'));
});

test('as long as the dashboards of the hub were not read nothing can be changed; then they are there', async () => {
  const b = await bed();
  const other = device(b);
  await other.pair();
  other.add('d-1', 'Van een ander');
  await until('kept', () => b.boards().includes('Van een ander'));
  const d = device(b);
  d.net.failing = 'GET api/layouts';
  await d.pair();
  expect(d.controller.status().canArrange).toBe(false);
  d.add('d-2', 'Buiten');
  expect(d.boards()).toEqual(['overview']);
  d.net.failing = '';
  await until('read', () => d.boards().includes('Van een ander'));
  expect(d.controller.status().canArrange).toBe(true);
  d.add('d-2', 'Buiten');
  await until('kept', () => b.boards().includes('Buiten'));
  expect(b.boards()).toEqual(['overview', 'Van een ander', 'Buiten']);
});

test('a page that opens while the app is away knows afterwards what it may do', async () => {
  const b = await bed();
  const d = device(b);
  const { code } = b.pairing.newCode('edit');
  await d.served.pair(code, 'x');
  d.values.set(PAIRED_KEY, HOMEY_ID);
  d.net.away = true;
  await d.controller.start();
  expect([d.controller.getState().startUnreachable, d.controller.status().canArrange]).toEqual([true, false]);
  d.comeBack();
  await until('there', () => d.route() === 'local');
  await until('may arrange', () => d.controller.status().canArrange === true);
});

test('two devices that both work out the layout again do not keep saving', async () => {
  const b = await bed();
  const one = device(b, { up: 5, down: 15, stream: 5 });
  const two = device(b, { up: 5, down: 15, stream: 5 });
  await one.pair();
  await two.pair();
  rename(one, 'Anders');
  await until('kept', () => b.boards().length > 0);
  await sleep(200);
  const before = b.saves();
  const lamp = b.hubLink.snapshot()!.devices['device-1']!;
  b.hub.emit({ type: 'device', device: { ...lamp, name: 'Nieuwe naam' } });
  b.hub.emit({ type: 'deviceRemoved', deviceId: 'device-2' });
  await sleep(800);
  // one sees the hub differently from now on
  one.store.apply({ type: 'device', device: { ...one.store.getDevice('device-1')!, name: 'Oude naam' } });
  b.hub.emit({ type: 'deviceRemoved', deviceId: 'device-3' });
  await sleep(1500);
  expect(b.saves() - before).toBeLessThan(8);
  expect([...one.notices, ...two.notices]).toEqual([]);
});

// ----- what the second review found -----

for (const [up, down, at] of [[30, 30, 20], [30, 30, 70], [10, 10, 5], [100, 100, 50]] as const) {
  test(`a theme that is chosen while the page still opens touches nothing of the hub: ${up} ms there, ${down} ms back, after ${at} ms`, async () => {
    const b = await bed();
    const laptop = device(b);
    await laptop.pair();
    laptop.add('d-1', 'Kostbaar');
    laptop.add('d-2', 'Werk');
    await until('kept', () => b.boards().includes('Werk'));
    const d = device(b, { up, down });
    const { code } = b.pairing.newCode('edit');
    await d.served.pair(code, 'x');
    const starting = d.controller.start();
    await sleep(at);
    d.controller.setTheme({ ...d.controller.getState().theme, mode: 'dark' });
    await starting;
    await sleep(400);
    expect([b.boards(), d.boards(), d.controller.getState().phase]).toEqual([['overview', 'Kostbaar', 'Werk'], ['overview', 'Kostbaar', 'Werk'], 'dashboard']);
    expect([d.controller.getState().theme.mode, JSON.parse(d.values.get('dashboard.config')!).theme.mode]).toEqual(['dark', 'dark']);
  });
}

test('another tab that changes its theme while this page opens does not send it to the pair screen', async () => {
  const b = await bed();
  const d = device(b, { up: 30, down: 30 });
  const { code } = b.pairing.newCode('edit');
  await d.served.pair(code, 'x');
  const starting = d.controller.start();
  await sleep(20);
  void d.controller.reloadStored();
  await starting;
  await until('there', () => d.controller.getState().phase === 'dashboard');
});

for (const what of ['adds', 'undoes'] as const) {
  test(`the hub saved but its answer was lost, and the owner ${what}: that stays`, async () => {
    const b = await bed();
    const d = device(b, { down: 40, stream: 0 });
    await d.pair();
    await sleep(100);
    d.add('d-1', 'Een');
    await until('on the hub', () => b.boards().includes('Een'));
    d.leave();
    await until('gone', () => d.route() === null);
    if (what === 'adds') d.add('d-2', 'Twee');
    else d.controller.undo();
    await sleep(60);
    d.comeBack();
    await until('back', () => d.route() === 'local');
    const wanted = what === 'adds' ? ['overview', 'Een', 'Twee'] : ['overview'];
    await until('on the hub', () => b.boards().length === wanted.length);
    await sleep(100);
    expect([d.boards(), b.boards(), d.notices]).toEqual([wanted, wanted, ['UNSAVED']]);
  });
}

test('two changes elsewhere, the second while the first is being read: the second comes too', async () => {
  const b = await bed();
  const tablet = device(b, { down: 60, stream: 1 });
  const laptop = device(b);
  await tablet.pair();
  await laptop.pair();
  await sleep(150);
  laptop.add('d-1', 'Een');
  await until('kept', () => b.boards().includes('Een'));
  await sleep(10);
  laptop.add('d-2', 'Twee');
  await until('kept', () => b.boards().includes('Twee'));
  await until('shown', () => tablet.boards().includes('Twee'));
});

test('paired again while the live stream does not come: there is no route', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair();
  b.pairing.remove(b.pairing.list()[0]!.id);
  await until('out', () => d.controller.getState().phase === 'connect');
  const [handler] = b.server.server.listeners('request') as ((request: { url?: string }, response: { writeHead(status: number): void; end(): void }) => void)[];
  b.server.server.removeAllListeners('request');
  b.server.server.on('request', (request, response) => {
    if (!request.url?.startsWith('/api/events')) { handler!(request, response); return; }
    response.writeHead(503);
    response.end();
  });
  const { code } = b.pairing.newCode('edit');
  await d.served.pair(code, 'x');
  await d.controller.start();
  await sleep(400);
  expect([d.controller.getState().phase, d.route()]).toEqual(['dashboard', null]);
});

test('the theme of this device stays, whatever another tab or another device does', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair();
  const { theme } = d.controller.getState();
  d.controller.setTheme({ ...theme, mode: 'dark' });
  await sleep(20);
  d.values.set('dashboard.config', JSON.stringify({ ...JSON.parse(d.values.get('dashboard.config')!), theme: { ...theme, mode: 'light' } }));
  await d.controller.reloadStored();
  expect(d.controller.getState().theme.mode).toBe('light');
  d.controller.setTheme({ ...theme, mode: 'dark' });
  await sleep(20);
  const other = device(b);
  await other.pair();
  other.add('d-1', 'Iets');
  await until('came in', () => d.boards().includes('Iets'));
  expect(d.controller.getState().theme.mode).toBe('dark');
  // also in a browser that keeps nothing
  d.values.set = () => { throw new Error('quota'); };
  d.controller.setTheme({ ...theme, mode: 'light' });
  await sleep(20);
  other.add('d-2', 'Nog iets');
  await until('came in', () => d.boards().includes('Nog iets'));
  expect(d.controller.getState().theme.mode).toBe('light');
});

test('a clock that is set back keeps nothing from being saved', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair();
  d.add('d-1', 'Een');
  await until('kept', () => b.boards().includes('Een'));
  const real = Date.now;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => real() - 3_600_000);
  try {
    d.add('d-2', 'Twee');
    for (let i = 0; i < 100 && !b.boards().includes('Twee'); i += 1) await sleep(10);
    expect(b.boards()).toContain('Twee');
  } finally {
    clock.mockRestore();
  }
});

/** Puts a lamp on the hub that the dashboards do not know yet, and gives its ref. */
async function newcomer(b: Bed, page: Page): Promise<string> {
  const lamp = b.hubLink.snapshot()!.devices['device-1']!;
  b.hub.emit({ type: 'device', device: { ...lamp, id: 'new-1', name: 'Nieuwe lamp' } });
  await until('it is new', () => page.controller.getState().news.some((n) => n.ref === 'new-1'));
  return 'new-1';
}
const known = (b: Bed): string[] => b.layouts.get().layouts[HOMEY_ID]?.known ?? [];

test('what was skipped on one device stays skipped when another is paired again', async () => {
  const b = await bed();
  const tablet = device(b);
  const laptop = device(b);
  await tablet.pair();
  const { id } = b.pairing.list()[0]!;
  await laptop.pair();
  rename(laptop, 'Anders');
  await until('both have it', () => tablet.controller.getState().layout.dashboards[0]!.sections !== null);
  b.pairing.remove(id);
  await until('out', () => tablet.controller.getState().phase === 'connect');
  const ref = await newcomer(b, laptop);
  laptop.controller.dismissNew(ref);
  await until('skipped', () => known(b).includes(ref));
  await tablet.pair('edit');
  await sleep(400);
  expect([known(b).includes(ref), tablet.controller.getState().news, laptop.controller.getState().news]).toEqual([true, [], []]);
});

test('what was skipped stays skipped when another device saved something first', async () => {
  const b = await bed();
  const tablet = device(b, { stream: 100 });
  const laptop = device(b);
  await tablet.pair();
  await laptop.pair();
  rename(laptop, 'Anders');
  await until('both have it', () => tablet.controller.getState().layout.dashboards[0]!.sections !== null);
  const ref = await newcomer(b, tablet);
  laptop.add('d-1', 'Van de laptop');
  await until('kept', () => b.boards().includes('Van de laptop'));
  tablet.controller.dismissNew(ref);
  await until('skipped', () => known(b).includes(ref));
  expect([b.boards().includes('Van de laptop'), tablet.notices]).toEqual([true, []]);
});

test('a page that closes while it is saving still sends the newest', async () => {
  const b = await bed();
  const d = device(b, { up: 20, down: 60, stream: 1 });
  await d.pair();
  d.add('d-1', 'x');
  await until('kept', () => b.boards().includes('x'));
  await sleep(200);
  d.edit({ type: 'set-dashboard', dashboardId: 'd-1', name: 'Buit', icon: null }, 'n');
  await sleep(30);
  d.edit({ type: 'set-dashboard', dashboardId: 'd-1', name: 'Buiten', icon: null }, 'n');
  await sleep(1);
  const before = d.log.length;
  d.served.flush(true);
  expect(d.log.slice(before)).toEqual(['PUT api/layouts']);
  await until('kept', () => b.boards().includes('Buiten'));
  // and when it did not close after all, everything goes on as it did
  await sleep(300);
  d.add('d-2', 'Verder');
  await until('kept', () => b.boards().includes('Verder'));
  expect([b.boards(), d.boards(), d.notices]).toEqual([['overview', 'Buiten', 'Verder'], ['overview', 'Buiten', 'Verder'], []]);
});

test('what another device was first with is what is shown, also when that is nothing for this hub', async () => {
  const b = await bed();
  const tablet = device(b);
  const laptop = device(b);
  await tablet.pair();
  await laptop.pair();
  tablet.leave();
  await until('gone', () => tablet.route() === null);
  tablet.add('d-1', 'Van de tablet');
  laptop.controller.setSectionSeed('type:lights', '#112233');
  await until('kept', () => b.layouts.get().revision > 0);
  tablet.comeBack();
  await until('said', () => tablet.notices.includes('CONFLICT'));
  await sleep(50);
  expect(tablet.boards()).toEqual(['overview']);
});

test('a page in the edit mode whose right is taken away leaves it', async () => {
  const b = await bed();
  const d = device(b);
  await d.pair('edit');
  d.controller.setEditing(true);
  // paired again as "use" in another tab of this browser: the same cookie from now on
  const tab = device(b);
  await tab.pair('use');
  d.take(tab);
  d.leave();
  d.comeBack();
  await until('it knows', () => d.controller.status().canArrange === false);
  await until('out of the edit mode', () => !d.controller.getState().editing);
});

// ----- the wall tablet -----

test('a flow on the hub makes it night on every device, also on one that comes later', async () => {
  const b = await bed();
  const [one, two] = [device(b), device(b)];
  const heard: Record<string, unknown[]> = { one: [], two: [], late: [] };
  one.link.on('night', (night) => heard['one']!.push(night));
  two.link.on('night', (night) => heard['two']!.push(night));
  await one.pair('use');
  await two.pair('edit');
  b.night.set(true);
  await until('both heard', () => heard['one']!.length === 2 && heard['two']!.length === 2);
  expect([heard['one']![1], heard['two']![1]]).toMatchObject([{ night: true }, { night: true }]);
  const late = device(b);
  late.link.on('night', (night) => heard['late']!.push(night));
  await late.pair('use');
  expect(heard['late']).toMatchObject([{ night: true }]);
  // one that was away hears of it when it is back
  one.leave();
  await until('gone', () => one.route() === null);
  b.night.set(false);
  one.comeBack();
  await until('back', () => one.route() === 'local');
  expect(heard['one']!.at(-1)).toMatchObject({ night: false });
});

// ----- per kind or per room, and the rooms -----

const choices = (b: Bed) => { const layout = b.layouts.get().layouts[HOMEY_ID]; return [layout?.grouping, layout?.rooms]; };

test('a choice of one device and a dashboard of another both stay', async () => {
  const b = await bed();
  const [one, two] = [device(b), device(b, { up: 60, down: 60 })];
  await one.pair();
  await two.pair();
  one.add('d-0', 'Begin');
  await until('both have it', () => two.boards().includes('Begin'));
  one.controller.setGrouping('zone');
  one.controller.setRooms(false);
  two.add('d-1', 'Van twee');
  await until('the dashboard is there', () => b.boards().includes('Van twee'));
  await until('the choices are there', () => JSON.stringify(choices(b)) === JSON.stringify(['zone', false]));
  await until('everywhere', () => [one, two].every((d) => d.controller.getState().layout.grouping === 'zone' && d.controller.getState().layout.rooms === false && d.boards().includes('Van twee')));
  expect([...one.notices, ...two.notices]).not.toContain('CONFLICT');
});

test('and the other way round', async () => {
  const b = await bed();
  const [one, two] = [device(b, { up: 60, down: 60 }), device(b)];
  await one.pair();
  await two.pair();
  two.add('d-0', 'Begin');
  await until('both have it', () => one.boards().includes('Begin'));
  one.controller.setGrouping('zone');
  two.add('d-1', 'Van twee');
  await until('both are on the hub', () => b.boards().includes('Van twee') && choices(b)[0] === 'zone');
  await until('everywhere', () => [one, two].every((d) => d.controller.getState().layout.grouping === 'zone' && d.boards().includes('Van twee')));
  expect([...one.notices, ...two.notices]).not.toContain('CONFLICT');
});

test('a choice that is made back stays so', async () => {
  const b = await bed();
  const [one, two] = [device(b), device(b, { up: 60, down: 60 })];
  await one.pair();
  await two.pair();
  one.controller.setGrouping('zone');
  await until('both have it', () => two.controller.getState().layout.grouping === 'zone');
  one.controller.setGrouping('type');
  two.add('d-1', 'Van twee');
  await until('both are on the hub', () => b.boards().includes('Van twee') && choices(b)[0] === undefined);
  await until('everywhere', () => [one, two].every((d) => d.controller.getState().layout.grouping === undefined && d.boards().includes('Van twee')));
});
