// Measures the door of the app for a device away from home, from a page on another address, as a page on the internet asks:
// whether it is there (a session without a pairing must be refused), and how much of a request the cloud of Athom and the hub
// carry whole (1 KiB to 4 MiB, the largest layout the door takes). What is told: status, time and whether what arrived was
// whole; never which hub, its address or what else it answered. Only for measuring, on the inspection page.
import { cloudUrl, isHomeyId, isIPv4, localUrl } from '../homey/routes';

export type DoorFetch = (url: string, init: RequestInit) => Promise<{ status: number; text(): Promise<string> }>;

const PATH = '/api/app/app.expressive.home/sync';
/** Long enough for 4 MiB over mobile internet. */
const ANSWER_MS = 60_000;
const SIZES: [string, number][] = [['1 KiB', 1024], ['1 MiB', 1024 ** 2], ['2 MiB', 2 * 1024 ** 2], ['4 MiB', 4 * 1024 ** 2]];

const WORD = /^[a-z-]{1,40}$/;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,30}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Any answer that is not the one expected: only whether it was JSON, and the names of its fields. */
function otherAnswer(text: string): string {
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) return 'JSON zonder velden';
    return `JSON met velden ${Object.keys(value).filter((name) => NAME.test(name)).slice(0, 10).join(' ') || '-'}`;
  } catch {
    return 'geen JSON';
  }
}

async function ask(fetch: DoorFetch, base: string, body: Record<string, unknown>, now: () => number): Promise<{ ms: number; status: number; answer: unknown; text: string } | string> {
  const start = now();
  try {
    const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ANSWER_MS) : undefined;
    const response = await fetch(`${base}${PATH}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', ...(signal ? { signal } : {}),
    });
    const ms = Math.round(now() - start);
    const text = await response.text();
    let answer: unknown = null;
    try { answer = JSON.parse(text); } catch { /* told below */ }
    return { ms, status: response.status, answer, text };
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) return `geen antwoord binnen ${ANSWER_MS / 1000} s`;
    return 'geweigerd door de browser of het netwerk (CORS of geen verbinding)';
  }
}

async function route(fetch: DoorFetch, name: string, base: string, now: () => number): Promise<string[]> {
  const there = await ask(fetch, base, { call: 'session' }, now);
  if (typeof there === 'string') return [`deur van het appje, ${name}: ${there}`];
  const said = isRecord(there.answer) && typeof there.answer['error'] === 'string' && WORD.test(there.answer['error']) ? there.answer['error'] : null;
  if (there.status !== 200 || said === null) return [`deur van het appje, ${name}: ${there.status}, ${otherAnswer(there.text)}`];
  const lines = [`deur van het appje, ${name}: er, zegt ${said}, in ${there.ms} ms`];
  for (const [label, length] of SIZES) {
    const done = await ask(fetch, base, { call: 'measure', fill: 'x'.repeat(length) }, now);
    if (typeof done === 'string') { lines.push(`deur van het appje, ${name}, ${label}: ${done}`); break; }
    const whole = done.status === 200 && isRecord(done.answer) && done.answer['size'] === length;
    if (whole) lines.push(`deur van het appje, ${name}, ${label}: heel aangekomen in ${done.ms} ms`);
    else if (done.status === 200 && isRecord(done.answer) && typeof done.answer['size'] === 'number') lines.push(`deur van het appje, ${name}, ${label}: niet heel aangekomen`);
    else lines.push(`deur van het appje, ${name}, ${label}: ${done.status}, ${otherAnswer(done.text)}`);
  }
  return lines;
}

/** Asks the door on the cloud route and the local route, one after the other. */
export async function probeAppDoor(connection: { homeyId: string | null; localAddress: string | null }, fetch: DoorFetch, now: () => number): Promise<string> {
  const lines: string[] = [];
  if (connection.homeyId !== null && isHomeyId(connection.homeyId)) lines.push(...await route(fetch, 'cloud', cloudUrl(connection.homeyId), now));
  else lines.push('deur van het appje, cloud: geen Homey-ID bekend');
  if (connection.localAddress !== null && isIPv4(connection.localAddress)) lines.push(...await route(fetch, 'lokaal', localUrl(connection.localAddress), now));
  else lines.push('deur van het appje, lokaal: geen IP-adres bekend');
  return lines.join('\n');
}
