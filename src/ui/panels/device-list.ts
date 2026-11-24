import { LitElement, css, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t as dutch, type Translate } from '../../i18n';
import type { DeviceRow, ValueRow, ZoneGroup } from '../model/device-list';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/button';
import '../parts/icon';

/** The rows of a list to pick from, shared with the lists of flows and of new devices. */
export const pickListStyles = css`
  h3 { margin: var(--space-8) 0 var(--space-4) var(--space-4); font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); font-weight: var(--weight-strong); color: var(--c-on-surface-variant); }
  .list { display: grid; gap: var(--space-4); }
  .row {
    display: flex; align-items: center; gap: var(--space-4); min-height: var(--pick-row-height); padding-right: var(--space-8);
    border-radius: var(--sheet-row-radius); background: var(--sheet-row-bg);
  }
  .row.open { border-bottom-left-radius: var(--shape-sm); border-bottom-right-radius: var(--shape-sm); }
  .row-main {
    all: unset; box-sizing: border-box; display: flex; align-items: center; gap: var(--space-12); flex: 1; min-width: 0; min-height: var(--pick-row-height);
    padding: var(--space-8) var(--space-4) var(--space-8) var(--space-12); border-radius: inherit;
  }
  button.row-main { cursor: pointer; }
  button.row-main:hover { background: color-mix(in srgb, currentColor var(--state-hover), transparent); }
  button.row-main:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: calc(-1 * var(--focus-width)); }
  .icon {
    flex: none; width: var(--pick-icon-box); height: var(--pick-icon-box); display: grid; place-items: center; clip-path: var(--shape-circle);
    background: var(--tile-icon-bg); color: var(--tile-icon-fg); --icon-size: var(--icon-m);
  }
  .text { flex: 1; min-width: 0; display: grid; font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); overflow-wrap: anywhere; }
  .text small { display: flex; align-items: center; gap: var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); font-weight: var(--weight-regular); color: var(--c-on-surface-variant); --icon-size: var(--icon-xs); }
  .text small mh-icon { color: var(--pick-badge-fg); }
  .add mh-icon { color: var(--pick-badge-fg); }
  .chevron { color: var(--c-on-surface-variant); --icon-size: var(--icon-l); transition: transform var(--motion-spatial); }
  .open .chevron { transform: rotate(90deg); }
  .none { margin: var(--space-8) var(--space-12) var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
`;

/**
 * The devices per room, to add or to choose a value from (5.7). A tap on a row unfolds its values. In
 * `add` every device and value has a plus and reports `add-device` { deviceId } or `add-value` { deviceId, capabilityId };
 * in `choose` every value reports `choose`. `expand` { deviceId } says which row is open, so its values can be kept live.
 */
export class MhDeviceList extends LitElement {
  static override properties = {
    groups: { attribute: false },
    mode: { type: String },
    numericOnly: { type: Boolean },
    t: { attribute: false },
    openId: { state: true },
  };

  declare groups: ZoneGroup[];
  declare mode: 'add' | 'choose';
  /** Only values that are a number: for the big number of the hero. */
  declare numericOnly: boolean;
  /** The texts, in the language of the app; Dutch until the app sets it. */
  declare t: Translate;
  declare openId: string | null;

  constructor() {
    super();
    this.groups = [];
    this.mode = 'add';
    this.numericOnly = false;
    this.t = dutch;
    this.openId = null;
  }

  static override styles = [sharedStyles, pickListStyles, css`
    :host { display: block; min-width: 0; }
    .values { display: grid; gap: var(--space-2); margin: calc(-1 * var(--space-2)) 0 var(--space-4); padding: var(--space-4); border-radius: 0 0 var(--sheet-row-radius) var(--sheet-row-radius); background: var(--sheet-row-bg); }
    .value {
      display: flex; align-items: center; gap: var(--space-12); min-height: var(--target-min); padding: var(--space-2) var(--space-4) var(--space-2) var(--space-12);
      border-radius: var(--shape-lg); background: var(--sheet-bg); font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); --icon-size: var(--icon-m);
    }
    .value > mh-icon { color: var(--c-on-surface-variant); }
    .value .grow { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .value small { font-size: inherit; color: var(--c-on-surface-variant); }
  `];

  private emit(type: 'add-device' | 'add-value' | 'choose' | 'expand', detail: { deviceId: string | null; capabilityId?: string }): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private toggle(deviceId: string): void {
    this.openId = this.openId === deviceId ? null : deviceId;
    this.emit('expand', { deviceId: this.openId });
  }

  private subline(device: DeviceRow) {
    if (device.where.length > 0) return html`<mh-icon name="check_circle" filled></mh-icon>${this.t('add.onBoard', { sections: device.where.join(', ') })}`;
    return device.inHero ? this.t('add.inHero') : device.zoneName ?? this.t('add.noZone');
  }

  private plus(name: string, act: () => void) {
    return html`<mh-button class="add" variant="icon" label=${this.t('add.add', { name })} @click=${act}><mh-icon name="add_circle" filled></mh-icon></mh-button>`;
  }

  private renderValue(device: DeviceRow, value: ValueRow) {
    const ids = { deviceId: device.id, capabilityId: value.capabilityId };
    return html`<div class="value" data-value=${value.capabilityId}><mh-icon name=${value.icon}></mh-icon><span class="grow">${value.title} <small>· ${value.value}</small></span>
      ${this.mode === 'add' ? this.plus(value.title, () => this.emit('add-value', ids))
        : html`<mh-button variant="tonal" small @click=${() => this.emit('choose', ids)}>${this.t('picker.choose')}</mh-button>`}</div>`;
  }

  private renderValues(device: DeviceRow) {
    const values = this.mode === 'add' ? device.values : device.values.filter((value) => (this.numericOnly ? value.numeric : value.readable));
    return html`<div class="values" id=${`values-${device.id}`}>
      ${this.mode === 'add' ? html`<p class="none">${this.t('add.values')}</p>` : nothing}
      ${values.length === 0 ? html`<p class="none">${this.t('picker.noNumber')}</p>` : values.map((value) => this.renderValue(device, value))}
    </div>`;
  }

  private renderDevice(device: DeviceRow) {
    const open = device.id === this.openId;
    return html`<div data-device=${device.id}>
      <div class="row ${open ? 'open' : ''}">
        <button class="row-main" aria-expanded=${open ? 'true' : 'false'} aria-controls=${open ? `values-${device.id}` : nothing} @click=${() => this.toggle(device.id)}>
          <span class="icon"><mh-icon name=${device.icon}></mh-icon></span><span class="text">${device.name}<small>${this.subline(device)}</small></span>
          ${this.mode === 'choose' ? html`<mh-icon class="chevron" name="chevron_right"></mh-icon>` : nothing}
        </button>
        ${this.mode === 'add' ? this.plus(device.name, () => this.emit('add-device', { deviceId: device.id })) : nothing}
      </div>
      ${open ? this.renderValues(device) : nothing}
    </div>`;
  }

  override render() {
    if (this.groups.length === 0) return html`<p class="none" role="status">${this.t('add.noMatch')}</p>`;
    return html`${this.groups.map((group) => html`<h3>${group.name}</h3><div class="list">${repeat(group.devices, (device) => device.id, (device) => this.renderDevice(device))}</div>`)}`;
  }
}

if (!customElements.get('mh-device-list')) customElements.define('mh-device-list', MhDeviceList);

declare global {
  interface HTMLElementTagNameMap { 'mh-device-list': MhDeviceList }
}
