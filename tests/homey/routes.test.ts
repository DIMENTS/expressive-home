import { expect, test, vi } from 'vitest';
import {
  CLOUD_TIMEOUT_MS,
  FIRST_LOCAL_TIMEOUT_MS,
  LOCAL_TIMEOUT_MS,
  candidatesFor,
  chooseRoute,
  cloudUrl,
  isHomeyId,
  isIPv4,
  localUrl,
  probe,
  watchForLocal,
  type RouteCandidate,
} from '../../src/homey/routes';

const ok = (headers: Record<string, string> = {}) => Promise.resolve(new Response('true', { status: 200, headers }));
const never = () => new Promise<Response>(() => {});
const ID = '64a1b2c3d4e5f60718293a4b';
const OTHER = '0123456789abcdef01234567';
const local: RouteCandidate = { route: 'local', baseUrl: 'https://192-168-1-50.homey.homeylocal.com' };
const cloud: RouteCandidate = { route: 'cloud', baseUrl: `https://${ID}.connect.athom.com` };
const byRoute = (map: { local: () => Promise<Response>; cloud: () => Promise<Response> }) =>
  ((url: string) => (String(url).includes('homeylocal') ? map.local() : map.cloud())) as unknown as typeof fetch;

test('addresses', () => {
  expect(localUrl('192.168.1.50')).toBe('https://192-168-1-50.homey.homeylocal.com');
  expect(cloudUrl(ID)).toBe(`https://${ID}.connect.athom.com`);
  expect(isIPv4('192.168.1.50')).toBe(true);
  expect(isIPv4('192.168.1.999')).toBe(false);
  expect(isIPv4('abc')).toBe(false);
  expect(candidatesFor({ homeyId: ID, localAddress: '192.168.1.50' })).toEqual([local, cloud]);
  expect(candidatesFor({ homeyId: null, localAddress: null })).toEqual([]);
  expect(candidatesFor({ homeyId: ID, localAddress: 'nope' })).toEqual([cloud]);
  expect(candidatesFor({ homeyId: null, localAddress: '192.168.1.50' })).toEqual([local]);
});
test('probe reads the Homey id and rejects another Homey', async () => {
  await expect(probe(local, ID, (() => ok({ 'X-Homey-ID': ID, 'X-Homey-Version': '13.5.5' })) as unknown as typeof fetch, 1000)).resolves.toEqual({ ok: true, homeyId: ID, softwareVersion: '13.5.5' });
  await expect(probe(local, ID, (() => ok({ 'X-Homey-ID': OTHER })) as unknown as typeof fetch, 1000)).resolves.toEqual({ ok: false, reason: 'wrong-homey' });
  await expect(probe(local, null, (() => ok({ 'X-Homey-ID': OTHER })) as unknown as typeof fetch, 1000)).resolves.toEqual({ ok: true, homeyId: OTHER, softwareVersion: null });
  await expect(probe(cloud, ID, (() => ok()) as unknown as typeof fetch, 1000)).resolves.toEqual({ ok: true, homeyId: null, softwareVersion: null });
  await expect(probe(cloud, ID, (() => Promise.resolve(new Response('', { status: 404 }))) as unknown as typeof fetch, 1000)).resolves.toEqual({ ok: false, reason: 'http' });
  await expect(probe(cloud, ID, (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch, 1000)).resolves.toEqual({ ok: false, reason: 'unreachable' });
});
test('a Homey id is exactly 24 hexadecimal characters', () => {
  expect(isHomeyId(ID)).toBe(true);
  expect(isHomeyId(ID.toUpperCase())).toBe(true);
  expect(isHomeyId(ID.slice(1))).toBe(false);
  expect(isHomeyId(`${ID}0`)).toBe(false);
  expect(isHomeyId('64a1b2c3d4e5f60718293a4g')).toBe(false);
  expect(isHomeyId('')).toBe(false);
  expect(isHomeyId('evil.example/x')).toBe(false);
  expect(isHomeyId(`${ID}.evil.example`)).toBe(false);
});
test('no address is built from invalid input', () => {
  expect(candidatesFor({ homeyId: 'evil.example/x', localAddress: '192.168.1.50' })).toEqual([local]);
  expect(candidatesFor({ homeyId: 'abc', localAddress: null })).toEqual([]);
  expect(() => cloudUrl('evil.example/x')).toThrow();
  expect(() => cloudUrl('abc')).toThrow();
  expect(() => localUrl('evil.example')).toThrow();
  expect(() => localUrl('192.168.1.999')).toThrow();
});
test('on the local route a missing id header is another Homey when an id is expected', async () => {
  const bare = (() => ok({ 'X-Homey-Version': '13.5.5' })) as unknown as typeof fetch;
  await expect(probe(local, ID, bare, 1000)).resolves.toEqual({ ok: false, reason: 'wrong-homey' });
  await expect(probe(local, null, bare, 1000)).resolves.toEqual({ ok: true, homeyId: null, softwareVersion: '13.5.5' });
});
test('an id header that is not a Homey id counts as no id', async () => {
  const evil = (() => ok({ 'X-Homey-ID': 'evil.example/x' })) as unknown as typeof fetch;
  await expect(probe(local, null, evil, 1000)).resolves.toEqual({ ok: true, homeyId: null, softwareVersion: null });
  await expect(probe(local, ID, evil, 1000)).resolves.toEqual({ ok: false, reason: 'wrong-homey' });
});
test('probe requests the ping endpoint without credentials', async () => {
  const fetchFn = vi.fn((_url: string, _init?: RequestInit) => ok());
  await probe(cloud, ID, fetchFn as unknown as typeof fetch, 1000);
  expect(fetchFn.mock.calls[0]?.[0]).toBe(`https://${ID}.connect.athom.com/api/manager/system/ping`);
  const init = fetchFn.mock.calls[0]?.[1];
  expect(init?.headers).toBeUndefined();
});
test('probe times out', async () => {
  vi.useFakeTimers();
  try {
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    const pending = probe(local, ID, fetchFn, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ ok: false, reason: 'timeout' });
  } finally {
    vi.useRealTimers();
  }
});
test('local wins when both answer', async () => {
  const chosen = await chooseRoute([local, cloud], ID, byRoute({ local: () => ok({ 'X-Homey-ID': ID }), cloud: () => ok() }));
  expect(chosen?.candidate.route).toBe('local');
});
test('cloud is used when local is silent for 1200 ms', async () => {
  vi.useFakeTimers();
  try {
    const pending = chooseRoute([local, cloud], ID, byRoute({ local: never, cloud: () => ok() }));
    await vi.advanceTimersByTimeAsync(LOCAL_TIMEOUT_MS);
    expect((await pending)?.candidate.route).toBe('cloud');
  } finally {
    vi.useRealTimers();
  }
});
test('a local address that now belongs to another Homey falls back to cloud', async () => {
  const chosen = await chooseRoute([local, cloud], ID, byRoute({ local: () => ok({ 'X-Homey-ID': OTHER }), cloud: () => ok() }));
  expect(chosen?.candidate.route).toBe('cloud');
});
test('nothing reachable gives null', async () => {
  const fail = () => Promise.reject(new TypeError('x'));
  expect(await chooseRoute([local, cloud], ID, byRoute({ local: fail, cloud: fail }))).toBeNull();
  expect(await chooseRoute([], ID, byRoute({ local: fail, cloud: fail }))).toBeNull();
});
test('cloud-only silence gives null after its timeout', async () => {
  vi.useFakeTimers();
  try {
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    const pending = chooseRoute([local, cloud], ID, fetchFn);
    await vi.advanceTimersByTimeAsync(CLOUD_TIMEOUT_MS);
    expect(await pending).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
test('the watcher reports local once and stops', async () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  let tick!: () => void; let online!: () => void; const cleared = vi.fn(); const found = vi.fn();
  const removed = vi.fn();
  let reachable = false;
  watchForLocal({ isLocalReachable: async () => reachable, onLocalAvailable: found, setInterval: (fn) => { tick = fn; return 1; }, clearInterval: cleared, addOnlineListener: (fn) => { online = fn; return removed; } });
  tick(); await settle(); expect(found).not.toHaveBeenCalled();
  reachable = true; online(); await settle();
  expect(found).toHaveBeenCalledTimes(1); expect(cleared).toHaveBeenCalledWith(1);
  expect(removed).toHaveBeenCalledTimes(1);
  tick(); await settle(); expect(found).toHaveBeenCalledTimes(1);
});
test('the watcher never runs two checks at once and can be stopped early', async () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  let tick!: () => void; const cleared = vi.fn(); const removed = vi.fn();
  let release!: (value: boolean) => void;
  const check = vi.fn(() => new Promise<boolean>((resolve) => { release = resolve; }));
  const stop = watchForLocal({ isLocalReachable: check, onLocalAvailable: vi.fn(), setInterval: (fn) => { tick = fn; return 7; }, clearInterval: cleared, addOnlineListener: () => removed });
  tick(); tick(); expect(check).toHaveBeenCalledTimes(1);
  release(false); await settle();
  tick(); expect(check).toHaveBeenCalledTimes(2);
  stop(); stop();
  expect(cleared).toHaveBeenCalledTimes(1); expect(removed).toHaveBeenCalledTimes(1);
});

test('a longer local limit lets a slow first answer win', async () => {
  vi.useFakeTimers();
  try {
    const slow = () => new Promise<Response>((resolve) => { setTimeout(() => resolve(new Response('true', { status: 200, headers: { 'X-Homey-ID': ID } })), 5000); });
    const patient = chooseRoute([local], null, byRoute({ local: slow, cloud: never }), { localTimeoutMs: FIRST_LOCAL_TIMEOUT_MS });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await patient).toMatchObject({ candidate: local, homeyId: ID });
    const hasty = chooseRoute([local], null, byRoute({ local: slow, cloud: never }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(await hasty).toBeNull();
    expect(FIRST_LOCAL_TIMEOUT_MS).toBe(30_000);
  } finally {
    vi.useRealTimers();
  }
});
