import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import fontUrl from '@fontsource-variable/google-sans-flex/files/google-sans-flex-latin-opsz-normal.woff2?url';
import type { WidgetTileSpec } from '../../dashboard/types';
import type { CapabilityValue } from '../../homey/types';
import { createWidgetHost, type HostState, type WidgetHost } from '../../widgets/host';
import { widgetText, type WidgetFile } from '../../widgets/widget-file';
import type { UiContext } from '../app/context';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/button';
import '../parts/icon';

/** The page the frame loads, next to the dashboard. */
export const FRAME_PAGE = 'widget-frame.html';
/** Which widgets were starting when the page went: after a reload they wait for the button to try again. */
export const STARTING_KEY = 'dashboard.widgetStarting';

let fontBytes: Promise<ArrayBuffer | null> | null = null;
/** The letter of the dashboard, read once, for every frame: a frame may fetch nothing itself. */
const font = (): Promise<ArrayBuffer | null> => (fontBytes ??= fetch(fontUrl).then((response) => (response.ok ? response.arrayBuffer() : null)).catch(() => null));

/** The widgets that are starting now, in this tab: one still there after a reload hung the page. */
const starting = {
  all(): string[] {
    try {
      const raw: unknown = JSON.parse(window.sessionStorage.getItem(STARTING_KEY) ?? '[]');
      return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
    } catch { return []; }
  },
  write(ids: string[]): void {
    try {
      if (ids.length === 0) window.sessionStorage.removeItem(STARTING_KEY);
      else window.sessionStorage.setItem(STARTING_KEY, JSON.stringify(ids));
    } catch { /* without the storage there is no mark */ }
  },
  has: (id: string): boolean => starting.all().includes(id),
  add(id: string): void { if (!starting.has(id)) starting.write([...starting.all(), id]); },
  remove(id: string): void { starting.write(starting.all().filter((other) => other !== id)); },
};
// a page that is left on purpose did not hang; a page that hangs runs nothing of this
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => starting.write([]));

/** The values of the theme as they are on this tile, also those of a section with its own colour. */
function themeOf(element: HTMLElement): { tokens: Record<string, string>; mode: 'light' | 'dark'; density: string } {
  const root = document.documentElement;
  const computed = getComputedStyle(element);
  const tokens: Record<string, string> = {};
  for (let i = 0; i < root.style.length; i += 1) {
    const name = root.style.item(i);
    if (name.startsWith('--')) tokens[name] = computed.getPropertyValue(name).trim();
  }
  return { tokens, mode: root.dataset['mode'] === 'dark' ? 'dark' : 'light', density: root.dataset['density'] ?? 'comfortable' };
}

/**
 * An own widget on its tile: its page in a sandboxed frame, run by a host that holds every permission. While editing a
 * surface lies over the frame, so a tap opens the menu of the tile and never reaches the widget.
 */
export class MhOwnWidget extends LitElement {
  static override properties = {
    spec: { attribute: false },
    ctx: { attribute: false },
    widget: { attribute: false },
    editing: { type: Boolean },
    state: { state: true },
    attempt: { state: true },
  };

  declare spec: WidgetTileSpec;
  declare ctx: UiContext;
  declare widget: WidgetFile;
  declare editing: boolean;
  declare state: HostState | 'crashed' | 'safe';
  /** A new frame each time the button to try again is tapped. */
  declare attempt: number;
  private host: WidgetHost | null = null;
  private frame: HTMLIFrameElement | null = null;
  private stops: (() => void)[] = [];
  private visible = true;

  constructor() {
    super();
    this.editing = false;
    this.state = 'loading';
    this.attempt = 0;
  }

  static override styles = [sharedStyles, css`
    :host { display: block; position: relative; height: 100%; min-height: var(--tile-height); }
    iframe { display: block; width: 100%; height: 100%; min-height: var(--tile-height); max-height: var(--widget-max-height); border: 0; background: transparent; color-scheme: light dark; }
    :host([sized]) iframe { height: var(--widget-height); }
    .cover {
      all: unset; box-sizing: border-box; position: absolute; inset: 0; cursor: grab; border-radius: var(--tile-radius);
    }
    .cover:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .loading { opacity: 0; }
    .stuck { display: flex; flex-direction: column; justify-content: space-between; gap: var(--space-10); padding: var(--tile-pad); min-height: var(--tile-height); }
    .stuck .msg { display: flex; align-items: center; gap: var(--space-10); }
    .stuck .icon { flex: none; width: var(--tile-icon-box); height: var(--tile-icon-box); display: grid; place-items: center; border-radius: var(--shape-full);
      background: var(--tile-icon-bg); color: var(--tile-icon-fg); --icon-size: var(--icon-l); }
    .stuck .name { font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); }
    .stuck .why { display: block; font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--tile-state-fg); font-weight: var(--weight-regular); }
  `];

  private get name(): string {
    return this.spec.label ?? widgetText(this.widget.name, this.ctx.t.language);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.start();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.end();
  }

  protected override firstUpdated(): void {
    this.start();
  }

  protected override updated(changed: PropertyValues<this>): void {
    const restart = (changed.has('spec') && changed.get('spec') !== undefined && JSON.stringify(changed.get('spec')?.settings) !== JSON.stringify(this.spec.settings))
      || (changed.has('widget') && changed.get('widget') !== undefined && JSON.stringify(changed.get('widget')) !== JSON.stringify(this.widget)) || (changed.has('attempt') && changed.get('attempt') !== undefined);
    if (restart) this.start();
    if (changed.has('editing') && this.frame) this.frame.inert = this.editing;
    const slot = this.renderRoot.querySelector('.slot');
    if (this.frame && slot && this.frame.parentElement !== slot) slot.append(this.frame);
  }

  private end(): void {
    // taken away on purpose: it did not hang the page
    if (this.frame && this.spec) starting.remove(this.spec.id);
    for (const stop of this.stops.splice(0)) stop();
    this.host?.stop();
    this.host = null;
    this.frame?.remove();
    this.frame = null;
  }

  /** A new frame and a new host; a widget that was starting when the page went waits for the button to try again. */
  private start(): void {
    this.end();
    if (!this.isConnected || !this.widget) return;
    if (this.ctx.widgets?.safe?.()) { this.state = 'safe'; return; }
    if (this.attempt === 0 && starting.has(this.spec.id)) { this.state = 'crashed'; return; }
    this.state = 'loading';
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.title = this.name;
    frame.src = new URL(FRAME_PAGE, document.baseURI).href;
    frame.inert = this.editing;
    this.frame = frame;
    const { ctx, spec } = this;
    const host: WidgetHost = createWidgetHost({
      post: (message, transfer) => frame.contentWindow?.postMessage({ eh: 'widget', ...message }, '*', transfer ?? []),
      widget: this.widget, spec, language: ctx.t.language, instance: spec.id,
      device: (id) => ctx.store.getDevice(id),
      theme: () => themeOf(this),
      font,
      canControl: () => ctx.status().canControl,
      setCapability: (deviceId, capabilityId, value) => ctx.actions.setCapability(deviceId, capabilityId, value),
      guard: (deviceId, capabilityId, value) => ctx.actions.guard(deviceId, capabilityId, value),
      ask: (deviceId, capabilityId, value: CapabilityValue, widgetName) => ctx.widgets?.ask?.(deviceId, capabilityId, value, widgetName) ?? Promise.resolve(false),
      startFlow: async (flowId) => {
        const flow = ctx.store.getSnapshot()?.flows.find((f) => f.id === flowId);
        return flow ? ctx.actions.startFlow(flow.id, flow.kind) : false;
      },
      openDevice: (deviceId) => ctx.actions.openDevice(deviceId),
      now: () => Date.now(),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
      onState: (state) => {
        // a host of an earlier frame says nothing about this one
        if (this.host !== host) return;
        this.state = state;
        if (state !== 'loading') starting.remove(spec.id);
        if (state === 'stuck') { frame.remove(); if (this.frame === frame) this.frame = null; }
      },
      focused: () => this.shadowRoot?.activeElement === frame,
      onHeight: (px) => {
        this.style.setProperty('--widget-height', `${Math.max(0, Math.round(px))}px`);
        this.toggleAttribute('sized', true); this.dispatchEvent(new CustomEvent('widget-height', { detail: { px }, bubbles: true, composed: true }));
      },
      onLeave: () => this.dispatchEvent(new CustomEvent('widget-leave', { bubbles: true, composed: true })),
      paused: () => document.hidden || !this.visible,
    });
    this.host = host;
    const onMessage = (event: MessageEvent): void => { if (event.source === frame.contentWindow && event.source !== null) host.receive(event.data); };
    window.addEventListener('message', onMessage);
    this.stops.push(() => window.removeEventListener('message', onMessage));
    for (const id of host.chosen.devices) {
      this.stops.push(ctx.store.subscribeDevice(id, () => { const device = ctx.store.getDevice(id); if (device) host.device(device); }));
    }
    const themeWatch = new MutationObserver(() => host.theme());
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-mode', 'data-density'] });
    this.stops.push(() => themeWatch.disconnect());
    if (typeof IntersectionObserver === 'function') {
      const sight = new IntersectionObserver((entries) => { this.visible = entries.some((entry) => entry.isIntersecting); });
      sight.observe(this);
      this.stops.push(() => sight.disconnect());
    }
    starting.add(spec.id);
    this.requestUpdate();
  }

  private restart(): void {
    starting.remove(this.spec.id);
    this.attempt += 1;
  }

  private renderStopped(icon: 'error' | 'shield', why: string) {
    const { t } = this.ctx;
    return html`<div class="stuck"><div class="msg"><span class="icon"><mh-icon name=${icon}></mh-icon></span>
      <span class="name">${icon === 'error' ? t('widget.stuck', { name: this.name }) : this.name}<span class="why">${why}</span></span></div>
      ${icon === 'error' && !this.editing ? html`<mh-button variant="tonal" @click=${() => this.restart()}><mh-icon name="refresh"></mh-icon>${t('widget.again')}</mh-button>` : nothing}</div>`;
  }

  override render() {
    const { t } = this.ctx;
    const cover = this.editing ? html`<button class="cover" aria-label=${t('edit.tile.open', { name: this.name })}
      @click=${() => this.dispatchEvent(new CustomEvent('cover-tap', { bubbles: true, composed: true }))}></button>` : nothing;
    if (this.state === 'safe') return html`${this.renderStopped('shield', t('widget.safe'))}${cover}`;
    if (this.state === 'crashed') return html`${this.renderStopped('error', t('widget.crashed'))}${cover}`;
    if (this.state === 'stuck') return html`${this.renderStopped('error', t('widget.stuckWhy'))}${cover}`;
    return html`<div class="slot ${this.state === 'loading' ? 'loading' : ''}"></div>${cover}`;
  }
}

if (!customElements.get('mh-own-widget')) customElements.define('mh-own-widget', MhOwnWidget);
