import { expect, test } from 'vitest';
import { safeStorage } from '../../../src/ui/app/safe-storage';

test('the real storage is used when the browser allows it', () => {
  const real = { getItem: () => 'x', setItem: () => {}, removeItem: () => {} };
  expect(safeStorage(() => real)).toBe(real);
});

test('when the browser refuses access, reading gives nothing and writing fails, so the app can say so', () => {
  const storage = safeStorage(() => { throw new Error('SecurityError'); });
  expect(storage.getItem('dashboard.config')).toBeNull();
  expect(() => storage.setItem('dashboard.config', '{}')).toThrow();
  expect(() => storage.removeItem('dashboard.config')).not.toThrow();
});
