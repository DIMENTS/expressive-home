import { expect, test } from 'vitest';
import { hasWidget, nextSteps, readNext, startNext, withDone, writeNext } from '../../src/onboarding/next-steps';
import { defaultHubLayout } from '../../src/layout/types';
import type { HubLayout } from '../../src/layout/types';

test('the card begins with nothing done, and is kept only when it is whole', () => {
  const state = startNext();
  expect(state).toEqual({ dismissed: false, done: [] });
  expect(readNext(writeNext(state))).toEqual(state);
  expect(readNext(null)).toBeNull();
  expect(readNext('nope')).toBeNull();
  expect(readNext(JSON.stringify({ dismissed: 'no', done: [] }))).toBeNull();
  // a step this version does not know is let go of
  expect(readNext(JSON.stringify({ dismissed: true, done: ['edit', 'fly'] }))).toEqual({ dismissed: true, done: ['edit'] });
});

test('a step that is done stays done, once', () => {
  const once = withDone(startNext(), 'pair');
  expect(withDone(once, 'pair')).toBe(once);
  expect(withDone(once, 'away').done).toEqual(['pair', 'away']);
});

test('on a larger screen that may arrange all five; on a phone or a device that may only use, only pairing and away', () => {
  expect(nextSteps({ phone: false, mayArrange: true })).toEqual(['edit', 'widget', 'wall', 'pair', 'away']);
  expect(nextSteps({ phone: true, mayArrange: true })).toEqual(['pair', 'away']);
  expect(nextSteps({ phone: false, mayArrange: false })).toEqual(['wall', 'pair', 'away']);
});

test('a widget on any dashboard counts as a widget added', () => {
  const layout: HubLayout = defaultHubLayout();
  expect(hasWidget(layout)).toBe(false);
  const withOne: HubLayout = { ...layout, dashboards: [...layout.dashboards, { id: 'd-1', name: 'Keuken', icon: null, sections: [{ id: 'own:s', kind: 'own', column: 'left', name: null, icon: null, hero: null, tiles: [
    { id: 't-1', spec: { kind: 'widget', id: 't-1', size: 'single', widget: 'clock', settings: {} }, size: 'single', label: null, icon: null, source: 'device' },
  ] }] }] };
  expect(hasWidget(withOne)).toBe(true);
});
