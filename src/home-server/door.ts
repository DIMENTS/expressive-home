// The door of the app on the hub for a device away from home: one open question of the app's own web API, reached through
// the cloud of Athom without a key. It answers only the questions it knows, only to a device paired from outside with a code
// for away, and only with the shared documents: never controlling, flows, history or anything of the hub itself. It never
// throws (the hub would pass the text of an error on) and never logs what it is asked.
import { DOOR_CALLS, DOOR_LIMITS, SHARED_FORMAT, type DoorCall, type DoorError } from '../sync/protocol';
import type { Documents, Refusal } from './documents';
import type { PairedDevice, Pairing } from './pairing';

/**
 * How many questions a minute, each in a bucket of its own so one cannot use up another: of all without a valid pairing
 * together, of pairing, of measuring, of one paired device, and of the changes of one paired device (one every two seconds).
 */
export const DOOR_RATE = { unpaired: 30, pair: 20, measure: 10, paired: 120, changes: 30 } as const;
const MINUTE_MS = 60_000;
const MAX_TOKEN = 100;
const MAX_NAME = 200;

export interface DoorDeps {
  pairing: Pairing;
  documents: Documents;
  now(): number;
  /** Tells one start of the app from the next: a page that sees it change asks everything anew. */
  boot: string;
}

type Answer = Record<string, unknown>;
const no = (error: DoorError): Answer => ({ error });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCall = (value: unknown): value is DoorCall => typeof value === 'string' && (DOOR_CALLS as readonly string[]).includes(value);
const text = (value: unknown, max: number): string => (typeof value === 'string' && value.length <= max ? value : '');

/** The size of what arrived, as JSON in bytes, as at home; anything that is not JSON counts as too much. */
function size(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value) ?? '').length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function createDoor(deps: DoorDeps) {
  /** Questions in the minute that runs now, per bucket. */
  let minute = -1;
  const counts = new Map<string, number>();

  /** Whether one more question fits in its bucket this minute. */
  function allowed(bucket: string, limit: number): boolean {
    const now = Math.floor(deps.now() / MINUTE_MS);
    if (now !== minute) {
      minute = now;
      counts.clear();
    }
    const used = counts.get(bucket) ?? 0;
    if (used >= limit) return false;
    counts.set(bucket, used + 1);
    return true;
  }

  const refusal = (done: Refusal): Answer => no(done.error);

  function paired(call: DoorCall, device: PairedDevice, body: Record<string, unknown>): Answer {
    const changes = call === 'put-layouts' || call === 'looks-ops' || call === 'widgets-ops';
    if (changes && !allowed(`changes:${device.id}`, DOOR_RATE.changes)) return no('busy');
    if (changes && body['format'] !== SHARED_FORMAT) return no('format');
    switch (call) {
      case 'session':
        return { device: { name: device.name, role: device.role }, format: SHARED_FORMAT, boot: deps.boot, revisions: deps.documents.revisions() };
      case 'layouts': return { ...deps.documents.layouts() };
      case 'looks': return { ...deps.documents.looks() };
      case 'widgets': return { ...deps.documents.widgets() };
      case 'put-layouts': {
        if (size(body) > DOOR_LIMITS.layouts) return no('too-big');
        const done = deps.documents.putLayouts(device.role, body);
        if ('error' in done) return refusal(done);
        return done.ok ? { ok: true, doc: done.doc } : { error: 'conflict', doc: done.doc };
      }
      case 'looks-ops': {
        if (size(body) > DOOR_LIMITS.looks) return no('too-big');
        const done = deps.documents.looksOps(device.role, body['ops']);
        return 'error' in done ? refusal(done) : { doc: done.doc };
      }
      // own widgets are code that runs on every tablet at home: from outside they are only seen
      case 'widgets-ops': return no('role');
      case 'unpair':
        deps.pairing.remove(device.id);
        return {};
      default: return no('bad');
    }
  }

  function answer(request: unknown): Answer {
    if (!isRecord(request) || !isCall(request['call'])) return allowed('unpaired', DOOR_RATE.unpaired) ? no('bad') : no('busy');
    const call = request['call'];
    if (call === 'pair' || call === 'measure') {
      if (!allowed(call, DOOR_RATE[call])) return no('busy');
      if (call === 'measure') return { size: typeof request['fill'] === 'string' && request['fill'].length <= DOOR_LIMITS.measure ? request['fill'].length : 0 };
      if (size(request) > DOOR_LIMITS.small) return no('too-big');
      const result = deps.pairing.redeemAway(text(request['code'], 20), text(request['name'], MAX_NAME));
      return result.ok ? { token: result.token, device: { name: result.device.name, role: result.device.role } } : no(result.reason);
    }
    const device = deps.pairing.findAway(text(request['token'], MAX_TOKEN));
    if (!device) return allowed('unpaired', DOOR_RATE.unpaired) ? no('not-paired') : no('busy');
    if (!allowed(`device:${device.id}`, DOOR_RATE.paired)) return no('busy');
    return paired(call, device, request);
  }

  return {
    /** The answer to one question; never throws. */
    handle(request: unknown): Answer {
      try {
        return answer(request);
      } catch {
        return no('bad');
      }
    },
  };
}

export type Door = ReturnType<typeof createDoor>;
