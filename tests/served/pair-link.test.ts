import { expect, test, vi } from 'vitest';
import { kindOf, takeScanned } from '../../src/served/pair-link';

const at = (hash: string) => ({ hash, pathname: '/', search: '?x=1' });

test('a scanned code is taken out of the address', () => {
  const history = { state: { a: 1 }, replaceState: vi.fn() };
  expect(takeScanned(at('#pair=482913'), history)).toBe('482913');
  expect(history.replaceState.mock.calls).toEqual([[{ a: 1 }, '', '/?x=1']]);
});

test.each(['#pair=', '#pair=12345', '#pair=1234567', '#pair=12345x', '#pair=<b>123456', '#pair=１２３４５６'])('what is no code is taken out too, and is none: %s', (hash) => {
  const history = { state: null, replaceState: vi.fn() };
  expect(takeScanned(at(hash), history)).toBeNull();
  expect(history.replaceState).toHaveBeenCalledOnce();
});

test.each(['', '#', '#top', '#PAIR=123456', '#x=1&pair=123456'])('anything else stays as it is: %s', (hash) => {
  const history = { state: null, replaceState: vi.fn() };
  expect(takeScanned(at(hash), history)).toBeNull();
  expect(history.replaceState).not.toHaveBeenCalled();
});

test('what kind of device this is, is told by its pointer and its shorter side', () => {
  expect([kindOf(true, 390), kindOf(true, 599), kindOf(true, 600), kindOf(true, 1024), kindOf(false, 900), kindOf(false, 390)]).toEqual(['phone', 'phone', 'tablet', 'tablet', 'laptop', 'laptop']);
});
