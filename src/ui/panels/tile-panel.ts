import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { isDeviceTile, type DeviceTileSpec, type TileSize } from '../../dashboard/types';
import type { Capability, Device } from '../../homey/types';
import { formatValue, joinValue } from '../../i18n/format';
import { t as dutch, type Translate } from '../../i18n';
import { tileChoices, type TileChoices } from '../../layout/tiles';
import { LIMITS, type TileLayout } from '../../layout/types';
import type { IconName } from '../icons/icons';
import { isLibraryIcon } from '../icons/library';
import { iconFor } from '../model/icon-for';
import { sharedStyles } from '../parts/shared-styles';
import { sizeLabels } from '../screens/edit-menus';
import { tileSizes } from '../tiles/registry';
import { panelStyles } from './panel-styles';
import '../parts/button';
import '../parts/choice-group';
import '../parts/icon';
import '../parts/icon-picker';
import '../parts/radio-list';
import '../parts/sheet';
import '../parts/switch';
import '../parts/text-field';

/** A multi-value tile shows this many values. */
const CELLS = 3;
const NO_DETAIL = 'none';

type TilePatch = Partial<Pick<TileLayout, 'spec' | 'size' | 'label' | 'icon'>>;

/**
 * "Tegel instellen": the own name and icon, what the tile shows and controls when there is something to
 * choose, its size, and removing it. Every choice is reported at once as `set-tile` { patch, typing }; "Wijzigen" at
 * the icon shows the icon library as a second stand of the panel.
 */
export class MhTilePanel extends LitElement {
  static override properties = {
    open: { type: Boolean },
    tile: { attribute: false },
    sectionName: { type: String },
    device: { attribute: false },
    t: { attribute: false },
    icons: { state: true },
  };

  declare open: boolean;
  declare tile: TileLayout | null;
  declare sectionName: string;
  declare device: Device | undefined;
  /** The texts, in the language of the app; Dutch until the app sets it. */
  declare t: Translate;
  /** The icon library instead of the settings. */
  declare icons: boolean;

  constructor() {
    super();
    this.open = false;
    this.tile = null;
    this.sectionName = '';
    this.device = undefined;
    this.t = dutch;
    this.icons = false;
  }

  static override styles = [sharedStyles, panelStyles, css`
    .row > mh-icon { color: var(--c-on-surface-variant); --icon-size: var(--icon-l); }
    .help { margin: 0 0 0 var(--space-16); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    .checks { display: grid; }
    .check {
      all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: var(--space-12); min-height: var(--target-min);
      font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); border-radius: var(--shape-sm); --icon-size: var(--icon-l);
    }
    .check:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .check[aria-disabled="true"] { cursor: default; opacity: var(--state-disabled-content); }
    .check mh-icon { color: var(--c-outline); }
    .check[aria-checked="true"] mh-icon { color: var(--c-primary); }
    .check .grow { flex: 1; min-width: 0; }
    .check small { font-size: inherit; color: var(--c-on-surface-variant); }
  `];

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('open')) this.icons = false;
  }

  private set(patch: TilePatch, typing = false): void {
    this.dispatchEvent(new CustomEvent('set-tile', { detail: typing ? { patch, typing } : { patch }, bubbles: true, composed: true }));
  }

  private setSpec(spec: DeviceTileSpec): void {
    this.set({ spec });
  }

  private emit(type: 'close' | 'remove'): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
  }

  private renderName(tile: TileLayout, deviceName: string) {
    const { t } = this;
    return html`<section><h3>${t('tileSettings.name')}</h3>
      <mh-text-field label=${t('tileSettings.name')} hideLabel icon="edit" .value=${tile.label ?? ''} placeholder=${deviceName} help=${t('tileSettings.nameHelp', { name: deviceName })} maxlength=${LIMITS.nameLength}
        @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.set({ label: e.detail.value === '' ? null : e.detail.value }, true); }}></mh-text-field></section>`;
  }

  private renderIcon(icon: IconName, own: boolean) {
    const { t } = this;
    return html`<section><h3>${t('tileSettings.icon')}</h3><div class="row"><mh-icon name=${icon}></mh-icon>
      <span class="label">${t(own ? 'tileSettings.iconOwn' : 'tileSettings.iconAuto')}<small>${t(own ? 'tileSettings.iconOwnHint' : 'tileSettings.iconAutoHint')}</small></span>
      <mh-button variant="tonal" small @click=${() => { this.icons = true; }}>${t('tileSettings.change')}</mh-button></div></section>`;
  }

  private withValue(title: string, cap: Capability): string {
    const value = joinValue(formatValue(cap, 'tile', this.t));
    return cap.value === null ? title : this.t('tile.join', { a: title, b: value });
  }

  private renderRadios(title: string, options: { id: string; label: string }[], value: string, choose: (id: string) => void) {
    return html`<section><h3>${title}</h3><div class="row stack"><mh-radio-list label=${title} .options=${options} .value=${value}
      @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); choose(e.detail.value); }}></mh-radio-list></div></section>`;
  }

  private renderCells(spec: Extract<DeviceTileSpec, { kind: 'multi' }>, caps: Capability[]) {
    const title = this.t('tileSettings.cells');
    const chosen = spec.capabilityIds;
    const toggle = (id: string): void => this.setSpec({ ...spec, capabilityIds: chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id] });
    return html`<section><h3>${title}</h3><div class="row stack"><div class="checks" role="group" aria-label=${title}>${caps.map((cap) => {
      const at = chosen.indexOf(cap.id);
      // a tile needs at least one value, and three fill it
      const disabled = at === -1 ? chosen.length >= CELLS : chosen.length === 1;
      return html`<button class="check" role="checkbox" aria-checked=${at === -1 ? 'false' : 'true'} aria-disabled=${disabled ? 'true' : nothing} @click=${() => { if (!disabled) toggle(cap.id); }}>
        <mh-icon name=${at === -1 ? 'check_box_outline_blank' : 'check_box'} ?filled=${at !== -1}></mh-icon><span class="grow">${this.withValue(cap.title, cap)}</span>${at === -1 ? nothing : html`<small>${at + 1}</small>`}
      </button>`;
    })}</div></div></section>`;
  }

  /** What the tile shows and controls; only the groups with something to choose. */
  private renderChoices(spec: DeviceTileSpec, choices: TileChoices) {
    const { t } = this;
    const options = (caps: Capability[]) => caps.map((cap) => ({ id: cap.id, label: this.withValue(cap.title, cap) }));
    switch (spec.kind) {
      case 'light': return html`
        ${choices.slider.length > 0 ? this.renderRadios(t('tileSettings.slider'), choices.slider.map((cap) => ({ id: cap.id, label: this.withValue(cap.title, cap) })), spec.dimCapabilityId, (id) => this.setSpec({ ...spec, dimCapabilityId: id })) : nothing}
        ${choices.tap.length > 0 ? this.renderRadios(t('tileSettings.tap'), choices.tap.map((cap) => ({ id: cap.id, label: cap.id === 'onoff' ? t('tileSettings.tapOnoff') : t('tileSettings.tapOther', { title: cap.title }) })), spec.onoffCapabilityId ?? '', (id) => this.setSpec({ ...spec, onoffCapabilityId: id })) : nothing}`;
      case 'sensor': return choices.main.length > 0 ? this.renderRadios(t('tileSettings.main'), options(choices.main), spec.capabilityId, (id) => this.setSpec({ ...spec, capabilityId: id })) : nothing;
      case 'switch': return choices.detail.length > 0 ? this.renderRadios(t('tileSettings.detail'), [...options(choices.detail), { id: NO_DETAIL, label: t('tileSettings.detailNone') }],
        spec.detailCapabilityId ?? NO_DETAIL, (id) => this.setSpec({ ...spec, detailCapabilityId: id === NO_DETAIL ? null : id })) : nothing;
      case 'multi': return choices.cells.length > 0 ? this.renderCells(spec, choices.cells) : nothing;
      default: return nothing;
    }
  }

  private renderSize(tile: TileLayout) {
    const { t } = this;
    const title = t('tileSettings.size');
    const [single, wide] = sizeLabels(tile.spec.kind);
    const body = tileSizes(tile.spec.kind).length < 2 ? html`<p class="help">${t('tileSettings.multiWide')}</p>`
      : html`<mh-choice-group label=${title} .value=${tile.size} .options=${[
        { id: 'single', label: t(single) }, { id: 'wide', label: t(wide) },
      ]} @change=${(e: CustomEvent<{ value: TileSize }>) => { e.stopPropagation(); this.set({ size: e.detail.value }); }}></mh-choice-group>`;
    return html`<section><h3>${title}</h3>${body}</section>`;
  }

  private renderBody(tile: TileLayout, spec: DeviceTileSpec, deviceName: string, automatic: IconName) {
    const { t } = this;
    if (this.icons) {
      return html`<mh-icon-picker .t=${t} .value=${tile.icon} .auto=${automatic}
        @change=${(e: CustomEvent<{ icon: string | null }>) => { e.stopPropagation(); this.set({ icon: e.detail.icon }); }}></mh-icon-picker>`;
    }
    const own = tile.icon !== null && isLibraryIcon(tile.icon) ? tile.icon : null;
    return html`${this.renderName(tile, deviceName)}${this.renderIcon(own ?? automatic, own !== null)}
      ${this.device ? this.renderChoices(spec, tileChoices(spec, this.device)) : nothing}
      ${spec.kind === 'sensor' ? html`<section><h3>${t('chart.history')}</h3><div class="row"><span class="grow">${t('tileSettings.trend')}</span>
        <mh-switch label=${t('tileSettings.trend')} .checked=${spec.trend === true}
          @change=${(e: CustomEvent<{ checked: boolean }>) => { e.stopPropagation(); this.setSpec({ ...spec, trend: e.detail.checked }); }}></mh-switch></div></section>` : nothing}
      ${this.renderSize(tile)}
      <section><mh-button variant="danger" @click=${() => this.emit('remove')}><mh-icon name="delete"></mh-icon>${t('tileSettings.remove')}</mh-button></section>`;
  }

  override render() {
    const { t, tile } = this;
    const spec = tile && isDeviceTile(tile.spec) ? tile.spec : null;
    const deviceName = this.device?.name.trim() || t('tile.unnamed');
    const automatic: IconName = spec ? iconFor(spec, this.device) : 'category';
    const name = tile?.label ?? deviceName;
    const own = tile?.icon && isLibraryIcon(tile.icon) ? tile.icon : automatic;
    return html`<mh-sheet .t=${t} ?open=${this.open} .back=${this.icons} icon=${own}
        heading=${this.icons ? t('tileSettings.iconTitle') : name} subheading=${this.icons ? name : t('tileSettings.subtitle', { section: this.sectionName })}
        @back=${(e: Event) => { e.stopPropagation(); this.icons = false; }}
        @close=${(e: Event) => { e.stopPropagation(); this.emit('close'); }}>
      ${this.open && tile && spec ? this.renderBody(tile, spec, deviceName, automatic) : nothing}
    </mh-sheet>`;
  }
}

if (!customElements.get('mh-tile-panel')) customElements.define('mh-tile-panel', MhTilePanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-tile-panel': MhTilePanel }
}
