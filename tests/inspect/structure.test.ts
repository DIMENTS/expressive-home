import { expect, test } from 'vitest';
import { addRouteChange, ROUTE_LOG_MAX, structureText } from '../../src/inspect/structure';

test('the copied result carries the route changes', () => {
  const text = structureText('echte Homey', { hero: null, sections: [] }, 'cloud', [], 12, ['14:32:05 local -> cloud', '14:40:11 cloud -> local'], null);
  expect(text).toContain('routewissels:\n- 14:32:05 local -> cloud\n- 14:40:11 cloud -> local');
  expect(structureText('echte Homey', { hero: null, sections: [] }, 'local', [], 0, [], null)).toContain('routewissels: geen');
});
test('a route change is logged with its time, from and to', () => {
  const at = new Date(2026, 10, 22, 14, 5, 9);
  expect(addRouteChange([], at, 'local', 'cloud')).toEqual(['14:05:09 local -> cloud']);
  expect(addRouteChange(['x'], at, null, 'cloud')).toEqual(['x', '14:05:09 geen -> cloud']);
  expect(addRouteChange([], at, 'cloud', null)).toEqual(['14:05:09 cloud -> geen']);
});
test('a route that did not change is not logged', () => {
  const at = new Date(2026, 10, 22, 14, 5, 9);
  expect(addRouteChange(['x'], at, 'local', 'local')).toEqual(['x']);
  expect(addRouteChange([], at, null, null)).toEqual([]);
});
test('the route log keeps the last twenty changes', () => {
  let log: string[] = [];
  for (let i = 0; i < 25; i += 1) log = addRouteChange(log, new Date(2026, 10, 22, 14, 0, i), i % 2 ? 'local' : 'cloud', i % 2 ? 'cloud' : 'local');
  expect(ROUTE_LOG_MAX).toBe(20);
  expect(log).toHaveLength(20);
  expect(log[0]).toBe('14:00:05 local -> cloud');
  expect(log.at(-1)).toBe('14:00:24 cloud -> local');
});
test('the copied result carries the shape of the local address, never the address', () => {
  const empty = { hero: null, sections: [] };
  expect(structureText('echte Homey', empty, 'local', [], 0, [], 'nnn.nnn.n.nn:nn')).toContain('vorm lokaal adres: nnn.nnn.n.nn:nn');
  expect(structureText('echte Homey', empty, 'cloud', [], 0, [], null)).toContain('vorm lokaal adres: onbekend');
});
