import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { tilesFor } from '../../dashboard/classify';
import type { TileSpec } from '../../dashboard/types';
import type { BoardView } from '../../layout/board';
import { tileForValue } from '../../layout/tiles';
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
  };

  declare open: boolean;
  declare ctx: UiContext;
  declare sectionName: string;
  declare boardName: string;
  declare board: BoardView | null;
  /** A fresh id for a tile. */
  declare newId: () => string;
  declare tab: 'devices' | 'flows';
  declare query: string;
  private stopListening: (() => void)[] = [];

  constructor() {
    super();
    this.open = false;
    this.sectionName = '';
    this.boardName = '';
    this.board = null;
    this.newId = () => '';
    this.tab = 'devices';
    this.query = '';
  }

  static override styles = [sharedStyles, pickListStyles, css`
    .icon { --icon-size: var(--icon-m); }
  `];

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('open')) return;
    this.listen(null);
    if (this.open) {
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
      return { id, spec: { ...spec, id }, size: spec.size, label: null, icon: null, source };
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
      .options=${[{ id: 'devices', label: t('add.devices'), icon: 'devices_other' }, { id: 'flows', label: t('add.flows'), icon: 'play_circle' }]}
      @change=${(e: CustomEvent<{ value: 'devices' | 'flows' }>) => { e.stopPropagation(); this.tab = e.detail.value; }}></mh-choice-group>`;
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
    return html`<mh-sheet .t=${t} ?open=${this.open} heading=${t('add.title', { name: this.sectionName })} subheading=${this.boardName} icon="add"
      @close=${(e: Event) => { e.stopPropagation(); this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true })); }}>
      ${this.open ? this.renderBody() : nothing}
    </mh-sheet>`;
  }
}

if (!customElements.get('mh-add-panel')) customElements.define('mh-add-panel', MhAddPanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-add-panel': MhAddPanel }
}
