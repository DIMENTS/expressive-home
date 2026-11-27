import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from 'vitest';
import { AWAY_MAX_WRONG, CODE_MS, createPairing, LOCK_MS, MAX_DEVICES } from '../../src/home-server/pairing';

// A device for away from home pairs with a code of its own: eight digits, made on purpose in the settings of the app,
// one at a time, with a counter and a lock of its own. Guessing from outside never touches the codes for home.

function setup(stored: unknown = []) {
  let kept: unknown = stored;
  let now = 1_000_000;
  let codes = 100_000;
  let away = 10_000_000;
  const pairing = createPairing({
    load: () => kept,
    save: (devices) => { kept = structuredClone(devices); },
    now: () => now,
    token: () => randomBytes(32).toString('base64url'),
    code: () => String(codes++).padStart(6, '0'),
    awayCode: () => String(away++).padStart(8, '0'),
    fingerprint: (token) => createHash('sha256').update(token).digest('hex'),
  });
  return { pairing, kept: () => kept as Record<string, unknown>[], later: (ms: number) => { now += ms; } };
}

test('a code for away has eight digits, looks at the dashboard unless arranging was chosen, and pairs one device through the cloud', () => {
  const s = setup();
  const made = s.pairing.openAwayCode(null);
  expect(made.code).toMatch(/^\d{8}$/);
  expect(made.role).toBe('use');
  expect(made.expiresAt).toBe(1_000_000 + CODE_MS);
  expect(s.pairing.awayCodes()).toEqual({ open: { role: 'use', expiresAt: made.expiresAt, serial: made.serial }, used: null });
  const result = s.pairing.redeemAway(made.code, ' Telefoon ');
  expect(result).toMatchObject({ ok: true, device: { name: 'Telefoon', role: 'use', via: 'cloud' } });
  if (!result.ok) return;
  expect(s.pairing.findAway(result.token)).toMatchObject({ name: 'Telefoon', via: 'cloud' });
  expect(s.pairing.awayCodes()).toEqual({ open: null, used: { serial: made.serial, name: 'Telefoon' } });
  // once only, and kept as a device through the cloud
  expect(s.pairing.redeemAway(made.code, 'Ander')).toEqual({ ok: false, reason: 'code' });
  expect(s.kept()[0]).toMatchObject({ via: 'cloud' });
  expect(s.pairing.list()[0]).toMatchObject({ via: 'cloud' });
  expect(s.pairing.openAwayCode('edit').role).toBe('edit');
});

test('one code for away at a time: a new one replaces the one before', () => {
  const s = setup();
  const first = s.pairing.openAwayCode(null);
  const second = s.pairing.openAwayCode(null);
  expect(s.pairing.redeemAway(first.code, 'Oud')).toEqual({ ok: false, reason: 'code' });
  expect(s.pairing.redeemAway(second.code, 'Nieuw')).toMatchObject({ ok: true });
});

test('a code for away does not pair at home, and a code for home not from outside', () => {
  const s = setup();
  const away = s.pairing.openAwayCode(null);
  const home = s.pairing.newCode('use');
  expect(s.pairing.redeem(away.code, 'X')).toEqual({ ok: false, reason: 'code' });
  expect(s.pairing.redeemAway(home.code, 'X')).toEqual({ ok: false, reason: 'code' });
  // and a pairing of the one kind is not one of the other
  const fromHome = s.pairing.redeem(home.code, 'Tablet');
  const fromAway = s.pairing.redeemAway(away.code, 'Telefoon');
  if (!fromHome.ok || !fromAway.ok) throw new Error('not paired');
  expect([s.pairing.findAway(fromHome.token), s.pairing.find(fromAway.token)]).toEqual([null, null]);
  expect(s.pairing.find(fromHome.token)).toMatchObject({ name: 'Tablet' });
});

test('the fifth wrong code from outside closes the open code and the door for a minute; home goes on', () => {
  const s = setup();
  const away = s.pairing.openAwayCode(null);
  const home = s.pairing.newCode('use');
  for (let i = 0; i < AWAY_MAX_WRONG; i += 1) expect(s.pairing.redeemAway(`0000000${i}`, 'Raden')).toEqual({ ok: false, reason: 'code' });
  expect(s.pairing.awayCodes().open).toBeNull();
  expect(s.pairing.redeemAway(away.code, 'Telefoon')).toEqual({ ok: false, reason: 'locked' });
  // home pairs as always
  expect(s.pairing.redeem(home.code, 'Tablet')).toMatchObject({ ok: true });
  s.later(LOCK_MS + 1);
  const again = s.pairing.openAwayCode(null);
  expect(s.pairing.redeemAway(again.code, 'Telefoon')).toMatchObject({ ok: true });
});

test('wrong codes count also with no code open, and the answer is the same: it never tells whether one is open', () => {
  const s = setup();
  for (let i = 0; i < AWAY_MAX_WRONG; i += 1) expect(s.pairing.redeemAway('00000000', 'Raden')).toEqual({ ok: false, reason: 'code' });
  expect(s.pairing.redeemAway('00000000', 'Raden')).toEqual({ ok: false, reason: 'locked' });
});

test('wrong codes at home do not lock the door from outside, and the other way round', () => {
  const s = setup();
  s.pairing.newCode('use');
  for (let i = 0; i < 5; i += 1) s.pairing.redeem('999999', 'Raden');
  const away = s.pairing.openAwayCode(null);
  expect(s.pairing.redeemAway(away.code, 'Telefoon')).toMatchObject({ ok: true });
});

test('making a code for away by hand opens the door again and starts the count anew', () => {
  const s = setup();
  for (let i = 0; i < AWAY_MAX_WRONG; i += 1) s.pairing.redeemAway('00000000', 'Raden');
  const fresh = s.pairing.openAwayCode(null);
  expect(s.pairing.redeemAway(fresh.code, 'Telefoon')).toMatchObject({ ok: true });
});

test('a code for away runs out, and a full house says so', () => {
  const s = setup(Array.from({ length: MAX_DEVICES }, (_, n) => ({ id: `d${n}`, name: 'X', role: 'use', pairedAt: '', lastSeen: '', fingerprint: `f${n}` })));
  const made = s.pairing.openAwayCode(null);
  expect(s.pairing.redeemAway(made.code, 'Telefoon')).toEqual({ ok: false, reason: 'full' });
  s.later(CODE_MS + 1);
  expect(s.pairing.awayCodes().open).toBeNull();
  expect(s.pairing.redeemAway(made.code, 'Telefoon')).toEqual({ ok: false, reason: 'code' });
});
