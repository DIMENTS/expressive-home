// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { AWAY_KEY, awayPairing, keepAwayPairing, pairAway } from '../../../src/ui/app/synced';

// Where a page with a key keeps its pairing with the app on its hub, and how it pairs: per hub, through the door of the app.

const ID = '5f2a00000000000000000c81';
const TOK = 'a'.repeat(43);
const NEW = 'b'.repeat(43);

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

test('the pairing is kept per hub, and only for that hub', () => {
  expect(awayPairing(localStorage, ID)).toBeNull();
  keepAwayPairing(localStorage, ID, TOK);
  expect(awayPairing(localStorage, ID)).toBe(TOK);
  expect(awayPairing(localStorage, '5f2a00000000000000000c82')).toBeNull();
  expect(awayPairing(localStorage, null)).toBeNull();
  keepAwayPairing(localStorage, ID, null);
  expect(localStorage.getItem(AWAY_KEY)).toBeNull();
  // whatever else stands there is no pairing
  localStorage.setItem(AWAY_KEY, '{"homeyId":"x"}');
  expect(awayPairing(localStorage, ID)).toBeNull();
});

test('pairing asks the door through the cloud, keeps the token, and says how it went', async () => {
  const calls: { url: string; body: unknown }[] = [];
  const answers: unknown[] = [{ token: NEW, device: { name: 'Telefoon', role: 'use' } }, { error: 'code' }, { error: 'locked' }, { error: 'full' }, new TypeError('Failed to fetch')];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(init!.body as string) });
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return new Response(JSON.stringify(answer), { status: 200 });
  };
  expect(await pairAway(localStorage, fetch, ID, '12345678', 'Telefoon')).toBe('ok');
  expect(calls[0]).toEqual({ url: `https://${ID}.connect.athom.com/api/app/app.expressive.home/sync`, body: { call: 'pair', code: '12345678', name: 'Telefoon' } });
  expect(awayPairing(localStorage, ID)).toBe(NEW);
  for (const result of ['code', 'locked', 'full', 'unreachable']) expect(await pairAway(localStorage, fetch, ID, '87654321', 'X')).toBe(result);
  // a code that is not eight digits is not even sent
  const before = calls.length;
  expect(await pairAway(localStorage, fetch, ID, '1234', 'X')).toBe('code');
  expect(calls.length).toBe(before);
});

test('a door that is too busy says so', async () => {
  const fetch = async () => new Response(JSON.stringify({ error: 'busy' }), { status: 200 });
  expect(await pairAway(localStorage, fetch, ID, '12345678', 'X')).toBe('busy');
});
