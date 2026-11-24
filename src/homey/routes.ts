import type { Route } from './types';

export const LOCAL_TIMEOUT_MS = 1200;
/** A first connection by IP address alone: long enough to answer the browser's question about the local network. */
export const FIRST_LOCAL_TIMEOUT_MS = 30_000;
export const CLOUD_TIMEOUT_MS = 5000;
export const LOCAL_RECHECK_MS = 30000;

export interface RouteCandidate { route: Route; baseUrl: string }
export type ProbeResult =
  | { ok: true; homeyId: string | null; softwareVersion: string | null }
  | { ok: false; reason: 'timeout' | 'unreachable' | 'http' | 'wrong-homey' };

export function isIPv4(text: string): boolean {
  const parts = text.split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** A Homey ID is exactly 24 hexadecimal characters; only such an ID may become part of a hostname. */
export function isHomeyId(text: string): boolean {
  return /^[0-9a-f]{24}$/i.test(text);
}

/** Throws on anything but an IPv4 address, so no caller can build a hostname from other input. */
export function localUrl(ip: string): string {
  if (!isIPv4(ip)) throw new Error('Not an IPv4 address');
  return `https://${ip.replaceAll('.', '-')}.homey.homeylocal.com`;
}

/** Throws on anything but a Homey ID, so no caller can build a hostname from other input. */
export function cloudUrl(homeyId: string): string {
  if (!isHomeyId(homeyId)) throw new Error('Not a Homey ID');
  return `https://${homeyId}.connect.athom.com`;
}

export function candidatesFor(settings: { homeyId: string | null; localAddress: string | null }): RouteCandidate[] {
  const candidates: RouteCandidate[] = [];
  if (settings.localAddress !== null && isIPv4(settings.localAddress)) {
    candidates.push({ route: 'local', baseUrl: localUrl(settings.localAddress) });
  }
  if (settings.homeyId !== null && isHomeyId(settings.homeyId)) {
    candidates.push({ route: 'cloud', baseUrl: cloudUrl(settings.homeyId) });
  }
  return candidates;
}

export async function probe(
  candidate: RouteCandidate,
  expectedHomeyId: string | null,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<ProbeResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, timeoutMs);
  });
  const request = (async (): Promise<ProbeResult> => {
    try {
      const response = await fetchFn(`${candidate.baseUrl}/api/manager/system/ping`, { signal: controller.signal });
      if (!response.ok) return { ok: false, reason: 'http' };
      // A header that is not a Homey ID counts as no ID: it must never become a hostname.
      const header = response.headers.get('X-Homey-ID');
      const homeyId = header !== null && isHomeyId(header) ? header : null;
      if (expectedHomeyId !== null) {
        // Every local connection proves which Homey answers; the cloud route never exposes the header.
        if (homeyId === null && candidate.route === 'local') return { ok: false, reason: 'wrong-homey' };
        if (homeyId !== null && homeyId.toLowerCase() !== expectedHomeyId.toLowerCase()) return { ok: false, reason: 'wrong-homey' };
      }
      return { ok: true, homeyId, softwareVersion: response.headers.get('X-Homey-Version') };
    } catch {
      return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'unreachable' };
    }
  })();
  try {
    const result = await Promise.race([request, timedOut]);
    return result === 'timeout' ? { ok: false, reason: 'timeout' } : result;
  } finally {
    clearTimeout(timer);
  }
}

export async function chooseRoute(
  candidates: RouteCandidate[],
  expectedHomeyId: string | null,
  fetchFn: typeof fetch,
  options: { localTimeoutMs?: number } = {},
): Promise<{ candidate: RouteCandidate; homeyId: string | null; softwareVersion: string | null } | null> {
  const localTimeoutMs = options.localTimeoutMs ?? LOCAL_TIMEOUT_MS;
  const started = candidates.map((candidate) => ({
    candidate,
    result: probe(candidate, expectedHomeyId, fetchFn, candidate.route === 'local' ? localTimeoutMs : CLOUD_TIMEOUT_MS),
  }));
  for (const route of ['local', 'cloud'] as const) {
    const entry = started.find((s) => s.candidate.route === route);
    if (!entry) continue;
    const result = await entry.result;
    if (result.ok) return { candidate: entry.candidate, homeyId: result.homeyId, softwareVersion: result.softwareVersion };
  }
  return null;
}

export function watchForLocal(options: {
  isLocalReachable(): Promise<boolean>;
  onLocalAvailable(): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  addOnlineListener(fn: () => void): () => void;
}): () => void {
  let finished = false;
  let checking = false;
  let handle: unknown;
  let removeOnline: () => void = () => {};

  const stop = (): void => {
    if (finished) return;
    finished = true;
    options.clearInterval(handle);
    removeOnline();
  };

  const check = async (): Promise<void> => {
    if (finished || checking) return;
    checking = true;
    let reachable = false;
    try {
      reachable = await options.isLocalReachable();
    } catch {
      reachable = false;
    } finally {
      checking = false;
    }
    if (reachable && !finished) {
      stop();
      options.onLocalAvailable();
    }
  };

  handle = options.setInterval(() => void check(), LOCAL_RECHECK_MS);
  removeOnline = options.addOnlineListener(() => void check());
  return stop;
}
