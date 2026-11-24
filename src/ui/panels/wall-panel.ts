import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import type { CapRef } from '../../dashboard/types';
import { t as dutch, type Translate } from '../../i18n';
import { REST_AFTER, defaultWall, emptyWallHub, type RestAfter, type TankWatch, type WallHub, type WallSettings } from '../../wall/settings';
import type { IconName } from '../icons/icons';
import type { TemperatureSource } from '../model/rest-view';
import { sharedStyles } from '../parts/shared-styles';
import { panelStyles } from './panel-styles';
import '../parts/button';
import '../parts/choice-group';
import '../parts/icon';
import '../parts/radio-list';
import '../parts/sheet';
import '../parts/switch';
import '../parts/time-field';

const NONE = 'none';
const idOf = (ref: CapRef): string => `${ref.deviceId}/${ref.capabilityId}`;

/**
 * The panel of the wall tablet: whether a rest screen comes and after how long, the night, the two
 * temperatures, and what needs attention. Every choice is reported at once (`change`, with { wall } for what belongs to
 * this device or { hub } for what belongs to its hub); `preview` with { look } asks to have a look.
 */
export class MhWallPanel extends LitElement {
  static override properties = {
    t: { attribute: false },
    open: { type: Boolean },
    wall: { attribute: false },
    hub: { attribute: false },
    sources: { attribute: false },
    tanks: { attribute: false },
    hasBattery: { type: Boolean },
    served: { type: Boolean },
    canPreview: { attribute: false },
    choosing: { state: true },
  };

  /** The texts, in the language of the app; Dutch until the app sets it. */
  declare t: Translate;
  declare open: boolean;
  declare wall: WallSettings;
  declare hub: WallHub;
  /** What can be a temperature. */
  declare sources: TemperatureSource[];
  declare tanks: { id: string; name: string }[];
  declare hasBattery: boolean;
  /** The app on the hub served the page: it has the flow cards of the night. */
  declare served: boolean;
  /** Whether there is something to look at: not while the dashboard is being arranged. */
  declare canPreview: boolean;
  /** The temperature whose list is open. */
  declare choosing: 'inside' | 'outside' | null;

  constructor() {
    super();
    this.t = dutch;
    this.open = false;
    this.wall = defaultWall();
    this.hub = emptyWallHub();
    this.sources = [];
    this.tanks = [];
    this.hasBattery = false;
    this.served = false;
    this.canPreview = true;
    this.choosing = null;
  }

  static override styles = [sharedStyles, panelStyles, css`
    .row > mh-icon { color: var(--c-on-surface-variant); --icon-size: var(--icon-l); }
    .help { margin: var(--space-4) 0 0 var(--space-16); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    .times { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-8); }
    .times mh-time-field { flex: 1; }
  `];

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('open') && !this.open) this.choosing = null;
  }

  private emit(type: 'change' | 'preview' | 'close', detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private setWall(change: Partial<WallSettings>): void {
    this.emit('change', { wall: { ...this.wall, ...change } });
  }

  private setHub(change: Partial<WallHub>): void {
    this.emit('change', { hub: { ...this.hub, ...change } });
  }

  private switchRow(icon: IconName, label: string, help: string, checked: boolean, change: (on: boolean) => void) {
    return html`<div class="row"><mh-icon name=${icon}></mh-icon><span class="label">${label}<small>${help}</small></span>
      <mh-switch label=${label} ?checked=${checked} @change=${(e: CustomEvent<{ checked: boolean }>) => { e.stopPropagation(); change(e.detail.checked); }}></mh-switch></div>`;
  }

  private viewRow(look: 'day' | 'night', name: string) {
    const { t } = this;
    if (!this.canPreview) return nothing;
    return html`<div class="row"><mh-icon name="visibility"></mh-icon><span class="label">${t('wall.looks')}</span>
      <mh-button variant="tonal" small label=${t('wall.viewOf', { name })} @click=${() => this.emit('preview', { look })}>${t('wall.view')}</mh-button></div>`;
  }

  private renderRest() {
    const { t, wall } = this;
    return html`<section><h3>${t('wall.rest')}</h3><div class="rows">
      ${this.switchRow('bedtime', t('wall.show'), t('wall.showHelp'), wall.on, (on) => this.setWall({ on }))}
      ${wall.on ? html`<div class="row stack"><span class="label">${t('wall.after')}</span>
        <mh-choice-group label=${t('wall.after')} .options=${REST_AFTER.map((n) => ({ id: String(n), label: t('wall.minutes', { n }) }))} .value=${String(wall.after)}
          @change=${(e: CustomEvent<{ value: string }>) => {
            e.stopPropagation();
            const after = Number(e.detail.value) as RestAfter;
            if (REST_AFTER.includes(after)) this.setWall({ after });
          }}></mh-choice-group></div>${this.viewRow('day', t('wall.rest'))}` : nothing}
    </div>${wall.on ? html`<p class="help">${t('wall.keepOn')}</p>` : nothing}</section>`;
  }

  private renderNight() {
    const { t, wall } = this;
    const { night } = wall;
    const time = (which: 'from' | 'to') => html`<div class="row"><mh-time-field label=${t(which === 'from' ? 'wall.from' : 'wall.to')} .value=${night[which]}
      @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.setWall({ night: { ...night, [which]: e.detail.value } }); }}></mh-time-field></div>`;
    return html`<section><h3>${t('wall.night')}</h3><div class="rows">
      ${this.switchRow('dark_mode', t('wall.night'), t('wall.nightHelp'), night.on, (on) => this.setWall({ night: { ...night, on } }))}
      ${night.on ? html`<div class="times">${time('from')}${time('to')}</div>${this.viewRow('night', t('wall.night'))}` : nothing}
    </div>${night.on && this.served ? html`<p class="help">${t('wall.flow')}</p>` : nothing}</section>`;
  }

  private temperatureRow(which: 'inside' | 'outside', icon: IconName) {
    const { t } = this;
    const label = t(which === 'inside' ? 'wall.inside' : 'wall.outside');
    const ref = this.hub[which];
    const chosen = ref ? this.sources.find((source) => idOf(source.ref) === idOf(ref)) : undefined;
    const open = this.choosing === which;
    const options = [{ id: NONE, label: t('wall.none') }, ...this.sources.map((source) => ({ id: idOf(source.ref), label: source.zone ? `${source.name} · ${source.zone}` : source.name }))];
    return html`<div class="row"><mh-icon name=${icon}></mh-icon><span class="label">${label}<small>${chosen?.name ?? t('wall.none')}</small></span>
        <mh-button variant="tonal" small label=${t('wall.chooseOf', { name: label })} expanded=${String(open)} @click=${() => { this.choosing = open ? null : which; }}>${t('wall.choose')}</mh-button></div>
      ${open ? html`<div class="row stack"><mh-radio-list label=${label} .options=${options} .value=${chosen ? idOf(chosen.ref) : NONE}
        @change=${(e: CustomEvent<{ value: string }>) => {
          e.stopPropagation();
          const source = this.sources.find((s) => idOf(s.ref) === e.detail.value);
          if (source || e.detail.value === NONE) this.setHub({ [which]: source?.ref ?? null });
        }}></mh-radio-list></div>` : nothing}`;
  }

  private renderTemperatures() {
    if (this.sources.length === 0) return nothing;
    return html`<section><h3>${this.t('wall.temperature')}</h3><div class="rows">${this.temperatureRow('inside', 'home')}${this.temperatureRow('outside', 'park')}</div></section>`;
  }

  private tankRow(tank: { id: string; name: string }) {
    const { t } = this;
    const { [tank.id]: watch, ...others } = this.hub.tanks;
    const options = [{ id: 'off', label: t('wall.tankOff') }, { id: 'low', label: t('wall.tankLow') }, { id: 'high', label: t('wall.tankHigh') }];
    return html`<div class="row stack"><span class="label">${tank.name}</span>
      <mh-choice-group label=${tank.name} .options=${options} .value=${watch ?? 'off'}
        @change=${(e: CustomEvent<{ value: string }>) => {
          e.stopPropagation();
          const { value } = e.detail;
          if (value === 'off') this.setHub({ tanks: others });
          else if (value === 'low' || value === 'high') this.setHub({ tanks: { ...others, [tank.id]: value satisfies TankWatch } });
        }}></mh-choice-group></div>`;
  }

  private renderAttention() {
    const { t, wall, tanks } = this;
    if (!this.hasBattery && tanks.length === 0) return nothing;
    return html`<section><h3>${t('wall.attention')}</h3><div class="rows">
      ${this.hasBattery ? this.switchRow('battery_alert', t('wall.battery'), t('wall.batteryHelp'), wall.lowBattery, (lowBattery) => this.setWall({ lowBattery })) : nothing}
      ${tanks.map((tank) => this.tankRow(tank))}
    </div><p class="help">${tanks.length > 0 ? `${t('wall.tankHelp')} ` : ''}${t('wall.alarmsHelp')}</p></section>`;
  }

  override render() {
    const { t, wall } = this;
    return html`<mh-sheet .t=${t} ?open=${this.open} heading=${t('settings.wall')} subheading=${t('wall.subtitle')} icon="tablet"
      @close=${(e: Event) => { e.stopPropagation(); this.emit('close'); }}>
      ${this.renderRest()}${wall.on ? html`${this.renderNight()}${this.renderTemperatures()}${this.renderAttention()}` : nothing}
    </mh-sheet>`;
  }
}

if (!customElements.get('mh-wall-panel')) customElements.define('mh-wall-panel', MhWallPanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-wall-panel': MhWallPanel }
}
