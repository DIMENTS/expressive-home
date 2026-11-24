import { expect, test, vi } from 'vitest';
import { createNight } from '../../src/home-server/night';

function setup(stored?: unknown) {
  const state = { now: 1_000_000, stored };
  const make = () => createNight({ load: () => state.stored, save: (value) => { state.stored = structuredClone(value); }, now: () => state.now });
  return { state, make, night: make() };
}

test('nobody said anything yet', () => {
  expect(setup().night.get()).toBeNull();
});

test.each([null, 'x', [], {}, { night: true }, { night: 'ja', at: 5 }, { night: true, at: 'x' }, { night: true, at: Number.NaN }, { night: true, at: -1 }])('what was kept and is none is nothing: %j', (wrong) => {
  expect(setup(wrong).night.get()).toBeNull();
});

test('what a flow said is kept, with how long ago', () => {
  const { night, state } = setup();
  night.set(true);
  expect([night.get(), state.stored]).toEqual([{ night: true, age: 0 }, { night: true, at: 1_000_000 }]);
  state.now += 90_000;
  expect(night.get()).toEqual({ night: true, age: 90_000 });
  night.set(false);
  expect(night.get()).toEqual({ night: false, age: 0 });
});

test('it is still known after a restart', () => {
  const s = setup();
  s.night.set(true);
  s.state.now += 60_000;
  expect(s.make().get()).toEqual({ night: true, age: 60_000 });
});

test('a clock that was set back does not make it come from the future', () => {
  const { night, state } = setup();
  night.set(true);
  state.now -= 500_000;
  expect(night.get()).toEqual({ night: true, age: 0 });
});

test('who listens hears of everything that is said, also the same again', () => {
  const { night } = setup();
  const heard = vi.fn();
  const stop = night.subscribe(heard);
  night.set(true);
  night.set(true);
  expect(heard).toHaveBeenCalledTimes(2);
  stop();
  night.set(false);
  expect(heard).toHaveBeenCalledTimes(2);
});

test('a hub that cannot keep it still says it', () => {
  const heard = vi.fn();
  const night = createNight({ load: () => { throw new Error('broken'); }, save: () => { throw new Error('full'); }, now: () => 5 });
  night.subscribe(heard);
  night.set(true);
  expect([night.get(), heard.mock.calls.length]).toEqual([{ night: true, age: 0 }, 1]);
});
