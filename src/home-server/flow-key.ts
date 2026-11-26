import { can, FEATURE_SCOPES } from '../homey/permissions';
import type { Flow } from '../homey/types';

/** What is known of the key; `wide`: it works, and may do more than starting flows; `refused`: the hub no longer takes it. */
export type FlowKeyState = 'none' | 'works' | 'wide' | 'refused';
/** What became of a key that somebody gave; only `works` and `wide` are kept. */
export type FlowKeyResult = 'works' | 'wide' | 'not-a-key' | 'refused' | 'no-right' | 'unreachable';

interface Kept { key: string; wide: boolean; refused: boolean }

export interface FlowKeyDeps {
  load(): unknown;
  save(value: Kept | null): void;
  /** Asks the hub something with the key; throws when there is no answer. */
  request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, key: string, body?: unknown): Promise<{ status: number; body: unknown }>;
}

/** What can be in the header of a request; no key of Homey is shorter. */
const KEY = /^[\x21-\x7e]{20,1000}$/;
/** A flow that no hub has: whether it may be started can be asked without starting anything. */
export const NO_FLOW = '00000000-0000-4000-8000-000000000000';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function keptFrom(value: unknown): Kept | null {
  return isRecord(value) && typeof value['key'] === 'string' && KEY.test(value['key']) ? { key: value['key'], wide: value['wide'] === true, refused: value['refused'] === true } : null;
}

/** What a key may do, or null when the hub does not tell. */
function scopesFrom(body: unknown): string[] | null {
  if (!isRecord(body)) return null;
  const scopes = body['intersectedScopes'] ?? body['scopes'];
  return Array.isArray(scopes) ? scopes.filter((scope) => typeof scope === 'string') : null;
}

/**
 * The key with which the app on the hub starts flows: Homey does not let an app do that itself, also not with
 * the right homey:manager:api. The key stays on the hub and only ever goes to the hub itself.
 */
export function createFlowKey(deps: FlowKeyDeps) {
  let kept: Kept | null = null;
  let turn = 0;
  const listeners = new Set<() => void>();
  try {
    kept = keptFrom(deps.load());
  } catch {
    // nothing was kept
  }

  function change(next: Kept | null): void {
    deps.save(next);
    kept = next;
    tell();
  }
  const tell = (): void => { for (const listener of [...listeners]) listener(); };

  const trigger = (kind: Flow['kind'], id: string): string => `/api/manager/flow/${kind === 'advanced' ? 'advancedflow' : 'flow'}/${encodeURIComponent(id)}/trigger`;

  /** What the hub says of a key now. */
  async function check(key: string): Promise<Exclude<FlowKeyResult, 'not-a-key'>> {
    const session = await deps.request('GET', '/api/manager/sessions/session/me', key).catch(() => null);
    if (session?.status === 401) return 'refused';
    const scopes = session && session.status < 300 ? scopesFrom(session.body) : null;
    if (scopes) return !can(scopes, FEATURE_SCOPES.startFlows) ? 'no-right' : scopes.every((scope) => scope === FEATURE_SCOPES.startFlows) ? 'works' : 'wide';
    if (!session || (session.status >= 300 && session.status !== 403)) return 'unreachable';
    // a hub that knows the key but does not tell what it may
    const proof = await deps.request('POST', trigger('flow', NO_FLOW), key).catch(() => null);
    return proof?.status === 404 ? 'works' : proof?.status === 401 ? 'refused' : proof?.status === 403 ? 'no-right' : 'unreachable';
  }

  return {
    state: (): FlowKeyState => (!kept ? 'none' : kept.refused ? 'refused' : kept.wide ? 'wide' : 'works'),
    /** Whether a flow can be started with it, as far as is known. */
    usable: (): boolean => kept !== null && !kept.refused,
    /** Checks a key at the hub and keeps it when it may start flows; otherwise the one there was stays. */
    async set(input: unknown): Promise<FlowKeyResult> {
      const key = typeof input === 'string' ? input.trim() : '';
      if (!KEY.test(key)) return 'not-a-key';
      const mine = ++turn;
      const result = await check(key);
      if (mine !== turn) return 'unreachable';
      if (result === 'works' || result === 'wide') change({ key, wide: result === 'wide', refused: false });
      return result;
    },
    remove(): void {
      turn += 1;
      change(null);
    },
    /** Starts a flow; throws when it did not start. */
    async start(flow: Pick<Flow, 'id' | 'kind'>): Promise<void> {
      const used = kept;
      if (!used || used.refused) throw new Error('There is no key for flows');
      const answer = await deps.request('POST', trigger(flow.kind, flow.id), used.key).catch(() => null);
      if (answer === null) throw new Error('The hub did not answer');
      if (answer.status >= 200 && answer.status < 300) return;
      if (answer.status === 401 || answer.status === 403) {
        // only when the key itself is the reason, the flows go off
        const now = await check(used.key);
        if ((now === 'refused' || now === 'no-right') && kept === used) change({ ...used, refused: true });
      }
      throw new Error(`The hub answered ${answer.status}`);
    },
    /**
     * A request to the hub itself with a key that may do more than start flows (widgets of apps need one that may
     * do everything); null when there is no such key. The key never leaves the hub.
     */
    async wideRequest(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<{ status: number; body: unknown } | null> {
      const used = kept;
      if (!used || used.refused || !used.wide) return null;
      return deps.request(method, path, used.key, body);
    },
    /**
     * Something made with the key that may do everything (a live connection with the hub itself), made here so the key
     * does not go anywhere else; null when there is no such key.
     */
    wideSession<T>(make: (key: string) => T): T | null {
      const used = kept;
      return used && !used.refused && used.wide ? make(used.key) : null;
    },
    /** Hears when the state may have changed. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type FlowKey = ReturnType<typeof createFlowKey>;
