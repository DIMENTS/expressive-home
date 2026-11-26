// The messages of Homey's own widget pages (the form of Athom's library "crossframe"): a fixed word and then the JSON in
// four hex digits per character. Homey does not describe this form; it is followed here so a widget of an app can work.

const PREFIX = 'CF2_MESSAGE';

export type CrossframeMessage =
  | { type: 'tx'; event: string; data: unknown; callbackId: number | null }
  | { type: 'cb'; args: unknown[]; callbackId: number };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Two hex digits for every byte. */
const HEX = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

export function encodeCrossframe(message: CrossframeMessage): string {
  const json = JSON.stringify(message);
  const parts = new Array<string>(json.length);
  for (let i = 0; i < json.length; i += 1) {
    const code = json.charCodeAt(i);
    parts[i] = HEX[code >> 8]! + HEX[code & 0xff]!;
  }
  return `${PREFIX}${parts.join('')}`;
}

/** A message of a widget page, or null when it is none. */
export function decodeCrossframe(raw: unknown): CrossframeMessage | null {
  if (typeof raw !== 'string' || !raw.startsWith(PREFIX)) return null;
  const hex = raw.slice(PREFIX.length);
  if (hex.length % 4 !== 0 || !/^[0-9a-f]*$/i.test(hex) || hex.length > 4 * 512 * 1024) return null;
  let json = '';
  for (let i = 0; i < hex.length; i += 4) json += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  try {
    const value: unknown = JSON.parse(json);
    if (!isRecord(value)) return null;
    if (value['type'] === 'tx' && typeof value['event'] === 'string') return { type: 'tx', event: value['event'], data: value['data'], callbackId: typeof value['callbackId'] === 'number' ? value['callbackId'] : null };
    if (value['type'] === 'cb' && typeof value['callbackId'] === 'number') return { type: 'cb', args: Array.isArray(value['args']) ? value['args'] : [], callbackId: value['callbackId'] };
    return null;
  } catch {
    return null;
  }
}

export interface BridgeDeps {
  /** A message to the frame, as text. */
  post(text: string): void;
  /** What Homey's own script asks for when it starts. */
  initial(): Record<string, unknown>;
  /** A request to the widget's own back end, through the app on the hub; null when the route is refused. */
  api(method: string, path: string, body: unknown): Promise<{ status: number; body: unknown } | null>;
  onReady(): void;
  onHeight(px: number): void;
  /** The names of the news the widget listens to now, whenever they change. */
  onListen?(names: string[]): void;
}

/** What a widget may listen to: plain names, and not too many. */
export const LIVE_LIMITS = { listeners: 50, name: /^[A-Za-z0-9_.:-]{1,64}$/, widgets: 20 } as const;

const error = (text: string): { type: 'Error'; data: string } => ({ type: 'Error', data: text });

/** The dashboard's answers to a widget page of an app. */
export function createAppWidgetBridge(deps: BridgeDeps) {
  const answer = (callbackId: number | null, args: unknown[]): void => {
    if (callbackId !== null) deps.post(encodeCrossframe({ type: 'cb', args, callbackId }));
  };
  /**
   * The numbers of the messages a widget listens with, per name of news. Athom's message library keeps the answer
   * function of a message, so every piece of news is an answer to that same number again.
   */
  const listeners = new Map<string, Set<number>>();
  let count = 0;
  /** A widget page that loads anew in the same frame counts its messages from one again: what came before is over. */
  let documentTurn = 0;
  const names = (): string[] => [...listeners.keys()];
  const listened = (): void => deps.onListen?.(names());

  function listen(name: unknown, callbackId: number | null): void {
    if (callbackId === null || typeof name !== 'string' || !LIVE_LIMITS.name.test(name) || count >= LIVE_LIMITS.listeners) return;
    const ids = listeners.get(name) ?? new Set<number>();
    if (ids.has(callbackId)) return;
    ids.add(callbackId);
    count += 1;
    listeners.set(name, ids);
    listened();
  }

  /** By its name all listeners of that name go; by its number that one only. */
  function unlisten(which: unknown): void {
    if (typeof which === 'string') {
      const ids = listeners.get(which);
      if (!ids) return;
      count -= ids.size;
      listeners.delete(which);
    } else if (typeof which === 'number') {
      const found = [...listeners].find(([, ids]) => ids.has(which));
      if (!found) return;
      found[1].delete(which);
      count -= 1;
      if (found[1].size === 0) listeners.delete(found[0]);
    } else {
      return;
    }
    listened();
  }

  async function handle(event: string, data: unknown): Promise<unknown[]> {
    switch (event) {
      case 'getInitialData': {
        documentTurn += 1;
        if (count > 0) {
          listeners.clear();
          count = 0;
          listened();
        }
        return [null, deps.initial()];
      }
      case 'ready': {
        // Homey's script sends the height a widget asks for with ready
        if (isRecord(data) && typeof data['height'] === 'number' && Number.isFinite(data['height'])) deps.onHeight(data['height']);
        deps.onReady();
        return [null];
      }
      case 'setHeight': {
        const px = typeof data === 'number' ? data : isRecord(data) && typeof data['height'] === 'number' ? data['height'] : null;
        if (px !== null && Number.isFinite(px)) deps.onHeight(px);
        return [null];
      }
      case 'api': {
        if (!isRecord(data) || typeof data['method'] !== 'string' || typeof data['path'] !== 'string') return [error('bad request')];
        const result = await deps.api(data['method'].toUpperCase(), data['path'], data['body'] ?? null).catch(() => null);
        if (!result) return [error('not allowed')];
        return result.status < 300 ? [null, result.body] : [error(`status ${result.status}`)];
      }
      case 'unregisterRealtimeListener': unlisten(data); return [null];
      default: return [error('not supported')];
    }
  }

  return {
    async receive(raw: unknown): Promise<void> {
      const message = decodeCrossframe(raw);
      if (message?.type !== 'tx') return;
      // answered only when there is news
      if (message.event === 'registerRealtimeListener') { listen(message.data, message.callbackId); return; }
      const turn = documentTurn;
      const args = await handle(message.event, message.data);
      if (turn === documentTurn || message.event === 'getInitialData') answer(message.callbackId, args);
    },
    /** A piece of news of the widget's app, to everything that listens to its name. */
    deliver(name: string, data: unknown): void {
      for (const callbackId of listeners.get(name) ?? []) answer(callbackId, [data]);
    },
    names,
  };
}
