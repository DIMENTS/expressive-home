import { LitElement, css, html, nothing, type TemplateResult } from 'lit';
import type { TileSize, WidgetSettingValue, WidgetTileSpec } from '../../dashboard/types';
import { t as dutch, type Translate } from '../../i18n';
import type { TileLayout } from '../../layout/types';
import { widgetIcon, widgetName } from '../../widgets/catalog';
import { settingValue, type SettingDef } from '../../widgets/settings';
import { WIDGET_LIMITS } from '../../widgets/widget-ref';
import { groupIds } from '../../widgets/more';
import { choiceName } from '../../widgets/app-widget-link';

/** How long typing must pause before a search list is asked. */
const SEARCH_PAUSE_MS = 300;
import type { BoardChoice } from '../app/context';
import { sharedStyles } from '../parts/shared-styles';
import { panelStyles } from './panel-styles';
import '../parts/button';
import '../parts/choice-group';
import '../parts/icon';
import '../parts/radio-list';
import '../parts/sheet';
import '../parts/switch';
import '../parts/text-field';

/** A choice of a device, a value of one, or a flow, for the settings of an own widget. */
export interface PickOption { id: string; title: string }

/** Where the window finds what can be chosen. */
export interface WidgetPicks {
  boards: BoardChoice[];
  devices: PickOption[];
  /** The devices that can be switched on and off: for a group. */
  switchable: PickOption[];
  capabilities(deviceId: string): PickOption[];
  flows: PickOption[];
  /** The choices of a setting with a search list of the widget's app, for what was typed. */
  search?(settingId: string, query: string): Promise<{ name: string; description?: string; value: string }[]>;
}

const NONE = '';

/**
 * "Widget instellen": the widget's own settings, as it describes them, its size, and removing it. Every change is
 * reported at once as `set-tile` { patch, typing }, like the window of a tile.
 */
export class MhWidgetPanel extends LitElement {
  static override properties = {
    open: { type: Boolean },
    tile: { attribute: false },
    settings: { attribute: false },
    picks: { attribute: false },
    sizes: { attribute: false },
    sectionName: { type: String },
    widgetTitle: { type: String },
    t: { attribute: false },
    found: { state: true },
  };

  /** What a search list gave for what was typed, per setting. */
  declare found: Record<string, { name: string; description?: string; value: string }[]>;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  declare open: boolean;
  declare tile: TileLayout | null;
  /** What the widget lets the owner set. */
  declare settings: SettingDef[];
  declare picks: WidgetPicks;
  declare sizes: readonly TileSize[];
  declare sectionName: string;
  /** The name of an own widget; empty for one of the app. */
  declare widgetTitle: string;
  declare t: Translate;

  constructor() {
    super();
    this.open = false;
    this.tile = null;
    this.settings = [];
    this.picks = { boards: [], devices: [], switchable: [], capabilities: () => [], flows: [] };
    this.sizes = ['single', 'wide'];
    this.sectionName = '';
    this.widgetTitle = '';
    this.t = dutch;
    this.found = {};
  }

  static override styles = [sharedStyles, panelStyles, css`
    .fields { display: grid; gap: var(--space-16); }
    .checks { display: grid; }
    .check {
      all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: var(--space-12); min-height: var(--target-min);
      font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); border-radius: var(--shape-sm); --icon-size: var(--icon-l);
    }
    .check:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .check mh-icon { color: var(--c-outline); }
    .check[aria-checked="true"] mh-icon { color: var(--c-primary); }
    .date { box-sizing: border-box; width: 100%; min-height: var(--field-height); padding: 0 var(--space-16); border: 0; border-radius: var(--field-radius);
      background: var(--field-bg); color: var(--field-fg); font: inherit; font-size: var(--type-body-l-size); }
    .date:focus-visible { outline: var(--field-outline-width) solid var(--field-focus); outline-offset: 0; }
    .help { margin: 0 0 0 var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
  `];

  private get spec(): WidgetTileSpec | null {
    return this.tile?.spec.kind === 'widget' ? this.tile.spec : null;
  }

  private emit(type: 'close' | 'remove'): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
  }

  private setValue(id: string, value: WidgetSettingValue, typing = false): void {
    const spec = this.spec;
    if (!spec) return;
    const patch = { spec: { ...spec, settings: { ...spec.settings, [id]: value } } };
    this.dispatchEvent(new CustomEvent('set-tile', { detail: typing ? { patch, typing } : { patch }, bubbles: true, composed: true }));
  }

  private renderChoice(def: SettingDef, options: PickOption[], value: WidgetSettingValue): TemplateResult {
    const { t } = this;
    if (options.length === 0) return html`<section><h3>${def.title}</h3><p class="help">${t('widget.setting.none')}</p></section>`;
    return html`<section><h3>${def.title}</h3><div class="row stack"><mh-radio-list label=${def.title} .value=${typeof value === 'string' ? value : NONE}
      .options=${options.map((option) => ({ id: option.id, label: option.title }))}
      @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.setValue(def.id, e.detail.value); }}></mh-radio-list></div></section>`;
  }

  /** A search list of the widget's app: what is chosen now, a field to search, and what it found. */
  private renderSearch(def: SettingDef, value: WidgetSettingValue): TemplateResult {
    const { t } = this;
    const chosen = choiceName(value);
    const results = this.found[def.id] ?? [];
    const search = (query: string): void => {
      if (this.searchTimer !== null) clearTimeout(this.searchTimer);
      // asked when typing pauses, not at every letter
      this.searchTimer = setTimeout(() => {
        void this.picks.search?.(def.id, query).then((list) => { this.found = { ...this.found, [def.id]: list }; });
      }, SEARCH_PAUSE_MS);
    };
    return html`<section><h3>${def.title}</h3>
      <p class="help">${chosen ? t('widget.setting.chosen', { name: chosen }) : t('widget.setting.none')}</p>
      <mh-text-field label=${t('widget.setting.search', { name: def.title })} icon="search" type="search"
        @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); search(e.detail.value); }}></mh-text-field>
      ${results.length === 0 ? nothing : html`<div class="checks" role="list">${results.map((item) => html`<button class="check" data-choice role="listitem"
        @click=${() => { this.setValue(def.id, item.value); this.found = { ...this.found, [def.id]: [] }; }}>
        <mh-icon name=${choiceName(value) === item.name ? 'radio_button_checked' : 'radio_button_unchecked'}></mh-icon>
        <span>${item.name}${item.description ? html`<small class="help"> · ${item.description}</small>` : nothing}</span></button>`)}</div>`}
    </section>`;
  }

  /** More devices at once: a list with ticks, kept as ids with commas between. */
  private renderChecks(def: SettingDef, value: WidgetSettingValue, options: PickOption[]): TemplateResult {
    const chosen = groupIds(value);
    if (options.length === 0) return html`<section><h3>${def.title}</h3><p class="help">${this.t('widget.setting.none')}</p></section>`;
    const toggle = (id: string): void => this.setValue(def.id, (chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]).join(','));
    return html`<section><h3>${def.title}</h3><div class="row stack"><div class="checks" role="group" aria-label=${def.title}>${options.map((option) => {
      const on = chosen.includes(option.id);
      return html`<button class="check" role="checkbox" aria-checked=${on ? 'true' : 'false'} @click=${() => toggle(option.id)}>
        <mh-icon name=${on ? 'check_box' : 'check_box_outline_blank'} ?filled=${on}></mh-icon><span>${option.title}</span></button>`;
    })}</div></div></section>`;
  }

  private renderSetting(spec: WidgetTileSpec, def: SettingDef): TemplateResult {
    const value = settingValue(spec, def);
    switch (def.type) {
      case 'checkbox': return html`<div class="row"><span class="label">${def.title}</span><mh-switch label=${def.title} ?checked=${value === true}
        @change=${(e: CustomEvent<{ checked: boolean }>) => { e.stopPropagation(); this.setValue(def.id, e.detail.checked); }}></mh-switch></div>`;
      case 'text': case 'textarea': return html`<mh-text-field label=${def.title} .value=${typeof value === 'string' ? value : ''} ?multiline=${def.type === 'textarea'}
        maxlength=${WIDGET_LIMITS.text} @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.setValue(def.id, e.detail.value, true); }}></mh-text-field>`;
      case 'number': return html`<mh-text-field label=${def.title} .value=${typeof value === 'number' ? String(value) : ''}
        @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); const n = Number(e.detail.value.replace(',', '.')); if (e.detail.value.trim() !== '' && Number.isFinite(n)) this.setValue(def.id, n, true); }}></mh-text-field>`;
      case 'dropdown': return this.renderChoice(def, def.values ?? [], value);
      case 'board': return this.renderChoice(def, this.picks.boards.map((b) => ({ id: b.id, title: b.name })), value);
      case 'device': return this.renderChoice(def, this.picks.devices, value);
      case 'flow': return this.renderChoice(def, this.picks.flows, value);
      case 'capability': {
        const device = def.device ? spec.settings[def.device] : null;
        return this.renderChoice(def, typeof device === 'string' ? this.picks.capabilities(device) : [], value);
      }
      case 'devices': return this.renderChecks(def, value, this.picks.switchable);
      case 'anyDevices': return this.renderChecks(def, value, this.picks.devices);
      case 'autocomplete': return this.renderSearch(def, value);
      case 'date': return html`<section><h3>${def.title}</h3><input class="date" type="date" aria-label=${def.title} .value=${typeof value === 'string' ? value : ''}
        @change=${(e: Event) => { e.stopPropagation(); this.setValue(def.id, (e.target as HTMLInputElement).value || null); }}></section>`;
    }
  }

  private renderSize(tile: TileLayout): TemplateResult | typeof nothing {
    const { t } = this;
    if (this.sizes.length < 2) return nothing;
    const title = t('tileSettings.size');
    return html`<section><h3>${title}</h3><mh-choice-group label=${title} .value=${tile.size} .options=${[
      { id: 'single', label: t('edit.tile.single') }, { id: 'wide', label: t('edit.tile.wide') },
    ]} @change=${(e: CustomEvent<{ value: TileSize }>) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent('set-tile', { detail: { patch: { size: e.detail.value } }, bubbles: true, composed: true }));
    }}></mh-choice-group></section>`;
  }

  private renderBody(tile: TileLayout, spec: WidgetTileSpec): TemplateResult {
    const { t } = this;
    return html`<div class="fields">
      ${this.settings.length === 0 ? html`<p class="help">${t('widgetPanel.noSettings')}</p>` : this.settings.map((def) => this.renderSetting(spec, def))}
      ${this.renderSize(tile)}
      <section><mh-button variant="danger" @click=${() => this.emit('remove')}><mh-icon name="delete"></mh-icon>${t('widgetPanel.remove')}</mh-button></section>
    </div>`;
  }

  override render() {
    const { t } = this;
    const spec = this.spec;
    const name = spec ? widgetName(spec, t, () => this.widgetTitle || undefined) : '';
    return html`<mh-sheet .t=${t} ?open=${this.open} icon=${spec ? widgetIcon(spec) : 'widgets'} heading=${name} subheading=${t('widgetPanel.subtitle', { section: this.sectionName })}
        @close=${(e: Event) => { e.stopPropagation(); this.emit('close'); }}>
      ${this.open && this.tile && spec ? this.renderBody(this.tile, spec) : nothing}
    </mh-sheet>`;
  }
}

if (!customElements.get('mh-widget-panel')) customElements.define('mh-widget-panel', MhWidgetPanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-widget-panel': MhWidgetPanel }
}
