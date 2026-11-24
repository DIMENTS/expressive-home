import { expect, test, vi } from 'vitest';
import type { Flow } from '../../src/homey/types';
import { BUTTONS_WAIT_MS, createButtons, HUNG_MS, MAX_BUTTONS } from '../../src/home-server/buttons';

function setup(options: { kept?: unknown; flows?: Flow[]; card?: boolean; pressTimeout?: number } = {}) {
  let values: unknown = [];
  let fail = false;
  let hang = false;
  let update: () => void = () => {};
  let run: (args: unknown, state: unknown) => unknown = () => null;
  const clock = { now: 0 };
  const triggered: unknown[] = [];
  const saved: unknown[] = [];
  const read = vi.fn(async () => { if (hang) await new Promise(() => {}); if (fail) throw new Error('slow'); return values; });
  const card = {
    getArgumentValues: read,
    on: (_event: 'update', listener: () => void) => { update = listener; },
    registerRunListener: (listener: (args: unknown, state: unknown) => unknown) => { run = listener; },
    trigger: vi.fn(async (tokens: unknown, state: unknown) => { triggered.push([tokens, state]); }),
  };
  const flows = { now: options.flows ?? [] };
  const updated = vi.fn();
  const buttons = createButtons({
    load: () => options.kept, save: (names) => { saved.push(structuredClone(names)); }, card: options.card === false ? null : card, flows: () => flows.now, updated, ...(options.pressTimeout === undefined ? {} : { pressTimeout: options.pressTimeout }),
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>), now: () => clock.now,
  });
  return {
    buttons, card, read, updated, triggered, saved, clock, flows,
    say: async (...names: unknown[]) => { values = names.map((button) => ({ button })); clock.now += 1e6; await buttons.refresh(); },
    raw: async (next: unknown) => { values = next; clock.now += 1e6; await buttons.refresh(); },
    break: () => { fail = true; }, hang: () => { hang = true; }, mend: () => { fail = false; hang = false; },
    update: () => update(), run: (args: unknown, state: unknown) => run(args, state),
    names: () => buttons.list().map((flow) => flow.name),
  };
}
const flow = (id: string, names: string[], off = false): Flow => ({ id, name: id, kind: 'flow', startable: false, buttons: names, ...(off ? { off: true as const } : {}) });

test('every name in a flow is a button, once, in the spelling of the first, on the alphabet', async () => {
  const s = setup();
  await s.say('Welterusten', ' Film kijken', 'FILM KIJKEN', 'film  kijken', 'Ontbijt');
  expect(s.buttons.list()).toEqual([
    { id: 'button:film kijken', name: 'Film kijken', kind: 'flow', startable: true }, { id: 'button:ontbijt', name: 'Ontbijt', kind: 'flow', startable: true }, { id: 'button:welterusten', name: 'Welterusten', kind: 'flow', startable: true },
  ]);
});

test('what is no name is no button, and any answer is survived', async () => {
  const s = setup();
  await s.say('', '  ', '[[x]]', null, 5, 'a'.repeat(61), 'Goed', 'constructor', '__proto__', '"><img src=x>');
  expect(s.names()).toEqual(['__proto__', '"><img src=x>', 'constructor', 'Goed']);
  for (const answer of [null, 'x', {}, [null, 5, 'x', []], undefined]) {
    await s.raw(answer);
    expect(s.names().length).toBeLessThanOrEqual(4);
  }
});

test('there are at most a hundred, and always the same ones', async () => {
  const names = Array.from({ length: 130 }, (_, i) => `Knop ${String(i).padStart(3, '0')}`);
  const s = setup();
  await s.say(...names);
  const first = s.names();
  await s.say(...[...names].reverse());
  expect([first.length, s.names()]).toEqual([MAX_BUTTONS, first]);
});

test('the last known names count until it is known what there is now', async () => {
  const s = setup({ kept: ['Film', 'Welterusten'] });
  expect(s.names()).toEqual(['Film', 'Welterusten']);
  s.break();
  s.clock.now = 1e6;
  await s.buttons.refresh();
  expect([s.names(), s.saved]).toEqual([['Film', 'Welterusten'], []]);
  s.mend();
  await s.say('Film');
  expect([s.names(), s.saved]).toEqual([['Film'], [['Film']]]);
  // nothing new is nothing to keep
  await s.say('Film');
  expect(s.saved).toHaveLength(1);
  await s.say();
  expect([s.names(), s.saved.at(-1)]).toEqual([[], []]);
});

test.each([undefined, null, 'x', 5, [null, 5, '', 'Goed', 'goed', 'a'.repeat(61)]])('rubbish in what was kept falls away: %j', (kept) => {
  expect(setup({ kept }).names()).toEqual(Array.isArray(kept) ? ['Goed'] : []);
});

test('a flow that is saved is seen at once, and whoever listens hears it once', async () => {
  const s = setup();
  const heard = vi.fn();
  const stop = s.buttons.subscribe(heard);
  await s.say('Film');
  expect(heard).toHaveBeenCalledTimes(1);
  await s.say('Film');
  expect(heard).toHaveBeenCalledTimes(1);
  s.read.mockResolvedValueOnce([{ button: 'Film' }, { button: 'Nacht' }]);
  s.update();
  await vi.waitFor(() => expect(s.names()).toEqual(['Film', 'Nacht']));
  expect(heard).toHaveBeenCalledTimes(2);
  stop();
  await s.say();
  expect(heard).toHaveBeenCalledTimes(2);
});

test('it is not asked again when it was asked just now, unless a flow was saved', async () => {
  const s = setup();
  await s.say('Film');
  const before = s.read.mock.calls.length;
  await s.buttons.refresh(60_000);
  expect(s.read.mock.calls.length).toBe(before);
  s.update();
  expect(s.read.mock.calls.length).toBe(before + 1);
  s.clock.now += 60_001;
  await s.buttons.refresh(60_000);
  expect(s.read.mock.calls.length).toBe(before + 2);
});

test('a hub that does not answer holds nobody up, and is asked again later', async () => {
  vi.useFakeTimers();
  try {
    const s = setup({ kept: ['Film'] });
    s.hang();
    let done = false;
    void s.buttons.refresh().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(BUTTONS_WAIT_MS);
    expect([done, s.names()]).toEqual([true, ['Film']]);
    s.mend();
    void s.buttons.refresh();
    expect(s.read).toHaveBeenCalledTimes(1);
    s.clock.now += HUNG_MS + 1;
    s.read.mockResolvedValueOnce([{ button: 'Nacht' }]);
    await s.buttons.refresh();
    expect(s.names()).toEqual(['Nacht']);
  } finally {
    vi.useRealTimers();
  }
});

test('the flows themselves tell too: a button of a flow that is off stays, and cannot be pressed', async () => {
  const s = setup({ flows: [flow('a', ['Film']), flow('b', ['Nacht'], true), flow('c', ['Ontbijt'], true), flow('d', ['ontbijt']), { id: 'x', name: 'Alles uit', kind: 'flow', startable: true }] });
  await s.say('Los', 'Film');
  expect(s.buttons.list().map(({ name, startable }) => [name, startable])).toEqual([['Film', true], ['Los', true], ['Nacht', false], ['Ontbijt', true]]);
  expect(await s.buttons.press('button:nacht', 'Tablet')).toBe(false);
  expect(s.triggered).toEqual([]);
  s.flows.now = [];
  expect(s.names()).toEqual(['Film', 'Los']);
});

test('pressing starts every flow with that name, and tells on which device', async () => {
  const s = setup();
  await s.say('Film kijken');
  expect(await s.buttons.press('button:film kijken', 'Tablet')).toBe(true);
  expect(s.triggered).toEqual([[{ device: 'Tablet' }, { button: 'film kijken' }]]);
  for (const id of ['button:weg', 'button:', 'film kijken', 'button:__proto__']) expect(await s.buttons.press(id, 'Tablet')).toBe(false);
  expect(s.triggered).toHaveLength(1);
  s.card.trigger.mockRejectedValueOnce(new Error('too many'));
  await expect(s.buttons.press('button:film kijken', 'Tablet')).rejects.toThrow('too many');
});

test('a flow runs for its own button only, also when the name comes from a tag', () => {
  const s = setup();
  const state = { button: 'film kijken' };
  expect([{ button: 'Film kijken' }, { button: ' FILM  kijken' }, { button: 'Nacht' }, { button: '' }, {}, null].map((args) => s.run(args, state))).toEqual([true, true, false, false, false, false]);
  expect([undefined, null, {}, { button: '' }, { button: 5 }].map((other) => s.run({ button: '' }, other))).toEqual(Array(5).fill(false));
});

test('an app without the card has no buttons, also not those it kept', async () => {
  const s = setup({ card: false, kept: ['Film'] });
  await s.buttons.refresh();
  expect([s.names(), await s.buttons.press('button:film', 'Tablet')]).toEqual([[], false]);
});

test('the same names in another order or spelling are no news, and the spelling stays as long as it is used', async () => {
  const s = setup();
  const heard = vi.fn();
  s.buttons.subscribe(heard);
  await s.say('Film', 'Nacht', 'film');
  for (const names of [['Nacht', 'film', 'Film'], ['film', 'Film', 'Nacht'], ['FILM', 'Nacht', 'Film']]) await s.say(...names);
  expect([s.names(), heard.mock.calls.length, s.saved.length]).toEqual([['Film', 'Nacht'], 1, 1]);
  await s.say('FILM', 'Nacht');
  expect([s.names(), heard.mock.calls.length]).toEqual([['FILM', 'Nacht'], 2]);
});

test('a flow that is saved can have come, gone, or been switched off: whoever knows the flows hears it', async () => {
  const s = setup();
  s.update();
  expect(s.updated).toHaveBeenCalledOnce();
  await s.buttons.refresh(60_000);
  expect(s.updated).toHaveBeenCalledOnce();
});

test('a card that throws at once is survived', async () => {
  const s = setup({ kept: ['Film'] });
  s.read.mockImplementation(() => { throw new Error('at once'); });
  s.clock.now = 1e6;
  await s.buttons.refresh();
  expect(s.names()).toEqual(['Film']);
  s.card.trigger.mockImplementationOnce(() => { throw new Error('at once'); });
  await expect(s.buttons.press('button:film', 'Tablet')).rejects.toThrow('at once');
});

test('a hub that does not start a button in time has not started it', async () => {
  const s = setup({ kept: ['Film'], pressTimeout: 20 });
  s.card.trigger.mockImplementationOnce(() => new Promise(() => {}));
  await expect(s.buttons.press('button:film', 'Tablet')).rejects.toThrow();
  expect(await s.buttons.press('button:film', 'Tablet')).toBe(true);
});
