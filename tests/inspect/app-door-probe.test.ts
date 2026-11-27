import { expect, test } from 'vitest';
import { probeAppDoor, type DoorFetch } from '../../src/inspect/app-door-probe';

// How the door of the app answers from a page elsewhere, without a key: whether it is there, and how much the cloud of Athom
// carries to it and back. Nothing of which hub or where.

const ID = '5f2a00000000000000000c81';
const IP = '192.168.1.23';
type Seen = { url: string; init: RequestInit };

function fakeFetch(answer: (body: Record<string, unknown>, url: string) => { status: number; body: string } | Error): { fetch: DoorFetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const fetch: DoorFetch = async (url, init) => {
    seen.push({ url, init });
    const result = answer(JSON.parse(init.body as string) as Record<string, unknown>, url);
    if (result instanceof Error) throw result;
    return { status: result.status, text: async () => result.body };
  };
  return { fetch, seen };
}

const door = (body: Record<string, unknown>) => ({ status: 200, body: JSON.stringify(body['call'] === 'measure' ? { size: (body['fill'] as string).length } : { error: 'not-paired' }) });

test('it asks the door on both routes, as JSON and without a key: first whether it is there, then ever larger', async () => {
  const { fetch, seen } = fakeFetch(door);
  await probeAppDoor({ homeyId: ID, localAddress: IP }, fetch, () => 0);
  const cloud = seen.filter((s) => s.url.startsWith(`https://${ID}.connect.athom.com/`));
  expect(cloud.map((s) => s.url)).toEqual(Array(5).fill(`https://${ID}.connect.athom.com/api/app/app.expressive.home/sync`));
  expect(cloud.map((s) => (JSON.parse(s.init.body as string) as { call: string; fill?: string }).fill?.length ?? 'session')).toEqual(['session', 1024, 1024 ** 2, 2 * 1024 ** 2, 4 * 1024 ** 2]);
  for (const { init } of seen) {
    expect([init.method, (init.headers as Record<string, string>)['Content-Type'], init.credentials]).toEqual(['POST', 'application/json', 'omit']);
    expect(JSON.parse(init.body as string)).not.toHaveProperty('token');
  }
  expect(seen.filter((s) => s.url.startsWith('https://192-168-1-23.homey.homeylocal.com/'))).toHaveLength(5);
});

test('it tells the door, each size that came through whole, and where it stopped; never the address or the id', async () => {
  let t = 0;
  const { fetch } = fakeFetch((body, url) => {
    t += 100;
    const size = (body['fill'] as string | undefined)?.length ?? 0;
    if (url.includes('homeylocal')) return new TypeError('Failed to fetch');
    if (size > 2 * 1024 ** 2) return { status: 413, body: '<html>too large</html>' };
    if (size > 1024 ** 2) return { status: 200, body: JSON.stringify({ size: size - 10 }) };
    return door(body);
  });
  const text = await probeAppDoor({ homeyId: ID, localAddress: IP }, fetch, () => t);
  expect(text).toContain('deur van het appje, cloud: er, zegt not-paired, in 100 ms');
  expect(text).toContain('deur van het appje, cloud, 1 KiB: heel aangekomen in 100 ms');
  expect(text).toContain('deur van het appje, cloud, 1 MiB: heel aangekomen');
  expect(text).toContain('deur van het appje, cloud, 2 MiB: niet heel aangekomen');
  expect(text).toContain('deur van het appje, cloud, 4 MiB: 413, geen JSON');
  expect(text).toContain('deur van het appje, lokaal: geweigerd door de browser of het netwerk (CORS of geen verbinding)');
  for (const secret of [ID, IP, '192-168-1-23', 'connect.athom.com', 'homeylocal']) expect(text).not.toContain(secret);
});

test('without a Homey-ID or an address there is nothing to ask on that route', async () => {
  const { fetch, seen } = fakeFetch(door);
  const text = await probeAppDoor({ homeyId: null, localAddress: null }, fetch, () => 0);
  expect(seen).toEqual([]);
  expect(text).toContain('deur van het appje, cloud: geen Homey-ID bekend');
  expect(text).toContain('deur van het appje, lokaal: geen IP-adres bekend');
});
