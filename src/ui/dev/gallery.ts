// The gallery (galerij.html): every part in every variant, side by side.
// Only for development; it is not an entry of the build. Each task adds its parts to SECTIONS.
import { LitElement, css, html, type TemplateResult } from 'lit';
import { applyThemeTo } from '../apply-theme';
import { adoptPageStyles } from '../page-styles';
import { darkMedia, watchSystemDark } from '../../theme/system-mode';
import { rustigExpressive } from '../../theme/rustig-expressive';
import type { Density, ThemeSettings } from '../../theme/types';
import type { UiContext } from '../app/context';
import { TILE_GRID_WIDE_MIN_PX } from '../breakpoints';
import { createTile } from '../tiles/registry';
import '../tiles/index';
import { GALLERY_TILES, contextFor, galleryContext } from './gallery-hub';
import camperRaw from '../../mock/fixtures/camper.raw.json';
import { toSnapshot } from '../../homey/map';
import type { RawHomey } from '../../homey/types';
import { generateDashboard } from '../../dashboard/generate';
import { pickHero } from '../../dashboard/hero';
import { boardFromDashboard } from '../../layout/board';
import '../screens/dashboard-screen';
import '../screens/connect-screen';
import type { IconName } from '../icons/icons';
import '../fonts';
import '../parts/icon';
import '../parts/button';
import '../parts/switch';
import '../parts/choice-group';
import '../parts/radio-list';
import '../parts/text-field';
import '../parts/chip';
import '../parts/note';
import '../parts/loader';
import '../parts/empty-state';
import '../parts/sheet';
import '../parts/time-field';
import '../screens/rest-screen';
import '../parts/dialog';
import '../parts/snackbar';
import '../parts/banner';
import '../parts/slider';
import '../parts/menu';
import '../parts/icon-picker';
import type { MhSnackbar } from '../parts/snackbar';
import { richText } from '../parts/rich-text';
import { t } from '../../i18n';

/** What a section may use: the density for tiles and a context over the invented hub. */
export interface GalleryEnv { density: Density; ui: UiContext }
export interface GallerySection { title: string; icon: IconName; render: (env: GalleryEnv) => TemplateResult }

const tiles = (env: GalleryEnv, key: string) => html`<div class="tiles">${(GALLERY_TILES[key] ?? []).map((spec) => createTile(spec, env.ui, env.density))}</div>`;

const modeOptions = [
  { id: 'light', label: t('theme.mode.light'), icon: 'light_mode' as const },
  { id: 'dark', label: t('theme.mode.dark'), icon: 'dark_mode' as const },
  { id: 'auto', label: t('theme.mode.auto'), icon: 'brightness_auto' as const },
];
const densityOptions = [
  { id: 'comfortable', label: t('theme.density.comfortable'), icon: 'view_agenda' as const },
  { id: 'compact', label: t('theme.density.compact'), icon: 'density_small' as const },
];

const galleryRoot = (): ShadowRoot | null => document.querySelector('mh-gallery')?.shadowRoot ?? null;
const snackbar = (): MhSnackbar | null => galleryRoot()?.querySelector('mh-snackbar') ?? null;
function toggle(tag: 'mh-sheet' | 'mh-dialog', open: boolean): void {
  const element = galleryRoot()?.querySelector(tag);
  if (element) element.open = open;
}

/** The rest screen of a wall tablet over the gallery, until it is clicked. */
function showRest(ctx: UiContext, night: boolean): void {
  const rest = document.createElement('mh-rest-screen');
  const snapshot = ctx.store.getSnapshot();
  Object.assign(rest, { ctx, night, hero: snapshot ? pickHero(snapshot) : null, mode: document.documentElement.dataset['mode'] ?? 'light' });
  rest.addEventListener('click', () => rest.remove());
  galleryRoot()?.append(rest);
}

export const SECTIONS: GallerySection[] = [
  {
    title: 'Tegels', icon: 'dashboard',
    render: (env) => html`
      <h3>Lamp met schuif (breed), aan en uit</h3>${tiles(env, 'lights')}
      <h3>Schakelaar: aan met vermogen, uit, en vermogen in kW</h3>${tiles(env, 'switches')}
      <h3>Sensor, tank, knop, meerwaardentegel en algemene tegel</h3>${tiles(env, 'others')}
      <h3>Onbereikbaar, batterij bijna leeg en gevaar</h3>${tiles(env, 'states')}
      <h3>Huis: smal en breed</h3>${tiles(env, 'house')}
      <h3>Flow (de tweede mislukt)</h3><div class="flows">${(GALLERY_TILES['flows'] ?? []).map((spec) => createTile(spec, env.ui, env.density))}</div>`,
  },
  {
    title: 'Knoppen, velden en keuzes', icon: 'toggle_on',
    render: () => html`
      <div class="row">
        <mh-button>Verbinden</mh-button>
        <mh-button variant="tonal">Uitvoeren</mh-button>
        <mh-button variant="text">Annuleren</mh-button>
        <mh-button variant="danger"><mh-icon name="logout"></mh-icon>Verbinding verbreken</mh-button>
        <mh-button disabled>Uitgeschakeld</mh-button>
        <mh-button busy>Verbinden…</mh-button>
        <mh-button variant="icon" label="Sluiten"><mh-icon name="close"></mh-icon></mh-button>
        <mh-button variant="tonal" small>Klein</mh-button>
      </div>
      <h3>Schakelaar en keuzeknoppen</h3>
      <div class="row">
        <mh-switch label="Uit"></mh-switch>
        <mh-switch label="Aan" checked></mh-switch>
        <mh-switch label="Uitgeschakeld" disabled></mh-switch>
        <mh-choice-group class="w360" .options=${modeOptions} value="light" label="Licht of donker"></mh-choice-group>
      </div>
      <h3>Keuzerondjes</h3>
      <div class="row"><mh-radio-list class="w320" label="Modus" value="on"
        .options=${[{ id: 'on', label: 'Aan' }, { id: 'charge', label: 'Alleen laden' }, { id: 'invert', label: 'Alleen omvormen' }, { id: 'off', label: 'Uit' }]}></mh-radio-list></div>
      <h3>Tekstveld: gewoon, herkend, met fout en uitgeschakeld</h3>
      <div class="row top">
        <mh-text-field class="w320" label=${t('connect.address.label')} icon="link" placeholder=${t('connect.address.placeholder')} help=${t('connect.address.help')}></mh-text-field>
        <mh-text-field class="w320" label=${t('connect.address.label')} icon="link" .value=${'my.homey.app/homeys/5f2a…c81e'} state="ok" help=${t('connect.address.id')}></mh-text-field>
        <mh-text-field class="w320" label=${t('connect.key.label')} icon="key" type="password" .value=${'voorbeeld'} state="error" help=${t('connect.key.rejected')}></mh-text-field>
        <mh-text-field class="w320" label=${t('connect.key.label')} icon="key" type="password" helpIcon="lock" help=${t('connect.key.help')} disabled></mh-text-field>
      </div>`,
  },
  {
    title: 'Labels in de kop', icon: 'check_circle',
    render: () => html`<div class="row">
      <mh-chip icon="home">${t('chip.local')}</mh-chip>
      <mh-chip icon="cloud">${t('chip.cloud')}</mh-chip>
      <mh-chip icon="progress_activity" spinning>${t('chip.connecting')}</mh-chip>
      <mh-chip icon="cloud_off" tone="alert">${t('chip.offline')}</mh-chip>
      <mh-chip icon="warning" tone="alert" interactive>${t('chip.alarm', { device: 'Rookmelder', alarm: 'Rook gemeld' })}</mh-chip>
      <mh-chip tone="alert">${t('chip.more', { n: 2 })}</mh-chip>
      <mh-chip icon="visibility" interactive>${t('chip.readonly')}</mh-chip>
      <mh-chip icon="science" interactive>${t('chip.demo')}</mh-chip>
    </div>`,
  },
  {
    title: 'Toelichting, laden en leeg', icon: 'info',
    render: () => html`
      <div class="row top">
        <mh-note class="w420" icon="lan">${richText(t('connect.lan'))}</mh-note>
        <mh-note class="w420" icon="wifi_off" tone="error">${richText(t('connect.unreachable'))}</mh-note>
      </div>
      <h3>Laadvorm</h3>
      <div class="row"><mh-loader size="large"></mh-loader><mh-loader></mh-loader></div>
      <h3>Lege toestand</h3>
      <mh-empty-state icon="cloud_off" heading=${t('empty.nostart.title')}>${t('empty.nostart.text')}
        <mh-button slot="actions">${t('empty.nostart.retry')}</mh-button>
        <mh-button slot="actions" variant="text">${t('empty.nostart.other')}</mh-button>
      </mh-empty-state>`,
  },
  {
    title: 'Schuiven', icon: 'light_mode',
    render: () => html`<div class="sliders">
      <div><h3>Aan, 80%</h3><mh-slider .fraction=${0.8} label="Helderheid" valueText="80%"></mh-slider></div>
      <div><h3>Lamp uit, 60%</h3><mh-slider .fraction=${0.6} dimmed label="Helderheid"></mh-slider></div>
      <div><h3>Tint</h3><mh-slider .fraction=${0.12} variant="hue" label="Tint"></mh-slider></div>
      <div><h3>Kleurtemperatuur</h3><mh-slider .fraction=${0.4} variant="temperature" label="Kleurtemperatuur"></mh-slider></div>
      <div><h3>Uitgeschakeld</h3><mh-slider .fraction=${0.3} disabled label="Helderheid"></mh-slider></div>
    </div>`,
  },
  {
    title: 'Meldingen en zwevende onderdelen', icon: 'info',
    render: () => html`
      <h3>Balk bovenin: verbinding weg en weer terug</h3>
      <div class="stack">
        <mh-banner heading=${t('banner.offline.title')} text=${t('banner.offline.text')}><mh-button slot="action" variant="text">${t('banner.retry')}</mh-button></mh-banner>
        <mh-banner tone="ok" heading=${t('banner.back.title')} text=${t('banner.back.text')}></mh-banner>
      </div>
      <h3>Korte melding, paneel en dialoog</h3>
      <div class="row">
        <mh-button variant="tonal" @click=${() => snackbar()?.show({ text: t('notify.flowStarted', { name: 'Alles uit' }), icon: 'check_circle' })}>Melding</mh-button>
        <mh-button variant="tonal" @click=${() => snackbar()?.show({ text: t('notify.controlFailed', { name: 'Plafond' }), tone: 'error', action: { label: t('notify.retry'), run: () => undefined } })}>Foutmelding</mh-button>
        <mh-button variant="tonal" @click=${() => toggle('mh-sheet', true)}>Paneel</mh-button>
        <mh-button variant="tonal" @click=${() => toggle('mh-dialog', true)}>Dialoog</mh-button>
      </div>`,
  },
  {
    title: 'Wandtablet', icon: 'tablet',
    render: (env) => html`<div class="row">
      <mh-time-field label=${t('wall.from')} value="22:30"></mh-time-field>
      <mh-button variant="tonal" @click=${() => showRest(env.ui, false)}>${t('wall.rest')}</mh-button>
      <mh-button variant="tonal" @click=${() => showRest(env.ui, true)}>${t('wall.night')}</mh-button>
    </div>`,
  },
  {
    title: 'Menu van een sectie', icon: 'more_vert',
    render: () => html`<div class="row"><mh-menu open label="Menu van Verlichting" .groups=${[
      { kind: 'items', id: 'colour', title: 'Kleur van Verlichting', items: [{ id: 'follow', label: t('menu.followDashboard'), checked: true, dot: rustigExpressive.color.defaultSeed }] },
      { kind: 'swatches', id: 'seed', title: t('menu.ownColour'), presets: rustigExpressive.color.presets, value: null, customLabel: t('menu.pickColour') },
    ]} @close=${(e: Event) => e.stopPropagation()}></mh-menu>
    <mh-menu open label="Menu van Plafond" .groups=${[
      { kind: 'items', id: 'tile', title: 'Plafond', items: [{ id: 'settings', label: 'Tegel instellen…', checked: null, icon: 'tune' }] },
      { kind: 'items', id: 'size', title: 'Formaat', items: [{ id: 'single', label: 'Enkel, zonder schuif', checked: false }, { id: 'wide', label: 'Breed, met schuif', checked: true }] },
      { kind: 'items', id: 'move', title: '', items: [{ id: 'forward', label: 'Naar voren', checked: null, icon: 'arrow_back', disabled: true }, { id: 'back', label: 'Naar achteren', checked: null, icon: 'arrow_forward' }, { id: 'to', label: 'Verplaatsen naar…', checked: null, icon: 'drive_file_move' }] },
      { kind: 'items', id: 'remove', title: '', items: [{ id: 'remove', label: 'Weghalen', checked: null, icon: 'delete' }] },
    ]} @close=${(e: Event) => e.stopPropagation()}></mh-menu></div>`,
  },
  {
    title: 'Icoonbibliotheek', icon: 'category',
    render: () => html`<div class="row"><mh-icon-picker .value=${null} .auto=${'lightbulb'}></mh-icon-picker><mh-icon-picker .value=${'bed'}></mh-icon-picker></div>`,
  },
];

type DashState = 'normal' | 'loading' | 'offline' | 'empty' | 'nostart';
const dashStates = [
  { id: 'normal', label: 'Normaal' }, { id: 'loading', label: 'Laden' }, { id: 'offline', label: 'Verbinding weg' },
  { id: 'empty', label: 'Lege Homey' }, { id: 'nostart', label: 'Start zonder verbinding' },
];
const viewOptions = [{ id: 'parts', label: 'Onderdelen' }, { id: 'dashboard', label: 'Dashboard' }, { id: 'connect', label: 'Verbinden' }];
type ConnectState = 'empty' | 'busy' | 'unreachable' | 'auth' | 'rights' | 'revoked';
const connectStates = [
  { id: 'empty', label: 'Leeg' }, { id: 'busy', label: 'Bezig' }, { id: 'unreachable', label: 'Niet bereikbaar' },
  { id: 'auth', label: 'Sleutel geweigerd' }, { id: 'rights', label: 'Rechten ontbreken' }, { id: 'revoked', label: 'Sleutel ingetrokken' },
];
const GALLERY_ID = '5f2a00000000000000000c81';

class MhGallery extends LitElement {
  static override properties = { theme: { state: true }, view: { state: true }, dashState: { state: true }, connectState: { state: true } };
  declare theme: ThemeSettings;
  declare view: 'parts' | 'dashboard' | 'connect';
  declare connectState: ConnectState;
  declare dashState: DashState;
  private media = darkMedia();
  private say = (text: string) => this.renderRoot.querySelector('mh-snackbar')?.show({ text, icon: 'info' });
  private ui = galleryContext(this.say);
  private camperSnapshot = toSnapshot(camperRaw as unknown as RawHomey);
  private camperDashboard = generateDashboard(this.camperSnapshot, { grouping: 'type' });
  private camper = contextFor(this.camperSnapshot, this.say, () => ({
    route: this.dashState === 'offline' || this.dashState === 'nostart' ? null : 'local', canControl: true, canStartFlows: true, demo: false,
  }));

  constructor() {
    super();
    this.theme = { seed: rustigExpressive.color.defaultSeed, mode: 'light', density: 'comfortable' };
    this.view = 'parts';
    this.dashState = 'normal';
    this.connectState = 'empty';
    // the tiles follow the route through the store, as with a real hub
    this.camper.store.apply({ type: 'route', route: 'local' });
    adoptPageStyles();
    if (this.media) watchSystemDark(this.media, () => this.apply());
    this.apply();
  }

  private apply(): void {
    applyThemeTo(document.documentElement, this.theme, this.media?.matches ?? false);
  }

  private set(change: Partial<ThemeSettings>): void {
    this.theme = { ...this.theme, ...change };
    this.apply();
  }

  static override styles = css`
    :host { display: block; }
    .page { max-width: var(--page-max-width); margin: 0 auto; padding: var(--page-pad); }
    .page.bar { padding-bottom: 0; }
    header { display: flex; flex-wrap: wrap; gap: var(--space-16); align-items: flex-end; justify-content: space-between; margin-bottom: var(--space-24); }
    .eyebrow { margin: 0 0 var(--space-4); color: var(--header-eyebrow-fg); font-size: var(--type-label-m-size); font-weight: var(--weight-medium); }
    h1 { margin: 0; font-size: var(--type-greeting-size); line-height: var(--type-greeting-line); font-weight: var(--weight-strong); letter-spacing: var(--tracking-display); }
    .controls { display: flex; flex-wrap: wrap; gap: var(--space-12); align-items: center; }
    .controls mh-choice-group { min-width: var(--sheet-width); }
    .seeds { display: flex; gap: var(--space-4); }
    .stack { display: grid; gap: var(--section-gap); }
    section { background: var(--section-bg); color: var(--section-fg); border-radius: var(--section-radius); padding: var(--section-pad); container-type: inline-size; }
    h2 { display: flex; align-items: center; gap: var(--space-8); margin: 0 0 var(--section-title-gap); font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); }
    h2 mh-icon { --icon-size: var(--icon-l); }
    h3 { margin: var(--space-16) 0 var(--space-8) var(--space-4); font-size: var(--type-label-m-size); font-weight: var(--weight-strong); color: var(--c-on-surface-variant); }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-12); }
    .row.top { align-items: flex-start; }
    .w320 { width: calc(var(--sheet-width) - var(--space-40) - var(--space-40) - var(--space-20)); }
    .w360 { width: calc(var(--sheet-width) - var(--space-40) - var(--space-20)); }
    .w420 { width: var(--sheet-width); }
    .flows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--tile-gap); max-width: var(--sheet-width); }
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--tile-gap); }
    @container (width < ${TILE_GRID_WIDE_MIN_PX}px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .sliders { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--sheet-width), 1fr)); gap: var(--space-16) var(--space-24); }
  `;

  private renderDashboard() {
    const state = this.dashState;
    const phase = state === 'loading' ? 'loading' : state === 'nostart' ? 'unreachable' : 'ready';
    return html`<mh-dashboard .ctx=${this.camper} .board=${state === 'loading' || state === 'nostart' ? null : boardFromDashboard(this.camperDashboard, 'overview')}
      phase=${phase} emptyReason=${state === 'empty' ? 'no-devices' : 'none'} banner=${state === 'offline' ? 'offline' : 'none'}
      density=${this.theme.density} ?connecting=${state === 'loading'} activePanel="none"
      @retry=${() => this.say(t('notify.retrying'))}></mh-dashboard>`;
  }

  private renderConnect() {
    const c = this.connectState;
    const issue = c === 'unreachable' ? 'unreachable' : c === 'auth' ? 'auth' : c === 'revoked' ? 'revoked' : 'none';
    return html`<mh-connect-screen issue=${issue} ?busy=${c === 'busy'} ?waitingForPermission=${c === 'busy'} .review=${c === 'rights' ? ['startFlows'] : null}
      address=${c === 'empty' ? '' : GALLERY_ID}></mh-connect-screen>`;
  }

  override render() {
    return html`
      <div class="page ${this.view === 'dashboard' ? 'bar' : ''}"><header>
        <div><p class="eyebrow">Designsysteem Rustig Expressive</p><h1>${this.view === 'dashboard' ? 'Dashboard' : 'Onderdelen'}</h1></div>
        <div class="controls">
          <mh-choice-group label="Weergave" .options=${viewOptions} .value=${this.view}
            @change=${(e: CustomEvent<{ value: string }>) => { this.view = e.detail.value as 'parts' | 'dashboard' | 'connect'; }}></mh-choice-group>
          ${this.view === 'connect' ? html`<mh-radio-list label="Toestand" .options=${connectStates} .value=${this.connectState}
            @change=${(e: CustomEvent<{ value: string }>) => { this.connectState = e.detail.value as ConnectState; }}></mh-radio-list>` : ''}
          ${this.view === 'dashboard' ? html`<mh-radio-list label="Toestand" .options=${dashStates} .value=${this.dashState}
            @change=${(e: CustomEvent<{ value: string }>) => { this.dashState = e.detail.value as DashState; this.camper.store.apply({ type: 'route', route: this.camper.status().route }); }}></mh-radio-list>` : ''}
          <div class="seeds">${rustigExpressive.color.presets.map((preset) => html`
            <mh-button variant=${preset.seed === this.theme.seed ? 'tonal' : 'text'} small @click=${() => this.set({ seed: preset.seed })}>${preset.id}</mh-button>`)}</div>
          <mh-choice-group label=${t('theme.mode')} .options=${modeOptions} .value=${this.theme.mode}
            @change=${(e: CustomEvent<{ value: string }>) => this.set({ mode: e.detail.value as ThemeSettings['mode'] })}></mh-choice-group>
          <mh-choice-group label=${t('theme.density')} .options=${densityOptions} .value=${this.theme.density}
            @change=${(e: CustomEvent<{ value: string }>) => this.set({ density: e.detail.value as ThemeSettings['density'] })}></mh-choice-group>
        </div>
      </header></div>
      <mh-snackbar></mh-snackbar>
      <mh-sheet heading="Plafond" subheading="Woonkamer" icon="lightbulb" iconOn @close=${() => toggle('mh-sheet', false)}>
        <mh-switch label="Aan" checked></mh-switch>
        <mh-note icon="lock">${t('panel.readonly')}</mh-note>
      </mh-sheet>
      <mh-dialog heading=${t('settings.confirm.title')} @cancel=${() => toggle('mh-dialog', false)}>${t('settings.confirm.text')}
        <mh-button slot="actions" variant="text" data-autofocus @click=${() => toggle('mh-dialog', false)}>${t('settings.confirm.cancel')}</mh-button>
        <mh-button slot="actions" @click=${() => toggle('mh-dialog', false)}>${t('settings.confirm.ok')}</mh-button>
      </mh-dialog>
      ${this.view === 'connect' ? this.renderConnect() : this.view === 'dashboard' ? this.renderDashboard() : html`<div class="page"><div class="stack">${SECTIONS.map((section) => html`<section><h2><mh-icon name=${section.icon} filled></mh-icon>${section.title}</h2>${section.render({ density: this.theme.density, ui: this.ui })}</section>`)}</div></div>`}`;
  }
}

if (!customElements.get('mh-gallery')) customElements.define('mh-gallery', MhGallery);
