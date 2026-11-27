import { expect, test } from 'vitest';
import { PROGRESS_DAYS, defaultChoices, firstOptions, readProgress, stepsFor, writeProgress, type Choices } from '../../src/onboarding/choices';
import { cap, device, snapshot } from '../helpers/build';
import { camperSnapshot } from '../helpers/fake-hub';

const lamp = (id: string, zoneId: string | null) => device({ id, name: id, zoneId, deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: false })] });
const thermo = (id: string, zoneId: string | null) => device({ id, name: id, zoneId, deviceClass: 'sensor', caps: [cap('measure_temperature', { units: '°C', value: 20 })] });

test('the steps: all of them on a larger screen with rooms; without rooms the step of rooms goes', () => {
  expect(stepsFor({ hasRooms: true })).toEqual(['welcome', 'look', 'light', 'layout', 'first', 'build', 'practice']);
  expect(stepsFor({ hasRooms: false })).toEqual(['welcome', 'look', 'light', 'first', 'build', 'practice']);
});

test('the choices begin as the dashboard is without them: Rustig, automatic, roomy, per kind, rooms in the rail, nothing first', () => {
  expect(defaultChoices('#3b6939')).toEqual({ theme: 'rustig', seed: '#3b6939', mode: 'auto', density: 'comfortable', grouping: 'type', rooms: true, first: [], extras: [] } satisfies Choices);
});

test('what can go first: the sections of the house per kind, with the hero as energy first', () => {
  const options = firstOptions(camperSnapshot(), 'type', 'nl');
  expect(options[0]).toMatchObject({ id: 'hero:main', kind: 'energy' });
  expect(options.slice(1).every((option) => option.kind === 'section' && option.id.startsWith('type:'))).toBe(true);
  expect(options.some((option) => option.id === 'type:lights')).toBe(true);
  expect(new Set(options.map((option) => option.id)).size).toBe(options.length);
});

test('per room the rooms of the house, each with its name and icon; devices of no room are a room too', () => {
  const zones = { a: { id: 'a', name: 'Keuken', parentId: null, icon: 'kitchen' }, b: { id: 'b', name: 'Slaapkamer', parentId: null, icon: 'bedroom' } };
  const house = snapshot([lamp('l1', 'a'), thermo('t1', 'b'), lamp('l2', null)], { zones });
  const options = firstOptions(house, 'zone', 'nl');
  expect(options.map((option) => [option.id, option.name, option.icon])).toEqual([
    ['own:zone:a', 'Keuken', 'countertops'], ['own:zone:b', 'Slaapkamer', 'bed'], ['own:zone:none', null, 'category'],
  ]);
});

test('without a hero there is no energy to choose', () => {
  const house = snapshot([lamp('l1', null), thermo('t1', null)]);
  expect(firstOptions(house, 'type', 'nl').map((option) => option.id)).toEqual(['type:lights', 'type:climate']);
});

test('what was chosen so far is kept per hub, and read back only when it is whole and of that hub', () => {
  const choices: Choices = { ...defaultChoices('#3a5ba9'), theme: 'glas', mode: 'sun', density: 'compact', grouping: 'zone', rooms: false, first: ['own:zone:a'], extras: ['weather'] };
  const since = Date.UTC(2026, 10, 27, 1);
  const text = writeProgress({ hub: 'abc', step: 'first', choices, since });
  expect(readProgress(text, 'abc', since + 1000)).toEqual({ hub: 'abc', step: 'first', choices, since });
  expect(readProgress(text, 'other', since)).toBeNull();
  expect(readProgress(null, 'abc', since)).toBeNull();
  expect(readProgress('{', 'abc', since)).toBeNull();
  // a first start that was left for longer than a day is not taken up again: others may have arranged since
  expect(readProgress(text, 'abc', since + PROGRESS_DAYS * 86_400_000 + 1)).toBeNull();
  expect(readProgress(text, 'abc', since - 60_000)).toBeNull();
  expect(readProgress(JSON.stringify({ hub: 'abc', step: 'first', choices }), 'abc', since)).toBeNull();
  const broken = (change: Record<string, unknown>) => readProgress(JSON.stringify({ hub: 'abc', step: 'first', choices: { ...choices, ...change }, since }), 'abc', since);
  for (const change of [{ seed: 'red' }, { mode: 'night' }, { density: 'phone' }, { grouping: 'room' }, { rooms: 'yes' }, { first: 'type:lights' }, { first: [1] }, { extras: ['clock'] }, { theme: '' }, { theme: 'x'.repeat(200) }]) {
    expect(broken(change)).toBeNull();
  }
  expect(readProgress(JSON.stringify({ hub: 'abc', step: 'somewhere', choices, since }), 'abc', since)).toBeNull();
});
