import { expect, test, vi } from 'vitest';
import { createScreen, defaultScreen, fullyOf, screenWanted, SCREEN_LEVELS, type FullyScreen, type ScreenSettings } from '../../src/wall/screen';

const SETTINGS: ScreenSettings = { rest: 25, night: 'dim' };

function fakeFully(brightness = 180) {
  const calls: string[] = [];
  const fully: FullyScreen = {
    getScreenBrightness: vi.fn(() => brightness),
    setScreenBrightness: vi.fn((level: number) => { calls.push(`level ${level}`); }),
  };
  return { fully, calls };
}

function memory(start: string | null = null) {
  let value = start;
  return { get: () => value, set: (next: string | null) => { value = next; }, peek: () => value };
}

test('nothing is dimmed until it is chosen, so a tablet that had Fully before stays as it was', () => {
  expect(defaultScreen()).toEqual({ rest: 'none', night: 'none' });
  expect(screenWanted('rest', 'day', defaultScreen(), false)).toEqual({ level: null });
  expect(screenWanted('rest', 'night', defaultScreen(), false)).toEqual({ level: null });
});

test('what the screen should be: dimmed at rest, nearly off at night, as it was when nobody rests it', () => {
  expect(screenWanted('none', 'day', SETTINGS, false)).toEqual({ level: null });
  expect(screenWanted('rest', 'day', SETTINGS, false)).toEqual({ level: SCREEN_LEVELS[25] });
  expect(screenWanted('rest', 'night', SETTINGS, false)).toEqual({ level: SCREEN_LEVELS.dim });
  // not dimming the night: as the rest screen of the day
  expect(screenWanted('rest', 'night', { rest: 50, night: 'none' }, false)).toEqual({ level: SCREEN_LEVELS[50] });
  expect(screenWanted('rest', 'day', { rest: 'none', night: 'dim' }, false)).toEqual({ level: null });
  // used at night: as bright as the rest screen of the day, not as bright as by day
  expect(screenWanted('none', 'night', SETTINGS, false)).toEqual({ level: SCREEN_LEVELS[25] });
});

test('danger at night lights the screen as the rest screen of the day; having a look dims as the real thing', () => {
  expect(screenWanted('rest', 'night', { rest: 10, night: 'dim' }, true)).toEqual({ level: SCREEN_LEVELS[10] });
  expect(screenWanted('preview', 'night', SETTINGS, false)).toEqual({ level: SCREEN_LEVELS.dim });
  expect(screenWanted('preview', 'day', SETTINGS, false)).toEqual({ level: SCREEN_LEVELS[25] });
});

test('the screen remembers the brightness of before, dims, and gives it back once', () => {
  const { fully, calls } = fakeFully(180);
  const kept = memory();
  const screen = createScreen({ fully, kept });
  screen.apply({ level: 64 });
  screen.apply({ level: 64 });
  expect([calls, kept.peek()]).toEqual([['level 64'], '180']);
  screen.apply({ level: 1 });
  screen.apply({ level: null });
  expect(calls).toEqual(['level 64', 'level 1', 'level 180']);
  expect(kept.peek()).toBeNull();
  screen.apply({ level: null });
  expect(calls).toHaveLength(3);
});

test('a brightness of before that is not above what the dashboard dims to is none: then the tablet chooses its own', () => {
  const { fully, calls } = fakeFully(64);
  const screen = createScreen({ fully, kept: memory() });
  screen.apply({ level: 64 });
  screen.apply({ level: null });
  expect(calls).toEqual(['level 64', 'level -1']);
});

test('after the page loaded anew while dimmed, the brightness of before still comes back', () => {
  const { fully, calls } = fakeFully(64);
  const screen = createScreen({ fully, kept: memory('180') });
  screen.apply({ level: 64 });
  screen.apply({ level: null });
  expect(calls.at(-1)).toBe('level 180');
  // and woken up at once after loading
  const again = fakeFully(64);
  createScreen({ fully: again.fully, kept: memory('200') }).apply({ level: null });
  expect(again.calls).toEqual(['level 200']);
});

test('Fully that refuses breaks nothing; without Fully nothing is asked', () => {
  const { fully } = fakeFully();
  fully.setScreenBrightness = () => { throw new Error('no permission'); };
  const screen = createScreen({ fully, kept: memory() });
  expect(() => { screen.apply({ level: 64 }); screen.apply({ level: null }); }).not.toThrow();
  const none = createScreen({ fully: null, kept: memory() });
  expect(() => none.apply({ level: 64 })).not.toThrow();
});

test('Fully is there only with the functions the dashboard uses', () => {
  const { fully } = fakeFully();
  expect(fullyOf({ fully } as never)).toBe(fully);
  expect(fullyOf({} as never)).toBeNull();
  expect(fullyOf({ fully: { setScreenBrightness: () => {} } } as never)).toBeNull();
  expect(fullyOf({ get fully() { throw new Error('x'); } } as never)).toBeNull();
});

// ----- after the independent check -----

test('a brightness of before below the dashboard\'s own is kept, and the screen is never dimmed upwards', () => {
  const { fully, calls } = fakeFully(100);
  const screen = createScreen({ fully, kept: memory() });
  screen.apply({ level: SCREEN_LEVELS[50] });
  screen.apply({ level: null });
  expect(calls).toEqual(['level 100']);
  const dimmer = fakeFully(100);
  const other = createScreen({ fully: dimmer.fully, kept: memory() });
  other.apply({ level: SCREEN_LEVELS[25] });
  other.apply({ level: null });
  expect(dimmer.calls).toEqual(['level 64', 'level 100']);
});

test('what is exactly one of the dashboard\'s own levels, without anything kept, is given back to the tablet once', () => {
  const left = fakeFully(SCREEN_LEVELS.dim);
  const screen = createScreen({ fully: left.fully, kept: memory() });
  screen.apply({ level: null });
  screen.apply({ level: null });
  expect(left.calls).toEqual(['level -1']);
  const own = fakeFully(90);
  createScreen({ fully: own.fully, kept: memory() }).apply({ level: null });
  expect(own.calls).toEqual([]);
});

test('used at night with no dimmed rest screen chosen, it is a quarter, never the full brightness', () => {
  expect(screenWanted('none', 'night', { rest: 'none', night: 'dim' }, false)).toEqual({ level: SCREEN_LEVELS[25] });
});
