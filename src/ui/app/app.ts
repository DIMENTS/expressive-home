import { LitElement, css, html, nothing } from 'lit';
import { createHomeyApiClient, type HomeyApiLib } from '../../homey/api-client';
import type { HomeyClient } from '../../homey/client';
import { createSwitchableTranslate, createTranslate, resolveLanguage, type Language } from '../../i18n';
import { createMockClient } from '../../mock/mock-client';
import { createStore, type Store } from '../../state/store';
import type { ConfigStore } from '../../storage/config';
import { createLocalConfigStore, STORAGE_KEY } from '../../storage/local-store';
import { darkMedia, watchSystemDark } from '../../theme/system-mode';
import { resolveMode } from '../../theme/engine';
import { rustigExpressive } from '../../theme/rustig-expressive';
import type { Mode, ShownDensity, ThemeSettings } from '../../theme/types';
import type { FlowNight } from '../../wall/night';
import { wallHubOf, withWallHub, type WallHub, type WallSettings } from '../../wall/settings';
import { applyThemeTo } from '../apply-theme';
import { adoptPageStyles } from '../page-styles';
import { phoneMedia, watchPhone } from '../phone';
import type { IconName } from '../icons/icons';
import type { MhSettingsPanel } from '../panels/settings-panel';
import type { MhSnackbar, SnackbarMessage } from '../parts/snackbar';
import { sharedStyles } from '../parts/shared-styles';
import type { LayoutEdit } from '../../layout/edit';
import { readLayoutFile } from '../../layout/file';
import { heroSectionId, OVERVIEW_ID, roomBoardId, roomOfBoard, ROOMS_ID, type Column, type DashboardLayout, type HeroChoice, type SectionLayout, type TileLayout } from '../../layout/types';
import { isLibraryIcon } from '../icons/library';
import { pickHero } from '../../dashboard/hero';
import { sectionId, type Section, type SectionKind, type TileSpec } from '../../dashboard/types';
import type { NewItem } from '../../layout/reconcile';
import { isLeftKind, sectionIcon, sectionTitle, shownSectionIcon } from '../model/layout';
import { tanksOf, temperatureSources } from '../model/rest-view';
import { flowView, tileView } from '../model/tile-view';
import { boardMenuGroups, type BoardAction } from '../screens/edit-menus';
import type { MhDashboard } from '../screens/dashboard-screen';
import type { DeviceKind } from '../../served/pair-link';
import type { PairIssue } from '../screens/pair-screen';
import type { MhRestScreen } from '../screens/rest-screen';
import type { RailBoard, RailTarget } from '../screens/rail';
import type { UiContext } from './context';
import { createController, type AppState, type Controller, type ControllerDeps } from './controller';
import { houseLife, houseRaw } from '../../mock/house';
import { demoRaw, simulationRate, type Demo } from './demo';
import { safeStorage } from './safe-storage';
import { isGuarded } from '../../controls/danger';
import type { Grouping } from '../../dashboard/types';
import { roomsOf } from '../../rooms/rooms';
import { dangerQuestion } from '../model/guard-view';
import type { DangerDetail } from '../parts/ask-danger';
import { servedEnvironment } from './served';
import { createWall, type Wall } from './wall';
import '../parts/button';
import '../parts/dialog';
import '../parts/snackbar';
import '../screens/connect-screen';
import '../screens/pair-screen';
import '../screens/dashboard-screen';
import '../screens/rest-screen';
import '../panels/add-panel';
import '../panels/device-panel';
import '../panels/hero-panel';
import '../panels/name-icon-dialog';
import '../panels/news-panel';
import '../panels/settings-panel';
import '../panels/theme-panel';
import '../panels/tile-panel';
import '../panels/wall-panel';
import '../tiles/index';

const homeyLib = (): HomeyApiLib | null =>
  (typeof (window as { HomeyAPIV3Local?: unknown }).HomeyAPIV3Local === 'function' ? (window as unknown as HomeyApiLib) : null);

/** The example hub: a house, or a camper with friendly names; values move a little until it is left, nothing goes to a hub. */
function createDemoClient(which: Demo, language: Language): HomeyClient {
  const mock = which === 'house' ? createMockClient(houseRaw(language), { life: houseLife() }) : createMockClient(demoRaw());
  const eventsPerSecond = simulationRate(window.location.search);
  mock.simulate(
    { setInterval: (fn, ms) => window.setInterval(fn, ms), clearInterval: (handle) => window.clearInterval(handle as number) },
    eventsPerSecond === undefined ? {} : { eventsPerSecond },
  );
  return mock;
}

/** Says to the page that is loaded anew that nobody is there. */
export const REST_KEY = 'dashboard.rest';

/** What the app needs from the outside world; the browser's by default, a fake one in tests. */
export interface AppEnvironment {
  configStore: ConfigStore;
  createRealClient: ControllerDeps['createRealClient'];
  createDemoClient(which: Demo, language: Language): HomeyClient;
  /** Runs a store flush; in the browser at the next frame, so the live state redraws at most once per frame. */
  schedule(flush: () => void): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** The browser's preferred languages, first the most preferred. */
  browserLanguages: readonly string[];
  /** Calls back when another tab saved the configuration; returns how to stop. */
  watchStored?(changed: () => void): () => void;
  /** Only when the app on the hub served this page: devices are paired, there is no key. */
  served?: {
    pair(code: string, name: string): Promise<'ok' | Exclude<PairIssue, 'none'>>;
    /** The code that the page was opened with. */
    scanned(): string | null;
    /** Hears of a code that is scanned while the page is open. */
    onScanned(listener: (code: string) => void): void;
    /** What this device is, as far as can be told. */
    kind(): DeviceKind;
    mayArrange(): boolean;
    /** Calls back when another device saved first. */
    onConflict(listener: () => void): void;
    /** Calls back when a change is not on the hub yet; it is tried again by itself. */
    onUnsaved(listener: () => void): void;
    /** Calls back when a flow on the hub began or ended the night of the wall tablets; null: no flow said anything. */
    onNight(listener: (flow: FlowNight | null) => void): void;
    /** Calls back when the hub has another version of the dashboard than this page. */
    onNewBuild(listener: () => void): void;
    /** Everything that was arranged here is on the hub. */
    settled(): boolean;
    reload(): void;
  };
}

/** The browser: local storage (or a stand-in when refused), Athom's library, timers and animation frames. */
export function browserEnvironment(): AppEnvironment {
  if (__SERVED_BY_HOMEY__) return servedEnvironment(createDemoClient);
  return {
    configStore: createLocalConfigStore(safeStorage(() => window.localStorage)),
    createRealClient: (settings) => {
      const lib = homeyLib();
      if (!lib) return null;
      return createHomeyApiClient(lib, settings, {
        fetch: window.fetch.bind(window),
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: (handle) => window.clearInterval(handle as number),
        addOnlineListener: (fn) => {
          window.addEventListener('online', fn);
          return () => window.removeEventListener('online', fn);
        },
        now: () => Date.now(),
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: (handle) => window.clearTimeout(handle as number),
      });
    },
    createDemoClient,
    schedule: (flush) => { requestAnimationFrame(flush); },
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    browserLanguages: navigator.languages?.length ? [...navigator.languages] : [navigator.language],
    watchStored: (changed) => {
      const onStorage = (event: StorageEvent): void => { if (event.key === STORAGE_KEY) changed(); };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
  };
}

/** A panel of the edit mode: adding to a section, the settings of a tile or the hero, or what is new on the hub. */
type EditPanel = { kind: 'news' } | { kind: 'add'; sectionId: string } | { kind: 'tile'; tileId: string } | { kind: 'hero'; sectionId: string };

/** A question with one answer that does something. */
interface Question { heading: string; text: string; ok: string; run(): void; /** Asked about something dangerous, at this moment. */ dangerAt?: number }

type TilePatch = Partial<Pick<TileLayout, 'spec' | 'size' | 'label' | 'icon'>>;

/** How long a new tile lights up; the animation itself takes motion-arrive. */
export const FRESH_MS = 2000;
/** A question about something dangerous is not answered by the tap after the one that asked it. */
export const SURE_MS = 600;
/** And it goes away when nobody answers. */
export const ASK_MS = 30_000;
/** How long it is not told again how a slider is held. */
const HOLD_HINT_EVERY_MS = 3_600_000;

/**
 * The app: makes the live state, the controller and the theme on the document, and shows
 * per phase the connect screen or the dashboard, with the panels and the short notice. Set `environment`
 * before the element is attached to replace the browser's (tests do).
 */
export class MhApp extends LitElement {
  static override properties = { state: { state: true }, panel: { state: true }, editPanel: { state: true }, freshTiles: { state: true }, sectionDialog: { state: true }, boardDialog: { state: true }, pairIssue: { state: true }, pairing: { state: true }, scanned: { state: true }, phone: { state: true }, question: { state: true }, asking: { state: true } };
  declare state: AppState;
  /** The panel opened from the rail or a header label. */
  declare panel: 'none' | 'theme' | 'settings' | 'wall';
  /** The panel of the edit mode that is open. */
  declare editPanel: EditPanel | null;
  /** The dialog to add a section (id null) or rename one. */
  declare sectionDialog: { sectionId: string | null; column: Column; placeRef?: string } | null;
  /** The dialog for a new dashboard, or for the name and icon of the open one. */
  declare boardDialog: 'new' | 'edit' | null;
  /** Pairing this device, when the app on the hub served the page. */
  declare pairIssue: PairIssue;
  declare pairing: boolean;
  /** A code that was scanned and not used yet. */
  declare scanned: string;
  /**
   * The window is as narrow as a phone: there is nothing to arrange with. The edit mode and its panels are
   * hidden, not ended, with what was typed in them: a window can be narrow for a moment (an iPad that goes to the background).
   */
  declare phone: boolean;
  /** A question before something is taken away; it keeps its text while the dialog fades out. */
  declare question: Question;
  declare asking: boolean;
  /** The tiles that were just added. */
  declare freshTiles: readonly string[];
  private freshTimer: unknown = null;
  /** The notice with "Ongedaan maken" that is on screen, and the step it is about. */
  private undoNotice: { step: number | null; message: SnackbarMessage } | null = null;
  /** How often a panel opened: what is typed in one opening is one step to undo. */
  private openings = 0;
  environment: AppEnvironment | null = null;

  private media = darkMedia();
  private narrow = phoneMedia();
  private stopNarrow: (() => void) | null = null;
  private appliedTheme: { theme: ThemeSettings; dark: boolean; density: ShownDensity; night: boolean } | null = null;
  private store!: Store;
  private controller!: Controller;
  private wall!: Wall;
  /** What had the focus when the rest screen came; null: nothing, or something in a panel that closed. */
  private focusBefore: HTMLElement | null = null;
  private panelBefore = false;
  /** The hub has another version of the dashboard. */
  private outdated = false;
  private ctx!: UiContext;
  private started = false;
  private env!: AppEnvironment;
  private stopWatching: (() => void) | null = null;

  constructor() {
    super();
    adoptPageStyles();
    this.panel = 'none';
    this.editPanel = null;
    this.freshTiles = [];
    this.sectionDialog = null;
    this.boardDialog = null;
    this.pairIssue = 'none';
    this.pairing = false;
    this.scanned = '';
    this.phone = this.narrow?.matches ?? false;
    this.question = { heading: '', text: '', ok: '', run: () => {} };
    this.asking = false;
    // The system turned light or dark: the document follows, and so do the sections with their own colour.
    if (this.media) watchSystemDark(this.media, () => { this.appliedTheme = null; this.applyTheme(); this.requestUpdate(); });
  }

  /** Makes the store and the controller from the environment, once, when the app is first attached. */
  private setup(): void {
    const env = this.environment ?? browserEnvironment();
    this.env = env;
    this.store = createStore(env.schedule);
    const translate = createSwitchableTranslate(resolveLanguage(null, env.browserLanguages));
    this.controller = createController({
      configStore: env.configStore,
      store: this.store,
      createRealClient: env.createRealClient,
      createDemoClient: env.createDemoClient,
      notify: (message) => this.notify(message),
      setTimeout: env.setTimeout,
      clearTimeout: env.clearTimeout,
      t: translate,
      browserLanguages: env.browserLanguages,
      mayArrange: () => env.served?.mayArrange() ?? true,
      served: env.served !== undefined,
    });
    env.served?.onConflict(() => this.notify({ text: this.ctx.t('notify.conflict'), icon: 'info' }));
    this.scanned = env.served?.scanned() ?? '';
    env.served?.onScanned((code) => {
      if (this.state?.phase === 'dashboard') return;
      this.scanned = code;
      this.pairIssue = 'none';
    });
    env.served?.onNight((flow) => this.wall.setFlow(flow));
    env.served?.onNewBuild(() => {
      this.outdated = true;
      this.requestUpdate();
    });
    env.served?.onUnsaved(() => this.notify({ text: this.ctx.t('notify.saveLater'), icon: 'cloud_off' }));
    this.state = this.controller.getState();
    this.wall = createWall({
      target: window, now: () => Date.now(), setTimeout: env.setTimeout, clearTimeout: env.clearTimeout,
      settings: () => this.state.wall, allowed: () => this.mayRest(),
      began: () => this.beginRest(), ended: (kind) => { void this.endRest(kind); }, update: () => this.requestUpdate(),
    });
    this.ctx = { store: this.store, t: createTranslate(this.state.language.active), actions: this.controller.actions, status: () => this.controller.status(), busy: (id) => this.controller.busy(id) };
    document.documentElement.lang = this.state.language.active;
    this.controller.subscribe(() => {
      this.state = this.controller.getState();
      // a device that is paired has no use for it
      if (this.state.phase === 'dashboard') this.scanned = '';
      this.followLanguage(this.state.language.active);
      // Leaving the dashboard (a rejected key, another key or hub) closes its panels too.
      if (this.state.phase === 'connect') {
        this.panel = 'none';
        this.editPanel = null;
        this.sectionDialog = null;
        this.boardDialog = null;
        this.asking = false;
      }
      this.closeStale();
    });
  }

  /** When it was told how a slider is held. */
  private hintedAt = Number.NEGATIVE_INFINITY;

  /** A finger tapped a slider or swiped along it: nothing happened, so it is told why. Not again and again. */
  private hintHold(): void {
    const age = Date.now() - this.hintedAt;
    if (age >= 0 && age < HOLD_HINT_EVERY_MS) return;
    // what is there to choose stays
    const bar = this.renderRoot.querySelector<MhSnackbar>('mh-snackbar');
    if (bar?.open && bar.message?.action) return;
    this.hintedAt = Date.now();
    this.notify({ text: this.ctx.t('notify.holdSlider'), icon: 'touch_app' });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.started) {
      this.addEventListener('hold-hint', () => this.hintHold());
      this.addEventListener('confirm-danger', (event) => this.askDanger((event as CustomEvent<DangerDetail>).detail));
      this.started = true;
      this.setup();
      void this.controller.start();
    }
    if (this.narrow) {
      const { narrow } = this;
      const follow = (): void => { this.phone = narrow.matches; };
      follow();
      this.stopNarrow = watchPhone(narrow, follow);
    }
    this.stopWatching = this.env.watchStored?.(() => { void this.controller.reloadStored(); }) ?? null;
    this.wall.start();
    if (this.restedBefore()) this.wall.restNow();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.wall.stop();
    this.stopWatching?.();
    this.stopWatching = null;
    this.stopNarrow?.();
    this.stopNarrow = null;
  }

  /**
   * Another language: a new context, so every part draws its texts again, and the page's lang for screen readers.
   * The store, the actions and the connection stay as they are.
   */
  private followLanguage(active: Language): void {
    if (this.ctx.t.language === active) return;
    this.ctx = { ...this.ctx, t: createTranslate(active) };
    document.documentElement.lang = active;
  }

  /** The owner's choice, or the sizes of a phone in a narrow window. */
  private shownDensity(): ShownDensity {
    return this.phone ? 'phone' : this.state.theme.density;
  }

  protected override willUpdate(): void {
    // what may be at rest follows from everything that is shown
    if (!this.started) return;
    this.wall.changed();
    if (this.outdated) this.loadAnew();
  }

  // ----- the rest screen of a wall tablet -----

  /** A wall tablet is never reloaded by hand: it does that itself, by day, when nobody is there and everything is on the hub. */
  private loadAnew(): void {
    const { wall } = this;
    const served = this.env.served;
    if (!served || wall.shown !== 'rest' || wall.look !== 'day' || wall.leaving || this.controller.status().route === null || !served.settled()) return;
    this.outdated = false;
    try {
      window.sessionStorage.setItem(REST_KEY, '1');
    } catch {
      // then it begins with the dashboard
    }
    served.reload();
  }

  /** The page was loaded anew while nobody was there. */
  private restedBefore(): boolean {
    try {
      const rested = window.sessionStorage.getItem(REST_KEY) !== null;
      window.sessionStorage.removeItem(REST_KEY);
      return rested;
    } catch {
      return false;
    }
  }

  /** Not while something is arranged or asked, and not without a dashboard or in a narrow window. */
  private mayRest(): boolean {
    const { state } = this;
    return state.phase !== 'connect' && !this.phone && !state.editing && !this.asking && this.sectionDialog === null && this.boardDialog === null
      && !this.renderRoot.querySelector<MhSettingsPanel>('mh-settings-panel')?.confirming;
  }

  /** Nobody is there: the dashboard this device starts with, from its beginning, without a panel. */
  private beginRest(): void {
    this.dashboardScreen?.closeMenus();
    const active = this.focused();
    this.panelBefore = this.panel !== 'none' || this.editPanel !== null || this.state.openDeviceId !== null;
    this.focusBefore = this.panelBefore ? null : active;
    if (this.state.openDeviceId !== null) this.controller.closeDevice();
    this.panel = 'none';
    this.editPanel = null;
    this.controller.openStart();
    window.scrollTo(0, 0);
    this.requestUpdate();
    void this.updateComplete.then(() => this.renderRoot.querySelector<MhRestScreen>('mh-rest-screen')?.focus({ preventScroll: true }));
  }

  /** Somebody is there again: the focus goes back to where it was, or to the dashboard when that went. */
  private async endRest(kind: 'rest' | 'preview'): Promise<void> {
    const before = this.focusBefore;
    this.focusBefore = null;
    this.requestUpdate();
    if (kind === 'preview') {
      // back to the panel that asked for a look
      if (this.state.phase !== 'connect' && !this.phone) this.panel = 'wall';
      return;
    }
    await this.updateComplete;
    if (before?.isConnected) before.focus({ preventScroll: true });
    if (this.panelBefore || (before && this.focused() !== before)) this.dashboardScreen?.focusContent();
  }

  /** What has the focus, through every shadow root; null when nothing has. */
  private focused(): HTMLElement | null {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active instanceof HTMLElement && active !== document.body ? active : null;
  }

  private renderRest() {
    const { state, wall } = this;
    if (wall.shown === 'none') return nothing;
    const block = state.board ? [...state.board.left, ...state.board.right].find((b) => b.type === 'hero') : undefined;
    const hero = block?.type === 'hero' ? block : undefined;
    const large = this.automaticHero();
    const connecting = state.phase === 'connecting' && !state.startUnreachable;
    return html`<mh-rest-screen .ctx=${this.ctx} .hero=${hero?.hero ?? null} .heroSeed=${hero ? state.sectionSeeds[hero.id] ?? null : null} mode=${this.shownMode()}
      .battery=${large?.kind === 'battery' ? large.primary : null} .wall=${state.wall} .hub=${wallHubOf(state.wall, state.hubId)} .now=${wall.now} .night=${wall.look === 'night'}
      .away=${this.controller.status().route === null && !connecting} ?leaving=${wall.leaving}></mh-rest-screen>`;
  }

  private setWall(change: { wall?: WallSettings; hub?: WallHub }): void {
    const { wall, hubId } = this.state;
    if (change.wall) this.controller.setWall(change.wall);
    if (change.hub && hubId !== null) this.controller.setWall(withWallHub(wall, hubId, change.hub));
  }

  private renderWallPanel() {
    const { state } = this;
    const open = this.panel === 'wall';
    const { t } = this.ctx;
    const devices = open ? this.store.getDevices() : [];
    return html`<mh-wall-panel .t=${t} ?hidden=${this.phone} ?open=${open} .wall=${state.wall} .hub=${wallHubOf(state.wall, state.hubId)} .sources=${temperatureSources(devices, this.store.getSnapshot()?.zones ?? {}, t)}
      .canPreview=${!state.editing} .tanks=${tanksOf(devices, t).map((tank) => ({ id: tank.id, name: tank.name.trim() || t('tile.unnamed') }))} ?hasBattery=${this.automaticHero()?.kind === 'battery'} ?served=${this.controller.status().served ?? false}
      @change=${(e: CustomEvent<{ wall?: WallSettings; hub?: WallHub }>) => this.setWall(e.detail)} @preview=${(e: CustomEvent<{ look: 'day' | 'night' }>) => this.wall.preview(e.detail.look)}
      @close=${() => { this.panel = 'none'; }}></mh-wall-panel>`;
  }

  /** Whether the dashboard is dark because it is night. */
  private get nightNow(): boolean {
    return this.wall.night && !this.phone;
  }

  private shownMode(): Mode {
    return this.nightNow ? 'dark' : resolveMode(this.state.theme.mode, this.media?.matches ?? false);
  }

  /** The theme goes onto the document when it changed, when the system turned light or dark, or when the night came or went. */
  private applyTheme(): void {
    if (!this.state) return;
    const dark = this.media?.matches ?? false;
    const theme = this.state.theme;
    const density = this.shownDensity();
    const night = this.nightNow;
    const { appliedTheme } = this;
    if (appliedTheme && appliedTheme.theme === theme && appliedTheme.dark === dark && appliedTheme.density === density && appliedTheme.night === night) return;
    this.appliedTheme = { theme, dark, density, night };
    applyThemeTo(document.documentElement, { ...theme, density, ...(night ? { mode: 'dark' } : {}) }, dark);
  }

  static override styles = [sharedStyles, css`
    :host { display: block; }
  `];

  /** The screen shown last: when it changes, the focus moves into the new screen so it never gets lost. */
  private shownScreen: 'connect' | 'dashboard' | null = null;
  /** The dashboard shown last: another one begins at the top of the page, as a page does. */
  private shownBoard: string | null = null;

  protected override updated(): void {
    if (!this.state) return;
    const screen = this.state.phase === 'connect' ? 'connect' : 'dashboard';
    const board = screen === 'dashboard' ? this.state.boardId : null;
    if (board !== this.shownBoard) window.scrollTo(0, 0);
    this.shownBoard = board;
    const previous = this.shownScreen;
    this.shownScreen = screen;
    if (previous === null || previous === screen) return;
    const target = this.renderRoot.querySelector<HTMLElement & { updateComplete?: Promise<unknown>; focusContent?: () => void }>(screen === 'connect' ? 'mh-connect-screen, mh-pair-screen' : 'mh-dashboard');
    void (target?.updateComplete ?? Promise.resolve()).then(() => {
      if (screen === 'dashboard') target?.focusContent?.();
      else target?.focus({ preventScroll: true });
    });
  }

  /** What the change makes meaningless goes for good: a panel or dialog without its subject, a notice whose step is not the next to undo. */
  private closeStale(): void {
    const { editPanel, state } = this;
    const blocks = state.board ? [...state.board.left, ...state.board.right] : [];
    const stale = editPanel === null ? false
      : editPanel.kind === 'news' ? state.editing || state.news.length === 0
        : !state.editing || (editPanel.kind === 'add' ? !this.sectionOf(editPanel.sectionId)
          : editPanel.kind === 'tile' ? this.findTile(editPanel.tileId) === null
            : !blocks.some((b) => b.type === 'hero' && b.id === editPanel.sectionId));
    if (stale) this.editPanel = null;
    const renamed = this.sectionDialog?.sectionId ?? null;
    if (this.sectionDialog && (!state.editing || (renamed !== null && !this.sectionOf(renamed)))) this.sectionDialog = null;
    if (!state.editing) this.boardDialog = null;
    const notice = this.undoNotice;
    if (!notice || notice.step === state.undoId) return;
    this.undoNotice = null;
    const bar = this.renderRoot.querySelector<MhSnackbar>('mh-snackbar');
    if (bar?.message === notice.message) bar.hide();
  }

  /** The rail and the header labels open a panel; a dashboard closes it. One floating panel at a time. */
  private navigate(to: RailTarget): void {
    if (to === 'theme' || to === 'settings') {
      this.controller.closeDevice();
      this.editPanel = null;
      this.panel = to;
      return;
    }
    this.panel = 'none';
    this.controller.openBoard(to.slice('board:'.length));
  }

  /** The name of a dashboard: the owner's own, otherwise "Overzicht" in the language of the app. */
  private boardName(board: DashboardLayout): string {
    return board.name ?? this.ctx.t(board.id === OVERVIEW_ID ? 'nav.overview' : 'board.defaultName');
  }

  /** The icon of a dashboard: the owner's own when the app has it. */
  private boardIcon(board: DashboardLayout): IconName {
    return board.icon !== null && isLibraryIcon(board.icon) ? board.icon : 'dashboard';
  }

  private openDashboard(): DashboardLayout | undefined {
    return this.state.layout.dashboards.find((d) => d.id === this.state.boardId);
  }

  /** A tile of the open dashboard as it is drawn, and its section. */
  private findTile(tileId: string): { spec: TileSpec; section: Section } | null {
    const blocks = this.state.board ? [...this.state.board.left, ...this.state.board.right] : [];
    for (const block of blocks) {
      const spec = block.type === 'section' ? block.section.tiles.find((tile) => tile.id === tileId) : undefined;
      if (spec && block.type === 'section') return { spec, section: block.section };
    }
    return null;
  }

  /** A tile as it is stored; on an automatic dashboard as freezing would store it. */
  private storedTile(tileId: string, spec: TileSpec): TileLayout {
    const board = this.state.layout.dashboards.find((d) => d.id === this.state.boardId);
    return board?.sections?.flatMap((section) => section.tiles).find((tile) => tile.id === tileId)
      ?? { id: tileId, spec, size: spec.size, label: null, icon: null, source: 'device' };
  }

  /** The name on a tile of the open dashboard. */
  private tileName(tileId: string): string {
    const spec = this.findTile(tileId)?.spec;
    if (!spec) return '';
    if (spec.kind === 'flow') return flowView(spec, this.store.getSnapshot()?.flows.find((f) => f.id === spec.flowId), this.ctx.t).name;
    return tileView(spec, this.store.getDevice(spec.deviceId), this.ctx.t).name;
  }

  private notify(message: SnackbarMessage): void {
    this.renderRoot.querySelector<MhSnackbar>('mh-snackbar')?.show(message);
  }

  /** A short notice with "Ongedaan maken". */
  private notifyUndo(text: string, icon: IconName): void {
    const step = this.state.undoId;
    const message: SnackbarMessage = { text, icon, action: { label: this.ctx.t('edit.undo'), run: () => { if (this.state.undoId === step) this.undo(); } } };
    this.undoNotice = { step, message };
    this.notify(message);
  }

  private get dashboardScreen(): MhDashboard | null {
    return this.renderRoot.querySelector('mh-dashboard');
  }

  private undo(): void {
    this.controller.undo();
    this.dashboardScreen?.announce(this.ctx.t('edit.undone'));
    this.keepFocus();
  }

  /** Puts the focus somewhere on the dashboard once the panels and dialogs that close have given it back. */
  private async focusThen(act: (screen: MhDashboard) => Promise<void>): Promise<void> {
    await this.updateComplete;
    await new Promise((done) => { this.env.setTimeout(() => done(null), 0); });
    const screen = this.dashboardScreen;
    if (screen) await act(screen);
  }

  /** When what had the focus was taken away, it goes to the start of the content instead of to nowhere. */
  private keepFocus(): void {
    void this.focusThen(async (screen) => {
      await screen.updateComplete;
      if (document.activeElement === null || document.activeElement === document.body) screen.focusContent();
    });
  }

  private notifyFull(): void {
    this.notify({ text: this.ctx.t('edit.full'), icon: 'info' });
  }

  private onEdit(edit: LayoutEdit): void {
    if (edit.type !== 'remove-tile') {
      this.controller.edit(edit);
      return;
    }
    const name = this.tileName(edit.tileId);
    const section = this.findTile(edit.tileId)?.section;
    const index = section?.tiles.findIndex((tile) => tile.id === edit.tileId) ?? 0;
    this.controller.edit(edit);
    this.notifyUndo(this.ctx.t('edit.tile.removed', { name }), 'delete');
    if (section) void this.focusThen((screen) => screen.focusTileAt(section.id, index));
  }

  /** A section of the open dashboard. */
  private sectionOf(sectionId: string): Section | undefined {
    const blocks = this.state.board ? [...this.state.board.left, ...this.state.board.right] : [];
    return blocks.flatMap((b) => (b.type === 'section' ? [b.section] : [])).find((section) => section.id === sectionId);
  }

  /** Where a section or hero of the open dashboard stands. */
  private placeOfBlock(id: string): { column: Column; index: number } | null {
    for (const column of ['left', 'right'] as const) {
      const index = this.state.board?.[column].findIndex((b) => (b.type === 'hero' ? b.id : b.section.id) === id) ?? -1;
      if (index !== -1) return { column, index };
    }
    return null;
  }

  /** One floating panel at a time. */
  private openEditPanel(panel: EditPanel): void {
    this.controller.closeDevice();
    this.panel = 'none';
    this.openings += 1;
    this.editPanel = panel;
  }

  private ask(question: Question): void {
    this.question = question;
    this.asking = true;
  }

  /** A short tap on something dangerous. */
  private askDanger({ deviceId, capabilityId, value }: DangerDetail): void {
    const device = this.store.getDevice(deviceId);
    if (!device || !isGuarded(device, capabilityId)) return;
    const question: Question = { ...dangerQuestion(device, capabilityId, value, this.ctx.t), dangerAt: Date.now(), run: () => this.ctx.actions.guard(deviceId, capabilityId, value) };
    this.ask(question);
    this.env.setTimeout(() => { if (this.question === question) this.asking = false; }, ASK_MS);
  }

  private renderQuestion() {
    // the second tap of a double one neither answers it nor waves it away; below zero: the clock was set back
    const justAsked = (): boolean => {
      const { dangerAt } = this.question;
      const age = dangerAt === undefined ? SURE_MS : Date.now() - dangerAt;
      return age >= 0 && age < SURE_MS;
    };
    const close = () => { if (!justAsked()) this.asking = false; };
    const answer = () => {
      if (justAsked()) return;
      this.asking = false;
      this.question.run();
    };
    return html`<mh-dialog class="confirm" ?open=${this.asking} heading=${this.question.heading} @cancel=${(e: CustomEvent<{ by?: string } | null>) => { if (e.detail?.by === 'key') this.asking = false; else close(); }}>${this.question.text}
      <mh-button slot="actions" variant="text" data-autofocus @click=${close}>${this.ctx.t('section.dialog.cancel')}</mh-button>
      <mh-button slot="actions" @click=${answer}>${this.question.ok || this.ctx.t('section.remove.confirm')}</mh-button>
    </mh-dialog>`;
  }

  /** A section or the hero of the open dashboard goes; one with tiles in it is asked about first (5.3). */
  private onRemoveSection(sectionId: string): void {
    const { t } = this.ctx;
    const section = this.sectionOf(sectionId);
    const name = section ? sectionTitle(section, t) : t('hero.title');
    // the tiles that are stored, also those of a device that is away for a moment (6.2)
    const count = this.openDashboard()?.sections?.find((other) => other.id === sectionId)?.tiles.length ?? section?.tiles.length ?? 0;
    const remove = (): void => {
      this.editPanel = null;
      const place = this.placeOfBlock(sectionId);
      this.controller.edit({ type: 'remove-section', dashboardId: this.state.boardId, sectionId });
      this.notifyUndo(t('section.removed', { name }), 'delete');
      if (place) void this.focusThen((screen) => screen.focusSectionAt(place.column, place.index));
    };
    if (count === 0) remove();
    else this.ask({ heading: t('section.remove.title', { name }), text: count === 1 ? t('section.remove.textOne') : t('section.remove.textMany', { count }), ok: t('section.remove.confirm'), run: remove });
  }

  /** Adds a section at the end of its column, or gives one its name and icon. */
  private onSectionDialog(detail: { kind: 'own' | 'hero'; name: string | null; icon: string | null }): void {
    const dialog = this.sectionDialog;
    this.sectionDialog = null;
    if (!dialog) return;
    const dashboardId = this.state.boardId;
    const { name, icon } = detail;
    if (dialog.sectionId !== null) {
      this.controller.edit({ type: 'set-section', dashboardId, sectionId: dialog.sectionId, name, icon });
      return;
    }
    const section: SectionLayout = detail.kind === 'hero'
      ? { id: heroSectionId(dashboardId), kind: 'hero', column: dialog.column, name: null, icon: null, tiles: [], hero: null }
      : { id: `own:${this.controller.newId('s')}`, kind: 'own', column: dialog.column, name, icon, tiles: [], hero: null };
    const before = this.state.layout;
    const group = dialog.placeRef === undefined ? undefined : `place:${dialog.placeRef}`;
    this.controller.edit({ type: 'add-section', dashboardId, section, index: Infinity }, group);
    if (this.state.layout === before) { this.notifyFull(); return; }
    void this.focusThen((screen) => screen.focusSection(section.id));
    if (dialog.placeRef !== undefined && detail.kind === 'own') this.controller.placeNew(dialog.placeRef, section.id, group);
  }

  /** The dialog was left without adding; when it was opened from a notice the edit mode ends with it. */
  private cancelSectionDialog(): void {
    const fromNotice = this.sectionDialog?.placeRef !== undefined;
    this.sectionDialog = null;
    if (fromNotice) this.controller.setEditing(false);
  }

  private renderSectionDialog() {
    const { t } = this.ctx;
    const dialog = this.sectionDialog;
    const section = dialog?.sectionId ? this.sectionOf(dialog.sectionId) : undefined;
    const ofApp = section !== undefined && section.kind !== 'own';
    const hero = this.state.board ? [...this.state.board.left, ...this.state.board.right].some((b) => b.type === 'hero') : false;
    return html`<mh-name-icon-dialog .t=${t} ?hidden=${this.phone} ?open=${dialog !== null && (dialog.sectionId === null || section !== undefined)} heading=${t(section ? 'section.dialog.edit' : 'section.dialog.add')}
      confirmLabel=${t(section ? 'section.dialog.confirmSave' : 'section.dialog.confirmAdd')} .name=${section?.name ?? ''}
      namePlaceholder=${ofApp ? sectionTitle({ ...section, name: null }, t) : t('section.dialog.namePlaceholder')}
      .icon=${ofApp ? section.icon ?? null : section ? shownSectionIcon(section) : sectionIcon('own')} .autoIcon=${ofApp ? sectionIcon(section.kind) : null}
      kindChoice=${section || dialog?.placeRef !== undefined ? 'none' : 'section'} ?heroTaken=${hero}
      @confirm=${(e: CustomEvent<{ kind: 'own' | 'hero'; name: string | null; icon: string | null }>) => this.onSectionDialog(e.detail)}
      @cancel=${() => this.cancelSectionDialog()}></mh-name-icon-dialog>`;
  }

  /** A hero on the open dashboard, from its empty state. */
  private addHero(): void {
    this.sectionDialog = { sectionId: null, column: 'left' };
    this.onSectionDialog({ kind: 'hero', name: null, icon: null });
  }

  /** A new dashboard opens empty in the edit mode; the open one gets its name and icon. */
  private onBoardDialog({ name, icon }: { name: string | null; icon: string | null }): void {
    const dialog = this.boardDialog;
    this.boardDialog = null;
    if (dialog === 'edit') this.controller.edit({ type: 'set-dashboard', dashboardId: this.state.boardId, name, icon });
    if (dialog !== 'new') return;
    const id = this.controller.newId('d');
    this.editPanel = null;
    this.controller.edit({ type: 'add-dashboard', dashboard: { id, name, icon, sections: [] } });
    this.controller.openBoard(id);
    this.controller.setEditing(true);
  }

  private renderBoardDialog() {
    const { t } = this.ctx;
    const dialog = this.boardDialog;
    const board = dialog === 'edit' ? this.openDashboard() : undefined;
    const overview = board?.id === OVERVIEW_ID;
    return html`<mh-name-icon-dialog class="board" .t=${t} ?hidden=${this.phone} ?open=${dialog !== null} heading=${t(board ? 'board.edit.title' : 'board.new.title')} text=${board ? '' : t('board.new.text')}
      confirmLabel=${t(board ? 'section.dialog.confirmSave' : 'board.create')} .name=${board?.name ?? ''} namePlaceholder=${overview ? t('nav.overview') : t('board.namePlaceholder')}
      .icon=${overview ? board.icon : board ? this.boardIcon(board) : 'dashboard'} .autoIcon=${overview ? 'dashboard' : null} kindChoice="none"
      @confirm=${(e: CustomEvent<{ name: string | null; icon: string | null }>) => this.onBoardDialog(e.detail)} @cancel=${() => { this.boardDialog = null; }}></mh-name-icon-dialog>`;
  }

  private boardMenu(board: DashboardLayout | undefined) {
    if (!board) return [];
    const { dashboards } = this.state.layout;
    const overview = board.id === OVERVIEW_ID ? { automatic: board.sections === null } : null;
    return boardMenuGroups(this.boardName(board), { index: dashboards.indexOf(board), count: dashboards.length }, overview, this.ctx.t);
  }

  private onBoardAction(action: BoardAction): void {
    const { dashboards } = this.state.layout;
    const dashboardId = this.state.boardId;
    const index = dashboards.findIndex((d) => d.id === dashboardId);
    switch (action) {
      case 'rename': this.boardDialog = 'edit'; return;
      case 'up': this.moveBoard(index - 1); return;
      case 'down': this.moveBoard(index + 1); return;
      case 'reset': this.askReset(); return;
      case 'remove': this.askRemoveBoard(); return;
    }
  }

  private moveBoard(index: number): void {
    this.controller.edit({ type: 'move-dashboard', dashboardId: this.state.boardId, index });
    const { dashboards } = this.state.layout;
    const board = this.openDashboard();
    if (board) this.dashboardScreen?.announce(this.ctx.t('board.moved', { name: this.boardName(board), index: dashboards.indexOf(board) + 1, count: dashboards.length }));
  }

  /** The open dashboard goes, after a question; then the first one opens. */
  private askRemoveBoard(): void {
    const { t } = this.ctx;
    const board = this.openDashboard();
    if (!board) return;
    const name = this.boardName(board);
    this.ask({
      heading: t('board.remove.title', { name }), text: t('board.remove.text'), ok: t('board.remove.confirm'),
      run: () => {
        this.editPanel = null;
        this.controller.edit({ type: 'remove-dashboard', dashboardId: board.id });
        this.notifyUndo(t('board.removed', { name }), 'delete');
      },
    });
  }

  /** New tiles at the end of a section: they light up, and a notice says where they are. */
  private onAddTiles(sectionId: string, tiles: TileLayout[], name: string): void {
    const section = this.sectionOf(sectionId);
    if (!section) return;
    const before = this.state.layout;
    this.controller.edit({ type: 'add-tiles', dashboardId: this.state.boardId, sectionId, tiles });
    if (this.state.layout === before) { this.notifyFull(); return; }
    this.showFresh(tiles.map((tile) => tile.id));
    this.notifyUndo(this.ctx.t('add.added', { name, section: sectionTitle(section, this.ctx.t) }), 'check_circle');
  }

  /** The layout as a file in the downloads: a Blob and a link that is clicked and taken away again. */
  private saveLayout(): void {
    const file = this.controller.exportLayout(new Date());
    if (!file) { this.notify({ text: this.ctx.t('settings.offline'), icon: 'cloud_off' }); return; }
    const { fileName, text } = file;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    // the browser needs the address until the download has begun
    this.env.setTimeout(() => URL.revokeObjectURL(url), FRESH_MS);
    this.notify({ text: this.ctx.t('settings.exported', { file: fileName }), icon: 'download' });
  }

  /** A chosen file replaces the dashboards, colours and theme, after a question; one that is no layout changes nothing. */
  private loadLayout(file: { name: string; text: string }): void {
    const { t } = this.ctx;
    const refuse = (): void => this.notify({ text: t('settings.importBad'), icon: 'error', tone: 'error' });
    if (!readLayoutFile(file.text)) { refuse(); return; }
    if (!this.store.getSnapshot()) { this.notify({ text: t('settings.offline'), icon: 'cloud_off' }); return; }
    this.ask({
      heading: t('settings.importConfirm.title'), text: t('settings.importConfirm.text', { file: file.name }), ok: t('settings.importConfirm.ok'),
      run: () => {
        const result = this.controller.importLayout(file.text);
        if (!result.ok) { refuse(); return; }
        this.panel = 'none';
        const text = result.dropped === 0 ? t('settings.imported') : result.dropped === 1 ? t('settings.importedDroppedOne') : t('settings.importedDropped', { count: result.dropped });
        this.notifyUndo(text, 'upload');
      },
    });
  }

  /** "Overzicht terug naar automatisch", from the settings or the menu of the Overzicht; asked about first. */
  private askReset(): void {
    const { t } = this.ctx;
    this.ask({
      heading: t('settings.resetConfirm.title'), text: t('settings.resetConfirm.text'), ok: t('settings.resetAction'),
      run: () => {
        this.controller.resetOverview();
        this.notifyUndo(t('settings.resetDone'), 'restart_alt');
      },
    });
  }

  /** Something new goes to a section, or (null) to the suggested one: it lights up, and a notice says where it is. */
  private onPlace(ref: string, target: string | null): void {
    const item = this.state.news.find((n) => n.ref === ref);
    if (!item) return;
    const { added } = this.placing(() => this.controller.placeNew(ref, target));
    this.keepFocus();
    if (added.length === 0) { this.notifyFull(); return; }
    const section = this.findTile(added[0]!)?.section;
    this.notifyUndo(this.ctx.t('news.placed', { name: item.name, section: section ? sectionTitle(section, this.ctx.t) : '' }), 'check_circle');
  }

  /** Everything new goes to its suggested place, in one step to undo. */
  private onPlaceAll(news: NewItem[]): void {
    this.editPanel = null;
    this.openings += 1;
    const group = `place-all:${this.openings}`;
    const { added } = this.placing(() => { for (const item of news) this.controller.placeNew(item.ref, null, group); });
    this.keepFocus();
    const left = news.some((item) => this.state.news.some((other) => other.ref === item.ref));
    if (left) this.notifyFull();
    else if (added.length > 0) this.notifyUndo(this.ctx.t('news.allPlaced'), 'check_circle');
  }

  /** The tiles that came onto the open dashboard by doing something; they light up. */
  private placing(act: () => void): { added: string[] } {
    const ids = (): string[] => (this.state.board ? [...this.state.board.left, ...this.state.board.right] : []).flatMap((b) => (b.type === 'section' ? b.section.tiles.map((tile) => tile.id) : []));
    const before = new Set(ids());
    act();
    const added = ids().filter((id) => !before.has(id));
    if (added.length > 0) this.showFresh(added);
    return { added };
  }

  private onSkip(ref: string): void {
    this.controller.dismissNew(ref);
    this.notifyUndo(this.ctx.t('news.skipped'), 'info');
    this.keepFocus();
  }

  /** A new section for something new: the edit mode with the dialog; confirming puts it in there. */
  private onNewSection(ref: string): void {
    const item = this.state.news.find((n) => n.ref === ref);
    if (!item) return;
    this.editPanel = null;
    this.controller.setEditing(true);
    this.sectionDialog = { sectionId: null, column: isLeftKind(item.suggest) ? 'left' : 'right', placeRef: ref };
  }

  private showFresh(ids: string[]): void {
    if (this.freshTimer !== null) this.env.clearTimeout(this.freshTimer);
    this.freshTiles = ids;
    this.freshTimer = this.env.setTimeout(() => { this.freshTiles = []; this.freshTimer = null; }, FRESH_MS);
  }

  private railBoards(): RailBoard[] {
    return this.state.layout.dashboards.map((board) => ({
      id: board.id, name: this.boardName(board), icon: this.boardIcon(board), badge: board.id === OVERVIEW_ID && this.state.news.length > 0 && this.controller.status().canArrange !== false,
    }));
  }

  /** The dashboards and, when there are rooms to speak of, the screen with those. */
  private places(): RailBoard[] {
    const { hasRooms, roomsShown } = this.state;
    return [...this.railBoards(), ...(hasRooms && roomsShown ? [{ id: ROOMS_ID, name: this.ctx.t('nav.rooms'), icon: 'meeting_room' as const, badge: false }] : [])];
  }

  /** The panels of the edit mode; one whose section or tile is gone is closed. */
  private renderEditPanels(boardName: string) {
    const s = this.state;
    const open = s.editing ? this.editPanel : null;
    const newsOpen = !s.editing && this.editPanel?.kind === 'news' && s.news.length > 0;
    const addTo = open?.kind === 'add' ? this.sectionOf(open.sectionId) : undefined;
    const tile = open?.kind === 'tile' ? this.findTile(open.tileId) : null;
    const hero = open?.kind === 'hero' && s.board ? [...s.board.left, ...s.board.right].find((b) => b.type === 'hero' && b.id === open.sectionId) : undefined;
    const heroId = hero?.type === 'hero' ? hero.id : null;
    const setTile = (patch: TilePatch, typing = false): void => {
      if (tile) this.controller.edit({ type: 'set-tile', dashboardId: s.boardId, tileId: tile.spec.id, patch }, typing ? `label:${tile.spec.id}:${this.openings}` : undefined);
    };
    return html`<mh-add-panel .ctx=${this.ctx} ?hidden=${this.phone} ?open=${addTo !== undefined} sectionName=${addTo ? sectionTitle(addTo, this.ctx.t) : ''} boardName=${boardName} .board=${s.board}
        .newId=${this.newTileId} @close=${() => { this.editPanel = null; }}
        @add-tiles=${(e: CustomEvent<{ tiles: TileLayout[]; name: string }>) => { if (addTo) this.onAddTiles(addTo.id, e.detail.tiles, e.detail.name); }}></mh-add-panel>
      <mh-tile-panel .t=${this.ctx.t} ?hidden=${this.phone} ?open=${tile !== null} .tile=${tile ? this.storedTile(tile.spec.id, tile.spec) : null} sectionName=${tile ? sectionTitle(tile.section, this.ctx.t) : ''}
        .device=${tile && tile.spec.kind !== 'flow' ? this.store.getDevice(tile.spec.deviceId) : undefined} @close=${() => { this.editPanel = null; }}
        @set-tile=${(e: CustomEvent<{ patch: TilePatch; typing?: boolean }>) => setTile(e.detail.patch, e.detail.typing)}
        @remove=${() => { this.editPanel = null; if (tile) this.onEdit({ type: 'remove-tile', dashboardId: s.boardId, tileId: tile.spec.id }); }}></mh-tile-panel>
      <mh-hero-panel .ctx=${this.ctx} ?hidden=${this.phone} ?open=${heroId !== null} .choice=${this.heroChoice(heroId)} .automatic=${heroId !== null ? this.automaticHero() : null} .board=${s.board} boardName=${boardName}
        @close=${() => { this.editPanel = null; }} @remove=${() => { if (heroId !== null) this.onRemoveSection(heroId); }}
        @set-hero=${(e: CustomEvent<{ hero: HeroChoice | null; typing?: boolean }>) => this.controller.edit({ type: 'set-hero', dashboardId: s.boardId, hero: e.detail.hero }, e.detail.typing ? `hero-name:${this.openings}` : undefined)}></mh-hero-panel>
      <mh-news-panel .ctx=${this.ctx} ?hidden=${this.phone} ?open=${newsOpen} .news=${s.news} .sections=${this.placeOptions()} .sectionName=${this.sectionNameOf}
        @close=${() => { this.editPanel = null; }} @place-all=${() => this.onPlaceAll(s.news)} @place=${(e: CustomEvent<{ ref: string; sectionId: string | null }>) => this.onPlace(e.detail.ref, e.detail.sectionId)}
        @skip=${(e: CustomEvent<{ ref: string }>) => this.onSkip(e.detail.ref)} @new-section=${(e: CustomEvent<{ ref: string }>) => this.onNewSection(e.detail.ref)}></mh-news-panel>`;
  }

  /** The stored choice of the hero of the open dashboard; null is automatic. */
  private heroChoice(sectionId: string | null): HeroChoice | null {
    const board = this.state.layout.dashboards.find((d) => d.id === this.state.boardId);
    return board?.sections?.find((section) => section.id === sectionId)?.hero ?? null;
  }

  private automaticHero() {
    const snapshot = this.store.getSnapshot();
    return snapshot ? pickHero(snapshot, this.ctx.t.locale) : null;
  }

  /** The sections of the open dashboard, to put something new in. */
  private placeOptions() {
    const blocks = this.state.board ? [...this.state.board.left, ...this.state.board.right] : [];
    return blocks.flatMap((b) => (b.type === 'section' ? [{ id: b.section.id, title: sectionTitle(b.section, this.ctx.t), icon: shownSectionIcon(b.section) }] : []));
  }

  private readonly sectionNameOf = (kind: SectionKind): string => {
    const section = this.sectionOf(sectionId('type', kind));
    return section ? sectionTitle(section, this.ctx.t) : this.ctx.t(`section.${kind}`);
  };

  private readonly nameOfBoard = (id: string): string => {
    const board = this.state.layout.dashboards.find((d) => d.id === id);
    return board ? this.boardName(board) : '';
  };

  private readonly newTileId = (): string => this.controller.newId('t');

  private renderDashboard() {
    const s = this.state;
    const status = this.controller.status();
    const connecting = s.phase === 'connecting';
    const phase = connecting ? (s.startUnreachable ? 'unreachable' : 'loading') : 'ready';
    const empty = s.missing.includes('readDevices') ? 'no-right'
      : s.dashboard && (s.dashboard.hero || s.dashboard.sections.length > 0) ? 'none' : 'no-devices';
    const open = this.openDashboard();
    const inRooms = s.boardId === ROOMS_ID || roomOfBoard(s.boardId) !== null;
    const snapshot = inRooms ? this.store.getSnapshot() : null;
    const rooms = snapshot ? roomsOf(snapshot, this.ctx.t) : [];
    const banner = !connecting && status.route === null ? 'offline' : s.restored ? 'restored' : this.outdated && !s.editing ? 'update' : 'none';
    return html`<mh-dashboard .ctx=${this.ctx} .board=${s.board} .boards=${this.places()} .rooms=${rooms} .room=${rooms.find((room) => roomBoardId(room.id) === s.boardId) ?? null} boardName=${open ? this.boardName(open) : ''} boardIcon=${open ? this.boardIcon(open) : 'dashboard'} .boardMenu=${this.boardMenu(open)}
      ?editing=${s.editing && !this.phone} ?canUndo=${s.canUndo} ?firstTime=${open?.sections === null} phase=${phase} emptyReason=${empty} banner=${banner}
      ?inert=${this.wall.shown !== 'none'} ?resting=${this.wall.covered} density=${this.shownDensity()} ?connecting=${connecting && !s.startUnreachable} activePanel=${this.panel === 'wall' ? 'settings' : this.panel}
      .sectionSeeds=${s.sectionSeeds} mode=${this.shownMode()} .baseSeed=${s.theme.seed}
      @section-seed=${(e: CustomEvent<{ sectionId: string; seed: string | null }>) => this.controller.setSectionSeed(e.detail.sectionId, e.detail.seed)}
      @navigate=${(e: CustomEvent<{ to: RailTarget }>) => this.navigate(e.detail.to)}
      .freshTiles=${this.freshTiles} .news=${s.news} .gone=${s.gone} .nameOfBoard=${this.nameOfBoard}
      @place=${(e: CustomEvent<{ ref: string; sectionId: string | null }>) => this.onPlace(e.detail.ref, e.detail.sectionId)} @skip=${(e: CustomEvent<{ ref: string }>) => this.onSkip(e.detail.ref)}
      @new-section=${(e: CustomEvent<{ ref: string }>) => this.onNewSection(e.detail.ref)} @view-all=${() => this.openEditPanel({ kind: 'news' })} @gone-ok=${() => { this.controller.acknowledgeGone(); this.keepFocus(); }}
      @open-add=${(e: CustomEvent<{ sectionId: string }>) => this.openEditPanel({ kind: 'add', sectionId: e.detail.sectionId })}
      @new-board=${() => { this.boardDialog = 'new'; }} @add-hero=${() => this.addHero()} @board-action=${(e: CustomEvent<{ id: BoardAction }>) => this.onBoardAction(e.detail.id)}
      @open-section-dialog=${(e: CustomEvent<{ sectionId: string | null; column: Column }>) => { this.sectionDialog = e.detail; }}
      @remove-section=${(e: CustomEvent<{ sectionId: string }>) => this.onRemoveSection(e.detail.sectionId)}
      @open-hero=${(e: CustomEvent<{ sectionId: string }>) => this.openEditPanel({ kind: 'hero', sectionId: e.detail.sectionId })}
      @open-tile=${(e: CustomEvent<{ tileId: string }>) => this.openEditPanel({ kind: 'tile', tileId: e.detail.tileId })}
      @layout-edit=${(e: CustomEvent<{ edit: LayoutEdit }>) => this.onEdit(e.detail.edit)}
      @toggle-edit=${() => { if (!this.phone) this.controller.setEditing(!this.state.editing); }} @done=${() => this.controller.setEditing(false)} @undo=${() => this.undo()}
      @retry=${() => this.controller.retry()} @reload=${() => this.env.served?.reload()} @change-connection=${() => this.controller.changeConnection()}></mh-dashboard>
      ${this.renderEditPanels(open ? this.boardName(open) : '')}
      ${this.renderSectionDialog()}${this.renderBoardDialog()}${this.renderQuestion()}
      <mh-device-panel .ctx=${this.ctx} .deviceId=${connecting ? null : s.openDeviceId} @close=${() => this.controller.closeDevice()}></mh-device-panel>
      <mh-theme-panel .t=${this.ctx.t} ?open=${this.panel === 'theme'} ?phone=${this.phone} .theme=${s.theme} .presets=${rustigExpressive.color.presets}
        @change=${(e: CustomEvent<ThemeSettings>) => this.controller.setTheme(e.detail)} @close=${() => { this.panel = 'none'; }}></mh-theme-panel>
      <mh-settings-panel .t=${this.ctx.t} .language=${s.language.choice} ?open=${this.panel === 'settings'} .status=${status} .missing=${s.missing} .softwareVersion=${s.softwareVersion} appVersion=${__APP_VERSION__}
        ?overviewAutomatic=${s.layout.dashboards.find((d) => d.id === OVERVIEW_ID)?.sections == null} @export=${() => this.saveLayout()} @reset=${() => this.askReset()}
        @import=${(e: CustomEvent<{ name: string; text: string }>) => this.loadLayout(e.detail)}
        @close=${() => { this.panel = 'none'; }} @disconnect=${() => { this.panel = 'none'; void this.controller.disconnect(); }}
        @leave-demo=${() => { this.panel = 'none'; this.controller.leaveDemo(); }}
        ?hasRooms=${s.hasRooms} grouping=${s.layout.grouping ?? 'type'} .roomsShown=${s.roomsShown}
        @grouping=${(e: CustomEvent<{ grouping: Grouping }>) => this.controller.setGrouping(e.detail.grouping)} @rooms-shown=${(e: CustomEvent<{ shown: boolean }>) => this.controller.setRooms(e.detail.shown)}
        .boards=${this.places()} .startBoard=${s.startBoard} @start-board=${(e: CustomEvent<{ id: string }>) => this.controller.setStartBoard(e.detail.id)}
        .wall=${s.wall} ?phone=${this.phone} @open-wall=${() => { this.panel = 'wall'; }}
        @language=${(e: CustomEvent<{ choice: Language | null }>) => this.controller.setLanguage(e.detail.choice)}></mh-settings-panel>
      ${this.renderWallPanel()}`;
  }

  /** Pairs this device with the code; then the app starts as it does with a saved connection. */
  private async pair(code: string, name: string): Promise<void> {
    if (!this.env.served || this.pairing) return;
    this.pairing = true;
    const result = await this.env.served.pair(code, name);
    this.pairing = false;
    this.pairIssue = result === 'ok' ? 'none' : result;
    if (result === 'ok') await this.controller.start();
  }

  private renderPairing() {
    return html`<mh-pair-screen .t=${this.ctx.t} issue=${this.pairIssue} scanned=${this.scanned} kind=${this.env.served?.kind() ?? 'laptop'} ?busy=${this.pairing} ?revoked=${this.state.connectIssue === 'revoked'}
      @pair=${(e: CustomEvent<{ code: string; name: string }>) => { void this.pair(e.detail.code, e.detail.name); }}></mh-pair-screen>`;
  }

  override render() {
    if (!this.state) return nothing;
    this.applyTheme();
    const phase = this.state.phase;
    const s = this.state;
    const body = phase === 'connect' && this.env.served ? this.renderPairing() : phase === 'connect'
      ? html`<mh-connect-screen .t=${this.ctx.t} issue=${s.connectIssue} ?busy=${s.busy} ?waitingForPermission=${s.waitingForPermission} .review=${s.review} address=${s.savedAddress}
          @connect=${(e: CustomEvent<{ address: string; apiKey: string }>) => { void this.controller.connect(e.detail.address, e.detail.apiKey); }}
          @continue=${() => this.controller.continueWithMissingRights()} @other-key=${() => { void this.controller.useOtherKey(); }}
          @demo=${(e: CustomEvent<{ which?: Demo } | null>) => { void this.controller.startDemo(e.detail?.which ?? 'camper'); }}
          @cancel=${() => { this.controller.cancelConnect(); }}></mh-connect-screen>`
      : this.renderDashboard();
    return html`${body}<mh-snackbar></mh-snackbar>${this.renderRest()}`;
  }
}

if (!customElements.get('mh-app')) customElements.define('mh-app', MhApp);

declare global {
  interface HTMLElementTagNameMap { 'mh-app': MhApp }
}
