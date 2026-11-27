import { LitElement, css, html, nothing } from 'lit';
import type { Grouping } from '../../dashboard/types';
import type { Feature } from '../../homey/permissions';
import { t as dutch, type Language, type Translate } from '../../i18n';
import type { DashboardStatus } from '../app/context';
import type { IconName } from '../icons/icons';
import { defaultWall, type WallSettings } from '../../wall/settings';
import { sharedStyles } from '../parts/shared-styles';
import { panelStyles, resultListStyles } from './panel-styles';
import './sync-section';
import type { AwayState } from './sync-section';
import '../parts/button';
import '../parts/choice-group';
import '../parts/dialog';
import '../parts/icon';
import '../parts/radio-list';
import '../parts/sheet';
import '../parts/switch';

/** A layout of any size we allow stays far below this; a bigger file is not read at all. */
const MAX_FILE_BYTES = 5_000_000;

const RIGHTS: { feature: Feature; label: 'settings.rights.view' | 'settings.rights.control' | 'settings.rights.flows'; missing: 'settings.rights.viewMissing' | 'settings.rights.controlMissing' | 'settings.rights.flowsMissing' }[] = [
  { feature: 'readDevices', label: 'settings.rights.view', missing: 'settings.rights.viewMissing' },
  { feature: 'controlDevices', label: 'settings.rights.control', missing: 'settings.rights.controlMissing' },
  { feature: 'startFlows', label: 'settings.rights.flows', missing: 'settings.rights.flowsMissing' },
];

/**
 * The settings: how the dashboard is connected, what the key may do, the layout (save it as a
 * file: `export`, load one: `import` { name, text }, the Overzicht back to automatic: `reset`), the versions, and
 * "Verbinding verbreken", which asks first (`disconnect` only after the confirmation). The example hub has
 * its own settings with the way to connect your own hub (`leave-demo`).
 */
export class MhSettingsPanel extends LitElement {
  static override properties = {
    t: { attribute: false },
    language: { attribute: false },
    open: { type: Boolean },
    status: { attribute: false },
    missing: { attribute: false },
    softwareVersion: { attribute: false },
    appVersion: { type: String },
    confirming: { state: true },
    boards: { attribute: false },
    startBoard: { attribute: false },
    wall: { attribute: false },
    phone: { type: Boolean },
    hasRooms: { type: Boolean },
    grouping: { type: String },
    roomsShown: { type: Boolean },
    overviewAutomatic: { type: Boolean },
    away: { attribute: false },
    pairAway: { attribute: false },
  };

  /** The texts, in the language of the app; Dutch until the app sets it. */

  declare t: Translate;
  /** The Overzicht is not an own layout: there is nothing to reset. */
  declare overviewAutomatic: boolean;
  /** A page with a key: where it stands with the app on its hub; null where that does not count. */
  declare away: AwayState | null;
  declare pairAway: ((code: string, name: string) => Promise<string>) | null;
  /** The dashboards, for the one this device starts with (null: the first). */
  declare boards: { id: string; name: string }[];
  declare startBoard: string | null;
  /** What is set up on this device for a wall tablet; a phone is none. */
  declare wall: WallSettings;
  declare phone: boolean;
  /** The saved language choice; null is automatic. */
  declare language: Language | null;

  /** There are rooms to speak of. */
  declare hasRooms: boolean;
  declare grouping: Grouping;
  declare roomsShown: boolean;
  declare open: boolean;
  declare status: DashboardStatus;
  declare missing: Feature[];
  declare softwareVersion: string | null;
  declare appVersion: string;
  declare confirming: boolean;

  constructor() {
    super();
    this.t = dutch;
    this.away = null;
    this.pairAway = null;
    this.language = null;
    this.open = false;
    this.status = { route: null, canControl: true, canStartFlows: true, demo: false };
    this.missing = [];
    this.softwareVersion = null;
    this.appVersion = '';
    this.confirming = false;
    this.overviewAutomatic = false;
    this.hasRooms = false;
    this.grouping = 'type';
    this.roomsShown = true;
    this.boards = [];
    this.startBoard = null;
    this.wall = defaultWall();
    this.phone = false;
  }

  static override styles = [sharedStyles, panelStyles, resultListStyles, css`
    .row > mh-icon { color: var(--c-on-surface-variant); --icon-size: var(--icon-l); }
    .help { margin: var(--space-4) 0 0 var(--space-16); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
  `];

  /** The dashboard this device starts with; nothing to choose with one, nor on the example hub. */
  private renderStartBoard() {
    if (this.boards.length < 2 || this.status.demo) return nothing;
    const { t } = this;
    const value = this.boards.some((board) => board.id === this.startBoard) ? this.startBoard : this.boards[0]!.id;
    return html`<section><h3>${t('settings.startBoard')}</h3>
      <div class="row stack"><mh-radio-list label=${t('settings.startBoard')} .options=${this.boards.map((board) => ({ id: board.id, label: board.name }))} .value=${value}
        @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.dispatchEvent(new CustomEvent('start-board', { detail: { id: e.detail.value }, bubbles: true, composed: true })); }}></mh-radio-list></div>
      <p class="help">${t('settings.startBoardHelp')}</p></section>`;
  }

  /** Whether this device is a wall tablet. */
  private renderDevice() {
    if (this.phone) return nothing;
    const { t, wall } = this;
    const summary = !wall.on ? t('settings.wallOff') : wall.after === 1 ? t('settings.wallOne') : t('settings.wallAfter', { n: wall.after });
    return html`<section><h3>${t('settings.device')}</h3><div class="rows"><div class="row"><mh-icon name="tablet"></mh-icon><span class="label">${t('settings.wall')}<small>${summary}</small></span>
      <mh-button variant="tonal" small @click=${() => this.emit('open-wall')}>${t('settings.wallAction')}</mh-button></div></div></section>`;
  }

  private emit(type: 'disconnect' | 'leave-demo' | 'close' | 'export' | 'reset' | 'import' | 'open-wall', detail?: { name: string; text: string }): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private renderConnection() {
    if (this.status.demo) {
      return html`<section><h3>${this.t('settings.connection')}</h3><div class="rows">
        <div class="row"><mh-icon name="science"></mh-icon><span class="label">${this.t('settings.demo')}<small>${this.t('settings.demoHelp')}</small></span></div>
        <mh-button block @click=${() => this.emit('leave-demo')}>${this.t('settings.connectOwn')}</mh-button>
      </div></section>`;
    }
    const { t } = this;
    if (this.status.served) {
      const away = this.status.route === null;
      return html`<section><h3>${t('settings.connection')}</h3><div class="rows">
        <div class="row"><mh-icon name=${away ? 'cloud_off' : 'home'}></mh-icon><span class="label">${t(away ? 'settings.none' : 'settings.served')}<small>${t(this.status.canArrange === false ? 'settings.servedUse' : 'settings.servedEdit')}</small></span></div>
      </div></section>`;
    }
    const route = this.status.route;
    const [icon, label] = route === 'local' ? ['home', this.t('settings.local')] as const
      : route === 'cloud' ? ['cloud', this.t('settings.cloud')] as const : ['cloud_off', this.t('settings.none')] as const;
    return html`<section><h3>${this.t('settings.connection')}</h3><div class="rows">
      <div class="row"><mh-icon name=${icon}></mh-icon><span class="label">${label}<small>${this.t('settings.routeHelp')}</small></span></div>
    </div></section>`;
  }

  private renderRights() {
    if (this.status.demo || this.status.served) return nothing;
    return html`<section><h3>${this.t('settings.rights')}</h3><ul class="results">${RIGHTS.map((right) => {
      const missing = this.missing.includes(right.feature);
      return html`<li class=${missing ? 'missing' : ''}><mh-icon name=${missing ? 'cancel' : 'check_circle'} filled></mh-icon>
        <div><b>${this.t(right.label)}</b>${missing ? this.t(right.missing) : nothing}</div></li>`;
    })}</ul></section>`;
  }

  /** Automatic, Dutch or English; the two names always in their own language. */
  private renderLanguage() {
    const options = [
      { id: 'auto', label: this.t('settings.language.auto') },
      { id: 'nl', label: this.t('settings.language.nl'), lang: 'nl' },
      { id: 'en', label: this.t('settings.language.en'), lang: 'en' },
    ];
    const change = (e: CustomEvent<{ value: string }>) => {
      e.stopPropagation();
      const choice = e.detail.value === 'nl' || e.detail.value === 'en' ? e.detail.value : null;
      this.dispatchEvent(new CustomEvent('language', { detail: { choice }, bubbles: true, composed: true }));
    };
    return html`<section><h3>${this.t('settings.language')}</h3>
      <mh-choice-group label=${this.t('settings.language')} .options=${options} .value=${this.language ?? 'auto'} @change=${change}></mh-choice-group>
      <p class="help">${this.t('settings.language.help')}</p></section>`;
  }

  /** Reads the chosen file; one that cannot be read, or is far too big, is reported without its text. */
  private onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const report = (text: string): void => this.emit('import', { name: file.name, text });
    if (file.size > MAX_FILE_BYTES) {
      report('');
    } else {
      const reader = new FileReader();
      reader.onload = () => report(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => report('');
      reader.readAsText(file);
    }
    // the same file can be chosen again
    input.value = '';
  }

  private layoutRow(icon: IconName, label: string, text: string, action: string, act: () => void, disabled = false) {
    return html`<div class="row"><mh-icon name=${icon}></mh-icon><span class="label">${label}<small>${text}</small></span>
      <mh-button variant="tonal" small ?disabled=${disabled} @click=${act}>${action}</mh-button></div>`;
  }

  /** The Overzicht per kind or per room, and the screen with the rooms; for every device on this hub. */
  private renderRooms() {
    const { t } = this;
    if (!this.hasRooms || this.status.canArrange === false) return nothing;
    const send = (type: 'grouping' | 'rooms-shown', detail: unknown) => (e: Event) => { e.stopPropagation(); this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })); };
    return html`<div class="row stack"><span class="label">${t('settings.grouping')}<small>${t(this.overviewAutomatic ? 'settings.groupingHelp' : 'settings.groupingOwn')}</small></span>
        <mh-choice-group label=${t('settings.grouping')} .options=${[{ id: 'type', label: t('settings.perKind') }, { id: 'zone', label: t('settings.perRoom') }]} .value=${this.grouping} ?disabled=${!this.overviewAutomatic}
          @change=${(e: CustomEvent<{ value: Grouping }>) => send('grouping', { grouping: e.detail.value })(e)}></mh-choice-group></div>
      <div class="row"><mh-icon name="meeting_room"></mh-icon><span class="label">${t('settings.rooms')}<small>${t('settings.roomsHelp')}</small></span>
        <mh-switch label=${t('settings.roomsSwitch')} .checked=${this.roomsShown} @change=${(e: CustomEvent<{ checked: boolean }>) => send('rooms-shown', { shown: e.detail.checked })(e)}></mh-switch></div>`;
  }

  private renderLayout() {
    const { t } = this;
    const choose = () => this.shadowRoot?.querySelector<HTMLInputElement>('input[type="file"]')?.click();
    return html`<section><h3>${t('settings.layout')}</h3><div class="rows">
      ${this.renderRooms()}
      ${this.layoutRow('download', t('settings.export'), t('settings.exportText'), t('settings.exportAction'), () => this.emit('export'))}
      ${this.status.canArrange === false ? nothing : html`${this.layoutRow('upload', t('settings.import'), t('settings.importText'), t('settings.importAction'), choose)}
      ${this.layoutRow('restart_alt', t('settings.reset'), t(this.overviewAutomatic ? 'settings.resetAuto' : 'settings.resetText'), t('settings.resetAction'), () => this.emit('reset'), this.overviewAutomatic)}`}
    </div><input type="file" accept=".json,application/json" hidden tabindex="-1" aria-hidden="true" @change=${(e: Event) => { e.stopPropagation(); this.onFile(e); }}></section>`;
  }

  override render() {
    return html`<mh-sheet .t=${this.t} ?open=${this.open} heading=${this.t('settings.title')} subheading=${this.t('settings.subtitle')} icon="settings"
      @close=${(e: Event) => { e.stopPropagation(); this.emit('close'); }}>
      ${this.renderConnection()}
      ${this.away && !this.status.demo && !this.status.served ? html`<mh-sync-section .t=${this.t} .away=${this.away} .pairAway=${this.pairAway}></mh-sync-section>` : nothing}
      ${this.renderRights()}
      ${this.renderLanguage()}
      ${this.renderStartBoard()}
      ${this.renderLayout()}
      ${this.renderDevice()}
      <section><h3>${this.t('settings.about')}</h3><div class="values">
        ${this.softwareVersion ? html`<div class="cell"><span>${this.t('settings.software')}</span><b>${this.softwareVersion}</b></div>` : nothing}
        <div class="cell"><span>${this.t('settings.version')}</span><b>${this.appVersion}</b></div>
      </div></section>
      ${this.status.demo ? nothing : html`<section>
        <mh-button variant="danger" @click=${() => { this.confirming = true; }}><mh-icon name="logout"></mh-icon>${this.t(this.status.served ? 'settings.unpair' : 'settings.disconnect')}</mh-button>
        <p class="help">${this.t(this.status.served ? 'settings.unpairHelp' : 'settings.disconnectHelp')}</p>
      </section>`}
    </mh-sheet>
    <mh-dialog ?open=${this.confirming} heading=${this.t(this.status.served ? 'settings.unpairConfirm.title' : 'settings.confirm.title')} @cancel=${() => { this.confirming = false; }}>${this.t(this.status.served ? 'settings.unpairConfirm.text' : 'settings.confirm.text')}
      <mh-button slot="actions" variant="text" data-autofocus @click=${() => { this.confirming = false; }}>${this.t('settings.confirm.cancel')}</mh-button>
      <mh-button slot="actions" @click=${() => { this.confirming = false; this.emit('disconnect'); }}>${this.t(this.status.served ? 'settings.unpairConfirm.ok' : 'settings.confirm.ok')}</mh-button>
    </mh-dialog>`;
  }
}

if (!customElements.get('mh-settings-panel')) customElements.define('mh-settings-panel', MhSettingsPanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-settings-panel': MhSettingsPanel }
}
