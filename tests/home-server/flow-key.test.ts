import { expect, test, vi } from 'vitest';
import { createFlowKey, NO_FLOW } from '../../src/home-server/flow-key';

// The key with which the app on the hub starts flows: an app itself is not allowed to.

const KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:11111111-2222-3333-4444-555555555555:0123456789abcdef';
const OTHER = KEY.replace('aaaaaaaa', 'ffffffff');
const FLOW = { id: 'flow-1', kind: 'flow' as const };

type Answer = { status: number; body?: unknown } | 'away';
function setup(stored?: unknown) {
  const state = { stored };
  const answers = new Map<string, Answer>([['GET session', { status: 200, body: { intersectedScopes: ['homey.flow.start'] } }], ['POST trigger', { status: 200, body: {} }], ['POST proof', { status: 404 }]]);
  const sent: [string, string, string][] = [];
  /** Answers that wait until the test gives them. */
  const held: (() => void)[] = [];
  const options = { hold: false };
  const make = () => {
    const flowKey = createFlowKey({
      load: () => state.stored, save: (value) => { state.stored = structuredClone(value); },
      request: async (method, path, key) => {
        sent.push([method, path, key]);
        if (options.hold) await new Promise<void>((done) => { held.push(done); });
        const answer = answers.get(`${method} ${path.endsWith(`/${NO_FLOW}/trigger`) ? 'proof' : path.endsWith('/trigger') ? 'trigger' : 'session'}`)!;
        if (answer === 'away') throw new Error(`no answer, ${key}`);
        return { status: answer.status, body: answer.body ?? null };
      },
    });
    const heard = vi.fn();
    flowKey.subscribe(heard);
    return { flowKey, heard };
  };
  return { state, answers, sent, held, options, make, ...make() };
}

test('without a key no flow is started, and nothing is asked', async () => {
  const s = setup();
  expect([s.flowKey.state(), s.flowKey.usable()]).toEqual(['none', false]);
  await expect(s.flowKey.start(FLOW)).rejects.toThrow();
  expect(s.sent).toEqual([]);
});

test.each([null, 'x', [], {}, { key: '' }, { key: 5 }, { key: 'kort' }, { key: 'met spatie er in, dus geen sleutel' }])('what was kept and is no key is none: %j', (wrong) => {
  expect(setup(wrong).flowKey.state()).toBe('none');
});

test('a key is checked at the hub, kept, and works after a restart too', async () => {
  const s = setup();
  expect(await s.flowKey.set(`  ${KEY}\n`)).toBe('works');
  expect(s.sent).toEqual([['GET', '/api/manager/sessions/session/me', KEY]]);
  expect([s.flowKey.state(), s.flowKey.usable(), s.heard.mock.calls.length]).toEqual(['works', true, 1]);
  expect(s.state.stored).toEqual({ key: KEY, wide: false, refused: false });
  expect(s.make().flowKey.state()).toBe('works');
});

test('no word of the key comes out', async () => {
  const s = setup();
  await s.flowKey.set(KEY);
  s.answers.set('POST trigger', 'away');
  const error = await s.flowKey.start(FLOW).catch((e: unknown) => e as Error);
  expect((error as Error).message).not.toContain(KEY);
  expect(JSON.stringify([s.flowKey, s.flowKey.state()])).not.toContain(KEY);
});

test.each([[['homey']], [['homey.flow']], [['homey.flow.start', 'homey.device.control']], [['homey.flow', 'homey.device']], [['homey.flow.start', 'homey.app.control']], [['homey.flow.start', 'homey.logic']], [['homey.flow.start', 'homey.flow.readonly']]])('a key that may do more works, and that is said: %j', async (scopes) => {
  const s = setup();
  s.answers.set('GET session', { status: 200, body: { intersectedScopes: scopes } });
  expect([await s.flowKey.set(KEY), s.flowKey.state(), s.flowKey.usable()]).toEqual(['wide', 'wide', true]);
  expect(s.make().flowKey.state()).toBe('wide');
});

test('a key for starting flows only is what is asked for', async () => {
  const s = setup();
  s.answers.set('GET session', { status: 200, body: { scopes: ['homey.flow.start'] } });
  expect(await s.flowKey.set(KEY)).toBe('works');
});

test('what a key really may counts, not what was asked for it', async () => {
  const s = setup();
  s.answers.set('GET session', { status: 200, body: { scopes: ['homey'], intersectedScopes: ['homey.flow.start'] } });
  expect(await s.flowKey.set(KEY)).toBe('works');
  s.answers.set('GET session', { status: 200, body: { scopes: ['homey.flow.start'], intersectedScopes: ['homey.device'] } });
  expect(await s.flowKey.set(OTHER)).toBe('no-right');
});

test.each(['', '   ', 'kort', 'a b'.repeat(20), `${KEY}\nX-Extra: 1`, `${KEY}é`, 'x'.repeat(1001), null, undefined, 5, { key: KEY }])('what is no key is not sent: %j', async (text) => {
  const s = setup({ key: OTHER, wide: false });
  expect([await s.flowKey.set(text), s.sent, s.state.stored]).toEqual(['not-a-key', [], { key: OTHER, wide: false }]);
});

const refusals: [string, Answer, string][] = [
  ['that the hub does not know', { status: 401 }, 'refused'],
  ['that may not start flows', { status: 200, body: { intersectedScopes: ['homey.device.control'] } }, 'no-right'],
  ['that may do nothing', { status: 200, body: { intersectedScopes: [] } }, 'no-right'],
  ['that cannot be checked now', 'away', 'unreachable'],
  ...[500, 502, 503, 504, 301, 400, 404, 405, 408, 409, 429].map((status): [string, Answer, string] => [`while the hub answers ${status}`, { status }, 'unreachable']),
];
test.each(refusals)('a key %s is not kept; the one there was stays', async (_what, answer, result) => {
  const s = setup({ key: OTHER, wide: false });
  s.answers.set('GET session', answer);
  expect([await s.flowKey.set(KEY), s.flowKey.state(), s.heard.mock.calls.length, s.state.stored]).toEqual([result, 'works', 0, { key: OTHER, wide: false }]);
});

const silent: Answer[] = [{ status: 403 }, { status: 200, body: 'ok' }, { status: 200, body: {} }, { status: 200, body: null }];
test.each(silent)('when the hub does not tell what a key may, a flow that does not exist shows it: %j', async (answer) => {
  const s = setup();
  s.answers.set('GET session', answer);
  expect([await s.flowKey.set(KEY), s.flowKey.usable()]).toEqual(['works', true]);
  expect(s.sent.at(-1)).toEqual(['POST', `/api/manager/flow/flow/${NO_FLOW}/trigger`, KEY]);
});

const proofs: [Answer, string][] = [[{ status: 401 }, 'refused'], [{ status: 403 }, 'no-right'], [{ status: 200 }, 'unreachable'], [{ status: 400 }, 'unreachable'], [{ status: 500 }, 'unreachable'], ['away', 'unreachable']];
test.each(proofs)('and a key that this does not show is not kept: %j', async (answer, result) => {
  const s = setup({ key: OTHER, wide: false });
  s.answers.set('GET session', { status: 403 });
  s.answers.set('POST proof', answer);
  expect([await s.flowKey.set(KEY), s.state.stored]).toEqual([result, { key: OTHER, wide: false }]);
});

test('both kinds of flow are started with the key', async () => {
  const s = setup({ key: KEY, wide: false });
  await s.flowKey.start(FLOW);
  await s.flowKey.start({ id: 'flow/2', kind: 'advanced' });
  expect(s.sent).toEqual([
    ['POST', '/api/manager/flow/flow/flow-1/trigger', KEY],
    ['POST', '/api/manager/flow/advancedflow/flow%2F2/trigger', KEY],
  ]);
});

test('an empty answer is a flow that started', async () => {
  const s = setup({ key: KEY, wide: false });
  s.answers.set('POST trigger', { status: 204 });
  await s.flowKey.start(FLOW);
  expect(s.flowKey.state()).toBe('works');
});

test.each([401, 403])('a refusal (%d) while the key still may start flows leaves it be', async (status) => {
  const s = setup({ key: KEY, wide: false });
  s.answers.set('POST trigger', { status });
  await expect(s.flowKey.start(FLOW)).rejects.toThrow();
  expect([s.flowKey.state(), s.heard.mock.calls.length, s.sent.map(([method]) => method)]).toEqual(['works', 0, ['POST', 'GET']]);
  s.answers.set('GET session', 'away');
  await expect(s.flowKey.start(FLOW)).rejects.toThrow();
  expect(s.flowKey.state()).toBe('works');
});

const gone: [number, Answer][] = [[401, { status: 401 }], [403, { status: 200, body: { intersectedScopes: ['homey.device'] } }]];
test.each(gone)('a key that no longer may (%d) is told, and not sent again, also after a restart', async (status, session) => {
  const s = setup({ key: KEY, wide: false });
  s.answers.set('POST trigger', { status });
  s.answers.set('GET session', session);
  await expect(s.flowKey.start(FLOW)).rejects.toThrow();
  expect([s.flowKey.state(), s.flowKey.usable(), s.heard.mock.calls.length]).toEqual(['refused', false, 1]);
  await expect(s.flowKey.start(FLOW)).rejects.toThrow();
  expect(s.sent).toHaveLength(2);
  expect(s.make().flowKey.state()).toBe('refused');
  // a new one makes it good again
  s.answers.set('GET session', { status: 200, body: { scopes: ['homey.flow.start'] } });
  expect([await s.flowKey.set(OTHER), s.flowKey.state()]).toEqual(['works', 'works']);
});

test.each<Answer>([{ status: 404 }, { status: 500 }, 'away'])('a flow that does not start for another reason leaves the key be: %j', async (answer) => {
  const s = setup({ key: KEY, wide: false });
  s.answers.set('POST trigger', answer);
  await expect(s.flowKey.start(FLOW)).rejects.toThrow();
  expect([s.flowKey.state(), s.heard.mock.calls.length]).toEqual(['works', 0]);
});

test('a refusal of the key before does not count for the new one', async () => {
  const s = setup({ key: KEY, wide: false });
  s.options.hold = true;
  s.answers.set('POST trigger', { status: 401 });
  s.answers.set('GET session', { status: 200, body: { scopes: ['homey.flow.start'] } });
  const late = s.flowKey.start(FLOW).catch(() => 'failed');
  s.options.hold = false;
  await s.flowKey.set(OTHER);
  s.answers.set('GET session', { status: 401 });
  s.held.shift()!();
  expect([await late, s.flowKey.state()]).toEqual(['failed', 'works']);
});

test('the key can be taken away; what was being checked meanwhile is not kept', async () => {
  const s = setup({ key: OTHER, wide: false });
  s.options.hold = true;
  const checking = s.flowKey.set(KEY);
  s.flowKey.remove();
  expect([s.flowKey.state(), s.state.stored, s.heard.mock.calls.length]).toEqual(['none', null, 1]);
  s.held.shift()!();
  expect([await checking, s.flowKey.state(), s.state.stored]).toEqual(['unreachable', 'none', null]);
});

test('of two keys that are given at once the last one counts', async () => {
  const s = setup();
  s.options.hold = true;
  const first = s.flowKey.set(KEY);
  const second = s.flowKey.set(OTHER);
  s.held[1]!();
  expect(await second).toBe('works');
  s.held[0]!();
  expect([await first, s.state.stored]).toEqual(['unreachable', { key: OTHER, wide: false, refused: false }]);
});

test('a hub that cannot keep it says so instead of forgetting it later', async () => {
  const flowKey = createFlowKey({ load: () => undefined, save: () => { throw new Error('full'); }, request: async () => ({ status: 200, body: { scopes: ['homey.flow.start'] } }) });
  await expect(flowKey.set(KEY)).rejects.toThrow('full');
  expect(flowKey.state()).toBe('none');
});

test('a listener that stopped hears nothing more', async () => {
  const s = setup({ key: KEY, wide: false });
  const other = vi.fn();
  s.flowKey.subscribe(other)();
  s.flowKey.remove();
  expect([s.heard.mock.calls.length, other.mock.calls.length]).toEqual([1, 0]);
});
