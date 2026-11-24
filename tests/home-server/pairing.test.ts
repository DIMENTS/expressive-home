import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from 'vitest';
import { CODE_MS, createPairing, LEFT_MS, LOCK_MS, MAX_DEVICES, MAX_OPEN, MAX_WRONG, SEEN_MS } from '../../src/home-server/pairing';

function setup(stored: unknown = []) {
  let kept: unknown = stored;
  let saves = 0;
  let now = 1_000_000;
  let codes = 100_000;
  const open = () => createPairing({
    load: () => kept,
    save: (devices) => { kept = structuredClone(devices); saves += 1; },
    now: () => now,
    token: () => randomBytes(32).toString('base64url'),
    code: () => String(codes++).padStart(6, '0'),
    fingerprint: (token) => createHash('sha256').update(token).digest('hex'),
  });
  return { open, pairing: open(), kept: () => kept as Record<string, unknown>[], saves: () => saves, later: (ms: number) => { now += ms; } };
}

/** Pairs a device and gives its token. */
function pair(s: ReturnType<typeof setup>, name = 'Tablet', role: 'use' | 'edit' = 'edit'): string {
  const result = s.pairing.redeem(s.pairing.newCode(role).code, name);
  if (!result.ok) throw new Error(result.reason);
  return result.token;
}

test('a code pairs one device, with the right that was chosen for it', () => {
  const s = setup();
  const { code, expiresAt } = s.pairing.newCode('use');
  expect(code).toMatch(/^\d{6}$/);
  expect(expiresAt).toBe(1_000_000 + CODE_MS);
  const result = s.pairing.redeem(code, '  Tablet in de camper ');
  expect(result).toMatchObject({ ok: true, device: { name: 'Tablet in de camper', role: 'use' } });
  if (!result.ok) return;
  expect(s.pairing.find(result.token)).toMatchObject({ name: 'Tablet in de camper', role: 'use' });
  // once only
  expect(s.pairing.redeem(code, 'Ander')).toEqual({ ok: false, reason: 'code' });
});

test('only the fingerprint of a token is kept, and it still works after a restart', () => {
  const s = setup();
  const token = pair(s);
  expect(JSON.stringify(s.kept())).not.toContain(token);
  expect(s.open().find(token)).toMatchObject({ name: 'Tablet' });
  for (const wrong of ['', 'x', `${token}x`, '__proto__']) expect(s.pairing.find(wrong)).toBeNull();
});

test('a code ends after ten minutes, and a new one replaces it', () => {
  const s = setup();
  const first = s.pairing.newCode('edit');
  const second = s.pairing.newCode('use');
  expect(s.pairing.redeem(first.code, 'x')).toEqual({ ok: false, reason: 'code' });
  s.later(CODE_MS + 1);
  expect(s.pairing.redeem(second.code, 'x')).toEqual({ ok: false, reason: 'code' });
});

test('without a code nothing can be paired, not even with an empty one', () => {
  const s = setup();
  for (const code of ['', '000000', 'abc']) expect(s.pairing.redeem(code, 'x')).toEqual({ ok: false, reason: 'code' });
});

test('after some wrong codes pairing is closed for a minute, also for the right code', () => {
  const s = setup();
  const { code } = s.pairing.newCode('edit');
  for (let i = 0; i < MAX_WRONG; i += 1) expect(s.pairing.redeem('999999', 'x')).toEqual({ ok: false, reason: 'code' });
  expect(s.pairing.redeem(code, 'x')).toEqual({ ok: false, reason: 'locked' });
  s.later(LOCK_MS + 1);
  expect(s.pairing.redeem(code, 'x')).toMatchObject({ ok: true });
});

test('a device can be taken away; whoever listens hears it', () => {
  const s = setup();
  const token = pair(s);
  const gone: string[] = [];
  s.pairing.subscribe((id) => gone.push(id));
  const { id } = s.pairing.find(token)!;
  expect(s.pairing.list().map((d) => d.name)).toEqual(['Tablet']);
  expect(s.pairing.remove(id)).toBe(true);
  expect(s.pairing.remove(id)).toBe(false);
  expect([s.pairing.find(token), s.pairing.list(), gone]).toEqual([null, [], [id]]);
  expect(s.open().find(token)).toBeNull();
});

test('a device without a name gets one, and a long one is cut', () => {
  const s = setup();
  expect(s.pairing.find(pair(s, '   '))!.name).toBe('Apparaat');
  expect(s.pairing.find(pair(s, 'a'.repeat(200)))!.name).toHaveLength(60);
});

test('when a device was last seen is kept, but not written at every request', () => {
  const s = setup();
  const token = pair(s);
  const before = s.saves();
  s.pairing.find(token);
  s.later(SEEN_MS + 1);
  s.pairing.find(token);
  s.pairing.find(token);
  expect(s.saves()).toBe(before + 1);
  expect(s.pairing.list()[0]!.lastSeen).toBe(new Date(1_000_000 + SEEN_MS + 1).toISOString());
});

test('there is a limit to the number of devices', () => {
  const s = setup();
  for (let i = 0; i < MAX_DEVICES; i += 1) pair(s, `d${i}`);
  expect(s.pairing.redeem(s.pairing.newCode('use').code, 'nog een')).toEqual({ ok: false, reason: 'full' });
});

test('rubbish in what was kept falls away, the rest stays', () => {
  const s = setup();
  const token = pair(s);
  const good = s.kept()[0]!;
  for (const rubbish of [null, 'x', {}, [null, 5, { ...good, role: 'admin', id: 'x1' }, { ...good, fingerprint: 5 }, good, good]]) {
    const other = setup(rubbish);
    expect(other.pairing.list().length).toBeLessThanOrEqual(1);
    if (Array.isArray(rubbish)) expect(other.pairing.find(token)).toMatchObject({ name: 'Tablet', role: 'edit' });
  }
});

test('wrong codes while there is none to guess do not shut the door, and a new code opens it again', () => {
  const s = setup();
  for (let i = 0; i < 3 * MAX_WRONG; i += 1) expect(s.pairing.redeem('999999', 'x')).toEqual({ ok: false, reason: 'code' });
  const { code } = s.pairing.newCode('edit');
  for (let i = 0; i < MAX_WRONG; i += 1) s.pairing.redeem('999999', 'x');
  expect(s.pairing.redeem(code, 'x')).toEqual({ ok: false, reason: 'locked' });
  expect(s.pairing.redeem(s.pairing.newCode('use').code, 'x')).toMatchObject({ ok: true });
});

test('a device that listens all day was seen all day, without being written all the time', () => {
  const s = setup();
  pair(s);
  const { id } = s.pairing.list()[0]!;
  const before = s.saves();
  s.pairing.touch(id);
  s.pairing.touch('nothing');
  expect(s.saves()).toBe(before);
  s.later(SEEN_MS + 1);
  s.pairing.touch(id);
  s.pairing.touch(id);
  expect(s.saves()).toBe(before + 1);
  expect(Date.parse(s.pairing.list()[0]!.lastSeen)).toBe(1_000_000 + SEEN_MS + 1);
});

test('two codes are open next to each other, and one does not take the other away', () => {
  const s = setup();
  const scan = s.pairing.openCode('scan', 'edit');
  const here = s.pairing.openCode('here', 'use');
  expect(scan.code).not.toBe(here.code);
  expect(s.pairing.redeem(here.code, 'Telefoon')).toMatchObject({ ok: true, device: { role: 'use' } });
  expect(s.pairing.redeem(scan.code, 'Tablet')).toMatchObject({ ok: true, device: { role: 'edit' } });
});

test('two open codes are never the same', () => {
  const codes = ['111111', '111111', '111111', '222222', '222222', '333333'];
  const pairing = createPairing({ load: () => [], save: () => {}, now: () => 0, token: () => randomBytes(8).toString('hex'), code: () => codes.shift()!, fingerprint: (token) => token });
  expect(pairing.openCode('scan', 'edit').code).toBe('111111');
  expect(pairing.openCode('here', 'use').code).toBe('222222');
  expect(pairing.openCode('scan', 'edit', true).code).toBe('333333');
});

test('asking again gives the code that is open, as long as there is time to use it', () => {
  const s = setup();
  const first = s.pairing.openCode('scan', 'edit');
  s.later(CODE_MS - LEFT_MS);
  expect(s.pairing.openCode('scan', null)).toEqual(first);
  s.later(1);
  const second = s.pairing.openCode('scan', null);
  expect(second.code).not.toBe(first.code);
  expect(second.serial).not.toBe(first.serial);
  // who scanned the first one can still go on, until its time is over
  expect(s.pairing.codes().scan).toMatchObject({ open: { serial: second.serial }, serials: [first.serial, second.serial] });
  expect(s.pairing.redeem(first.code, 'x')).toMatchObject({ ok: true });
  expect(s.pairing.redeem(first.code, 'x')).toEqual({ ok: false, reason: 'code' });
  // and a fresh one when that is asked for
  expect(s.pairing.openCode('scan', null, true).code).not.toBe(second.code);
  expect(s.pairing.redeem(second.code, 'x')).toEqual({ ok: false, reason: 'code' });
});

test('another right is for the code that is open: who scanned it already can go on', () => {
  const s = setup();
  const first = s.pairing.openCode('scan', 'edit');
  expect(s.pairing.openCode('scan', 'use')).toEqual({ ...first, role: 'use' });
  expect(s.pairing.openCode('scan', null)).toEqual({ ...first, role: 'use' });
  expect(s.pairing.redeem(first.code, 'x')).toMatchObject({ ok: true, device: { role: 'use' } });
});

test('another right counts in the last minutes too, and a code that faded ends in time', () => {
  const s = setup();
  const first = s.pairing.openCode('scan', null);
  s.later(CODE_MS - 1000);
  expect(s.pairing.openCode('scan', 'use')).toEqual({ ...first, role: 'use' });
  s.pairing.openCode('scan', null);
  s.later(1001);
  expect(s.pairing.redeem(first.code, 'x')).toEqual({ ok: false, reason: 'code' });
  // a new one by hand takes away every older one
  const second = s.pairing.openCode('scan', null);
  s.later(CODE_MS - 1000);
  const third = s.pairing.openCode('scan', null);
  s.pairing.openCode('scan', null, true);
  for (const { code } of [second, third]) expect(s.pairing.redeem(code, 'x')).toEqual({ ok: false, reason: 'code' });
});

test('a right that nobody chose follows the devices; one that was chosen stays', () => {
  const s = setup();
  expect(s.pairing.openCode('scan', null).role).toBe('edit');
  s.pairing.redeem(s.pairing.openCode('here', 'edit').code, 'Laptop');
  expect(s.pairing.openCode('scan', null).role).toBe('use');
  expect(s.pairing.openCode('scan', null, true).role).toBe('use');
  s.pairing.openCode('scan', 'edit');
  expect([s.pairing.openCode('scan', null).role, s.pairing.openCode('scan', null, true).role]).toEqual(['edit', 'edit']);
});

test('every device that opens the dashboard itself has a code of its own, with its own right', () => {
  const s = setup();
  const phone = s.pairing.openCode('here', 'use');
  const laptop = s.pairing.openCode('here', 'edit');
  expect(phone.code).not.toBe(laptop.code);
  expect(s.pairing.codes().here.serials).toEqual([phone.serial, laptop.serial]);
  expect(s.pairing.redeem(phone.code, 'Telefoon')).toMatchObject({ ok: true, device: { role: 'use' } });
  expect(s.pairing.redeem(laptop.code, 'Laptop')).toMatchObject({ ok: true, device: { role: 'edit' } });
  // not without end: the oldest goes
  const many = Array.from({ length: MAX_OPEN + 2 }, () => s.pairing.openCode('here', 'use'));
  expect(s.pairing.codes().here.serials).toHaveLength(MAX_OPEN);
  expect(s.pairing.redeem(many[0]!.code, 'x')).toEqual({ ok: false, reason: 'code' });
});

test('without a choice the first device may arrange, and the next ones use', () => {
  const s = setup();
  expect(s.pairing.openCode('scan', null).role).toBe('edit');
  pair(s, 'Telefoon', 'use');
  expect(s.pairing.openCode('scan', null, true).role).toBe('edit');
  pair(s, 'Tablet', 'edit');
  expect(s.pairing.openCode('scan', null, true).role).toBe('use');
});

test('what is told of the codes is never a code', () => {
  const s = setup();
  expect(s.pairing.codes()).toEqual({ scan: { open: null, used: null, serials: [] }, here: { open: null, used: null, serials: [] } });
  const scan = s.pairing.openCode('scan', 'edit');
  const here = s.pairing.openCode('here', 'use');
  expect(JSON.stringify(s.pairing.codes())).not.toMatch(new RegExp(`"(?:code|${scan.code}|${here.code})"`));
  expect(s.pairing.codes()).toMatchObject({ scan: { open: { serial: scan.serial, role: 'edit', expiresAt: scan.expiresAt }, used: null }, here: { open: { serial: here.serial } } });
  s.pairing.redeem(scan.code, ' Tablet ');
  expect(s.pairing.codes().scan).toEqual({ open: null, used: { serial: scan.serial, name: 'Tablet' }, serials: [] });
  s.later(CODE_MS + 1);
  expect(s.pairing.codes().here).toEqual({ open: null, used: null, serials: [] });
});

test('five wrong codes shut the door for both; only a code by hand opens it', () => {
  const s = setup();
  const scan = s.pairing.openCode('scan', 'edit');
  const here = s.pairing.openCode('here', 'use');
  for (let i = 0; i < MAX_WRONG; i += 1) s.pairing.redeem('999999', 'x');
  for (const { code } of [scan, here, s.pairing.openCode('scan', null), s.pairing.openCode('here', null)]) expect(s.pairing.redeem(code, 'x')).toEqual({ ok: false, reason: 'locked' });
  s.later(CODE_MS);
  for (let i = 0; i < MAX_WRONG; i += 1) s.pairing.redeem('999999', 'x');
  s.later(1);
  const next = s.pairing.openCode('scan', 'edit');
  for (let i = 0; i < MAX_WRONG; i += 1) s.pairing.redeem('999999', 'x');
  expect(s.pairing.redeem(next.code, 'x')).toEqual({ ok: false, reason: 'locked' });
  expect(s.pairing.redeem(s.pairing.openCode('scan', 'edit', true).code, 'x')).toMatchObject({ ok: true });
});

test('the right of a device can change, it is kept, and whoever listens hears it once', () => {
  const s = setup();
  const token = pair(s, 'Tablet', 'use');
  const { id } = s.pairing.list()[0]!;
  const heard: unknown[] = [];
  const stop = s.pairing.onRole((device, role) => heard.push([device, role]));
  expect(s.pairing.setRole(id, 'edit')).toBe(true);
  expect(s.pairing.setRole(id, 'edit')).toBe(true);
  expect(s.pairing.setRole('nothing', 'use')).toBe(false);
  expect(heard).toEqual([[id, 'edit']]);
  expect(s.pairing.find(token)).toMatchObject({ role: 'edit' });
  expect(s.open().find(token)).toMatchObject({ role: 'edit' });
  stop();
  s.pairing.setRole(id, 'use');
  expect(heard).toHaveLength(1);
});
