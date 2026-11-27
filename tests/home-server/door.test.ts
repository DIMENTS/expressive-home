import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from 'vitest';
import { createDocuments } from '../../src/home-server/documents';
import { createDoor, DOOR_RATE } from '../../src/home-server/door';
import { createPairing } from '../../src/home-server/pairing';
import { createSharedLayouts } from '../../src/home-server/shared-layouts';
import { createSharedLooks } from '../../src/home-server/shared-looks';
import { createSharedWidgets } from '../../src/home-server/shared-widgets';
import { SHARED_FORMAT } from '../../src/sync/protocol';

// The door of the app on the hub: open to anyone through the cloud, so it answers only the questions it knows, only to a
// device paired from outside, never with anything but the shared documents, and never with an error it throws.

function setup() {
  let now = 1_000_000;
  let n = 10_000_000;
  const pairing = createPairing({
    load: () => [], save: () => {}, now: () => now, token: () => randomBytes(32).toString('base64url'),
    code: () => '123456', awayCode: () => String(n++), fingerprint: (token) => createHash('sha256').update(token).digest('hex'),
  });
  const layouts = createSharedLayouts({ load: () => undefined, save: () => {} });
  const looks = createSharedLooks({ load: () => undefined, save: () => {} });
  const widgets = createSharedWidgets({ load: () => undefined, save: () => {} });
  const door = createDoor({ pairing, documents: createDocuments({ layouts, looks, widgets }), now: () => now, boot: 'b-1' });
  const pair = (role: 'use' | 'edit' | null = null): string => {
    const { code } = pairing.openAwayCode(role);
    const answer = door.handle({ call: 'pair', code, name: 'Telefoon' }) as { token: string };
    return answer.token;
  };
  return { door, pairing, layouts, pair, later: (ms: number) => { now += ms; } };
}

test('pairing from outside gives a token once, with the device and its right; nothing else of the hub', () => {
  const s = setup();
  const { code } = s.pairing.openAwayCode(null);
  const answer = s.door.handle({ call: 'pair', code, name: 'Telefoon' });
  expect(answer).toEqual({ token: expect.stringMatching(/^[\w-]{43}$/), device: { name: 'Telefoon', role: 'use' } });
  expect(s.door.handle({ call: 'pair', code, name: 'Ander' })).toEqual({ error: 'code' });
  // a code for home does not open the door
  expect(s.door.handle({ call: 'pair', code: s.pairing.newCode('edit').code, name: 'X' })).toEqual({ error: 'code' });
});

test('a session tells the device, the shape of the documents, which start of the app this is and the revisions', () => {
  const s = setup();
  const token = s.pair();
  expect(s.door.handle({ call: 'session', token })).toEqual({ device: { name: 'Telefoon', role: 'use' }, format: SHARED_FORMAT, boot: 'b-1', revisions: { layouts: 0, looks: 0, rescue: 0, widgets: 0 } });
});

test('without a pairing from outside the door says only that, whatever is asked', () => {
  const s = setup();
  const home = s.pairing.redeem(s.pairing.newCode('edit').code, 'Tablet');
  if (!home.ok) throw new Error('not paired');
  for (const call of ['session', 'layouts', 'put-layouts', 'looks', 'looks-ops', 'widgets', 'unpair']) {
    expect([call, s.door.handle({ call, token: 'onzin' })]).toEqual([call, { error: 'not-paired' }]);
    expect([call, s.door.handle({ call })]).toEqual([call, { error: 'not-paired' }]);
    // a pairing of home does not work at the door
    expect([call, s.door.handle({ call, token: home.token })]).toEqual([call, { error: 'not-paired' }]);
  }
});

test('a question it does not know, or no question at all, is refused; it never throws', () => {
  const s = setup();
  for (const request of [null, undefined, 'tekst', [], { call: 'control', token: s.pair() }, { call: 'snapshot' }, { call: 42 }, { call: 'session', token: 7 }]) {
    expect(s.door.handle(request)).toEqual({ error: expect.stringMatching(/^(bad|not-paired)$/) });
  }
});

test('reading needs a pairing; arranging needs the right, the same shape and the revision it knew', () => {
  const s = setup();
  const use = s.pair();
  const edit = s.pair('edit');
  expect(s.door.handle({ call: 'layouts', token: use })).toMatchObject({ revision: 0 });
  expect(s.door.handle({ call: 'put-layouts', token: use, format: SHARED_FORMAT, base: 0, layouts: {} })).toEqual({ error: 'role' });
  expect(s.door.handle({ call: 'put-layouts', token: edit, format: SHARED_FORMAT + 1, base: 0, layouts: {} })).toEqual({ error: 'format' });
  expect(s.door.handle({ call: 'put-layouts', token: edit, base: 0, layouts: {} })).toEqual({ error: 'format' });
  expect(s.door.handle({ call: 'put-layouts', token: edit, format: SHARED_FORMAT, base: 0, layouts: {}, sectionSeeds: { 'type:lights': '#3b6939' } })).toMatchObject({ ok: true, doc: { revision: 1 } });
  expect(s.door.handle({ call: 'put-layouts', token: edit, format: SHARED_FORMAT, base: 0, layouts: {} })).toMatchObject({ error: 'conflict', doc: { revision: 1 } });
  expect(s.door.handle({ call: 'looks-ops', token: edit, format: SHARED_FORMAT, ops: [{ house: { mode: 'dark' } }] })).toMatchObject({ doc: { house: { mode: 'dark' } } });
  expect(s.door.handle({ call: 'looks-ops', token: use, format: SHARED_FORMAT, ops: [{ house: { mode: 'dark' } }] })).toEqual({ error: 'role' });
});

test('own widgets are seen from outside, never changed: not even by a device that may arrange', () => {
  const s = setup();
  const edit = s.pair('edit');
  expect(s.door.handle({ call: 'widgets', token: edit })).toMatchObject({ revision: 0, widgets: [] });
  expect(s.door.handle({ call: 'widgets-ops', token: edit, format: SHARED_FORMAT, ops: [{ remove: 'w-1' }] })).toEqual({ error: 'role' });
});

test('too much is refused before anything is done', () => {
  const s = setup();
  const edit = s.pair('edit');
  const huge = 'x'.repeat(4 * 1024 * 1024 + 10);
  expect(s.door.handle({ call: 'put-layouts', token: edit, format: SHARED_FORMAT, base: 0, layouts: {}, extra: huge })).toEqual({ error: 'too-big' });
  expect(s.door.handle({ call: 'pair', code: '1', name: huge })).toEqual({ error: 'too-big' });
});

test('a device unpairs itself, and its token works no more', () => {
  const s = setup();
  const token = s.pair();
  expect(s.door.handle({ call: 'unpair', token })).toEqual({});
  expect(s.door.handle({ call: 'session', token })).toEqual({ error: 'not-paired' });
  expect(s.pairing.list()).toEqual([]);
});

test('measuring tells only the length of what arrived, for anyone', () => {
  const s = setup();
  expect(s.door.handle({ call: 'measure', fill: 'x'.repeat(1000) })).toEqual({ size: 1000 });
  expect(s.door.handle({ call: 'measure' })).toEqual({ size: 0 });
});

test('questions without a pairing have their own limit, so they cannot shut out a paired device; a paired device has one of its own', () => {
  const s = setup();
  const token = s.pair();
  for (let i = 0; i < DOOR_RATE.unpaired; i += 1) s.door.handle({ call: 'session', token: 'onzin' });
  expect(s.door.handle({ call: 'session', token: 'onzin' })).toEqual({ error: 'busy' });
  // pairing has a limit of its own
  expect(s.door.handle({ call: 'pair', code: '00000000', name: 'X' })).toEqual({ error: 'code' });
  expect(s.door.handle({ call: 'session', token })).toMatchObject({ device: { name: 'Telefoon' } });
  for (let i = 0; i < DOOR_RATE.paired; i += 1) s.door.handle({ call: 'session', token });
  expect(s.door.handle({ call: 'session', token })).toEqual({ error: 'busy' });
  s.later(60_001);
  expect(s.door.handle({ call: 'session', token })).toMatchObject({ device: { name: 'Telefoon' } });
  expect(s.door.handle({ call: 'session', token: 'onzin' })).toEqual({ error: 'not-paired' });
});

test('no answer ever holds a token, except the one pairing gives', () => {
  const s = setup();
  const token = s.pair('edit');
  for (const call of ['session', 'layouts', 'looks', 'widgets']) expect(JSON.stringify(s.door.handle({ call, token }))).not.toContain(token);
});

test('pairing and measuring each have a limit of their own: junk questions cannot keep a phone from pairing', async () => {
  const s = setup();
  for (let i = 0; i < DOOR_RATE.unpaired + 5; i += 1) s.door.handle({ call: 'session', token: 'onzin' });
  for (let i = 0; i < DOOR_RATE.measure + 5; i += 1) s.door.handle({ call: 'measure', fill: 'x' });
  expect(s.door.handle({ call: 'measure', fill: 'x' })).toEqual({ error: 'busy' });
  const { code } = s.pairing.openAwayCode(null);
  expect(s.door.handle({ call: 'pair', code, name: 'Telefoon' })).toMatchObject({ device: { name: 'Telefoon' } });
  for (let i = 0; i < DOOR_RATE.pair; i += 1) s.door.handle({ call: 'pair', code: '00000000', name: 'X' });
  expect(s.door.handle({ call: 'pair', code: '00000000', name: 'X' })).toEqual({ error: 'busy' });
});

test('a paired device changes the documents at most so often; it can still read', async () => {
  const s = setup();
  const token = s.pair('edit');
  for (let i = 0; i < DOOR_RATE.changes; i += 1) {
    expect(s.door.handle({ call: 'looks-ops', token, format: SHARED_FORMAT, ops: [{ house: { mode: i % 2 ? 'dark' : 'light' } }] })).not.toEqual({ error: 'busy' });
  }
  expect(s.door.handle({ call: 'looks-ops', token, format: SHARED_FORMAT, ops: [{ house: { mode: 'dark' } }] })).toEqual({ error: 'busy' });
  expect(s.door.handle({ call: 'session', token })).toMatchObject({ device: { name: 'Telefoon' } });
});

test('sizes count in bytes, as at home', async () => {
  const s = setup();
  const edit = s.pair('edit');
  // three bytes a letter: less than the limit in letters, more in bytes
  const wide = '€'.repeat(Math.ceil((4 * 1024 * 1024) / 3) + 10);
  expect(s.door.handle({ call: 'put-layouts', token: edit, format: SHARED_FORMAT, base: 0, layouts: {}, extra: wide })).toEqual({ error: 'too-big' });
});
