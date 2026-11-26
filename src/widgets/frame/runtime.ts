// The program inside the sandboxed frame of an own widget. It is the only script of widget-frame.html and is
// allowed there by its hash, so it imports nothing: the build puts this file's code into the page as it is.
// Nothing here is trusted by the dashboard: it shares its world with the widget, and every check is the dashboard's.

/** A message of the dashboard to the frame. */
interface Incoming { eh?: unknown; type?: unknown; [key: string]: unknown }

type Listener = (value: unknown) => void;

/**
 * Starts the frame: only inside a sandboxed frame (an opaque origin with a parent), and only for messages from that
 * parent at the dashboard's own address. Returns false when it does not start.
 */
export function startFrame(win: Window & typeof globalThis): boolean {
  const doc = win.document;
  // a page opened by itself, or framed without the sandbox, runs nothing
  if (win.parent === win || win.origin !== 'null') return false;
  const home = new URL(win.location.href).origin;
  // taken once, before the widget runs: a widget can put something else in its place
  const parent = win.parent;
  const post = (message: Record<string, unknown>): void => { parent.postMessage({ eh: 'widget', ...message }, home); };

  // a way out that the policy of the page does not close; a frame inside the frame can still bring it back
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel']) {
    try { delete (win as unknown as Record<string, unknown>)[name]; } catch { /* not there */ }
  }
  // the kiosk app of a wall tablet gives every frame its object: a widget gets none of it; where it cannot be deleted it is emptied
  for (const name of ['fully', 'FullyKiosk']) {
    const own = win as unknown as Record<string, unknown>;
    try { delete own[name]; } catch { /* cannot be deleted */ }
    try { if (own[name] !== undefined) own[name] = undefined; } catch { /* cannot be written */ }
  }

  let started = false;
  let settings: Record<string, unknown> = {};
  let devices: Record<string, unknown> = {};
  let texts: Record<string, string> = {};
  let theme: Record<string, unknown> = {};
  let instance = '';
  let language = 'en';
  let calls = 0;
  const waiting = new Map<number, (value: unknown) => void>();
  const listeners = new Map<string, Set<Listener>>();
  const emit = (event: string, value: unknown): void => {
    for (const listener of [...(listeners.get(event) ?? [])]) {
      try { listener(value); } catch (error) { post({ type: 'error', message: String(error) }); }
    }
  };
  const call = (method: string, args: unknown[]): Promise<unknown> => new Promise((done) => {
    calls += 1;
    waiting.set(calls, done);
    post({ type: 'call', id: calls, method, args });
  });

  /** Puts the values of the dashboard's theme on the page, so var(--c-primary) and the like work as on the dashboard. */
  function applyTheme(next: unknown): void {
    if (typeof next !== 'object' || next === null) return;
    theme = next as Record<string, unknown>;
    const root = doc.documentElement;
    const tokens = theme['tokens'];
    if (typeof tokens === 'object' && tokens !== null) {
      for (const [name, value] of Object.entries(tokens as Record<string, unknown>)) {
        if (/^--[a-z0-9-]+$/.test(name) && typeof value === 'string') root.style.setProperty(name, value);
      }
    }
    const mode = theme['mode'] === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-mode', mode);
    root.setAttribute('data-density', typeof theme['density'] === 'string' ? theme['density'] : 'comfortable');
  }

  const Homey = Object.freeze({
    language: (): string => language,
    ready(options?: { height?: unknown }): void {
      if (options && typeof options.height === 'number') post({ type: 'height', px: options.height });
      post({ type: 'ready' });
    },
    setHeight(px: unknown): void { if (typeof px === 'number') post({ type: 'height', px }); },
    getSettings: (): Record<string, unknown> => ({ ...settings }),
    getWidgetInstanceId: (): string => instance,
    getDeviceIds: (): string[] => Object.keys(devices),
    __: (key: string): string => (Object.hasOwn(texts, key) ? texts[key]! : key),
    theme: (): Record<string, unknown> => ({ ...theme }),
    on(event: string, listener: Listener): void {
      if (typeof listener !== 'function') return;
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    devices: Object.freeze({
      get: (id: string): unknown => (Object.hasOwn(devices, id) ? devices[id] : null),
      setCapabilityValue: (id: string, capabilityId: string, value: unknown): Promise<unknown> => call('setCapabilityValue', [id, capabilityId, value]),
    }),
    flows: Object.freeze({ start: (id: string): Promise<unknown> => call('startFlow', [id]) }),
    openDevice: (id: string): Promise<unknown> => call('openDevice', [id]),
  });

  function load(message: Incoming): void {
    if (started) return;
    started = true;
    const widget = (message['widget'] ?? {}) as Record<string, unknown>;
    settings = (message['settings'] ?? {}) as Record<string, unknown>;
    devices = (message['devices'] ?? {}) as Record<string, unknown>;
    instance = typeof message['instance'] === 'string' ? message['instance'] : '';
    language = message['language'] === 'nl' ? 'nl' : 'en';
    const allTexts = (widget['texts'] ?? {}) as Record<string, Record<string, string>>;
    texts = allTexts[language] ?? allTexts['en'] ?? {};
    applyTheme(message['theme']);
    const font = message['font'];
    if (font instanceof ArrayBuffer && typeof win.FontFace === 'function') {
      try {
        const face = new win.FontFace('Google Sans Flex Variable', font, { weight: '1 1000' });
        doc.fonts.add(face);
        void face.load().catch(() => {});
      } catch { /* the widget falls back to the system font */ }
    }
    const style = doc.createElement('style');
    style.textContent = typeof widget['css'] === 'string' ? widget['css'] : '';
    doc.head.append(style);
    // markup only: scripts in it never run, and the policy of the page blocks handlers in attributes
    const parsed = new win.DOMParser().parseFromString(typeof widget['html'] === 'string' ? widget['html'] : '', 'text/html');
    doc.body.replaceChildren(...[...parsed.body.childNodes].map((node) => doc.adoptNode(node)));
    try {
      const run = new win.Function('Homey', `${typeof widget['js'] === 'string' ? widget['js'] : ''}\n;if (typeof onHomeyReady === 'function') onHomeyReady(Homey);`);
      run(Homey);
    } catch (error) {
      post({ type: 'error', message: String(error) });
    }
  }

  win.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== parent || event.origin !== home) return;
    const message = event.data as Incoming;
    if (typeof message !== 'object' || message === null || message.eh !== 'widget') return;
    switch (message.type) {
      case 'load': load(message); break;
      case 'ping': post({ type: 'pong', n: message['n'] }); break;
      case 'theme': applyTheme(message['theme']); emit('theme', Homey.theme()); break;
      case 'device': {
        const device = message['device'] as { id?: unknown } | null;
        if (device && typeof device.id === 'string' && Object.hasOwn(devices, device.id)) {
          devices = { ...devices, [device.id]: device };
          emit('device', device);
        }
        break;
      }
      case 'settings': settings = (message['settings'] ?? {}) as Record<string, unknown>; emit('settings.set', { ...settings }); break;
      case 'answer': {
        const done = typeof message['id'] === 'number' ? waiting.get(message['id']) : undefined;
        if (done) { waiting.delete(message['id'] as number); done(message['result']); }
        break;
      }
      default: break;
    }
  });

  // Escape always gives the focus back to the dashboard, before the widget can take it
  win.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') post({ type: 'leave' });
  }, true);
  win.addEventListener('error', (event: ErrorEvent) => { post({ type: 'error', message: String(event.message) }); });

  post({ type: 'hello' });
  return true;
}
