import { expect, test } from 'vitest';
import { createDoorLink, POLL_MS, REST_POLL_MS } from '../../src/served/door-link';
import { RequestError } from '../../src/served/link';
import { SHARED_FORMAT } from '../../src/sync/protocol';

// The way to the app on the hub for a page with a key: the same requests as at home, as questions to the door of the app,
// with the pairing in the body; and instead of a live stream, a look at the revisions every so often while it is seen.

type Call = Record<string, unknown>;

function setup(answers: (call: Call) => unknown = () => ({}), base: string | null = 'https://hub.example') {
  const calls: Call[] = [];
  const urls: string[] = [];
  let token: string | null = 'tok';
  let now = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let id = 0;
  const link = createDoorLink({
    fetch: async (url, init) => {
      urls.push(url);
      const body = JSON.parse(init!.body as string) as Call;
      calls.push(body);
      const answer = answers(body);
      if (answer instanceof Error) throw answer;
      return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    base: () => base,
    token: () => token,
    keepToken: (next) => { token = next; },
    setTimeout: (fn, ms) => { timers.push({ at: now + ms, fn, id: (id += 1) }); return id; },
    clearTimeout: (handle) => { const at = timers.findIndex((t) => t.id === handle); if (at >= 0) timers.splice(at, 1); },
    now: () => now,
  });
  const tick = async (ms: number) => {
    now += ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      due.fn();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { link, calls, urls, tick, token: () => token };
}

const session = (revisions = { layouts: 1, looks: 2, rescue: 0, widgets: 3 }, role = 'use', boot = 'b1') => ({ device: { name: 'Telefoon', role }, format: SHARED_FORMAT, boot, revisions });

test('a request of the store becomes a question to the door, with the pairing, as JSON, to the address of the route', async () => {
  const s = setup(() => ({ revision: 4, layouts: {}, sectionSeeds: {} }));
  expect(await s.link.request('GET', 'api/layouts')).toEqual({ revision: 4, layouts: {}, sectionSeeds: {} });
  expect(s.calls).toEqual([{ call: 'layouts', token: 'tok' }]);
  expect(s.urls).toEqual(['https://hub.example/api/app/app.expressive.home/sync']);
});

test('saving carries the shape of the documents; a save that came too late is a conflict with the document of now, as at home', async () => {
  const doc = { revision: 5, layouts: {}, sectionSeeds: {} };
  const s = setup((call) => (call['call'] === 'put-layouts' && call['base'] === 4 ? { ok: true, doc } : { error: 'conflict', doc }));
  expect(await s.link.request('PUT', 'api/layouts', { base: 4, layouts: {}, sectionSeeds: {} })).toEqual(doc);
  expect(s.calls[0]).toEqual({ call: 'put-layouts', token: 'tok', format: SHARED_FORMAT, base: 4, layouts: {}, sectionSeeds: {} });
  await expect(s.link.request('PUT', 'api/layouts', { base: 3, layouts: {} })).rejects.toEqual(new RequestError(409, doc));
});

test('every no of the door becomes the answer the store knows from home', async () => {
  const table: [string, number, unknown][] = [
    ['not-paired', 401, { error: 'not-paired' }], ['role', 403, { error: 'use-only' }], ['too-big', 413, { error: 'too-big' }],
    ['bad', 400, { error: 'bad' }], ['busy', 503, { error: 'busy' }], ['not-running', 503, { error: 'not-running' }], ['format', 412, { error: 'format' }],
  ];
  for (const [error, status, body] of table) {
    const s = setup(() => ({ error }));
    await expect(s.link.request('POST', 'api/looks', { ops: [] })).rejects.toEqual(new RequestError(status, body));
  }
  // and what the door cannot be asked at all, is not asked
  const s = setup();
  await expect(s.link.request('POST', 'api/control', {})).rejects.toEqual(new RequestError(404, { error: 'not-found' }));
  expect(s.calls).toEqual([]);
});

test('without an address or a pairing nothing is asked', async () => {
  const s = setup(() => ({}), null);
  await expect(s.link.request('GET', 'api/looks')).rejects.toEqual(new RequestError(503, { error: 'no-route' }));
  expect(s.calls).toEqual([]);
});

test('pairing keeps the token the door gives, and gives the store only the device', async () => {
  const s = setup((call) => (call['call'] === 'pair' ? { token: 'nieuw', device: { name: 'Telefoon', role: 'use' } } : {}));
  expect(await s.link.request('POST', 'api/pair', { code: '12345678', name: 'Telefoon' })).toEqual({ device: { name: 'Telefoon', role: 'use' } });
  expect(s.calls[0]).toEqual({ call: 'pair', code: '12345678', name: 'Telefoon' });
  expect(s.token()).toBe('nieuw');
});

test('the session tells whether this page is paired, as at home', async () => {
  const s = setup(() => session());
  expect(await s.link.request('GET', 'api/session')).toEqual({ paired: true, device: { name: 'Telefoon', role: 'use' } });
  const gone = setup(() => ({ error: 'not-paired' }));
  expect(await gone.link.request('GET', 'api/session')).toEqual({ paired: false });
});

test('held, it looks every so often: it opens with the revisions, and tells only what changed after that', async () => {
  let current = session();
  const s = setup(() => current);
  const seen: string[] = [];
  for (const type of ['open', 'layouts', 'looks', 'widgets', 'role', 'lost', 'unpaired'] as const) s.link.on(type, (value) => seen.push(`${type}:${JSON.stringify(value)}`));
  const release = s.link.hold();
  await s.tick(0);
  expect(seen).toEqual(['open:{"revision":1,"role":"use","looks":2,"rescue":0,"widgets":3}']);
  expect(s.link.up()).toBe(true);
  await s.tick(POLL_MS);
  expect(seen).toHaveLength(1);
  current = session({ layouts: 2, looks: 2, rescue: 0, widgets: 4 }, 'edit');
  await s.tick(POLL_MS);
  expect(seen.slice(1)).toEqual(['layouts:{"revision":2}', 'widgets:{"revision":4}', 'role:"edit"']);
  release();
  const before = s.calls.length;
  await s.tick(POLL_MS * 3);
  expect(s.calls.length).toBe(before);
});

test('after a failure, or when the app on the hub started anew, it opens again', async () => {
  let current: unknown = session();
  const s = setup(() => current);
  const seen: string[] = [];
  for (const type of ['open', 'lost'] as const) s.link.on(type, () => seen.push(type));
  s.link.hold();
  await s.tick(0);
  current = new TypeError('Failed to fetch');
  await s.tick(POLL_MS);
  expect(seen).toEqual(['open', 'lost']);
  expect(s.link.up()).toBe(false);
  await s.tick(POLL_MS);
  expect(seen).toEqual(['open', 'lost']);
  current = session();
  await s.tick(POLL_MS);
  expect(seen).toEqual(['open', 'lost', 'open']);
  current = session(undefined, 'use', 'b2');
  await s.tick(POLL_MS);
  expect(seen).toEqual(['open', 'lost', 'open', 'open']);
});

test('taken away on the hub: it says so once and stops looking', async () => {
  let current: unknown = session();
  const s = setup(() => current);
  const seen: string[] = [];
  s.link.on('unpaired', () => seen.push('unpaired'));
  s.link.hold();
  await s.tick(0);
  current = { error: 'not-paired' };
  await s.tick(POLL_MS);
  const after = s.calls.length;
  await s.tick(POLL_MS * 3);
  expect([seen, s.calls.length]).toEqual([['unpaired'], after]);
});

test('asleep it does not look; looked at again it looks at once; at rest it looks less often', async () => {
  const s = setup(() => session());
  s.link.hold();
  await s.tick(0);
  s.link.sleep();
  const asleep = s.calls.length;
  await s.tick(POLL_MS * 4);
  expect(s.calls.length).toBe(asleep);
  s.link.wake();
  await s.tick(0);
  expect(s.calls.length).toBe(asleep + 1);
  s.link.rest(true);
  const resting = s.calls.length;
  await s.tick(POLL_MS);
  expect(s.calls.length).toBe(resting);
  await s.tick(REST_POLL_MS - POLL_MS);
  expect(s.calls.length).toBe(resting + 1);
});

test('when the shape of the documents differs, the page only looks, and knows which side is older', async () => {
  let current: unknown = { ...session(undefined, 'edit'), format: SHARED_FORMAT - 1 };
  const s = setup(() => current);
  const roles: string[] = [];
  s.link.on('open', ({ role }) => roles.push(`open:${role}`));
  s.link.on('role', (role) => roles.push(`role:${role}`));
  s.link.hold();
  await s.tick(0);
  expect(roles).toEqual(['open:use']);
  expect(s.link.mismatch()).toBe('update-app');
  current = { ...session(undefined, 'edit'), format: SHARED_FORMAT + 1 };
  await s.tick(POLL_MS);
  expect(s.link.mismatch()).toBe('reload');
  current = session(undefined, 'edit');
  await s.tick(POLL_MS);
  expect(s.link.mismatch()).toBeNull();
  expect(roles).toEqual(['open:use', 'role:edit']);
});

test('a no of the cloud itself is not a no of the door: only the door says that a page is not paired', async () => {
  const seen: string[] = [];
  const s = setup();
  const link = createDoorLink({
    fetch: async () => new Response('<html>Unauthorized</html>', { status: 401 }),
    base: () => 'https://hub.example', token: () => 'tok', keepToken: () => {},
    setTimeout: (fn) => { setTimeout(fn, 0); return 0; }, clearTimeout: () => {}, now: () => 0,
  });
  link.on('unpaired', () => seen.push('unpaired'));
  await expect(link.request('GET', 'api/looks')).rejects.toMatchObject({ status: 503 });
  await expect(link.request('GET', 'api/session')).rejects.toMatchObject({ status: 503 });
  link.hold();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(seen).toEqual([]);
  expect(s).toBeDefined();
});

test('without a pairing here, the session says it is not paired, and nothing is asked', async () => {
  const calls: unknown[] = [];
  const link = createDoorLink({
    fetch: async (_url, init) => { calls.push(init); return new Response('{}', { status: 200 }); },
    base: () => 'https://hub.example', token: () => null, keepToken: () => {},
    setTimeout: () => 0, clearTimeout: () => {}, now: () => 0,
  });
  expect(await link.request('GET', 'api/session')).toEqual({ paired: false });
  expect(calls).toEqual([]);
});

test('the session that the store reads first keeps to the same rule: another shape of the documents only looks', async () => {
  const s = setup(() => ({ ...session(undefined, 'edit'), format: SHARED_FORMAT + 1 }));
  expect(await s.link.request('GET', 'api/session')).toEqual({ paired: true, device: { name: 'Telefoon', role: 'use' } });
});

test('looked at again while it is looking, it does not look twice at the same time', async () => {
  let open = 0;
  let most = 0;
  const link = createDoorLink({
    fetch: async () => {
      open += 1;
      most = Math.max(most, open);
      await new Promise((resolve) => setTimeout(resolve, 50));
      open -= 1;
      return new Response(JSON.stringify(session()), { status: 200 });
    },
    base: () => 'https://hub.example', token: () => 'tok', keepToken: () => {},
    setTimeout: (fn, ms) => setTimeout(fn, ms === POLL_MS ? 60_000 : 0), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => 0,
  });
  link.hold();
  await new Promise((resolve) => setTimeout(resolve, 10));
  link.wake();
  link.wake();
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(most).toBe(1);
  link.sleep();
});

test('a small save goes on also when the page closes', async () => {
  const s = setup(() => ({ ok: true, doc: { revision: 1, layouts: {}, sectionSeeds: {} } }));
  const inits: RequestInit[] = [];
  const link = createDoorLink({
    fetch: async (_url, init) => { inits.push(init!); return new Response(JSON.stringify({ ok: true, doc: { revision: 1 } }), { status: 200 }); },
    base: () => 'https://hub.example', token: () => 'tok', keepToken: () => {},
    setTimeout: () => 0, clearTimeout: () => {}, now: () => 0,
  });
  await link.request('PUT', 'api/layouts', { base: 0, layouts: {}, sectionSeeds: {} });
  expect(inits[0]!.keepalive).toBe(true);
  expect(s).toBeDefined();
});
