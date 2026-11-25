import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import type { WidgetTileSpec } from '../../dashboard/types';
import { createAppWidgetBridge } from '../../widgets/crossframe';
import { appInitialData, type AppWidgetRow } from '../../widgets/app-widget-link';
import { HOST_LIMITS } from '../../widgets/host';
import type { UiContext } from '../app/context';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/button';
import '../parts/icon';

/** Where the app on the hub passes on the files of a widget of another app. */
export const appWidgetPage = (ref: string): string | null => {
  const match = /^app:([^/]+)\/([^/]+)$/.exec(ref);
  return match ? `app-widget/${match[1]}/${match[2]}/index.html` : null;
};

/**
 * A widget of another app on the hub (a trial): its page, passed on by the app on the hub, in a sandboxed frame,
 * answered in the form of Homey's own widgets. It looks as that app made it.
 */
export class MhAppWidget extends LitElement {
  static override properties = { spec: { attribute: false }, ctx: { attribute: false }, editing: { type: Boolean }, state: { state: true } };

  declare spec: WidgetTileSpec;
  declare ctx: UiContext;
  declare editing: boolean;
  declare state: 'loading' | 'ready' | 'stuck' | 'safe';
  private frame: HTMLIFrameElement | null = null;
  private stops: (() => void)[] = [];

  constructor() {
    super();
    this.editing = false;
    this.state = 'loading';
  }

  static override styles = [sharedStyles, css`
    :host { display: block; position: relative; height: 100%; min-height: var(--tile-height); }
    /* Homey's widget pages name no colour scheme: a frame of another scheme would get an opaque backdrop in dark mode */
    iframe { display: block; width: 100%; height: 100%; min-height: var(--tile-height); max-height: var(--widget-max-height); border: 0; color-scheme: normal; }
    /* the frame fills its tile; the height the widget asks for is the least it gets */
    :host([sized]) iframe { min-height: var(--widget-height); }
    .cover { all: unset; box-sizing: border-box; position: absolute; inset: 0; cursor: grab; border-radius: var(--tile-radius); }
    .cover:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .stuck { display: flex; align-items: center; gap: var(--space-10); padding: var(--tile-pad); min-height: var(--tile-height);
      font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); --icon-size: var(--icon-l); }
  `];

  private get name(): string {
    return this.spec.label ?? this.ctx.t('widget.unnamed');
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
    // other settings, another look: the widget starts anew with them
    const before = changed.get('spec') as WidgetTileSpec | undefined;
    if (before && JSON.stringify(before.settings) !== JSON.stringify(this.spec.settings)) { this.start(); return; }
    if (this.frame) this.frame.inert = this.editing;
    const slot = this.renderRoot.querySelector('.slot');
    if (this.frame && slot && this.frame.parentElement !== slot) slot.append(this.frame);
  }

  private end(): void {
    for (const stop of this.stops.splice(0)) stop();
    this.frame?.remove();
    this.frame = null;
  }

  private start(): void {
    this.end();
    const page = appWidgetPage(this.spec.widget);
    if (this.ctx.widgets?.safe?.()) { this.state = 'safe'; return; }
    if (!page || !this.ctx.widgets?.appApi) { this.state = 'stuck'; return; }
    this.state = 'loading';
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.title = this.name;
    // Homey's own script reads the id of the widget from the address
    const address = new URL(page, document.baseURI);
    address.searchParams.set('widgetInstanceId', this.spec.id);
    frame.src = address.href;
    this.frame = frame;
    const { ctx, spec } = this;
    let row: AppWidgetRow | undefined;
    const bridge = createAppWidgetBridge({
      post: (text) => frame.contentWindow?.postMessage(text, '*'),
      initial: () => appInitialData(row, spec.settings, ctx.t.language, document.documentElement.dataset['mode'] === 'dark'),
      api: (method, path, body) => ctx.widgets?.appApi?.(spec.widget, method, path, body) ?? Promise.resolve(null),
      onReady: () => { this.state = 'ready'; },
      onHeight: (px) => { this.style.setProperty('--widget-height', `${Math.max(0, Math.round(px))}px`); this.toggleAttribute('sized', true); this.dispatchEvent(new CustomEvent('widget-height', { detail: { px }, bubbles: true, composed: true })); },
    });
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frame.contentWindow || event.source === null) return;
      // what the hub says of this widget is there before Homey's script asks for it
      void (rowAsked ??= (ctx.widgets?.appRow?.(spec.widget) ?? Promise.resolve(undefined)).then((found) => { row = found; })).then(() => bridge.receive(event.data));
    };
    let rowAsked: Promise<void> | null = null;
    window.addEventListener('message', onMessage);
    const late = window.setTimeout(() => { if (this.state === 'loading') { this.state = 'stuck'; this.end(); } }, HOST_LIMITS.readyMs * 2);
    this.stops.push(() => window.removeEventListener('message', onMessage), () => window.clearTimeout(late));
    this.requestUpdate();
  }

  override render() {
    const { t } = this.ctx;
    const cover = this.editing ? html`<button class="cover" aria-label=${t('edit.tile.open', { name: this.name })}
      @click=${() => this.dispatchEvent(new CustomEvent('cover-tap', { bubbles: true, composed: true }))}></button>` : nothing;
    if (this.state === 'stuck' || this.state === 'safe') {
      return html`<div class="stuck"><mh-icon name=${this.state === 'safe' ? 'shield' : 'error'}></mh-icon>${this.state === 'safe' ? t('widget.safe') : t('widget.stuck', { name: this.name })}</div>${cover}`;
    }
    return html`<div class="slot"></div>${cover}`;
  }
}

if (!customElements.get('mh-app-widget')) customElements.define('mh-app-widget', MhAppWidget);
