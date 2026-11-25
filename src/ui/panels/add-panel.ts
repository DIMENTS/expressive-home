import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { tilesFor } from '../../dashboard/classify';
import type { TileSpec } from '../../dashboard/types';
import type { BoardView } from '../../layout/board';
import { tileForValue } from '../../layout/tiles';
import { BUILT_IN_WIDGETS, type BuiltInWidget } from '../../widgets/catalog';
import { widgetText, type WidgetFile } from '../../widgets/widget-file';
import type { OwnStand } from './own-widgets';
import './own-widgets';
import type { TileLayout } from '../../layout/types';
import type { UiContext } from '../app/context';
import { deviceList, flowList, type FlowRow } from '../model/device-list';
import { richText } from '../parts/rich-text';
import { sharedStyles } from '../parts/shared-styles';
import { pickListStyles } from './device-list';
import '../parts/button';
import '../parts/choice-group';
import '../parts/icon';
import '../parts/note';
import '../parts/sheet';
import '../parts/text-field';
import './device-list';

/**
 * "Toevoegen aan ‹sectie›": the devices per room with a search field, and the flows. A plus on a device
 * gives the tiles the app would choose, one on a value a tile for that value; the panel reports `add-tiles` with the
 * tiles and the name for the notice, and stays open so more can be added.
 */
export class MhAddPanel extends LitElement {
  static override properties = {
    open: { type: Boolean },
    ctx: { attribute: false },
    sectionName: { type: String },
    boardName: { type: String },
    board: { attribute: false },
    newId: { attribute: false },
    tab: { state: true },
    query: { state: true },
    own: { state: true },
    apps: { state: true },
  };

  declare open: boolean;
  declare ctx: UiContext;
  declare sectionName: string;
  declare boardName: string;
  declare board: BoardView | null;
  /** A fresh id for a tile. */
  declare newId: () => string;
  declare tab: 'devices' | 'flows' | 'widgets';
  declare query: string;
  /** What the part with own widgets shows. */
  declare own: OwnStand;
  /** The widgets of other apps, once asked for; null before. */
  declare apps: Awaited<ReturnType<NonNullable<NonNullable<UiContext['widgets']>['apps']>>> | null;
  private stopListening: (() => void)[] = [];
  private appsAsked: Promise<void> | null = null;

  constructor() {
    super();
    this.open = false;
    this.sectionName = '';
    this.boardName = '';
    this.board = null;
    this.newId = () => '';
    this.tab = 'devices';
    this.query = '';
    this.own = { kind: 'list' };
    this.apps = null;
  }

  static override styles = [sharedStyles, pickListStyles, css`
    .icon { --icon-size: var(--icon-m); }
    .group { margin: var(--space-16) 0 var(--space-8) var(--space-4); font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); font-weight: var(--weight-strong); color: var(--c-primary); }
  `];

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('open')) return;
    this.listen(null);
    if (this.open) {
      this.apps = null;
      this.appsAsked = null;
      this.own = { kind: 'list' };
      this.tab = 'devices';
      this.query = '';
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const stop of this.stopListening.splice(0)) stop();
  }

  /** While open the panel follows what is on the hub, and the values of the device whose row is open. */
  private listen(deviceId: string | null): void {
    for (const stop of this.stopListening.splice(0)) stop();
    if (!this.open || !this.ctx) return;
    const redraw = () => this.requestUpdate();
    this.stopListening = [this.ctx.store.subscribeStructure(redraw), ...(deviceId === null ? [] : [this.ctx.store.subscribeDevice(deviceId, redraw)])];
  }

  private add(specs: TileSpec[], source: TileLayout['source'], name: string): void {
    const tiles = specs.map((spec): TileLayout => {
      const id = this.newId();
      // a sensor tile placed now shows its history behind the value once it is wide; tiles from before do not
      const made = spec.kind === 'sensor' ? { ...spec, id, trend: true } : { ...spec, id };
      return { id, spec: made, size: spec.size, label: null, icon: null, source };
    });
    if (tiles.length > 0) this.dispatchEvent(new CustomEvent('add-tiles', { detail: { tiles, name }, bubbles: true, composed: true }));
  }

  private addDevice(deviceId: string): void {
    const device = this.ctx.store.getDevice(deviceId);
    if (device) this.add(tilesFor(device), 'device', device.name);
  }

  private addValue(deviceId: string, capabilityId: string): void {
    const device = this.ctx.store.getDevice(deviceId);
    const spec = device ? tileForValue(device, capabilityId, '') : null;
    if (device && spec) this.add([spec], 'value', this.ctx.t('tile.join', { a: device.name, b: device.capabilities[capabilityId]?.title ?? '' }));
  }

  private addFlow(flow: FlowRow): void {
    const found = this.ctx.store.getSnapshot()?.flows.find((f) => f.id === flow.id);
    if (found) this.add([{ kind: 'flow', id: '', flowId: found.id, flowKind: found.kind, size: 'single' }], 'device', flow.name);
  }

  /** A widget of the app: added with its defaults, and with its size as it is usually best. */
  private addWidget(widget: BuiltInWidget): void {
    this.add([{ kind: 'widget', id: '', size: widget.sizes[0]!, widget: widget.id, settings: {} }], 'device', this.ctx.t(widget.name));
  }

  private renderWidget(widget: BuiltInWidget) {
    const { t } = this.ctx;
    const name = t(widget.name);
    return html`<div data-widget=${widget.id}><div class="row">
      <span class="row-main"><span class="icon"><mh-icon name=${widget.icon}></mh-icon></span><span class="text">${name}<small>${t(widget.about)}</small></span></span>
      <mh-button class="add" variant="icon" label=${t('add.add', { name })} @click=${() => this.addWidget(widget)}><mh-icon name="add_circle" filled></mh-icon></mh-button>
    </div></div>`;
  }

  /** An own widget on this section, with its first size; its settings open at once. */
  private placeOwn(widget: WidgetFile): void {
    this.add([{ kind: 'widget', id: '', size: widget.sizes[0] ?? 'single', widget: `own:${widget.id}`, settings: {} }], 'device', widgetText(widget.name, this.ctx.t.language));
  }

  private renderWidgets() {
    const { t } = this.ctx;
    const own = html`<mh-own-widgets .t=${t} .widgets=${this.ctx.widgets?.own?.() ?? []} .stand=${this.own}
      @stand=${(e: CustomEvent<OwnStand>) => { e.stopPropagation(); this.own = e.detail; }}
      @place-widget=${(e: CustomEvent<{ widget: WidgetFile }>) => { e.stopPropagation(); this.placeOwn(e.detail.widget); }}></mh-own-widgets>`;
    if (this.own.kind !== 'list') return own;
    return html`<h3 class="group">${t('add.widgetsOfApp')}</h3><div class="list">${BUILT_IN_WIDGETS.map((widget) => this.renderWidget(widget))}</div>${own}${this.renderApps()}`;
  }

  /** Widgets of other apps (a trial): only with the app on the hub, and only with a key that may do everything. */
  private renderApps() {
    const { t } = this.ctx;
    const list = this.ctx.widgets?.apps;
    if (!list) return nothing;
    if (this.apps === null) {
      // asked once while the panel is open, however often it draws meanwhile
      this.appsAsked ??= list().then((apps) => { this.apps = apps; }, () => { this.apps = { state: 'unreachable', widgets: [] }; });
      return html`<h3 class="group">${t('appWidgets.title')}</h3><mh-note icon="apps">${t('appWidgets.trial')}</mh-note>`;
    }
    const rows = this.apps.widgets;
    return html`<h3 class="group">${t('appWidgets.title')}</h3>
      <mh-note icon="apps">${t('appWidgets.trial')} ${t(this.apps.state === 'ok' ? (rows.length === 0 ? 'appWidgets.none' : 'appWidgets.look') : this.apps.state === 'refused' ? 'appWidgets.refused' : this.apps.state === 'no-key' ? 'appWidgets.noKey' : 'appWidgets.unreachable')}</mh-note>
      ${rows.length === 0 ? nothing : html`<div class="list">${rows.map((row) => {
        const name = widgetText(row.name, t.language) || row.ref;
        return html`<div data-app-widget=${row.ref}><div class="row">
          <span class="row-main"><span class="icon"><mh-icon name="apps"></mh-icon></span><span class="text">${name}<small>${row.app}</small></span></span>
          <mh-button class="add" variant="icon" label=${t('add.add', { name })} @click=${() => this.addApp(row.ref, name)}><mh-icon name="add_circle" filled></mh-icon></mh-button>
        </div></div>`;
      })}</div>`}`;
  }

  private addApp(ref: string, name: string): void {
    const id = this.newId();
    const tile: TileLayout = { id, spec: { kind: 'widget', id, size: 'single', widget: ref, settings: {} }, size: 'single', label: name, icon: null, source: 'device' };
    this.dispatchEvent(new CustomEvent('add-tiles', { detail: { tiles: [tile], name }, bubbles: true, composed: true }));
  }

  private renderFlow(flow: FlowRow) {
    const { t } = this.ctx;
    return html`<div data-flow=${flow.id}><div class="row">
      <span class="row-main"><span class="icon"><mh-icon name="play_arrow"></mh-icon></span><span class="text">${flow.name}<small>${flow.where.length > 0
        ? html`<mh-icon name="check_circle" filled></mh-icon>${t('add.onBoard', { sections: flow.where.join(', ') })}` : t(flow.button ? 'add.flowButton' : 'add.flowStartable')}</small></span></span>
      <mh-button class="add" variant="icon" label=${t('add.add', { name: flow.name })} @click=${() => this.addFlow(flow)}><mh-icon name="add_circle" filled></mh-icon></mh-button>
    </div></div>`;
  }

  private renderNoFlows() {
    const { t } = this.ctx;
    return this.ctx.status().served ? html`<mh-note icon="touch_app">${richText(t('add.noButtons'))}</mh-note>` : html`<p class="none">${t('add.noFlows')}</p>`;
  }

  private renderBody() {
    const { t, store } = this.ctx;
    const snapshot = store.getSnapshot();
    if (!snapshot || !this.board) return nothing;
    const tabs = html`<mh-choice-group label=${t('add.what')} .value=${this.tab}
      .options=${[{ id: 'devices', label: t('add.devices'), icon: 'devices_other' }, { id: 'flows', label: t('add.flows'), icon: 'play_circle' }, { id: 'widgets', label: t('add.widgets'), icon: 'widgets' }]}
      @change=${(e: CustomEvent<{ value: 'devices' | 'flows' | 'widgets' }>) => { e.stopPropagation(); this.tab = e.detail.value; }}></mh-choice-group>`;
    if (this.tab === 'widgets') return this.own.kind === 'list' ? html`${tabs}${this.renderWidgets()}` : this.renderWidgets();
    if (this.tab === 'flows') {
      const flows = flowList(snapshot, this.board, t);
      return html`${tabs}<div class="list">${flows.length === 0 ? this.renderNoFlows() : flows.map((flow) => this.renderFlow(flow))}</div>`;
    }
    return html`${tabs}
      <mh-text-field label=${t('add.search')} placeholder=${t('add.search')} icon="search" type="search" quiet .value=${this.query}
        @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.query = e.detail.value; }}></mh-text-field>
      <mh-device-list mode="add" .t=${t} .groups=${deviceList(snapshot, this.board, this.query, t)}
        @expand=${(e: CustomEvent<{ deviceId: string | null }>) => { e.stopPropagation(); this.listen(e.detail.deviceId); }}
        @add-device=${(e: CustomEvent<{ deviceId: string }>) => { e.stopPropagation(); this.addDevice(e.detail.deviceId); }}
        @add-value=${(e: CustomEvent<{ deviceId: string; capabilityId: string }>) => { e.stopPropagation(); this.addValue(e.detail.deviceId, e.detail.capabilityId); }}></mh-device-list>`;
  }

  override render() {
    const { t } = this.ctx;
    const own = this.tab === 'widgets' ? this.own : { kind: 'list' as const };
    const shared = own.kind === 'share' ? this.ctx.widgets?.own?.().find((widget) => widget.id === own.id) : undefined;
    const heading = own.kind === 'import' ? t('ownWidgets.add') : shared ? t('ownWidgets.share', { name: widgetText(shared.name, t.language) }) : t('add.title', { name: this.sectionName });
    return html`<mh-sheet .t=${t} ?open=${this.open} heading=${heading} subheading=${this.boardName} icon=${own.kind === 'list' ? 'add' : own.kind === 'import' ? 'download' : 'share'}
      .back=${own.kind !== 'list'} @back=${(e: Event) => { e.stopPropagation(); this.own = { kind: 'list' }; }}
      @close=${(e: Event) => { e.stopPropagation(); this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true })); }}>
      ${this.open ? this.renderBody() : nothing}
    </mh-sheet>`;
  }
}

if (!customElements.get('mh-add-panel')) customElements.define('mh-add-panel', MhAddPanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-add-panel': MhAddPanel }
}
