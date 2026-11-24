import { expect, test, vi } from 'vitest';
import { watchSystemDark } from '../../src/theme/system-mode';

function fakeMedia(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  return {
    matches,
    addEventListener: vi.fn((_type: string, listener: (event: { matches: boolean }) => void) => { listeners.add(listener); }),
    removeEventListener: vi.fn((_type: string, listener: (event: { matches: boolean }) => void) => { listeners.delete(listener); }),
    fire(next: boolean) { this.matches = next; for (const listener of listeners) listener({ matches: next }); },
    get count() { return listeners.size; },
  };
}

test('watchSystemDark reports later changes and stops when asked', () => {
  const media = fakeMedia(false);
  const onChange = vi.fn();
  const stop = watchSystemDark(media as unknown as MediaQueryList, onChange);
  media.fire(true);
  expect(onChange).toHaveBeenLastCalledWith(true);
  media.fire(false);
  expect(onChange).toHaveBeenLastCalledWith(false);
  expect(onChange).toHaveBeenCalledTimes(2);
  stop();
  media.fire(true);
  expect(onChange).toHaveBeenCalledTimes(2);
  expect(media.count).toBe(0);
});
