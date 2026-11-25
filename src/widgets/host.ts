import { isGuarded } from '../controls/danger';
import type { WidgetTileSpec } from '../dashboard/types';
import type { CapabilityValue, Device } from '../homey/types';
import { widgetText, type WidgetFile } from './widget-file';

/** The limits the dashboard holds a widget to. */
export const HOST_LIMITS = {
  /** A widget that is not ready this long after it got everything is stopped. */
  readyMs: 10_000,
  /** How often the dashboard asks for a sign of life, and how long a widget may be silent. */
  pingMs: 5_000,
  silentMs: 10_000,
  /** Commands in a window of time. */
  commands: 20,
  commandWindowMs: 10_000,
  /** At most one question of danger per widget in this time. */
  questionMs: 30_000,
  messagesPerSecond: 200,
} as const;

export type HostState = 'loading' | 'ready' | 'stuck';
export type CallAnswer = 'done' | 'declined' | 'refused';

export interface HostDeps {
  /** A message to the frame. */
  post(message: Record<string, unknown>, transfer?: Transferable[]): void;
  widget: WidgetFile;
  spec: WidgetTileSpec;
  language: string;
  instance: string;
  device(id: string): Device | undefined;
  theme(): { tokens: Record<string, string>; mode: 'light' | 'dark'; density: string };
  /** The letter of the dashboard, as bytes; null when it cannot be read. */
  font?(): Promise<ArrayBuffer | null>;
  canControl(): boolean;
  setCapability(deviceId: string, capabilityId: string, value: CapabilityValue): void;
  guard(deviceId: string, capabilityId: string, value: CapabilityValue): void;
  /** The question of the dashboard for something dangerous; true when it was answered yes. */
  ask(deviceId: string, capabilityId: string, value: CapabilityValue, widgetName: string): Promise<boolean>;
  startFlow(flowId: string): Promise<boolean>;
  openDevice(deviceId: string): void;
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  onState(state: HostState): void;
  onHeight(px: number): void;
  /** Escape in the widget: the focus goes back to the dashboard. */
  onLeave(): void;
  /** The page is hidden or the widget is out of sight: browsers slow its clock down, so silence means nothing. */
  paused(): boolean;
  /** The frame has the focus: only then may it open a window or hand the focus back. Absent: always. */
  focused?(): boolean;
}

/** The devices and flows a placed widget may use: those its settings chose. */
export function chosenIds(widget: WidgetFile, spec: WidgetTileSpec): { devices: string[]; flows: string[] } {
  const of = (type: 'device' | 'flow'): string[] => [...new Set(widget.settings.filter((setting) => setting.type === type)
    .map((setting) => spec.settings[setting.id]).filter((id): id is string => typeof id === 'string' && id !== ''))];
  return { devices: of('device'), flows: of('flow') };
}

/** A device as a widget sees it: plain data, nothing of the hub's own. */
export function deviceForWidget(device: Device): Record<string, unknown> {
  return {
    id: device.id, name: device.name, class: device.deviceClass, available: device.available,
    capabilities: Object.fromEntries(device.capabilityOrder.flatMap((id) => {
      const cap = device.capabilities[id];
      return cap ? [[id, { id, title: cap.title, type: cap.type, value: cap.value, units: cap.units, min: cap.min, max: cap.max, step: cap.step, decimals: cap.decimals, setable: cap.setable, getable: cap.getable }]] : [];
    })),
  };
}

const VALUE_TYPES: Record<string, string> = { boolean: 'boolean', number: 'number', string: 'string', enum: 'string' };

/**
 * The dashboard's side of an own widget: it gives the frame what it may have and answers what it asks, holding
 * every permission itself; it watches that the widget stays alive and stops it when it does not.
 */
export function createWidgetHost(deps: HostDeps) {
  const { widget, spec } = deps;
  const chosen = chosenIds(widget, spec);
  const name = widgetText(widget.name, deps.language);
  let state: HostState | null = null;
  let loaded = false;
  let lastSign = 0;
  let pings = 0;
  let timer: unknown = null;
  let commands: number[] = [];
  let lastQuestion = -Infinity;
  let second = { at: -Infinity, count: 0 };
  let stopped = false;

  const set = (next: HostState): void => {
    if (state === next) return;
    state = next;
    deps.onState(next);
    if (next === 'stuck') stop();
  };
  const stop = (): void => {
    if (timer !== null) deps.clearTimeout(timer);
    timer = null;
  };
  const schedule = (ms: number, fn: () => void): void => {
    stop();
    if (!stopped) timer = deps.setTimeout(() => { if (!stopped) fn(); }, ms);
  };
  /** A command, a flow or a window: at most HOST_LIMITS.commands in a window of time. */
  const counted = (): boolean => {
    const now = deps.now();
    commands = commands.filter((at) => now - at < HOST_LIMITS.commandWindowMs);
    if (commands.length >= HOST_LIMITS.commands) return false;
    commands.push(now);
    return true;
  };
  const focused = (): boolean => deps.focused?.() ?? true;
  /** What the widget's settings are: the defaults of its file, then this tile's own; a device or flow is never a default. */
  const settings = (): Record<string, unknown> => ({
    ...Object.fromEntries(widget.settings.filter((s) => s.default !== undefined && !['device', 'flow', 'capability'].includes(s.type)).map((s) => [s.id, s.default])),
    ...spec.settings,
  });

  /** While ready: a ping now and then; silence for too long while it is in sight stops it. */
  function watch(): void {
    schedule(HOST_LIMITS.pingMs, () => {
      if (state !== 'ready') return;
      if (deps.paused()) { lastSign = deps.now(); watch(); return; }
      if (deps.now() - lastSign > HOST_LIMITS.silentMs) { set('stuck'); return; }
      pings += 1;
      deps.post({ type: 'ping', n: pings });
      watch();
    });
  }

  const devicesOf = (): Record<string, unknown> => Object.fromEntries(chosen.devices.flatMap((id) => {
    const device = deps.device(id);
    return device ? [[id, deviceForWidget(device)]] : [];
  }));

  async function load(): Promise<void> {
    if (loaded) return;
    loaded = true;
    set('loading');
    const font = deps.font ? await deps.font().catch(() => null) : null;
    if (stopped) return;
    deps.post({
      type: 'load', widget: { html: widget.html, css: widget.css, js: widget.js, texts: widget.texts }, settings: settings(),
      instance: deps.instance, language: deps.language, devices: devicesOf(), theme: deps.theme(), ...(font ? { font } : {}),
    });
    schedule(HOST_LIMITS.readyMs, () => { if (state === 'loading') set('stuck'); });
  }

  async function control(deviceId: unknown, capabilityId: unknown, value: unknown): Promise<CallAnswer> {
    if (typeof deviceId !== 'string' || typeof capabilityId !== 'string' || !chosen.devices.includes(deviceId) || !deps.canControl()) return 'refused';
    const device = deps.device(deviceId);
    const cap = device && Object.hasOwn(device.capabilities, capabilityId) ? device.capabilities[capabilityId] : undefined;
    if (!device || !cap?.setable || typeof value !== VALUE_TYPES[cap.type]) return 'refused';
    if (!counted()) return 'refused';
    const now = deps.now();
    const next = value as CapabilityValue;
    if (!isGuarded(device, capabilityId)) {
      deps.setCapability(deviceId, capabilityId, next);
      return 'done';
    }
    // what lets somebody in is always asked in the dashboard, and not again and again
    if (now - lastQuestion < HOST_LIMITS.questionMs) return 'refused';
    lastQuestion = now;
    if (!(await deps.ask(deviceId, capabilityId, next, name))) return 'declined';
    deps.guard(deviceId, capabilityId, next);
    return 'done';
  }

  async function call(method: unknown, args: unknown[]): Promise<CallAnswer> {
    switch (method) {
      case 'setCapabilityValue': return control(args[0], args[1], args[2]);
      case 'startFlow': {
        if (typeof args[0] !== 'string' || !chosen.flows.includes(args[0]) || !counted()) return 'refused';
        return (await deps.startFlow(args[0])) ? 'done' : 'refused';
      }
      case 'openDevice':
        if (typeof args[0] !== 'string' || !chosen.devices.includes(args[0]) || !focused() || !counted()) return 'refused';
        deps.openDevice(args[0]);
        return 'done';
      default: return 'refused';
    }
  }

  // a frame that never even says hello is stopped as well
  schedule(HOST_LIMITS.readyMs, () => { if (state === null || state === 'loading') set('stuck'); });

  return {
    /** A message of the frame; anything that is not one is ignored. */
    receive(raw: unknown): void {
      if (stopped || state === 'stuck' || typeof raw !== 'object' || raw === null) return;
      const message = raw as Record<string, unknown>;
      if (message['eh'] !== 'widget' || typeof message['type'] !== 'string') return;
      const now = deps.now();
      second = now - second.at >= 1000 ? { at: now, count: 1 } : { ...second, count: second.count + 1 };
      if (second.count > HOST_LIMITS.messagesPerSecond) { set('stuck'); return; }
      lastSign = now;
      switch (message['type']) {
        case 'hello': void load(); break;
        case 'ready': if (state === 'loading' || state === null) { set('ready'); watch(); } break;
        case 'height': if (typeof message['px'] === 'number' && Number.isFinite(message['px'])) deps.onHeight(message['px']); break;
        case 'leave': if (focused()) deps.onLeave(); break;
        case 'call': {
          const id = message['id'];
          if (typeof id !== 'number') break;
          void call(message['method'], Array.isArray(message['args']) ? message['args'] : []).then((result) => deps.post({ type: 'answer', id, result }));
          break;
        }
        default: break;
      }
    },
    /** A chosen device changed. */
    device(device: Device): void {
      if (state !== 'stuck' && chosen.devices.includes(device.id)) deps.post({ type: 'device', device: deviceForWidget(device) });
    },
    theme(): void {
      if (state !== 'stuck') deps.post({ type: 'theme', theme: deps.theme() });
    },
    chosen,
    stop(): void { stopped = true; stop(); },
    state: (): HostState | null => state,
  };
}

export type WidgetHost = ReturnType<typeof createWidgetHost>;
