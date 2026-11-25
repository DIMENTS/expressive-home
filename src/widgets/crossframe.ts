// The messages of Homey's own widget pages (the form of Athom's library "crossframe"): a fixed word and then the JSON in
// four hex digits per character. Homey does not describe this form; it is followed here so a widget of an app can work.

const PREFIX = 'CF2_MESSAGE';

export type CrossframeMessage =
  | { type: 'tx'; event: string; data: unknown; callbackId: number | null }
  | { type: 'cb'; args: unknown[]; callbackId: number };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function encodeCrossframe(message: CrossframeMessage): string {
  const json = JSON.stringify(message);
  let hex = '';
  for (let i = 0; i < json.length; i += 1) hex += json.charCodeAt(i).toString(16).padStart(4, '0');
  return `${PREFIX}${hex}`;
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
}

const error = (text: string): { type: 'Error'; data: string } => ({ type: 'Error', data: text });

/** The dashboard's answers to a widget page of an app. */
export function createAppWidgetBridge(deps: BridgeDeps) {
  const answer = (callbackId: number | null, args: unknown[]): void => {
    if (callbackId !== null) deps.post(encodeCrossframe({ type: 'cb', args, callbackId }));
  };

  async function handle(event: string, data: unknown): Promise<unknown[]> {
    switch (event) {
      case 'getInitialData': return [null, deps.initial()];
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
      // live news would need a connection of its own with the key; not in this trial
      case 'registerRealtimeListener': case 'unregisterRealtimeListener': return [null];
      default: return [error('not supported')];
    }
  }

  return {
    async receive(raw: unknown): Promise<void> {
      const message = decodeCrossframe(raw);
      if (message?.type !== 'tx') return;
      answer(message.callbackId, await handle(message.event, message.data));
    },
  };
}
